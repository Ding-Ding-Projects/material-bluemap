/**
 * A world's project: the file that records how that world should be rendered.
 *
 * The shape of a project is fixed in `@material-bluemap/config`, which owns the schema, the
 * file name, the format version and the pure reader. This directory is the main-process half
 * of it - the only code allowed to put a byte inside somebody's Minecraft world - and it is
 * arranged the same way `world/`, `config/` and `history/` are:
 *
 *  - `file.ts` reads, writes and refuses. Atomic writes, and never over a file it could not
 *    read and understand.
 *  - `describe.ts` turns one save into a sentence. Pure, so the wording is unit-tested.
 *  - `discover.ts` answers whether a catalogued world carries a project, for the world list.
 *  - `history.ts` binds a save to the version history that already exists, keeping the
 *    repository beside the application's data and never inside a world.
 *  - `save.ts` is the write and the record of it, in that order.
 *  - `ipc.ts` is the only file here that names a channel.
 *
 * ```ts
 * import { registerProjectHandlers } from "./project/index.js";
 *
 * const project = registerProjectHandlers(ipcMain, { dataDir: app.getPath("userData") });
 * ```
 */

export {
    MAX_PROJECT_BYTES,
    PROJECT_TEMP_SUFFIX,
    checkProjectPath,
    checkProjectValue,
    checkWorldFolder,
    deleteProject,
    nodeProjectFileIo,
    projectFilePath,
    readProject,
    readProjectText,
    writeProject,
    writeProjectText,
    type ProjectFileIo,
    type ProjectPathCheck,
    type ProjectReadOutcome,
    type ProjectTextResult,
    type ProjectValueCheck,
    type ProjectWriteOptions,
    type ProjectWriteResult,
    type WorldFolderCheck,
} from "./file.js";

export {
    describeProjectChange,
    describeProjectRestore,
    describeReadFailure,
    type ProjectChange,
    type ProjectChangeDescription,
} from "./describe.js";

export {
    MAX_DISCOVERED_WORLDS,
    discoverProject,
    discoverProjects,
    type ProjectPresence,
} from "./discover.js";

export {
    projectFileSource,
    projectHistoryListing,
    projectHistoryRoot,
    projectRepositoryPath,
    recordProjectRevision,
    restoreProjectRevision,
    type ProjectHistoryListing,
    type ProjectHistoryOptions,
} from "./history.js";

export { saveProject, type ProjectSaveOptions, type ProjectSaveResult } from "./save.js";

export {
    PROJECT_CHANNELS,
    projectHistoryLocation,
    registerProjectHandlers,
    type ProjectIpc,
    type ProjectIpcOptions,
} from "./ipc.js";
