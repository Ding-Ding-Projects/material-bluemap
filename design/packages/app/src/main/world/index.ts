/**
 * The world-folder channel between the main process and the interface.
 *
 * Built to the same shape as `render/ipc.ts`, `download/ipc.ts` and `github/ipc.ts`:
 * this is the only file under `world/` that knows about Electron, every module beside it
 * takes nothing but paths and options, and every channel this registers is named once in
 * {@link WORLD_CHANNELS} so `dispose` cannot drift from the registration.
 *
 * It knows about Electron only as a *type*. `IpcMain` arrives as a parameter and the
 * import is erased at build time, so this module - and with it the whole directory -
 * still runs, and is still tested, without an Electron runtime.
 *
 * ```ts
 * import { registerWorldHandlers } from "./world/index.js";
 *
 * const world = registerWorldHandlers(ipcMain, { userDataDirectory: app.getPath("userData") });
 * ```
 *
 * Every channel is `invoke`/`handle` rather than pushed, unlike rendering and downloading.
 * Reading one folder is a question with one answer that arrives in milliseconds, and
 * scanning is deliberately **one call per mounted folder** rather than one call for all of
 * them: that is what lets the interface show each folder finishing on its own, so a slow
 * network drive is visibly slow instead of holding up the four local folders that were
 * ready immediately.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { scanSavesFolder, type SavesScan } from "./catalog.js";
import { inspectWorldFolder } from "./inspect.js";
import type { WorldFolderListing } from "./inspect.js";
import {
    labelMinecraftFolder,
    listMinecraftFolders,
    mountMinecraftFolder,
    unmountMinecraftFolder,
    type MinecraftFolder,
    type MountResult,
} from "./mounts.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const WORLD_CHANNELS = [
    "world:inspect",
    "world:folders",
    "world:mount",
    "world:unmount",
    "world:label",
    "world:scan",
] as const;

export interface WorldIpcOptions {
    /**
     * Electron's `userData`, which is where the mounted-folder list is kept.
     *
     * Optional so the whole directory stays testable without an Electron runtime. When it
     * is absent nothing is persisted: the detected default folders are still listed and
     * still scanned, and mounting reports that it could not be remembered rather than
     * appearing to work and being gone at the next launch.
     */
    readonly userDataDirectory?: string | null;
    /** Injected in tests. Defaults to the platform and environment this process is on. */
    readonly platform?: NodeJS.Platform;
    readonly env?: NodeJS.ProcessEnv;
    readonly home?: string;
    readonly executableDirectory?: string | null;
}

export interface WorldIpc {
    dispose(): void;
}

/** What the renderer is told about a scan of one folder, including the ones that failed. */
export type FolderScanResult =
    | { readonly ok: true; readonly scan: SavesScan }
    | { readonly ok: false; readonly folderId: string; readonly message: string };

/**
 * Registers the world handlers.
 *
 * Returns a `dispose` so a test, or a restart, can take the handlers off again without
 * leaving a duplicate registration behind - `ipcMain.handle` throws on a channel that
 * already has one.
 */
export function registerWorldHandlers(ipcMain: IpcMain, options: WorldIpcOptions = {}): WorldIpc {
    const storeFile =
        options.userDataDirectory == null || options.userDataDirectory.trim() === ""
            ? null
            : `${options.userDataDirectory.replace(/[\\/]+$/, "")}/minecraft-folders.json`;

    const env = options.env ?? process.env;
    const listOptions = {
        platform: options.platform ?? process.platform,
        env,
        home: options.home ?? env.HOME ?? env.USERPROFILE ?? "",
        executableDirectory: options.executableDirectory ?? null,
        storeFile,
    };

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

    ipcMain.handle("world:folders", async (): Promise<readonly MinecraftFolder[]> => {
        return await listMinecraftFolders(listOptions);
    });

    ipcMain.handle(
        "world:mount",
        async (_event: IpcMainInvokeEvent, folder: unknown): Promise<MountResult> => {
            if (typeof folder !== "string") {
                throw new Error("A Minecraft folder has to be given as text.");
            }
            if (storeFile === null) {
                return {
                    ok: false,
                    message:
                        "This build has nowhere to remember mounted folders, so a folder mounted " +
                        "now would be gone at the next launch. The world field below still takes " +
                        "any path directly.",
                };
            }
            return await mountMinecraftFolder(folder, listOptions);
        },
    );

    ipcMain.handle("world:unmount", async (_event: IpcMainInvokeEvent, id: unknown): Promise<boolean> => {
        if (typeof id !== "string") throw new Error("A folder id has to be given as text.");
        return await unmountMinecraftFolder(id, storeFile);
    });

    ipcMain.handle(
        "world:label",
        async (_event: IpcMainInvokeEvent, id: unknown, label: unknown): Promise<boolean> => {
            if (typeof id !== "string") throw new Error("A folder id has to be given as text.");
            if (typeof label !== "string") throw new Error("A folder label has to be given as text.");
            return await labelMinecraftFolder(id, label, storeFile);
        },
    );

    ipcMain.handle(
        "world:scan",
        async (_event: IpcMainInvokeEvent, id: unknown): Promise<FolderScanResult> => {
            if (typeof id !== "string") throw new Error("A folder id has to be given as text.");

            const folders = await listMinecraftFolders(listOptions);
            const folder = folders.find((candidate) => candidate.id === id);
            if (folder === undefined) {
                return { ok: false, folderId: id, message: "That folder is not in the list any more." };
            }

            // Resolved rather than rejected, so one unplugged drive reports itself on its
            // own row and every other folder's worlds stay on the screen.
            try {
                return { ok: true, scan: await scanSavesFolder(folder.savesPath, folder.id) };
            } catch (error) {
                return {
                    ok: false,
                    folderId: id,
                    message: error instanceof Error ? error.message : String(error),
                };
            }
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
    type ServerSiblingDimension,
    type WorldFolderEntry,
    type WorldFolderListing,
} from "./inspect.js";

export { MAX_SIZE_ENTRIES, MAX_WORLDS, scanSavesFolder, type MinecraftWorldSummary, type SavesScan } from "./catalog.js";
export {
    defaultMinecraftFolders,
    type DefaultMinecraftFolder,
    type MinecraftFolderOrigin,
} from "./locations.js";
export {
    listMinecraftFolders,
    mountMinecraftFolder,
    resolveMinecraftFolder,
    unmountMinecraftFolder,
    type FolderResolution,
    type FolderState,
    type MinecraftFolder,
    type MountResult,
} from "./mounts.js";
