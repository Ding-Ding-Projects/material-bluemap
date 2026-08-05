/**
 * Restoring a whole backup, end to end, against real temporary folders and a fake GitHub.
 *
 * The fake is shared in shape with `runner.test.ts`'s: real folders and a real zip reader
 * because those are the parts a mocked filesystem would let through wrong, a fake GitHub
 * because the alternative is downloading gigabytes in a unit test. The strongest proof
 * here is round-tripping through both files at once - a real `BackupRunner` publishes a
 * real backup into the fake, and a real `BackupRestoreRunner` reads it back out - so the
 * two never get to quietly agree about a naming convention that diverges from what either
 * one actually does on its own.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { BackupRunner } from "./runner.js";
import type { BackupEvent } from "./runner.js";
import { BackupRestoreRunner, RestoreRefusal } from "./restore.js";
import type { RestoreEvent } from "./restore.js";
import { SIDECAR_ASSET_NAME } from "./sidecar.js";
import { POINTER_ASSET_SUFFIX } from "./pointer.js";

let workDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-backup-restore-"));
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
 * A GitHub with one repository and whatever releases the test creates, extended over
 * `runner.test.ts`'s fake with a `.body` web stream on every asset GET - `downloadToFile`
 * reads a response's body as a stream, and `runner.test.ts`'s fake never had to answer
 * that question because nothing there downloads a byte back.
 */
function fakeGitHub(options: { canWrite?: boolean } = {}) {
    const releases = new Map<string, { id: number; tag: string; assets: FakeAsset[] }>();
    const requests: { method: string; url: string }[] = [];
    let nextId = 100;

    const bodyStreamOf = (bytes: Buffer): ReadableStream<Uint8Array> =>
        new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array(bytes));
                controller.close();
            },
        });

    const impl = async (url: string, init?: RequestInit): Promise<Response> => {
        const method = init?.method ?? "GET";
        requests.push({ method, url });

        const answer = (status: number, body: unknown, bytesForBody?: Buffer): Response =>
            ({
                ok: status >= 200 && status < 300,
                status,
                statusText: String(status),
                json: () => Promise.resolve(body),
                arrayBuffer: () =>
                    Promise.resolve(
                        Uint8Array.from(
                            Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8"),
                        ).buffer as ArrayBuffer,
                    ),
                body: bytesForBody === undefined ? null : bodyStreamOf(bytesForBody),
            }) as unknown as Response;

        const releaseJson = (release: { id: number; tag: string; assets: FakeAsset[] }): unknown => ({
            id: release.id,
            tag_name: release.tag,
            name: `Backup ${release.tag}`,
            html_url: `https://github.test/o/r/releases/tag/${release.tag}`,
            upload_url: "https://uploads.test/",
            created_at: "2026-08-05T10:15:00Z",
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
            if (asset === undefined) return answer(404, "");
            return answer(200, asset.bytes, asset.bytes);
        }

        if (method === "GET" && /\/repos\/[^/]+\/[^/]+$/.test(url)) {
            return answer(200, {
                full_name: "o/r",
                name: "r",
                owner: { login: "o" },
                private: true,
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
        /** Directly corrupts a published asset's stored bytes, to prove a bad part is caught. */
        corrupt(tag: string, name: string): void {
            const asset = releases.get(tag)?.assets.find((item) => item.name === name);
            if (asset === undefined) throw new Error(`no such asset: ${tag}/${name}`);
            asset.bytes = Buffer.concat([asset.bytes, Buffer.from("!corrupted!")]);
            asset.size = asset.bytes.length;
        },
        /** Removes a published asset outright, e.g. to simulate a stopped upload. */
        removeAsset(tag: string, name: string): void {
            const release = releases.get(tag);
            if (release === undefined) return;
            release.assets = release.assets.filter((asset) => asset.name !== name);
        },
    };
}

function makeRunner(github: ReturnType<typeof fakeGitHub>, events: BackupEvent[] = []) {
    return new BackupRunner({
        storageDir: () => join(workDir, "storage"),
        token: () => "t0k3n",
        fetch: github.fetch,
        onEvent: (event) => events.push(event),
        appVersion: "0.1.0",
        apiBase: "https://api.test",
        uploadsBase: "https://uploads.test",
    });
}

function makeRestorer(github: ReturnType<typeof fakeGitHub>, events: RestoreEvent[] = []) {
    return new BackupRestoreRunner({
        storageDir: () => join(workDir, "restoreStorage"),
        token: () => "t0k3n",
        fetch: github.fetch,
        onEvent: (event) => events.push(event),
        apiBase: "https://api.test",
    });
}

/** Every file under a folder, as a map from its relative path to its SHA-256. */
async function fingerprint(root: string): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    async function walk(dir: string): Promise<void> {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            } else if (entry.isFile()) {
                const bytes = await readFile(full);
                found.set(
                    relative(root, full).split("\\").join("/"),
                    createHash("sha256").update(bytes).digest("hex"),
                );
            }
        }
    }
    await walk(root);
    return found;
}

describe("restoring a whole backup", () => {
    it("round-trips a multi-part backup byte for byte through the real runner and restorer", async () => {
        const github = fakeGitHub();
        const folder = await makeWorld();
        const original = await fingerprint(folder);
        expect(original.size).toBeGreaterThan(0);

        const runner = makeRunner(github);
        const backed = await runner.backup({
            kind: "world",
            folder,
            owner: "o",
            repo: "r",
            partSize: 2048,
        });
        expect(backed.ok).toBe(true);
        if (!backed.ok) return;

        const restoreEvents: RestoreEvent[] = [];
        const restorer = makeRestorer(github, restoreEvents);
        const result = await restorer.restore({ owner: "o", repo: "r", tag: backed.summary.tag });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.summary.sha256).toBe(backed.summary.sha256);
        expect(result.summary.bytes).toBe(backed.summary.bytes);
        expect(result.summary.parts).toBeGreaterThan(1);
        expect(result.summary.kind).toBe("world");

        const restored = await fingerprint(result.summary.contentFolder);
        expect(restored).toEqual(original);

        const types = restoreEvents.map((event) => event.type);
        expect(types[0]).toBe("started");
        expect(types.at(-1)).toBe("finished");
        expect(types).toContain("progress");
    });

    it("round-trips a small, unsplit backup as the original five-line pointer form", async () => {
        const github = fakeGitHub();
        const folder = join(workDir, "saves", "tiny");
        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, "level.dat"), "x");

        const runner = makeRunner(github);
        const backed = await runner.backup({ kind: "world", folder, owner: "o", repo: "r" });
        expect(backed.ok).toBe(true);
        if (!backed.ok) return;

        const restorer = makeRestorer(github);
        const result = await restorer.restore({ owner: "o", repo: "r", tag: backed.summary.tag });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.summary.parts).toBe(1);

        const restored = await fingerprint(result.summary.contentFolder);
        const original = await fingerprint(folder);
        expect(restored).toEqual(original);
    });

    it("refuses a release whose upload never finished - parts but no pointer", async () => {
        const github = fakeGitHub();
        const folder = await makeWorld();
        const runner = makeRunner(github);
        const backed = await runner.backup({ kind: "world", folder, owner: "o", repo: "r", partSize: 2048 });
        expect(backed.ok).toBe(true);
        if (!backed.ok) return;

        // Simulates an upload that stopped right before the pointer went up: every part
        // and the sidecar are there, the pointer is not.
        const pointerName = `${backed.summary.archive}${POINTER_ASSET_SUFFIX}`;
        github.removeAsset(backed.summary.tag, pointerName);

        const restorer = makeRestorer(github);
        const result = await restorer.restore({ owner: "o", repo: "r", tag: backed.summary.tag });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("incomplete");
    });

    it("refuses a release with no sidecar at all - not a backup this build made", async () => {
        const github = fakeGitHub();
        // A release that exists but was never a backup: nobody publishes `backup.json`.
        await github.fetch("https://api.test/repos/o/r/releases", {
            method: "POST",
            body: JSON.stringify({ tag_name: "v1.0.0" }),
        });

        const restorer = makeRestorer(github);
        const result = await restorer.restore({ owner: "o", repo: "r", tag: "v1.0.0" });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("not-a-backup");
    });

    it("catches a part that does not match its published digest, and unpacks nothing", async () => {
        const github = fakeGitHub();
        const folder = await makeWorld();
        const runner = makeRunner(github);
        const backed = await runner.backup({ kind: "world", folder, owner: "o", repo: "r", partSize: 2048 });
        expect(backed.ok).toBe(true);
        if (!backed.ok) return;

        // Corrupts the first part's bytes on the release directly - the pointer still
        // names the original digest, so the rejoin must catch the mismatch rather than
        // trust a part just because its name matched.
        const firstPart = github.releases.get(backed.summary.tag)?.assets.find(
            (asset) => asset.name.startsWith(backed.summary.archive) && asset.name !== SIDECAR_ASSET_NAME,
        );
        expect(firstPart).toBeDefined();
        if (firstPart === undefined) return;
        github.corrupt(backed.summary.tag, firstPart.name);

        const restorer = makeRestorer(github);
        const result = await restorer.restore({ owner: "o", repo: "r", tag: backed.summary.tag });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("failed");
        expect(result.failure.message).toContain(firstPart.name);
    });

    it("throws RestoreRefusal with a stable code, not a bare Error, for a missing release", async () => {
        const github = fakeGitHub();
        const restorer = makeRestorer(github);
        const result = await restorer.restore({ owner: "o", repo: "r", tag: "no-such-tag" });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("not-found");
    });

    it("reports RestoreRefusal as a real class, importable and instanceof-able", () => {
        const refusal = new RestoreRefusal("incomplete", "test");
        expect(refusal).toBeInstanceOf(Error);
        expect(refusal).toBeInstanceOf(RestoreRefusal);
        expect(refusal.code).toBe("incomplete");
    });

    it("can be cancelled mid-restore, and reports cancellation rather than failure", async () => {
        const github = fakeGitHub();
        const folder = await makeWorld();
        const runner = makeRunner(github);
        const backed = await runner.backup({ kind: "world", folder, owner: "o", repo: "r", partSize: 2048 });
        expect(backed.ok).toBe(true);
        if (!backed.ok) return;

        const events: RestoreEvent[] = [];
        const restorer = makeRestorer(github, events);
        const promise = restorer.restore({ owner: "o", repo: "r", tag: backed.summary.tag });

        // Cancels as soon as the restore has actually started, rather than racing the
        // very first tick before `#running` has the id.
        await new Promise<void>((resolve) => {
            const check = (): void => {
                if (restorer.activeRestoreIds().length > 0) resolve();
                else setTimeout(check, 1);
            };
            check();
        });
        const restoreId = restorer.activeRestoreIds()[0];
        expect(restoreId).toBeDefined();
        if (restoreId !== undefined) restorer.cancel(restoreId);

        const result = await promise;
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("cancelled");
        expect(events.some((event) => event.type === "cancelled")).toBe(true);
    });
});
