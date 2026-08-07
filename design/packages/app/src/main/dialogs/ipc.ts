/**
 * The one native folder/file picker every path field in the app browses through.
 *
 * `config/ipc.ts` already opens a picker, but only for the options editor, and only when a
 * screen happens to sit under `provideConfigHost()` - Settings, Backup and the remote target
 * editor do not. Rather than teach three more screens to reach into the config module, this
 * is the picker restated as its own small, screen-agnostic channel: two operations, choose a
 * folder and choose a file, reachable from anywhere in the renderer through
 * `window.worldlens.dialog`.
 *
 * Built the same way as `config/ipc.ts`, `java/ipc.ts` and `world/index.ts`: Electron arrives
 * as a *type* only, `IpcMain` and the dialog module are parameters, and both are erased at
 * build time. The whole of this file is therefore exercised by tests with no Electron runtime
 * anywhere near it, native picker included.
 *
 * ```ts
 * import { dialog, BrowserWindow } from "electron";
 * import { registerDialogHandlers } from "./dialogs/ipc.js";
 *
 * const dialogs = registerDialogHandlers(ipcMain, {
 *     dialog,
 *     resolveWindow: (event) => BrowserWindow.fromWebContents(event.sender),
 * });
 * ```
 *
 * ## Window-modal, and defaulted honestly
 *
 * Every pick is opened against the `BrowserWindow` the request came from, so it blocks that
 * window rather than floating unowned above the taskbar - the same reason the title bar's own
 * window controls resolve their target from the sender rather than trusting a window id the
 * renderer could name. A window that cannot be resolved (a test, or a request that somehow
 * outlives its window) still opens the dialog; it just is not modal to anything.
 *
 * The dialog opens on the field's current value only when that value is both an absolute path
 * and a path that really exists right now. A relative path means nothing to Electron - it
 * resolves against the process's working directory rather than anything the user typed against
 * - and a path that no longer exists is not a folder to start browsing from, it is a dead end.
 * Either way the picker falls back to the platform's own default rather than opening somewhere
 * that surprises the person who is about to click around in it.
 *
 * ## Never throws for a cancel
 *
 * `chosenPath` turns a cancelled dialog into `null`, not a rejection, so "the user closed the
 * dialog" and "the dialog genuinely failed" stay distinguishable on the renderer side: a `null`
 * result means try again whenever you like, and a thrown error means something worth reporting
 * actually went wrong.
 */

import type {
    BrowserWindow,
    IpcMain,
    IpcMainInvokeEvent,
    OpenDialogOptions,
    OpenDialogReturnValue,
} from "electron";
import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const DIALOG_CHANNELS = ["dialog:pickFolder", "dialog:pickFile"] as const;

/* -------------------------------------------------------------------------- */
/* The native picker                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Just the one method this module needs from Electron's `dialog`, restated with both of its
 * real overloads so a genuine `BrowserWindow` can be passed through for a modal picker.
 *
 * Named as a parameter rather than imported, for the same reason `IpcMain` is: a value import
 * of `electron` would make every test in this directory need an Electron runtime.
 */
export interface OpenDialogHost {
    showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
    showOpenDialog(window: BrowserWindow, options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
}

export interface PickFolderOptions {
    readonly title: string;
    /** Where the picker opens, when it names a path that really exists. */
    readonly startIn?: string;
}

export interface PickFileOptions extends PickFolderOptions {
    /** Extensions without the dot, e.g. `["jar"]`. Omitted or empty means every file. */
    readonly extensions?: readonly string[];
}

/** The first chosen path, or null for a cancelled picker. */
function chosenPath(answer: OpenDialogReturnValue): string | null {
    if (answer.canceled) return null;
    const first = answer.filePaths[0];
    return first === undefined || first.trim() === "" ? null : first;
}

/**
 * `defaultPath`, only when `startIn` is an absolute path that really exists right now.
 *
 * Electron resolves a relative path against the process's working directory, which for a
 * packaged app is wherever it was launched from - a picker that opens there is worse than one
 * that opens where the platform would have put it. A path that no longer exists is refused for
 * the same reason: it is not a folder to start browsing from.
 */
async function existingStartFolder(startIn: string | undefined): Promise<{ defaultPath?: string }> {
    if (startIn === undefined) return {};
    const trimmed = startIn.trim();
    if (trimmed === "" || !isAbsolute(trimmed)) return {};
    try {
        await stat(trimmed);
        return { defaultPath: trimmed };
    } catch {
        return {};
    }
}

/** Opens the dialog modal to `window` when one was resolved, and unowned otherwise. */
async function open(
    host: OpenDialogHost,
    window: BrowserWindow | null,
    options: OpenDialogOptions,
): Promise<OpenDialogReturnValue> {
    return window === null ? await host.showOpenDialog(options) : await host.showOpenDialog(window, options);
}

export async function pickFolder(
    host: OpenDialogHost,
    window: BrowserWindow | null,
    options: PickFolderOptions,
): Promise<string | null> {
    const answer = await open(host, window, {
        title: options.title,
        properties: ["openDirectory", "createDirectory"],
        ...(await existingStartFolder(options.startIn)),
    });
    return chosenPath(answer);
}

export async function pickFile(
    host: OpenDialogHost,
    window: BrowserWindow | null,
    options: PickFileOptions,
): Promise<string | null> {
    // The dot is not part of an Electron filter, and this comes from a caller-supplied list
    // often enough that both spellings arrive.
    const extensions = (options.extensions ?? [])
        .map((extension) => extension.trim().replace(/^\.+/, ""))
        .filter((extension) => extension !== "");

    const answer = await open(host, window, {
        title: options.title,
        properties: ["openFile"],
        ...(await existingStartFolder(options.startIn)),
        // "All files" beside the narrow filter rather than instead of it: a private key saved
        // as `id_ed25519.txt`, or a driver named `.jar.bin`, is still the file somebody has.
        ...(extensions.length === 0
            ? {}
            : {
                  filters: [
                      { name: `${extensions.map((extension) => extension.toUpperCase()).join(", ")} files`, extensions },
                      { name: "All files", extensions: ["*"] },
                  ],
              }),
    });
    return chosenPath(answer);
}

/* -------------------------------------------------------------------------- */
/* The channel                                                                */
/* -------------------------------------------------------------------------- */

export interface DialogIpcOptions {
    /** Electron's `dialog`, or a stand-in. Required, for the same reason `config/ipc.ts` requires it. */
    readonly dialog: OpenDialogHost;
    /**
     * Resolves the window a picker should be modal to, from the event that asked for it.
     *
     * A function rather than a captured `BrowserWindow`, because the window a request should
     * block is whichever one it came from, and that is only known once the request arrives.
     */
    readonly resolveWindow: (event: IpcMainInvokeEvent) => BrowserWindow | null;
}

export interface DialogIpc {
    dispose(): void;
}

/** The renderer supplies these, so they are checked here rather than trusted. */
function requireText(value: unknown, what: string): string {
    if (typeof value !== "string") throw new Error(`${what} has to be given as text.`);
    return value;
}

function requireOptions(value: unknown, what: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null) throw new Error(`${what} has to be given as a set of options.`);
    return value as Record<string, unknown>;
}

/** A string, or nothing at all, which `exactOptionalPropertyTypes` keeps distinct. */
function optionalText(value: unknown): { startIn?: string } {
    return typeof value === "string" ? { startIn: value } : {};
}

function optionalExtensions(value: unknown): { extensions?: string[] } {
    if (!Array.isArray(value)) return {};
    const extensions = value.filter((entry): entry is string => typeof entry === "string");
    return extensions.length === 0 ? {} : { extensions };
}

/**
 * Runs a handler and makes sure what comes back out of a failure is one plain sentence.
 *
 * A fresh `Error` rather than the original, so nothing a picker or the file system attached to
 * its own - a stack, a syscall, a code - travels to a screen that has no use for it.
 */
async function answering<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(message.replace(/\s+/g, " ").trim());
    }
}

/**
 * Registers the two picker channels.
 *
 * Returns a `dispose` so a test, or a restart, can take them off again without leaving a
 * duplicate registration behind - `ipcMain.handle` throws on a channel that already has one.
 */
export function registerDialogHandlers(ipcMain: IpcMain, options: DialogIpcOptions): DialogIpc {
    ipcMain.handle(
        "dialog:pickFolder",
        async (event: IpcMainInvokeEvent, given: unknown): Promise<string | null> =>
            await answering(async () => {
                const request = requireOptions(given, "The folder picker");
                return await pickFolder(options.dialog, options.resolveWindow(event), {
                    title: requireText(request["title"], "The picker's title"),
                    ...optionalText(request["startIn"]),
                });
            }),
    );

    ipcMain.handle(
        "dialog:pickFile",
        async (event: IpcMainInvokeEvent, given: unknown): Promise<string | null> =>
            await answering(async () => {
                const request = requireOptions(given, "The file picker");
                return await pickFile(options.dialog, options.resolveWindow(event), {
                    title: requireText(request["title"], "The picker's title"),
                    ...optionalExtensions(request["extensions"]),
                    ...optionalText(request["startIn"]),
                });
            }),
    );

    return {
        dispose(): void {
            for (const channel of DIALOG_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
