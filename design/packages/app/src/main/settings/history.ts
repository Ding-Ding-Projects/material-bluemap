/**
 * Binding an application-settings save to the version history that already exists. Written
 * the same way `profiles/history.ts` binds the profile list - see that file's doc comment for
 * why "the folder" is a fixed location rather than one a person chose, and why this is its
 * own repository family rather than a second source sharing another one.
 */

import {
    APP_SETTINGS_HISTORY_DIRECTORY,
    discardOlderRevisions,
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

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { APP_SETTINGS_FILE, appSettingsFolder, parseAppSettingsState, type AppSettingsState } from "./store.js";
import { describeSettingsChange, describeSettingsRestore } from "./describe.js";

/** The text at `folder/settings.json`, or "not there" told apart from "could not be read". */
async function readSettingsFileAt(folder: string): Promise<{ found: true; text: string } | { found: false }> {
    try {
        return { found: true, text: await readFile(join(folder, APP_SETTINGS_FILE), "utf8") };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { found: false };
        throw error;
    }
}

/**
 * The live settings file seen as something a history can be taken of. See
 * `profiles/history.ts`'s `profilesFileSource` for why `read` tells "not there" apart from
 * "could not be read", and why the raw text is what gets recorded.
 */
export const appSettingsFileSource: HistorySource = {
    what: "application settings",
    read: async (folder) => {
        const found = await readSettingsFileAt(folder);
        return found.found ? { files: [{ path: APP_SETTINGS_FILE, text: found.text }] } : { files: [] };
    },
    check: (path) =>
        path === APP_SETTINGS_FILE
            ? { ok: true, path }
            : { ok: false, reason: `${path} is not the application settings file, so it was not written.` },
    write: async (folder, files) => {
        for (const file of files) {
            if (file.path !== APP_SETTINGS_FILE) throw new Error(`${file.path} is not the application settings file.`);
            await mkdir(folder, { recursive: true });
            const target = join(folder, APP_SETTINGS_FILE);
            const temporary = `${target}.tmp`;
            await writeFile(temporary, file.text, "utf8");
            await rename(temporary, target);
        }
    },
    remove: async (folder, paths) => {
        for (const path of paths) {
            if (path !== APP_SETTINGS_FILE) throw new Error(`${path} is not the application settings file.`);
            await rm(join(folder, APP_SETTINGS_FILE), { force: true });
        }
    },
};

export interface AppSettingsHistoryOptions {
    /** Electron's `userData`. Repositories live beside it, never inside a user folder. */
    readonly dataDir: string;
    /** How git is run. Injected so a test can reproduce a machine with no git on it. */
    readonly git?: GitRunner;
}

/** Where the application settings' history is kept. Pure: it creates nothing. */
export function appSettingsRepositoryPath(dataDir: string): string {
    return repositoryPath(dataDir, appSettingsFolder(dataDir), undefined, APP_SETTINGS_HISTORY_DIRECTORY);
}

/** The folder the application settings' history repository lives in. */
export function appSettingsHistoryRoot(dataDir: string): string {
    return historyRoot(dataDir, APP_SETTINGS_HISTORY_DIRECTORY);
}

async function open(
    options: AppSettingsHistoryOptions,
): Promise<{ ok: true; git: RepoGit; repository: string } | { ok: false; message: string; repository: string }> {
    const run = options.git ?? runGit;
    const root = appSettingsHistoryRoot(options.dataDir);
    const repository = appSettingsRepositoryPath(options.dataDir);

    const availability = await probeGit(run, process.cwd());
    if (!availability.available) {
        return { ok: false, message: availability.reason ?? "Git is unavailable.", repository };
    }

    const git = repoGit(run, root, repository);
    const ready = await ensureRepository(git);
    if (!ready.ok) return { ok: false, message: ready.message, repository };

    return { ok: true, git, repository };
}

/** The application settings' history, as the panel receives it. */
export interface AppSettingsHistoryListing {
    readonly available: boolean;
    readonly reason: string | null;
    readonly repository: string;
    readonly revisions: readonly HistoryRevision[];
    readonly remotes: readonly string[];
}

/** Every revision of the application settings, newest first. */
export async function appSettingsHistoryListing(
    options: AppSettingsHistoryOptions,
    limit?: number,
): Promise<AppSettingsHistoryListing> {
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

/** The application settings as the newest revision recorded them. */
async function previousAppSettingsState(git: RepoGit): Promise<{ state: AppSettingsState | null; first: boolean }> {
    const [newest] = await listRevisions(git, 1);
    if (newest === undefined) return { state: null, first: true };

    const files = await readRevisionFiles(git, newest.id);
    if (!files.ok) return { state: null, first: false };

    const file = files.files.find((entry) => entry.path === APP_SETTINGS_FILE);
    if (file === undefined) return { state: null, first: false };

    return { state: parseAppSettingsState(file.text), first: false };
}

/**
 * Records the application settings as they are now. Never rejects; every failure is
 * `{ ok: false, message }` - the structural half of the rule that a failed history write must
 * never fail the save a person actually asked for.
 */
export async function recordAppSettingsRevision(
    options: AppSettingsHistoryOptions,
    after: AppSettingsState,
): Promise<HistoryWrite> {
    const opened = await open(options);
    if (!opened.ok) return { ok: false, message: opened.message };

    const previous = await previousAppSettingsState(opened.git);
    const described = describeSettingsChange({ before: previous.state, after, first: previous.first });

    const folder = appSettingsFolder(options.dataDir);
    const written = await snapshotProject(
        opened.git,
        folder,
        { label: described.label, action: described.action },
        appSettingsFileSource,
    );
    if (written.ok) {
        await rememberProject(options.dataDir, folder, written.revision?.at ?? null, undefined, APP_SETTINGS_HISTORY_DIRECTORY);
    }
    return written;
}

/**
 * Puts the application settings back as they were at one revision, and records *that* as a
 * new revision. Straight through `../history/`'s own restore, so every property it
 * guarantees holds here unchanged.
 */
export async function restoreAppSettingsRevision(
    options: AppSettingsHistoryOptions,
    id: string,
): Promise<RestoreResult> {
    const opened = await open(options);
    if (!opened.ok) return { ok: false, message: opened.message };

    const [target] = (await listRevisions(opened.git)).filter(
        (revision) => revision.id === id || revision.shortId === id,
    );
    const label = target === undefined ? undefined : describeSettingsRestore(target);

    const folder = appSettingsFolder(options.dataDir);
    const restored = await restoreRevision(opened.git, folder, id, appSettingsFileSource, label);
    if (restored.ok) {
        await rememberProject(options.dataDir, folder, restored.revision?.at ?? null, undefined, APP_SETTINGS_HISTORY_DIRECTORY);
    }
    return restored;
}

/**
 * Keeps the newest `keep` revisions of the application settings' history and removes the
 * rest. **Destructive.** See `project/history.ts`'s `discardOlderProjectRevisions` for why
 * this belongs behind a two-key confirmation gate rather than a plain button.
 */
export async function discardOlderAppSettingsRevisions(
    options: AppSettingsHistoryOptions,
    keep: number,
): Promise<HistoryWrite> {
    const opened = await open(options);
    if (!opened.ok) return { ok: false, message: opened.message };
    return await discardOlderRevisions(opened.git, keep);
}
