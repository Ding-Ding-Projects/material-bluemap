/**
 * The main-process history of the application's own settings. See the doc comments on
 * `store.ts`, `history.ts` and `ipc.ts` for why this exists, what it does and does not yet
 * cover, and `docs/config-history.md` for the migration plan.
 *
 * ```ts
 * import { registerAppSettingsHistoryHandlers } from "./settings/index.js";
 *
 * const settingsHistory = registerAppSettingsHistoryHandlers(ipcMain, { dataDir: app.getPath("userData") });
 * ```
 */

export {
    APP_SETTINGS_FILE,
    APP_SETTINGS_FORMAT_VERSION,
    APP_SETTINGS_STORE_DIRECTORY,
    appSettingsFolder,
    emptyAppSettingsState,
    parseAppSettingsState,
    readAppSettingsState,
    writeAppSettingsState,
    type AppSettingsState,
} from "./store.js";

export {
    describeSettingsChange,
    describeSettingsRestore,
    type SettingsChange,
    type SettingsChangeDescription,
} from "./describe.js";

export {
    appSettingsFileSource,
    appSettingsHistoryListing,
    appSettingsHistoryRoot,
    appSettingsRepositoryPath,
    recordAppSettingsRevision,
    restoreAppSettingsRevision,
    type AppSettingsHistoryListing,
    type AppSettingsHistoryOptions,
} from "./history.js";

export { saveAppSettingsState, type AppSettingsSaveResult } from "./save.js";

export {
    APP_SETTINGS_HISTORY_CHANNELS,
    MAX_APP_SETTINGS_BYTES,
    appSettingsHistoryLocation,
    registerAppSettingsHistoryHandlers,
    type AppSettingsHistoryIpc,
    type AppSettingsHistoryIpcOptions,
} from "./ipc.js";
