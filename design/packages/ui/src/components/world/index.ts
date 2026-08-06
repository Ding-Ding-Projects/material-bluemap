/**
 * Making a map, and watching it render.
 *
 * Mount {@link WorldScreen}. It resolves the Electron bridge itself, decides for
 * itself whether this build can render locally, and shows the three stages of the
 * same job in turn: renders that were cut off and can be carried on, the wizard
 * that makes a new map, and the render that is running or has just ended.
 *
 * The shell is expected to do three things with what it emits. `consent` opens
 * the app's own Mojang download-consent setting; nothing in here ever asks for
 * that, because it is answered once at first launch and remembered. `settings`
 * carries the anchor a failed render says would fix it. `openMap` hands over the
 * folder a finished render wrote, so the viewer can load it.
 *
 * Everything else is exported for tests and for a shell that wants to compose the
 * steps itself.
 */

export { default as WorldScreen } from "./WorldScreen.vue";
export { default as WorldWizard } from "./WorldWizard.vue";
export { default as WorldFolderStep } from "./WorldFolderStep.vue";
export { default as SshWorldSourcePanel } from "./SshWorldSourcePanel.vue";
export { default as DockerWorldSourcePanel } from "./DockerWorldSourcePanel.vue";
export { default as MapIdentityStep } from "./MapIdentityStep.vue";
export { default as MapOptionsStep } from "./MapOptionsStep.vue";
export { default as MapStorageStep } from "./MapStorageStep.vue";
export { default as WizardReviewStep } from "./WizardReviewStep.vue";
export { default as RenderRunPanel } from "./RenderRunPanel.vue";
export { default as InterruptedRenders } from "./InterruptedRenders.vue";

export {
    describeWorld,
    describeWorldProblem,
    dimensionsIn,
    folderName,
    inspectWorldFolder,
    isAbsolutePath,
    parentFolder,
    uncheckedWorld,
    unreadableWorld,
} from "./worldFolder.js";
export type {
    Translate,
    WorldDimension,
    WorldFolderEntry,
    WorldFolderListing,
    WorldInspection,
    WorldProblem,
    WorldProblemCode,
    WorldProblemText,
} from "./worldFolder.js";

export {
    canInspectWorlds,
    probeWorldFolder,
    readStorageDirectory,
    resolveOptionalWorldBridge,
    resolveWorldBridge,
    writeStorageDirectory,
} from "./worldBridge.js";

export { resolveSshWorldSourceBridge, surveyLooksLikeWorld } from "./sshWorldSourceBridge.js";
export type {
    SshDetectAnswer,
    SshHostKeyOffer,
    SshRemoteHostKind,
    SshRemoteWorldEntry,
    SshRemoteWorldFetchResult,
    SshSurveyAnswer,
    SshWorldSourceBridge,
    SshWorldSourceEvent,
} from "./sshWorldSourceBridge.js";
export { resolveDockerWorldSourceBridge } from "./dockerWorldSourceBridge.js";
export type {
    DockerContainerDetail,
    DockerContainerSummary,
    DockerMount,
    DockerSourceRequest,
    DockerVolumeDetail,
    DockerVolumeSummary,
    DockerWorldEvent,
    DockerWorldFailure,
    DockerWorldFailureCode,
    DockerWorldFingerprint,
    DockerWorldFingerprintResult,
    DockerWorldListAnswer,
    DockerWorldSourceBridge,
} from "./dockerWorldSourceBridge.js";
export type {
    EngineDescription,
    InterruptedRenderMap,
    InterruptedRenderSummary,
    OptionalWorldBridge,
    RenderEvent,
    RenderFailure,
    RenderMapRequest,
    RenderRequest,
    RenderResult,
    RenderSummary,
    RenderTaskProgress,
    ResumeRefused,
    ResumeResult,
    SettingsTarget,
    StorageDirectoryBridge,
    WorldBridge,
    WorldProbeBridge,
} from "./worldBridge.js";

export {
    IDENTITY_STEP_PATHS,
    OWNED_BY_OTHER_STEPS,
    REQUEST_BACKED_PATHS,
    STORAGE_STEP_PATHS,
    WIZARD_STEPS,
    WIZARD_STEP_META,
    WORLD_STEP_PATHS,
    defaultOpenGroups,
    mapDescriptor,
    optionFields,
    optionGroups,
    reachesRender,
    stepOf,
} from "./wizardSteps.js";
export type { WizardOptionGroup, WizardStep, WizardStepMeta } from "./wizardSteps.js";

export {
    FALLBACK_DIMENSIONS,
    MAP_ID_MAX_LENGTH,
    MAP_ID_PATTERN,
    createMapWizard,
    fillProblem,
    folderLeaf,
    isValidMapId,
    suggestMapId,
} from "./wizardModel.js";
export type { MapWizard, MapWizardOptions, RunOptions, StepProblem } from "./wizardModel.js";

export {
    LOG_LIMIT,
    RENDER_PHASES,
    adviseOnFailure,
    classifyFailure,
    createRenderRun,
    formatDuration,
    phaseLabel,
} from "./renderRun.js";
export type {
    FailureAdvice,
    FailureKind,
    FailureRemedy,
    RenderLogLine,
    RenderRun,
    RunState,
} from "./renderRun.js";

export {
    createResumeOffers,
    describeInterruption,
    describeProgress,
    describeRefusal,
} from "./resumeOffers.js";
export type { ResumeOffers } from "./resumeOffers.js";
