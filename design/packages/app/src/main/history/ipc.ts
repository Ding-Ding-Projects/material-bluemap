/**
 * The version-history channel between the main process and the options GUI.
 *
 * Built to the same shape as `config/ipc.ts`, deliberately and method for method: Electron
 * arrives as a *type*, `IpcMain` is a parameter, and every channel is named once in
 * {@link HISTORY_CHANNELS} so `dispose` cannot drift from the registration. The whole layer
 * is therefore exercised by tests with no Electron runtime anywhere near them, against real
 * git repositories in real temporary directories.
 *
 * ## Nothing on this channel rejects
 *
 * This is the rule that matters most here, and it is worth being blunt about why it is
 * structural rather than a convention.
 *
 * The contract says a history write that fails must never fail the operation the user
 * actually asked for. Somebody pressing Save wants their config written; whether a
 * *record* of that save could also be kept is the application's problem, not theirs. If a
 * disk is full, git is broken, or a repository was deleted from under the process, the
 * save must still be reported as the success it was.
 *
 * There are two ways to get that. One is to write "remember to wrap every history call in
 * a try/catch" in a comment and hope. The other is to make it impossible to do otherwise:
 * every handler here resolves, always, with `{ ok: false, message }` where another layer
 * would throw. A caller that forgets to handle a failure gets a value describing it rather
 * than an unhandled rejection that takes their save down. That is the design, and the test
 * suite proves it by handing the layer a git that cannot run.
 *
 * ## The folder is the capability
 *
 * A history is identified by the config folder it belongs to, and the repository path is
 * *derived* from that folder inside the main process. The renderer never names a
 * repository, a git directory or a path inside the application's data folder, so there is
 * no argument it can send that makes this layer operate on a repository other than the one
 * belonging to the folder it named. Restores write through `config/ipc.ts`, which refuses
 * any path that is not a config file BlueMap would load.
 *
 * ## Local only
 *
 * There is no channel here for a remote, a fetch, a push or a clone, and there will not be
 * one without the user asking for it in as many words. {@link HistoryStatus} carries the
 * repository's remote list precisely so the interface can *show* that it is empty rather
 * than promise it.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { isAbsolute } from "node:path";

import { probeGit, runGit, type GitAvailability, type GitRunner } from "./git.js";
import {
    compareRevisions,
    DEFAULT_REVISION_LIMIT,
    discardOlderRevisions,
    ensureRepository,
    listRevisions,
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
    type HistoryWrite,
    type RestoreResult,
    type RevisionComparisonFile,
    type RevisionDiffFile,
    type RevisionFile,
} from "./repository.js";
import { historyRoot, readIndex, rememberProject, repositoryPath, type HistoryProject } from "./store.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const HISTORY_CHANNELS = [
    "history:status",
    "history:list",
    "history:snapshot",
    "history:revisionFiles",
    "history:diff",
    "history:compare",
    "history:restore",
    "history:restoreFiles",
    "history:restoreSettings",
    "history:label",
    "history:discardOlder",
] as const;

/* -------------------------------------------------------------------------- */
/* What crosses                                                               */
/* -------------------------------------------------------------------------- */

/** Whether this machine can keep a history at all, and where histories are kept. */
export interface HistoryStatus {
    readonly available: boolean;
    readonly version: string | null;
    /** One sentence for the user when `available` is false. Null when it is true. */
    readonly reason: string | null;
    /** The folder every history repository lives in, beside the application's own data. */
    readonly root: string;
}

/** One project's history, as the panel receives it. */
export interface HistoryListing {
    readonly available: boolean;
    /** Why there is no history, when there is none. Null when `available`. */
    readonly reason: string | null;
    /** The folder this history belongs to, exactly as it was given. */
    readonly folder: string;
    /** Where the repository is. Shown so the user can see it is not in their folder. */
    readonly repository: string;
    readonly revisions: readonly HistoryRevision[];
    /**
     * The repository's remotes, which is expected to be empty.
     *
     * Sent so the interface can state that this history is local rather than assert it.
     */
    readonly remotes: readonly string[];
}

export type RevisionFilesResult =
    | { readonly ok: true; readonly files: readonly RevisionFile[] }
    | { readonly ok: false; readonly message: string };

export type RevisionDiffResult =
    | { readonly ok: true; readonly files: readonly RevisionDiffFile[] }
    | { readonly ok: false; readonly message: string };

export type RevisionCompareResult =
    | {
          readonly ok: true;
          /** The older end, echoed back so the interface cannot mislabel which way round it is. */
          readonly from: string | null;
          readonly to: string;
          readonly files: readonly RevisionComparisonFile[];
      }
    | { readonly ok: false; readonly message: string };

/** One file's merged text, on its way back to disk as part of a setting-level restore. */
export interface SettingRestoreFile {
    readonly path: string;
    readonly text: string;
}

/**
 * How much merged text a setting-level restore may carry, in total.
 *
 * A config folder this editor models is a few tens of kilobytes. The cap is here so that a
 * renderer bug cannot turn a restore into an unbounded write, and it is stated rather than
 * silent so that hitting it reads as a refusal rather than as a truncation.
 */
export const MAX_RESTORE_BYTES = 8 * 1024 * 1024;

export interface HistoryIpcOptions {
    /** Electron's `userData`. Histories live in a folder beside it, never in a user folder. */
    readonly dataDir: string;
    /**
     * How git is run. Injected so a test can reproduce a machine with no git on it, and a
     * git that fails halfway, without touching the machine running the suite.
     */
    readonly git?: GitRunner;
}

export interface HistoryIpc {
    dispose(): void;
}

/* -------------------------------------------------------------------------- */
/* Argument checking                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The chosen folder, or an explanation.
 *
 * A relative path is refused rather than resolved, exactly as `config/ipc.ts` refuses one:
 * resolving it would key a history off whatever directory the application happened to be
 * started in, so the same project would get a different history depending on how it was
 * launched.
 */
function checkFolder(value: unknown): { ok: true; folder: string } | { ok: false; message: string } {
    if (typeof value !== "string") {
        return { ok: false, message: "A config folder has to be given as text." };
    }
    const trimmed = value.trim();
    if (trimmed === "") {
        return { ok: false, message: "No config folder was given, so there was no history to look at." };
    }
    if (!isAbsolute(trimmed)) {
        return {
            ok: false,
            message:
                `${trimmed} is not a full path, so which folder it means depends on where the app ` +
                `was started. Choose the folder again.`,
        };
    }
    return { ok: true, folder: trimmed };
}

/**
 * A revision identifier, checked for shape rather than trusted.
 *
 * Hexadecimal only. A revision name reaches git as an argument, and git's revision syntax
 * is a small language: `HEAD@{1}`, `:/message`, `main^{tree}` and `--` are all things a
 * string can be. None of them can escape a repository the renderer did not choose, but
 * they can make a restore write files from a revision nobody asked for, and refusing
 * everything that is not a hash costs nothing because a hash is all the panel ever sends.
 */
function checkRevision(value: unknown): { ok: true; id: string } | { ok: false; message: string } {
    if (typeof value !== "string") {
        return { ok: false, message: "A revision has to be given as text." };
    }
    const trimmed = value.trim();
    if (!/^[0-9a-f]{7,64}$/i.test(trimmed)) {
        return { ok: false, message: "That is not a revision this history recognises, so nothing was done." };
    }
    return { ok: true, id: trimmed.toLowerCase() };
}

/**
 * The merged file texts of a setting-level restore, checked for shape and for size.
 *
 * Shape first, because `files` arrives from the renderer and a handler that trusted it would
 * hand `undefined` to `writeFile`. Size second, and it is the more interesting of the two:
 * `repository.ts` checks that every path is one this editor would write and one that exists
 * at the revision or on disk, but nothing there bounds how *much* is written. This does, so
 * a renderer bug is a refusal with a sentence rather than a folder full of enormous files.
 */
function checkRestoreFiles(
    value: unknown,
): { ok: true; files: SettingRestoreFile[] } | { ok: false; message: string } {
    if (!Array.isArray(value)) {
        return { ok: false, message: "The settings to put back have to be given as a list of files." };
    }

    const files: SettingRestoreFile[] = [];
    let bytes = 0;
    for (const entry of value) {
        if (typeof entry !== "object" || entry === null) {
            return { ok: false, message: "The settings to put back have to be given as a list of files." };
        }
        const row = entry as { path?: unknown; text?: unknown };
        if (typeof row.path !== "string" || typeof row.text !== "string") {
            return { ok: false, message: "Every file to put back needs a name and its new contents." };
        }
        bytes += row.text.length;
        if (bytes > MAX_RESTORE_BYTES) {
            return {
                ok: false,
                message: "That is far more text than a config folder holds, so nothing was written.",
            };
        }
        files.push({ path: row.path, text: row.text });
    }
    return { ok: true, files };
}

/* -------------------------------------------------------------------------- */
/* The operations, each of which answers rather than throws                   */
/* -------------------------------------------------------------------------- */

/**
 * Everything a handler needs, resolved once per call.
 *
 * Nothing is cached between calls, for the same reason `config/ipc.ts` caches nothing: a
 * user can delete the history folder, or install git, while the application is running,
 * and an answer computed at start-up would go on being wrong until a restart.
 */
async function open(
    options: HistoryIpcOptions,
    folder: string,
): Promise<
    | { ok: true; git: ReturnType<typeof repoGit>; repository: string; availability: GitAvailability }
    | { ok: false; message: string; repository: string }
> {
    const run = options.git ?? runGit;
    const root = historyRoot(options.dataDir);
    const repository = repositoryPath(options.dataDir, folder);

    // Probed from the root rather than from the repository, because the repository may not
    // exist yet and `execFile` refuses a working directory that is not there - which would
    // report "git is missing" on a machine that has it.
    const availability = await probeGit(run, process.cwd());
    if (!availability.available) {
        return { ok: false, message: availability.reason ?? "Git is unavailable.", repository };
    }

    const git = repoGit(run, root, repository);
    const ready = await ensureRepository(git);
    if (!ready.ok) return { ok: false, message: ready.message, repository };

    return { ok: true, git, repository, availability };
}

/** Whether this machine can keep a history at all. */
export async function historyStatus(options: HistoryIpcOptions): Promise<HistoryStatus> {
    const run = options.git ?? runGit;
    const availability = await probeGit(run, process.cwd());
    return {
        available: availability.available,
        version: availability.version,
        reason: availability.reason,
        root: historyRoot(options.dataDir),
    };
}

/** Every revision for one folder, newest first. An unavailable history is a stated fact. */
export async function historyListing(
    options: HistoryIpcOptions,
    folder: string,
    limit = DEFAULT_REVISION_LIMIT,
): Promise<HistoryListing> {
    const opened = await open(options, folder);
    if (!opened.ok) {
        return {
            available: false,
            reason: opened.message,
            folder,
            repository: opened.repository,
            revisions: [],
            remotes: [],
        };
    }

    const revisions = await listRevisions(opened.git, limit);
    const remotes = await remoteNames(opened.git);
    return {
        available: true,
        reason: null,
        folder,
        repository: opened.repository,
        revisions,
        remotes,
    };
}

/** Records the folder's current state, if it differs from the last revision. */
export async function historySnapshot(options: HistoryIpcOptions, folder: string): Promise<HistoryWrite> {
    const opened = await open(options, folder);
    if (!opened.ok) return { ok: false, message: opened.message };

    const written = await snapshotProject(opened.git, folder);
    if (written.ok) await rememberProject(options.dataDir, folder, written.revision?.at ?? null);
    return written;
}

/** The projects that have a history, for a retention screen or a diagnostic. */
export async function historyProjects(options: HistoryIpcOptions): Promise<readonly HistoryProject[]> {
    const index = await readIndex(options.dataDir);
    return index.projects;
}

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Registers the history handlers.
 *
 * Returns a `dispose` so a test, or a restart, can take them off again without leaving a
 * duplicate registration behind - `ipcMain.handle` throws on a channel that already has
 * one.
 */
export function registerHistoryHandlers(ipcMain: IpcMain, options: HistoryIpcOptions): HistoryIpc {
    ipcMain.handle("history:status", async (): Promise<HistoryStatus> => await historyStatus(options));

    ipcMain.handle(
        "history:list",
        async (_event: IpcMainInvokeEvent, folder: unknown, limit: unknown): Promise<HistoryListing> => {
            const checked = checkFolder(folder);
            if (!checked.ok) {
                return {
                    available: false,
                    reason: checked.message,
                    folder: typeof folder === "string" ? folder : "",
                    repository: "",
                    revisions: [],
                    remotes: [],
                };
            }
            const count = typeof limit === "number" && Number.isFinite(limit) ? limit : DEFAULT_REVISION_LIMIT;
            return await historyListing(options, checked.folder, count);
        },
    );

    ipcMain.handle(
        "history:snapshot",
        async (_event: IpcMainInvokeEvent, folder: unknown): Promise<HistoryWrite> => {
            const checked = checkFolder(folder);
            if (!checked.ok) return { ok: false, message: checked.message };
            return await historySnapshot(options, checked.folder);
        },
    );

    ipcMain.handle(
        "history:revisionFiles",
        async (_event: IpcMainInvokeEvent, folder: unknown, id: unknown): Promise<RevisionFilesResult> => {
            const checked = checkFolder(folder);
            if (!checked.ok) return { ok: false, message: checked.message };
            const revision = checkRevision(id);
            if (!revision.ok) return { ok: false, message: revision.message };

            const opened = await open(options, checked.folder);
            if (!opened.ok) return { ok: false, message: opened.message };
            return await readRevisionFiles(opened.git, revision.id);
        },
    );

    ipcMain.handle(
        "history:diff",
        async (_event: IpcMainInvokeEvent, folder: unknown, id: unknown): Promise<RevisionDiffResult> => {
            const checked = checkFolder(folder);
            if (!checked.ok) return { ok: false, message: checked.message };
            const revision = checkRevision(id);
            if (!revision.ok) return { ok: false, message: revision.message };

            const opened = await open(options, checked.folder);
            if (!opened.ok) return { ok: false, message: opened.message };
            return await revisionDiff(opened.git, revision.id);
        },
    );

    ipcMain.handle(
        "history:compare",
        async (
            _event: IpcMainInvokeEvent,
            folder: unknown,
            from: unknown,
            to: unknown,
        ): Promise<RevisionCompareResult> => {
            const checked = checkFolder(folder);
            if (!checked.ok) return { ok: false, message: checked.message };

            // A null older end is the legitimate "compare this with whatever came before it",
            // which is what an unexpanded row asks for. Anything else has to be a hash.
            let older: string | null = null;
            if (from !== null && from !== undefined) {
                const parsed = checkRevision(from);
                if (!parsed.ok) return { ok: false, message: parsed.message };
                older = parsed.id;
            }
            const newer = checkRevision(to);
            if (!newer.ok) return { ok: false, message: newer.message };

            const opened = await open(options, checked.folder);
            if (!opened.ok) return { ok: false, message: opened.message };

            const compared = await compareRevisions(opened.git, older, newer.id);
            if (!compared.ok) return compared;
            return { ok: true, from: older, to: newer.id, files: compared.files };
        },
    );

    ipcMain.handle(
        "history:restoreFiles",
        async (
            _event: IpcMainInvokeEvent,
            folder: unknown,
            id: unknown,
            paths: unknown,
        ): Promise<RestoreResult> => {
            const checked = checkFolder(folder);
            if (!checked.ok) return { ok: false, message: checked.message };
            const revision = checkRevision(id);
            if (!revision.ok) return { ok: false, message: revision.message };
            if (!Array.isArray(paths) || paths.some((entry) => typeof entry !== "string")) {
                return { ok: false, message: "The files to put back have to be given as a list of names." };
            }

            const opened = await open(options, checked.folder);
            if (!opened.ok) return { ok: false, message: opened.message };

            const restored = await restoreRevisionFiles(
                opened.git,
                checked.folder,
                revision.id,
                paths as string[],
            );
            if (restored.ok) await rememberProject(options.dataDir, checked.folder, restored.revision?.at ?? null);
            return restored;
        },
    );

    ipcMain.handle(
        "history:restoreSettings",
        async (
            _event: IpcMainInvokeEvent,
            folder: unknown,
            id: unknown,
            files: unknown,
            keys: unknown,
        ): Promise<RestoreResult> => {
            const checked = checkFolder(folder);
            if (!checked.ok) return { ok: false, message: checked.message };
            const revision = checkRevision(id);
            if (!revision.ok) return { ok: false, message: revision.message };

            const merged = checkRestoreFiles(files);
            if (!merged.ok) return { ok: false, message: merged.message };

            const named =
                Array.isArray(keys) && keys.every((entry) => typeof entry === "string")
                    ? (keys as string[]).map((key) => key.replace(/[\u0000-\u001f]/g, " ").trim()).filter(
                          (key) => key !== "",
                      )
                    : [];

            const opened = await open(options, checked.folder);
            if (!opened.ok) return { ok: false, message: opened.message };

            const restored = await restoreRevisionSettings(
                opened.git,
                checked.folder,
                revision.id,
                merged.files,
                named,
            );
            if (restored.ok) await rememberProject(options.dataDir, checked.folder, restored.revision?.at ?? null);
            return restored;
        },
    );

    ipcMain.handle(
        "history:restore",
        async (_event: IpcMainInvokeEvent, folder: unknown, id: unknown): Promise<RestoreResult> => {
            const checked = checkFolder(folder);
            if (!checked.ok) return { ok: false, message: checked.message };
            const revision = checkRevision(id);
            if (!revision.ok) return { ok: false, message: revision.message };

            const opened = await open(options, checked.folder);
            if (!opened.ok) return { ok: false, message: opened.message };

            const restored = await restoreRevision(opened.git, checked.folder, revision.id);
            if (restored.ok) await rememberProject(options.dataDir, checked.folder, restored.revision?.at ?? null);
            return restored;
        },
    );

    ipcMain.handle(
        "history:label",
        async (
            _event: IpcMainInvokeEvent,
            folder: unknown,
            id: unknown,
            label: unknown,
        ): Promise<HistoryWrite> => {
            const checked = checkFolder(folder);
            if (!checked.ok) return { ok: false, message: checked.message };
            const revision = checkRevision(id);
            if (!revision.ok) return { ok: false, message: revision.message };
            if (typeof label !== "string") return { ok: false, message: "A label has to be given as text." };

            const opened = await open(options, checked.folder);
            if (!opened.ok) return { ok: false, message: opened.message };
            return await setRevisionLabel(opened.git, revision.id, label);
        },
    );

    ipcMain.handle(
        "history:discardOlder",
        async (_event: IpcMainInvokeEvent, folder: unknown, keep: unknown): Promise<HistoryWrite> => {
            const checked = checkFolder(folder);
            if (!checked.ok) return { ok: false, message: checked.message };
            if (typeof keep !== "number" || !Number.isFinite(keep) || keep < 1) {
                return {
                    ok: false,
                    message: "How many revisions to keep has to be a whole number of at least one.",
                };
            }

            const opened = await open(options, checked.folder);
            if (!opened.ok) return { ok: false, message: opened.message };
            return await discardOlderRevisions(opened.git, keep);
        },
    );

    return {
        dispose(): void {
            for (const channel of HISTORY_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
