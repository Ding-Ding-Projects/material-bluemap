<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiArrowLeftBold,
    mdiArrowRightBold,
    mdiChevronDown,
    mdiChevronRight,
    mdiPalette,
    mdiRestore,
    mdiTabUnselected,
} from "@mdi/js";
import { VBtn, VDivider, VTextField, VTooltip } from "vuetify/components";
import { appearanceState } from "../appearance/useAppearance.js";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import TabBulkClose from "./TabBulkClose.vue";
import TabMenuList from "./TabMenuList.vue";
import TabResultList from "./TabResultList.vue";
import type { TabClosePlan } from "./closePlans.js";
import { GROUP_COLORS, type TabGroup, type TabStripState } from "./tabModel.js";
import type { TabMenuItem } from "./tabMenus.js";
import { groupSample, searchGroupTabs, type TabHit } from "./tabSearch.js";

/**
 * Everything a group can be told to do, anchored beside the group it belongs to.
 *
 * This is where the contract's second search lives: the per-group tab search,
 * with its own query, mode, flags and anchored builder, scoped by the group's
 * own membership rather than by filtering a strip-wide result. Putting it here
 * rather than on the shared finder is what makes "this group" unambiguous - a
 * group picker on a shared surface is how a per-group search quietly turns into
 * a strip search with an extra filter.
 *
 * The two bulk closes appear here too, scoped to this group, because the
 * contract asks every searchable tab list to carry them. Their preview states
 * the scope in words, so a close run from inside a group can never be mistaken
 * for one run over the strip.
 *
 * **The name is edited in place.** Renaming a group is not a decision that needs
 * a blocking dialog; it is a text field with the current name in it, which
 * writes on input and is announced by its own label.
 *
 * Per-group appearance beyond the colour - typography, badges, borders, state
 * styling - is a full target of the shared appearance editor, under
 * `group.<id>` in the same store every other target in the app uses. This menu
 * only raises `edit-appearance`; `TabStrip.vue` is what actually owns the
 * anchored, non-modal editor surface, because it is anchored to the group's
 * header element rather than to anything this popup can see.
 */
const props = defineProps<{ strip: TabStripState; group: TabGroup }>();

const emit = defineEmits<{
    rename: [name: string];
    "set-color": [color: string];
    "set-collapsed": [collapsed: boolean];
    /** Move the whole group one slot left or right. */
    move: [delta: number];
    /** Ungroup: the group goes, its tabs stay exactly where they were. */
    remove: [];
    /** Opens the anchored appearance editor for this group; `TabStrip.vue` owns the surface. */
    "edit-appearance": [];
    /** Clears this group's appearance overrides; `TabStrip.vue` owns the shared store. */
    "reset-appearance": [];
    activate: [hit: TabHit];
    pin: [hit: TabHit];
    unpin: [hit: TabHit];
    ungroup: [hit: TabHit];
    close: [hit: TabHit];
    apply: [plan: TabClosePlan, options: { closeUnsaved: boolean; keepEmptyGroups: boolean }];
}>();

const { t } = useI18n();

/* -------------------------------------------------------------------------- */
/* The name                                                                    */
/* -------------------------------------------------------------------------- */

const name = ref(props.group.name);

// Kept in step when the group is renamed from somewhere else, without clobbering
// what is being typed here: only an actual change to the stored name writes back.
watch(
    () => props.group.name,
    (value) => {
        if (value !== name.value) name.value = value;
    },
);

function commitName(): void {
    const trimmed = name.value.trim();
    // An empty name would leave a group nothing can be searched or spoken by, so
    // the field springs back rather than storing it.
    if (trimmed === "") {
        name.value = props.group.name;
        return;
    }
    if (trimmed !== props.group.name) emit("rename", trimmed);
}

/* -------------------------------------------------------------------------- */
/* Search 2: inside this group                                                 */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const hits = computed(() =>
    searchGroupTabs(props.strip, props.group.id, createSettingMatcher(query.value, regexMode.value, flags.value)),
);

const summary = computed(() =>
    t(
        "tabs.group.searchSummary",
        { shown: hits.value.length, total: props.group.tabIds.length },
        "Showing {shown} of {total}",
    ),
);

/* -------------------------------------------------------------------------- */
/* Commands                                                                    */
/* -------------------------------------------------------------------------- */

/** True once this group carries any appearance overrides of its own. */
const customised = computed(
    () => appearanceState().value.elements[`group.${props.group.id}`] !== undefined,
);

/*
 * The shortcuts named here are bound by `TabStrip.vue` on the group header, so
 * an item claims a key only where that key really works.
 */
const items = computed<readonly TabMenuItem[]>(() => [
    {
        id: "collapse",
        label: props.group.collapsed
            ? t("tabs.group.expand", "Expand this group")
            : t("tabs.group.collapse", "Collapse this group"),
        icon: props.group.collapsed ? mdiChevronRight : mdiChevronDown,
        shortcut: t("tabs.key.enter", "Enter"),
        danger: false,
    },
    {
        id: "left",
        label: t("tabs.group.moveLeft", "Move this group left"),
        icon: mdiArrowLeftBold,
        shortcut: t("tabs.key.moveLeft", "Ctrl+Shift+Left"),
        danger: false,
    },
    {
        id: "right",
        label: t("tabs.group.moveRight", "Move this group right"),
        icon: mdiArrowRightBold,
        shortcut: t("tabs.key.moveRight", "Ctrl+Shift+Right"),
        danger: false,
    },
    {
        id: "remove",
        label: t("tabs.group.remove", "Ungroup, keeping every tab"),
        icon: mdiTabUnselected,
        shortcut: null,
        danger: false,
    },
    {
        id: "appearance",
        label: t("tabs.group.editAppearance", "Edit group appearance..."),
        icon: mdiPalette,
        shortcut: t("tabs.key.editAppearance", "Ctrl+Shift+F10"),
        danger: false,
    },
    ...(customised.value
        ? [
              {
                  id: "reset-appearance",
                  label: t("tabs.group.resetAppearance", "Reset this group's appearance"),
                  icon: mdiRestore,
                  shortcut: null,
                  danger: false,
              },
          ]
        : []),
]);

function choose(id: string): void {
    if (id === "collapse") emit("set-collapsed", !props.group.collapsed);
    else if (id === "left") emit("move", -1);
    else if (id === "right") emit("move", 1);
    else if (id === "remove") emit("remove");
    else if (id === "appearance") emit("edit-appearance");
    else if (id === "reset-appearance") emit("reset-appearance");
}
</script>

<template>
    <div class="mb-tabs-group-menu">
        <v-text-field
            v-model="name"
            :label="t('tabs.group.name', 'Group name')"
            variant="outlined"
            density="compact"
            hide-details
            spellcheck="false"
            class="mb-tabs-group-menu__name"
            @blur="commitName"
            @keydown.enter.prevent="commitName"
        />

        <div
            class="mb-tabs-group-menu__colors"
            role="radiogroup"
            :aria-label="t('tabs.group.color', 'Group colour')"
        >
            <v-btn
                v-for="color in GROUP_COLORS"
                :key="color"
                class="mb-tabs-group-menu__swatch"
                :color="color"
                :variant="group.color === color ? 'flat' : 'tonal'"
                :aria-label="t('tabs.group.colorNamed', { color }, 'Colour this group {color}')"
                :aria-checked="group.color === color ? 'true' : 'false'"
                role="radio"
                size="x-small"
                icon
                @click="emit('set-color', color)"
            >
                <v-tooltip activator="parent" location="top" :text="color" />
            </v-btn>
        </div>

        <TabMenuList
            :items="items"
            :label="t('tabs.group.menuLabel', { group: group.name }, 'Commands for the group {group}')"
            @choose="choose"
        />

        <v-divider class="mb-tabs-group-menu__rule" />

        <div class="mb-tabs-group-menu__section">
            <h4 class="mb-tabs-group-menu__title">
                {{ t("tabs.group.searchTitle", { group: group.name }, "Search inside {group}") }}
            </h4>
            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                :label="t('tabs.group.searchLabel', { group: group.name }, 'Search the tabs in {group}')"
                :placeholder="t('tabs.find.hint', 'part of a tab label')"
                :sample="groupSample(strip, group.id)"
                :summary="summary"
            />
            <TabResultList
                :hits="hits"
                :show-location="false"
                :empty-message="t('tabs.group.noMatch', 'No tab in this group has a label matching that search.')"
                @activate="emit('activate', $event)"
                @pin="emit('pin', $event)"
                @unpin="emit('unpin', $event)"
                @ungroup="emit('ungroup', $event)"
                @close="emit('close', $event)"
            />
        </div>

        <v-divider class="mb-tabs-group-menu__rule" />

        <div class="mb-tabs-group-menu__section">
            <TabBulkClose
                :strip="strip"
                :group-id="group.id"
                @apply="(plan, options) => emit('apply', plan, options)"
            />
        </div>
    </div>
</template>

<style>
.mb-tabs-group-menu {
    /* Stay within the same narrow viewport clamp as the tab sheet rather than
       forcing the parent wider with a desktop-only intrinsic minimum. */
    box-sizing: border-box;
    width: min(320px, calc(100vw - 16px));
    min-width: 0;
    max-width: 440px;
    padding-block: 8px;
}

.mb-tabs-group-menu__name {
    margin: 4px 12px 8px;
}

.mb-tabs-group-menu__colors {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    padding-inline: 12px;
    padding-block-end: 4px;
}

.mb-tabs-group-menu__swatch {
    width: 24px;
    height: 24px;
}

.mb-tabs-group-menu__rule {
    margin-block: 8px;
}

.mb-tabs-group-menu__section {
    padding-inline: 12px;
}

.mb-tabs-group-menu__title {
    font-size: 0.875rem;
    font-weight: 500;
    margin-block-end: 4px;
}
</style>
