<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiClose } from "@mdi/js";
import { VBtn, VMenu, VTooltip } from "vuetify/components";

import InfiniteColorPicker from "./InfiniteColorPicker.vue";
import { cssColor } from "./colorFormat.js";
import { parseColor } from "./colorParse.js";

/**
 * One colour slot, opening the one picker.
 *
 * There is deliberately no second, simpler picker for "small" colour choices. The contract is
 * explicit that every colour control opens the same continuous picker, and the failure it is
 * guarding against is exactly the reasonable-sounding shortcut: a swatch grid for the tab
 * colour because a tab colour is not important enough to need OKLCH. Every colour in the app
 * reaches the whole picker through this component, so there is only one place that could
 * regress.
 *
 * The swatch itself is a button and says what it is: an unreadable value shows as a struck
 * pattern with the authored text in its label rather than as an empty square, because a
 * colour the app could not parse still belongs to the user and they need to be able to find
 * it and fix it.
 */
const props = withDefaults(
    defineProps<{
        modelValue: string;
        label: string;
        /** The surface this colour sits on, passed through to the contrast readout. */
        contrastBackground?: string;
        contrastForeground?: string;
    }>(),
    { contrastBackground: "", contrastForeground: "" },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const { t } = useI18n();

const open = ref(false);
const button = ref<InstanceType<typeof VBtn> | null>(null);

/**
 * Optional props, normalised once.
 *
 * Vuetify's own types and `exactOptionalPropertyTypes` disagree about `undefined`, and so do
 * this component's props and the picker's: an optional prop with a default is still typed as
 * possibly-undefined at the binding site. Coalescing once here beats coalescing at every
 * binding in the template, and it is the same shape `ConfigSearchField` uses next door.
 */
const backgroundValue = computed(() => props.contrastBackground ?? "");
const foregroundValue = computed(() => props.contrastForeground ?? "");

const parsed = computed(() => parseColor(props.modelValue));

const preview = computed(() => {
    if (props.modelValue.trim() === "") return "";
    return parsed.value.ok ? cssColor(parsed.value.value.color) : "";
});

const state = computed<"empty" | "unreadable" | "colour">(() => {
    if (props.modelValue.trim() === "") return "empty";
    return parsed.value.ok ? "colour" : "unreadable";
});

const describe = computed(() => {
    switch (state.value) {
        case "empty":
            return t("appearance.color.field.empty", "Not set. This element follows whatever is above it.");
        case "unreadable":
            return t(
                "appearance.color.field.unreadable",
                { value: props.modelValue },
                "Kept but not applied, because this app cannot read it: {value}",
            );
        default:
            return props.modelValue;
    }
});

/** Focus goes back to the swatch that opened the picker, never to the page. */
function close(): void {
    open.value = false;
    const element = button.value?.$el as HTMLElement | undefined;
    element?.focus();
}
</script>

<template>
    <div class="mb-color-field">
        <span :id="`${label}-colour-label`" class="mb-color-field__label">{{ label }}</span>

        <v-btn
            ref="button"
            class="mb-color-field__swatch"
            :class="{
                'mb-color-field__swatch--empty': state === 'empty',
                'mb-color-field__swatch--unreadable': state === 'unreadable',
            }"
            :style="preview ? { backgroundColor: preview } : undefined"
            variant="outlined"
            size="small"
            :aria-label="t('appearance.color.field.open', { label, value: describe }, 'Edit {label}. Currently {value}.')"
            :aria-expanded="open ? 'true' : 'false'"
        >
            <span class="mb-color-field__value">{{ describe }}</span>

            <v-menu
                v-model="open"
                activator="parent"
                :close-on-content-click="false"
                location="bottom start"
                offset="8"
                @update:model-value="(value: boolean) => !value && close()"
            >
                <!--
                    The panel paints its own surface. An overlay that inherits nothing renders
                    transparent, and the settings behind it read straight through the numbers
                    on top. The height is bounded and the content scrolls, so an eleven-row
                    translator on a short window loses nothing off the bottom.
                -->
                <div class="mb-color-field__panel">
                    <InfiniteColorPicker
                        :model-value="modelValue"
                        :label="label"
                        :contrast-background="backgroundValue"
                        :contrast-foreground="foregroundValue"
                        @update:model-value="(value: string) => emit('update:modelValue', value)"
                    />
                </div>
            </v-menu>
        </v-btn>

        <v-btn
            v-if="modelValue !== ''"
            :icon="mdiClose"
            size="x-small"
            variant="text"
            :aria-label="t('appearance.color.field.clear', { label }, 'Clear {label}')"
            @click="emit('update:modelValue', '')"
        >
            <v-tooltip
                activator="parent"
                location="top"
                :text="t('appearance.color.field.clearHint', 'Clear this colour so the element follows whatever is above it.')"
            />
        </v-btn>
    </div>
</template>

<style>
.mb-color-field {
    display: flex;
    align-items: center;
    gap: 8px;
    min-inline-size: 0;
}

.mb-color-field__label {
    flex: 0 0 auto;
    inline-size: 110px;
    font-size: 0.8rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-color-field__swatch {
    flex: 1 1 auto;
    justify-content: flex-start;
    min-inline-size: 0;
    text-transform: none;
}

.mb-color-field__value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
}

/* An unset colour is drawn as a hatch rather than as white, which would be a colour. */
.mb-color-field__swatch--empty {
    background-image: repeating-linear-gradient(
        45deg,
        rgba(var(--v-theme-on-surface), 0.08) 0 4px,
        transparent 4px 8px
    );
}

.mb-color-field__swatch--unreadable {
    border-color: rgb(var(--v-theme-error));
}

.mb-color-field__panel {
    box-sizing: border-box;
    inline-size: min(320px, 92vw);
    max-inline-size: calc(100vw - 16px);
    max-block-size: min(70vh, 620px);
    overflow-y: auto;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    box-shadow: 0 4px 8px 3px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.3);
}
</style>
