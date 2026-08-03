/**
 * Getting a world or a rendered map out of a release.
 *
 * Mount {@link ReleaseDownloads}. It resolves the Electron bridge itself, decides for
 * itself whether this build can download at all, reconciles with whatever is already in
 * flight or already on disk, and shows every download as a row with real byte counts.
 *
 * The shell is expected to do two things. `use` is emitted with a folder that has been
 * downloaded, verified and unpacked, which is what the create-a-map wizard takes as its
 * world. The route to a settings row is *provided* rather than emitted, because the
 * surface is mounted several components deep: call {@link provideSettingsOpener} from
 * whatever screen knows how to open one, and a failure that a setting would fix offers a
 * button instead of a sentence.
 *
 * Everything else is exported for tests and for a surface that wants to compose the pieces
 * itself.
 */

export { default as ReleaseDownloads } from "./ReleaseDownloads.vue";
export { default as ReleaseAssetList } from "./ReleaseAssetList.vue";
export { default as DownloadRowCard } from "./DownloadRowCard.vue";

export { provideSettingsOpener, useSettingsOpener } from "./settingsOpener.js";
export type { SettingsOpener } from "./settingsOpener.js";

export { resolveDownloadBridge } from "./downloadBridge.js";
export type {
    AvailableAsset,
    DiscoveredRelease,
    DiscoveryResult,
    DownloadBridge,
    DownloadEvent,
    DownloadFailure,
    DownloadPhase,
    DownloadRequest,
    DownloadResult,
    DownloadSummary,
    DownloadTaskProgress,
    ReleaseCoordinates,
} from "./downloadBridge.js";

export {
    DEFAULT_RELEASE,
    LOG_LIMIT,
    adviseOnDownloadFailure,
    canResume,
    classifyDownloadFailure,
    createDownloads,
    etaText,
    formatBytes,
    partsText,
    phaseLabel,
    requestFor,
    transferText,
} from "./downloads.js";
export type {
    DownloadAdvice,
    DownloadFailureKind,
    DownloadLogLine,
    DownloadRemedy,
    DownloadRow,
    DownloadRowState,
    Downloads,
} from "./downloads.js";
