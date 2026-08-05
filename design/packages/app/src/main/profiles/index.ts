/**
 * The main-process history of the server-profile / maps-and-servers list. See the doc
 * comments on `store.ts`, `history.ts` and `ipc.ts` for why this exists, what it does and
 * does not yet cover, and `docs/config-history.md` for the migration plan.
 *
 * ```ts
 * import { registerProfilesHistoryHandlers } from "./profiles/index.js";
 *
 * const profilesHistory = registerProfilesHistoryHandlers(ipcMain, { dataDir: app.getPath("userData") });
 * ```
 */

export {
    PROFILES_FILE,
    PROFILES_FORMAT_VERSION,
    PROFILES_STORE_DIRECTORY,
    emptyProfilesState,
    parseProfilesState,
    profilesFolder,
    readProfilesState,
    writeProfilesState,
    type ProfileRecord,
    type ProfilesState,
} from "./store.js";

export {
    describeProfilesChange,
    describeProfilesRestore,
    type ProfilesChange,
    type ProfilesChangeDescription,
} from "./describe.js";

export {
    profilesFileSource,
    profilesHistoryListing,
    profilesHistoryRoot,
    profilesRepositoryPath,
    recordProfilesRevision,
    restoreProfilesRevision,
    type ProfilesHistoryListing,
    type ProfilesHistoryOptions,
} from "./history.js";

export { saveProfilesState, type ProfilesSaveResult } from "./save.js";

export {
    MAX_PROFILES_BYTES,
    PROFILES_HISTORY_CHANNELS,
    profilesHistoryLocation,
    registerProfilesHistoryHandlers,
    type ProfilesHistoryIpc,
    type ProfilesHistoryIpcOptions,
} from "./ipc.js";
