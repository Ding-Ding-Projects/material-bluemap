/**
 * Binding a profile-list save to the version history that already exists.
 *
 * Nothing about revisions is re-invented here, exactly as `project/history.ts` re-invents
 * nothing: `../history/` owns the append-only rules, the isolation from the machine's git
 * configuration, the drift capture before a restore, and the rule that a failed history
 * write is a value rather than a rejection. This file is the adapter that lets all of it
 * operate on the profile list's own JSON file.
 *
 * ## Its own family of repositories
 *
 * Profile-list history lives under {@link PROFILES_HISTORY_DIRECTORY}, not beside the config
 * or project ones. A repository is a *complete* mirror - `mirrorInto` deletes whatever it was
 * not handed - so sharing a root with either of those would have every profiles save record
 * every config file's disappearance, and vice versa. A dedicated root makes that collision
 * impossible rather than merely unlikely.
 *
 * ## What "the folder" means here
 *
 * Every other history source is rooted on something a person chose - a config folder, a
 * world. There is exactly one profile list per installation, so {@link profilesFolder} is a
 * fixed location beside the application's data rather than a path a caller supplies, and it
 * is still passed through the same `folder` parameter every other source uses: one shape for
 * "where does this live" across the whole history system, rather than a special case for the
 * one source that happens to have no folder a person picked.
 */

import {
    ensureRepository,
    historyRoot,
    listRevisions,
    PROFILES_HISTORY_DIRECTORY,
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

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { PROFILES_FILE, parseProfilesState, profilesFolder, type ProfilesState } from "./store.js";
import { describeProfilesChange, describeProfilesRestore } from "./describe.js";

/** The text at `folder/profiles.json`, or "not there" told apart from "could not be read". */
async function readProfilesFileAt(folder: string): Promise<{ found: true; text: string } | { found: false }> {
    try {
        return { found: true, text: await readFile(join(folder, PROFILES_FILE), "utf8") };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { found: false };
        throw error;
    }
}

/**
 * The live profiles file seen as something a history can be taken of.
 *
 * `read` answers with no files when there is nothing on disk yet, rather than rejecting: a
 * fresh install with no profiles saved through this store is an ordinary state, and mirroring
 * it as an empty tree is what would record the moment it started being used, not an error.
 * It rejects only when the file is there and genuinely cannot be read, which must stop a
 * snapshot - mirroring an unreadable file as absent would tell the history it was deleted,
 * and a later restore would act on that lie.
 *
 * `read` records the raw text, not a re-serialised state, for the same reason
 * `project/history.ts`'s source does: what a snapshot has to preserve is what is actually on
 * disk, including a file a newer build wrote that this one cannot fully parse.
 */
export const profilesFileSource: HistorySource = {
    what: "profile list",
    read: async (folder) => {
        const found = await readProfilesFileAt(folder);
        return found.found ? { files: [{ path: PROFILES_FILE, text: found.text }] } : { files: [] };
    },
    check: (path) =>
        path === PROFILES_FILE
            ? { ok: true, path }
            : { ok: false, reason: `${path} is not the profile list file, so it was not written.` },
    write: async (folder, files) => {
        for (const file of files) {
            if (file.path !== PROFILES_FILE) throw new Error(`${file.path} is not the profile list file.`);
            await mkdir(folder, { recursive: true });
            const target = join(folder, PROFILES_FILE);
            const temporary = `${target}.tmp`;
            // Unguarded on purpose: these bytes came out of this installation's own history,
            // and `performRestore` has already recorded what was on disk before calling this.
            await writeFile(temporary, file.text, "utf8");
            await rename(temporary, target);
        }
    },
    remove: async (folder, paths) => {
        for (const path of paths) {
            if (path !== PROFILES_FILE) throw new Error(`${path} is not the profile list file.`);
            await rm(join(folder, PROFILES_FILE), { force: true });
        }
    },
};

export interface ProfilesHistoryOptions {
    /** Electron's `userData`. Repositories live beside it, never inside a user folder. */
    readonly dataDir: string;
    /**
     * How git is run. Injected so a test can reproduce a machine with no git on it, and a
     * git that fails halfway, without touching the machine running the suite.
     */
    readonly git?: GitRunner;
}

/** Where the profile list's history is kept. Pure: it creates nothing. */
export function profilesRepositoryPath(dataDir: string): string {
    return repositoryPath(dataDir, profilesFolder(dataDir), undefined, PROFILES_HISTORY_DIRECTORY);
}

/** The folder the profile list's history repository lives in. */
export function profilesHistoryRoot(dataDir: string): string {
    return historyRoot(dataDir, PROFILES_HISTORY_DIRECTORY);
}

/**
 * Everything a call needs, resolved once per call.
 *
 * Nothing is cached between calls, for the same reason `project/history.ts` caches nothing: a
 * person can install git, or delete the history folder, while the application is running, and
 * an answer computed at start-up would go on being wrong until a restart.
 */
async function open(
    options: ProfilesHistoryOptions,
): Promise<{ ok: true; git: RepoGit; repository: string } | { ok: false; message: string; repository: string }> {
    const run = options.git ?? runGit;
    const root = profilesHistoryRoot(options.dataDir);
    const repository = profilesRepositoryPath(options.dataDir);

    const availability = await probeGit(run, process.cwd());
    if (!availability.available) {
        return { ok: false, message: availability.reason ?? "Git is unavailable.", repository };
    }

    const git = repoGit(run, root, repository);
    const ready = await ensureRepository(git);
    if (!ready.ok) return { ok: false, message: ready.message, repository };

    return { ok: true, git, repository };
}

/** The profile list's history, as the panel receives it. */
export interface ProfilesHistoryListing {
    readonly available: boolean;
    /** Why there is no history, when there is none. Null when `available`. */
    readonly reason: string | null;
    /** Where the repository is. Shown so a person can see it is not their `localStorage`. */
    readonly repository: string;
    readonly revisions: readonly HistoryRevision[];
    /** The repository's remotes, which is expected to be empty. See `history/store.ts`. */
    readonly remotes: readonly string[];
}

/** Every revision of the profile list, newest first. */
export async function profilesHistoryListing(
    options: ProfilesHistoryOptions,
    limit?: number,
): Promise<ProfilesHistoryListing> {
    const opened = await open(options);
    if (!opened.ok) {
        return { available: false, reason: opened.message, repository: opened.repository, revisions: [], remotes: [] };
    }

    return {
        available: true,
        reason: null,
        repository: opened.repository,
        revisions: await listRevisions(opened.git, limit),
        remotes: await remoteNames(opened.git),
    };
}

/** The profile list as the newest revision recorded it, which is what a label compares against. */
async function previousProfilesState(git: RepoGit): Promise<{ state: ProfilesState | null; first: boolean }> {
    const [newest] = await listRevisions(git, 1);
    if (newest === undefined) return { state: null, first: true };

    const files = await readRevisionFiles(git, newest.id);
    if (!files.ok) return { state: null, first: false };

    const file = files.files.find((entry) => entry.path === PROFILES_FILE);
    if (file === undefined) return { state: null, first: false };

    return { state: parseProfilesState(file.text), first: false };
}

/**
 * Records the profile list as it is now.
 *
 * `after` is the state that was just written, used only to word the label; the snapshot
 * itself reads the file from disk, so what is recorded is what is genuinely there rather than
 * what the caller believes it wrote. Never rejects, and every failure is
 * `{ ok: false, message }` - the structural half of the rule that a failed history write must
 * never fail the save a person actually asked for.
 */
export async function recordProfilesRevision(
    options: ProfilesHistoryOptions,
    after: ProfilesState,
): Promise<HistoryWrite> {
    const opened = await open(options);
    if (!opened.ok) return { ok: false, message: opened.message };

    const previous = await previousProfilesState(opened.git);
    const described = describeProfilesChange({ before: previous.state, after, first: previous.first });

    const folder = profilesFolder(options.dataDir);
    const written = await snapshotProject(
        opened.git,
        folder,
        { label: described.label, action: described.action },
        profilesFileSource,
    );
    if (written.ok) {
        await rememberProject(options.dataDir, folder, written.revision?.at ?? null, undefined, PROFILES_HISTORY_DIRECTORY);
    }
    return written;
}

/**
 * Puts the profile list back as it was at one revision, and records *that* as a new revision.
 *
 * Straight through `../history/`'s own restore, so every property it guarantees holds here
 * unchanged: what is on disk is recorded before anything is written over it, nothing is
 * rewritten, and undoing this restore is another restore rather than a lost state.
 */
export async function restoreProfilesRevision(options: ProfilesHistoryOptions, id: string): Promise<RestoreResult> {
    const opened = await open(options);
    if (!opened.ok) return { ok: false, message: opened.message };

    const [target] = (await listRevisions(opened.git)).filter(
        (revision) => revision.id === id || revision.shortId === id,
    );
    const label = target === undefined ? undefined : describeProfilesRestore(target);

    const folder = profilesFolder(options.dataDir);
    const restored = await restoreRevision(opened.git, folder, id, profilesFileSource, label);
    if (restored.ok) {
        await rememberProject(options.dataDir, folder, restored.revision?.at ?? null, undefined, PROFILES_HISTORY_DIRECTORY);
    }
    return restored;
}
