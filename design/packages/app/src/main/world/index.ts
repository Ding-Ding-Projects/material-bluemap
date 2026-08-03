/**
 * The world-folder channel between the main process and the interface.
 *
 * Built to the same shape as `render/ipc.ts`, `download/ipc.ts` and `github/ipc.ts`:
 * this is the only file under `world/` that knows about Electron, `inspect.ts` takes
 * nothing but a path, and every channel this registers is named once in
 * {@link WORLD_CHANNELS} so `dispose` cannot drift from the registration.
 *
 * It knows about Electron only as a *type*. `IpcMain` arrives as a parameter and the
 * import is erased at build time, so this module - and with it the whole directory -
 * still runs, and is still tested, without an Electron runtime.
 *
 * ```ts
 * import { registerWorldHandlers } from "./world/index.js";
 *
 * const world = registerWorldHandlers(ipcMain);
 * ```
 *
 * The channel is `invoke`/`handle` rather than pushed, unlike rendering and
 * downloading: reading a folder is a question with one answer that arrives in
 * milliseconds, so there is no progress to report and nothing to cancel.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { inspectWorldFolder } from "./inspect.js";
import type { WorldFolderListing } from "./inspect.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const WORLD_CHANNELS = ["world:inspect"] as const;

export interface WorldIpc {
    dispose(): void;
}

/**
 * Registers the world-folder handlers.
 *
 * Returns a `dispose` so a test, or a restart, can take the handlers off again without
 * leaving a duplicate registration behind - `ipcMain.handle` throws on a channel that
 * already has one.
 */
export function registerWorldHandlers(ipcMain: IpcMain): WorldIpc {
    ipcMain.handle(
        "world:inspect",
        async (_event: IpcMainInvokeEvent, folder: unknown): Promise<WorldFolderListing> => {
            // The renderer supplies this, so it is checked here rather than trusted. A
            // non-string argument is a bug on the other side, and saying so is more use
            // than coercing it into a path nobody meant.
            if (typeof folder !== "string") {
                throw new Error("A world folder has to be given as text.");
            }
            return await inspectWorldFolder(folder);
        },
    );

    return {
        dispose(): void {
            for (const channel of WORLD_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

export {
    MAX_CUSTOM_DIMENSIONS,
    MAX_DIMENSION_NAMESPACES,
    MAX_ENTRIES,
    MAX_WORLD_PROBES,
    inspectWorldFolder,
    type WorldFolderEntry,
    type WorldFolderListing,
} from "./inspect.js";
