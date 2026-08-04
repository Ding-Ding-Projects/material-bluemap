/**
 * The project channel between the main process and the interface.
 *
 * Built to the same shape as `config/ipc.ts` and `history/ipc.ts`, deliberately and method
 * for method: Electron arrives as a *type*, `IpcMain` is a parameter, and every channel is
 * named once in {@link PROJECT_CHANNELS} so `dispose` cannot drift from the registration.
 * The whole layer is therefore exercised by tests with no Electron runtime anywhere near
 * them, against real world folders in real temporary directories.
 *
 * ## Nothing on this channel rejects
 *
 * Every handler resolves, always, with a value that describes what happened - including
 * every refusal. That is structural rather than a convention, and it carries two different
 * weights here.
 *
 * A *history* failure must not fail a save, which is the rule `history/ipc.ts` is shaped
 * around, and it applies unchanged: the project file is on disk before a revision is
 * attempted, and no problem with git can un-save it.
 *
 * A *write* refusal is the other half, and it is the one specific to this channel. Refusing
 * to overwrite a project file this build cannot read is not an error condition, it is the
 * correct answer, and the interface has to be able to tell it apart from a disk that is
 * full. A thrown `Error` crossing the bridge arrives as one string with no shape to it; a
 * value carries the failure's kind, so "this world's project was made by a newer version of
 * the app" can be its own screen rather than a red toast with a sentence in it.
 *
 * ## The world folder is the capability
 *
 * The renderer names a world folder and nothing else. The file name is a constant, the
 * repository path is derived inside the main process, and {@link checkWorldFolder} refuses
 * a relative path or one that steps out of a folder with `..`. There is no argument the
 * renderer can send that makes this layer write to a second file, and the only path it ever
 * writes is the project at the root of the folder it named.
 *
 * ## Local only
 *
 * There is no channel here for a remote, a fetch, a push or a clone. {@link
 * ProjectHistoryListing} carries the repository's remote list precisely so the interface can
 * *show* that it is empty rather than promise it.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { DEFAULT_REVISION_LIMIT, type RestoreResult } from "../history/index.js";

import { discoverProject, discoverProjects, type ProjectPresence } from "./discover.js";
import { checkProjectValue, checkWorldFolder, readProject, type ProjectReadOutcome } from "./file.js";
import {
    projectHistoryListing,
    projectHistoryRoot,
    type ProjectHistoryListing,
    type ProjectHistoryOptions,
} from "./history.js";
import { restoreProjectRevision } from "./history.js";
import { saveProject, type ProjectSaveResult } from "./save.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const PROJECT_CHANNELS = [
    "project:read",
    "project:discover",
    "project:discoverMany",
    "project:save",
    "project:history",
    "project:restore",
] as const;

/**
 * What this layer needs, which is exactly what the history binding needs and nothing more.
 *
 * An alias rather than an interface of its own, because there is no second thing to
 * configure here: the file name is a constant, the world folder arrives per call, and the
 * only choices are where the application keeps its data and how git is run. Declaring an
 * empty interface extending the other would say the same thing while implying a difference
 * that does not exist.
 */
export type ProjectIpcOptions = ProjectHistoryOptions;

export interface ProjectIpc {
    dispose(): void;
}

/** Where project histories are kept, so the interface can show it is not inside a world. */
export function projectHistoryLocation(options: ProjectIpcOptions): string {
    return projectHistoryRoot(options.dataDir);
}

/* -------------------------------------------------------------------------- */
/* Argument checking                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A revision identifier, checked for shape rather than trusted.
 *
 * Hexadecimal only, exactly as `history/ipc.ts` checks one, and for the same reason: a
 * revision name reaches git as an argument and git's revision syntax is a small language.
 * `HEAD@{1}`, `:/message` and `main^{tree}` are all things a string can be. None of them can
 * escape the repository the renderer did not choose, but they can make a restore write a
 * revision nobody asked for, and refusing everything that is not a hash costs nothing
 * because a hash is all the panel ever sends.
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

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Registers the project handlers.
 *
 * Returns a `dispose` so a test, or a restart, can take them off again without leaving a
 * duplicate registration behind - `ipcMain.handle` throws on a channel that already has one.
 */
export function registerProjectHandlers(ipcMain: IpcMain, options: ProjectIpcOptions): ProjectIpc {
    ipcMain.handle(
        "project:read",
        async (_event: IpcMainInvokeEvent, worldFolder: unknown): Promise<ProjectReadOutcome> => {
            const checked = checkWorldFolder(worldFolder);
            if (!checked.ok) {
                return {
                    ok: false,
                    worldFolder: typeof worldFolder === "string" ? worldFolder : "",
                    path: "",
                    failure: { kind: "unreadable", message: checked.reason },
                };
            }
            return await readProject(checked.folder);
        },
    );

    ipcMain.handle(
        "project:discover",
        async (_event: IpcMainInvokeEvent, worldFolder: unknown): Promise<ProjectPresence> =>
            await discoverProject(worldFolder),
    );

    ipcMain.handle(
        "project:discoverMany",
        async (_event: IpcMainInvokeEvent, worldFolders: unknown): Promise<readonly ProjectPresence[]> => {
            // A non-array is a bug on the other side rather than a request, and answering
            // with an empty list says so without taking the world list down with it.
            if (!Array.isArray(worldFolders)) return [];
            return await discoverProjects(worldFolders as readonly unknown[]);
        },
    );

    ipcMain.handle(
        "project:save",
        async (
            _event: IpcMainInvokeEvent,
            worldFolder: unknown,
            project: unknown,
            replaceUnreadable: unknown,
        ): Promise<ProjectSaveResult> => {
            const checked = checkWorldFolder(worldFolder);
            if (!checked.ok) return { ok: false, reason: checked.reason };

            // Validated here rather than trusted, and through the same reader the disk uses,
            // so a renderer cannot write a file that this build would then refuse to open.
            const value = checkProjectValue(project);
            if (!value.ok) {
                return {
                    ok: false,
                    reason:
                        value.failure.kind === "invalid"
                            ? `That is not a project this app can save: ${value.failure.problems.join("; ")}`
                            : "That is not a project this app can save, so nothing was written.",
                };
            }

            return await saveProject(
                // `replaceUnreadable` is a deliberate act by the person, never a default, so
                // it is compared against `true` rather than coerced: an accidental truthy
                // value must not authorise overwriting settings nobody could read.
                { ...options, write: { replaceUnreadable: replaceUnreadable === true } },
                checked.folder,
                value.project,
            );
        },
    );

    ipcMain.handle(
        "project:history",
        async (_event: IpcMainInvokeEvent, worldFolder: unknown, limit: unknown): Promise<ProjectHistoryListing> => {
            const checked = checkWorldFolder(worldFolder);
            if (!checked.ok) {
                return {
                    available: false,
                    reason: checked.reason,
                    worldFolder: typeof worldFolder === "string" ? worldFolder : "",
                    repository: "",
                    revisions: [],
                    remotes: [],
                };
            }
            const count = typeof limit === "number" && Number.isFinite(limit) ? limit : DEFAULT_REVISION_LIMIT;
            return await projectHistoryListing(options, checked.folder, count);
        },
    );

    ipcMain.handle(
        "project:restore",
        async (_event: IpcMainInvokeEvent, worldFolder: unknown, id: unknown): Promise<RestoreResult> => {
            const checked = checkWorldFolder(worldFolder);
            if (!checked.ok) return { ok: false, message: checked.reason };
            const revision = checkRevision(id);
            if (!revision.ok) return { ok: false, message: revision.message };

            return await restoreProjectRevision(options, checked.folder, revision.id);
        },
    );

    return {
        dispose(): void {
            for (const channel of PROJECT_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
