<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiArrowLeftBold,
    mdiArrowRightBold,
    mdiChevronDown,
    mdiChevronRight,
    mdiClose,
    mdiDotsHorizontal,
    mdiMagnify,
    mdiPalette,
    mdiPin,
    mdiPinOffOutline,
    mdiPlus,
    mdiRestore,
    mdiTabPlus,
    mdiTabUnselected,
} from "@mdi/js";
import {
    VBadge,
    VBtn,
    VChip,
    VDivider,
    VIcon,
    VList,
    VListItem,
    VListSubheader,
    VMenu,
    VTooltip,
} from "vuetify/components";
import AppearanceEditor from "../appearance/AppearanceEditor.vue";
import { appearanceStyle } from "../appearance/appearanceRecord.js";
import { resolveTarget, withElementReset } from "../appearance/appearanceStore.js";
import {
    appearanceState,
    commitAppearance,
    fontCatalog,
    registerAppearanceTarget,
    typographyCapabilities,
    unregisterAppearanceTarget,
} from "../appearance/useAppearance.js";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { onRevealRequested } from "../shell/revealRequests.js";
import TabButton from "./TabButton.vue";
import TabFinder from "./TabFinder.vue";
import TabGroupMenu from "./TabGroupMenu.vue";
import TabGroupPicker from "./TabGroupPicker.vue";
import TabMenuList from "./TabMenuList.vue";
import TabPlanConfirm from "./TabPlanConfirm.vue";
import { planCloseOthers, planCloseToEdge, type TabClosePlan } from "./closePlans.js";
import {
    filterHiddenSegments,
    fitCount,
    focusOrder,
    isGroupExpanded,
    pinnedTabs,
    regionOfTab,
    stripSegments,
    type TabPage,
    type TabRecord,
    type TabStripState,
    type TabWorkspaceState,
} from "./tabModel.js";
import type { TabMenuItem } from "./tabMenus.js";
import type { GroupHit, TabHit } from "./tabSearch.js";

/**
 * The tab strip: a pinned region, groups, ordinary tabs, and an overflow surface
 * that is never a clipped edge.
 *
 * The strip renders and reports; it changes nothing. Every action emits to the
 * host, which owns the one {@link TabStripState} and hands a new one back down.
 * That is why there is no local copy of the order here to drift out of step with
 * what was persisted.
 *
 * ### Nothing is ever silently clipped
 *
 * When the ordinary region cannot hold every segment, the ones that do not fit
 * are moved into an overflow menu and the button says how many. The arithmetic
 * is `fitCount` in `tabModel.ts`, which pays for the overflow button out of the
 * same budget - otherwise the button lands on top of the tab that only just
 * fitted, and a tab hidden under a button is exactly the failure the contract
 * names. Widths are measured once per segment and cached, because a hidden
 * element measures zero and a recompute from zeroes would flap between states.
 *
 * The pinned region is measured out of the budget first and never overflows, so
 * a pinned tab stays reachable however many ordinary tabs are open. Pinned tabs
 * render compact when the strip is tight and keep their full accessible name
 * through `aria-label`, so what a screen reader announces does not shrink with
 * the button.
 *
 * ### Roles and roving focus
 *
 * One `role="tablist"`, one `role="tab"` per tab, and `aria-controls` on the
 * selected tab only - the other panels are not rendered, and pointing at an
 * element that does not exist is worse than pointing at nothing. Exactly one tab
 * carries `tabindex="0"`, so Tab reaches the strip once and the arrow keys move
 * within it. A group header is a button inside the tablist: it is deliberately
 * not a tab, it is skipped by the arrow keys, and it announces its own name,
 * count and expanded state.
 *
 * Tabs inside a collapsed group are not in the focus order, because focus that
 * lands on something not drawn looks like the key did nothing. They are still in
 * the strip, still searchable, and still closed by a close-to-the-right.
 *
 * ### Appearance
 *
 * Every tab and every group is a target of the shared appearance editor, under
 * the ids `tab.<id>` and `group.<id>` in the same global, id-keyed store every
 * other target in the app uses (the title bar, the tab bar itself, a project
 * row) - not the opaque `appearance` field `tabModel.ts` reserves on the record
 * itself. That field stays exactly as it was: unread, round-tripped verbatim,
 * and free for whatever eventually wants a slot that travels with the tab's own
 * persistence rather than with the appearance feature's. Using the shared store
 * instead means a tab gets the whole editor - typography, presets, export,
 * reset - for free, rather than a second, smaller implementation of it.
 *
 * The context menu gains **Edit tab appearance...** / **Edit group appearance...**
 * underneath the existing commands, Shift+right-click on a tab or a group header
 * opens the editor directly, and Ctrl+Shift+F10 does the same from the keyboard -
 * mirroring `AppearanceTarget`'s own convention exactly, so the gesture means the
 * same thing everywhere in this application. The editor is anchored to the tab
 * or group element, not to the pointer, and closing it returns focus there.
 *
 * The whole strip is itself wrapped in its own `AppearanceTarget` (`app.tabBar`, in
 * `App.vue`) for right-clicks on strip chrome that is neither a tab nor a group -
 * empty space, the pinned-region divider. That wrapper listens for the identical
 * `contextmenu` and `ContextMenu`/`Shift+F10`/`Ctrl+Shift+F10` gestures on its own
 * root element, so every one of `onTabContextMenu`, `onTabKeydown`,
 * `onGroupContextMenu` and `onGroupKeydown` above calls `event.stopPropagation()`
 * the moment it decides a tab or group owns the gesture. Without that stop, the
 * native event keeps bubbling past this component after being handled here and
 * fires the wrapper's handler too, opening a second, independent menu or editor
 * stacked at the same anchor point - two `v-menu` overlays neither one closes for
 * the other. The stop is what keeps "right-click a tab" and "right-click the bare
 * strip" from ever answering to the same handler.
 */
const props = defineProps<{
    strip: TabStripState;
    /** Every strip the application owns, for the master search on the finder. */
    workspace: TabWorkspaceState;
    /** Groups revealed by a search result: expanded on screen, unchanged on disk. */
    revealed: ReadonlySet<string>;
    /** The id of the one rendered tabpanel, for `aria-controls`. */
    panelId: string;
    /**
     * The host's id prefix, so the panel can point back at its tab.
     *
     * Generated by the host rather than here because `aria-labelledby` on the
     * panel and `id` on the tab have to agree, and they live in two components.
     */
    idPrefix: string;
    /** The pages a new tab may show. */
    pages: readonly TabPage[];
}>();

const emit = defineEmits<{
    /*
     * The five tab actions carry the strip the tab belongs to.
     *
     * Four of them can arrive from the master search, whose results may name a
     * strip this component never drew. Passing the id lets the host apply the
     * change where the tab actually is; without it a result from another strip
     * would be a row that looks live and quietly does nothing, which is the
     * decorative control this project refuses to ship.
     */
    activate: [tabId: string, stripId: string];
    close: [tabId: string, stripId: string];
    pin: [tabId: string, stripId: string];
    unpin: [tabId: string, stripId: string];
    "move-tab": [tabId: string, delta: number];
    "drop-tab": [tabId: string, index: number];
    "new-group": [tabId: string];
    assign: [tabId: string, groupId: string | null, stripId: string];
    "rename-group": [groupId: string, name: string];
    "set-group-color": [groupId: string, color: string];
    "set-group-collapsed": [groupId: string, collapsed: boolean];
    "move-group": [groupId: string, delta: number];
    "remove-group": [groupId: string];
    /** Show a collapsed group's tabs for now, without writing the preference. */
    reveal: [groupId: string];
    "open-page": [pageId: string];
    apply: [plan: TabClosePlan, options: { closeUnsaved: boolean; keepEmptyGroups: boolean }];
}>();

const { t } = useI18n();

const tabDomId = (tabId: string): string => `${props.idPrefix}-tab-${tabId}`;
const groupDomId = (groupId: string): string => `${props.idPrefix}-group-${groupId}`;
const tabAppearanceId = (tabId: string): string => `tab.${tabId}`;
const groupAppearanceId = (groupId: string): string => `group.${groupId}`;

const pinned = computed(() => pinnedTabs(props.strip));
const segments = computed(() => stripSegments(props.strip));

/* -------------------------------------------------------------------------- */
/* Registering every tab and group as an appearance target                    */
/* -------------------------------------------------------------------------- */

/**
 * Keeps the appearance editor's registry honest as tabs and groups come and go.
 *
 * `AppearanceTarget` registers itself once per mounted component because it is one component
 * per element; a tab is a plain row inside one `v-for`, so this strip does the same
 * register-on-mount, unregister-on-unmount bookkeeping itself, diffed against the strip's
 * current membership rather than tied to any one component's lifecycle.
 */
const registeredAppearanceIds = new Set<string>();

function syncAppearanceRegistrations(): void {
    const desired = new Map<string, string>();
    for (const tab of props.strip.tabs) desired.set(tabAppearanceId(tab.id), tab.label);
    for (const group of props.strip.groups) desired.set(groupAppearanceId(group.id), group.name);

    for (const [id, label] of desired) {
        if (registeredAppearanceIds.has(id)) continue;
        registerAppearanceTarget({ id, labelKey: `appearance.target.${id}`, fallback: label });
        registeredAppearanceIds.add(id);
    }
    for (const id of [...registeredAppearanceIds]) {
        if (desired.has(id)) continue;
        unregisterAppearanceTarget(id);
        registeredAppearanceIds.delete(id);
    }
}

watch(() => [props.strip.tabs, props.strip.groups], syncAppearanceRegistrations, {
    immediate: true,
    deep: true,
});

onBeforeUnmount(() => {
    for (const id of registeredAppearanceIds) unregisterAppearanceTarget(id);
    registeredAppearanceIds.clear();
});

/**
 * The live style every tab and group actually paints, resolved from the same global store
 * the editor writes to.
 *
 * One computed per kind rather than one `useAppearanceTarget` call per tab: the ids in a
 * strip come and go with every open, close, pin and group, and a hook meant to be called
 * once per element does not fit a `v-for` whose membership changes at runtime. This reaches
 * for the same pure pieces `AppearanceEditor.vue` and `useAppearanceTarget` are built from,
 * so a tab painted here and a tab painted through the editor's own preview never disagree.
 */
const globalAppearance = appearanceState();
const fonts = fontCatalog();

const tabStyles = computed<Record<string, Record<string, string>>>(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const tab of props.strip.tabs) {
        map[tab.id] = appearanceStyle(
            resolveTarget(globalAppearance.value, tabAppearanceId(tab.id)),
            typographyCapabilities,
            fonts.value,
        ).style;
    }
    return map;
});

const groupStyles = computed<Record<string, Record<string, string>>>(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const group of props.strip.groups) {
        map[group.id] = appearanceStyle(
            resolveTarget(globalAppearance.value, groupAppearanceId(group.id)),
            typographyCapabilities,
            fonts.value,
        ).style;
    }
    return map;
});

function tabIsCustomised(tabId: string): boolean {
    return globalAppearance.value.elements[tabAppearanceId(tabId)] !== undefined;
}

function resetTabAppearance(tabId: string): void {
    commitAppearance(withElementReset(globalAppearance.value, tabAppearanceId(tabId)));
}

function resetGroupAppearance(groupId: string): void {
    commitAppearance(withElementReset(globalAppearance.value, groupAppearanceId(groupId)));
}

/* -------------------------------------------------------------------------- */
/* Overflow                                                                   */
/* -------------------------------------------------------------------------- */

/** Roughly the overflow button, in pixels, paid for out of the width budget. */
const OVERFLOW_WIDTH = 44;

const ordinaryEl = ref<HTMLElement | null>(null);
const available = ref(0);
/** Measured natural width per segment, kept while the segment is in the overflow. */
const widths = ref<Record<string, number>>({});

const segmentKey = (index: number): string => {
    const segment = segments.value[index];
    if (segment === undefined) return `#${index}`;
    return segment.kind === "tab" ? `tab:${segment.tab.id}` : `group:${segment.group.id}`;
};

function measure(): void {
    const host = ordinaryEl.value;
    if (host === null) return;
    available.value = host.clientWidth;
    const next = { ...widths.value };
    for (const element of Array.from(host.querySelectorAll<HTMLElement>("[data-segment]"))) {
        const key = element.dataset["segment"];
        if (key === undefined) continue;
        const width = element.offsetWidth;
        if (width > 0) next[key] = width;
    }
    widths.value = next;
}

let observer: ResizeObserver | null = null;

onMounted(() => {
    measure();
    // jsdom and older runtimes have no ResizeObserver; the strip then simply
    // measures once, which is correct for a window that never resizes and
    // harmless for a test that has no layout at all.
    if (typeof ResizeObserver !== "undefined" && ordinaryEl.value !== null) {
        observer = new ResizeObserver(() => {
            measure();
        });
        observer.observe(ordinaryEl.value);
    }
});

onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
});

watch(
    () => props.strip,
    () => {
        void nextTick(measure);
    },
);

const visibleCount = computed(() =>
    fitCount(
        segments.value.map((_, index) => widths.value[segmentKey(index)] ?? 0),
        available.value,
        OVERFLOW_WIDTH,
    ),
);

const hiddenSegments = computed(() => segments.value.slice(visibleCount.value));

/* -------------------------------------------------------------------------- */
/* Roving focus                                                               */
/* -------------------------------------------------------------------------- */

const focusedId = ref<string | null>(props.strip.activeTabId);

watch(
    () => props.strip.activeTabId,
    (value) => {
        if (value !== null) focusedId.value = value;
    },
);

const order = computed(() => focusOrder(props.strip, props.revealed));

/** Exactly one tab is in the page's tab order; the arrows do the rest. */
function isRoving(tab: TabRecord): boolean {
    const current = focusedId.value;
    if (current !== null && order.value.some((candidate) => candidate.id === current)) return tab.id === current;
    return order.value[0]?.id === tab.id;
}

function focusTab(tabId: string): void {
    focusedId.value = tabId;
    void nextTick(() => {
        document.getElementById(tabDomId(tabId))?.focus();
    });
}

/** Selects a tab and moves focus onto it, which is what every entrance does. */
function goTo(tabId: string): void {
    emit("activate", tabId, props.strip.id);
    focusTab(tabId);
}

function step(delta: number): void {
    const list = order.value;
    if (list.length === 0) return;
    const index = list.findIndex((tab) => tab.id === focusedId.value);
    const next = list[Math.max(0, Math.min(list.length - 1, (index === -1 ? 0 : index) + delta))];
    if (next !== undefined) goTo(next.id);
}

function onTabKeydown(event: KeyboardEvent, tab: TabRecord): void {
    // The reorder chord is checked first: it shares its arrows with plain
    // movement, and a chord that fell through would move focus as well as the tab.
    if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            emit("move-tab", tab.id, event.key === "ArrowLeft" ? -1 : 1);
            focusTab(tab.id);
            return;
        }
    }
    if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
    } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
    } else if (event.key === "Home") {
        event.preventDefault();
        const first = order.value[0];
        if (first !== undefined) goTo(first.id);
    } else if (event.key === "End") {
        event.preventDefault();
        const last = order.value.at(-1);
        if (last !== undefined) goTo(last.id);
    } else if (event.key === "Delete") {
        event.preventDefault();
        emit("close", tab.id, props.strip.id);
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        // This tab now owns the whole gesture, so the native event must not go on to
        // bubble into the `app.tabBar` `AppearanceTarget` wrapping the entire strip:
        // that wrapper binds this exact same chord, and an unstopped event reaching it
        // would open its own independent menu or editor on top of this one, anchored at
        // the same point. See `onTabContextMenu` below for the pointer-driven twin of
        // this stop.
        event.stopPropagation();
        // Ctrl+Shift+F10 goes straight to the appearance editor, mirroring the mouse's
        // Shift+right-click exactly and `AppearanceTarget`'s own keyboard convention.
        if (event.ctrlKey) openTabAppearanceEditor(tab);
        else openTabMenuAt(tab, event.currentTarget as HTMLElement);
    }
}

/* -------------------------------------------------------------------------- */
/* Dragging                                                                   */
/* -------------------------------------------------------------------------- */

const dragging = ref<string | null>(null);

/** Where a tab sits inside its own region, which is the index a drop means. */
function regionIndex(tabId: string): number {
    const region = regionOfTab(props.strip, tabId);
    if (region === "pinned") return props.strip.pinnedOrder.indexOf(tabId);
    if (region === "group") {
        const group = props.strip.groups.find((candidate) => candidate.tabIds.includes(tabId));
        return group === undefined ? -1 : group.tabIds.indexOf(tabId);
    }
    return props.strip.slots.findIndex((slot) => slot.kind === "tab" && slot.tabId === tabId);
}

function onDrop(target: TabRecord): void {
    const moving = dragging.value;
    dragging.value = null;
    if (moving === null || moving === target.id) return;
    // A drag never crosses a region. Pinning, unpinning and grouping are explicit
    // commands with their own menu items, because a drop that silently ungrouped
    // a tab is indistinguishable from a bug.
    if (regionOfTab(props.strip, moving) !== regionOfTab(props.strip, target.id)) return;
    emit("drop-tab", moving, regionIndex(target.id));
}

/* -------------------------------------------------------------------------- */
/* The tab context menu                                                       */
/* -------------------------------------------------------------------------- */

const tabMenuOpen = ref(false);
const tabMenuTab = ref<TabRecord | null>(null);
const tabMenuTarget = ref<HTMLElement | [number, number] | undefined>(undefined);
/** Non-null while the menu is showing a bulk-close preview instead of its rows. */
const tabMenuPlan = ref<"others" | "toStart" | "toEnd" | null>(null);

function openTabMenuAt(tab: TabRecord, target: HTMLElement | [number, number]): void {
    // Overlay exclusivity: a plain right-click while the appearance editor or the group
    // picker is still open on this (or another) tab must not stack the ordinary menu on
    // top of it -- both are `:scrim="false"` anchored overlays, so nothing else closes
    // them implicitly. Same reasoning as the two `openTab*` functions below.
    tabAppearanceOpen.value = false;
    tabGroupPickerOpen.value = false;
    tabMenuTab.value = tab;
    tabMenuTarget.value = target;
    tabMenuPlan.value = null;
    tabMenuOpen.value = true;
}

/**
 * Closes the tab-management menu and puts focus back on the tab it belonged to,
 * whichever way the menu closed: a command chosen, Escape, or a click outside it.
 * The one function every closing path below goes through, so "focus returns to
 * the originating tab" is true of all of them rather than of whichever path
 * happened to remember it.
 */
function closeTabMenu(): void {
    tabMenuOpen.value = false;
    tabMenuPlan.value = null;
    const tab = tabMenuTab.value;
    void nextTick(() => {
        if (tab !== null) document.getElementById(tabDomId(tab.id))?.focus();
    });
}

function onTabContextMenu(event: MouseEvent, tab: TabRecord): void {
    event.preventDefault();
    // This tab is the whole story for this right-click: stop the native event before it
    // can bubble up into the `app.tabBar` `AppearanceTarget` wrapping the entire strip.
    // That wrapper has its own `@contextmenu` listener, and without this the same click
    // opened both this tab's menu AND the whole-bar editor's menu, stacked at the same
    // point - the exact collision this stop exists to kill.
    event.stopPropagation();
    // Shift+right-click is the direct route to the appearance editor, exactly as it is on
    // every other `AppearanceTarget` in the app: no menu, straight to the editor.
    if (event.shiftKey) {
        openTabAppearanceEditor(tab);
        return;
    }
    openTabMenuAt(tab, [event.clientX, event.clientY]);
}

/* -------------------------------------------------------------------------- */
/* The tab's own appearance editor                                            */
/* -------------------------------------------------------------------------- */

const tabAppearanceOpen = ref(false);
const tabAppearanceTab = ref<TabRecord | null>(null);
const tabAppearanceTarget = ref<HTMLElement | undefined>(undefined);

/** Anchored to the tab element itself, never to the pointer, so it behaves like the keyboard path. */
function openTabAppearanceEditor(tab: TabRecord): void {
    tabMenuOpen.value = false;
    // Overlay exclusivity: don't let the group picker keep showing underneath.
    tabGroupPickerOpen.value = false;
    tabAppearanceTab.value = tab;
    tabAppearanceTarget.value = document.getElementById(tabDomId(tab.id)) ?? undefined;
    tabAppearanceOpen.value = true;
}

function closeTabAppearanceEditor(): void {
    tabAppearanceOpen.value = false;
    const tab = tabAppearanceTab.value;
    void nextTick(() => {
        if (tab !== null) document.getElementById(tabDomId(tab.id))?.focus();
    });
}

/* -------------------------------------------------------------------------- */
/* The "Move this tab into group..." picker                                   */
/* -------------------------------------------------------------------------- */

const tabGroupPickerOpen = ref(false);
const tabGroupPickerTab = ref<TabRecord | null>(null);
const tabGroupPickerTarget = ref<HTMLElement | undefined>(undefined);
const tabGroupPickerRef = ref<InstanceType<typeof TabGroupPicker> | null>(null);

/**
 * Anchored to the tab element itself, exactly like the appearance editor above, so the
 * picker never covers the tab it is moving and closing it always has somewhere real to
 * return focus to.
 */
function openTabGroupPicker(tab: TabRecord): void {
    tabMenuOpen.value = false;
    // Overlay exclusivity: don't let the appearance editor keep showing underneath.
    tabAppearanceOpen.value = false;
    tabGroupPickerTab.value = tab;
    tabGroupPickerTarget.value = document.getElementById(tabDomId(tab.id)) ?? undefined;
    tabGroupPickerOpen.value = true;
    void nextTick(() => tabGroupPickerRef.value?.focus());
}

function closeTabGroupPicker(): void {
    tabGroupPickerOpen.value = false;
    const tab = tabGroupPickerTab.value;
    void nextTick(() => {
        if (tab !== null) document.getElementById(tabDomId(tab.id))?.focus();
    });
}

function onTabGroupPickerAssign(groupId: string): void {
    const tab = tabGroupPickerTab.value;
    closeTabGroupPicker();
    if (tab !== null) emit("assign", tab.id, groupId, props.strip.id);
}

function onTabGroupPickerNewGroup(): void {
    const tab = tabGroupPickerTab.value;
    closeTabGroupPicker();
    // Reuses the strip's existing `new-group` event verbatim -- the same one the old
    // "Put this tab in a new group" menu item emitted -- so the host's `createGroup` call
    // is not forked for this picker.
    if (tab !== null) emit("new-group", tab.id);
}

/** The picker's own tab's current group, computed independently of `tabMenuTab` so it
 *  stays correct even though the menu closes the instant the picker opens. */
const tabGroupPickerExcludeGroupId = computed(() => {
    const tab = tabGroupPickerTab.value;
    if (tab === null) return null;
    return props.strip.groups.find((group) => group.tabIds.includes(tab.id))?.id ?? null;
});

const menuTabIsPinned = computed(() =>
    tabMenuTab.value === null ? false : props.strip.pinnedOrder.includes(tabMenuTab.value.id),
);

const menuTabGroup = computed(() =>
    tabMenuTab.value === null
        ? null
        : (props.strip.groups.find((group) => group.tabIds.includes(tabMenuTab.value?.id ?? "")) ?? null),
);

/*
 * Each shortcut named here is bound by `onTabKeydown` above, on the very tab the
 * menu belongs to. An item claims a key only where that key really works.
 */
const tabMenuItems = computed<readonly TabMenuItem[]>(() => {
    const items: TabMenuItem[] = [
        {
            id: "close",
            label: t("tabs.action.closeThis", "Close this tab"),
            icon: mdiClose,
            shortcut: t("tabs.key.delete", "Delete"),
            danger: true,
        },
        {
            id: "left",
            label: t("tabs.action.moveLeft", "Move this tab left"),
            icon: mdiArrowLeftBold,
            shortcut: t("tabs.key.moveLeft", "Ctrl+Shift+Left"),
            danger: false,
        },
        {
            id: "right",
            label: t("tabs.action.moveRight", "Move this tab right"),
            icon: mdiArrowRightBold,
            shortcut: t("tabs.key.moveRight", "Ctrl+Shift+Right"),
            danger: false,
        },
        {
            id: menuTabIsPinned.value ? "unpin" : "pin",
            label: menuTabIsPinned.value
                ? t("tabs.action.unpinThis", "Unpin this tab")
                : t("tabs.action.pinThis", "Pin this tab"),
            icon: menuTabIsPinned.value ? mdiPinOffOutline : mdiPin,
            shortcut: null,
            danger: false,
        },
        {
            id: "others",
            label: t("tabs.action.closeOthers", "Close the other tabs..."),
            icon: mdiClose,
            shortcut: null,
            danger: true,
        },
        {
            id: "toStart",
            label: t("tabs.action.closeToStart", "Close the tabs to the left..."),
            icon: mdiClose,
            shortcut: null,
            danger: true,
        },
        {
            id: "toEnd",
            label: t("tabs.action.closeToEnd", "Close the tabs to the right..."),
            icon: mdiClose,
            shortcut: null,
            danger: true,
        },
        {
            // Opens the group picker rather than growing one menu item per existing group
            // (that used to be `new-group` plus one `assign:${group.id}` per group). The
            // picker's own "New group..." row covers what the old `new-group` item did.
            id: "assign-picker",
            label: t("tabGroupPicker.menuEntry", "Move this tab into group..."),
            icon: mdiTabPlus,
            shortcut: null,
            danger: false,
        },
        {
            id: "appearance",
            label: t("tabs.action.editAppearance", "Edit tab appearance..."),
            icon: mdiPalette,
            shortcut: t("tabs.key.editAppearance", "Ctrl+Shift+F10"),
            danger: false,
        },
    ];

    if (tabIsCustomised(tabMenuTab.value?.id ?? "")) {
        items.push({
            id: "reset-appearance",
            label: t("tabs.action.resetAppearance", "Reset this tab's appearance"),
            icon: mdiRestore,
            shortcut: null,
            danger: false,
        });
    }

    if (menuTabGroup.value !== null) {
        items.push({
            id: "ungroup",
            label: t("tabs.action.ungroupThis", "Take this tab out of its group"),
            icon: mdiTabUnselected,
            shortcut: null,
            danger: false,
        });
    }

    return items;
});

function onTabMenuChoose(id: string): void {
    const tab = tabMenuTab.value;
    if (tab === null) return;

    if (id === "others" || id === "toStart" || id === "toEnd") {
        // These stay inside the menu and become a preview with its own gate,
        // rather than closing several tabs the instant they are clicked.
        tabMenuPlan.value = id;
        return;
    }

    if (id === "appearance") {
        // Opens its own anchored surface rather than closing back to nothing, so the
        // menu-driven route and the Shift+right-click route land in the same place.
        openTabAppearanceEditor(tab);
        return;
    }
    if (id === "reset-appearance") {
        resetTabAppearance(tab.id);
        closeTabMenu();
        return;
    }
    if (id === "assign-picker") {
        // Same reasoning as "appearance" above: opens its own anchored surface rather than
        // closing back to nothing.
        openTabGroupPicker(tab);
        return;
    }

    closeTabMenu();
    if (id === "close") emit("close", tab.id, props.strip.id);
    else if (id === "left") emit("move-tab", tab.id, -1);
    else if (id === "right") emit("move-tab", tab.id, 1);
    else if (id === "pin") emit("pin", tab.id, props.strip.id);
    else if (id === "unpin") emit("unpin", tab.id, props.strip.id);
    else if (id === "ungroup") emit("assign", tab.id, null, props.strip.id);
}

const planTitle = computed(() => {
    if (tabMenuPlan.value === "others") return t("tabs.action.closeOthers", "Close the other tabs...");
    if (tabMenuPlan.value === "toStart") return t("tabs.action.closeToStart", "Close the tabs to the left...");
    return t("tabs.action.closeToEnd", "Close the tabs to the right...");
});

/** Rebuilt on every pinned-choice change; the gate reads whichever this returns. */
function buildMenuPlan(includePinned: boolean): TabClosePlan {
    const tab = tabMenuTab.value;
    const kind = tabMenuPlan.value;
    if (tab === null || kind === null) return planCloseOthers(props.strip, "", includePinned);
    if (kind === "others") return planCloseOthers(props.strip, tab.id, includePinned);
    return planCloseToEdge(props.strip, tab.id, kind === "toStart" ? "start" : "end", includePinned);
}

function onPlanApplied(plan: TabClosePlan, options: { closeUnsaved: boolean; keepEmptyGroups: boolean }): void {
    closeTabMenu();
    emit("apply", plan, options);
}

/* -------------------------------------------------------------------------- */
/* The group menu                                                             */
/* -------------------------------------------------------------------------- */

const groupMenuOpen = ref(false);
const groupMenuId = ref<string | null>(null);
const groupMenuTarget = ref<HTMLElement | [number, number] | undefined>(undefined);

const groupMenuGroup = computed(() =>
    props.strip.groups.find((group) => group.id === groupMenuId.value) ?? null,
);

function openGroupMenu(groupId: string, target: HTMLElement | [number, number]): void {
    groupMenuId.value = groupId;
    groupMenuTarget.value = target;
    groupMenuOpen.value = true;
}

/**
 * Closes the group-management menu and puts focus back on the group header it
 * belonged to, whichever way the menu closed - mirrors {@link closeTabMenu}
 * exactly, for the same reason: one function every closing path goes through.
 */
function closeGroupMenu(): void {
    groupMenuOpen.value = false;
    const groupId = groupMenuId.value;
    void nextTick(() => {
        if (groupId !== null) document.getElementById(groupDomId(groupId))?.focus();
    });
}

function onGroupContextMenu(event: MouseEvent, groupId: string): void {
    event.preventDefault();
    // Same reasoning as `onTabContextMenu`: the group header owns this right-click, so it
    // must not also reach the `app.tabBar` wrapper around the whole strip.
    event.stopPropagation();
    if (event.shiftKey) {
        openGroupAppearanceEditor(groupId);
        return;
    }
    openGroupMenu(groupId, [event.clientX, event.clientY]);
}

function onGroupKeydown(event: KeyboardEvent, groupId: string, collapsed: boolean): void {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            emit("move-group", groupId, event.key === "ArrowLeft" ? -1 : 1);
            return;
        }
    }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        // Same stop as `onTabKeydown`: this header owns the chord, so the wrapper around
        // the whole strip must never see it too.
        event.stopPropagation();
        if (event.ctrlKey) openGroupAppearanceEditor(groupId);
        else openGroupMenu(groupId, event.currentTarget as HTMLElement);
    } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        emit("set-group-collapsed", groupId, !collapsed);
    }
}

/* -------------------------------------------------------------------------- */
/* The group's own appearance editor                                          */
/* -------------------------------------------------------------------------- */

const groupAppearanceOpen = ref(false);
const groupAppearanceGroupId = ref<string | null>(null);
const groupAppearanceTarget = ref<HTMLElement | undefined>(undefined);

const groupAppearanceGroup = computed(() =>
    props.strip.groups.find((group) => group.id === groupAppearanceGroupId.value) ?? null,
);

function openGroupAppearanceEditor(groupId: string): void {
    groupMenuOpen.value = false;
    groupAppearanceGroupId.value = groupId;
    groupAppearanceTarget.value = document.getElementById(groupDomId(groupId)) ?? undefined;
    groupAppearanceOpen.value = true;
}

function closeGroupAppearanceEditor(): void {
    groupAppearanceOpen.value = false;
    const groupId = groupAppearanceGroupId.value;
    void nextTick(() => {
        if (groupId !== null) document.getElementById(groupDomId(groupId))?.focus();
    });
}

/* -------------------------------------------------------------------------- */
/* The finder, and results coming back from it                                */
/* -------------------------------------------------------------------------- */

const finderOpen = ref(false);
const overflowOpen = ref(false);
const newTabMenuOpen = ref(false);

/* -------------------------------------------------------------------------- */
/* The new-tab picker's own filter                                            */
/* -------------------------------------------------------------------------- */

/**
 * The new-tab picker was a bare fixed `v-list`, the last one in this file with no search
 * field of its own. `TabMenuItem`/`TabMenuList` do not fit here: a page's icon can be
 * `null` and there is no shortcut or danger styling to show, so the filter is wired
 * directly to the existing markup instead, the same way the tab-strip overflow list below
 * it is.
 */
const newTabQuery = ref("");
const newTabRegexMode = ref(false);
const newTabFlags = ref("i");

const newTabMatcher = computed(() =>
    createSettingMatcher(newTabQuery.value, newTabRegexMode.value, newTabFlags.value),
);

const filteredPages = computed(() => props.pages.filter((page) => newTabMatcher.value.test(page.label)));

const newTabSample = computed(() => props.pages.map((page) => page.label).join("\n"));

watch(newTabMenuOpen, (open) => {
    if (open) return;
    newTabQuery.value = "";
    newTabRegexMode.value = false;
});

function onNewTabMenuKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    if (newTabQuery.value === "") return;
    event.preventDefault();
    event.stopPropagation();
    newTabQuery.value = "";
}

/* -------------------------------------------------------------------------- */
/* The overflow list's own filter                                             */
/* -------------------------------------------------------------------------- */

const overflowQuery = ref("");
const overflowRegexMode = ref(false);
const overflowFlags = ref("i");

const overflowMatcher = computed(() =>
    createSettingMatcher(overflowQuery.value, overflowRegexMode.value, overflowFlags.value),
);

/** The same segments `hiddenSegments` already draws, narrowed by `filterHiddenSegments`
 *  in `tabModel.ts` -- see that function for exactly what "narrowed" means for a group. */
const filteredHiddenSegments = computed(() =>
    filterHiddenSegments(hiddenSegments.value, (label) => overflowMatcher.value.test(label)),
);

/** What the builder previews against: every row this menu can show, flattened. */
const overflowSample = computed(() =>
    hiddenSegments.value
        .flatMap((segment) => (segment.kind === "tab" ? [segment.tab.label] : [segment.group.name, ...segment.tabs.map((tab) => tab.label)]))
        .join("\n"),
);

watch(overflowOpen, (open) => {
    if (open) return;
    overflowQuery.value = "";
    overflowRegexMode.value = false;
});

function onOverflowMenuKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    if (overflowQuery.value === "") return;
    event.preventDefault();
    event.stopPropagation();
    overflowQuery.value = "";
}

/*
 * The command palette can ask for the finder by name.
 *
 * It sets this component's own state rather than being handed a method through a template ref
 * threaded down from the shell, because the panel is anchored to a button this component draws
 * and closes back onto it: the open-state belongs here and hoisting it would put the shell in
 * charge of a panel it cannot see. `components/shell/revealRequests.ts` says why this is a
 * doorbell rather than a prop.
 */
onRevealRequested("tabFinder", () => {
    finderOpen.value = true;
});

/**
 * Landing on a result.
 *
 * A result inside a collapsed group is revealed rather than expanded: `reveal`
 * adds the group to the host's runtime set and the saved collapsed preference is
 * left exactly as the user set it. Focus then moves onto the tab itself, which
 * is the return path from the search back into the strip.
 */
function onResult(hit: TabHit): void {
    finderOpen.value = false;
    overflowOpen.value = false;
    if (hit.stripId !== props.strip.id) {
        // Another strip owns it, so the host selects it there. Focus stays put:
        // this component can only move focus onto something it drew.
        emit("activate", hit.tabId, hit.stripId);
        return;
    }
    if (hit.groupId !== null && hit.groupCollapsed) emit("reveal", hit.groupId);
    goTo(hit.tabId);
}

/**
 * A tab chosen out of the overflow menu.
 *
 * Revealing first matters here as much as it does for a search result: an
 * overflowed group may be collapsed, and selecting a member without revealing it
 * would move the selection somewhere with nothing on screen to show for it.
 */
function onOverflowChoice(tabId: string, groupId: string | null, collapsed: boolean): void {
    overflowOpen.value = false;
    if (groupId !== null && collapsed) emit("reveal", groupId);
    goTo(tabId);
}

function onGroupResult(hit: GroupHit): void {
    emit("reveal", hit.groupId);
    finderOpen.value = false;
    void nextTick(() => {
        document.getElementById(`${props.idPrefix}-group-${hit.groupId}`)?.focus();
    });
}

const tabCountLabel = computed(() =>
    t("tabs.strip.label", { strip: props.strip.label, count: props.strip.tabs.length }, "{strip}, {count} tabs"),
);
</script>

<template>
    <div class="mb-tabs-strip-row">
        <div
            class="mb-tabs-strip"
            role="tablist"
            :aria-label="tabCountLabel"
            :aria-orientation="'horizontal'"
        >
            <!--
                The pinned region. Measured out of the budget before the ordinary
                tabs, so it never overflows and a pinned tab is always reachable.
            -->
            <div v-if="pinned.length > 0" class="mb-tabs-strip__pinned" role="presentation">
                <TabButton
                    v-for="tab in pinned"
                    :key="tab.id"
                    :tab="tab"
                    :dom-id="tabDomId(tab.id)"
                    :active="tab.id === strip.activeTabId"
                    :roving="isRoving(tab)"
                    :panel-id="panelId"
                    :style="tabStyles[tab.id]"
                    :data-tutorial-anchor="`tab-${tab.pageId}`"
                    compact
                    pinned
                    @activate="goTo(tab.id)"
                    @close="emit('close', tab.id, strip.id)"
                    @keydown="onTabKeydown($event, tab)"
                    @menu="onTabContextMenu($event, tab)"
                    @dragstart="dragging = tab.id"
                    @drop="onDrop(tab)"
                />

                <v-divider vertical class="mb-tabs-strip__rule" />
            </div>

            <!-- The ordinary region: lone tabs and whole groups, in slot order. -->
            <div ref="ordinaryEl" class="mb-tabs-strip__ordinary" role="presentation">
                <template v-for="(segment, index) in segments" :key="segmentKey(index)">
                    <div
                        v-show="index < visibleCount"
                        :data-segment="segmentKey(index)"
                        class="mb-tabs-strip__segment"
                        role="presentation"
                    >
                        <!-- A lone tab. -->
                        <TabButton
                            v-if="segment.kind === 'tab'"
                            :tab="segment.tab"
                            :dom-id="tabDomId(segment.tab.id)"
                            :active="segment.tab.id === strip.activeTabId"
                            :roving="isRoving(segment.tab)"
                            :panel-id="panelId"
                            :style="tabStyles[segment.tab.id]"
                            :data-tutorial-anchor="`tab-${segment.tab.pageId}`"
                            @activate="goTo(segment.tab.id)"
                            @close="emit('close', segment.tab.id, strip.id)"
                            @keydown="onTabKeydown($event, segment.tab)"
                            @menu="onTabContextMenu($event, segment.tab)"
                            @dragstart="dragging = segment.tab.id"
                            @drop="onDrop(segment.tab)"
                        />

                        <!-- A whole group: its header, then its tabs when expanded. -->
                        <div v-else class="mb-tabs-strip__group" role="presentation">
                            <button
                                :id="`${idPrefix}-group-${segment.group.id}`"
                                class="mb-tabs-strip__group-head"
                                type="button"
                                :style="groupStyles[segment.group.id]"
                                :aria-expanded="isGroupExpanded(segment.group, revealed) ? 'true' : 'false'"
                                :aria-label="
                                    t(
                                        'tabs.group.headLabel',
                                        { group: segment.group.name, count: segment.tabs.length },
                                        '{group}, {count} tabs',
                                    )
                                "
                                @click="emit('set-group-collapsed', segment.group.id, !segment.group.collapsed)"
                                @keydown="onGroupKeydown($event, segment.group.id, segment.group.collapsed)"
                                @contextmenu="onGroupContextMenu($event, segment.group.id)"
                            >
                                <v-icon
                                    :icon="isGroupExpanded(segment.group, revealed) ? mdiChevronDown : mdiChevronRight"
                                    size="16"
                                    aria-hidden="true"
                                />
                                <v-chip size="x-small" :color="segment.group.color" variant="tonal">
                                    {{ segment.group.name }}
                                </v-chip>
                                <span class="mb-tabs-strip__count" aria-hidden="true">{{ segment.tabs.length }}</span>
                            </button>

                            <v-btn
                                :icon="mdiDotsHorizontal"
                                :aria-label="
                                    t(
                                        'tabs.group.menu',
                                        { group: segment.group.name },
                                        'Commands for the group {group}',
                                    )
                                "
                                variant="text"
                                size="x-small"
                                density="comfortable"
                                @click="openGroupMenu(segment.group.id, $event.currentTarget as HTMLElement)"
                            />

                            <template v-if="isGroupExpanded(segment.group, revealed)">
                                <TabButton
                                    v-for="tab in segment.tabs"
                                    :key="tab.id"
                                    :tab="tab"
                                    :dom-id="tabDomId(tab.id)"
                                    :active="tab.id === strip.activeTabId"
                                    :roving="isRoving(tab)"
                                    :panel-id="panelId"
                                    :style="tabStyles[tab.id]"
                                    :data-tutorial-anchor="`tab-${tab.pageId}`"
                                    @activate="goTo(tab.id)"
                                    @close="emit('close', tab.id, strip.id)"
                                    @keydown="onTabKeydown($event, tab)"
                                    @menu="onTabContextMenu($event, tab)"
                                    @dragstart="dragging = tab.id"
                                    @drop="onDrop(tab)"
                                />
                            </template>
                        </div>
                    </div>
                </template>
            </div>
        </div>

        <div class="mb-tabs-strip__controls">
            <!-- New tab: a real menu of the pages this shell can show. -->
            <v-btn
                :icon="mdiPlus"
                :aria-label="t('tabs.strip.newTab', 'Open a new tab')"
                variant="text"
                size="small"
                density="comfortable"
            >
                <v-icon :icon="mdiPlus" />
                <v-menu v-model="newTabMenuOpen" activator="parent" location="bottom end" offset="4">
                    <div class="mb-tabs-strip__sheet" @keydown="onNewTabMenuKeydown">
                        <ConfigSearchField
                            v-model="newTabQuery"
                            v-model:regex="newTabRegexMode"
                            v-model:flags="newTabFlags"
                            :label="t('tabs.menu.filter', 'Filter these commands')"
                            :sample="newTabSample"
                            class="mb-tabs-strip__menu-filter"
                        />

                        <p v-if="filteredPages.length === 0" class="mb-tabs-strip__menu-empty" role="status">
                            {{
                                t(
                                    "tabs.menu.noMatch",
                                    "No command here matches that. Clearing the filter brings them all back.",
                                )
                            }}
                        </p>

                        <v-list v-else density="compact" :aria-label="t('tabs.strip.newTab', 'Open a new tab')">
                            <v-list-item v-for="page in filteredPages" :key="page.id" @click="emit('open-page', page.id)">
                                <template v-if="page.icon" #prepend>
                                    <v-icon :icon="page.icon" size="18" aria-hidden="true" />
                                </template>
                                {{ page.label }}
                            </v-list-item>
                        </v-list>
                    </div>
                </v-menu>
            </v-btn>

            <!--
                The overflow surface. It exists only when something really is out
                of sight, and it lists exactly those segments, so a tab that does
                not fit is one click away rather than gone.
            -->
            <v-badge
                v-if="hiddenSegments.length > 0"
                :content="hiddenSegments.length"
                color="primary"
                offset-x="4"
                offset-y="4"
            >
                <v-btn
                    :icon="mdiChevronDown"
                    :aria-label="
                        t(
                            'tabs.strip.overflow',
                            { count: hiddenSegments.length },
                            '{count} tabs do not fit. Show them.',
                        )
                    "
                    :aria-expanded="overflowOpen ? 'true' : 'false'"
                    variant="text"
                    size="small"
                    density="comfortable"
                >
                    <v-icon :icon="mdiChevronDown" />
                    <v-menu v-model="overflowOpen" activator="parent" location="bottom end" offset="4">
                        <div class="mb-tabs-strip__sheet" @keydown="onOverflowMenuKeydown">
                            <ConfigSearchField
                                v-model="overflowQuery"
                                v-model:regex="overflowRegexMode"
                                v-model:flags="overflowFlags"
                                :label="t('tabs.menu.filter', 'Filter these commands')"
                                :sample="overflowSample"
                                class="mb-tabs-strip__menu-filter"
                            />

                            <p
                                v-if="filteredHiddenSegments.length === 0"
                                class="mb-tabs-strip__menu-empty"
                                role="status"
                            >
                                {{
                                    t(
                                        "tabs.menu.noMatch",
                                        "No command here matches that. Clearing the filter brings them all back.",
                                    )
                                }}
                            </p>

                            <v-list
                                v-else
                                density="compact"
                                :aria-label="t('tabs.strip.overflowList', 'Tabs that do not fit')"
                            >
                                <template
                                    v-for="segment in filteredHiddenSegments"
                                    :key="segment.kind === 'tab' ? segment.tab.id : segment.group.id"
                                >
                                    <v-list-item
                                        v-if="segment.kind === 'tab'"
                                        @click="onOverflowChoice(segment.tab.id, null, false)"
                                    >
                                        {{ segment.tab.label }}
                                    </v-list-item>
                                    <template v-else>
                                        <!--
                                            A subheader, not a disabled row. The group
                                            name is a label here, and a row drawn like a
                                            command that refuses every click is worse
                                            than a heading that never claimed to be one.
                                        -->
                                        <v-list-subheader>{{ segment.group.name }}</v-list-subheader>
                                        <v-list-item
                                            v-for="tab in segment.tabs"
                                            :key="tab.id"
                                            class="mb-tabs-strip__overflow-member"
                                            @click="onOverflowChoice(tab.id, segment.group.id, segment.group.collapsed)"
                                        >
                                            {{ tab.label }}
                                        </v-list-item>
                                    </template>
                                </template>
                            </v-list>
                        </div>
                    </v-menu>
                </v-btn>
            </v-badge>

            <!--
                The searchable tab list, always available rather than only when
                the strip overflows: it is where three of the four searches and
                both bulk closes live. `eager` keeps its queries alive between
                openings, which is the return path from a result back to the
                search that found it.
            -->
            <v-btn
                :icon="mdiMagnify"
                :aria-label="t('tabs.find.title', 'Find a tab')"
                :aria-expanded="finderOpen ? 'true' : 'false'"
                variant="text"
                size="small"
                density="comfortable"
            >
                <v-icon :icon="mdiMagnify" />
                <v-tooltip activator="parent" location="bottom" :text="t('tabs.find.title', 'Find a tab')" />
                <v-menu
                    v-model="finderOpen"
                    activator="parent"
                    :close-on-content-click="false"
                    location="bottom end"
                    offset="4"
                    eager
                >
                    <div class="mb-tabs-strip__sheet">
                        <TabFinder
                            :workspace="workspace"
                            :strip="strip"
                            @activate="onResult"
                            @pin="emit('pin', $event.tabId, $event.stripId)"
                            @unpin="emit('unpin', $event.tabId, $event.stripId)"
                            @ungroup="emit('assign', $event.tabId, null, $event.stripId)"
                            @close="emit('close', $event.tabId, $event.stripId)"
                            @focus-group="onGroupResult"
                            @set-collapsed="(hit, collapsed) => emit('set-group-collapsed', hit.groupId, collapsed)"
                            @apply="(plan, options) => emit('apply', plan, options)"
                        />
                    </div>
                </v-menu>
            </v-btn>
        </div>

        <!--
            One menu for whichever tab was right-clicked, anchored at the pointer.
            The explicit close handler covers Escape and an outside click, the two
            routes that close the menu without going through `closeTabMenu` itself,
            so focus still returns to the tab whichever way this closes.
        -->
        <v-menu
            v-model="tabMenuOpen"
            :target="tabMenuTarget"
            :close-on-content-click="false"
            location="bottom start"
            offset="4"
            @update:model-value="(value: boolean) => !value && closeTabMenu()"
        >
            <div class="mb-tabs-strip__sheet">
                <TabPlanConfirm
                    v-if="tabMenuPlan !== null"
                    :strip="strip"
                    :title="planTitle"
                    :build="buildMenuPlan"
                    @apply="onPlanApplied"
                />
                <TabMenuList
                    v-else-if="tabMenuTab !== null"
                    :items="tabMenuItems"
                    :label="
                        t('tabs.action.menuLabel', { label: tabMenuTab.label }, 'Commands for the tab {label}')
                    "
                    @choose="onTabMenuChoose"
                />
            </div>
        </v-menu>

        <!--
            And one for whichever group's header was opened. Same explicit close
            handler, for the same reason as the tab menu above.
        -->
        <v-menu
            v-model="groupMenuOpen"
            :target="groupMenuTarget"
            :close-on-content-click="false"
            location="bottom start"
            offset="4"
            @update:model-value="(value: boolean) => !value && closeGroupMenu()"
        >
            <div class="mb-tabs-strip__sheet">
                <TabGroupMenu
                    v-if="groupMenuGroup !== null"
                    :strip="strip"
                    :group="groupMenuGroup"
                    @rename="emit('rename-group', groupMenuGroup.id, $event)"
                    @set-color="emit('set-group-color', groupMenuGroup.id, $event)"
                    @set-collapsed="emit('set-group-collapsed', groupMenuGroup.id, $event)"
                    @move="emit('move-group', groupMenuGroup.id, $event)"
                    @remove="
                        closeGroupMenu();
                        emit('remove-group', groupMenuGroup.id);
                    "
                    @edit-appearance="openGroupAppearanceEditor(groupMenuGroup.id)"
                    @reset-appearance="resetGroupAppearance(groupMenuGroup.id)"
                    @activate="onResult"
                    @pin="emit('pin', $event.tabId, $event.stripId)"
                    @unpin="emit('unpin', $event.tabId, $event.stripId)"
                    @ungroup="emit('assign', $event.tabId, null, $event.stripId)"
                    @close="emit('close', $event.tabId, $event.stripId)"
                    @apply="
                        (plan, options) => {
                            closeGroupMenu();
                            emit('apply', plan, options);
                        }
                    "
                />
            </div>
        </v-menu>

        <!--
            The tab's own appearance editor: non-modal, anchored to the tab rather than to
            wherever the pointer was, with no scrim so the tab it is editing stays visible.
            Reached from the menu item above, from Shift+right-click, and from
            Ctrl+Shift+F10 - the same three routes `AppearanceTarget` offers everywhere else.
        -->
        <v-menu
            v-model="tabAppearanceOpen"
            :target="tabAppearanceTarget"
            :open-on-click="false"
            :close-on-content-click="false"
            :scrim="false"
            location="end top"
            offset="12"
            @update:model-value="(value: boolean) => !value && closeTabAppearanceEditor()"
        >
            <AppearanceEditor
                v-if="tabAppearanceTab !== null"
                :target-id="tabAppearanceId(tabAppearanceTab.id)"
                :target-label="tabAppearanceTab.label"
            />
        </v-menu>

        <!--
            "Move this tab into group...", anchored to the tab exactly like the appearance
            editor above rather than to wherever the menu happened to open, so it never
            covers the tab it is about to move.
        -->
        <v-menu
            v-model="tabGroupPickerOpen"
            :target="tabGroupPickerTarget"
            :open-on-click="false"
            :close-on-content-click="false"
            :scrim="false"
            location="end top"
            offset="12"
            @update:model-value="(value: boolean) => !value && closeTabGroupPicker()"
        >
            <TabGroupPicker
                v-if="tabGroupPickerTab !== null"
                ref="tabGroupPickerRef"
                :strip="strip"
                :exclude-group-id="tabGroupPickerExcludeGroupId"
                :tab-label="tabGroupPickerTab.label"
                @assign="onTabGroupPickerAssign"
                @new-group="onTabGroupPickerNewGroup"
                @cancel="closeTabGroupPicker"
            />
        </v-menu>

        <!-- And the same, anchored to the group's own header, for a group. -->
        <v-menu
            v-model="groupAppearanceOpen"
            :target="groupAppearanceTarget"
            :open-on-click="false"
            :close-on-content-click="false"
            :scrim="false"
            location="end top"
            offset="12"
            @update:model-value="(value: boolean) => !value && closeGroupAppearanceEditor()"
        >
            <AppearanceEditor
                v-if="groupAppearanceGroup !== null"
                :target-id="groupAppearanceId(groupAppearanceGroup.id)"
                :target-label="groupAppearanceGroup.name"
            />
        </v-menu>
    </div>
</template>

<style>
.mb-tabs-strip-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding-inline: 4px;
    background: rgb(var(--v-theme-surface));
    border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.mb-tabs-strip {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1 1 auto;
    min-width: 0;
    /*
     * Never a scrollbar and never a clipped edge: what does not fit is moved
     * into the overflow menu by `fitCount`, so there is nothing here to scroll.
     */
    overflow: hidden;
}

.mb-tabs-strip__pinned,
.mb-tabs-strip__ordinary,
.mb-tabs-strip__segment,
.mb-tabs-strip__group {
    display: flex;
    align-items: center;
    gap: 4px;
}

.mb-tabs-strip__ordinary {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
}

.mb-tabs-strip__rule {
    height: 20px;
    margin-inline: 4px;
}

.mb-tabs-strip__tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 14rem;
    min-width: 0;
    padding: 6px 10px;
    border: 0;
    border-radius: 8px 8px 0 0;
    background: transparent;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font: inherit;
    font-size: 0.8125rem;
    line-height: 1.4;
    cursor: pointer;
    transition: background-color 120ms ease;
}

.mb-tabs-strip__tab--pinned {
    max-width: none;
    padding-inline: 8px;
}

.mb-tabs-strip__tab:hover {
    background: rgba(var(--v-theme-on-surface), 0.06);
}

.mb-tabs-strip__tab--active {
    background: rgba(var(--v-theme-primary), 0.14);
    color: rgb(var(--v-theme-on-surface));
    font-weight: 500;
}

.mb-tabs-strip__tab:focus-visible,
.mb-tabs-strip__group-head:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-tabs-strip__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Unsaved work, shown as well as announced through the tab's own title. */
.mb-tabs-strip__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgb(var(--v-theme-primary));
    flex: 0 0 auto;
}

.mb-tabs-strip__x {
    opacity: 0.6;
}

.mb-tabs-strip__x:hover {
    opacity: 1;
}

.mb-tabs-strip__group {
    padding-inline: 4px;
    border-radius: 10px;
    background: rgba(var(--v-theme-on-surface), 0.04);
}

.mb-tabs-strip__group-head {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
}

.mb-tabs-strip__count {
    font-size: 0.6875rem;
    opacity: 0.7;
}

.mb-tabs-strip__controls {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
}

.mb-tabs-strip__sheet {
    background: rgb(var(--v-theme-surface));
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    max-height: min(70vh, 640px);
    overflow-y: auto;
}

.mb-tabs-strip__overflow-member {
    padding-inline-start: 28px;
}

.mb-tabs-strip__menu-filter {
    margin: 8px 8px 4px;
}

.mb-tabs-strip__menu-empty {
    padding: 8px 12px 12px;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

@media (prefers-reduced-motion: reduce) {
    .mb-tabs-strip__tab {
        transition: none;
    }
}
</style>
