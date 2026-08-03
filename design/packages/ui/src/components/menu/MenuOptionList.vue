<script setup lang="ts">
import { computed } from "vue";
import { VList, VListItem } from "vuetify/components";

export interface MenuChoiceOption {
    id: string;
    name: string;
    disabled?: boolean;
}

/**
 * Single-choice option list: upstream used a stack of `SimpleButton`s with `:active` for
 * the view mode, resolution, theme and language groups. Those rows were `<div>`s with no
 * role and no keyboard path, so a screen reader had no way to tell that exactly one of
 * them was chosen.
 *
 * Vuetify's selectable `v-list` gives the same behaviour with real `listbox`/`option`
 * roles, `aria-selected`, roving arrow-key focus and Enter/Space activation.
 */
const props = defineProps<{
    options: MenuChoiceOption[];
    /** Currently chosen option id, or null when nothing matches. */
    selected: string | null;
    /** Accessible name for the listbox. */
    label: string;
}>();

const emit = defineEmits<{ select: [id: string] }>();

const selection = computed<unknown[]>({
    get: () => (props.selected === null ? [] : [props.selected]),
    set: (value) => {
        const id = value[0];
        if (typeof id === "string" && id !== props.selected) emit("select", id);
    },
});
</script>

<template>
    <v-list
        v-model:selected="selection"
        class="mb-menu-option-list"
        density="compact"
        selectable
        mandatory
        select-strategy="single-independent"
        :aria-label="label"
    >
        <v-list-item
            v-for="option in options"
            :key="option.id"
            :value="option.id"
            :disabled="option.disabled === true"
            rounded="lg"
            :title="option.name"
        />
    </v-list>
</template>

<style>
.mb-menu-option-list .v-list-item__content {
    white-space: normal;
    overflow-wrap: anywhere;
}

.mb-menu-option-list .v-list-item {
    min-height: 44px;
}
</style>
