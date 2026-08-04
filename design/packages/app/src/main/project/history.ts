/**
 * Binding a project save to the version history that already exists.
 *
 * Nothing about revisions is re-invented here. `history/` owns the append-only rules, the
 * isolation from the machine's git configuration, the drift capture before a restore, and
 * the rule that a failed history write is a value rather than a rejection. This file is the
 * adapter that lets all of it operate on a world's project file, and it is short because
 * that is the whole point: a second implementation would be the one that quietly stops
 * matching the first.
 *
 * ## The repository is never inside the world
 *
 * This is the clause that matters most, and a world folder makes it matter more than a
 * config folder did. Creating a `.git` inside somebody's world would put an object store
 * next to their region files, change what every backup tool and sync client sees, and grow
 * without bound beside the one directory a person cannot afford to have go wrong. So the
 * repository lives beside the application's own data, exactly as `history/store.ts`
 * describes, and the only thing this ever writes into the world is the project file itself.
 *
 * ## Its own family of repositories
 *
 * Project histories live under {@link PROJECT_HISTORY_DIRECTORY}, not beside the config
 * ones. A repository is a *complete* mirror - `mirrorInto` deletes whatever it was not
 * handed - so one repository holding both a config folder and a project would have each
 * snapshot record the other's disappearance. Two roots make that impossible rather than
 * unlikely, which it needs to be: the folder somebody points the config editor at and the
 * world they render are allowed to be the same directory.
 *
 * ## One revision per save
 *
 * A save records exactly one revision. A restore records two - what was on disk first, then
 * the restore itself - because a restore overwrites a state nobody chose to replace and the
 * safety net has to go up before the fall. A save is the person deliberately replacing what
 * they were looking at, so it needs no second row; the cost, stated plainly, is that a
 * project edited outside this app and then saved over inside it loses the outside edit from
 * the history. Restoring is where that case is defended, because that is where it happens.
 */

import {
    DEFAULT_REVISION_LIMIT,
    PROJECT_HISTORY_DIRECTORY,
    ensureRepository,
    historyRoot,
    listRevisions,
    probeGit,
    readRevisionFiles,
    rememberProject,
    remoteNames,
    repoGit,
    repositoryPath,
    restoreRevision,
    runGit,
    snapshotProject,
    type GitRunner,
    type HistoryRevision,
    type HistorySource,
    type HistoryWrite,
    type RepoGit,
    type RestoreResult,
} from "../history/index.js";

import { PROJECT_FILE_NAME, parseProjectFile, type ProjectFile } from "@material-bluemap/config";

import { describeProjectChange, describeProjectRestore } from "./describe.js";
import { checkProjectPath, deleteProject, readProjectText, writeProjectText } from "./file.js";

/**
 * The world folder seen as something a history can be taken of.
 *
 * `read` answers with no files when there is no project, rather than rejecting, because a
 * world without a project is an ordinary state and mirroring it as an empty tree is what
 * records the moment a project was deleted. It rejects only when the file is there and will
 * not open, which must stop a snapshot: mirroring an unreadable project as absent would tell
 * the history the project was deleted, and a later restore would act on that lie.
 *
 * `read` deliberately records the *raw text*, not a re-serialised project. What a snapshot
 * has to preserve is what is actually in the world - including comments, spacing, and a file
 * a newer app wrote that this build cannot parse - so that restoring gives back the file
 * somebody had rather than this build's best impression of it.
 */
export const projectFileSource: HistorySource = {
    what: "project file",
    read: async (worldFolder) => {
        const bytes = await readProjectText(worldFolder);
        if (bytes.ok) return { files: [{ path: PROJECT_FILE_NAME, text: bytes.text }] };
        if (bytes.failure.kind === "absent") return { files: [] };
        throw new Error(
            bytes.failure.kind === "unreadable"
                ? bytes.failure.message
                : `${bytes.path} could not be read as a project file.`,
        );
    },
    check: checkProjectPath,
    write: async (worldFolder, files) => {
        for (const file of files) {
            const checked = checkProjectPath(file.path);
            if (!checked.ok) throw new Error(checked.reason);
            // Unguarded on purpose: these bytes came out of this world's own history, and
            // `performRestore` has already recorded what is on disk before calling this, so
            // the state being written over is recoverable. The guard on an ordinary save
            // exists because there is no such record.
            const written = await writeProjectText(worldFolder, file.text);
            if (!written.ok) throw new Error(written.reason);
        }
    },
    remove: async (worldFolder, paths) => {
        for (const path of paths) {
            const checked = checkProjectPath(path);
            if (!checked.ok) throw new Error(checked.reason);
            const removed = await deleteProject(worldFolder);
            if (!removed.ok) throw new Error(removed.reason);
        }
    },
};

export interface ProjectHistoryOptions {
    /** Electron's `userData`. Repositories live beside it, never inside a world. */
    readonly dataDir: string;
    /**
     * How git is run. Injected so a test can reproduce a machine with no git on it, and a
     * git that fails halfway, without touching the machine running the suite.
     */
    readonly git?: GitRunner;
}

/** Where a world's project history is kept. Pure: it creates nothing. */
export function projectRepositoryPath(dataDir: string, worldFolder: string): string {
    return repositoryPath(dataDir, worldFolder, undefined, PROJECT_HISTORY_DIRECTORY);
}

/** The folder every project history lives in, beside the application's own data. */
export function projectHistoryRoot(dataDir: string): string {
    return historyRoot(dataDir, PROJECT_HISTORY_DIRECTORY);
}

/**
 * Everything a call needs, resolved once per call.
 *
 * Nothing is cached between calls, for the same reason `history/ipc.ts` caches nothing: a
 * person can install git, or delete the history folder, while the application is running,
 * and an answer computed at start-up would go on being wrong until a restart.
 */
async function open(
    options: ProjectHistoryOptions,
    worldFolder: string,
): Promise<{ ok: true; git: RepoGit; repository: string } | { ok: false; message: string; repository: string }> {
    const run = options.git ?? runGit;
    const root = projectHistoryRoot(options.dataDir);
    const repository = projectRepositoryPath(options.dataDir, worldFolder);

    // Probed from the working directory rather than from the repository, because the
    // repository may not exist yet and `execFile` refuses a working directory that is not
    // there - which would report "git is missing" on a machine that has it.
    const availability = await probeGit(run, process.cwd());
    if (!availability.available) {
        return { ok: false, message: availability.reason ?? "Git is unavailable.", repository };
    }

    const git = repoGit(run, root, repository);
    const ready = await ensureRepository(git);
    if (!ready.ok) return { ok: false, message: ready.message, repository };

    return { ok: true, git, repository };
}

/** One project's history, as the panel receives it. */
export interface ProjectHistoryListing {
    readonly available: boolean;
    /** Why there is no history, when there is none. Null when `available`. */
    readonly reason: string | null;
    readonly worldFolder: string;
    /** Where the repository is. Shown so a person can see it is not inside their world. */
    readonly repository: string;
    readonly revisions: readonly HistoryRevision[];
    /**
     * The repository's remotes, which is expected to be empty.
     *
     * Sent so the interface can state that this history is local rather than assert it. A
     * project history mirrors a file from inside somebody's world; it is never pushed.
     */
    readonly remotes: readonly string[];
}

/** Every revision of one world's project, newest first. */
export async function projectHistoryListing(
    options: ProjectHistoryOptions,
    worldFolder: string,
    limit = DEFAULT_REVISION_LIMIT,
): Promise<ProjectHistoryListing> {
    const opened = await open(options, worldFolder);
    if (!opened.ok) {
        return {
            available: false,
            reason: opened.message,
            worldFolder,
            repository: opened.repository,
            revisions: [],
            remotes: [],
        };
    }

    return {
        available: true,
        reason: null,
        worldFolder,
        repository: opened.repository,
        revisions: await listRevisions(opened.git, limit),
        remotes: await remoteNames(opened.git),
    };
}

/**
 * The project as the newest revision recorded it, which is what a label compares against.
 *
 * The newest *revision* rather than what was on disk a moment ago, because the commit this
 * label goes on is a diff against that revision. Taking the "before" from disk would let the
 * two disagree whenever something changed the file outside the app - and a row whose words
 * contradict its own diff is worse than a row that says nothing.
 *
 * A revision this build cannot parse yields null rather than throwing. That is a real case:
 * a project written by a newer app, snapshotted as raw text exactly as it should have been.
 * The label then falls back to the "created" wording, which is imprecise and honest, where
 * failing the save would not be either.
 */
async function previousProject(git: RepoGit): Promise<{ project: ProjectFile | null; first: boolean }> {
    const [newest] = await listRevisions(git, 1);
    if (newest === undefined) return { project: null, first: true };

    const files = await readRevisionFiles(git, newest.id);
    if (!files.ok) return { project: null, first: false };

    const project = files.files.find((file) => file.path === PROJECT_FILE_NAME);
    if (project === undefined) return { project: null, first: false };

    const parsed = parseProjectFile(project.text);
    return { project: parsed.ok ? parsed.project : null, first: false };
}

/**
 * Records the world's project file as it is now.
 *
 * `after` is the project that was just written, used only to word the label. The snapshot
 * itself reads the file from disk, so what is recorded is what is genuinely there rather
 * than what the caller believes it wrote.
 *
 * Never rejects, and every failure is `{ ok: false, message }`. That is the structural half
 * of the rule that a failed history write must never fail a save: a caller cannot forget to
 * handle a value the way it can forget to catch a rejection.
 */
export async function recordProjectRevision(
    options: ProjectHistoryOptions,
    worldFolder: string,
    after: ProjectFile | null,
): Promise<HistoryWrite> {
    const opened = await open(options, worldFolder);
    if (!opened.ok) return { ok: false, message: opened.message };

    const previous = await previousProject(opened.git);
    const described = describeProjectChange({ before: previous.project, after, first: previous.first });

    const written = await snapshotProject(
        opened.git,
        worldFolder,
        { label: described.label, action: described.action },
        projectFileSource,
    );
    if (written.ok) {
        await rememberProject(
            options.dataDir,
            worldFolder,
            written.revision?.at ?? null,
            undefined,
            PROJECT_HISTORY_DIRECTORY,
        );
    }
    return written;
}

/**
 * Puts the project back as it was at one revision, and records *that* as a new revision.
 *
 * Straight through `history/`'s own restore, so every property it guarantees holds here
 * unchanged: what is on disk is recorded before anything is written over it, nothing is
 * rewritten, and undoing this restore is another restore rather than a lost state. The only
 * thing supplied here is the sentence, because `describeRestore` says "the config" and this
 * is not one.
 */
export async function restoreProjectRevision(
    options: ProjectHistoryOptions,
    worldFolder: string,
    id: string,
): Promise<RestoreResult> {
    const opened = await open(options, worldFolder);
    if (!opened.ok) return { ok: false, message: opened.message };

    const [target] = (await listRevisions(opened.git)).filter(
        (revision) => revision.id === id || revision.shortId === id,
    );
    const label = target === undefined ? undefined : describeProjectRestore(target);

    const restored = await restoreRevision(opened.git, worldFolder, id, projectFileSource, label);
    if (restored.ok) {
        await rememberProject(
            options.dataDir,
            worldFolder,
            restored.revision?.at ?? null,
            undefined,
            PROJECT_HISTORY_DIRECTORY,
        );
    }
    return restored;
}
