/**
 * The whole path, end to end, against a release that exists only in this test.
 *
 * A real archive is built, really split by `@worldlens/parts`, served by a stub
 * that behaves like GitHub's asset storage, downloaded, rejoined and unpacked. Nothing
 * is mocked between the split and the extracted files, because the failures worth
 * catching here - a part that arrives wrong, an interrupted transfer, a cancelled run
 * that leaves something looking finished - all live in the seams between those steps.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { splitFile } from "@worldlens/parts";
import { ReleaseDownloader, estimateEta, formatEta } from "./downloader.js";
import type { DownloadEvent } from "./downloader.js";
import type { FetchLike } from "./release.js";
import { downloadIdFor, downloadWorkspace } from "./workspace.js";
import { buildZip } from "./zipTestUtil.js";

let workDir = "";
let storageDir = "";
let assetDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-download-"));
    storageDir = join(workDir, "storage");
    assetDir = join(workDir, "release");
    await mkdir(assetDir, { recursive: true });
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

/** Deterministic content that deflate cannot shrink away, so the fixture stays large. */
function noise(length: number, seed: number): Buffer {
    const buffer = Buffer.allocUnsafe(length);
    let state = seed >>> 0;
    for (let i = 0; i < length; i++) {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        buffer[i] = state & 0xff;
    }
    return buffer;
}

const LEVEL_DAT = noise(4_000, 11);
const REGION = noise(9_000, 12);

// Deflated and Zip64, because that is what a real world archive is: `zip -qr` deflates,
// and a rendered world passes the 4 GB mark where the classic fields stop being usable.
const WORLD = buildZip(
    [
        { name: "world/" },
        { name: "world/level.dat", content: LEVEL_DAT, deflate: true },
        { name: "world/region/r.0.0.mca", content: REGION, deflate: true },
    ],
    { zip64: true },
);

function sha256(content: Buffer): string {
    return createHash("sha256").update(content).digest("hex");
}

interface Published {
    /** Asset name to bytes, exactly as a release would carry them. */
    readonly assets: Map<string, Buffer>;
    readonly releaseBody: Record<string, unknown>;
}

/** Splits a real archive and describes the release that would carry it. */
async function publish(archive: Buffer, partSize: number): Promise<Published> {
    const source = join(assetDir, "world.zip");
    await writeFile(source, archive);
    const result = await splitFile(source, { partSize });
    if (!result.split) throw new Error("the fixture should have been split");

    const assets = new Map<string, Buffer>();
    for (const part of result.manifest.parts) {
        assets.set(part.name, await readFile(join(assetDir, part.name)));
    }
    assets.set("world.zip.parts.json", await readFile(result.manifestPath));
    await rm(source);

    return {
        assets,
        releaseBody: {
            tag_name: "v0.1.0-build.9",
            name: "build 9",
            html_url: "https://github.com/o/r/releases/tag/v0.1.0-build.9",
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
    /** Replaces an asset's bytes, to simulate one arriving corrupt. */
    corrupt(name: string): void;
}

function serve(published: Published): Server {
    const requests: string[] = [];

    const server: Server = {
        requests,
        corrupt(name: string): void {
            const original = published.assets.get(name);
            if (original === undefined) throw new Error(`no such asset: ${name}`);
            const damaged = Buffer.from(original);
            damaged[0] = (((damaged[0] ?? 0) + 1) & 0xff) >>> 0;
            published.assets.set(name, damaged);
        },
        fetch: (url, init) => {
            requests.push(url);
            if (url.includes("/releases/")) {
                return Promise.resolve(
                    new Response(JSON.stringify(published.releaseBody), {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    }),
                );
            }
            const name = url.slice(url.lastIndexOf("/") + 1);
            const body = published.assets.get(name);
            if (body === undefined) return Promise.resolve(new Response("no", { status: 404 }));

            const range = new Headers(init?.headers).get("range");
            const start =
                range === null
                    ? 0
                    : Number.parseInt(range.replace("bytes=", "").split("-")[0] ?? "0", 10);
            if (start >= body.length) return Promise.resolve(new Response(null, { status: 416 }));

            const slice = body.subarray(start);
            return Promise.resolve(
                new Response(new Uint8Array(slice), { status: range === null ? 200 : 206 }),
            );
        },
    };
    return server;
}

function downloader(
    server: Server,
    extra: { token?: () => string | null; concurrency?: number; partRetries?: number } = {},
): { downloader: ReleaseDownloader; events: DownloadEvent[] } {
    const events: DownloadEvent[] = [];
    return {
        events,
        downloader: new ReleaseDownloader({
            storageDir: () => storageDir,
            onEvent: (event) => events.push(event),
            fetch: server.fetch,
            apiBase: "https://api.example",
            token: extra.token ?? (() => null),
            concurrency: extra.concurrency ?? 3,
            ...(extra.partRetries === undefined ? {} : { partRetries: extra.partRetries }),
        }),
    };
}

describe("ReleaseDownloader", () => {
    it("downloads a split asset, rejoins it and unpacks it", async () => {
        const published = await publish(WORLD, 2_048);
        const server = serve(published);
        const { downloader: subject, events } = downloader(server);

        const result = await subject.download({ owner: "o", repo: "r" });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.bytes).toBe(WORLD.length);
        expect(result.sha256).toBe(sha256(WORLD));
        expect(await readFile(result.archive)).toEqual(WORLD);
        expect(result.content).not.toBeNull();
        const region = await readFile(join(result.content ?? "", "world", "region", "r.0.0.mca"));
        expect(region).toEqual(REGION);
        const level = await readFile(join(result.content ?? "", "world", "level.dat"));
        expect(level).toEqual(LEVEL_DAT);

        // Every phase was announced, in order, and the run ended with `finished`.
        const phases = events.filter((event) => event.type === "phase").map((event) => event.phase);
        expect(phases).toEqual(["resolving", "downloading", "joining", "extracting", "finished"]);
        expect(events.at(-1)?.type).toBe("finished");
    });

    it("reports parts done, the current part, and a percent that only climbs", async () => {
        const published = await publish(WORLD, 2_048);
        const { downloader: subject, events } = downloader(serve(published));

        await subject.download({ owner: "o", repo: "r" });

        const progress = events.filter((event) => event.type === "progress");
        expect(progress.length).toBeGreaterThan(3);
        expect(progress.some((event) => event.task.currentPart === "world.zip.001")).toBe(true);
        expect(progress.at(-1)?.task.partsDone).toBeGreaterThan(0);
        expect(progress.at(-1)?.task.percent).toBeGreaterThan(90);
        for (const event of progress) {
            expect(event.task.percent).toBeGreaterThanOrEqual(0);
            expect(event.task.percent).toBeLessThanOrEqual(100);
        }
    });

    it("names the release and the part count when it starts", async () => {
        const published = await publish(WORLD, 4_096);
        const { downloader: subject, events } = downloader(serve(published));

        await subject.download({ owner: "o", repo: "r" });

        const started = events.find((event) => event.type === "started");
        expect(started?.asset).toBe("world.zip");
        expect(started?.release).toBe("v0.1.0-build.9");
        expect(started?.parts).toBeGreaterThan(1);
    });

    it("re-fetches a part that arrived corrupt, and keeps nothing wrong", async () => {
        const published = await publish(WORLD, 2_048);
        const server = serve(published);
        const good = Buffer.from(published.assets.get("world.zip.002") ?? Buffer.alloc(0));
        server.corrupt("world.zip.002");

        const { downloader: subject } = downloader(server, { concurrency: 1, partRetries: 1 });
        const first = await subject.download({ owner: "o", repo: "r" });

        expect(first.ok).toBe(false);
        if (first.ok) return;
        expect(first.failure.code).toBe("integrity-failed");
        // The bad part was deleted rather than left to be resumed into for ever.
        const workspace = downloadWorkspace(storageDir, first.downloadId);
        await expect(stat(join(workspace.partsDir, "world.zip.002"))).rejects.toThrow();
        // And nothing that looks like a finished download survived.
        await expect(stat(join(workspace.root, "world.zip"))).rejects.toThrow();

        // With the asset repaired, the same call finishes, reusing the parts it has.
        published.assets.set("world.zip.002", good);
        const second = await subject.download({ owner: "o", repo: "r" });
        expect(second.ok).toBe(true);
        if (second.ok) expect(second.sha256).toBe(sha256(WORLD));
    });

    it("continues a transfer that was cut off part way", async () => {
        const published = await publish(WORLD, 2_048);
        const server = serve(published);
        const { downloader: subject } = downloader(server, { concurrency: 1 });

        // Half of part two is already on disk from an attempt that did not finish.
        const downloadId = downloadIdFor("o", "r", "v0.1.0-build.9", "world.zip");
        const workspace = downloadWorkspace(storageDir, downloadId);
        await mkdir(workspace.partsDir, { recursive: true });
        const part = published.assets.get("world.zip.002") ?? Buffer.alloc(0);
        await writeFile(join(workspace.partsDir, "world.zip.002"), part.subarray(0, 900));

        const result = await subject.download({ owner: "o", repo: "r" });

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.sha256).toBe(sha256(WORLD));
        // It asked for the rest of part two rather than the whole of it.
        expect(server.requests.filter((url) => url.endsWith("world.zip.002"))).toHaveLength(1);
        expect(await readFile(join(workspace.partsDir, "world.zip.002"))).toEqual(part);
    });

    it("keeps the parts when it is cancelled, and reports a cancellation not a failure", async () => {
        const published = await publish(WORLD, 1_024);
        const server = serve(published);
        const { downloader: subject, events } = downloader(server, { concurrency: 1 });

        const downloadId = downloadIdFor("o", "r", "v0.1.0-build.9", "world.zip");
        const running = subject.download({ owner: "o", repo: "r" });
        // Cancel as soon as the first part has landed.
        await new Promise<void>((done) => {
            const timer = setInterval(() => {
                if (events.some((event) => event.type === "progress" && event.task.partsDone > 0)) {
                    clearInterval(timer);
                    done();
                }
            }, 1);
        });
        expect(subject.cancel(downloadId)).toBe(true);
        const result = await running;

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("cancelled");
        expect(events.at(-1)?.type).toBe("cancelled");
        // A cancellation is not a failure, so what has been transferred stays.
        const workspace = downloadWorkspace(storageDir, downloadId);
        expect((await readdir(workspace.partsDir)).length).toBeGreaterThan(0);
    });

    it("refuses to guess when a release offers several split downloads", async () => {
        const published = await publish(WORLD, 4_096);
        const other = { ...published.releaseBody } as Record<string, unknown>;
        other["assets"] = [
            ...(published.releaseBody["assets"] as unknown[]),
            {
                name: "second.zip.parts.json",
                size: 10,
                browser_download_url: "https://cdn.example/second.zip.parts.json",
                url: "https://api.example/assets/second.zip.parts.json",
            },
            {
                name: "second.zip.001",
                size: 10,
                browser_download_url: "https://cdn.example/second.zip.001",
                url: "https://api.example/assets/second.zip.001",
            },
        ];
        const server = serve({ assets: published.assets, releaseBody: other });
        const { downloader: subject } = downloader(server);

        const result = await subject.download({ owner: "o", repo: "r" });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.code).toBe("invalid-request");
            expect(result.failure.message).toContain("second.zip");
        }
    });

    it("says which names exist when the asked-for one does not", async () => {
        const published = await publish(WORLD, 4_096);
        const { downloader: subject } = downloader(serve(published));

        const result = await subject.download({ owner: "o", repo: "r", asset: "nothing.zip" });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.code).toBe("asset-not-found");
            expect(result.failure.detail).toContain("world.zip");
        }
    });

    it("reports a missing release rather than a network error", async () => {
        const fetch: FetchLike = () => Promise.resolve(new Response("{}", { status: 404 }));
        const { downloader: subject } = downloader({
            fetch,
            requests: [],
            corrupt: () => undefined,
        });

        const result = await subject.download({ owner: "o", repo: "r", tag: "v9" });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("release-not-found");
    });

    it("refuses a request that is not a repository at all", async () => {
        const published = await publish(WORLD, 4_096);
        const { downloader: subject } = downloader(serve(published));

        const result = await subject.download({ owner: "", repo: "r" });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("invalid-request");
    });

    it("uses the CDN URL without a token and the API URL with one", async () => {
        const published = await publish(WORLD, 4_096);

        const anonymous = serve(published);
        await downloader(anonymous).downloader.download({ owner: "o", repo: "r" });
        expect(anonymous.requests.some((url) => url.startsWith("https://cdn.example/"))).toBe(true);
        expect(anonymous.requests.some((url) => url.startsWith("https://api.example/assets/"))).toBe(
            false,
        );

        await rm(storageDir, { recursive: true, force: true });
        const authenticated = serve(published);
        await downloader(authenticated, { token: () => "abc" }).downloader.download({
            owner: "o",
            repo: "r",
        });
        expect(
            authenticated.requests.some((url) => url.startsWith("https://api.example/assets/")),
        ).toBe(true);
    });

    it("writes a record of what was downloaded", async () => {
        const published = await publish(WORLD, 2_048);
        const { downloader: subject } = downloader(serve(published));

        const result = await subject.download({ owner: "o", repo: "r" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const workspace = downloadWorkspace(storageDir, result.downloadId);
        const record = JSON.parse(await readFile(workspace.recordFile, "utf8")) as {
            asset: string;
            split: boolean;
            sha256: string;
            outcome: string;
        };
        expect(record.asset).toBe("world.zip");
        expect(record.split).toBe(true);
        expect(record.sha256).toBe(sha256(WORLD));
        expect(record.outcome).toBe("finished");
    });

    it("lists what a release offers without downloading it", async () => {
        const published = await publish(WORLD, 2_048);
        const server = serve(published);
        const { downloader: subject } = downloader(server);

        const found = await subject.discover("o", "r");

        expect(found.ok).toBe(true);
        if (!found.ok) return;
        expect(found.downloads).toHaveLength(1);
        expect(found.downloads[0]?.name).toBe("world.zip");
        // Only the release itself was read; not one asset byte was transferred.
        expect(server.requests).toHaveLength(1);
    });

    it("reports a download that is already running rather than starting a second", async () => {
        const published = await publish(WORLD, 1_024);
        const server = serve(published);
        const { downloader: subject } = downloader(server, { concurrency: 1 });

        const first = subject.download({ owner: "o", repo: "r" });
        const second = await subject.download({ owner: "o", repo: "r" });

        expect(second.ok).toBe(false);
        if (!second.ok) expect(second.failure.code).toBe("already-running");
        await first;
    });
});

/* -------------------------------------------------------------------------- */
/* The configured concurrency, read fresh                                    */
/* -------------------------------------------------------------------------- */

/**
 * Wraps a {@link Server} so every asset request (not the release lookup) is counted while
 * it is in flight and held open briefly, exactly long enough for genuinely parallel
 * workers to overlap. Without a delay every request would resolve synchronously and no
 * amount of allowed concurrency could be told apart from one worker at a time.
 */
function trackConcurrency(server: Server, delayMs: number): Server & { readonly peak: () => number } {
    let active = 0;
    let peak = 0;
    return {
        requests: server.requests,
        corrupt: (name) => {
            server.corrupt(name);
        },
        fetch: async (url, init) => {
            const isAsset = !url.includes("/releases/");
            if (!isAsset) return await server.fetch(url, init);
            active += 1;
            peak = Math.max(peak, active);
            try {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
                return await server.fetch(url, init);
            } finally {
                active -= 1;
            }
        },
        peak: () => peak,
    };
}

describe("the configured part-fetch concurrency", () => {
    it("reaches the actual number of parts fetched in parallel", async () => {
        // Small parts, so a ~13 KB fixture splits into more pieces than any concurrency
        // this test configures - otherwise the queue itself, not the setting, would be
        // the thing capping how many workers run at once.
        const published = await publish(WORLD, 1_024);
        const tracked = trackConcurrency(serve(published), 15);
        const { downloader: subject } = downloader(tracked, { concurrency: 6 });

        const result = await subject.download({ owner: "o", repo: "r" });

        expect(result.ok).toBe(true);
        expect(tracked.peak()).toBe(6);
    });

    it("reads the concurrency fresh on every download rather than freezing it at construction", async () => {
        const published = await publish(WORLD, 1_024);
        let configured = 1;
        let tracker = trackConcurrency(serve(published), 15);
        // One downloader instance for both downloads: the point is that the *same*
        // instance re-reads the function rather than having captured its result once, at
        // construction, the way a plain number would have.
        const subject = new ReleaseDownloader({
            storageDir: () => storageDir,
            onEvent: () => undefined,
            fetch: (url, init) => tracker.fetch(url, init),
            apiBase: "https://api.example",
            token: () => null,
            concurrency: () => configured,
        });

        await subject.download({ owner: "o1", repo: "r1" });
        expect(tracker.peak()).toBe(1);

        // Settings changed between two downloads - the same app session, no restart.
        configured = 5;
        tracker = trackConcurrency(serve(published), 15);
        await subject.download({ owner: "o2", repo: "r2" });
        expect(tracker.peak()).toBe(5);
    });

    it("lets an explicit per-download value win over the configured default", async () => {
        const published = await publish(WORLD, 1_024);
        const tracked = trackConcurrency(serve(published), 15);
        // The settings-wide default. An explicit request value must win over it.
        const { downloader: subject } = downloader(tracked, { concurrency: 1 });

        await subject.download({ owner: "o", repo: "r", concurrency: 7 });

        expect(tracked.peak()).toBe(7);
    });

    it("accepts a plain number as well as a function", async () => {
        const published = await publish(WORLD, 1_024);
        const tracked = trackConcurrency(serve(published), 15);
        const { downloader: subject } = downloader(tracked, { concurrency: 4 });

        await subject.download({ owner: "o", repo: "r" });

        expect(tracked.peak()).toBe(4);
    });
});

describe("estimates", () => {
    it("says nothing until there is something to go on", () => {
        expect(estimateEta(0, 1_000, 5_000)).toBeNull();
        expect(estimateEta(500, 1_000, 100)).toBeNull();
        expect(estimateEta(1_000, 1_000, 5_000)).toBeNull();
    });

    it("divides the remainder by the rate so far", () => {
        expect(estimateEta(500, 1_000, 2_000)).toBe(2);
    });

    it("reads the way upstream's own estimate does", () => {
        expect(formatEta(30)).toBe("30 seconds");
        expect(formatEta(120)).toBe("2 minutes");
        expect(formatEta(3_600)).toBe("1 hours");
        expect(formatEta(3_900)).toBe("1 hours 5 minutes");
    });
});
