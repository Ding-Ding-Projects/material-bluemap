/**
 * Browser-style tabbed navigation: a persistent strip, an overflow surface that
 * never clips, pinning, groups, four separate searches and two bulk closes.
 *
 * Mount {@link TabbedNavigation}, declare the pages, and render one named slot
 * per page id. It owns the whole layout, restores it on launch and writes it
 * back on every change; nothing else needs to know that tabs exist.
 *
 * ```vue
 * <TabbedNavigation :pages="pages">
 *     <template #map="{ tab }">…</template>
 *     <template #world>…</template>
 * </TabbedNavigation>
 * ```
 *
 * Everything else is exported for tests and for a shell that wants to compose
 * the pieces itself. The four searches are worth naming individually, because
 * "four searches" is the part of the contract most easily reduced to one search
 * with a scope argument:
 *
 *  - {@link searchStripTabs} - the current strip, overflow and collapsed groups
 *    included;
 *  - {@link searchGroupTabs} - one group, scoped by its own membership;
 *  - {@link searchGroups} - group names across every strip;
 *  - {@link searchAllTabs} - every tab in every strip in every window.
 *
 * Each is rendered by its own `ConfigSearchField` with its own anchored builder
 * and its own query, mode and flags. `TabFinder` carries three of them and
 * `TabGroupMenu` carries the per-group one, because that is the only place where
 * "this group" needs no picker to be unambiguous.
 *
 * Per-tab and per-group appearance is deliberately not here. The model carries
 * an opaque {@link AppearanceRecord} on both, storage round-trips it verbatim,
 * and {@link setTabAppearance} and {@link setGroupAppearance} are the attach
 * points; nothing in this folder reads inside those records.
 */

export { default as TabbedNavigation } from "./TabbedNavigation.vue";
export { default as TabStrip } from "./TabStrip.vue";
export { default as TabButton } from "./TabButton.vue";
export { default as TabFinder } from "./TabFinder.vue";
export { default as TabGroupMenu } from "./TabGroupMenu.vue";
export { default as TabMenuList } from "./TabMenuList.vue";
export { default as TabResultList } from "./TabResultList.vue";
export { default as TabBulkClose } from "./TabBulkClose.vue";
export { default as TabClosePanel } from "./TabClosePanel.vue";
export { default as TabPlanPreview } from "./TabPlanPreview.vue";
export { default as TabPlanConfirm } from "./TabPlanConfirm.vue";

export {
    DEFAULT_GROUP_COLOR,
    GROUP_COLORS,
    addTab,
    assignTabToGroup,
    closeTabs,
    createGroup,
    fitCount,
    focusOrder,
    indexStrip,
    isGroupExpanded,
    moveGroup,
    moveTab,
    moveTabToIndex,
    nextId,
    normalizeStrip,
    pinTab,
    pinnedTabs,
    regionOfTab,
    removeGroup,
    renameGroup,
    renameTab,
    setActiveTab,
    setGroupAppearance,
    setGroupCollapsed,
    setGroupColor,
    setTabAppearance,
    setTabDirty,
    stripSegments,
    tabOrder,
    unpinTab,
} from "./tabModel.js";
export type {
    AppearanceRecord,
    GroupColor,
    StripIndex,
    StripSegment,
    TabGroup,
    TabPage,
    TabRecord,
    TabRegion,
    TabSlot,
    TabStripState,
    TabWorkspaceState,
} from "./tabModel.js";

export {
    actionsFor,
    groupNameSample,
    groupSample,
    searchAllTabs,
    searchGroupTabs,
    searchGroups,
    searchStripTabs,
    stripSample,
    stripTabCount,
    workspaceGroupCount,
    workspaceSample,
    workspaceTabCount,
} from "./tabSearch.js";
export type { GroupHit, TabHit, TabResultAction } from "./tabSearch.js";

export {
    applyClosePlan,
    groupsEmptiedBy,
    planCloseOthers,
    planCloseToEdge,
    planTextClose,
} from "./closePlans.js";
export type {
    CloseOutcome,
    ClosePlanKind,
    ClosePlanRefusal,
    ClosePlanScope,
    HeldTab,
    TabClosePlan,
} from "./closePlans.js";

export { filterMenuItems } from "./tabMenus.js";
export type { TabMenuItem } from "./tabMenus.js";

export { TAB_STORAGE_VERSION, readTabWorkspace, writeTabWorkspace } from "./tabStorage.js";
export type { TabStorage } from "./tabStorage.js";
