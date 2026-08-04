/**
 * Backing a world or a rendered map up to GitHub, cheaply.
 *
 * Mount {@link BackupScreen}. It resolves the Electron bridge itself, decides for itself
 * whether this build can back anything up, reconciles with whatever is already in flight,
 * and shows every backup as a row with real byte counts.
 *
 * The shell is expected to do three things:
 *
 * - `restore` is emitted with a release's coordinates. Hand it to the downloads surface,
 *   which already fetches parts, checks each one against its published SHA-256, rejoins
 *   them and unpacks the result. Restoring is not built here on purpose: a backup restored
 *   is a release downloaded, and a second downloader would be a second place for the
 *   verification to be got wrong.
 * - `signIn` is emitted when a failure is one that signing in again would fix. Open the
 *   GitHub row in settings; pass `can-open-settings` so the button appears rather than a
 *   sentence naming where to go.
 * - `open` is emitted with a URL to show in the system browser.
 *
 * `sources` is optional: pass what this machine already knows about - rendered maps from
 * the profiles list, worlds from the world catalog - and they are offered as a choice
 * beside the folder field rather than instead of it.
 */

export { default as BackupScreen } from "./BackupScreen.vue";
export { default as BackupRunCard } from "./BackupRunCard.vue";

export { resolveBackupBridge } from "./backupBridge.js";
export type {
    Answer,
    BackupBridge,
    BackupEvent,
    BackupFailure,
    BackupListing,
    BackupPhase,
    BackupRequest,
    BackupResult,
    BackupSourceKind,
    BackupSourceReport,
    BackupSummary,
    BackupTaskProgress,
    RepositoryChoice,
    RepositoryReport,
} from "./backupBridge.js";

export {
    LOG_LIMIT,
    canResume,
    createBackups,
    etaText,
    formatBytes,
    partsText,
    phaseLabel,
    transferText,
} from "./backups.js";
export type { BackupLogLine, BackupRow, BackupRowState, Backups } from "./backups.js";
