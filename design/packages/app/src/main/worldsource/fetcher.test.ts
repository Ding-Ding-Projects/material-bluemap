/**
 * The whole cross-repository path, end to end, against a release that exists only here.
 *
 * A real zip is built, really cut into parts, a real `SHA256SUMS` is written for those
 * parts, and the pile is served by a stub that behaves like GitHub's asset storage. Every
 * byte from the split to the extracted files is the real code path: the transfer, the
 * verification pass, the synthesised manifest, `joinParts` and the unpack. Nothing between
 * them is mocked, because the failures worth catching here live in exactly those seams.
 *
 * No test in this file needs the network, a token, or a GitHub account.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DownloadEvent } from "../download/downloader.js";
import type { FetchLike } from "../download/release.js";
import { downloadIdFor, downloadWorkspace } from "../download/workspace.js";
import { buildZip } from "../download/zipTestUtil.js";
import { WorldSourceFetcher } from "./fetcher.js";

let workDir = "";
let storageDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-worldsource-"));
    storageDir = join(workDir, "storage");
    await mkdir(storageDir, { recursive: true });
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

/** Deterministic content that deflate cannot shrink away, so the fixture stays real. */
function noise(length: number, seed: number): Buffer {
    const buffer = Buffer.allocUnsafe(length);
    let state = seed >>> 0;
    for (let index = 0; index < length; index++) {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        buffer[index] = state & 0xff;
    }
    return buffer;
}

const LEVEL_DAT = noise(3_000, 21);
const REGION = noise(8_000, 22);
const WORLD = buildZip([
    { name: "world/" },
    { name: "world/level.dat", content: LEVEL_DAT, deflate: true },
    { name: "world/region/r.0.0.mca", content: REGION, deflate: true },
]);

function sha256(content: Buffer): string {
    return createHash("sha256").update(content).digest("hex");
}

interface Published {
    readonly assets: Map<string, Buffer>;
    readonly body: Record<string, unknown>;
    readonly archiveName: string;
}

/**
 * Publishes an archive the way somebody else's backup script does it: zero-padded,
 * zero-based `.zip.part.NNNN` files and a coreutils `SHA256SUMS`. No manifest anywhere.
 */
function publishWithChecksums(
    archive: Buffer,
    partSize: number,
    options: { readonly owner?: string; readonly repo?: string; readonly tag?: string } = {},
): Published {
    const archiveName = "andyville-world-20260804-160001.zip";
    const assets = new Map<string, Buffer>();
    const sums: string[] = [];

    for (let offset = 0, index = 0; offset < archive.length; offset += partSize, index++) {
        const name = `${archiveName}.part.${String(index).padStart(4, "0")}`;
        const slice = archive.subarray(offset, Math.min(offset + partSize, archive.length));
        const bytes = Buffer.from(slice);
        assets.set(name, bytes);
        sums.push(`${sha256(bytes)}  ${name}`);
    }
    assets.set("SHA256SUMS", Buffer.from(`${sums.join("\n")}\n`, "utf8"));

    return {
        assets,
        archiveName,
        body: {
            tag_name: options.tag ?? "andyville-backup-20260804-160001",
            name: "Andyville world",
            html_url: "https://github.com/cafepromenade/Andyville-World/releases/tag/x",
            assets: [...assets.entries()].map(([name, bytes]) => ({
                name,
                size: bytes.length,
                browser_download_url: `https://cdn.example/${name}`,
                url: `https://api.example/assets/${name}`,
            })),
        },
    };
}

interface Server {
    readonly fetch: FetchLike;
    readonly requests: string[];
    /** Damages an asset permanently, as a release with a bad file would. */
    corrupt(name: string): void;
    /**
     * Damages an asset for its **next** read only.
     *
     * This is what a one-off bad transfer actually looks like: the release is fine and the
     * bytes that arrived are not. Corrupting the stored asset permanently would test a
     * different thing - a broken publication - and would never let the repair succeed.
     */
    corruptOnce(name: string): void;
}

/** GitHub's asset storage, near enough: ranged reads, 404s and one release document. */
function serve(published: Published, expectedPath?: string): Server {
    const requests: string[] = [];
    const damageOnce = new Set<string>();
    return {
        requests,
        corrupt(name: string): void {
            const original = published.assets.get(name);
            if (original === undefined) throw new Error(`no such asset: ${name}`);
            const damaged = Buffer.from(original);
            damaged[0] = ((damaged[0] ?? 0) + 1) & 0xff;
            published.assets.set(name, damaged);
        },
        corruptOnce(name: string): void {
            damageOnce.add(name);
        },
        fetch: (url, init) => {
            requests.push(url);
            if (url.includes("/releases/")) {
                // The point of the whole feature: the lookup has to address the repository
                // that was asked for, not the one this app happens to live in.
                if (expectedPath !== undefined && !url.includes(expectedPath)) {
                    return Promise.resolve(new Response("wrong repository", { status: 404 }));
                }
                return Promise.resolve(
                    new Response(JSON.stringify(published.body), {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    }),
                );
            }
            const name = url.slice(url.lastIndexOf("/") + 1);
            let body = published.assets.get(name);
            if (body === undefined) return Promise.resolve(new Response("no", { status: 404 }));
            if (damageOnce.delete(name)) {
                const damaged = Buffer.from(body);
                damaged[0] = ((damaged[0] ?? 0) + 1) & 0xff;
                body = damaged;
            }

            const range = new Headers(init?.headers).get("range");
            const start =
                range === null
                    ? 0
                    : Number.parseInt(range.replace("bytes=", "").split("-")[0] ?? "0", 10);
            if (start >= body.length) return Promise.resolve(new Response(null, { status: 416 }));
            return Promise.resolve(
                new Response(new Uint8Array(body.subarray(start)), {
                    status: range === null ? 200 : 206,
                }),
            );
        },
    };
}

function fetcher(
    server: Server,
    extra: { readonly concurrency?: number; readonly partRetries?: number } = {},
): { readonly subject: WorldSourceFetcher; readonly events: DownloadEvent[] } {
    const events: DownloadEvent[] = [];
    return {
        events,
        subject: new WorldSourceFetcher({
            storageDir: () => storageDir,
            onEvent: (event) => events.push(event),
            fetch: server.fetch,
            apiBase: "https://api.example",
            token: () => null,
            concurrency: extra.concurrency ?? 2,
            ...(extra.partRetries === undefined ? {} : { partRetries: extra.partRetries }),
        }),
    };
}

describe("WorldSourceFetcher, against a SHA256SUMS release in another repository", () => {
    it("fetches a split world from a repository that is not this one", async () => {
        const published = publishWithChecksums(WORLD, 2_048);
        const server = serve(published, "/repos/cafepromenade/Andyville-World/");
        const { subject, events } = fetcher(server);

        const result = await subject.fetch({
            owner: "cafepromenade",
            repo: "Andyville-World",
            tag: "andyville-backup-20260804-160001",
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.bytes).toBe(WORLD.length);
        expect(await readFile(result.archive)).toEqual(WORLD);
        expect(result.content).not.toBeNull();
        expect(await readFile(join(result.content ?? "", "world", "level.dat"))).toEqual(LEVEL_DAT);
        expect(await readFile(join(result.content ?? "", "world", "region", "r.0.0.mca"))).toEqual(
            REGION,
        );

        // The lookup went to the named repository at the named tag, and to no other.
        expect(
            server.requests.some((url) =>
                url.includes(
                    "/repos/cafepromenade/Andyville-World/releases/tags/andyville-backup-20260804-160001",
                ),
            ),
        ).toBe(true);

        const phases = events.filter((event) => event.type === "phase").map((event) => event.phase);
        expect(phases).toEqual(["resolving", "downloading", "joining", "extracting", "finished"]);
    });

    it("discovers the release without fetching a byte of it", async () => {
        const published = publishWithChecksums(WORLD, 2_048);
        const server = serve(published);
        const { subject } = fetcher(server);

        const found = await subject.discover("cafepromenade", "Andyville-World");
        expect(found.ok).toBe(true);
        if (!found.ok) return;
        expect(found.release.sources).toEqual([
            {
                name: "andyville-world-20260804-160001.zip",
                kind: "checksums",
                parts: published.assets.size - 1,
                bytes: WORLD.length,
                // Said out loud, because it is not the same guarantee a manifest gives.
                verification: "checksum-list",
            },
        ]);
        expect(server.requests.every((url) => url.includes("/releases/"))).toBe(true);
    });

    it("refuses a repository name GitHub could not have, before any request", async () => {
        const server = serve(publishWithChecksums(WORLD, 2_048));
        const { subject } = fetcher(server);
        const result = await subject.fetch({ owner: "../etc", repo: "passwd" });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("invalid-request");
        expect(server.requests).toEqual([]);
    });

    it("says a release does not exist rather than inventing a reason", async () => {
        const server = serve(publishWithChecksums(WORLD, 2_048), "/repos/right/repo/");
        const { subject } = fetcher(server);
        const result = await subject.fetch({ owner: "wrong", repo: "repo" });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("release-not-found");
    });
});

describe("a part that fails its digest", () => {
    it("re-fetches it once and finishes when the second copy is right", async () => {
        const published = publishWithChecksums(WORLD, 2_048);
        const server = serve(published);
        const { subject, events } = fetcher(server, { partRetries: 1 });

        // One part arrives wrong on its first read and correctly on the second, which is
        // what a dropped connection or a flipped bit on the wire actually looks like.
        server.corruptOnce(`${published.archiveName}.part.0001`);

        const result = await subject.fetch({ owner: "cafepromenade", repo: "Andyville-World" });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // And the world that came out is still byte-for-byte the one that was published.
        expect(await readFile(result.archive)).toEqual(WORLD);
        const warned = events.filter(
            (event) => event.type === "log" && event.level === "warning",
        );
        expect(warned).toHaveLength(1);
        expect((warned[0] as { message: string }).message).toContain("part.0001");
    });

    it("keeps nothing that looks finished when the bytes stay wrong", async () => {
        const published = publishWithChecksums(WORLD, 2_048);
        const server = serve(published);
        const { subject, events } = fetcher(server, { partRetries: 1 });
        server.corrupt(`${published.archiveName}.part.0002`);

        const result = await subject.fetch({ owner: "cafepromenade", repo: "Andyville-World" });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("integrity-failed");
        // The part that disagreed is named with both digests, so one file can be looked
        // at rather than all four.
        expect(result.failure.detail ?? result.failure.message).toContain("part.0002");

        const workspace = downloadWorkspace(
            storageDir,
            downloadIdFor(
                "cafepromenade",
                "Andyville-World",
                "andyville-backup-20260804-160001",
                published.archiveName,
            ),
        );
        // No joined archive, no unpacked tree: nothing downstream can mistake this for a
        // world that arrived.
        const left = await readdir(workspace.root);
        expect(left).not.toContain(published.archiveName);
        expect(left).not.toContain("content");
        expect(events.at(-1)?.type).toBe("failed");
    });

    it("treats a part the checksum list never mentions as a failure, not a pass", async () => {
        const published = publishWithChecksums(WORLD, 2_048);
        // A list that forgot one part. An "absent expectation" must never read as a
        // satisfied one, or those bytes reach the world unverified.
        const text = published.assets.get("SHA256SUMS")?.toString("utf8") ?? "";
        published.assets.set(
            "SHA256SUMS",
            Buffer.from(
                text
                    .split("\n")
                    .filter((line) => !line.includes("part.0001"))
                    .join("\n"),
                "utf8",
            ),
        );
        published.body["assets"] = (
            published.body["assets"] as { name: string; size: number }[]
        ).map((asset) =>
            asset.name === "SHA256SUMS"
                ? { ...asset, size: published.assets.get("SHA256SUMS")?.length ?? 0 }
                : asset,
        );

        const { subject } = fetcher(serve(published), { partRetries: 0 });
        const result = await subject.fetch({ owner: "cafepromenade", repo: "Andyville-World" });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("integrity-failed");
        expect(result.failure.detail ?? "").toContain("not listed");
    });
});

describe("the synthesised manifest", () => {
    it("is written beside the parts, so the join is the one that already exists", async () => {
        const published = publishWithChecksums(WORLD, 2_048);
        const { subject } = fetcher(serve(published));
        const result = await subject.fetch({ owner: "cafepromenade", repo: "Andyville-World" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const workspace = downloadWorkspace(storageDir, result.downloadId);
        const manifest = JSON.parse(
            await readFile(join(workspace.partsDir, `${published.archiveName}.parts.json`), "utf8"),
        ) as {
            file: string;
            bytes: number;
            sha256: string;
            parts: { index: number; name: string }[];
        };

        expect(manifest.file).toBe(published.archiveName);
        expect(manifest.bytes).toBe(WORLD.length);
        expect(manifest.sha256).toBe(sha256(WORLD));
        // Renumbered from one for the format, while every name keeps the spelling the
        // release published - the disk still matches the release, so a resume finds it.
        expect(manifest.parts.map((part) => part.index)).toEqual(
            manifest.parts.map((_part, position) => position + 1),
        );
        expect(manifest.parts[0]?.name).toBe(`${published.archiveName}.part.0000`);
    });

    it("says in the log that the whole-archive digest is derived, not published", async () => {
        const published = publishWithChecksums(WORLD, 2_048);
        const { subject, events } = fetcher(serve(published));
        await subject.fetch({ owner: "cafepromenade", repo: "Andyville-World" });
        const said = events
            .filter((event) => event.type === "log")
            .map((event) => (event as { message: string }).message)
            .join("\n");
        expect(said).toContain("derived from them locally");
    });
});

describe("cancelling", () => {
    it("is reported as a cancellation and keeps the parts to resume from", async () => {
        const published = publishWithChecksums(WORLD, 2_048);
        const server = serve(published);
        const { subject, events } = fetcher(server, { concurrency: 1 });

        const started = subject.fetch({ owner: "cafepromenade", repo: "Andyville-World" });
        // Cancelled as soon as the run has an id, which is the moment a person could
        // press the button.
        await Promise.resolve();
        const id = downloadIdFor(
            "cafepromenade",
            "Andyville-World",
            "andyville-backup-20260804-160001",
            published.archiveName,
        );
        for (let attempt = 0; attempt < 50 && !subject.activeDownloadIds().includes(id); attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 1));
        }
        expect(subject.cancel(id)).toBe(true);
        const result = await started;

        expect(result.ok).toBe(false);
        if (result.ok) return;
        // Its own outcome, never a failure with a code: a person who pressed Cancel must
        // not be shown a red banner saying something went wrong.
        expect(result.failure.code).toBe("cancelled");
        expect(events.some((event) => event.type === "cancelled")).toBe(true);
    });

    it("answers false for an id nothing is running under", () => {
        const { subject } = fetcher(serve(publishWithChecksums(WORLD, 2_048)));
        expect(subject.cancel("nothing-here")).toBe(false);
    });
});

describe("writing to somewhere unwritable", () => {
    it("says which folder, and points at the setting that changes it", async () => {
        const published = publishWithChecksums(WORLD, 2_048);
        // A file where the downloads directory has to be: creating the workspace fails
        // with ENOTDIR, which is a settings problem rather than a network one.
        const blocked = join(workDir, "blocked");
        await writeFile(blocked, "not a directory", "utf8");

        const events: DownloadEvent[] = [];
        const subject = new WorldSourceFetcher({
            storageDir: () => blocked,
            onEvent: (event) => events.push(event),
            fetch: serve(published).fetch,
            apiBase: "https://api.example",
            token: () => null,
        });

        const result = await subject.fetch({ owner: "cafepromenade", repo: "Andyville-World" });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("storage-unwritable");
        expect(result.failure.settings?.anchor).toBe("map-storage-directory");
    });
});
