/**
 * Where a render and the map web server actually run: on this computer, or in a container.
 *
 * The choice is the user's and local is the default. Everything here is written so that
 * choosing Docker changes *where* the engine runs and nothing else about how the app
 * behaves: the same config writer, the same log reader, the same progress signals, the
 * same cancellation, the same failure evidence.
 *
 * ```ts
 * import {
 *     containerName, planDockerLaunch, planLocalLaunch, probeDocker,
 *     writeEngineConfig, EngineProcess,
 * } from "./runtime/index.js";
 *
 * const docker = await probeDocker();          // honest about installed vs. not running
 * const launch = docker.status === "available" && mode === "docker"
 *     ? planDockerLaunch({ ... })
 *     : planLocalLaunch({ ... });
 * const run = new EngineProcess({ launch, onSignal });
 * const result = await run.start();            // identical shape either way
 * ```
 *
 * `ipc.ts` is the one module here that names Electron, and only as a type.
 *
 * `RuntimeRole` has a second value, `"web-server"`, that `planLocalLaunch` and
 * `planDockerLaunch` both still accept - it shapes the CLI's own `-w` flag and a published
 * port. Nothing in this app ever plans a launch with it: a rendered map is served by this
 * app's own embedded HTTP server (`LocalMapHandler`, mounted in `main/index.ts`) rather
 * than by keeping a second engine process alive as a web server. The class that would have
 * started and probed that second process (`WebServer`, in `webserver.ts`) was removed for
 * having no caller; see decision D19 in `design/docs/decisions.md`.
 */

export {
    COMMAND_TIMEOUT_MS,
    execFileCommandRunner,
    type CommandOptions,
    type CommandOutput,
    type CommandRunner,
} from "./command.js";

export {
    dockerImagePresent,
    dockerUsable,
    probeDocker,
    readDockerVersion,
    type DockerReport,
    type DockerStatus,
    type ProbeDockerOptions,
} from "./docker.js";

export {
    CONTAINER_CONFIG_DIR,
    CONTAINER_DATA_DIR,
    CONTAINER_JAR,
    CONTAINER_ROOT,
    CONTAINER_WEB_ROOT,
    MountRefusedError,
    checkMountSource,
    containerWorldPath,
    mountArgument,
    mountArguments,
    requireMountSource,
    type BindMount,
    type MountCheck,
    type MountSourceOptions,
} from "./mounts.js";

export {
    DEFAULT_DOCKER_IMAGE,
    DEFAULT_RUNTIME_MODE,
    DOCKER_STOP_GRACE_SECONDS,
    containerName,
    containerWorldPathFor,
    engineArguments,
    planDockerLaunch,
    planLocalLaunch,
    stopContainerArguments,
    type DockerLaunchOptions,
    type DockerPublish,
    type DockerWorld,
    type EngineArgumentOptions,
    type EngineLaunch,
    type LocalLaunchOptions,
    type RuntimeMode,
    type RuntimeRole,
} from "./plan.js";

export {
    CANCEL_GRACE_MS,
    EngineProcess,
    type EngineChildProcess,
    type EngineProcessOptions,
    type EngineRunResult,
    type SpawnEngine,
} from "./process.js";

export {
    attachArguments,
    decideReattach,
    inspectArguments,
    inspectContainer,
    listAppContainers,
    listArguments,
    readInspection,
    type ContainerInspection,
    type ContainerState,
    type InspectOptions,
    type ReattachAction,
    type ReattachDecision,
} from "./attach.js";

export {
    CONTAINER_HANDOFF_FILE,
    CONTAINER_HANDOFF_VERSION,
    ContainerHandoffStore,
    handoffFile,
    isHandedOff,
    listContainerHandoffs,
    newContainerHandoff,
    readContainerHandoff,
    writeContainerHandoff,
    type ContainerHandoff,
    type ContainerHandoffStatus,
    type ContainerHandoffStoreOptions,
    type ContainerMode,
    type NewHandoffInput,
    type RemoteHandoffTarget,
} from "./handoff.js";

export {
    CONTAINER_PREFIX,
    ContainerReattacher,
    localContainerAccess,
    localContainerList,
    type CollectReport,
    type ContainerAccess,
    type ContainerOffer,
    type ContainerReattacherOptions,
    type ContainerScan,
    type LocalContainerAccessOptions,
    type ReattachRefusalCode,
    type ReattachResult,
    type StrayContainer,
} from "./reattach.js";

export {
    engineStorageRoot,
    writeEngineConfig,
    type EngineMapRequest,
    type EngineWebServerSettings,
    type WriteEngineConfigOptions,
    type WrittenEngineConfig,
} from "./config.js";
