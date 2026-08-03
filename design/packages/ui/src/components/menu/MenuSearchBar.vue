<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { mdiMagnify } from "@mdi/js";
import { VBtn, VExpandTransition, VTooltip } from "vuetify/components";
import MenuSearchField from "./MenuSearchField.vue";
import type { MenuSearchState } from "./menuPrefs";

/**
 * Collapsible search bar for a menu page.
 *
 * It starts collapsed and remembers that choice, so a three-map server does not spend a
 * third of a 600px-tall sheet on a filter nobody needs. The toggle states plainly when a
 * filter is currently hiding rows, because a collapsed bar that is quietly excluding
 * results is how a user concludes the data is missing.
 */
defineProps<{
    /** Shared reactive state (see `useMenuSearch`). */
    state: MenuSearchState;
    label: string;
    placeholder?: string;
    /** Real corpus for the regex builder preview, one candidate per line. */
    sample?: string;
    /** Honest "showing X of Y" summary, rendered when the filter is doing something. */
    summary?: string;
}>();

const { t } = useI18n();
</script>

<template>
    <div class="mb-menu-searchbar">
        <div class="mb-menu-searchbar__head">
            <v-btn
                :prepend-icon="mdiMagnify"
                :aria-expanded="state.open ? 'true' : 'false'"
                :active="state.open"
                variant="text"
                size="small"
                density="comfortable"
                @click="state.open = !state.open"
            >
                {{ label }}
                <v-tooltip
                    activator="parent"
                    location="bottom"
                    :text="t('search.tooltip', 'Show or hide the search field')"
                />
            </v-btn>
            <span v-if="summary" class="mb-menu-searchbar__summary">{{ summary }}</span>
        </div>

        <v-expand-transition>
            <MenuSearchField
                v-if="state.open"
                v-model="state.query"
                v-model:regex="state.regex"
                v-model:flags="state.flags"
                :placeholder="placeholder ?? ''"
                :sample="sample ?? ''"
                :label="label"
            />
        </v-expand-transition>
    </div>
</template>

<style>
.mb-menu-searchbar__head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 4px 8px 0;
}

.mb-menu-searchbar__summary {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

@media (prefers-reduced-motion: reduce) {
    .mb-menu-searchbar .v-expand-transition-enter-active,
    .mb-menu-searchbar .v-expand-transition-leave-active {
        transition-duration: 0.01ms !important;
    }
}
</style>
