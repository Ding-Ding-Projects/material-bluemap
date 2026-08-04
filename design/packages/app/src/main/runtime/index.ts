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
 *     writeEngineConfig, EngineProcess, WebServer,
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
    engineStorageRoot,
    writeEngineConfig,
    type EngineMapRequest,
    type EngineWebServerSettings,
    type WriteEngineConfigOptions,
    type WrittenEngineConfig,
} from "./config.js";

export {
    READY_POLL_MS,
    READY_TIMEOUT_MS,
    WebServer,
    freePort,
    tcpPortProbe,
    type PortProbe,
    type WebServerOptions,
    type WebServerStart,
} from "./webserver.js";
