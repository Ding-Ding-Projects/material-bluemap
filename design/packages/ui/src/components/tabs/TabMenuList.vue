<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiMagnify } from "@mdi/js";
import { VIcon, VList, VListItem, VTextField } from "vuetify/components";
import { filterMenuItems, type TabMenuItem } from "./tabMenus.js";

/**
 * A context menu's rows, with its own filter field and its shortcuts on show.
 *
 * Shared by the tab menu and the group menu so both obey the two rules that
 * apply to every context menu in this application: a keyboard-reachable search
 * that filters the visible items locally without changing what any of them does,
 * and the working keyboard shortcut displayed beside the item that has one.
 *
 * The field is plain-text only, and that is deliberate rather than an omission.
 * It filters a handful of fixed rows that are all on screen already; a regex
 * builder anchored to it would be a larger surface than the menu it searches.
 * The project's full builder belongs to the searches that scan the collection -
 * the strip, the group, the group names, every open tab - and every one of those
 * has one.
 */
const props = defineProps<{
    items: readonly TabMenuItem[];
    /** Names the menu for assistive technology, e.g. the tab or group it belongs to. */
    label: string;
}>();

const emit = defineEmits<{ choose: [id: string] }>();

const { t } = useI18n();

const query = ref("");

const shown = computed(() => filterMenuItems(props.items, query.value));
</script>

<template>
    <div class="mb-tabs-menu">
        <v-text-field
            v-model="query"
            :label="t('tabs.menu.filter', 'Filter these commands')"
            :prepend-inner-icon="mdiMagnify"
            variant="outlined"
            density="compact"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            hide-details
            role="searchbox"
            class="mb-tabs-menu__filter"
        />

        <p v-if="shown.length === 0" class="mb-tabs-menu__empty" role="status">
            {{ t("tabs.menu.noMatch", "No command here matches that. Clearing the filter brings them all back.") }}
        </p>

        <v-list v-else density="compact" :aria-label="label" class="mb-tabs-menu__list">
            <v-list-item
                v-for="item in shown"
                :key="item.id"
                :class="{ 'mb-tabs-menu__item--danger': item.danger }"
                @click="emit('choose', item.id)"
            >
                <template #prepend>
                    <v-icon :icon="item.icon" size="18" aria-hidden="true" />
                </template>
                <span class="mb-tabs-menu__label">{{ item.label }}</span>
                <template v-if="item.shortcut !== null" #append>
                    <!--
                        `kbd` rather than a styled span so the keys are exposed as
                        keys, and the item's own accessible name already carries
                        the label, so this is not announced twice as prose.
                    -->
                    <kbd class="mb-tabs-menu__keys">{{ item.shortcut }}</kbd>
                </template>
            </v-list-item>
        </v-list>
    </div>
</template>

<style>
.mb-tabs-menu {
    min-width: 260px;
}

.mb-tabs-menu__filter {
    margin: 8px 8px 4px;
}

.mb-tabs-menu__list {
    background: transparent;
}

.mb-tabs-menu__label {
    font-size: 0.875rem;
}

.mb-tabs-menu__item--danger .mb-tabs-menu__label {
    color: rgb(var(--v-theme-error));
}

.mb-tabs-menu__keys {
    margin-inline-start: 16px;
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.24);
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    white-space: nowrap;
}

.mb-tabs-menu__empty {
    padding: 8px 12px 12px;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
