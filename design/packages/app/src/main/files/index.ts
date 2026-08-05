/**
 * The folders this application owns: where they are, how to open one, and how much memory
 * the thing writing into them may take.
 *
 * ```ts
 * import { shell } from "electron";
 * import { RenderMemoryStore, registerFileHandlers, windowsMapStorageDefault } from "./files/index.js";
 *
 * const memory = new RenderMemoryStore({ dataDir: app.getPath("userData"), totalMemoryBytes: totalmem() });
 *
 * registerFileHandlers(ipcMain, {
 *     shell,
 *     documents: { reported: app.getPath("documents"), home: app.getPath("home") },
 *     memory,
 *     roots: () => [
 *         { id: "maps", label: "the folder rendered maps go in", path: render.storageDirectory() },
 *         { id: "config", label: "the config folder", path: defaultConfigDirectory(app.getPath("userData")) },
 *         { id: "data", label: "this app's own data folder", path: app.getPath("userData") },
 *     ],
 * });
 * ```
 *
 * `ipc.ts` is the only module here that names Electron, and it names it as a type.
 * Everything else takes its file system, its shell and its machine as parameters, so the
 * allowlist, the OneDrive redirect and the memory ceiling are all tested with no Electron
 * runtime, no OneDrive install and no particular amount of RAM.
 */

export {
    PRODUCT_DIRECTORY,
    defaultMapStorageDirectory,
    resolveDocumentsDirectory,
    windowsMapStorageDefault,
    type DocumentsInputs,
    type DocumentsResolution,
    type StorageRedirectReason,
} from "./documents.js";

export {
    isInsideRoot,
    revealInFileManager,
    type RevealHost,
    type RevealOptions,
    type RevealResult,
    type RevealRoot,
} from "./reveal.js";

export {
    MAX_AUTOMATIC_MB,
    MIN_CEILING_MB,
    RESERVED_FOR_SYSTEM_MB,
    RENDER_MEMORY_FILE,
    RenderMemoryStore,
    describeCeiling,
    describeMegabytes,
    jvmArgsForCeiling,
    recommendedCeilingMb,
    totalMemoryMb,
    validateCeiling,
    type MemoryMode,
    type MemoryProblem,
    type RenderMemorySetting,
    type RenderMemoryStoreOptions,
} from "./renderMemory.js";

export {
    DEFAULT_CONCURRENCY,
    DOWNLOAD_CONCURRENCY_FILE,
    DownloadConcurrencyStore,
    MAX_CONCURRENCY,
    MIN_CONCURRENCY,
    describeConcurrency,
    validateConcurrency,
    type ConcurrencyProblem,
    type DownloadConcurrencySetting,
    type DownloadConcurrencyStoreOptions,
} from "./downloadConcurrency.js";

export {
    FILES_CHANNELS,
    registerFileHandlers,
    type DownloadConcurrencyReadout,
    type DownloadConcurrencyWriteResult,
    type FilesIpc,
    type FilesIpcOptions,
    type MapStorageDefaultReadout,
    type RenderMemoryReadout,
    type RenderMemoryWriteResult,
    type RevealRootReadout,
} from "./ipc.js";
