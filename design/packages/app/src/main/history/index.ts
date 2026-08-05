/**
 * A local, Git-backed version history for every BlueMap config folder the editor opens.
 *
 * The contract this satisfies is short and every clause of it is load-bearing:
 *
 *  - **A repository per project, kept beside the application's own data.** Never a `.git`
 *    inside the folder the person chose. `store.ts` explains at length why that is the
 *    whole design rather than an implementation detail.
 *  - **Complete snapshots**, so a created, edited or deleted config file can be undone.
 *  - **A restore is itself a revision.** Nothing is ever rewritten, so an undo can be
 *    undone, and that undo undone in turn, for as long as anybody wants to keep going.
 *  - **Every revision says what changed**, not that something did. `describe.ts` is the
 *    whole of that, and it is pure so the wording is covered by ordinary tests.
 *  - **A failed history write never fails the user's save.** Nothing on the channel
 *    rejects; every failure is a value with a sentence in it.
 *  - **Local only.** No remote, no fetch, no push, and no channel that could accept one.
 *
 * ```ts
 * import { registerHistoryHandlers } from "./history/index.js";
 *
 * const history = registerHistoryHandlers(ipcMain, { dataDir: app.getPath("userData") });
 * ```
 *
 * Git is a dependency of the *machine*, not of this package: nothing was added to
 * `package.json`, the `git` binary is invoked through `child_process`, and a machine
 * without one is an honest state the editor reports rather than a crash it suffers.
 */

export {
    BASE_CONFIG,
    GIT_MAX_BUFFER,
    GIT_TIMEOUT_MS,
    HISTORY_AUTHOR_EMAIL,
    HISTORY_AUTHOR_NAME,
    isolationEnv,
    parseGitVersion,
    probeGit,
    runGit,
    type GitAvailability,
    type GitCommandOptions,
    type GitResult,
    type GitRunner,
} from "./git.js";

export {
    MAX_NAMED_FILES,
    describeChanges,
    describeFile,
    describeFileRestore,
    describeRestore,
    describeSettingRestore,
    joinNames,
    type ChangeDescription,
    type ChangeStatus,
    type FileChange,
    type HistoryAction,
} from "./describe.js";

export {
    APP_SETTINGS_HISTORY_DIRECTORY,
    HISTORY_DIRECTORY,
    INDEX_FILE,
    INDEX_VERSION,
    PROFILES_HISTORY_DIRECTORY,
    PROJECT_HISTORY_DIRECTORY,
    emptyIndex,
    folderSlug,
    historyRoot,
    projectId,
    readIndex,
    rememberProject,
    repositoryPath,
    writeIndex,
    type HistoryIndex,
    type HistoryProject,
} from "./store.js";

export {
    DEFAULT_REVISION_LIMIT,
    HISTORY_BRANCH,
    LABEL_NOTES_REF,
    MAX_READABLE_BYTES,
    MIN_RETAINED_REVISIONS,
    compareRevisions,
    configFolderSource,
    discardOlderRevisions,
    ensureRepository,
    listRevisions,
    mirrorInto,
    parseLog,
    parseStatus,
    readMirroredFile,
    readRevisionFiles,
    remoteNames,
    repoGit,
    restoreRevision,
    restoreRevisionFiles,
    restoreRevisionSettings,
    revisionDiff,
    setRevisionLabel,
    snapshotProject,
    type HistoryRevision,
    type HistorySource,
    type HistoryWrite,
    type MirrorFile,
    type RepoGit,
    type RestoreResult,
    type RevisionComparisonFile,
    type RevisionDiffFile,
    type RevisionFile,
    type SkippedFile,
    type SnapshotOverride,
} from "./repository.js";

export {
    HISTORY_CHANNELS,
    MAX_RESTORE_BYTES,
    historyListing,
    historyProjects,
    historySnapshot,
    historyStatus,
    registerHistoryHandlers,
    type HistoryIpc,
    type HistoryIpcOptions,
    type HistoryListing,
    type HistoryStatus,
    type RevisionCompareResult,
    type RevisionDiffResult,
    type RevisionFilesResult,
    type SettingRestoreFile,
} from "./ipc.js";
