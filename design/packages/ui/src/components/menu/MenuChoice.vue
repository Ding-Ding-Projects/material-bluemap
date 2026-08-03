<script setup lang="ts">
import { useId } from "vue";
import { VBtn, VBtnToggle } from "vuetify/components";

export interface MenuChoiceItem {
    id: string;
    name: string;
}

/**
 * MD3 replacement for upstream `Menu/ChoiceBox.vue`: an inline segmented control with an
 * optional leading title. Upstream used it only for the marker sort order.
 *
 * Kept exactly: the emitted payload is the whole choice object, not its id.
 */
withDefaults(
    defineProps<{
        title?: string;
        choices: MenuChoiceItem[];
        selection: string;
    }>(),
    { title: "" },
);

const emit = defineEmits<{ choice: [choice: MenuChoiceItem] }>();

const titleId = useId();

function pick(choices: MenuChoiceItem[], id: unknown): void {
    const choice = choices.find((c) => c.id === id);
    if (choice) emit("choice", choice);
}
</script>

<template>
    <div class="mb-menu-choice">
        <span v-if="title" :id="titleId" class="mb-menu-choice__title">{{ title }}</span>
        <v-btn-toggle
            class="mb-menu-choice__group"
            :model-value="selection"
            :aria-labelledby="title ? titleId : undefined"
            mandatory
            divided
            density="compact"
            variant="outlined"
            @update:model-value="pick(choices, $event)"
        >
            <v-btn v-for="choice in choices" :key="choice.id" :value="choice.id" size="small">
                {{ choice.name }}
            </v-btn>
        </v-btn-toggle>
    </div>
</template>

<style>
.mb-menu-choice {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 4px 16px 8px;
}

.mb-menu-choice__title {
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-menu-choice__group.v-btn-toggle {
    flex: 1 1 auto;
    height: auto;
    min-height: 32px;
}

.mb-menu-choice__group.v-btn-toggle .v-btn {
    flex: 1 1 0;
    min-width: 0;
    height: 32px;
}
</style>
