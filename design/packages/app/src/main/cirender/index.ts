/**
 * CI render sync: having GitHub's runners render a world this computer cannot.
 *
 * ## Who this is for
 *
 * Somebody whose laptop cannot render their world. Rendering a large Minecraft world is
 * hours of CPU and gigabytes of disk, and on a thin machine it is hours of the fan at full
 * speed and nothing else usable. A GitHub runner has four cores, fourteen gigabytes of
 * free disk and no other job, and the **Render world** workflow already knows how to split
 * a world across a matrix of them and merge the result correctly.
 *
 * This folder is the loop that connects that workflow to the application, so the whole
 * thing is one action instead of five manual steps:
 *
 * ```
 * upload the world  ->  start the workflow  ->  follow the run  ->  fetch the map  ->  register it
 *   (backup/)            (actions.ts)           (sync.ts)           (download/)        (render/)
 * ```
 *
 * The map that comes back is mounted exactly like a local render and opens from the same
 * list. Nothing about it is a special case in the viewer.
 *
 * ## The trade-offs, because advertising without them wastes an afternoon
 *
 * - **Uploading is the slow part now.** A world has to reach GitHub before anything can
 *   render it, and on a domestic connection that is measured in hours, not minutes.
 * - **A private repository's Actions minutes are finite.** Public repositories get
 *   unlimited standard-runner minutes; private ones spend from a monthly allowance, and a
 *   sharded render spends one runner-minute per runner per minute.
 * - **There is a ceiling.** The workflow fetches one zip from a release, so a world whose
 *   archive would pass a release asset's 2 GiB limit cannot be dispatched at all. That is
 *   refused before anything is packed, with the reason.
 * - **A very large world can still exceed a job's budget**, and a map too large to
 *   assemble on one runner ships in parts that this collector deliberately refuses rather
 *   than half-unpacking.
 *
 * ## What this folder holds
 *
 * ```
 * actions.ts      the GitHub Actions calls: dispatch, find the run, read it, read a log
 * gh.ts           detecting and driving the `gh` command-line tool, the second credential
 * transport.ts    the two credential routes behind one interface, and how one is chosen
 * upload.ts       publishing the world: `backup/`'s packer, either route's transfer
 * fingerprint.ts  deciding cheaply whether the world changed since it was last uploaded
 * plan.ts         the world's own project file turned into the workflow's nine inputs
 * state.ts        what a sync remembers between attempts, so it can be resumed
 * collect.ts      fetching the run's artifact, checking it, and registering the map
 * sync.ts         the loop, its refusals, and its honest reporting
 * ipc.ts          the channel to the interface. The only file here that knows Electron
 * ```
 *
 * ## Two credentials, one chosen per sync
 *
 * A typical machine holds two GitHub sign-ins: this application's, and `gh`'s. They are
 * not interchangeable - `gh` routinely carries an enterprise host, an SSO session an
 * organisation has authorised, or scopes the in-app flow never asked for. The in-app one
 * is preferred when it can actually see the workflow; `gh` is a real fallback rather than
 * an error message. Whichever is chosen drives **every** call of that sync - the upload
 * included - and the choice is reported before the button rather than discovered from a 403.
 *
 * ## One packer, two transports
 *
 * Publishing the world used to be the one thing a `gh`-only machine could not do, because
 * the upload was delegated wholesale to the backup runner and so could only run on the
 * credential that runner holds. The line is now drawn between the packer and the transfer.
 * The archive, the split, the part names, the digests, the sidecar and the Cheap LFS
 * pointer are `main/backup/`'s, imported and not restated, so a world published on either
 * route is byte-for-byte the same backup. Only the four calls that *move* the bytes -
 * create the release, list what it holds, put an asset, read the repository - have two
 * implementations, and both sit behind `CiTransport`.
 *
 * The download and the unpack are `main/download/`, unchanged. The token is
 * `main/github/`, unchanged. The mount and the provenance record are `main/render/`,
 * unchanged. There is still no second packer, no second downloader and no second token
 * source anywhere in here.
 *
 * `ipc.ts` is deliberately **not** re-exported here. Keeping the one Electron-importing
 * module off this barrel is what lets everything else be imported, and tested, without an
 * Electron runtime.
 */

export {
    ActionsCallError,
    GITHUB_API_BASE,
    LOG_TAIL_LINES,
    RENDERED_MAP_ARTIFACT,
    RENDER_WORKFLOW_FILE,
    artifactDownloadHeaders,
    dispatchWorkflow,
    findDispatchedRun,
    listRunArtifacts,
    readDefaultBranch,
    readJobLogTail,
    readRun,
    readRunJobs,
} from "./actions.js";
export type {
    ActionsCallOptions,
    FetchLike,
    RunStatus,
    WorkflowArtifact,
    WorkflowJob,
    WorkflowRun,
} from "./actions.js";

export {
    GH_COMMAND,
    GH_LOGIN_COMMAND,
    detectGh,
    ghApiJson,
    ghApiPost,
    ghApiToFile,
    nodeProcessRunner,
} from "./gh.js";
export type {
    GhApiOptions,
    GhAvailability,
    GhStatus,
    ProcessResult,
    ProcessRunOptions,
    ProcessRunner,
    ProcessToFileResult,
} from "./gh.js";

export { ghTransport, resolveTransport, sessionTransport } from "./transport.js";
export type {
    CiAssetUpload,
    CiRelease,
    CiReleaseAsset,
    CiRepositoryFacts,
    CiRoute,
    CiTransport,
    CiUploadProgress,
    GhTransportOptions,
    ResolveTransportOptions,
    ResolvedTransport,
    RouteGhReport,
    RouteReport,
    SessionTransportOptions,
} from "./transport.js";

export { uploadWorldForRender } from "./upload.js";
export type {
    CiUploadEvent,
    CiUploadFailure,
    CiUploadRequest,
    CiUploadResult,
    CiUploadResume,
    CiUploadSummary,
} from "./upload.js";

export { collectRenderedMap } from "./collect.js";
export type { CollectFailure, CollectOptions, CollectResult, CollectSuccess } from "./collect.js";

export { FingerprintError, WORLD_FINGERPRINT_VERSION, fingerprintWorld, isUnchanged } from "./fingerprint.js";
export type { WorldFingerprint } from "./fingerprint.js";

export {
    DEFAULT_BUDGET_MINUTES,
    DEFAULT_MAX_JOBS,
    PROJECT_FILE_NAME,
    WORKFLOW_DIMENSIONS,
    chooseProjectMap,
    planCiRender,
    readProjectAt,
    settingsTheWorkflowCannotSee,
} from "./plan.js";
export type {
    ChooseMapResult,
    CiPlanRefusal,
    CiPlanResult,
    CiRenderOutput,
    CiRenderPlan,
    PlanInput,
    ProjectAtResult,
} from "./plan.js";

export {
    CI_SYNC_DIRECTORY,
    CI_SYNC_STATE_VERSION,
    ciRenderIdFor,
    ciSyncWorkspace,
    listCiSyncIds,
    newCiSyncState,
    readCiSyncState,
    syncIdFor,
    writeCiSyncState,
} from "./state.js";
export type { CiSyncStage, CiSyncState, CiSyncWorkspace, NewStateInput } from "./state.js";

export {
    CI_MAX_WORLD_BYTES,
    CI_UPLOAD_PART_SIZE_BYTES,
    CiRenderSync,
    firstUnsuccessfulJob,
} from "./sync.js";
export type {
    BackupSurface,
    CiJobReport,
    CiPreflight,
    CiRenderSyncOptions,
    CiRunReport,
    CiSyncEvent,
    CiSyncFailure,
    CiSyncPhase,
    CiSyncRequest,
    CiSyncResult,
    CiSyncSummary,
} from "./sync.js";

// The guided setup card's own data: owner choices, a name suggestion, and whether GitHub
// already has that name. See `setup.ts` for why each of the three answers what it does.
export {
    CI_REPOSITORY_NAME_FALLBACK,
    MAX_CI_REPOSITORY_NAME_LENGTH,
    checkCiRepositoryNameAvailability,
    listCiOwnerChoices,
    suggestCiRepositoryName,
} from "./setup.js";
export type {
    CheckCiRepositoryNameOptions,
    CiOwnerChoice,
    CiOwnerChoicesAnswer,
    CiOwnerChoicesOptions,
    CiRepositoryNameAvailability,
} from "./setup.js";
