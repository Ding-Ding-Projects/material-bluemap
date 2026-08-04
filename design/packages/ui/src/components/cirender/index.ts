/**
 * Having GitHub's runners render a world this computer cannot.
 *
 * Mount {@link CiRenderScreen}. It resolves the Electron bridge itself, decides for itself
 * whether this build can start a CI render at all, adopts anything already in flight, and
 * shows each sync with the run's real per-job states.
 *
 * The shell is expected to do four things:
 *
 * - `rendered` is emitted when a map has been downloaded and registered. Select it in the
 *   map list; it is mounted exactly like a local render and needs no special case.
 * - `signIn` is emitted when a failure is one that signing in again would fix. Open the
 *   GitHub row in settings; pass `can-open-settings` so a button appears rather than a
 *   sentence naming where to go.
 * - `openConsent` is emitted when Mojang's licence has not been accepted. Open **that**
 *   row - the screen deliberately has no tick box of its own for a legal acceptance.
 * - `open` is emitted with a URL to show in the system browser.
 *
 * `worlds` is optional: pass what this machine already knows about and they are offered
 * beside the folder field rather than instead of it.
 */

export { default as CiRenderScreen } from "./CiRenderScreen.vue";

export { resolveCiRenderBridge } from "./ciRenderBridge.js";
export type {
    Answer,
    CiJobReport,
    CiPreflight,
    CiRenderBridge,
    CiRenderPlan,
    CiRoute,
    CiRunReport,
    CiRunStatus,
    CiSyncEvent,
    CiSyncFailure,
    CiSyncPhase,
    CiSyncRequest,
    CiSyncResult,
    CiSyncStage,
    CiSyncState,
    CiSyncSummary,
    GhAvailability,
    RepositoryReport,
    RouteReport,
} from "./ciRenderBridge.js";

export {
    LOG_LIMIT,
    createCiRenders,
    formatBytes,
    jobTone,
    phaseLabel,
    runLabel,
    uploadLine,
} from "./ciRenders.js";
export type { CiLogLine, CiRenders, CiRow, CiRowState } from "./ciRenders.js";
