<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiFolderOpenOutline, mdiFileOutline, mdiInfinity } from "@mdi/js";
import {
    VBtn,
    VColorPicker,
    VMenu,
    VSelect,
    VCombobox,
    VSlider,
    VSwitch,
    VTextField,
    VTextarea,
    VTooltip,
} from "vuetify/components";
import type { Control, PlainValue } from "@material-bluemap/config";
import {
    JAVA_DOUBLE_MAX,
    JAVA_INT_MAX,
    JAVA_INT_MIN,
    decimalsForStep,
    isUnboundedSentinel,
    normalizeHexColor,
    opaquePart,
    parseNumberInput,
} from "./fieldValue.js";
import { useConfigHost } from "./configHost.js";

/**
 * One control, with no label, documentation or reset affordance around it.
 *
 * `ConfigField.vue` supplies all of that. Keeping the bare control separate is
 * what lets a list of points reuse the same vector editor a top-level setting
 * uses, and what keeps the mask editor from re-implementing number entry.
 *
 * The control rendered is chosen entirely by `FieldMeta.control`, which comes
 * from `@material-bluemap/config`. No control is written per setting, so a
 * setting added to the schema arrives here with the right editor already.
 */
const props = withDefaults(
    defineProps<{
        control: Control;
        modelValue: PlainValue;
        /** Accessible name. The visible label lives on the surrounding field. */
        label: string;
        disabled?: boolean;
        /** Inline error text, shown under the control. */
        error?: string | null;
        density?: "default" | "comfortable" | "compact";
    }>(),
    { disabled: false, error: null, density: "compact" },
);

const emit = defineEmits<{ "update:modelValue": [value: PlainValue] }>();

const { t } = useI18n();
const host = useConfigHost();

const localError = ref<string | null>(null);
const colorMenu = ref(false);

/**
 * These three exist because `exactOptionalPropertyTypes` and Vuetify disagree
 * about `undefined`: an optional prop of ours is `T | undefined`, and Vuetify's
 * props are not. Normalising once here is cheaper than coalescing at every
 * binding, and it keeps the template readable.
 */
const errorText = computed<string | null>(() => props.error ?? localError.value);
const isDisabled = computed(() => props.disabled === true);
const densityValue = computed<"default" | "comfortable" | "compact">(() => props.density ?? "compact");

// ---- switch ----------------------------------------------------------------

const switchValue = computed<boolean>({
    get: () => props.modelValue === true,
    set: (value) => emit("update:modelValue", value),
});

// ---- number and slider -----------------------------------------------------

const numeric = computed(() => (props.control.kind === "number" || props.control.kind === "slider" ? props.control : null));

const numberText = computed<string>(() => (typeof props.modelValue === "number" ? String(props.modelValue) : ""));

/**
 * Bounds and unit, as an attribute bag rather than individual bindings.
 *
 * A bound the schema does not set must be absent from the DOM, not present and
 * `undefined`: `min=""` on a number input is a bound of zero to a browser, which
 * would quietly refuse every negative coordinate BlueMap accepts.
 */
const numberAttrs = computed<Record<string, string | number>>(() => {
    const control = props.control;
    if (control.kind !== "number") return {};

    const attrs: Record<string, string | number> = {};
    if (control.min !== undefined) attrs["min"] = control.min;
    if (control.max !== undefined) attrs["max"] = control.max;
    if (control.step !== undefined) attrs["step"] = control.step;
    if (control.unit !== undefined) attrs["suffix"] = control.unit;
    return attrs;
});

function axisAttrs(axis: { min?: number; max?: number }): Record<string, number> {
    const attrs: Record<string, number> = {};
    if (axis.min !== undefined) attrs["min"] = axis.min;
    if (axis.max !== undefined) attrs["max"] = axis.max;
    return attrs;
}

/**
 * True when the number is one of Java's "no limit" sentinels.
 *
 * A box mask with no minimum X genuinely holds -2147483648, and showing that in
 * a spin box invites somebody to read it as a coordinate. The control says what
 * it means beside the number instead of hiding it.
 */
const unbounded = computed(() => isUnboundedSentinel(props.modelValue));

function commitNumber(raw: unknown): void {
    const control = numeric.value;
    if (control === null) return;

    const parsed = parseNumberInput(raw, control.integer);
    if (parsed === "invalid") {
        localError.value = t("config.control.notANumber", "That is not a number.");
        return;
    }
    localError.value = null;
    if (parsed === null) return;

    emit("update:modelValue", parsed);
}

const sliderValue = computed<number>({
    get: () => (typeof props.modelValue === "number" ? props.modelValue : 0),
    set: (value) => emit("update:modelValue", value),
});

const sliderDecimals = computed(() => (props.control.kind === "slider" ? decimalsForStep(props.control.step) : 0));

// ---- text, path and select -------------------------------------------------

const textValue = computed<string>({
    get: () => (typeof props.modelValue === "string" ? props.modelValue : ""),
    set: (value) => emit("update:modelValue", value),
});

const selectValue = computed<string | number>({
    get: () => (typeof props.modelValue === "string" || typeof props.modelValue === "number" ? props.modelValue : ""),
    set: (value) => emit("update:modelValue", value ?? ""),
});

const selectItems = computed(() =>
    props.control.kind === "select"
        ? props.control.options.map((option) => ({
              value: option.value,
              title: option.label,
              subtitle: option.description ?? "",
          }))
        : [],
);

async function pickPath(): Promise<void> {
    if (props.control.kind !== "path" || host === null) return;

    const chosen =
        props.control.select === "directory"
            ? await host.pickDirectory({ title: props.label })
            : await host.pickFile(
                  props.control.extensions === undefined
                      ? { title: props.label }
                      : { title: props.label, extensions: props.control.extensions },
              );

    if (chosen !== null) emit("update:modelValue", chosen);
}

const pickerReason = computed(() =>
    host === null
        ? t("config.control.pickerUnavailable", "Browsing for a path needs the desktop app. You can still type or paste one here.")
        : "",
);

// ---- colour ----------------------------------------------------------------

const colorText = computed<string>(() => (typeof props.modelValue === "string" ? props.modelValue : "#000000"));

const swatch = computed(() => opaquePart(colorText.value));

const colorPickerValue = computed<string>({
    get: () => normalizeHexColor(colorText.value) ?? "#000000",
    set: (value) => {
        const normalized = normalizeHexColor(value);
        if (normalized !== null) emit("update:modelValue", normalized);
    },
});

function commitColorText(raw: string): void {
    const normalized = normalizeHexColor(raw);
    if (normalized === null) {
        localError.value = t("config.control.notAColor", "Expected a hex colour such as #7dabff.");
        return;
    }
    localError.value = null;
    emit("update:modelValue", normalized);
}

// ---- vector ----------------------------------------------------------------

const vectorRecord = computed<Record<string, PlainValue>>(() =>
    typeof props.modelValue === "object" && props.modelValue !== null && !Array.isArray(props.modelValue)
        ? props.modelValue
        : {},
);

function axisValue(key: string): string {
    const value = vectorRecord.value[key];
    return typeof value === "number" ? String(value) : "";
}

function commitAxis(key: string, raw: unknown): void {
    if (props.control.kind !== "vector") return;

    const parsed = parseNumberInput(raw, props.control.integer);
    if (parsed === "invalid") {
        localError.value = t("config.control.notANumber", "That is not a number.");
        return;
    }
    localError.value = null;

    const next: Record<string, PlainValue> = { ...vectorRecord.value };
    next[key] = parsed ?? 0;
    emit("update:modelValue", next);
}

/** Puts the "no limit" sentinel back, for a bound the user wants to give up. */
function clearBound(direction: "min" | "max"): void {
    if (props.control.kind === "number" && !props.control.integer) {
        emit("update:modelValue", JAVA_DOUBLE_MAX);
        return;
    }
    emit("update:modelValue", direction === "min" ? JAVA_INT_MIN : JAVA_INT_MAX);
}

const boundDirection = computed<"min" | "max">(() => (props.label.toLowerCase().includes("min") ? "min" : "max"));
</script>

<template>
    <!-- switch -->
    <v-switch
        v-if="control.kind === 'switch'"
        v-model="switchValue"
        :label="label"
        :disabled="isDisabled"
        :error-messages="errorText"
        color="primary"
        density="compact"
        hide-details="auto"
        inset
    />

    <!-- slider -->
    <div v-else-if="control.kind === 'slider'" class="mb-config-control__slider">
        <v-slider
            v-model="sliderValue"
            :min="control.min"
            :max="control.max"
            :step="control.step"
            :disabled="isDisabled"
            :aria-label="label"
            :aria-valuetext="`${sliderValue.toFixed(sliderDecimals)}${control.unit ? ' ' + control.unit : ''}`"
            :error-messages="errorText"
            color="primary"
            density="compact"
            hide-details="auto"
            thumb-label
        />
        <span class="mb-config-control__reading">
            {{ sliderValue.toFixed(sliderDecimals) }}
            <template v-if="control.unit">{{ control.unit }}</template>
        </span>
    </div>

    <!-- number -->
    <div v-else-if="control.kind === 'number'" class="mb-config-control__number">
        <v-text-field
            v-bind="numberAttrs"
            :model-value="numberText"
            :label="label"
            :disabled="isDisabled"
            :error-messages="errorText"
            type="number"
            inputmode="decimal"
            variant="outlined"
            :density="densityValue"
            hide-details="auto"
            @update:model-value="commitNumber"
        />
        <div v-if="unbounded" class="mb-config-control__note">
            <v-btn
                :prepend-icon="mdiInfinity"
                size="x-small"
                variant="text"
                density="comfortable"
                disabled
            >
                {{ t("config.control.noLimit", "No limit") }}
            </v-btn>
            <span>{{
                t(
                    "config.control.sentinel",
                    "BlueMap writes Java's largest whole number here to mean the axis is unbounded.",
                )
            }}</span>
        </div>
        <v-btn
            v-else-if="control.integer"
            size="x-small"
            variant="text"
            density="comfortable"
            :disabled="isDisabled"
            @click="clearBound(boundDirection)"
        >
            {{ t("config.control.removeLimit", "Remove this limit") }}
        </v-btn>
    </div>

    <!-- select, open or closed -->
    <v-combobox
        v-else-if="control.kind === 'select' && control.allowCustom"
        v-model="selectValue"
        :items="selectItems"
        :label="label"
        :disabled="isDisabled"
        :error-messages="errorText"
        item-title="title"
        item-value="value"
        variant="outlined"
        :density="densityValue"
        hide-details="auto"
        :return-object="false"
    />
    <v-select
        v-else-if="control.kind === 'select'"
        v-model="selectValue"
        :items="selectItems"
        :label="label"
        :disabled="isDisabled"
        :error-messages="errorText"
        item-title="title"
        item-value="value"
        variant="outlined"
        :density="densityValue"
        hide-details="auto"
    />

    <!-- path -->
    <div v-else-if="control.kind === 'path'" class="mb-config-control__path">
        <v-text-field
            v-model="textValue"
            :label="label"
            :disabled="isDisabled"
            :error-messages="errorText"
            class="mb-config-control__mono"
            variant="outlined"
            :density="densityValue"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            hide-details="auto"
        />
        <v-btn
            :icon="control.select === 'directory' ? mdiFolderOpenOutline : mdiFileOutline"
            :aria-label="
                control.select === 'directory'
                    ? t('config.control.browseFolder', 'Choose a folder')
                    : t('config.control.browseFile', 'Choose a file')
            "
            :disabled="disabled || host === null"
            variant="tonal"
            size="small"
            @click="pickPath"
        >
            <v-tooltip
                activator="parent"
                location="top"
                :text="
                    host === null
                        ? pickerReason
                        : control.select === 'directory'
                          ? t('config.control.browseFolder', 'Choose a folder')
                          : t('config.control.browseFile', 'Choose a file')
                "
            />
        </v-btn>
    </div>

    <!-- colour -->
    <div v-else-if="control.kind === 'color'" class="mb-config-control__color">
        <v-text-field
            :model-value="colorText"
            :label="label"
            :disabled="isDisabled"
            :error-messages="errorText"
            class="mb-config-control__mono"
            variant="outlined"
            :density="densityValue"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            hide-details="auto"
            @update:model-value="commitColorText"
        />
        <v-btn
            class="mb-config-control__swatch"
            :style="{ backgroundColor: swatch }"
            :aria-label="t('config.control.pickColor', 'Pick a colour')"
            :disabled="isDisabled"
            variant="outlined"
            size="small"
        >
            <span class="mb-config-control__swatch-text">{{ colorText }}</span>
            <v-menu v-model="colorMenu" activator="parent" :close-on-content-click="false" location="bottom end">
                <v-color-picker
                    v-model="colorPickerValue"
                    :modes="control.alpha ? ['hexa', 'rgba', 'hsla'] : ['hex', 'rgb', 'hsl']"
                    mode="hex"
                    show-swatches
                    elevation="6"
                />
            </v-menu>
        </v-btn>
    </div>

    <!-- vector -->
    <div v-else-if="control.kind === 'vector'" class="mb-config-control__vector">
        <v-text-field
            v-for="axis in control.axes"
            :key="axis.key"
            v-bind="axisAttrs(axis)"
            :model-value="axisValue(axis.key)"
            :label="axis.label"
            :disabled="isDisabled"
            type="number"
            inputmode="decimal"
            variant="outlined"
            :density="densityValue"
            hide-details="auto"
            @update:model-value="(raw: string) => commitAxis(axis.key, raw)"
        />
        <div v-if="errorText" class="mb-config-control__error" role="alert">{{ errorText }}</div>
    </div>

    <!-- text -->
    <v-textarea
        v-else-if="control.kind === 'text' && control.multiline"
        v-model="textValue"
        :label="label"
        :placeholder="control.placeholder ?? ''"
        :disabled="isDisabled"
        :error-messages="errorText"
        :class="{ 'mb-config-control__mono': control.monospace }"
        rows="3"
        auto-grow
        variant="outlined"
        :density="densityValue"
        spellcheck="false"
        hide-details="auto"
    />
    <v-text-field
        v-else-if="control.kind === 'text'"
        v-model="textValue"
        :label="label"
        :placeholder="control.placeholder ?? ''"
        :disabled="isDisabled"
        :error-messages="errorText"
        :class="{ 'mb-config-control__mono': control.monospace }"
        variant="outlined"
        :density="densityValue"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        hide-details="auto"
    />

    <!--
      list, key-value, mask-list and marker-sets are structured editors rather
      than controls; ConfigField.vue routes them to their own components.
    -->
    <div v-else class="mb-config-control__unsupported" role="note">
        {{
            t(
                "config.control.structured",
                "This setting is edited by its own editor rather than a single control.",
            )
        }}
    </div>
</template>

<style>
.mb-config-control__number,
.mb-config-control__path,
.mb-config-control__color {
    display: flex;
    align-items: flex-start;
    gap: 8px;
}

.mb-config-control__number {
    flex-wrap: wrap;
}

.mb-config-control__path .v-text-field,
.mb-config-control__color .v-text-field {
    flex: 1 1 220px;
    min-width: 0;
}

.mb-config-control__vector {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.mb-config-control__vector .v-text-field {
    flex: 1 1 110px;
    min-width: 0;
}

.mb-config-control__slider {
    display: flex;
    align-items: center;
    gap: 12px;
}

.mb-config-control__slider .v-slider {
    flex: 1 1 auto;
    min-width: 0;
}

.mb-config-control__reading {
    font-variant-numeric: tabular-nums;
    font-size: 0.8125rem;
    min-width: 5ch;
    text-align: end;
}

.mb-config-control__note {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-control__error {
    flex-basis: 100%;
    font-size: 0.75rem;
    color: rgb(var(--v-theme-error));
}

.mb-config-control__mono input,
.mb-config-control__mono textarea {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.8125rem;
}

.mb-config-control__swatch {
    min-width: 104px;
}

.mb-config-control__swatch-text {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    mix-blend-mode: difference;
    color: #ffffff;
}

.mb-config-control__unsupported {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
