/**
 * Rendering on a machine that is better at it than this one.
 *
 * A world goes over SSH to a Linux host, a container renders it there, and the map comes
 * back. The interface reports it exactly as it reports a local render, because it *is* the
 * local reporting: the same `RenderEvent` union, the same `RenderOutputTracker`, the same
 * `EngineProcess`, the same cancellation.
 *
 * ```ts
 * import {
 *     RemoteRenderOrchestrator, registerRemoteHandlers, validateTarget, preflight,
 * } from "./remote/index.js";
 *
 * const orchestrator = new RemoteRenderOrchestrator({
 *     storageDir: () => render.storageDirectory(),
 *     resolveEngine,
 *     hasConsent: hasAcceptedDownload,
 *     onEvent: broadcastRenderEvent,          // the SAME channel a local render uses
 *     knownHostsFile: join(app.getPath("userData"), "known_hosts"),
 *     userKnownHostsFile: join(homedir(), ".ssh", "known_hosts"),
 * });
 * const remote = registerRemoteHandlers(ipcMain, {
 *     orchestrator,
 *     knownHostsFile: join(app.getPath("userData"), "known_hosts"),
 * });
 * ```
 *
 * ## What this folder will not do
 *
 * - **ask for or store a password.** There is no field for one and the SSH options make the
 *   client refuse one even when a host offers it. Authentication is an agent or a key file
 *   named by path; no key is ever read, copied or written by this app.
 * - **trust an unknown host key.** `StrictHostKeyChecking=yes`, always. An unknown key is a
 *   refusal with fingerprints attached for the person to compare; a *changed* key is a
 *   refusal with no button at all.
 * - **leave a copy of somebody's world on a server without saying so.** The staging
 *   directory is removed when the render ends - succeeded, failed or cancelled - and the
 *   one setting that keeps it says out loud what it keeps.
 *
 * `ipc.ts` is the one module here that names Electron, and only as a type. Everything else
 * takes its command runner, its transfer and its preflight as parameters, which is what
 * lets the whole flow be tested with no SSH client, no container runtime and no network.
 */

export {
    cancelled,
    authRefused,
    dockerDaemonDown,
    dockerMissing,
    dockerRefused,
    dockerUnusable,
    hostKeyChanged,
    hostKeyUnavailable,
    hostKeyUnknown,
    invalidTarget,
    notEnoughDisk,
    remoteCommandFailed,
    renderFailed,
    sshMissing,
    transferFailed,
    unreachable,
    type RemoteFailure,
    type RemoteFailureCode,
} from "./failure.js";

export {
    DEFAULT_REMOTE_IMAGE,
    DEFAULT_SSH_PORT,
    DEFAULT_WORK_DIR,
    checkWorkDir,
    describeTarget,
    destination,
    validateTarget,
    type PartialRemoteTarget,
    type RemoteTarget,
    type TargetCheck,
} from "./target.js";

export {
    CONNECT_TIMEOUT_SECONDS,
    classifySshOutput,
    firstLine,
    quoteForRemoteShell,
    quoteRemotePath,
    remoteCommandLine,
    scpArguments,
    scpRemotePath,
    sshArguments,
    sshCommandRunner,
    sshScriptArguments,
    sshSecurityOptions,
    type SshOptionsInput,
    type SshOutcome,
    type SshRunnerOptions,
} from "./ssh.js";

export {
    describeOffers,
    fingerprintOf,
    parseKeyscan,
    recordedFor,
    scanHostKeys,
    trustHostKey,
    type HostKeyOffer,
    type HostKeyOptions,
} from "./hostkey.js";

export {
    preflight,
    readDfAvailableBytes,
    resolveWorkDir,
    type PreflightCheck,
    type PreflightOptions,
    type PreflightReport,
    type PreflightStage,
} from "./preflight.js";

export {
    TransferError,
    parentOf,
    scpTransfer,
    type FileTransfer,
    type ScpTransferOptions,
    type TransferOptions,
} from "./transfer.js";

export {
    chooseTransfer,
    probeRsync,
    rsyncArguments,
    rsyncShellCommand,
    rsyncTransfer,
    withScpFallback,
    type ChooseTransferOptions,
    type RsyncOptions,
    type RsyncSupport,
    type RsyncTransferOptions,
    type TransferChoice,
    type TransferKind,
} from "./rsync.js";

export {
    containerAccessFor,
    remoteContainerAccess,
    targetFromRecord,
    type RemoteContainerAccessOptions,
} from "./reattach.js";

export {
    remoteContainerName,
    remoteDockerRunArguments,
    remotePaths,
    remoteStopArguments,
    remoteWorldPath,
    type RemoteDockerRunOptions,
    type RemoteRenderPaths,
} from "./plan.js";

export {
    RemoteRenderOrchestrator,
    type RemoteRenderFailureResult,
    type RemoteRenderOrchestratorOptions,
    type RemoteRenderRequest,
    type RemoteRenderResult,
    type RemoteRenderSuccess,
} from "./orchestrator.js";

export { encodePowerShellCommand, powershellRemoteCommand, quoteForPowerShell } from "./windowsShell.js";

export {
    checkRemoteWorldPath,
    connectAndDetectHost,
    diffRemoteWorldSurveys,
    fetchRemoteWorld,
    probeRsync as probeRsyncForWorldSource,
    remoteWorldChanged,
    surveyRemoteWorld,
    type ConnectResult,
    type RemoteHostDetection,
    type RemoteHostKind,
    type RemoteWorldChanges,
    type RemoteWorldEntry,
    type RemoteWorldFetchOptions,
    type RemoteWorldFetchResult,
    type RemoteWorldPathCheck,
    type RemoteWorldSshOptions,
    type RemoteWorldSurvey,
} from "./worldsource.js";

export {
    REMOTE_CHANNELS,
    disclosureFor,
    registerRemoteHandlers,
    type RemoteDisclosure,
    type RemoteIpc,
    type RemoteIpcOptions,
    type TrustAnswer,
    type ValidateAnswer,
} from "./ipc.js";

export {
    REMOTE_HOSTING_CONTAINER_PORT,
    publishBindAddress,
    remoteHostingContainerName,
    remoteHostingStatusArguments,
    remoteHostingTeardownArguments,
    remoteServeDockerRunArguments,
    type RemoteHostingBindMode,
    type RemoteHostingPublish,
    type RemoteServeDockerRunOptions,
} from "./hostplan.js";

export {
    RemoteHostingOrchestrator,
    type RemoteHostEvent,
    type RemoteHostFailureResult,
    type RemoteHostPhase,
    type RemoteHostRequest,
    type RemoteHostResult,
    type RemoteHostStopReport,
    type RemoteHostStopResult,
    type RemoteHostSuccess,
    type RemoteHostingOrchestratorOptions,
    type RemoteHostingRecord,
    type RemoteHostingStatus,
} from "./hosting.js";

export {
    REMOTE_HOSTING_CHANNELS,
    REMOTE_HOSTING_EVENT_CHANNEL,
    registerRemoteHostingHandlers,
    type RemoteHostingIpc,
    type RemoteHostingIpcOptions,
} from "./hostingIpc.js";
