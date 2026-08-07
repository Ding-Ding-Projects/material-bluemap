<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VIcon } from "vuetify/components";
import { raiseNotice } from "../../stores/notices.js";
import TabStrip from "./TabStrip.vue";
import { applyClosePlan, type TabClosePlan } from "./closePlans.js";
import {
    addTab,
    assignTabToGroup,
    closeTabs,
    createGroup,
    moveGroup,
    moveTab,
    moveTabToIndex,
    pinTab,
    removeGroup,
    renameGroup,
    renameTab,
    setActiveTab,
    setGroupCollapsed,
    setGroupColor,
    setTabPlacement,
    unpinTab,
    type TabPage,
    type TabStripState,
    type TabWorkspaceState,
} from "./tabModel.js";
import { DEFAULT_TAB_STORAGE_KEY, readTabWorkspace, writeTabWorkspace } from "./tabStorage.js";

/**
 * The tabbed shell: one strip, one panel, and the state behind both.
 *
 * This is the component a shell mounts. It owns exactly one
 * {@link TabWorkspaceState}, hands it down to the strip, and applies every
 * change through the pure functions in `tabModel.ts`. Nothing below it holds a
 * copy of the order, which is why what is drawn, what is searched and what is
 * written to storage can never be three different things.
 *
 * ### Pages, and why a tab is not a page
 *
 * The host declares its pages and renders one named slot each; a tab names a
 * page. Two tabs may name the same page, which is the whole difference between
 * a tab strip and a switch statement, and it is why the label lives on the tab
 * rather than being looked up from the page every time something searches.
 *
 * Only the active page's slot is rendered. A hidden panel per tab would keep
 * every page alive, and one of this application's pages holds a map renderer.
 *
 * ### Restoring, and choosing not to
 *
 * The layout is read once at setup and written on every change. A file that is
 * missing, unreadable, from another version, or internally inconsistent gets
 * the same treatment: the defaults are seeded instead, one tab per declared
 * page. That is a deliberate choice over restoring half a layout, because half
 * a layout is indistinguishable from a bug and a fresh one is obviously a fresh
 * one.
 *
 * ### Revealing without un-collapsing
 *
 * `revealed` is the runtime set of groups a search result has opened. It is
 * never persisted and never written into the group's own `collapsed` field, so
 * following a result into a collapsed group leaves the user's saved preference
 * exactly as they left it - which the contract asks for in as many words.
 */
const props = withDefaults(
    defineProps<{
        /** The pages this shell can show. One tab per page is seeded on first run. */
        pages: readonly TabPage[];
        /** Named in every master-search result, so a row is locatable. */
        windowLabel?: string;
        stripLabel?: string;
        /**
         * The storage key this instance's layout is written under.
         *
         * Defaults to the application shell's own key, so mounting this with no
         * `storageKey` behaves exactly as it always has. Any second surface that
         * mounts its own `TabbedNavigation` - settings, the config editor, a
         * project's editor - passes a key of its own, so its tab order, pins and
         * groups persist independently rather than overwriting the shell's.
         */
        storageKey?: string;
        /**
         * Page ids pinned automatically the moment a tab for them first exists - at seed
         * time on a genuinely fresh install, and via {@link ensurePage} for a workspace
         * that predates the page. Never reapplied once a tab already exists: a person who
         * deliberately unpins one of these later keeps it unpinned across every future
         * restart, because "hard to lose by accident" is a promise about the first time a
         * page appears, not a standing rule this component re-enforces against a choice
         * the user already made.
         */
        pinnedPageIds?: readonly string[];
        /**
         * Lets a map-owning shell pass pointer input through this one panel to the canvas
         * behind it. Nested tab sets stay interactive because false is the default; the
         * empty state is explicitly interactive so its reopen buttons remain usable.
         */
        panelPassThrough?: boolean;
    }>(),
    {
        windowLabel: "",
        stripLabel: "",
        storageKey: DEFAULT_TAB_STORAGE_KEY,
        pinnedPageIds: () => [],
        panelPassThrough: false,
    },
);

const { t } = useI18n();

const idPrefix = useId();
const panelId = `${idPrefix}-panel`;

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

function seedStrip(): TabStripState {
    const empty: TabStripState = {
        id: "strip-main",
        label: props.stripLabel === "" ? t("tabs.strip.main", "Main") : props.stripLabel,
        windowId: "window-main",
        windowLabel:
            props.windowLabel === "" ? t("tabs.window.main", "This window") : props.windowLabel,
        placement: "left",
        tabs: [],
        groups: [],
        pinnedOrder: [],
        slots: [],
        activeTabId: null,
    };
    const seeded = props.pages.reduce<TabStripState>(
        (state, page) => addTab(state, { pageId: page.id, label: page.label, icon: page.icon }),
        empty,
    );
    // Pinned before the active tab is chosen: pinning never touches `activeTabId`, so the
    // order makes no difference to which tab ends up in front, but doing it first keeps
    // this function reading top-to-bottom as "build the tabs, plant the pins, then choose
    // what is in front" rather than interleaving the two concerns.
    const pinned = props.pinnedPageIds.reduce<TabStripState>((state, pageId) => {
        const tab = state.tabs.find((candidate) => candidate.pageId === pageId);
        return tab === undefined ? state : pinTab(state, tab.id);
    }, seeded);
    // The first page rather than the last one opened, which is what a fresh
    // install should land on.
    const first = pinned.tabs[0];
    return first === undefined ? pinned : setActiveTab(pinned, first.id);
}

const workspace = ref<TabWorkspaceState>(
    readTabWorkspace(undefined, props.storageKey) ?? { strips: [seedStrip()] },
);

watch(
    workspace,
    (value) => {
        writeTabWorkspace(value, undefined, props.storageKey);
    },
    { deep: true },
);

const strip = computed<TabStripState>(() => workspace.value.strips[0] ?? seedStrip());

/** Replaces one strip, leaving every other strip in the workspace untouched. */
function update(next: TabStripState): void {
    workspace.value = {
        strips: workspace.value.strips.map((candidate) =>
            candidate.id === next.id ? next : candidate,
        ),
    };
}

/**
 * Applies a change to the strip a result named, not to whichever strip is on
 * screen.
 *
 * The master search crosses strips, so a row it returns may belong to one this
 * shell is not currently drawing. Resolving by id is what makes the pin, unpin,
 * ungroup and close on such a row do their labelled job instead of quietly
 * missing; an unknown id changes nothing rather than guessing at the first
 * strip, because acting on the wrong tab is worse than doing nothing.
 */
function updateIn(stripId: string, change: (state: TabStripState) => TabStripState): void {
    const target = workspace.value.strips.find((candidate) => candidate.id === stripId);
    if (target === undefined) return;
    update(change(target));
}

/** Groups temporarily shown because a search result is inside them. */
const revealed = ref<Set<string>>(new Set());

function reveal(groupId: string): void {
    revealed.value = new Set([...revealed.value, groupId]);
}

/*
 * A group the user has collapsed by hand stops being revealed, so the next
 * search result into it reveals it again rather than finding it already open
 * for reasons nobody can remember.
 */
function setCollapsed(groupId: string, collapsed: boolean): void {
    if (collapsed) {
        const next = new Set(revealed.value);
        next.delete(groupId);
        revealed.value = next;
    }
    update(setGroupCollapsed(strip.value, groupId, collapsed));
}

/* -------------------------------------------------------------------------- */
/* The panel                                                                  */
/* -------------------------------------------------------------------------- */

const activeTab = computed(
    () => strip.value.tabs.find((tab) => tab.id === strip.value.activeTabId) ?? null,
);

const activePage = computed(() =>
    activeTab.value === null
        ? null
        : (props.pages.find((page) => page.id === activeTab.value?.pageId) ?? null),
);

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

function openPage(pageId: string): void {
    const page = props.pages.find((candidate) => candidate.id === pageId);
    if (page === undefined) return;
    update(addTab(strip.value, { pageId: page.id, label: page.label, icon: page.icon }));
}

/**
 * Brings a page to the front for a host that has another way in.
 *
 * A shell does not only navigate by clicking tabs: a command palette offers the same
 * destinations, and finishing a render is a reason to land on the map whether or not the map
 * tab is the one on screen. Those routes need a verb, and it is deliberately not
 * {@link openPage}: opening is what a "new tab" gesture means, so an outside destination
 * wired to it would stack a fresh duplicate every time somebody used the palette twice.
 *
 * So an existing tab for the page is activated and only a page with no tab at all opens one.
 * That is the behaviour a person expects from a destination - "take me there", not "make me
 * another one" - and it is why closing the map tab still leaves the palette able to reach the
 * map rather than silently doing nothing.
 */
function revealPage(pageId: string): void {
    const existing = strip.value.tabs.find((tab) => tab.pageId === pageId);
    if (existing === undefined) {
        openPage(pageId);
        return;
    }
    update(setActiveTab(strip.value, existing.id));
}

/**
 * Adds a tab for a page that has never had one in this workspace, without disturbing
 * whichever tab is currently in front - and pins it, when the host asked for that, exactly
 * as {@link seedStrip} would have on a fresh install.
 *
 * This is the upgrade path {@link seedStrip}'s own seeding cannot reach: a page declared
 * after somebody's tab layout was already saved is invisible to a workspace that was
 * written before that page existed, because restoring never invents tabs for pages a saved
 * record does not know about. A host calls this once a page it wants guaranteed reachable -
 * a landing page, say - so an upgrading user gets it too, without their last-active tab
 * being yanked out from under them the way {@link revealPage} would.
 *
 * A no-op once the tab exists, on purpose: it is safe to call on every mount rather than
 * only once, and it never re-pins a tab the user has since unpinned by hand - see the
 * `pinnedPageIds` prop doc for why that matters.
 */
function ensurePage(pageId: string): void {
    const page = props.pages.find((candidate) => candidate.id === pageId);
    if (page === undefined) return;
    if (strip.value.tabs.some((tab) => tab.pageId === pageId)) return;

    const previousActive = strip.value.activeTabId;
    let next = addTab(strip.value, { pageId: page.id, label: page.label, icon: page.icon });
    // `addTab` makes the new tab active; a returning user's place is restored unless the
    // strip had nothing active at all, in which case the new tab is a perfectly reasonable
    // thing to land on.
    if (previousActive !== null && next.tabs.some((tab) => tab.id === previousActive)) {
        next = setActiveTab(next, previousActive);
    }

    if (props.pinnedPageIds.includes(pageId)) {
        const created = next.tabs.find((tab) => tab.pageId === pageId);
        if (created !== undefined) next = pinTab(next, created.id);
    }

    update(next);
}

/**
 * Renames every open tab that shows one page.
 *
 * A page's own label - the string in {@link TabPage.label} - is read only once, when a
 * tab for it is first seeded or opened; after that the tab carries its own label, which is
 * what lets a person rename a tab without the host's static page list overwriting it back.
 * That is fine for a label that never changes, and wrong for one that carries a live count
 * - "Maps (3)" - because nothing then updates the three open tabs already showing "Maps
 * (1)". This is the host's way of pushing that update through deliberately, rather than
 * `TabbedNavigation` guessing which labels are supposed to move on their own.
 */
function renamePage(pageId: string, label: string): void {
    const affected = strip.value.tabs.filter((tab) => tab.pageId === pageId);
    if (affected.length === 0) return;
    update(affected.reduce((state, tab) => renameTab(state, tab.id, label), strip.value));
}

/**
 * The three things a host cannot work out, or safely change, from the outside.
 *
 * `activePage` is exposed because chrome that belongs to one page - a control bar, a floating
 * cluster that has to lift clear of another control - has to know whether that page is the one
 * on screen, and the answer lives in this component's state. Reading it back is the difference
 * between a shell that hides a control when its page is gone and one that leaves a row of
 * buttons pointing at nothing, which is exactly the decorative control this project refuses to
 * ship. `revealPage` and `renamePage` are the only two writes a host gets: which tab is in
 * front, and what an existing tab is called. Everything else about the layout - order, pins,
 * groups - stays changed only through this component's own strip. `ensurePage` is a third,
 * narrower write: it can only add a tab for a page that has none, never move, close or
 * rename one that already exists.
 */
defineExpose({ activePage, revealPage, renamePage, ensurePage });

function newGroup(tabId: string): void {
    update(createGroup(strip.value, { name: t("tabs.group.newName", "New group") }, [tabId]));
}

/**
 * Applies a close plan and says honestly what happened.
 *
 * The three numbers are reported separately because they mean different things:
 * what closed, what was held back for unsaved work, and which groups the close
 * emptied. Rolling them into one "done" is exactly the partial-completion-as-
 * total-success failure the contract names, and the notice level follows the
 * worst of them rather than the best.
 */
function applyPlan(
    plan: TabClosePlan,
    options: { closeUnsaved: boolean; keepEmptyGroups: boolean },
): void {
    const outcome = applyClosePlan(strip.value, plan, options);
    update(outcome.strip);

    const kept = outcome.kept.map((entry) => entry.hit.label);
    const protectedPinned = plan.protectedPinned.map((entry) => entry.hit.label);

    const parts: string[] = [
        t("tabs.close.done", { closed: outcome.closed.length }, "Closed {closed} tabs."),
    ];
    if (kept.length > 0) {
        parts.push(
            t(
                "tabs.close.doneKept",
                { labels: kept.join(", ") },
                "These stayed open because they hold unsaved work: {labels}",
            ),
        );
    }
    if (protectedPinned.length > 0) {
        parts.push(
            t(
                "tabs.close.doneProtected",
                { labels: protectedPinned.join(", ") },
                "Pinned and left alone: {labels}",
            ),
        );
    }
    if (outcome.emptiedGroups.length > 0) {
        parts.push(
            options.keepEmptyGroups
                ? t(
                      "tabs.close.doneGroupsKept",
                      { groups: outcome.emptiedGroups.map((group) => group.name).join(", ") },
                      "These groups are now empty and were kept: {groups}",
                  )
                : t(
                      "tabs.close.doneGroupsGone",
                      { groups: outcome.emptiedGroups.map((group) => group.name).join(", ") },
                      "These groups were emptied and removed: {groups}",
                  ),
        );
    }

    raiseNotice(kept.length > 0 ? "warning" : "success", parts.join(" "));
}
</script>

<template>
    <div
        class="mb-tabs"
        :class="`mb-tabs--${strip.placement}`"
        :data-tab-placement="strip.placement"
    >
        <TabStrip
            :strip="strip"
            :workspace="workspace"
            :revealed="revealed"
            :panel-id="panelId"
            :id-prefix="idPrefix"
            :pages="pages"
            @set-placement="update(setTabPlacement(strip, $event))"
            @activate="(tabId, stripId) => updateIn(stripId, (state) => setActiveTab(state, tabId))"
            @close="(tabId, stripId) => updateIn(stripId, (state) => closeTabs(state, [tabId]))"
            @pin="(tabId, stripId) => updateIn(stripId, (state) => pinTab(state, tabId))"
            @unpin="(tabId, stripId) => updateIn(stripId, (state) => unpinTab(state, tabId))"
            @move-tab="(tabId, delta) => update(moveTab(strip, tabId, delta))"
            @drop-tab="(tabId, index) => update(moveTabToIndex(strip, tabId, index))"
            @new-group="newGroup"
            @assign="
                (tabId, groupId, stripId) =>
                    updateIn(stripId, (state) => assignTabToGroup(state, tabId, groupId))
            "
            @rename-group="(groupId, name) => update(renameGroup(strip, groupId, name))"
            @set-group-color="(groupId, color) => update(setGroupColor(strip, groupId, color))"
            @set-group-collapsed="setCollapsed"
            @move-group="(groupId, delta) => update(moveGroup(strip, groupId, delta))"
            @remove-group="update(removeGroup(strip, $event))"
            @reveal="reveal"
            @open-page="openPage"
            @apply="applyPlan"
        />

        <!--
            One panel, named by the tab that selected it. Only the active page is
            rendered: a hidden panel per tab would keep every page alive, and one
            of them owns a map renderer.
        -->
        <div
            v-if="activeTab !== null && activePage !== null"
            :id="panelId"
            class="mb-tabs__panel"
            :class="{ 'mb-tabs__panel--pointer-passthrough': panelPassThrough }"
            :style="{ pointerEvents: panelPassThrough ? 'none' : 'auto' }"
            role="tabpanel"
            :aria-labelledby="`${idPrefix}-tab-${activeTab.id}`"
            tabindex="0"
        >
            <slot :name="activePage.id" :tab="activeTab" :page="activePage">
                <!--
                    A page with no slot says so rather than showing an empty
                    rectangle that reads as a rendering fault.
                -->
                <p class="mb-tabs__missing">
                    {{
                        t(
                            "tabs.panel.missing",
                            { page: activePage.label },
                            "This build has no content for the page {page}.",
                        )
                    }}
                </p>
            </slot>
        </div>

        <!--
            Every tab closed. An honest empty state with the one action that
            leaves it, rather than a blank area or a tab conjured up to keep the
            strip looking populated.
        -->
        <div
            v-else
            class="mb-tabs__empty"
            :class="{ 'mb-tabs__empty--pointer-interactive': panelPassThrough }"
            :style="{ pointerEvents: 'auto' }"
            role="status"
        >
            <p class="mb-tabs__empty-line">{{ t("tabs.panel.empty", "Every tab is closed.") }}</p>
            <div class="mb-tabs__empty-actions">
                <v-btn
                    v-for="page in pages"
                    :key="page.id"
                    variant="tonal"
                    size="small"
                    @click="openPage(page.id)"
                >
                    <v-icon v-if="page.icon" :icon="page.icon" size="18" start aria-hidden="true" />
                    {{ page.label }}
                </v-btn>
            </div>
        </div>
    </div>
</template>

<style>
.mb-tabs {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
}

.mb-tabs--left,
.mb-tabs--right {
    flex-direction: row;
}

html[dir="rtl"] .mb-tabs--left,
html[dir="rtl"] .mb-tabs--right {
    direction: ltr;
}

html[dir="rtl"] .mb-tabs--left > *,
html[dir="rtl"] .mb-tabs--right > * {
    direction: rtl;
}

.mb-tabs--right .mb-tabs-strip-row,
.mb-tabs--bottom .mb-tabs-strip-row {
    order: 2;
}

.mb-tabs__panel {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
}

.mb-tabs__panel--pointer-passthrough {
    pointer-events: none;
}

.mb-tabs__empty--pointer-interactive {
    pointer-events: auto;
}

.mb-tabs__panel:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.mb-tabs__empty {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
}

.mb-tabs__empty-line,
.mb-tabs__missing {
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-tabs__missing {
    padding: 24px;
}

.mb-tabs__empty-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
}
</style>
