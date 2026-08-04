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
export { default as DockedSurface } from "./DockedSurface.vue";
export { default as SettingsSection } from "./SettingsSection.vue";
export { default as SurfacePlacementRow } from "./SurfacePlacementRow.vue";
export { default as StorageSettingRow } from "./StorageSettingRow.vue";
export { default as JavaRuntimeRow } from "./JavaRuntimeRow.vue";
export { default as WorldFolderRow } from "./WorldFolderRow.vue";

export {
    SETTINGS_ANCHORS,
    SETTINGS_SECTIONS,
    filterSections,
    isSettingsAnchor,
    isSettingsSection,
    sectionHaystack,
    sectionSample,
} from "./settingsSections.js";
export type {
    SettingsAnchor,
    SettingsSectionAnchor,
    SettingsSectionText,
} from "./settingsSections.js";

export {
    dockPlacementLabel,
    githubSectionCopy,
    javaUnsupportedCopy,
    sectionCopy,
    worldFolderCopy,
} from "./settingsCopy.js";

/**
 * Where a docked panel sits, which is a setting and therefore lives here.
 *
 * Any surface that wants a persisted placement wraps itself in {@link DockedSurface} and
 * needs none of the rest of this; the pieces are exported because the settings row that
 * lists every panel, and any test that wants to assert on the geometry rather than on a
 * rendered pixel, both need them.
 */
export {
    DOCK_PLACEMENTS,
    DOCK_STORAGE_VERSION,
    FLOATING_MARGIN,
    MINIMUM_THICKNESS,
    clearDockPlacements,
    dockAxis,
    dockStyle,
    floatingOffset,
    isDockPlacement,
    isDockedEdge,
    overlapArea,
    readDockPlacements,
    resolveDockLayout,
    thicknessClearingOpener,
    withPlacement,
    withoutPlacement,
    writeDockPlacements,
} from "./dockPlacement.js";
export type {
    DockLayout,
    DockPlacement,
    DockPlacementRecord,
    DockRequest,
    DockStorage,
    DockedEdge,
    Rect,
    Size,
} from "./dockPlacement.js";

export {
    customisedSurfaceCount,
    dockPlacementState,
    dockedSurfaces,
    hasStoredPlacement,
    placementFor,
    registerDockedSurface,
    reloadDockPlacements,
    resetAllDockPlacements,
    resetDockPlacement,
    setDockPlacement,
    unregisterDockedSurface,
    useRegisteredDockedSurface,
} from "./useDockPlacement.js";
export type { DockedSurfaceInfo } from "./useDockPlacement.js";
export type {
    GitHubSectionCopy,
    JavaUnsupportedCopy,
    SectionCopy,
    Translate,
    WorldFolderCopy,
} from "./settingsCopy.js";

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
