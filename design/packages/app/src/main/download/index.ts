/**
 * Downloading large worlds and rendered maps that were published in pieces.
 *
 * A GitHub release asset is capped at 2 GB, so anything larger is published as
 * `world.zip.001`, `world.zip.002`, ... beside a `world.zip.parts.json`. To a person
 * using the application that is one download called `world.zip`; everything that makes
 * it one lives here.
 *
 * `ipc.ts` is the only file in this folder that imports Electron. Everything else takes
 * what it needs as a parameter, which is what lets the release reader, the resumable
 * transfer, the extractor and the orchestrator be tested without an Electron runtime.
 */

export { ReleaseDownloader, estimateEta, formatEta } from "./downloader.js";
export type {
    DownloadCancelledEvent,
    DownloadEvent,
    DownloadFailedEvent,
    DownloadFailureResult,
    DownloadFinishedEvent,
    DownloadLogEvent,
    DownloadPhase,
    DownloadPhaseEvent,
    DownloadProgressEvent,
    DownloadRecord,
    DownloadRequest,
    DownloadResult,
    DownloadStartedEvent,
    DownloadSuccess,
    DownloadTaskProgress,
    ReleaseDownloaderOptions,
} from "./downloader.js";

export type { DownloadFailure, DownloadFailureCode } from "./failure.js";

export {
    GITHUB_API_BASE,
    ReleaseRequestError,
    apiHeaders,
    availableDownloads,
    fetchRelease,
    findDownload,
} from "./release.js";
export type {
    AvailableDownload,
    FetchLike,
    ReleaseAsset,
    ReleaseInfo,
    SplitDownload,
    WholeDownload,
} from "./release.js";

export { HttpDownloadError, downloadToFile, isAbort } from "./http.js";
export type { ResumableDownloadOptions, ResumableDownloadResult } from "./http.js";

export {
    ExtractError,
    UnsafeEntryError,
    asExtractError,
    extractZip,
    safeEntryPath,
} from "./extract.js";
export type { ExtractOptions, ExtractProgress, ExtractResult } from "./extract.js";

export { ZipFormatError, ZipReader, crc32 } from "./zip.js";
export type { ZipEntry } from "./zip.js";

export {
    DOWNLOADS_DIRECTORY,
    archivePath,
    downloadIdFor,
    downloadWorkspace,
    listDownloadIds,
    pruneParts,
} from "./workspace.js";
export type { DownloadWorkspace } from "./workspace.js";

export { DOWNLOAD_EVENT_CHANNEL, installDownloadIpc, readDownloadRecord } from "./ipc.js";
export type { DiscoveredRelease, DownloadIpc, DownloadIpcOptions, DownloadSummary } from "./ipc.js";
