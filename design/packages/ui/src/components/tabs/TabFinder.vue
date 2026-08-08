<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { mdiChevronDown, mdiChevronRight, mdiCropFree } from "@mdi/js";
import { VBtn, VChip, VIcon } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import TabBulkClose from "./TabBulkClose.vue";
import TabResultList from "./TabResultList.vue";
import type { TabClosePlan } from "./closePlans.js";
import type { TabStripState, TabWorkspaceState } from "./tabModel.js";
import {
    groupNameSample,
    searchAllTabs,
    searchGroups,
    searchStripTabs,
    stripSample,
    workspaceGroupCount,
    workspaceSample,
    workspaceTabCount,
    type GroupHit,
    type TabHit,
} from "./tabSearch.js";

/**
 * The searchable tab list: three of the contract's four searches, and both bulk
 * closes, on one anchored surface.
 *
 * The fourth - the per-group search - lives in each group's own menu, because
 * that is the only place where "this group" is unambiguous. Putting it here
 * would need a group picker, and a picker is exactly how a per-group search
 * quietly becomes a strip search with a filter.
 *
 * Each field below declares its own `query`, `regexMode` and `flags`. That is
 * three separate `createSettingMatcher` calls over three different corpora, and
 * three separate `ConfigSearchField`s each opening its own builder anchored to
 * itself. Nothing is shared, including the sample text the builders preview
 * against, which is deliberately the real corpus of that particular search so a
 * preview cannot promise a match the search then fails to return.
 *
 * The three sections collapse. A person who opened this to close a batch of tabs
 * should not have to scroll past three search results to reach the buttons, and
 * a section that merely describes the collection starts collapsed - which is why
 * the strip's own search is the one that starts open.
 */
const props = defineProps<{
    /** Every strip the application owns, which is what the master search covers. */
    workspace: TabWorkspaceState;
    /** The strip this surface was opened from. */
    strip: TabStripState;
}>();

const emit = defineEmits<{
    activate: [hit: TabHit];
    pin: [hit: TabHit];
    unpin: [hit: TabHit];
    ungroup: [hit: TabHit];
    close: [hit: TabHit];
    /** Reveal a group and put focus on its header, without changing its saved state. */
    "focus-group": [hit: GroupHit];
    /** Write the collapsed preference for a group. */
    "set-collapsed": [hit: GroupHit, collapsed: boolean];
    apply: [plan: TabClosePlan, options: { closeUnsaved: boolean; keepEmptyGroups: boolean }];
}>();

const { t } = useI18n();

/* -------------------------------------------------------------------------- */
/* Search 1: this strip                                                        */
/* -------------------------------------------------------------------------- */

const stripQuery = ref("");
const stripRegex = ref(false);
const stripFlags = ref("i");

const stripHits = computed(() =>
    searchStripTabs(props.strip, createSettingMatcher(stripQuery.value, stripRegex.value, stripFlags.value)),
);

const stripSummary = computed(() =>
    t(
        "tabs.find.stripSummary",
        { shown: stripHits.value.length, total: props.strip.tabs.length },
        "Showing {shown} of {total}",
    ),
);

/* -------------------------------------------------------------------------- */
/* Search 4: every tab, everywhere                                             */
/* -------------------------------------------------------------------------- */

const allQuery = ref("");
const allRegex = ref(false);
const allFlags = ref("i");

const allHits = computed(() =>
    searchAllTabs(props.workspace, createSettingMatcher(allQuery.value, allRegex.value, allFlags.value)),
);

/**
 * How wide "everywhere" actually is, stated rather than implied.
 *
 * A master search that finds two results is telling the truth about a
 * single-window application, and saying how many windows and strips it looked
 * through is what makes that reading obvious instead of suspicious.
 */
const allSummary = computed(() =>
    t(
        "tabs.find.allSummary",
        {
            shown: allHits.value.length,
            total: workspaceTabCount(props.workspace),
            windows: new Set(props.workspace.strips.map((strip) => strip.windowId)).size,
            strips: props.workspace.strips.length,
        },
        "Showing {shown} of {total} tabs, across {windows} windows and {strips} strips",
    ),
);

/* -------------------------------------------------------------------------- */
/* Search 3: groups by name                                                    */
/* -------------------------------------------------------------------------- */

const groupQuery = ref("");
const groupRegex = ref(false);
const groupFlags = ref("i");

const groupHits = computed(() =>
    searchGroups(props.workspace, createSettingMatcher(groupQuery.value, groupRegex.value, groupFlags.value)),
);

const groupSummary = computed(() =>
    t(
        "tabs.find.groupSummary",
        { shown: groupHits.value.length, total: workspaceGroupCount(props.workspace) },
        "Showing {shown} of {total} groups",
    ),
);

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

const sectionIds = {
    strip: useId(),
    all: useId(),
    groups: useId(),
    close: useId(),
};

/** Open: the strip's own search. Collapsed: everything that merely describes. */
const open = ref<Record<string, boolean>>({
    strip: true,
    all: false,
    groups: false,
    close: false,
});

function toggle(key: string): void {
    open.value = { ...open.value, [key]: !(open.value[key] ?? false) };
}

function isOpen(key: string): boolean {
    return open.value[key] ?? false;
}
</script>

<template>
    <div class="mb-tabs-finder">
        <h3 class="mb-tabs-finder__title">{{ t("tabs.find.title", "Find a tab") }}</h3>

        <!-- Search 1 -->
        <section class="mb-tabs-finder__section">
            <v-btn
                class="mb-tabs-finder__toggle"
                variant="text"
                size="small"
                block
                :aria-expanded="isOpen('strip') ? 'true' : 'false'"
                :aria-controls="sectionIds.strip"
                @click="toggle('strip')"
            >
                <v-icon :icon="isOpen('strip') ? mdiChevronDown : mdiChevronRight" size="18" aria-hidden="true" />
                <span class="mb-tabs-finder__toggle-label">
                    {{ t("tabs.find.strip", { strip: strip.label }, "Search this strip: {strip}") }}
                </span>
            </v-btn>

            <div v-show="isOpen('strip')" :id="sectionIds.strip" class="mb-tabs-finder__body">
                <ConfigSearchField
                    v-model="stripQuery"
                    v-model:regex="stripRegex"
                    v-model:flags="stripFlags"
                    :label="t('tabs.find.stripLabel', 'Search the tabs in this strip')"
                    :placeholder="t('tabs.find.hint', 'part of a tab label')"
                    :sample="stripSample(strip)"
                    :summary="stripSummary"
                />
                <TabResultList
                    :hits="stripHits"
                    :show-location="false"
                    :empty-message="
                        t('tabs.find.noneStrip', 'No tab in this strip has a label matching that search.')
                    "
                    @activate="emit('activate', $event)"
                    @pin="emit('pin', $event)"
                    @unpin="emit('unpin', $event)"
                    @ungroup="emit('ungroup', $event)"
                    @close="emit('close', $event)"
                />
            </div>
        </section>

        <!-- Search 4 -->
        <section class="mb-tabs-finder__section">
            <v-btn
                class="mb-tabs-finder__toggle"
                variant="text"
                size="small"
                block
                :aria-expanded="isOpen('all') ? 'true' : 'false'"
                :aria-controls="sectionIds.all"
                @click="toggle('all')"
            >
                <v-icon :icon="isOpen('all') ? mdiChevronDown : mdiChevronRight" size="18" aria-hidden="true" />
                <span class="mb-tabs-finder__toggle-label">
                    {{ t("tabs.find.all", "Search every open tab, in every window") }}
                </span>
            </v-btn>

            <div v-show="isOpen('all')" :id="sectionIds.all" class="mb-tabs-finder__body">
                <ConfigSearchField
                    v-model="allQuery"
                    v-model:regex="allRegex"
                    v-model:flags="allFlags"
                    :label="t('tabs.find.allLabel', 'Search every open tab')"
                    :placeholder="t('tabs.find.hint', 'part of a tab label')"
                    :sample="workspaceSample(workspace)"
                    :summary="allSummary"
                />
                <TabResultList
                    :hits="allHits"
                    :empty-message="t('tabs.find.noneAll', 'No open tab anywhere has a label matching that search.')"
                    @activate="emit('activate', $event)"
                    @pin="emit('pin', $event)"
                    @unpin="emit('unpin', $event)"
                    @ungroup="emit('ungroup', $event)"
                    @close="emit('close', $event)"
                />
            </div>
        </section>

        <!-- Search 3 -->
        <section class="mb-tabs-finder__section">
            <v-btn
                class="mb-tabs-finder__toggle"
                variant="text"
                size="small"
                block
                :aria-expanded="isOpen('groups') ? 'true' : 'false'"
                :aria-controls="sectionIds.groups"
                @click="toggle('groups')"
            >
                <v-icon :icon="isOpen('groups') ? mdiChevronDown : mdiChevronRight" size="18" aria-hidden="true" />
                <span class="mb-tabs-finder__toggle-label">
                    {{ t("tabs.find.groups", "Search tab groups by name") }}
                </span>
            </v-btn>

            <div v-show="isOpen('groups')" :id="sectionIds.groups" class="mb-tabs-finder__body">
                <ConfigSearchField
                    v-model="groupQuery"
                    v-model:regex="groupRegex"
                    v-model:flags="groupFlags"
                    :label="t('tabs.find.groupsLabel', 'Search group names')"
                    :placeholder="t('tabs.find.groupHint', 'part of a group name')"
                    :sample="groupNameSample(workspace)"
                    :summary="groupSummary"
                />

                <p v-if="groupHits.length === 0" class="mb-tabs-finder__empty" role="status">
                    {{ t("tabs.find.noneGroups", "No group has a name matching that search.") }}
                </p>

                <ul v-else class="mb-tabs-finder__groups">
                    <li v-for="hit in groupHits" :key="`${hit.stripId}:${hit.groupId}`">
                        <v-btn
                            variant="text"
                            size="small"
                            block
                            class="mb-tabs-finder__group"
                            :prepend-icon="mdiCropFree"
                            @click="emit('focus-group', hit)"
                        >
                            {{ hit.name }}
                        </v-btn>
                        <div class="mb-tabs-finder__group-meta">
                            <v-chip
                                class="mb-tabs-finder__group-name"
                                size="x-small"
                                :color="hit.color"
                                variant="tonal"
                            >
                                {{ hit.name }}
                            </v-chip>
                            <v-chip size="x-small" variant="outlined">
                                {{ t("tabs.find.groupCount", { count: hit.tabCount }, "{count} tabs") }}
                            </v-chip>
                            <v-chip size="x-small" variant="outlined">{{ hit.windowLabel }}</v-chip>
                            <v-chip size="x-small" variant="outlined">{{ hit.stripLabel }}</v-chip>
                            <v-btn
                                variant="text"
                                size="x-small"
                                density="comfortable"
                                @click="emit('set-collapsed', hit, !hit.collapsed)"
                            >
                                {{
                                    hit.collapsed
                                        ? t("tabs.group.expand", "Expand")
                                        : t("tabs.group.collapse", "Collapse")
                                }}
                            </v-btn>
                        </div>
                    </li>
                </ul>
            </div>
        </section>

        <!-- Both bulk closes, scoped to this strip -->
        <section class="mb-tabs-finder__section">
            <v-btn
                class="mb-tabs-finder__toggle"
                variant="text"
                size="small"
                block
                :aria-expanded="isOpen('close') ? 'true' : 'false'"
                :aria-controls="sectionIds.close"
                @click="toggle('close')"
            >
                <v-icon :icon="isOpen('close') ? mdiChevronDown : mdiChevronRight" size="18" aria-hidden="true" />
                <span class="mb-tabs-finder__toggle-label">
                    {{ t("tabs.close.title", "Close many tabs at once") }}
                </span>
            </v-btn>

            <div v-show="isOpen('close')" :id="sectionIds.close" class="mb-tabs-finder__body">
                <TabBulkClose :strip="strip" :group-id="null" @apply="(plan, options) => emit('apply', plan, options)" />
            </div>
        </section>
    </div>
</template>

<style>
.mb-tabs-finder {
    min-width: 340px;
    max-width: 460px;
    padding: 12px;
}

.mb-tabs-finder__title {
    font-size: 1rem;
    font-weight: 500;
    margin-block-end: 4px;
}

.mb-tabs-finder__section + .mb-tabs-finder__section {
    margin-block-start: 4px;
}

.mb-tabs-finder__toggle {
    justify-content: flex-start;
    text-transform: none;
    letter-spacing: normal;
    font-weight: 500;
    /* The label below wraps, so the `size="small"` height becomes a floor the second
       line may grow past. */
    height: auto;
    min-height: 28px;
}

.mb-tabs-finder__toggle-label {
    margin-inline-start: 6px;
    /* A flex item inside `.v-btn__content` keeps `min-width: auto`, so this span never
       shrank, and the nowrap it inherits from `.v-btn` never let it wrap: a long
       translated heading hard-clipped at the panel's 460px edge, and the old hidden +
       ellipsis pair painted nothing on the unshrinkable box. Wrap instead -- that pair
       is gone because with wrapping there is nothing left to truncate. */
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
}

.mb-tabs-finder__body {
    padding: 4px 4px 8px;
}

.mb-tabs-finder__groups {
    margin: 4px 0;
    padding: 0;
    list-style: none;
    max-height: 15rem;
    overflow-y: auto;
}

.mb-tabs-finder__group {
    justify-content: flex-start;
    text-transform: none;
    letter-spacing: normal;
}

.mb-tabs-finder__group-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    padding-inline: 8px;
    padding-block-end: 4px;
}

/* A group name is user-authored. Vuetify chips default to a single clipped line,
   which turns a narrow finder into a silent character cutter. Keep the compact
   chip, but let its full accessible text wrap inside the available row width. */
.mb-tabs-finder__group-name.v-chip {
    min-width: 0;
    max-width: 100%;
    height: auto;
}

.mb-tabs-finder__group-name .v-chip__content {
    white-space: normal;
    overflow-wrap: anywhere;
    padding-block: 2px;
}

.mb-tabs-finder__empty {
    font-size: 0.75rem;
    line-height: 1.5;
    padding-block: 6px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
