<script setup lang="ts">
import { computed, useId } from "vue";
import { VListItem, VSlider } from "vuetify/components";

/**
 * MD3 replacement for upstream `Menu/Slider.vue`.
 *
 * The split that matters is `update` (fires continuously while dragging, so the caller can
 * apply the change live) versus `lazy` (fires once when the interaction ends, so the caller
 * can persist). Collapsing them writes localStorage on every pointer move of three sliders.
 *
 * Vuetify's `v-slider` only emits `end` for pointer interactions, so keyboard changes are
 * flushed on `keyup` as well; upstream got that for free from the native `change` event.
 */
const props = withDefaults(
    defineProps<{
        modelValue: number;
        min: number;
        max: number;
        step: number;
        /** Visible label, also the slider's accessible name. */
        label: string;
        /** Formats the readout and the announced value (upstream's `formatter` prop). */
        formatter?: (value: number) => string;
        disabled?: boolean;
    }>(),
    { disabled: false },
);

const emit = defineEmits<{ update: [value: number]; lazy: [value: number] }>();

const labelId = useId();

function countDecimals(value: number): number {
    if (Math.floor(value) === value) return 0;
    return value.toString().split(".")[1]?.length ?? 0;
}

const display = computed(() => {
    if (props.formatter) return props.formatter(props.modelValue);
    return props.modelValue.toFixed(countDecimals(props.step));
});

let dirty = false;

const value = computed<number>({
    get: () => props.modelValue,
    set: (next) => {
        dirty = true;
        emit("update", next);
    },
});

function flush(): void {
    if (!dirty) return;
    dirty = false;
    emit("lazy", props.modelValue);
}
</script>

<template>
    <v-list-item class="mb-menu-slider" @keyup="flush">
        <div class="mb-menu-slider__head">
            <span :id="labelId" class="mb-menu-slider__label">{{ label }}</span>
            <span class="mb-menu-slider__value" aria-hidden="true">{{ display }}</span>
        </div>
        <v-slider
            v-model="value"
            class="mb-menu-slider__control"
            :min="min"
            :max="max"
            :step="step"
            :disabled="disabled === true"
            :aria-labelledby="labelId"
            :aria-valuetext="display"
            color="primary"
            density="compact"
            hide-details
            @end="flush"
        />
    </v-list-item>
</template>

<style>
.mb-menu-slider {
    display: block;
    min-height: 48px;
    padding-block: 4px;
}

.mb-menu-slider__head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 0.875rem;
    line-height: 1.4;
}

.mb-menu-slider__label {
    flex: 1 1 auto;
    overflow-wrap: anywhere;
}

.mb-menu-slider__value {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-menu-slider__control.v-slider {
    margin-inline: 4px;
}
</style>
