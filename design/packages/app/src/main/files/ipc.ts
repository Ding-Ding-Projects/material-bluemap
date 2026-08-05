/**
 * The folders-and-limits channel between the main process and the interface.
 *
 * Built like `main/config/ipc.ts`, method for method: Electron arrives as a *type*,
 * `IpcMain` is a parameter, every channel is named once in {@link FILES_CHANNELS} so
 * `dispose` cannot drift from the registration, and **no handler rejects** - a refusal is a
 * value carrying a sentence, because a rejected `invoke` becomes an unhandled promise in a
 * component and the user sees nothing happen at all.
 *
 * Three unrelated-looking things share this file because they share a property: each of
 * them is a decision about a place or a limit that the *main process* owns and the renderer
 * may only ask about.
 *
 *  - `files:reveal` opens a folder, allowlisted to directories this app wrote.
 *  - `files:mapStorageDefault` reports where maps should go, and whether that answer was
 *    moved out of OneDrive and why.
 *  - `files:renderMemory` / `files:setRenderMemory` read and write the JVM heap ceiling.
 *  - `files:downloadConcurrency` / `files:setDownloadConcurrency` read and write how many
 *    release-asset parts a download fetches at once.
 *
 * None of them can be done in the renderer, and all of them are refusals-as-values.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
    DEFAULT_CONCURRENCY,
    DownloadConcurrencyStore,
    MAX_CONCURRENCY,
    MIN_CONCURRENCY,
    describeConcurrency,
    type ConcurrencyProblem,
} from "./downloadConcurrency.js";
import {
    defaultMapStorageDirectory,
    resolveDocumentsDirectory,
    type DocumentsInputs,
    type DocumentsResolution,
} from "./documents.js";
import { revealInFileManager, type RevealHost, type RevealResult, type RevealRoot } from "./reveal.js";
import {
    MAX_AUTOMATIC_MB,
    MIN_CEILING_MB,
    RenderMemoryStore,
    describeCeiling,
    recommendedCeilingMb,
    totalMemoryMb,
    type MemoryProblem,
    type RenderMemorySetting,
} from "./renderMemory.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const FILES_CHANNELS = [
    "files:reveal",
    "files:revealRoots",
    "files:mapStorageDefault",
    "files:renderMemory",
    "files:setRenderMemory",
    "files:downloadConcurrency",
    "files:setDownloadConcurrency",
] as const;

/* -------------------------------------------------------------------------- */
/* What crosses                                                               */
/* -------------------------------------------------------------------------- */

/** One openable folder, as the interface sees it. Absolute paths only, never a handle. */
export interface RevealRootReadout {
    readonly id: string;
    readonly label: string;
    readonly path: string;
}

/** Where maps go by default, and the OneDrive explanation when there is one. */
export interface MapStorageDefaultReadout {
    readonly directory: string;
    readonly documents: DocumentsResolution;
}

/** The heap ceiling, everything needed to render its control, and the plain explanation. */
export interface RenderMemoryReadout {
    readonly mode: RenderMemorySetting["mode"];
    readonly megabytes: number;
    /** What automatic would choose on this machine right now. */
    readonly recommendedMegabytes: number;
    /** Physical memory, in mebibytes. Zero when it could not be read. */
    readonly machineMegabytes: number;
    readonly minimumMegabytes: number;
    /** The ceiling the automatic default will never exceed on its own. */
    readonly automaticCeilingMegabytes: number;
    /** One paragraph naming the number, the unit and what happens either side of it. */
    readonly explanation: string;
    /** Exactly what a render will be started with, e.g. `["-Xmx4096m"]`. */
    readonly jvmArgs: readonly string[];
}

export type RenderMemoryWriteResult =
    | { readonly ok: true; readonly setting: RenderMemoryReadout }
    | { readonly ok: false; readonly reason: string };

/** How many parts a download fetches at once, and the plain explanation for the row. */
export interface DownloadConcurrencyReadout {
    readonly workers: number;
    /** True when nothing has been chosen and this is the shipped default. */
    readonly isDefault: boolean;
    readonly defaultWorkers: number;
    readonly minimumWorkers: number;
    readonly maximumWorkers: number;
    /** One paragraph naming the number and both directions of the trade-off. */
    readonly explanation: string;
}

export type DownloadConcurrencyWriteResult =
    | { readonly ok: true; readonly setting: DownloadConcurrencyReadout }
    | { readonly ok: false; readonly reason: string };

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

export interface FilesIpcOptions {
    /**
     * The directories this app owns, read fresh on every call.
     *
     * A function rather than a list: the map storage directory moves while the app is
     * running, and a captured list would keep allowing the folder somebody moved away from
     * while refusing the one they moved to.
     */
    readonly roots: () => readonly RevealRoot[];
    /** Electron's `shell`, or a stand-in. Required rather than defaulted, like `dialog`. */
    readonly shell: RevealHost;
    /** Everything {@link resolveDocumentsDirectory} needs, from Electron's `app`. */
    readonly documents: DocumentsInputs;
    readonly memory: RenderMemoryStore;
    readonly downloadConcurrency: DownloadConcurrencyStore;
}

export interface FilesIpc {
    dispose(): void;
}

function readout(store: RenderMemoryStore): RenderMemoryReadout {
    const setting = store.read();
    const bytes = store.machineMemoryBytes();
    return {
        mode: setting.mode,
        megabytes: setting.megabytes,
        recommendedMegabytes: recommendedCeilingMb(bytes),
        machineMegabytes: totalMemoryMb(bytes),
        minimumMegabytes: MIN_CEILING_MB,
        automaticCeilingMegabytes: MAX_AUTOMATIC_MB,
        explanation: describeCeiling(setting, bytes),
        jvmArgs: store.jvmArgs(),
    };
}

/** The renderer supplies these, so they are read defensively rather than trusted. */
function requestedSetting(value: unknown): RenderMemorySetting | null {
    if (typeof value !== "object" || value === null) return null;
    const given = value as { readonly mode?: unknown; readonly megabytes?: unknown };
    if (given.mode === "automatic") return { mode: "automatic", megabytes: 0 };
    if (given.mode !== "manual") return null;
    if (typeof given.megabytes !== "number") return null;
    return { mode: "manual", megabytes: given.megabytes };
}

function downloadConcurrencyReadout(store: DownloadConcurrencyStore): DownloadConcurrencyReadout {
    const setting = store.read();
    return {
        workers: setting.workers,
        isDefault: setting.isDefault,
        defaultWorkers: DEFAULT_CONCURRENCY,
        minimumWorkers: MIN_CONCURRENCY,
        maximumWorkers: MAX_CONCURRENCY,
        explanation: describeConcurrency(setting.workers),
    };
}

/**
 * Registers the folder and memory handlers, and returns a `dispose`.
 *
 * `ipcMain.handle` throws on a channel that already has a handler, so the dispose exists for
 * the same reason it does everywhere else in this process: a test, or a restart, has to be
 * able to take them off again without leaving a duplicate registration behind.
 */
export function registerFileHandlers(ipcMain: IpcMain, options: FilesIpcOptions): FilesIpc {
    ipcMain.handle(
        "files:reveal",
        async (_event: IpcMainInvokeEvent, target: unknown): Promise<RevealResult> =>
            await revealInFileManager(target, {
                roots: options.roots,
                host: options.shell,
                platform: options.documents.platform,
            }),
    );

    ipcMain.handle("files:revealRoots", (_event: IpcMainInvokeEvent): readonly RevealRootReadout[] =>
        options.roots().map((root) => ({ id: root.id, label: root.label, path: root.path })),
    );

    ipcMain.handle("files:mapStorageDefault", (_event: IpcMainInvokeEvent): MapStorageDefaultReadout => {
        const documents = resolveDocumentsDirectory(options.documents);
        return { directory: defaultMapStorageDirectory(documents), documents };
    });

    ipcMain.handle("files:renderMemory", (_event: IpcMainInvokeEvent): RenderMemoryReadout =>
        readout(options.memory),
    );

    ipcMain.handle(
        "files:setRenderMemory",
        (_event: IpcMainInvokeEvent, given: unknown): RenderMemoryWriteResult => {
            const requested = requestedSetting(given);
            if (requested === null) {
                return {
                    ok: false,
                    reason: "A memory limit has to be either automatic, or a number of megabytes to allow.",
                };
            }
            const written: MemoryProblem = options.memory.write(requested);
            if (!written.ok) return { ok: false, reason: written.reason };
            return { ok: true, setting: readout(options.memory) };
        },
    );

    ipcMain.handle("files:downloadConcurrency", (_event: IpcMainInvokeEvent): DownloadConcurrencyReadout =>
        downloadConcurrencyReadout(options.downloadConcurrency),
    );

    ipcMain.handle(
        "files:setDownloadConcurrency",
        (_event: IpcMainInvokeEvent, given: unknown): DownloadConcurrencyWriteResult => {
            const written: ConcurrencyProblem = options.downloadConcurrency.write(given);
            if (!written.ok) return { ok: false, reason: written.reason };
            return { ok: true, setting: downloadConcurrencyReadout(options.downloadConcurrency) };
        },
    );

    return {
        dispose(): void {
            for (const channel of FILES_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
