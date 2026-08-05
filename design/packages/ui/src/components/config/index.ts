/**
 * The options GUI.
 *
 * Mount {@link ConfigScreen}; everything else is exported for tests and for a
 * shell that wants to compose the screens itself.
 *
 * The shell is expected to do three things. It supplies a {@link ConfigHost} (or
 * lets the bridge be probed automatically) so the editor can read and write a
 * config folder; it handles the `consent` event by opening its own Mojang
 * download-consent setting; and it mounts exactly one
 * `<ConfigNotifications :state="notices" />` (from `stores/notices.js`), outside
 * any click-through layer - this screen no longer carries a corner of its own,
 * because two mounted corners would show every notice twice. Nothing in here
 * ever asks for that consent: it is asked once at first launch and remembered,
 * and this screen only reports the state and points at the setting.
 */

export { default as ConfigScreen } from "./ConfigScreen.vue";
export { default as ConfigApplyDialog } from "./ConfigApplyDialog.vue";
export { default as ConfigControl } from "./ConfigControl.vue";
export { default as ConfigField } from "./ConfigField.vue";
export { default as ConfigFileForm } from "./ConfigFileForm.vue";
export { default as ConfigKeyValueField } from "./ConfigKeyValueField.vue";
export { default as ConfigListField } from "./ConfigListField.vue";
export { default as ConfigMarkerSetsField } from "./ConfigMarkerSetsField.vue";
export { default as ConfigMaskField } from "./ConfigMaskField.vue";
export { default as ConfigNotifications } from "./ConfigNotifications.vue";
export { default as ConfigRegexBuilder } from "./ConfigRegexBuilder.vue";
export { default as ConfigSearchField } from "./ConfigSearchField.vue";
export { default as ConfigSuperConfirm } from "./ConfigSuperConfirm.vue";
export { default as MapsScreen } from "./MapsScreen.vue";
export { default as RunScreen } from "./RunScreen.vue";
export { default as SpeedControl } from "./SpeedControl.vue";
export { default as StoragesScreen } from "./StoragesScreen.vue";

export {
    createBridgeConfigHost,
    displayPath,
    hostMissingReason,
    provideConfigHost,
    useConfigHost,
} from "./configHost.js";
export type {
    ConfigHost,
    HostConfigFile,
    HostFolderContents,
    PickDirectoryOptions,
    PickFileOptions,
    SqlProbeRequest,
    SqlProbeResult,
} from "./configHost.js";

export {
    baselineFieldValue,
    changedFields,
    clearFieldValue,
    fieldValue,
    hasBlockingIssues,
    isDirty,
    isExplicit,
    isStructurallyEditable,
    markSaved,
    openConfigFile,
    replaceText,
    setFieldValue,
    tileInvalidatingChanges,
} from "./configModel.js";
export type { AnyDescriptor, EditableConfigFile, FieldChange } from "./configModel.js";

export {
    CONFIG_SUFFIXES,
    addMap,
    addStorage,
    cloneMap,
    configNameOf,
    createWorkspace,
    entriesOfKind,
    findEntry,
    isAbsolutePath,
    isConfigFileName,
    isNameAvailable,
    isWorkspaceDirty,
    loadWorkspace,
    mapPathFor,
    markWorkspaceSaved,
    readEntryField,
    removeEntry,
    replaceFile,
    sanitiseMapId,
    savePlan,
    setStorageType,
    singletonEntry,
    storageIds,
    storagePathFor,
    workspaceIssues,
} from "./configWorkspace.js";
export type {
    ConfigWorkspace,
    EntryChanges,
    EntryKind,
    NewMapOptions,
    SourceFile,
    WorkspaceEntry,
    WorkspaceIssue,
    WorkspacePlan,
} from "./configWorkspace.js";

export {
    SCREENS,
    buildSettingIndex,
    filterFields,
    groupMatchesByScreen,
    sampleTextFor,
    searchSettings,
    settingCountByScreen,
    workspaceSampleText,
} from "./configSearch.js";
export type { ScreenId, ScreenMatches, ScreenMeta, SettingIndexEntry, SettingLocation, SettingSearchResult } from "./configSearch.js";

export {
    MAX_EVAL_MS,
    MAX_MATCHES,
    MAX_PATTERN_LENGTH,
    MAX_SAMPLE_LENGTH,
    SUPPORTED_FLAGS,
    compilePreviewPattern,
    compileSearchPattern,
    createSettingMatcher,
    escapeLiteral,
    evaluatePattern,
    includesCI,
    normalizeFlags,
} from "./regexEngine.js";
export type { RegexEvaluation, RegexMatch, SettingMatcher, SupportedFlag } from "./regexEngine.js";

export {
    JAVA_DOUBLE_MAX,
    JAVA_INT_MAX,
    JAVA_INT_MIN,
    acceptsAbsence,
    alphaPart,
    blankValueFor,
    decimalsForStep,
    isDefaultValue,
    isUnboundedSentinel,
    normalizeHexColor,
    opaquePart,
    parseNumberInput,
    roundToStep,
    searchTextForField,
    toControlValue,
    valueToText,
    withAlpha,
} from "./fieldValue.js";

export { FLAG_BINDINGS, FLAG_GROUPS, flagSearchText, flagValue, flagsInGroup, withFlagValue } from "./cliRun.js";
export type { FlagValue } from "./cliRun.js";

export { DEFAULT_SPEED_LEVEL, SPEED_LEVELS, speedLevelByNumber, speedLevelFor } from "./speedLevels.js";
export type { SpeedLevel } from "./speedLevels.js";

export {
    HISTORY_LIMIT,
    INFO_TIMEOUT_MS,
    SUCCESS_TIMEOUT_MS,
    createNoticeState,
    dismiss,
    dismissAll,
    localTimestamp,
    notify,
    readNotices,
    timeoutFor,
} from "./notifications.js";
export type { Notice, NoticeLevel, NoticeState } from "./notifications.js";
