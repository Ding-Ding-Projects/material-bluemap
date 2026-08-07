/**
 * The disk half of the options GUI.
 *
 * `packages/ui/.../config/` decides what a BlueMap config folder should contain; this
 * decides what may actually be read from and written to one, and it is the only place in
 * the app allowed to do either. The whole of it is `ipc.ts`, because there is nothing here
 * that is not about the boundary: the parsing, the editing and the validating all live in
 * `@worldlens/config` and in the interface, where they can be tested without a file
 * system.
 *
 * ```ts
 * import { dialog } from "electron";
 * import { registerConfigHandlers } from "./config/index.js";
 *
 * const config = registerConfigHandlers(ipcMain, { dataDir: app.getPath("userData"), dialog });
 * ```
 */

export {
    CONFIG_CHANNELS,
    CONFIG_SUBFOLDERS,
    CONFIG_SUFFIXES,
    MAX_CONFIG_BYTES,
    MAX_CONFIG_FILES,
    ROOT_CONFIG_NAMES,
    checkConfigPath,
    configNameOf,
    defaultConfigDirectory,
    deleteConfigFiles,
    dialectName,
    isConfigFileName,
    jdbcSubprotocol,
    noSqlDriver,
    pickDirectory,
    pickFile,
    probeSqlConnection,
    readConfigFolder,
    registerConfigHandlers,
    writeConfigFiles,
    type ConfigFile,
    type ConfigFolderContents,
    type ConfigIpc,
    type ConfigIpcOptions,
    type ConfigPathCheck,
    type OpenDialogHost,
    type PickDirectoryOptions,
    type PickFileOptions,
    type SqlDriver,
    type SqlDriverLookup,
    type SqlProbeRequest,
    type SqlProbeResult,
    type SqlTarget,
} from "./ipc.js";
