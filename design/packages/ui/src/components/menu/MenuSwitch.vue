<script setup lang="ts">
import { computed, useId } from "vue";
import { VListItem, VSwitch, VTooltip } from "vuetify/components";

/**
 * MD3 replacement for upstream `Menu/SwitchButton.vue` + `Menu/SwitchHandle.vue`.
 *
 * Upstream's handle was a styled `<div>` with no role, no tabindex and no keyboard
 * handling; `v-switch` renders a real `<input role="switch">` with `aria-checked`.
 * The row keeps upstream's large hit target by making the visible label a `<label for>`
 * of that input, so clicking anywhere on the text toggles it.
 *
 * Like upstream, the component does not flip its own state: it emits `action` and the
 * caller inverts and persists, so the switch always shows what the viewer actually has.
 */
const props = withDefaults(
    defineProps<{
        on: boolean;
        label: string;
        disabled?: boolean;
        tooltip?: string;
    }>(),
    { disabled: false, tooltip: "" },
);

const emit = defineEmits<{ action: [] }>();

const inputId = useId();

const checked = computed<boolean>({
    get: () => props.on,
    set: () => emit("action"),
});
</script>

<template>
    <v-list-item class="mb-menu-switch">
        <label :for="inputId" class="mb-menu-switch__label">{{ label }}</label>
        <template #append>
            <v-switch
                :id="inputId"
                v-model="checked"
                class="mb-menu-switch__control"
                role="switch"
                :disabled="disabled === true"
                color="primary"
                density="compact"
                hide-details
                inset
            />
        </template>
        <v-tooltip v-if="tooltip" activator="parent" location="end" :text="tooltip" />
    </v-list-item>
</template>

<style>
.mb-menu-switch {
    min-height: 48px;
}

.mb-menu-switch__label {
    display: block;
    flex: 1 1 auto;
    padding-block: 12px;
    cursor: pointer;
    font-size: 0.875rem;
    line-height: 1.4;
    overflow-wrap: anywhere;
}

.mb-menu-switch__control.v-switch {
    flex: 0 0 auto;
}

.mb-menu-switch__control .v-selection-control {
    min-height: 0;
}
</style>
