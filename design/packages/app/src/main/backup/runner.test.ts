/**
 * The whole backup, end to end, against real temporary folders and a fake GitHub.
 *
 * Real folders because the pack, the split and the digests are the parts that a mocked
 * filesystem would let through wrong; a fake GitHub because the alternative is uploading
 * gigabytes to somebody's account in a unit test. The fake keeps every asset it is given,
 * so a resumed backup is genuinely resumed against assets a first run genuinely uploaded.
 *
 * Five behaviours are pinned here because each one is a promise made in the interface:
 *
 *  1. a backup produces a pointer whose parts hash to what is on the release;
 *  2. a **public** repository is refused without an explicit acknowledgement;
 *  3. a resumed backup skips the parts already up, and skips them by *digest*, which the
 *     asset name carries;
 *  4. cancelling mid-upload stops and keeps what it has;
 *  5. nothing that already exists is ever changed - proved by watching every request.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BackupRunner, partAssetName } from "./runner.js";
import type { BackupEvent } from "./runner.js";
import { readPointer } from "./pointer.js";
import { parseSidecar } from "./sidecar.js";
import { backupIdFor, backupWorkspace } from "./workspace.js";

let workDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-backup-runner-"));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

/** A world with enough bytes to split into several parts at a tiny part size. */
async function makeWorld(name = "overworld"): Promise<string> {
    const root = join(workDir, "saves", name);
    await mkdir(join(root, "region"), { recursive: true });
    await writeFile(join(root, "level.dat"), "level-dat");
    await writeFile(join(root, "region", "r.0.0.mca"), Buffer.alloc(3000, 1));
    await writeFile(join(root, "region", "r.0.1.mca"), Buffer.alloc(3000, 2));
    return root;
}

interface FakeAsset {
    id: number;
    name: string;
    size: number;
    state: string;
    bytes: Buffer;
}

/**
 * A GitHub with one repository and whatever releases the test creates.
 *
 * It records every request so the append-only rule can be asserted over the whole
 * conversation rather than over the one call somebody remembered to check.
 */
function fakeGitHub(options: { private?: boolean; canWrite?: boolean } = {}) {
    const releases = new Map<string, { id: number; tag: string; assets: FakeAsset[] }>();
    const requests: { method: string; url: string }[] = [];
    let nextId = 100;
    /** Set to a part name to make its upload hang until the test aborts. */
    let stallOn: string | null = null;

    const impl = async (url: string, init?: RequestInit): Promise<Response> => {
        const method = init?.method ?? "GET";
        requests.push({ method, url });

        const answer = (status: number, body: unknown): Response =>
            ({
                ok: status >= 200 && status < 300,
                status,
                json: () => Promise.resolve(body),
                arrayBuffer: () =>
                    Promise.resolve(
                        Uint8Array.from(
                            Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8"),
                        ).buffer as ArrayBuffer,
                    ),
            }) as unknown as Response;

        const releaseJson = (release: { id: number; tag: string; assets: FakeAsset[] }): unknown => ({
            id: release.id,
            tag_name: release.tag,
            name: `Backup ${release.tag}`,
            html_url: `https://github.test/o/r/releases/tag/${release.tag}`,
            upload_url: "https://uploads.test/",
            created_at: "2026-08-04T10:15:00Z",
            assets: release.assets.map((asset) => ({
                id: asset.id,
                name: asset.name,
                size: asset.size,
                state: asset.state,
                browser_download_url: `https://assets.test/${release.tag}/${asset.name}`,
            })),
        });

        if (url.startsWith("https://assets.test/")) {
            const [tag, name] = url.slice("https://assets.test/".length).split("/");
            const asset = releases.get(tag as string)?.assets.find((item) => item.name === name);
            return asset === undefined ? answer(404, "") : answer(200, asset.bytes);
        }

        if (method === "GET" && /\/repos\/[^/]+\/[^/]+$/.test(url)) {
            return answer(200, {
                full_name: "o/r",
                name: "r",
                owner: { login: "o" },
                private: options.private ?? true,
                permissions: { push: options.canWrite ?? true },
                html_url: "https://github.test/o/r",
            });
        }

        if (method === "GET" && url.includes("/releases/tags/")) {
            const tag = decodeURIComponent(url.split("/releases/tags/")[1] as string);
            const release = releases.get(tag);
            return release === undefined ? answer(404, { message: "Not Found" }) : answer(200, releaseJson(release));
        }

        if (method === "GET" && url.includes("/releases?")) {
            return answer(200, [...releases.values()].map(releaseJson));
        }

        if (method === "POST" && url.endsWith("/releases")) {
            const body = JSON.parse(init?.body as string) as { tag_name: string };
            if (releases.has(body.tag_name)) return answer(422, { message: "already_exists" });
            const release = { id: (nextId += 1), tag: body.tag_name, assets: [] as FakeAsset[] };
            releases.set(body.tag_name, release);
            return answer(201, releaseJson(release));
        }

        if (method === "POST" && url.includes("/releases/") && url.includes("/assets?name=")) {
            const name = decodeURIComponent(url.split("name=")[1] as string);
            const releaseId = Number(url.split("/releases/")[1]?.split("/")[0]);
            const release = [...releases.values()].find((item) => item.id === releaseId);
            if (release === undefined) return answer(404, { message: "Not Found" });

            const chunks: Buffer[] = [];
            const body = init?.body;
            if (body !== undefined && body !== null && typeof body === "object" && "getReader" in body) {
                const reader = (body as ReadableStream<Uint8Array>).getReader();
                for (;;) {
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    chunks.push(Buffer.from(chunk.value));
                    if (stallOn !== null && name.includes(stallOn)) {
                        // Holds this part open until the signal is aborted, then rejects
                        // exactly as a real `fetch` does. Without honouring the signal the
                        // fake would hang for ever and the cancel would never be tested
                        // *inside* a part, only between two of them.
                        await new Promise((_resolve, reject) => {
                            const fail = (): void => reject(new Error("The operation was aborted."));
                            // Checked before subscribing. A cancel that lands between the
                            // request starting and this listener being added would
                            // otherwise never be heard, and the fake would hang for ever -
                            // which is a flaky test rather than a failing one, and far
                            // worse.
                            if (init?.signal?.aborted === true) fail();
                            else init?.signal?.addEventListener("abort", fail);
                        });
                    }
                }
            }
            const bytes = Buffer.concat(chunks);
            const asset: FakeAsset = { id: (nextId += 1), name, size: bytes.length, state: "uploaded", bytes };
            release.assets.push(asset);
            return answer(201, {
                id: asset.id,
                name: asset.name,
                size: asset.size,
                state: asset.state,
                browser_download_url: `https://assets.test/${release.tag}/${asset.name}`,
            });
        }

        return answer(404, { message: "Not Found" });
    };

    return {
        fetch: impl as (url: string, init?: RequestInit) => Promise<Response>,
        releases,
        requests,
        stall(name: string | null): void {
            stallOn = name;
        },
    };
}

function makeRunner(
    github: ReturnType<typeof fakeGitHub>,
    events: BackupEvent[] = [],
    now?: () => number,
) {
    return new BackupRunner({
        storageDir: () => join(workDir, "storage"),
        token: () => "t0k3n",
        fetch: github.fetch,
        onEvent: (event) => events.push(event),
        appVersion: "0.1.0",
        apiBase: "https://api.test",
        uploadsBase: "https://uploads.test",
        ...(now === undefined ? {} : { now }),
    });
}

const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** Polls until a predicate holds, so a test never sleeps for a fixed guess at a duration. */
async function waitUntil(predicate: () => boolean, limitMs = 5000): Promise<void> {
    const deadline = Date.now() + limitMs;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error("waited too long for a condition to hold");
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

/** The first event the reader recognises, whenever it arrives. */
async function waitFor<T>(
    events: readonly BackupEvent[],
    read: (event: BackupEvent) => T | null,
): Promise<T> {
    let found: T | null = null;
    await waitUntil(() => {
        for (const event of events) {
            const value = read(event);
            if (value !== null) {
                found = value;
                return true;
            }
        }
        return false;
    });
    return found as T;
}

/**
 * Packs the folder the way the runner will, purely to learn what the second part's asset
 * name is going to be.
 *
 * The name carries the part's own digest, so it cannot be guessed - and the test needs it
 * in advance to tell the fake which upload to hold open. Doing the same work the runner
 * does is also a small proof that the naming is deterministic: if it were not, this would
 * name a part that never gets uploaded and the test would time out.
 */
async function packForNames(folder: string): Promise<{ secondPartMark: string }> {
    const { packFolder } = await import("./archive.js");
    const { splitFile } = await import("@material-bluemap/parts");
    const scratch = join(workDir, "scratch");
    await mkdir(scratch, { recursive: true });
    const archivePath = join(scratch, "probe.zip");
    await packFolder(folder, archivePath);
    const split = await splitFile(archivePath, { partSize: 2048, outDir: join(scratch, "parts") });
    if (!split.split || split.manifest.parts.length < 2) {
        throw new Error("the probe world did not split into enough parts");
    }
    const second = split.manifest.parts[1];
    if (second === undefined) throw new Error("no second part");
    // The digest half of the name, not the whole name: the real backup's archive is named
    // after the world and the moment, so only the part's own digest is predictable from
    // here - which is exactly the property `partAssetName` exists to give.
    return { secondPartMark: partAssetName("x", second.index, second.sha256).slice(1) };
}

describe("a whole backup", () => {
    it("packs, splits, publishes and uploads, and the pointer describes what landed", async () => {
        const github = fakeGitHub();
        const events: BackupEvent[] = [];
        const runner = makeRunner(github, events);
        const folder = await makeWorld();

        const result = await runner.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 2048,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.summary.parts).toBeGreaterThan(1);

        const release = github.releases.get(result.summary.tag);
        expect(release).toBeDefined();
        const names = release?.assets.map((asset) => asset.name) ?? [];
        expect(names).toContain("backup.json");
        expect(names.some((name) => name.endsWith(".cheaplfs"))).toBe(true);

        const pointerAsset = release?.assets.find((asset) => asset.name.endsWith(".cheaplfs"));
        const read = readPointer((pointerAsset as FakeAsset).bytes.toString("utf8"));
        expect(read.ok).toBe(true);
        if (!read.ok) return;

        expect(read.pointer.releaseTag).toBe(result.summary.tag);
        expect(read.pointer.assetName).toBe(result.summary.archive);
        expect(read.pointer.sha256).toBe(result.summary.sha256);

        // Every part the pointer names is on the release, at the size and digest it says.
        for (const part of read.pointer.parts ?? []) {
            const asset = release?.assets.find((item) => item.name === part.name);
            expect(asset, `${part.name} is missing from the release`).toBeDefined();
            expect((asset as FakeAsset).size).toBe(part.sizeInBytes);
            expect(sha((asset as FakeAsset).bytes)).toBe(part.sha256);
        }

        // And the parts, concatenated in pointer order, are the archive the pointer promises.
        const rejoined = Buffer.concat(
            (read.pointer.parts ?? []).map(
                (part) => (release?.assets.find((item) => item.name === part.name) as FakeAsset).bytes,
            ),
        );
        expect(rejoined.length).toBe(read.pointer.sizeInBytes);
        expect(sha(rejoined)).toBe(read.pointer.sha256);
    });

    it("uploads the pointer last, so a half-finished release is never mistaken for a backup", async () => {
        const github = fakeGitHub();
        const runner = makeRunner(github);
        const folder = await makeWorld();

        const result = await runner.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 2048,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const order = github.releases.get(result.summary.tag)?.assets.map((asset) => asset.name) ?? [];
        expect(order.at(-1)?.endsWith(".cheaplfs")).toBe(true);
        expect(order.at(-2)).toBe("backup.json");
    });

    it("writes a sidecar naming what was backed up, beside a pointer that does not", async () => {
        const github = fakeGitHub();
        const runner = makeRunner(github);
        const folder = await makeWorld("Overworld");

        const result = await runner.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 2048,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const release = github.releases.get(result.summary.tag);
        const sidecarAsset = release?.assets.find((asset) => asset.name === "backup.json");
        const sidecar = parseSidecar((sidecarAsset as FakeAsset).bytes.toString("utf8"));
        expect(sidecar?.kind).toBe("world");
        expect(sidecar?.label).toBe("Overworld");
        expect(sidecar?.appVersion).toBe("0.1.0");
        expect(sidecar?.files).toBe(3);

        // The pointer stays canonical: none of that appears in it.
        const pointerText = (
            release?.assets.find((asset) => asset.name.endsWith(".cheaplfs")) as FakeAsset
        ).bytes.toString("utf8");
        expect(pointerText).not.toContain("kind");
        expect(pointerText).not.toContain("appVersion");
        expect(pointerText.split("\n")[0]).toBe("version desktop-material/cheap-lfs/v1");
    });

    it("reports phases and progress with byte counts that reach the total", async () => {
        const github = fakeGitHub();
        const events: BackupEvent[] = [];
        const runner = makeRunner(github, events);
        const folder = await makeWorld();

        await runner.backup({ kind: "world", folder, owner: "o", repo: "r", partSize: 2048 });

        const phases = events.filter((event) => event.type === "phase").map((event) => event.phase);
        expect(phases).toEqual(["packing", "splitting", "publishing", "uploading", "finished"]);

        const uploads = events.filter(
            (event) => event.type === "progress" && event.phase === "uploading",
        );
        expect(uploads.length).toBeGreaterThan(0);
        const last = uploads.at(-1);
        if (last?.type !== "progress") throw new Error("no upload progress");
        expect(last.task.bytesDone).toBe(last.task.bytesTotal);
        expect(last.task.percent).toBeGreaterThan(90);
    });

    it("clears the staged archive and parts once every part is on the release", async () => {
        const github = fakeGitHub();
        const runner = makeRunner(github);
        const folder = await makeWorld();

        const result = await runner.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 2048,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const workspace = backupWorkspace(join(workDir, "storage"), result.backupId);
        await expect(stat(workspace.partsDir)).rejects.toThrow();
        await expect(stat(join(workspace.root, result.summary.archive))).rejects.toThrow();
        // The pointer and the sidecar stay: a couple of kilobytes, and the way somebody
        // finds their backup again when the network is the thing that broke.
        expect((await readFile(workspace.sidecarFile, "utf8")).length).toBeGreaterThan(0);
    });
});

describe("a public repository is a decision, not a default", () => {
    it("refuses without an acknowledgement, and uploads nothing", async () => {
        const github = fakeGitHub({ private: false });
        const runner = makeRunner(github);
        const folder = await makeWorld();

        const result = await runner.backup({ kind: "world", folder, owner: "o", repo: "r" });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("public-not-acknowledged");
        expect(result.failure.message).toContain("PUBLIC");
        expect(result.failure.message).toContain("Nothing was uploaded");
        expect(github.releases.size).toBe(0);
        expect(github.requests.filter((request) => request.method === "POST")).toHaveLength(0);
    });

    it("proceeds once it has been acknowledged", async () => {
        const github = fakeGitHub({ private: false });
        const runner = makeRunner(github);
        const folder = await makeWorld();

        const result = await runner.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            acknowledgePublic: true,
            partSize: 2048,
        });
        expect(result.ok).toBe(true);
    });

    it("warns loudly for a public repository and notes the quota for a private one", async () => {
        const publicReport = await makeRunner(fakeGitHub({ private: false })).inspectRepository("o", "r");
        expect(publicReport.warning?.level).toBe("warning");
        expect(publicReport.warning?.message).toContain("PUBLIC");

        const privateReport = await makeRunner(fakeGitHub({ private: true })).inspectRepository("o", "r");
        expect(privateReport.warning?.level).toBe("note");
        expect(privateReport.warning?.message).toContain("cheap rather than free");
    });
});

describe("refusals that never reach the network", () => {
    it("says so plainly when nobody is signed in", async () => {
        const github = fakeGitHub();
        const runner = new BackupRunner({
            storageDir: () => join(workDir, "storage"),
            token: () => null,
            fetch: github.fetch,
            apiBase: "https://api.test",
            uploadsBase: "https://uploads.test",
        });

        const result = await runner.backup({
            kind: "world",
            folder: await makeWorld(),
            owner: "o",
            repo: "r",
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("signed-out");
        expect(result.failure.needsSignIn).toBe(true);
        expect(result.failure.message).toContain("Settings");
        expect(github.requests).toHaveLength(0);
    });

    it("refuses a folder that is not a world before it asks GitHub anything", async () => {
        const github = fakeGitHub();
        const runner = makeRunner(github);
        const notAWorld = join(workDir, "documents");
        await mkdir(notAWorld, { recursive: true });
        await writeFile(join(notAWorld, "notes.txt"), "hello");

        const result = await runner.backup({ kind: "world", folder: notAWorld, owner: "o", repo: "r" });

        expect(result.ok ? "" : result.failure.code).toBe("not-a-world");
        expect(github.requests).toHaveLength(0);
    });

    it("refuses a repository the account cannot write to", async () => {
        const github = fakeGitHub({ canWrite: false });
        const runner = makeRunner(github);

        const result = await runner.backup({
            kind: "world",
            folder: await makeWorld(),
            owner: "o",
            repo: "r",
        });

        expect(result.ok ? "" : result.failure.code).toBe("read-only");
        expect(github.releases.size).toBe(0);
    });
});

describe("resuming", () => {
    it("skips the parts already uploaded and uploads only the rest", async () => {
        const github = fakeGitHub();
        const runner = makeRunner(github);
        const folder = await makeWorld();

        const first = await runner.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 2048,
        });
        expect(first.ok).toBe(true);
        if (!first.ok) return;

        const uploadsInFirstRun = github.requests.filter(
            (request) => request.method === "POST" && request.url.includes("assets?name="),
        ).length;

        // Run it again against the same tag. Everything is already there, so nothing but
        // the reads should happen.
        const before = github.requests.length;
        const events: BackupEvent[] = [];
        const again = makeRunner(github, events);
        const second = await again.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 2048,
            resumeTag: first.summary.tag,
        });

        expect(second.ok).toBe(true);
        const newUploads = github.requests
            .slice(before)
            .filter((request) => request.method === "POST" && request.url.includes("assets?name="));
        expect(uploadsInFirstRun).toBeGreaterThan(2);
        expect(newUploads).toHaveLength(0);

        const skipped = events.filter(
            (event) => event.type === "log" && event.message.includes("already on the release"),
        );
        expect(skipped.length).toBeGreaterThan(0);
    });

    // A resume that starts in a different UTC second than the first attempt used to
    // re-upload every part regardless of content, because the archive name (and so every
    // part's asset name, which is prefixed with it) was rebuilt from *this* call's own
    // clock instead of the original backup's. The test above only catches this when both
    // calls happen to land in the same second, which is why it passed reliably alone and
    // failed intermittently in the full suite under load - a real, timing-dependent
    // reproduction of a real bug, not a flaky assertion. This test forces the boundary
    // deterministically with an injected clock, so the fix (`archiveNameFromTag` in
    // `source.ts`) is pinned regardless of how fast the machine happens to be.
    it("skips the already-uploaded parts even when the resume starts a different UTC second later", async () => {
        const github = fakeGitHub();
        const runner = makeRunner(github, [], () => Date.UTC(2026, 0, 1, 12, 0, 0));
        const folder = await makeWorld();

        const first = await runner.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 2048,
        });
        expect(first.ok).toBe(true);
        if (!first.ok) return;

        const uploadsInFirstRun = github.requests.filter(
            (request) => request.method === "POST" && request.url.includes("assets?name="),
        ).length;
        expect(uploadsInFirstRun).toBeGreaterThan(2);

        // Ninety seconds later, well past the one-second stamp resolution `archiveNameFor`
        // and `releaseTagFor` both use - the exact gap a slow, loaded machine (or a real
        // interrupted multi-gigabyte pack) would produce.
        const before = github.requests.length;
        const events: BackupEvent[] = [];
        const again = makeRunner(github, events, () => Date.UTC(2026, 0, 1, 12, 1, 30));
        const second = await again.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 2048,
            resumeTag: first.summary.tag,
        });

        expect(second.ok).toBe(true);
        const newUploads = github.requests
            .slice(before)
            .filter((request) => request.method === "POST" && request.url.includes("assets?name="));
        expect(newUploads).toHaveLength(0);

        const skipped = events.filter(
            (event) => event.type === "log" && event.message.includes("already on the release"),
        );
        expect(skipped.length).toBeGreaterThan(0);
    });

    it("re-uploads a part whose stored size does not match, rather than trusting the name", async () => {
        const github = fakeGitHub();
        const runner = makeRunner(github);
        const folder = await makeWorld();

        const first = await runner.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 2048,
        });
        expect(first.ok).toBe(true);
        if (!first.ok) return;

        // Truncate one stored asset, as a dropped connection would have left it.
        const release = github.releases.get(first.summary.tag);
        const part = release?.assets.find((asset) => asset.name.includes(".001-"));
        if (part === undefined) throw new Error("no first part");
        part.size = part.size - 1;

        const before = github.requests.length;
        const second = await makeRunner(github).backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 2048,
            resumeTag: first.summary.tag,
        });

        expect(second.ok).toBe(true);
        const reuploaded = github.requests
            .slice(before)
            .filter((request) => request.method === "POST" && request.url.includes(".001-"));
        expect(reuploaded).toHaveLength(1);
    });

    it("names the part asset after its own digest, which is what makes a skip a digest match", () => {
        expect(partAssetName("world.zip", 3, "abcdef0123456789fedcba",
        )).toBe("world.zip.003-abcdef0123456789");
    });

    it("refuses to resume a tag that has no release, rather than quietly making one", async () => {
        const github = fakeGitHub();
        const runner = makeRunner(github);

        const result = await runner.backup({
            kind: "world",
            folder: await makeWorld(),
            owner: "o",
            repo: "r",
            partSize: 2048,
            resumeTag: "mbm-backup-world-nothing-20200101T000000Z",
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.message).toContain("Nothing was created or changed");
        expect(github.releases.size).toBe(0);
    });
});

describe("cancelling", () => {
    it("stops in the middle of a part, and keeps every part already uploaded", async () => {
        const github = fakeGitHub();
        const events: BackupEvent[] = [];
        const runner = makeRunner(github, events);
        const folder = await makeWorld();

        // Work out which part will be the second one, and hold *that* one open. Cancelling
        // between two parts would prove only that the loop checks its signal; cancelling
        // inside one proves the signal reaches the request that is actually in flight.
        const archive = await packForNames(folder);
        github.stall(archive.secondPartMark);

        const running = runner.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 2048,
        });

        const backupId = await waitFor(events, (event) => (event.type === "started" ? event.backupId : null));
        await waitUntil(
            () =>
                github.requests.filter(
                    (request) => request.method === "POST" && request.url.includes("assets?name="),
                ).length >= 2,
        );
        expect(runner.cancel(backupId)).toBe(true);

        const result = await running;
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("cancelled");
        expect(result.failure.message).toContain("carries on");
        expect(events.some((event) => event.type === "cancelled")).toBe(true);

        // The first part landed and stayed; the pointer never did, so nothing would read
        // this release as a finished backup.
        const release = [...github.releases.values()][0];
        expect(release?.assets.some((asset) => asset.name.includes(".001-"))).toBe(true);
        expect(release?.assets.some((asset) => asset.name.endsWith(".cheaplfs"))).toBe(false);

        // The workspace is intact: nothing is thrown away by a cancel.
        const workspace = backupWorkspace(join(workDir, "storage"), backupId);
        expect((await stat(workspace.partsDir)).isDirectory()).toBe(true);
    });

    it("answers false for an id that is not running", () => {
        expect(makeRunner(fakeGitHub()).cancel("nothing-like-this")).toBe(false);
    });
});

describe("nothing that already exists is ever changed", () => {
    it("never sends a PATCH, a PUT or a DELETE, across a full backup and a resume", async () => {
        const github = fakeGitHub();
        const runner = makeRunner(github);
        const folder = await makeWorld();

        const first = await runner.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 2048,
        });
        expect(first.ok).toBe(true);
        if (!first.ok) return;

        await makeRunner(github).backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 2048,
            resumeTag: first.summary.tag,
        });

        const methods = new Set(github.requests.map((request) => request.method));
        expect([...methods].sort()).toEqual(["GET", "POST"]);
    });

    it("gives every backup its own id, derived from the repository and the tag", () => {
        expect(backupIdFor("o", "r", "tag-a")).not.toBe(backupIdFor("o", "r", "tag-b"));
        expect(backupIdFor("o", "r", "tag-a")).toBe(backupIdFor("O", "R", "tag-a"));
    });
});
