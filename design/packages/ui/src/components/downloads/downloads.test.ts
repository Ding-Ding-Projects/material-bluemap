/**
 * One download, driven through everything that can happen to it.
 *
 * The events are scripted rather than fetched, which is the only way to exercise a
 * twenty-gigabyte transfer in a millisecond, and they are the exact shapes
 * `main/download/downloader.ts` emits: four phases, byte counts that are stated as exact,
 * a percentage that is stated as an estimate, and three different endings.
 *
 * The reconciliation cases are the ones that would otherwise be found in production.
 * A download outlives the window that started it, and only its record on disk knows which
 * repository it came from, so a surface that read only the events would show a download it
 * could never carry on, and a surface that let the record win would replace live progress
 * with a stale snapshot.
 */

import { describe, expect, it, vi } from "vitest";
import {
    adviseOnDownloadFailure,
    canResume,
    createDownloads,
    etaText,
    formatBytes,
    partsText,
    phaseLabel,
    requestFor,
    transferText,
    type DownloadRow,
} from "./downloads.js";
import { resolveDownloadBridge } from "./downloadBridge.js";
import type {
    DiscoveredRelease,
    DownloadBridge,
    DownloadEvent,
    DownloadFailure,
    DownloadRequest,
    DownloadResult,
    DownloadSummary,
    DownloadTaskProgress,
} from "./downloadBridge.js";
import type { Translate } from "../world/worldFolder.js";

/**
 * The fallback-returning translator, which is what a build with no locale uses.
 *
 * It interpolates the named values rather than dropping them, because vue-i18n does: a
 * stub that ignored argument two would report sizes here while the screen said " GB".
 */
const t: Translate = (_key: string, second: string | Readonly<Record<string, unknown>>, third?: string): string =>
    typeof second === "string"
        ? second
        : Object.entries(second).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), third ?? "");

const RELEASE: DiscoveredRelease = {
    tag: "v1.4.0",
    name: "Har Gow",
    htmlUrl: "https://github.com/owner/repo/releases/tag/v1.4.0",
    downloads: [
        { name: "test-world-seed-1739.zip", split: true, parts: 3, bytes: 4_030_000_000 },
        { name: "material-bluemap-setup.exe", split: false, parts: 1, bytes: 91_400_000 },
    ],
};

const DOWNLOAD_ID = "test-world-seed-1739-zip-6640a521a882";

function progress(overrides: Partial<DownloadTaskProgress> = {}): DownloadTaskProgress {
    return {
        phase: "downloading",
        description: "Transferring test-world-seed-1739.zip",
        bytesDone: 1_700_000_000,
        bytesTotal: 4_030_000_000,
        partsDone: 1,
        partsTotal: 3,
        currentPart: "test-world-seed-1739.zip.002",
        percent: 32.2,
        etaSeconds: 254,
        etaText: "4m 14s",
        ...overrides,
    };
}

function summary(overrides: Partial<DownloadSummary> = {}): DownloadSummary {
    return {
        downloadId: DOWNLOAD_ID,
        asset: "test-world-seed-1739.zip",
        repository: "owner/repo",
        tag: "v1.4.0",
        outcome: "finished",
        bytes: 4_030_000_000,
        parts: 3,
        split: true,
        archive: "/var/maps/downloads/x/test-world-seed-1739.zip",
        content: "/var/maps/downloads/x/content",
        startedAt: "2026-08-03T09:14:00.000Z",
        finishedAt: "2026-08-03T09:31:14.000Z",
        durationMs: 1_034_000,
        ...overrides,
    };
}

function failure(overrides: Partial<DownloadFailure> = {}): DownloadFailure {
    return {
        code: "network-failed",
        message: "The download could not be completed.",
        settings: null,
        detail: "https://example.invalid/part.001: socket hang up",
        status: null,
        ...overrides,
    };
}

/**
 * What a test wants to vary, rather than the bridge's own methods.
 *
 * Written this way so that every request and every cancellation is recorded whatever else
 * is overridden: a test that replaced `startDownload` outright would silently stop
 * recording, and the assertion that a resume asks for the same thing again would pass
 * against a bridge nobody called.
 */
interface FakeOptions {
    /** What `startDownload` resolves with. Left out, it never resolves. */
    readonly result?: DownloadResult;
    readonly discover?: DownloadBridge["discoverRelease"];
    readonly cancels?: boolean;
    readonly active?: () => Promise<readonly string[]>;
    readonly list?: () => Promise<readonly DownloadSummary[]>;
}

function fakeBridge(options: FakeOptions = {}) {
    const listeners: ((event: DownloadEvent) => void)[] = [];
    const started: DownloadRequest[] = [];
    const cancelled: string[] = [];

    const bridge: DownloadBridge = {
        discoverRelease: options.discover ?? (async () => ({ ok: true, release: RELEASE })),
        startDownload: async (request) => {
            started.push(request);
            if (options.result === undefined) return await new Promise<DownloadResult>(() => undefined);
            return options.result;
        },
        cancelDownload: async (downloadId) => {
            cancelled.push(downloadId);
            return options.cancels ?? true;
        },
        activeDownloads: options.active ?? (async () => []),
        listDownloads: options.list ?? (async () => []),
        onDownloadEvent: (listener) => {
            listeners.push(listener);
            return () => listeners.splice(listeners.indexOf(listener), 1);
        },
        parseLink: async () => null,
        canCancel: true,
        canList: true,
        canSeeActive: true,
        canParseLink: false,
    };

    return {
        bridge,
        started,
        cancelled,
        listeners,
        emit(event: DownloadEvent): void {
            for (const listener of [...listeners]) listener(event);
        },
    };
}

function only(rows: readonly DownloadRow[]): DownloadRow {
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row === undefined) throw new Error("no row");
    return row;
}

/* -------------------------------------------------------------------------- */

describe("one download, phase by phase", () => {
    it("follows a split archive from the first byte to the unpacked folder", () => {
        const fake = fakeBridge();
        const downloads = createDownloads(fake.bridge);

        fake.emit({
            type: "started",
            downloadId: DOWNLOAD_ID,
            asset: "test-world-seed-1739.zip",
            release: "v1.4.0",
            parts: 3,
            bytesTotal: 4_030_000_000,
            at: "t0",
        });

        let row = only(downloads.rows.value);
        expect(row.state).toBe("running");
        expect(row.asset).toBe("test-world-seed-1739.zip");
        expect(row.tag).toBe("v1.4.0");
        expect(row.split).toBe(true);
        expect(row.parts).toBe(3);
        expect(row.bytes).toBe(4_030_000_000);

        fake.emit({ type: "phase", downloadId: DOWNLOAD_ID, phase: "resolving", at: "t1" });
        expect(only(downloads.rows.value).phase).toBe("resolving");

        fake.emit({
            type: "log",
            downloadId: DOWNLOAD_ID,
            level: "info",
            message: "test-world-seed-1739.zip was published in 3 parts totalling 4030000000 bytes.",
            at: "t2",
        });

        fake.emit({ type: "phase", downloadId: DOWNLOAD_ID, phase: "downloading", at: "t3" });
        fake.emit({ type: "progress", downloadId: DOWNLOAD_ID, phase: "downloading", task: progress(), at: "t4" });

        row = only(downloads.rows.value);
        expect(row.phase).toBe("downloading");
        expect(row.task?.bytesDone).toBe(1_700_000_000);
        expect(row.log).toHaveLength(1);
        expect(transferText(row.task, t)).toBe("1.7 GB of 4.03 GB");
        expect(partsText(row.task, t)).toBe("part 1 of 3");
        expect(etaText(row.task, t)).toBe("about 4m 14s left");

        fake.emit({
            type: "progress",
            downloadId: DOWNLOAD_ID,
            phase: "joining",
            task: progress({ phase: "joining", description: "Rejoining", partsDone: 3, percent: 80, etaText: null, etaSeconds: 45 }),
            at: "t5",
        });
        expect(phaseLabel(only(downloads.rows.value).phase, t)).toBe("Putting the parts back together");
        // Only a number came back this time, so the estimate is put into words here.
        expect(etaText(only(downloads.rows.value).task, t)).toBe("about 45 seconds left");

        fake.emit({
            type: "progress",
            downloadId: DOWNLOAD_ID,
            phase: "extracting",
            task: progress({ phase: "extracting", description: "Unpacking", percent: 95, partsTotal: 1, partsDone: 1 }),
            at: "t6",
        });
        expect(phaseLabel(only(downloads.rows.value).phase, t)).toBe("Unpacking the archive");
        // The transfer's total is the download's size; the unpack counts the bytes inside
        // the archive, which is a different and larger number and must not replace it.
        expect(only(downloads.rows.value).bytes).toBe(4_030_000_000);

        fake.emit({
            type: "finished",
            downloadId: DOWNLOAD_ID,
            archive: "/var/maps/downloads/x/test-world-seed-1739.zip",
            content: "/var/maps/downloads/x/content",
            bytes: 4_030_000_000,
            sha256: "6640a521a88283195b790c8bdf6ca176e480c2f9399a8163153d02a2c5b72083",
            durationMs: 1_034_000,
            at: "t7",
        });

        row = only(downloads.rows.value);
        expect(row.state).toBe("finished");
        expect(row.phase).toBe("finished");
        expect(row.content).toBe("/var/maps/downloads/x/content");
        expect(row.sha256).toBe("6640a521a88283195b790c8bdf6ca176e480c2f9399a8163153d02a2c5b72083");
        expect(row.durationMs).toBe(1_034_000);
        expect(row.failure).toBeNull();
        expect(canResume(row)).toBe(false);

        downloads.dispose();
        expect(fake.listeners).toHaveLength(0);
    });

    it("shows a download this window never started, because every window is told", () => {
        const fake = fakeBridge();
        const downloads = createDownloads(fake.bridge);

        fake.emit({
            type: "started",
            downloadId: "someone-elses-download",
            asset: "world.zip",
            release: "v1.0.0",
            parts: 1,
            bytesTotal: 900,
            at: "t0",
        });

        expect(only(downloads.rows.value).asset).toBe("world.zip");
        downloads.dispose();
    });
});

describe("the endings, which are three different things", () => {
    it("keeps a cancellation apart from a failure, and offers to carry it on", async () => {
        const cancelledResult: DownloadResult = {
            ok: false,
            downloadId: DOWNLOAD_ID,
            failure: failure({ code: "cancelled", message: "The download was cancelled.", detail: null }),
        };
        const fake = fakeBridge({ result: cancelledResult });
        const downloads = createDownloads(fake.bridge);

        await downloads.start({ owner: "owner", repo: "repo", tag: "v1.4.0", asset: "test-world-seed-1739.zip" });

        const row = only(downloads.rows.value);
        expect(row.state).toBe("cancelled");
        expect(row.failure).toBeNull();
        // The request is rebuilt from what this window asked for, because no event ever
        // carries the repository.
        expect(row.repository).toBe("owner/repo");
        expect(canResume(row)).toBe(true);

        await downloads.resume(row);
        expect(fake.started).toEqual([
            { owner: "owner", repo: "repo", tag: "v1.4.0", asset: "test-world-seed-1739.zip" },
            { owner: "owner", repo: "repo", tag: "v1.4.0", asset: "test-world-seed-1739.zip" },
        ]);

        downloads.dispose();
    });

    it("reports a failure with the app's own sentence and says whether bytes survived", () => {
        const fake = fakeBridge();
        const downloads = createDownloads(fake.bridge);

        fake.emit({ type: "failed", downloadId: DOWNLOAD_ID, failure: failure(), at: "t9" });

        const row = only(downloads.rows.value);
        expect(row.state).toBe("failed");
        expect(row.failure?.message).toBe("The download could not be completed.");

        const advice = adviseOnDownloadFailure(row.failure ?? failure(), t);
        expect(advice.kind).toBe("network");
        expect(advice.resumable).toBe(true);
        expect(advice.explanation).toContain("continues from the byte it reached");
        expect(advice.detail).toContain("socket hang up");

        downloads.dispose();
    });

    it("has nowhere to put a refusal that happened before the download had an id", async () => {
        const refused: DownloadResult = {
            ok: false,
            downloadId: "",
            failure: failure({
                code: "asset-not-found",
                message: "The release has no download called 'world.zip'.",
                detail: "material-bluemap-setup.exe",
            }),
        };
        const fake = fakeBridge({ result: refused });
        const downloads = createDownloads(fake.bridge);

        await downloads.start({ owner: "owner", repo: "repo", asset: "world.zip" });

        expect(downloads.rows.value).toEqual([]);
        expect(downloads.startFailure.value?.code).toBe("asset-not-found");
        expect(adviseOnDownloadFailure(downloads.startFailure.value ?? failure(), t).kind).toBe("asset");

        downloads.dispose();
    });

    it("points a folder failure at the setting that owns the folder", () => {
        const advice = adviseOnDownloadFailure(
            failure({
                code: "storage-unwritable",
                message: "The download folder could not be written.",
                settings: { surface: "settings", anchor: "map-storage-directory", missing: false },
            }),
            t,
        );

        expect(advice.kind).toBe("storage");
        expect(advice.remedy.settings?.anchor).toBe("map-storage-directory");
        expect(advice.remedy.actionFallback).toBe("Change where downloads are written");
    });
});

describe("stopping one", () => {
    it("asks the main process, and says so while it waits", async () => {
        const fake = fakeBridge();
        const downloads = createDownloads(fake.bridge);
        fake.emit({
            type: "started",
            downloadId: DOWNLOAD_ID,
            asset: "test-world-seed-1739.zip",
            release: "v1.4.0",
            parts: 3,
            bytesTotal: 4_030_000_000,
            at: "t0",
        });

        const stopping = downloads.cancel(DOWNLOAD_ID);
        expect(only(downloads.rows.value).cancelling).toBe(true);
        expect(await stopping).toBe(true);
        expect(fake.cancelled).toEqual([DOWNLOAD_ID]);

        // The main process answers with the event, exactly as it does for a render.
        fake.emit({ type: "cancelled", downloadId: DOWNLOAD_ID, at: "t1" });
        const row = only(downloads.rows.value);
        expect(row.state).toBe("cancelled");
        expect(row.cancelling).toBe(false);

        downloads.dispose();
    });

    it("stops saying 'stopping' when nothing was running under that id", async () => {
        const fake = fakeBridge({ cancels: false });
        const downloads = createDownloads(fake.bridge);
        fake.emit({
            type: "started",
            downloadId: DOWNLOAD_ID,
            asset: "world.zip",
            release: "v1",
            parts: 1,
            bytesTotal: 10,
            at: "t0",
        });

        expect(await downloads.cancel(DOWNLOAD_ID)).toBe(false);
        expect(only(downloads.rows.value).cancelling).toBe(false);

        downloads.dispose();
    });

    it("refuses to stop a download that has already ended", async () => {
        const fake = fakeBridge();
        const downloads = createDownloads(fake.bridge);
        fake.emit({
            type: "started",
            downloadId: DOWNLOAD_ID,
            asset: "world.zip",
            release: "v1",
            parts: 1,
            bytesTotal: 10,
            at: "t0",
        });
        fake.emit({ type: "cancelled", downloadId: DOWNLOAD_ID, at: "t1" });

        expect(await downloads.cancel(DOWNLOAD_ID)).toBe(false);
        expect(fake.cancelled).toEqual([]);

        downloads.dispose();
    });
});

describe("reconciling with what is already there", () => {
    it("finds a download that was going before this surface existed", async () => {
        const fake = fakeBridge({
            active: async () => ["already-going-abc123"],
            list: async () => [],
        });
        const downloads = createDownloads(fake.bridge);

        await downloads.reconcile();

        const row = only(downloads.rows.value);
        expect(row.downloadId).toBe("already-going-abc123");
        expect(row.state).toBe("running");
        // Nothing is invented for it: only the id is known, and stopping it works from
        // the id alone while the name arrives with the next event.
        expect(row.asset).toBe("");
        expect(canResume(row)).toBe(false);

        fake.emit({
            type: "progress",
            downloadId: "already-going-abc123",
            phase: "downloading",
            task: progress({ bytesTotal: 900, bytesDone: 300, partsTotal: 1, partsDone: 0 }),
            at: "t1",
        });
        expect(only(downloads.rows.value).bytes).toBe(900);

        downloads.dispose();
    });

    it("reads back what is on disk, with where it came from", async () => {
        const fake = fakeBridge({ list: async () => [summary()] });
        const downloads = createDownloads(fake.bridge);

        await downloads.reconcile();

        const row = only(downloads.rows.value);
        expect(row.state).toBe("finished");
        expect(row.repository).toBe("owner/repo");
        expect(row.content).toBe("/var/maps/downloads/x/content");
        expect(requestFor(row)).toEqual({
            owner: "owner",
            repo: "repo",
            tag: "v1.4.0",
            asset: "test-world-seed-1739.zip",
        });

        downloads.dispose();
    });

    it("calls a record that says 'running' interrupted when nothing is running", async () => {
        const fake = fakeBridge({
            list: async () => [summary({ outcome: "running", finishedAt: null, durationMs: null })],
            active: async () => [],
        });
        const downloads = createDownloads(fake.bridge);

        await downloads.reconcile();

        const row = only(downloads.rows.value);
        expect(row.state).toBe("interrupted");
        expect(canResume(row)).toBe(true);

        downloads.dispose();
    });

    it("leaves a live row's progress alone and takes only what no event carries", async () => {
        const fake = fakeBridge({ list: async () => [summary()] });
        const downloads = createDownloads(fake.bridge);

        fake.emit({
            type: "started",
            downloadId: DOWNLOAD_ID,
            asset: "test-world-seed-1739.zip",
            release: "v1.4.0",
            parts: 3,
            bytesTotal: 4_030_000_000,
            at: "t0",
        });
        fake.emit({ type: "progress", downloadId: DOWNLOAD_ID, phase: "downloading", task: progress(), at: "t1" });

        await downloads.reconcile();

        const row = only(downloads.rows.value);
        // The record is a snapshot and says "finished"; the events are live and say it is
        // transferring. The live answer wins, and the repository the record alone knows is
        // taken from it.
        expect(row.state).toBe("running");
        expect(row.task?.bytesDone).toBe(1_700_000_000);
        expect(row.repository).toBe("owner/repo");

        downloads.dispose();
    });

    it("states a listing that did not happen rather than showing an empty list", async () => {
        const fake = fakeBridge({
            list: async () => {
                throw new Error("the downloads folder could not be read");
            },
        });
        const downloads = createDownloads(fake.bridge);

        await downloads.reconcile();

        expect(downloads.listFailure.value).toBe("the downloads folder could not be read");
        downloads.dispose();
    });

    it("puts what is happening now above what has already happened", async () => {
        const fake = fakeBridge({
            list: async () => [
                summary(),
                summary({ downloadId: "other", asset: "other.zip", outcome: "running", finishedAt: null }),
            ],
            active: async () => ["third"],
        });
        const downloads = createDownloads(fake.bridge);

        await downloads.reconcile();

        expect(downloads.rows.value.map((row) => row.state)).toEqual(["running", "interrupted", "finished"]);
        downloads.dispose();
    });
});

describe("a build that cannot download", () => {
    it("says so and does nothing, rather than offering a control that throws", async () => {
        const downloads = createDownloads(null);

        expect(downloads.available).toBe(false);
        expect(downloads.canCancel).toBe(false);
        expect(downloads.canList).toBe(false);
        expect(await downloads.discover({ owner: "owner", repo: "repo" })).toBeNull();
        expect(await downloads.start({ owner: "owner", repo: "repo", asset: "world.zip" })).toBeNull();
        expect(await downloads.cancel("anything")).toBe(false);
        await downloads.reconcile();
        expect(downloads.rows.value).toEqual([]);
        downloads.dispose();
    });

    it("is what a preload missing the pushed events resolves to", () => {
        const host = {
            discoverRelease: () => Promise.resolve({ ok: true as const, release: RELEASE }),
            startDownload: () => Promise.resolve({ ok: true } as unknown as DownloadResult),
        };
        vi.stubGlobal("materialBluemap", host);
        try {
            // A Download button that starts tens of minutes of invisible work is worse
            // than a surface that says the desktop app is needed.
            expect(resolveDownloadBridge()).toBeNull();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("keeps the half a preload does have, and reports the half it does not", async () => {
        const host = {
            discoverRelease: () => Promise.resolve({ ok: false as const, message: "no" }),
            startDownload: () => Promise.resolve({ ok: false } as unknown as DownloadResult),
            onDownloadEvent: () => () => undefined,
        };
        vi.stubGlobal("materialBluemap", host);
        try {
            const bridge = resolveDownloadBridge();
            expect(bridge).not.toBeNull();
            expect(bridge?.canCancel).toBe(false);
            expect(bridge?.canList).toBe(false);
            // Answered rather than thrown: nothing is running and nothing can be asked
            // lead to the same screen, and neither may invent a download.
            expect(await bridge?.cancelDownload("x")).toBe(false);
            expect(await bridge?.listDownloads()).toEqual([]);
            expect(await bridge?.activeDownloads()).toEqual([]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("is null when there is no preload at all", () => {
        expect(resolveDownloadBridge()).toBeNull();
    });
});

describe("reading a release", () => {
    it("lists what it offers, split assets and all", async () => {
        const fake = fakeBridge();
        const downloads = createDownloads(fake.bridge);

        const release = await downloads.discover({ owner: "owner", repo: "repo", tag: " " });

        expect(release?.tag).toBe("v1.4.0");
        expect(downloads.release.value?.downloads[0]?.parts).toBe(3);
        expect(downloads.discoveryFailure.value).toBeNull();
        downloads.dispose();
    });

    it("says why it could not, in the main process's own words", async () => {
        const fake = fakeBridge({
            discover: async () => ({ ok: false, message: "The release owner/repo@v9 could not be read." }),
        });
        const downloads = createDownloads(fake.bridge);

        await downloads.discover({ owner: "owner", repo: "repo", tag: "v9" });

        expect(downloads.release.value).toBeNull();
        expect(downloads.discoveryFailure.value).toBe("The release owner/repo@v9 could not be read.");
        downloads.dispose();
    });
});

describe("sizes, which are the one number that must never be rounded into a lie", () => {
    it("counts in the decimal units a release page and a manifest both use", () => {
        expect(formatBytes(1_700_000_000, t)).toBe("1.7 GB");
        expect(formatBytes(4_030_000_000, t)).toBe("4.03 GB");
        expect(formatBytes(91_400_000, t)).toBe("91.4 MB");
        expect(formatBytes(684, t)).toBe("684 B");
        expect(formatBytes(2_400_000_000_000, t)).toBe("2.4 TB");
    });

    it("does not eat the zeros out of a whole number of bytes", () => {
        // `1200 kB` trimmed as though it had a decimal point would read `12 kB`, which is
        // a hundredfold understatement of a download's size.
        expect(formatBytes(1_200_000_000_000_000, t)).toBe("1200 TB");
    });

    it("says nothing rather than something wrong when there is no total yet", () => {
        expect(transferText(null, t)).toBe("");
        expect(transferText(progress({ bytesTotal: 0 }), t)).toBe("");
        expect(partsText(progress({ partsTotal: 1 }), t)).toBe("");
        expect(etaText(progress({ etaText: null, etaSeconds: null }), t)).toBe("");
    });
});

describe("carrying one on", () => {
    it("refuses when the release it came from is not known", async () => {
        const fake = fakeBridge();
        const downloads = createDownloads(fake.bridge);
        await downloads.reconcile();

        const row: DownloadRow = {
            downloadId: "orphan",
            asset: "",
            repository: "",
            tag: "",
            state: "interrupted",
            phase: null,
            task: null,
            bytes: 0,
            parts: 1,
            split: false,
            archive: null,
            content: null,
            sha256: null,
            failure: null,
            startedAt: null,
            finishedAt: null,
            durationMs: null,
            live: false,
            cancelling: false,
            log: [],
        };

        expect(requestFor(row)).toBeNull();
        expect(canResume(row)).toBe(false);
        expect(await downloads.resume(row)).toBeNull();
        expect(fake.started).toEqual([]);

        downloads.dispose();
    });

    it("leaves the tag out when the record kept none, so `latest` still means latest", async () => {
        const fake = fakeBridge({ list: async () => [summary({ tag: "", outcome: "running", finishedAt: null })] });
        const downloads = createDownloads(fake.bridge);
        await downloads.reconcile();

        expect(requestFor(only(downloads.rows.value))).toEqual({
            owner: "owner",
            repo: "repo",
            asset: "test-world-seed-1739.zip",
        });

        downloads.dispose();
    });
});
