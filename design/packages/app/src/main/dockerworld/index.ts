/**
 * Reaching a world that lives in Docker: a bind-mounted host folder, a named volume, or a
 * copy out of a running or stopped container.
 *
 * ```ts
 * import { DockerWorldFetcher, registerDockerWorldHandlers } from "./dockerworld/index.js";
 *
 * const fetcher = new DockerWorldFetcher({ onEvent: broadcastDockerWorldEvent });
 * const dockerWorld = registerDockerWorldHandlers(ipcMain, { fetcher });
 * ```
 *
 * See the module doc comments in `inventory.ts`, `resolve.ts`, `copy.ts`, `fetch.ts` and
 * `change.ts` for the reasoning behind each piece, and `docs/docker-world-source.md` for the
 * feature as a whole - what is reachable from the desktop app today, what is proven only at
 * the module level, and the safety rule around a world a running server may still be
 * writing to.
 */

export {
    inspectContainer,
    inspectVolume,
    listContainers,
    listVolumes,
    type DockerContainerDetail,
    type DockerContainerSummary,
    type DockerInventoryOptions,
    type DockerMount,
    type DockerVolumeDetail,
    type DockerVolumeSummary,
    type InventoryResult,
} from "./inventory.js";

export {
    candidateMounts,
    livenessWarning,
    remoteDirectoryExists,
    resolveContainerMount,
    resolveVolume,
    type DockerWorldCandidate,
    type DockerWorldRoute,
    type ResolveOptions,
} from "./resolve.js";

export {
    copyRemoteBindMount,
    dockerCopyToStaging,
    localIncrementalCopy,
    volumeCopyToStaging,
    type CopyProgress,
    type CopyResult,
    type DockerReadOptions,
} from "./copy.js";

export {
    DockerWorldFetcher,
    dockerWorldFetchId,
    type DockerSourceRequest,
    type DockerWorldEvent,
    type DockerWorldFetchRequest,
    type DockerWorldFetchResult,
    type DockerWorldFetcherOptions,
    type DockerWorldFingerprintResult,
} from "./fetch.js";

export {
    dockerWorldFingerprint,
    fingerprintsEqual,
    localWorldFingerprint,
    remoteWorldFingerprint,
    type FingerprintOptions,
    type RegionFingerprint,
    type WorldFingerprint,
} from "./change.js";

export {
    cancelled,
    containerNotFound,
    copyFailed,
    daemonUnreachable,
    invalidRequest,
    liveWorldNotAcknowledged,
    notAWorld,
    notInstalled,
    refused,
    storageUnwritable,
    unusable,
    volumeNotFound,
    type DockerWorldFailure,
    type DockerWorldFailureCode,
} from "./failure.js";

export {
    DOCKERWORLD_CHANNELS,
    DOCKERWORLD_EVENT_CHANNEL,
    registerDockerWorldHandlers,
    type DockerContainerAnswer,
    type DockerVolumeAnswer,
    type DockerWorldIpc,
    type DockerWorldIpcOptions,
    type DockerWorldListAnswer,
} from "./ipc.js";
