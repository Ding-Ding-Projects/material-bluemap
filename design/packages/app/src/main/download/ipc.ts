/**
 * The download channel between the main process and the interface.
 *
 * The twin of `render/ipc.ts`, deliberately built to the same shape: this is the only
 * file under `download/` that imports Electron, everything else takes what it needs as a
 * parameter, and every progress event is **pushed** rather than polled.
 *
 * The pushing is not a style choice. A twenty-gigabyte world is a download measured in
 * tens of minutes, and the capture the render bar was written against makes the point:
 * a bar that moves, a percentage and a shrinking estimate read as work in progress,
 * while a spinner for the same duration reads as a hang. People conclude a hang and
 * quit the application, which on a resumable download costs them nothing but the belief
 * that it worked.
 */

import { BrowserWindow, ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { readFile } from "node:fs/promises";
import { ReleaseDownloader } from "./downloader.js";
import type {
    DownloadEvent,
    DownloadRecord,
    DownloadRequest,
    DownloadResult,
} from "./downloader.js";
import type { AvailableDownload, FetchLike } from "./release.js";
import { downloadWorkspace, listDownloadIds } from "./workspace.js";

/** The channel every progress, phase, log and outcome event arrives on. */
export const DOWNLOAD_EVENT_CHANNEL = "download:event";

/** What a download's row in the interface shows. */
export interface DownloadSummary {
    readonly downloadId: string;
    readonly asset: string;
    readonly repository: string;
    readonly tag: string;
    readonly outcome: DownloadRecord["outcome"];
    readonly bytes: number;
    readonly parts: number;
    readonly split: boolean;
    readonly archive: string;
    readonly content: string | null;
    readonly startedAt: string;
    readonly finishedAt: string | null;
    readonly durationMs: number | null;
}

export interface DiscoveredRelease {
    readonly tag: string;
    readonly name: string;
    readonly htmlUrl: string;
    readonly downloads: readonly {
        readonly name: string;
        readonly split: boolean;
        readonly parts: number;
        readonly bytes: number;
    }[];
}

export interface DownloadIpcOptions {
    /**
     * Where downloads are written. A function, because the person can change it while
     * the application is running and a value captured here would keep writing to the
     * folder they moved away from.
     */
    readonly storageDir: () => string;
    /** Overridable so a test can watch what was broadcast. Defaults to every window. */
    readonly broadcast?: (event: DownloadEvent) => void;
    /** Overridable so a test never touches the network. */
    readonly fetch?: FetchLike;
    /**
     * The GitHub token, or null. Defaults to `GH_TOKEN` from the environment.
     *
     * Read every time rather than captured, and never required: a public release
     * downloads with no token at all, which is the case this exists to serve.
     */
    readonly token?: () => string | null | Promise<string | null>;
    /**
     * How many parts a download fetches at once. A function so a live Settings change
     * takes effect on the next download without a restart - see
     * `downloader.ts`'s own `ReleaseDownloaderOptions.concurrency`, which this passes
     * straight through.
     */
    readonly concurrency?: number | (() => number);
}

export interface DownloadIpc {
    readonly downloader: ReleaseDownloader;
    /** Every download already on disk, for the interface's list. */
    list(): Promise<DownloadSummary[]>;
    dispose(): void;
}

function broadcastToWindows(event: DownloadEvent): void {
    for (const window of BrowserWindow.getAllWindows()) {
        if (window.isDestroyed()) continue;
        window.webContents.send(DOWNLOAD_EVENT_CHANNEL, event);
    }
}

/** Every channel this module registers, so `dispose` cannot drift from `install`. */
const DOWNLOAD_CHANNELS = [
    "download:discover",
    "download:start",
    "download:cancel",
    "download:active",
    "download:list",
] as const;

export function installDownloadIpc(options: DownloadIpcOptions): DownloadIpc {
    const broadcast = options.broadcast ?? broadcastToWindows;
    const downloader = new ReleaseDownloader({
        storageDir: options.storageDir,
        onEvent: broadcast,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        token: options.token ?? (() => process.env["GH_TOKEN"] ?? null),
        ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
    });

    ipcMain.handle(
        "download:discover",
        async (
            _event: IpcMainInvokeEvent,
            request: { owner: string; repo: string; tag?: string },
        ) => {
            if (typeof request?.owner !== "string" || typeof request?.repo !== "string") {
                return { ok: false as const, message: "A repository owner and name are required." };
            }
            const found = await downloader.discover(request.owner, request.repo, request.tag);
            if (!found.ok) return { ok: false as const, message: found.failure.message };
            const release: DiscoveredRelease = {
                tag: found.release.tag,
                name: found.release.name,
                htmlUrl: found.release.htmlUrl,
                downloads: found.downloads.map(summariseAvailable),
            };
            return { ok: true as const, release };
        },
    );

    ipcMain.handle(
        "download:start",
        async (_event: IpcMainInvokeEvent, request: DownloadRequest): Promise<DownloadResult> =>
            await downloader.download(request),
    );

    ipcMain.handle("download:cancel", (_event: IpcMainInvokeEvent, downloadId: string) => {
        return typeof downloadId === "string" && downloader.cancel(downloadId);
    });

    ipcMain.handle("download:active", () => downloader.activeDownloadIds());

    ipcMain.handle("download:list", async () => await summarise(options.storageDir()));

    return {
        downloader,
        async list(): Promise<DownloadSummary[]> {
            return await summarise(options.storageDir());
        },
        dispose(): void {
            for (const channel of DOWNLOAD_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

function summariseAvailable(download: AvailableDownload): DiscoveredRelease["downloads"][number] {
    return {
        name: download.name,
        split: download.kind === "split",
        parts: download.kind === "split" ? download.parts.length : 1,
        bytes: download.bytes,
    };
}

async function summarise(storageDir: string): Promise<DownloadSummary[]> {
    const summaries: DownloadSummary[] = [];
    for (const downloadId of await listDownloadIds(storageDir)) {
        const record = await readDownloadRecord(
            downloadWorkspace(storageDir, downloadId).recordFile,
        );
        if (record === null) continue;
        summaries.push({
            downloadId: record.downloadId,
            asset: record.asset,
            repository: `${record.owner}/${record.repo}`,
            tag: record.tag,
            outcome: record.outcome,
            bytes: record.bytes,
            parts: record.parts,
            split: record.split,
            archive: record.archive,
            content: record.content,
            startedAt: record.startedAt,
            finishedAt: record.finishedAt,
            durationMs: record.durationMs,
        });
    }
    return summaries;
}

/** Null for a workspace with no record: an interrupted download, not an error. */
export async function readDownloadRecord(path: string): Promise<DownloadRecord | null> {
    try {
        const parsed = JSON.parse(await readFile(path, "utf8")) as DownloadRecord;
        return typeof parsed.downloadId === "string" ? parsed : null;
    } catch {
        return null;
    }
}
