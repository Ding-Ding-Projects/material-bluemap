/**
 * Publishing a locally rendered map to GitHub Pages.
 *
 * Mount {@link PagesScreen}. It resolves the Electron bridge itself, decides for itself
 * whether this build can publish at all, lists the renders this computer has, and shows each
 * publish with real per-step numbers rather than a spinner.
 *
 * The shell is expected to do one thing: handle `open`, which is emitted with a URL to show in
 * the system browser. Everything else the screen does for itself, including the
 * super-confirmation gate in front of taking a site down and the non-blocking notices it
 * raises on the shared corner.
 *
 * The one rule worth knowing before reading any of it: **"GitHub says built" is not "live".**
 * Only a request to the published address that answered 200 turns this screen green.
 */

export { default as PagesScreen } from "./PagesScreen.vue";

export { resolvePagesBridge } from "./pagesBridge.js";
export type {
    Answer,
    GhAvailability,
    GhStatus,
    PagesBridge,
    PagesCandidate,
    PagesEvent,
    PagesFailure,
    PagesMarker,
    PagesOwner,
    PagesPhase,
    PagesPreflight,
    PagesPublishReport,
    PagesPublishRequest,
    PagesRecord,
    PagesRepositoryReport,
    PagesResult,
    PagesSiteStatus,
    PagesStopReport,
    PagesStopResult,
    PagesTarget,
    StaticHostMap,
    StaticHostReport,
} from "./pagesBridge.js";

export {
    LOG_LIMIT,
    createPagesHosting,
    formatBytes,
    phaseLabel,
    sizeLine,
    statusLabel,
    statusTone,
} from "./pagesHosting.js";
export type {
    PagesHosting,
    PagesLogLine,
    PagesProgress,
    PagesRow,
    PagesRowState,
} from "./pagesHosting.js";
