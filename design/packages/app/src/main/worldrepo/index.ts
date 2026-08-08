/**
 * Keeping a Minecraft world in a git repository, so a render never has to re-zip it.
 *
 * ```
 * repo.ts   prepare, batch, lease, upload, read back, atomically publish, and resume
 * batches.ts deterministic byte planning and conservative Git-pack bounds
 * ipc.ts    the channel the interface drives it through, and the events it pushes back
 * ```
 *
 * See `repo.ts`'s own doc comment for why this reuses `pages/hosting.ts`'s orphan-commit
 * design almost unchanged and still gets incremental transfer out of it.
 */

export {
    DEFAULT_WORLD_BRANCH,
    GITHUB_FILE_LIMIT_BYTES,
    REPO_HEAVY_LIMIT_BYTES,
    REPO_SOFT_LIMIT_BYTES,
    STAGE_BATCH,
    WORLD_REPO_MARKER_FILE,
    WORLD_REPO_MARKER_TOOL,
    WORLD_REPO_MARKER_VERSION,
    WORLD_REPO_MAX_INTRODUCED_BYTES,
    WORLD_REPO_MAX_PUSH_BYTES,
    WORLD_REPO_PLANNING_TARGET_BYTES,
    WORLD_REPO_UPLOAD_MARKER_FILE,
    WorldRepoHost,
    WorldRepoRefusal,
    normaliseBranch,
    readWorldMarker,
    targetKey,
} from "./repo.js";

export type {
    WorldRepoEvent,
    WorldRepoFailure,
    WorldRepoHostOptions,
    WorldRepoMarker,
    WorldRepoOwner,
    WorldRepoPhase,
    WorldRepoPreflight,
    WorldRepoRecord,
    WorldRepoRemoveReport,
    WorldRepoRemoveResult,
    WorldRepoReport,
    WorldRepoRepositoryReport,
    WorldRepoSyncReport,
    WorldRepoSyncRequest,
    WorldRepoSyncResult,
    WorldRepoSyncStage,
    WorldRepoTarget,
} from "./repo.js";

export { WORLD_REPO_CHANNELS, WORLD_REPO_EVENT_CHANNEL, installWorldRepoIpc } from "./ipc.js";
export type { Answer, WorldRepoIpc, WorldRepoIpcOptions } from "./ipc.js";
