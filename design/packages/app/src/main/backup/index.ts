/**
 * Backing a render or a world up to GitHub, cheaply.
 *
 * ## Git LFS was rejected on cost, by name
 *
 * GitHub's own large-file storage is the obvious answer and the wrong one here. A free
 * account gets **1 GB of LFS storage and 1 GB of bandwidth a month**; every restore is
 * metered against that bandwidth, and past it you buy data packs. A rendered map or a
 * Minecraft world is routinely several gigabytes, so one backup exhausts the free tier
 * and every restore is billed again.
 *
 * The cheap route is **release assets**: free on a public repository, capped at 2 GB per
 * asset rather than in total, and unmetered to download. That is not a trick invented
 * here - it is the shipped `cheap-lfs` subsystem of the sibling application
 * `desktop-material`, whose pointer format this speaks exactly, so a backup made by
 * either application is a backup the other can read. See `pointer.ts` for the contract
 * and `docs/backup.md` for the whole design.
 *
 * ## What this folder does
 *
 * ```
 * source.ts      what may be backed up, and whether a folder really is one
 * archive.ts     packing a folder into one deterministic Zip64 archive, streamed
 * pointer.ts     the Cheap LFS v1 pointer: serialize, parse, and the bounds
 * sidecar.ts     backup.json - the facts a pointer must not carry
 * github.ts      the GitHub calls, and the append-only rule enforced by omission
 * workspace.ts   where a backup and a restore are staged on disk
 * runner.ts      pack, split, publish, upload, with progress, cancel and resume
 * restore.ts     read the pointer, fetch every part, rejoin, unpack - see below
 * catalog.ts     reading backups back out of a repository's releases
 * ipc.ts         the channel to the interface. The only file here that knows Electron
 * ```
 *
 * The split is `@worldlens/parts`, unchanged. The rejoin is too - `restore.ts`
 * translates the Cheap LFS pointer into that package's own manifest shape rather than
 * reimplementing per-part and whole-file verification a second time.
 *
 * This comment used to say the restore was `main/download/`, unchanged: "a backup restored
 * is a release downloaded, so the surface that already fetches parts, verifies each one,
 * rejoins them and unpacks is pointed at the backup release rather than duplicated." That
 * was never true, and nothing before `restore.ts` existed had exercised it against a real
 * release to find out. `main/download/` understands exactly one split format - a
 * `<name>.parts.json` manifest beside `<name>.001`, `<name>.002`, ... - and a backup's
 * parts are named `<archive>.<index>-<sha16>`, with no `.parts.json` ever published beside
 * them; the Cheap LFS pointer *is* the manifest, in a shape that has to stay byte-for-byte
 * what `desktop-material`'s own parser accepts. `main/download/`'s discovery does not
 * recognise a Cheap LFS release as a split download at all. See `restore.ts`'s own doc
 * comment for the full account, and `restore.test.ts` for a real `BackupRunner` upload
 * round-tripped through the real restorer it is now pointed at instead.
 *
 * `ipc.ts` is deliberately **not** re-exported here. Keeping the one Electron-importing
 * module off this barrel is what lets everything else be imported, and tested, without an
 * Electron runtime.
 */

export {
    ArchiveError,
    READ_CHUNK_BYTES,
    packFolder,
    readFolderContents,
} from "./archive.js";
export type { ArchiveEntry, ArchiveOptions, ArchiveProgress, ArchiveResult, FolderContents } from "./archive.js";

export { listBackups, toListing } from "./catalog.js";
export type { BackupListing } from "./catalog.js";

export {
    GITHUB_API_BASE,
    GITHUB_UPLOADS_BASE,
    GitHubCallError,
    REQUIRED_SCOPE,
    createBackupRelease,
    createRepository,
    findExistingAssets,
    findReleaseByTag,
    isRepositoryNameTakenError,
    listReleases,
    listWritableRepositories,
    parseRepositoryRecord,
    readRepository,
    readTextAsset,
    uploadAsset,
} from "./github.js";
export type {
    BackupRelease,
    CreateRepositoryRequest,
    FetchLike,
    GitHubCallOptions,
    ReleaseAssetInfo,
    RepositoryChoice,
    UploadOptions,
    UploadProgress,
} from "./github.js";

export {
    CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES,
    CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES,
    CHEAP_LFS_PART_SIZE_BYTES,
    CHEAP_LFS_POINTER_VERSION,
    POINTER_ASSET_SUFFIX,
    isCheapLfsPointerText,
    parseCheapLfsPointer,
    pointerTextSizeInBytes,
    readPointer,
    serializeCheapLfsPointer,
} from "./pointer.js";
export type {
    CheapLfsPointer,
    CheapLfsPointerPart,
    PointerReadFailure,
    PointerReadResult,
} from "./pointer.js";

export { BackupRunner, overallPercent, partAssetName } from "./runner.js";
export type {
    BackupEvent,
    BackupFailure,
    BackupPhase,
    BackupRequest,
    BackupResult,
    BackupRunnerOptions,
    BackupSummary,
    BackupTaskProgress,
    RepositoryReport,
} from "./runner.js";

export {
    BACKUP_SIDECAR_VERSION,
    MAX_SIDECAR_BYTES,
    SIDECAR_ASSET_NAME,
    parseSidecar,
    serializeSidecar,
} from "./sidecar.js";
export type { BackupSidecar } from "./sidecar.js";

export { archiveNameFor, inspectBackupSource, releaseTagFor } from "./source.js";
export type {
    BackupSource,
    BackupSourceKind,
    BackupSourceRefusal,
    BackupSourceResult,
} from "./source.js";

export {
    BACKUPS_DIRECTORY,
    RESTORES_DIRECTORY,
    backupIdFor,
    backupWorkspace,
    listBackupIds,
    pruneStagedPayload,
    restoreArchivePath,
    restoreIdFor,
    restoreWorkspace,
    stagedArchivePath,
    stagedPointerPath,
} from "./workspace.js";
export type { BackupWorkspace, RestoreWorkspace } from "./workspace.js";

export { BackupRestoreRunner, RestoreRefusal } from "./restore.js";
export type {
    BackupRestoreRunnerOptions,
    RestoreEvent,
    RestoreFailure,
    RestorePhase,
    RestoreRequest,
    RestoreResult,
    RestoreSummary,
    RestoreTaskProgress,
} from "./restore.js";
