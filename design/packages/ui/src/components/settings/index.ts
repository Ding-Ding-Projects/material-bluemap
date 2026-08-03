/**
 * The app's settings surface.
 *
 * Mount exactly one {@link AppSettings} in the shell and hand it three things: whether
 * it is open, the anchor it should reveal, and whether the render that sent somebody
 * here said that setting was *missing* rather than merely wrong. It emits `update:open`
 * and nothing else — it is a side sheet, not a dialog, and it never halts the app behind
 * it.
 *
 * The anchor is the other end of `SettingsTarget` in `world/worldBridge.ts`: a render
 * that stops for a fixable reason names the setting that would fix it, the shell passes
 * that anchor here, and this scrolls to it, focuses it and outlines it. That round trip
 * is the whole point of the surface — everything else is the settings themselves.
 */

export { default as AppSettings } from "./AppSettings.vue";
export { default as SettingsSection } from "./SettingsSection.vue";
export { default as StorageSettingRow } from "./StorageSettingRow.vue";
export { default as JavaRuntimeRow } from "./JavaRuntimeRow.vue";
export { default as WorldFolderRow } from "./WorldFolderRow.vue";

export {
    SETTINGS_ANCHORS,
    filterSections,
    isSettingsAnchor,
    sectionHaystack,
    sectionSample,
} from "./settingsSections.js";
export type { SettingsAnchor, SettingsSectionText } from "./settingsSections.js";

export { javaUnsupportedCopy, sectionCopy, worldFolderCopy } from "./settingsCopy.js";
export type { JavaUnsupportedCopy, SectionCopy, Translate, WorldFolderCopy } from "./settingsCopy.js";

export {
    browseForFolder,
    canBrowseForFolder,
    canListRenders,
    canReportJava,
    canWriteStorageDirectory,
    readStorageDirectory,
    resolveSettingsBridge,
    writeStorageDirectory,
} from "./settingsBridge.js";
export type {
    JavaInstallationReadout,
    JavaRejectionReadout,
    JavaRuntimeBridge,
    JavaRuntimeReadout,
    JavaSource,
    JavaVersionReadout,
    RenderHistoryBridge,
    RenderSummaryReadout,
    SettingsBridge,
    StorageDirectoryBridge,
    StorageDirectoryReadout,
    StorageWriteResult,
} from "./settingsBridge.js";

export { createMapStorageSetting } from "./mapStorageSetting.js";
export type { MapStorageSetting, MapStorageSettingOptions } from "./mapStorageSetting.js";

export {
    createJavaSetting,
    describeJavaInstallation,
    describeJavaRejections,
    newestRender,
} from "./javaSetting.js";
export type { JavaSetting, JavaSettingOptions, JavaSettingState, LastRenderEngine } from "./javaSetting.js";
