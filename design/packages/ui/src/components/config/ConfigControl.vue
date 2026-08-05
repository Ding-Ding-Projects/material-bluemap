<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiInfinity } from "@mdi/js";
import {
    VBtn,
    VChip,
    VSelect,
    VCombobox,
    VSlider,
    VSwitch,
    VTextField,
    VTextarea,
    VTooltip,
} from "vuetify/components";
import { formatKey, type Control, type PlainValue, type SelectOption } from "@material-bluemap/config";
import ColorField from "../appearance/ColorField.vue";
import PathField from "../PathField.vue";
import { formatHex } from "../appearance/colorFormat.js";
import { parseColor } from "../appearance/colorParse.js";
import {
    JAVA_DOUBLE_MAX,
    JAVA_INT_MAX,
    JAVA_INT_MIN,
    blankValueFor,
    decimalsForStep,
    isUnboundedSentinel,
    normalizeHexColor,
    parseNumberInput,
} from "./fieldValue.js";

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
        /**
         * What "clear this" means for the setting behind the control.
         *
         * Only the colour control has a clear affordance of its own, and only
         * because the shared {@link ColorField} carries one: in the appearance
         * editor an empty colour means "inherit from the surface above", which is a
         * state a BlueMap config file has no spelling for. Passing the field's
         * documented default turns that button into the thing it can honestly mean
         * here - put the setting back to what BlueMap itself would use - rather than
         * writing an empty string the schema then rejects.
         */
        resetValue?: PlainValue;
    }>(),
    { disabled: false, error: null, density: "compact", resetValue: null },
);

const emit = defineEmits<{ "update:modelValue": [value: PlainValue] }>();

const { t } = useI18n();

const localError = ref<string | null>(null);

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

/**
 * True when an option names the same thing as the current value.
 *
 * Straight equality is not enough for a BlueMap registry key. `Key.parse` fills
 * in a default namespace, so a file saying `compression: gzip`, a Java default of
 * `bluemap:gzip` and an option spelled either way are all one value. Comparing
 * the normalised forms is what lets the control show "gzip" as selected instead
 * of falling through to the unrecognised-value branch below.
 */
function sameOption(option: SelectOption, value: string | number): boolean {
    if (option.value === value) return true;

    const control = props.control;
    if (control.kind !== "select" || control.keyNamespace === undefined) return false;
    if (typeof option.value !== "string" || typeof value !== "string") return false;
    return formatKey(option.value, control.keyNamespace) === formatKey(value, control.keyNamespace);
}

/**
 * What a combobox handed back, put back into the shape the schema wants.
 *
 * Free entry always produces a string, including on a numeric setting such as
 * `resolution-default`, whose Java field is a `float`. Writing `"2"` where the
 * file wants `2` is the sort of thing HOCON forgives and a reader does not, so a
 * numeric option set coerces a numeric-looking entry back to a number and leaves
 * anything else alone for the schema to report.
 */
function coerceSelection(value: string | number | null | undefined): PlainValue {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") return value;

    const control = props.control;
    if (control.kind !== "select") return value;
    if (!control.options.every((option) => typeof option.value === "number")) return value;

    const trimmed = value.trim();
    if (trimmed === "") return "";
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
}

const selectValue = computed<string | number>({
    get: () => (typeof props.modelValue === "string" || typeof props.modelValue === "number" ? props.modelValue : ""),
    set: (value) => emit("update:modelValue", coerceSelection(value)),
});

/** An item for the value the file actually holds, when no option carries that exact text. */
interface SelectItem {
    value: string | number;
    title: string;
    subtitle: string;
}

/**
 * The item standing in for the current value, when no option holds it verbatim.
 *
 * This is the case the control most has to get right, because getting it wrong
 * is invisible: Vuetify matches an item by its value, so a select bound to
 * something no item holds renders *empty*. The setting then reads as unset and
 * the next interaction overwrites what somebody deliberately put in the file.
 *
 * Two different things land here. A key spelled differently from its option -
 * `bluemap:file` against an option of `file` - is the same value, so it takes
 * that option's label and says why the two spellings agree. Anything else is
 * genuinely unlisted: a dimension from a datapack, a resolution of 1.5, a
 * storage id the user named themselves. All legal, none in a list this app
 * ships. Either way the item's value is the file's own text, so showing it
 * cannot rewrite it.
 */
const currentItem = computed<SelectItem | null>(() => {
    const control = props.control;
    if (control.kind !== "select") return null;

    const value = selectValue.value;
    if (value === "") return null;
    if (control.options.some((option) => option.value === value)) return null;

    const equivalent = control.options.find((option) => sameOption(option, value));
    if (equivalent !== undefined) {
        return {
            value,
            title: equivalent.label,
            subtitle: t(
                "config.control.sameKey",
                { value: String(value), namespace: control.keyNamespace ?? "" },
                "The file says {value}, which BlueMap reads as this entry because a key with no namespace gets {namespace}.",
            ),
        };
    }

    return {
        value,
        title: String(value),
        subtitle: t(
            "config.control.unlistedValue",
            "This is what the file says. It is not a value this app knows about, which is fine if a mod, a datapack or your own setup provides it.",
        ),
    };
});

const selectItems = computed<SelectItem[]>(() => {
    if (props.control.kind !== "select") return [];

    const items: SelectItem[] = props.control.options.map((option) => ({
        value: option.value,
        title: option.label,
        subtitle: option.description ?? "",
    }));

    const current = currentItem.value;
    if (current !== null) items.unshift(current);
    return items;
});

/**
 * `PathField.vue` wants a lowercase phrase for "Browse for {field}" / "Choose {field}"; the
 * schema's own field label is the same words in the title case the visible field label keeps,
 * so the two are derived from one string rather than maintained separately.
 */
const pathFieldName = computed(() => props.label.toLowerCase());

/**
 * `PathField`'s `extensions` as an attribute bag rather than a direct binding, the same reason
 * {@link numberAttrs} exists: a control with no extension filter has to leave the prop absent,
 * not present and `undefined` - `exactOptionalPropertyTypes` and a template binding of
 * `T | undefined` do not agree, which is exactly what the removed `pickPath` used to route
 * around with its own conditional spread.
 */
const pathExtensionsAttrs = computed<{ extensions?: readonly string[] }>(() =>
    props.control.kind === "path" && props.control.extensions !== undefined
        ? { extensions: props.control.extensions }
        : {},
);

// ---- colour ----------------------------------------------------------------

/**
 * Colours open the one picker the rest of the app opens.
 *
 * There is deliberately no separate, simpler colour control for config settings.
 * `ColorField` is a swatch over the infinite picker with the space translator,
 * and every colour in this application goes through it, so a sky colour gets
 * OKLCH, a contrast readout and typed entry in eleven notations exactly as a tab
 * colour does. Wiring a hex box here instead would have been the reasonable
 * shortcut that leaves one colour in the product poorer than all the others.
 *
 * The bridging is the interesting part. The picker speaks CSS and writes back in
 * whichever notation the user was working in; BlueMap's `Color.parse` reads hex
 * and nothing else. So what comes back is parsed and re-spelled as the
 * `#rrggbb` or `#rrggbbaa` the file wants, and a colour the picker could not
 * read at all is left in the file untouched rather than replaced with a guess.
 */
const colorText = computed<string>(() => (typeof props.modelValue === "string" ? props.modelValue : ""));

/**
 * True when the stored text is not something BlueMap's own parser would take.
 *
 * The picker is happy with `red` and `oklch(...)`; `Color.parse` is not. Saying
 * so beside the control beats normalising a hand-written file on sight, which
 * would edit a setting the user never opened.
 */
const colorUnreadable = computed(() => colorText.value !== "" && normalizeHexColor(colorText.value) === null);

/**
 * A colour from the picker, written the way BlueMap writes colours.
 *
 * `formatHex` already drops the alpha byte when the colour is opaque and keeps
 * it when it is not, which is exactly upstream's own spelling: `Color.parse`
 * pads a 6-digit value with `ff` and reads an 8-digit one as carrying alpha.
 * An empty value is the picker's clear button, which for a config setting can
 * only honestly mean "back to BlueMap's own default".
 */
function commitColor(value: string): void {
    if (value === "") {
        emit("update:modelValue", props.resetValue ?? blankValueFor(props.control));
        return;
    }

    const parsed = parseColor(value);
    if (!parsed.ok) {
        localError.value = t("config.control.notAColor", "Expected a hex colour such as #7dabff.");
        return;
    }

    localError.value = null;
    emit("update:modelValue", formatHex(parsed.value.color));
}

// ---- format-string tokens --------------------------------------------------

/**
 * The placeholders a format field accepts, if it declares any.
 *
 * Inserting appends rather than splicing at the caret: the control does not own
 * the input element, and a Vuetify text field's selection is not something to
 * reach into from outside it. Appending is predictable, and the field stays
 * fully editable afterwards, which is the point of it still being a text field.
 */
const textTokens = computed(() => (props.control.kind === "text" ? (props.control.tokens ?? []) : []));

function appendToken(insert: string): void {
    emit("update:modelValue", `${textValue.value}${insert}`);
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
    <PathField
        v-else-if="control.kind === 'path'"
        v-model="textValue"
        v-bind="pathExtensionsAttrs"
        :field="pathFieldName"
        :label="label"
        :semantic="control.select === 'directory' ? 'folder' : 'file'"
        :disabled="isDisabled"
        :error="errorText"
        :density="densityValue"
    />

    <!-- colour: the same infinite picker every other colour in the app opens -->
    <div v-else-if="control.kind === 'color'" class="mb-config-control__color">
        <ColorField
            :model-value="colorText"
            :label="label"
            @update:model-value="commitColor"
        />
        <p v-if="colorUnreadable" class="mb-config-control__note" role="note">
            {{
                t(
                    "config.control.colorNotHex",
                    "Kept exactly as the file writes it. BlueMap reads hex colours such as #7dabff, so it will refuse this one until it is changed.",
                )
            }}
        </p>
        <div v-if="errorText" class="mb-config-control__error" role="alert">{{ errorText }}</div>
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
    <div v-else-if="control.kind === 'text'" class="mb-config-control__text">
        <v-text-field
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
          A format string is free text, so it stays a text field. Its placeholders
          are not free, though, and retyping `%1$s` from a comment three lines
          below is how a person gets it wrong once and never touches it again.
        -->
        <div v-if="textTokens.length > 0" class="mb-config-control__tokens">
            <span :id="`${label}-tokens`" class="mb-config-control__tokens-label">
                {{ t("config.control.tokensLabel", "Placeholders this field understands. Selecting one adds it to the end.") }}
            </span>
            <v-chip
                v-for="token in textTokens"
                :key="token.insert"
                :disabled="isDisabled"
                size="small"
                variant="outlined"
                link
                :aria-label="
                    t(
                        'config.control.insertToken',
                        { insert: token.insert, label: token.label, example: token.example },
                        'Add {insert}, the {label}, which prints like {example}',
                    )
                "
                @click="appendToken(token.insert)"
                @keydown.enter.prevent="appendToken(token.insert)"
                @keydown.space.prevent="appendToken(token.insert)"
            >
                <code>{{ token.insert }}</code>
                <span class="mb-config-control__token-label">{{ token.label }}</span>
                <v-tooltip
                    activator="parent"
                    location="top"
                    :text="
                        t(
                            'config.control.tokenHint',
                            { label: token.label, example: token.example },
                            '{label}. Prints like {example}.',
                        )
                    "
                />
            </v-chip>
        </div>
    </div>

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
.mb-config-control__number {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    flex-wrap: wrap;
}

/* The colour field lays itself out; this only stacks its note underneath. */
.mb-config-control__color,
.mb-config-control__text {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-inline-size: 0;
}

.mb-config-control__tokens {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
}

.mb-config-control__tokens-label {
    flex-basis: 100%;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-control__tokens code {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
}

.mb-config-control__token-label {
    margin-inline-start: 6px;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
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

.mb-config-control__unsupported {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
