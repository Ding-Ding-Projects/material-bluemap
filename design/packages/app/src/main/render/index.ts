/**
 * Render orchestration: driving upstream BlueMap's engine and serving what it produces.
 *
 * Decisions D17 and D18 make local rendering run upstream's Java CLI, built from the
 * vendored source, driven by this app. This directory is the driving: it writes the
 * config the CLI reads, spawns it somewhere deliberate, turns its log into typed
 * progress, lets a person stop it, records which engine produced which map, and mounts
 * the result so the viewer opens a locally rendered map exactly as it opens a remote
 * one.
 *
 * ```ts
 * import { installRenderIpc, LocalMapHandler, upstreamJavaEngine } from "./render/ipc.js";
 *
 * const mounts = new LocalMapHandler();
 * server.addHandler(mounts);
 *
 * const render = installRenderIpc({
 *     storageDir: defaultStorageDirectory(app.getPath("userData")),
 *     mounts,
 *     resolveEngine: upstreamJavaEngine({ dataDir: app.getPath("userData") }),
 *     appVersion: app.getVersion(),
 * });
 * await render.restoreExisting();
 * ```
 *
 * `ipc.ts` is deliberately **not** re-exported here. It is the one module that imports
 * Electron and reads `consent.ts`; keeping it off this barrel is what lets everything
 * else be imported, and tested, without an Electron runtime.
 */

export {
    LineSplitter,
    RenderOutputTracker,
    classifyTaskDescription,
    parseEta,
    parseLogLine,
    parseProgress,
    type CliLogLevel,
    type CliLogLine,
    type RenderPhase,
    type RenderSignal,
    type RenderTaskKind,
    type RenderTaskProgress,
} from "./progress.js";

export {
    InvalidRenderRequestError,
    MAX_MAP_CONFIG_LENGTH,
    defaultRenderThreads,
    hoconString,
    isValidMapId,
    validateMaps,
    writeRenderConfig,
    type RenderConfigOptions,
    type RenderMapRequest,
    type WrittenRenderConfig,
} from "./config.js";

export {
    alreadyRunning,
    cancelled,
    cliFailed,
    cliJarMissing,
    consentRequired,
    failedBeforeSpawning,
    invalidRequest,
    javaUnavailable,
    noMapsRendered,
    spawnFailed,
    workspaceUnwritable,
    worldNotFound,
    type RenderFailure,
    type RenderFailureCode,
    type SettingsAnchor,
    type SettingsTarget,
} from "./failure.js";

export {
    CANCEL_GRACE_MS,
    CliRun,
    type CliRunOptions,
    type CliRunResult,
    type SpawnCli,
} from "./runner.js";

export {
    EngineUnavailableError,
    RenderOrchestrator,
    classifyRunFailure,
    type EngineDescription,
    type RenderCancelledEvent,
    type RenderEvent,
    type RenderFailedEvent,
    type RenderFailureResult,
    type RenderFinishedEvent,
    type RenderLogEvent,
    type RenderOrchestratorOptions,
    type RenderPhaseEvent,
    type RenderProgressEvent,
    type RenderRequest,
    type RenderResult,
    type RenderStartedEvent,
    type RenderSuccess,
    type ResolvedEngine,
} from "./orchestrator.js";

export { upstreamJavaEngine, type UpstreamEngineOptions } from "./engine.js";

export {
    RENDER_ENGINE_LABELS,
    RENDER_RECORD_VERSION,
    describeEngine,
    readRenderRecord,
    writeRenderRecord,
    type RenderEngineId,
    type RenderOutcome,
    type RenderRecord,
    type RenderedMapRecord,
} from "./provenance.js";

export {
    RENDER_SESSION_FILE,
    RENDER_SESSION_VERSION,
    RenderSessionStore,
    listRenderSessions,
    newRenderSession,
    readRenderSession,
    renderConfigFingerprint,
    sessionFile,
    writeRenderSession,
    type NewSessionInput,
    type RenderInterruptionReason,
    type RenderSession,
    type RenderSessionMap,
    type RenderSessionProgress,
    type RenderSessionStatus,
    type RenderSessionStoreOptions,
} from "./session.js";

export {
    describeInterrupted,
    findInterruptedRenders,
    isResumable,
    observedStatus,
    planResume,
    reconcile,
    resumeRequestFor,
    toInterruptedSummary,
    type FindInterruptedOptions,
    type InterruptedRender,
    type InterruptedRenderSummary,
    type PlanResumeOptions,
    type ResumeDecision,
    type ResumePlan,
    type ResumeRefusalCode,
    type ResumeRefused,
} from "./resume.js";

export { LocalMapHandler, type LocalMapMount } from "./LocalMapHandler.js";

export {
    defaultStorageDirectory,
    expandStorageDirectory,
    listRenderIds,
    renderIdForWorld,
    renderWorkspace,
    type RenderWorkspace,
} from "./workspace.js";
