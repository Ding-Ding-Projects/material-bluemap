/**
 * Chrome-style automatic updates for the installed Windows app.
 *
 * `electron-builder.config.cjs` has always built a Squirrel.Windows target, which emits the
 * `RELEASES` index and the full and delta `.nupkg` files that Electron's own `autoUpdater`
 * consumes - and until this directory existed, nothing consumed them. The installer shipped
 * an update mechanism and the app never asked it anything.
 *
 * ```ts
 * import { autoUpdater } from "electron";
 * import { engineFromAutoUpdater, installUpdateIpc, resolveFeed } from "./update/index.js";
 *
 * const updates = installUpdateIpc(ipcMain, {
 *     currentVersion: app.getVersion(),
 *     feed: resolveFeed({
 *         packaged: app.isPackaged,
 *         platform: process.platform,
 *         arch: process.arch,
 *         version: app.getVersion(),
 *         // Both values are baked in by build.mjs. The former repository is a bounded
 *         // bridge, not a dependency on a rename redirect.
 *         repository: __WORLDLENS_REPOSITORY__,
 *         legacyRepository: __WORLDLENS_LEGACY_REPOSITORY__,
 *         environment: process.env,
 *     }),
 *     engine: process.platform === "win32" ? engineFromAutoUpdater(autoUpdater) : null,
 *     feedHandoff: createFileUpdateFeedHandoff(app.getPath("userData")),
 *     renderInProgress: () => render.orchestrator.activeRenderIds().length > 0,
 *     broadcast: (state) => {
 *         for (const window of BrowserWindow.getAllWindows()) {
 *             if (!window.isDestroyed()) window.webContents.send(UPDATE_EVENT_CHANNEL, state);
 *         }
 *     },
 * });
 * ```
 *
 * `ipc.ts` is the only module here that names Electron at all, and it names it as a type.
 * Everything else - the feed rules, the state machine, the schedule, the failure
 * classification - is plain TypeScript with injected seams, so the whole subsystem is
 * tested with no Electron runtime, no update server, no Squirrel install and no network.
 */

export {
    classifyUpdateFailure,
    errorText,
    updateFailure,
    type UpdateFailure,
    type UpdateFailureCode,
} from "./failure.js";

export {
    FEED_DISABLE_VARIABLE,
    FEED_TOKEN_VARIABLE,
    FEED_URL_VARIABLE,
    describeFeed,
    isSecureFeedUrl,
    resolveFeed,
    type FeedConfiguration,
    type FeedDescription,
    type FeedInputs,
    type FeedResolution,
} from "./feed.js";

export {
    UPDATE_FEED_HANDOFF_FILE,
    createFileUpdateFeedHandoff,
    type UpdateFeedHandoff,
} from "./feedHandoff.js";

export {
    initialUpdateState,
    isReady,
    reduceUpdate,
    type UpdateEvent,
    type UpdateState,
    type UpdateStatus,
} from "./state.js";

export {
    CHECK_INTERVAL_MS,
    MAX_BACKOFF_MS,
    MIN_INTERVAL_MS,
    STARTUP_DELAY_MS,
    initialSchedule,
    nextCheckDelay,
    scheduleAfterFailure,
    scheduleAfterSuccess,
    type ScheduleState,
} from "./schedule.js";

export {
    UpdateController,
    engineFromAutoUpdater,
    type TimerHandle,
    type UpdateControllerOptions,
    type UpdateEngine,
    type UpdateProbeResult,
    type UpdateRestartRefusal,
    type UpdateRestartResult,
    type UpdateTimers,
} from "./controller.js";

export {
    UPDATE_CHANNELS,
    UPDATE_EVENT_CHANNEL,
    installUpdateIpc,
    registerUpdateHandlers,
    type InstalledUpdates,
    type UpdateIpc,
    type UpdateIpcOptions,
} from "./ipc.js";
