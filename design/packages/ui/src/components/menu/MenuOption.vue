<script setup lang="ts">
import { mdiChevronRight } from "@mdi/js";
import { VIcon, VListItem, VListItemTitle, VTooltip } from "vuetify/components";

/**
 * MD3 replacement for upstream `Menu/SimpleButton.vue`: a menu row with an optional
 * "opens a submenu" chevron.
 *
 * Upstream's version was a bare `<div>` with a click handler: no role, no tabindex, no
 * keyboard path. `v-list-item` gives a real focusable row with Enter/Space activation and
 * MD3 state layers, and upstream's native `title` attribute becomes a `v-tooltip` that is
 * announced rather than only hovered.
 */
withDefaults(
    defineProps<{
        /** Renders the trailing chevron: this row opens another page. */
        submenu?: boolean;
        /** Radio-style highlight (upstream used `active` for theme/resolution rows). */
        active?: boolean;
        disabled?: boolean;
        /** Supplementary description, e.g. upstream's `updateMap.tooltip`. */
        tooltip?: string;
    }>(),
    { submenu: false, active: false, disabled: false, tooltip: "" },
);

const emit = defineEmits<{ action: [] }>();
</script>

<template>
    <v-list-item
        class="mb-menu-option"
        :active="active === true"
        :disabled="disabled === true"
        rounded="lg"
        @click="emit('action')"
    >
        <v-list-item-title class="mb-menu-option__label">
            <slot />
        </v-list-item-title>
        <template v-if="submenu" #append>
            <v-icon :icon="mdiChevronRight" size="small" aria-hidden="true" />
        </template>
        <v-tooltip v-if="tooltip" activator="parent" location="end" :text="tooltip" />
    </v-list-item>
</template>

<style>
.mb-menu-option {
    min-height: 48px;
}

.mb-menu-option__label {
    white-space: normal;
    overflow-wrap: anywhere;
}
</style>
