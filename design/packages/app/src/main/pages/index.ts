/**
 * Hosting a locally rendered map on GitHub Pages.
 *
 * ```
 * hosting.ts   prepare, guard, stage, push, enable, wait, verify - and take it down again
 * ipc.ts       the channel the interface drives it through, and the events it pushes back
 * ```
 *
 * `hosting.ts` imports no Electron and holds no credential. `ipc.ts` takes `IpcMain` as a
 * parameter. Between them that is what lets the whole feature run in a plain Node test with
 * a fake process runner, which is the only way the interesting cases - `gh` missing, `gh`
 * signed out, a branch somebody else wrote, a push GitHub does not show - can be produced at
 * all on a machine where everything happens to work.
 *
 * The rule worth knowing before reading either file: **a branch that does not carry this
 * application's marker is never replaced and never deleted.** Publishing force-replaces the
 * publishing branch, because a republished map is a replacement and the history of a million
 * tiles is worth nothing, so that guard is the only thing standing between one mistyped
 * repository name and somebody else's website.
 */

export {
    DEFAULT_PAGES_BRANCH,
    DEFAULT_POLL_ATTEMPTS,
    DEFAULT_POLL_INTERVAL_MS,
    GIT_COMMAND,
    PAGES_MARKER_FILE,
    PAGES_MARKER_TOOL,
    PAGES_MARKER_VERSION,
    PagesHost,
    PagesRefusal,
    STAGE_BATCH,
    normaliseBranch,
    readMarker,
} from "./hosting.js";

export type {
    PagesCandidate,
    PagesEvent,
    PagesFailure,
    PagesHostOptions,
    PagesMarker,
    PagesOwner,
    PagesPhase,
    PagesPreflight,
    PagesPublishReport,
    PagesPublishStage,
    PagesPublishRequest,
    PagesRecord,
    PagesRepositoryReport,
    PagesResult,
    PagesSiteStatus,
    PagesStopReport,
    PagesStopResult,
    PagesTarget,
} from "./hosting.js";

export { PAGES_CHANNELS, PAGES_EVENT_CHANNEL, installPagesIpc } from "./ipc.js";
export type { Answer, PagesIpc, PagesIpcOptions } from "./ipc.js";
