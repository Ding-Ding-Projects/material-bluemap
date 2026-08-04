<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCheck, mdiContentCopy, mdiEyedropperVariant } from "@mdi/js";
import { VAlert, VBtn, VChip, VDivider, VSelect, VTextField, VTooltip } from "vuetify/components";

import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    colorRepresentations,
    colorSpaceLabelKey,
    contrastReport,
    cssColor,
    describeColor,
    formatColor,
    formatNumber,
} from "./colorFormat.js";
import { colorParseErrorKey, COLOR_SPACES, parseColor, type ColorSpaceId } from "./colorParse.js";
import {
    clipRgb,
    hsvToRgb,
    rgb,
    rgbToCmyk,
    rgbToHsl,
    rgbToHsv,
    rgbToHwb,
    rgbToLab,
    rgbToLch,
    rgbToOklab,
    rgbToOklch,
    type Rgb,
} from "./colorSpaces.js";

/**
 * The infinite colour picker, with its translator.
 *
 * "Infinite" is the contract's word for the thing this is not allowed to be: a grid of
 * swatches. Everything below is layered on a continuous two-dimensional field plus a
 * continuous hue and alpha, and the swatches, the recent list and the eyedropper are
 * shortcuts that write into that field rather than replacements for it. There is no colour
 * expressible in sRGB that cannot be reached by dragging, and no colour expressible in any
 * supported space that cannot be reached by typing.
 *
 * ## Why the working value is not the model value
 *
 * The component keeps its own `working` colour and only writes back through the model when
 * something actually changes it. Round-tripping every drag through the parent would mean the
 * colour makes a trip out to a string and back on every pointer move, and the rounding in
 * that string would drag the thumb slightly behind the cursor. Keeping the unrounded colour
 * here and writing the text out is what makes the field feel attached to the pointer.
 *
 * ## The notation is the user's, until keeping it would cost them the colour
 *
 * A value is written back in the notation the user is working in, because that notation is
 * information: somebody who typed `oklch()` thinks in OKLCH and wants their record to say so.
 * The exception is the one case where honouring it would silently destroy something. If the
 * colour sits outside sRGB and the chosen notation cannot express that, the picker writes
 * OKLCH instead and *says* it did, with a control to force the clipped notation anyway. The
 * one behaviour ruled out is quietly writing the clipped value under the notation that was
 * asked for.
 *
 * ## Accessibility of a two-dimensional field
 *
 * The colour field is not one value, so it is not one slider. It is a group containing two
 * real range inputs - saturation and brightness - which are visually hidden but focusable, so
 * arrow keys, Home, End and a screen reader all work exactly as they do on any slider,
 * without an `aria-valuetext` fiction about a control that has two numbers. The visible thumb
 * is drawn from those two values, and the focus ring is drawn on the field itself so keyboard
 * focus is visible even though the input carrying it is not.
 */
const props = withDefaults(
    defineProps<{
        /** The authored colour text. The empty string means "inherit", not black. */
        modelValue: string;
        label: string;
        /** The surface this colour will sit on, for the contrast readout. */
        contrastBackground?: string;
        /** The text that will sit on this colour, when this colour is a background. */
        contrastForeground?: string;
        /** Whether the caller allows an empty value, which most colour slots do. */
        allowEmpty?: boolean;
    }>(),
    { contrastBackground: "", contrastForeground: "", allowEmpty: true },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const { t } = useI18n();

/**
 * Colours reached recently, shared by every picker in the session and not persisted.
 *
 * A shortcut for the work in front of you rather than a saved palette. Palettes that outlive
 * a session are what presets are for, and they are saved deliberately rather than
 * accumulated behind the user's back.
 */
const recent = ref<string[]>([]);

const MAX_RECENT = 12;

/* -------------------------------------------------------------------------- */
/* The working colour                                                         */
/* -------------------------------------------------------------------------- */

const BLACK = rgb(0, 0, 0);

const working = ref<Rgb>(BLACK);
const notation = ref<ColorSpaceId>("hex");
const rawText = ref("");
const rawError = ref("");
/** Set when the user has been told the notation was changed to avoid clipping. */
const notationSwitched = ref(false);
/** Set when the user has explicitly asked for the clipped notation anyway. */
const allowClipping = ref(false);
const copied = ref("");

/** Reads the model into the working colour, keeping the notation the caller wrote in. */
function adoptModel(value: string): void {
    rawText.value = value;
    if (value.trim() === "") {
        rawError.value = "";
        working.value = BLACK;
        return;
    }

    const parsed = parseColor(value);
    if (!parsed.ok) {
        // The text stays exactly as the caller wrote it. A stored colour this build cannot
        // read is still the user's colour, and replacing it with black on the way into the
        // editor would destroy it the moment anything else is touched.
        rawError.value = t(colorParseErrorKey(parsed.error), "That is not a colour this app can read.");
        return;
    }

    rawError.value = "";
    working.value = parsed.value.color;
    notation.value = parsed.value.space === "named" ? "hex" : parsed.value.space;
}

/** The last text this component emitted, so its own echo does not reset the notation. */
const written = ref(props.modelValue);

adoptModel(props.modelValue);

watch(
    () => props.modelValue,
    (value) => {
        // Skipping the component's own echo is what keeps the notation stable while dragging.
        // Without it, writing `oklch(...)` out and reading it back in would be indistinguishable
        // from the parent changing the colour, and every drag would reset the panel.
        if (value !== written.value) adoptModel(value);
    },
);

const description = computed(() => describeColor(working.value));

/**
 * The notation a write will actually use.
 *
 * Falls back to OKLCH when the chosen one would clip and the user has not said to go ahead,
 * because that is the only choice that keeps the colour. Nothing about this is silent: the
 * banner below the field says it happened and offers the other option.
 */
const writeSpace = computed<ColorSpaceId>(() => {
    if (!description.value.clipped || allowClipping.value) return notation.value;
    const CLIPS: ColorSpaceId[] = ["named", "hex", "rgb", "hsl", "hsv", "hwb", "cmyk"];
    return CLIPS.includes(notation.value) ? "oklch" : notation.value;
});

function write(): void {
    const text = formatColor(working.value, writeSpace.value) ?? formatColor(working.value, "hex");
    if (text === null) return;

    notationSwitched.value = writeSpace.value !== notation.value;
    written.value = text;
    rawText.value = text;
    rawError.value = "";
    emit("update:modelValue", text);

    recent.value = [text, ...recent.value.filter((entry) => entry !== text)].slice(0, MAX_RECENT);
}

function setColor(next: Rgb): void {
    working.value = next;
    write();
}

/* -------------------------------------------------------------------------- */
/* The continuous field                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The field is parameterised in HSV, which is what a saturation-brightness square is.
 *
 * Held as its own state rather than derived from `working` on every render, because hue and
 * saturation are undefined at the edges: dragging the thumb to the black corner would
 * otherwise throw away the hue the user had picked, and dragging back out would come back
 * red. Real pickers all keep this state, and the reason is that the round trip loses
 * information at the boundary rather than that it is slow.
 */
const hue = ref(0);
const saturation = ref(0);
const brightness = ref(0);

function syncFieldFromWorking(): void {
    const hsv = rgbToHsv(working.value);

    // Black has neither a hue nor a saturation, and grey has no hue. Reading either back off
    // the colour at those points is what makes a picker feel broken: drag the thumb to the
    // bottom of the field and the saturation you had is gone, drag back up and you get a grey;
    // drag into the white corner and the hue is gone, drag back out and you get red. Both
    // guards keep the axis the user set, and neither can hide a real change, because a colour
    // that has a saturation or a hue reports it.
    if (hsv.v > 0.01) saturation.value = hsv.s;
    if (hsv.s > 0.01 && hsv.v > 0.01) hue.value = hsv.h;
    brightness.value = hsv.v;
}

syncFieldFromWorking();
watch(working, syncFieldFromWorking);

function applyField(): void {
    setColor(
        hsvToRgb({
            h: hue.value,
            s: saturation.value,
            v: brightness.value,
            alpha: working.value.alpha,
        }),
    );
}

const fieldElement = ref<HTMLElement | null>(null);

/** Turns a pointer position into saturation and brightness, clamped to the field. */
function pointTo(event: PointerEvent): void {
    const box = fieldElement.value?.getBoundingClientRect();
    if (box === undefined || box.width === 0 || box.height === 0) return;

    saturation.value = Math.min(100, Math.max(0, ((event.clientX - box.left) / box.width) * 100));
    brightness.value = Math.min(
        100,
        Math.max(0, 100 - ((event.clientY - box.top) / box.height) * 100),
    );
    applyField();
}

function onFieldPointerDown(event: PointerEvent): void {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    pointTo(event);
}

function onFieldPointerMove(event: PointerEvent): void {
    if (event.buttons === 0) return;
    pointTo(event);
}

const fieldBackground = computed(() => {
    const pure = cssColor(hsvToRgb({ h: hue.value, s: 100, v: 100, alpha: 1 }));
    return (
        `linear-gradient(to top, rgb(0 0 0), rgba(0, 0, 0, 0)), ` +
        `linear-gradient(to right, rgb(255 255 255), ${pure})`
    );
});

const hueTrack =
    "linear-gradient(to right, rgb(255 0 0), rgb(255 255 0), rgb(0 255 0), " +
    "rgb(0 255 255), rgb(0 0 255), rgb(255 0 255), rgb(255 0 0))";

const alphaTrack = computed(
    () =>
        `linear-gradient(to right, rgba(0, 0, 0, 0), ${cssColor({ ...clipRgb(working.value), alpha: 1 })})`,
);

const swatchColor = computed(() => cssColor(working.value));

/* -------------------------------------------------------------------------- */
/* Numeric entry                                                              */
/* -------------------------------------------------------------------------- */

interface Component {
    key: string;
    labelKey: string;
    fallback: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix: string;
}

function component(
    key: string,
    fallback: string,
    value: number,
    min: number,
    max: number,
    step: number,
    suffix = "",
): Component {
    return { key, labelKey: `appearance.color.component.${key}`, fallback, value, min, max, step, suffix };
}

/**
 * The numeric fields for the notation currently selected.
 *
 * Per notation rather than one fixed set, because "numeric entry" in a translator means entry
 * in the space you are reading, and a picker that only offered red, green and blue would send
 * anybody working in OKLCH back out to a calculator.
 */
const components = computed<Component[]>(() => {
    const color = working.value;
    switch (writeSpace.value) {
        case "hsl": {
            const hsl = rgbToHsl(color);
            return [
                component("hue", "Hue", hsl.h, 0, 360, 0.1, "deg"),
                component("saturation", "Saturation", hsl.s, 0, 100, 0.1, "%"),
                component("lightness", "Lightness", hsl.l, 0, 100, 0.1, "%"),
            ];
        }
        case "hsv": {
            const hsv = rgbToHsv(color);
            return [
                component("hue", "Hue", hsv.h, 0, 360, 0.1, "deg"),
                component("saturation", "Saturation", hsv.s, 0, 100, 0.1, "%"),
                component("value", "Brightness", hsv.v, 0, 100, 0.1, "%"),
            ];
        }
        case "hwb": {
            const hwb = rgbToHwb(color);
            return [
                component("hue", "Hue", hwb.h, 0, 360, 0.1, "deg"),
                component("whiteness", "Whiteness", hwb.w, 0, 100, 0.1, "%"),
                component("blackness", "Blackness", hwb.b, 0, 100, 0.1, "%"),
            ];
        }
        case "lab": {
            const lab = rgbToLab(color);
            return [
                component("lightness", "Lightness", lab.l, 0, 100, 0.1, "%"),
                component("labA", "a (green to red)", lab.a, -160, 160, 0.1),
                component("labB", "b (blue to yellow)", lab.b, -160, 160, 0.1),
            ];
        }
        case "lch": {
            const lch = rgbToLch(color);
            return [
                component("lightness", "Lightness", lch.l, 0, 100, 0.1, "%"),
                component("chroma", "Chroma", lch.c, 0, 160, 0.1),
                component("hue", "Hue", lch.h, 0, 360, 0.1, "deg"),
            ];
        }
        case "oklab": {
            const oklab = rgbToOklab(color);
            return [
                component("lightness", "Lightness", oklab.l, 0, 1, 0.001),
                component("labA", "a (green to red)", oklab.a, -0.5, 0.5, 0.001),
                component("labB", "b (blue to yellow)", oklab.b, -0.5, 0.5, 0.001),
            ];
        }
        case "oklch": {
            const oklch = rgbToOklch(color);
            return [
                component("lightness", "Lightness", oklch.l, 0, 1, 0.001),
                component("chroma", "Chroma", oklch.c, 0, 0.5, 0.001),
                component("hue", "Hue", oklch.h, 0, 360, 0.1, "deg"),
            ];
        }
        case "cmyk": {
            const cmyk = rgbToCmyk(color);
            return [
                component("cyan", "Cyan", cmyk.c, 0, 100, 0.1, "%"),
                component("magenta", "Magenta", cmyk.m, 0, 100, 0.1, "%"),
                component("yellow", "Yellow", cmyk.y, 0, 100, 0.1, "%"),
                component("key", "Key (black)", cmyk.k, 0, 100, 0.1, "%"),
            ];
        }
        default: {
            const clipped = clipRgb(color);
            return [
                component("red", "Red", clipped.r * 255, 0, 255, 1),
                component("green", "Green", clipped.g * 255, 0, 255, 1),
                component("blue", "Blue", clipped.b * 255, 0, 255, 1),
            ];
        }
    }
});

/**
 * Rebuilds the colour after one numeric field changed.
 *
 * Written by re-composing the whole notation from the displayed values rather than by mutating
 * one axis of the stored colour, so a field and the swatch cannot disagree about a component
 * the notation does not carry.
 */
function setComponent(key: string, next: number): void {
    const values = new Map(components.value.map((entry) => [entry.key, entry.value]));
    values.set(key, next);
    const at = (name: string): number => values.get(name) ?? 0;
    const alpha = working.value.alpha;

    const text = ((): string => {
        switch (writeSpace.value) {
            case "hsl":
                return `hsl(${at("hue")} ${at("saturation")}% ${at("lightness")}% / ${alpha})`;
            case "hsv":
                return `hsv(${at("hue")} ${at("saturation")}% ${at("value")}% / ${alpha})`;
            case "hwb":
                return `hwb(${at("hue")} ${at("whiteness")}% ${at("blackness")}% / ${alpha})`;
            case "lab":
                return `lab(${at("lightness")}% ${at("labA")} ${at("labB")} / ${alpha})`;
            case "lch":
                return `lch(${at("lightness")}% ${at("chroma")} ${at("hue")} / ${alpha})`;
            case "oklab":
                return `oklab(${at("lightness")} ${at("labA")} ${at("labB")} / ${alpha})`;
            case "oklch":
                return `oklch(${at("lightness")} ${at("chroma")} ${at("hue")} / ${alpha})`;
            case "cmyk":
                return `cmyk(${at("cyan")}% ${at("magenta")}% ${at("yellow")}% ${at("key")}% / ${alpha})`;
            default:
                return `rgb(${at("red")} ${at("green")} ${at("blue")} / ${alpha})`;
        }
    })();

    const parsed = parseColor(text);
    if (parsed.ok) setColor(parsed.value.color);
}

function setAlpha(next: number): void {
    setColor({ ...working.value, alpha: Math.min(1, Math.max(0, next)) });
}

/* -------------------------------------------------------------------------- */
/* Free text                                                                  */
/* -------------------------------------------------------------------------- */

function commitRawText(): void {
    if (rawText.value.trim() === "" && props.allowEmpty) {
        rawError.value = "";
        written.value = "";
        emit("update:modelValue", "");
        return;
    }

    const parsed = parseColor(rawText.value);
    if (!parsed.ok) {
        rawError.value = t(colorParseErrorKey(parsed.error), "That is not a colour this app can read.");
        return;
    }

    rawError.value = "";
    notation.value = parsed.value.space === "named" ? "hex" : parsed.value.space;
    setColor(parsed.value.color);
}

/* -------------------------------------------------------------------------- */
/* The translator                                                             */
/* -------------------------------------------------------------------------- */

const search = ref("");
const searchRegex = ref(false);
const searchFlags = ref("i");

const spaceNames: Readonly<Record<ColorSpaceId, string>> = {
    named: "Named colour",
    hex: "Hexadecimal",
    rgb: "RGB",
    hsl: "HSL",
    hsv: "HSV / HSB",
    hwb: "HWB",
    lab: "CIELAB",
    lch: "CIELCH",
    oklab: "OKLab",
    oklch: "OKLCH",
    cmyk: "CMYK (uncalibrated)",
};

const rows = computed(() => {
    const matcher = createSettingMatcher(search.value, searchRegex.value, searchFlags.value);
    return colorRepresentations(working.value)
        .map((row) => ({
            ...row,
            title: t(colorSpaceLabelKey(row.space), spaceNames[row.space]),
        }))
        .filter((row) => matcher.test(`${row.title} ${row.notation} ${row.text}`));
});

const searchCorpus = computed(() =>
    colorRepresentations(working.value)
        .map((row) => `${t(colorSpaceLabelKey(row.space), spaceNames[row.space])} ${row.text}`)
        .join("\n"),
);

async function copy(text: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
        copied.value = text;
        globalThis.setTimeout(() => {
            if (copied.value === text) copied.value = "";
        }, 1600);
    } catch {
        // A denied clipboard permission is not worth a dialog, and the text is on screen and
        // selectable either way.
    }
}

/** Copying never changes the selection, which is the whole point of a translator row. */
function pick(row: { space: ColorSpaceId; available: boolean }): void {
    if (!row.available) return;
    notation.value = row.space === "named" ? "hex" : row.space;
    write();
}

/* -------------------------------------------------------------------------- */
/* Contrast, gamut and the eyedropper                                         */
/* -------------------------------------------------------------------------- */

function reportAgainst(other: string, asBackground: boolean): { ratio: string; level: string } | null {
    if (other.trim() === "") return null;
    const parsed = parseColor(other);
    if (!parsed.ok) return null;

    const report = asBackground
        ? contrastReport(working.value, parsed.value.color)
        : contrastReport(parsed.value.color, working.value);

    return { ratio: formatNumber(report.ratio, 2), level: report.level };
}

const contrastOnBackground = computed(() => reportAgainst(props.contrastBackground, true));
const contrastOfForeground = computed(() => reportAgainst(props.contrastForeground, false));

/**
 * The eyedropper, only where the platform has one.
 *
 * Rendered conditionally rather than disabled, because a button that cannot do its job is a
 * decorative control, and the alternative to an eyedropper is the whole rest of this panel
 * rather than a missing capability worth apologising for.
 */
interface EyeDropperLike {
    open: () => Promise<{ sRGBHex: string }>;
}

const eyeDropper = computed<(new () => EyeDropperLike) | null>(() => {
    const found = (globalThis as { EyeDropper?: new () => EyeDropperLike }).EyeDropper;
    return found ?? null;
});

async function pickFromScreen(): Promise<void> {
    const Dropper = eyeDropper.value;
    if (Dropper === null) return;
    try {
        const result = await new Dropper().open();
        const parsed = parseColor(result.sRGBHex);
        if (parsed.ok) {
            notation.value = "hex";
            setColor(parsed.value.color);
        }
    } catch {
        // The user pressed Escape. That is a cancellation, not a failure.
    }
}

const gamutLabel = computed(() => {
    switch (description.value.gamut) {
        case "srgb":
            return t("appearance.color.gamut.srgb", "sRGB");
        case "display-p3":
            return t("appearance.color.gamut.p3", "Outside sRGB, inside Display P3");
        default:
            return t("appearance.color.gamut.outside", "Outside every gamut this app can name");
    }
});
</script>

<template>
    <div class="mb-color-picker">
        <div class="mb-color-picker__header">
            <span
                class="mb-color-picker__swatch"
                :style="{ background: swatchColor }"
                role="img"
                :aria-label="t('appearance.color.swatch', { color: rawText }, 'The colour now selected: {color}')"
            />
            <h3 class="mb-color-picker__title">{{ label }}</h3>
            <v-chip size="x-small" variant="tonal" :color="description.gamut === 'srgb' ? undefined : 'warning'">
                {{ gamutLabel }}
            </v-chip>
        </div>

        <!--
            The continuous field. Two real range inputs carry saturation and brightness so
            keyboard and screen-reader operation are the platform's rather than a re-implementation,
            and the thumb is drawn from their values.
        -->
        <div
            ref="fieldElement"
            class="mb-color-picker__field"
            role="group"
            :aria-label="t('appearance.color.field', 'Saturation and brightness')"
            :style="{ background: fieldBackground }"
            @pointerdown="onFieldPointerDown"
            @pointermove="onFieldPointerMove"
        >
            <span
                class="mb-color-picker__thumb"
                :style="{ left: `${saturation}%`, top: `${100 - brightness}%` }"
                aria-hidden="true"
            />
            <input
                v-model.number="saturation"
                class="mb-color-picker__axis"
                type="range"
                min="0"
                max="100"
                step="0.5"
                :aria-label="t('appearance.color.saturation', 'Saturation')"
                @input="applyField"
            />
            <input
                v-model.number="brightness"
                class="mb-color-picker__axis"
                type="range"
                min="0"
                max="100"
                step="0.5"
                :aria-label="t('appearance.color.brightness', 'Brightness')"
                @input="applyField"
            />
        </div>

        <label class="mb-color-picker__slider">
            <span class="mb-color-picker__sliderLabel">{{ t("appearance.color.hue", "Hue") }}</span>
            <input
                v-model.number="hue"
                type="range"
                min="0"
                max="360"
                step="0.5"
                :style="{ background: hueTrack }"
                :aria-label="t('appearance.color.hue', 'Hue')"
                @input="applyField"
            />
        </label>

        <label class="mb-color-picker__slider">
            <span class="mb-color-picker__sliderLabel">{{ t("appearance.color.alpha", "Opacity") }}</span>
            <input
                :value="working.alpha"
                type="range"
                min="0"
                max="1"
                step="0.01"
                :style="{ background: alphaTrack }"
                :aria-label="t('appearance.color.alpha', 'Opacity')"
                @input="(event) => setAlpha(Number((event.target as HTMLInputElement).value))"
            />
        </label>

        <v-alert
            v-if="description.clipped && !allowClipping"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-color-picker__notice"
        >
            {{
                t(
                    "appearance.color.clipWarning",
                    { notation: writeSpace.toUpperCase() },
                    "This colour is outside sRGB. It is being saved as {notation} so nothing is lost. Saving it in a notation that cannot hold it would change the colour.",
                )
            }}
            <template #append>
                <v-btn size="small" variant="text" @click="allowClipping = true; write()">
                    {{ t("appearance.color.clipAnyway", "Save the clipped value anyway") }}
                </v-btn>
            </template>
        </v-alert>

        <p v-else-if="notationSwitched" class="mb-color-picker__hint" aria-live="polite">
            {{
                t(
                    "appearance.color.notationChanged",
                    { notation: writeSpace.toUpperCase() },
                    "Saved as {notation}.",
                )
            }}
        </p>

        <v-divider class="mb-color-picker__rule" />

        <div class="mb-color-picker__entry">
            <v-select
                v-model="notation"
                :items="COLOR_SPACES.filter((space) => space !== 'named').map((space) => ({ title: t(colorSpaceLabelKey(space), spaceNames[space]), value: space }))"
                :label="t('appearance.color.notation', 'Notation')"
                density="compact"
                variant="outlined"
                hide-details
                class="mb-color-picker__notation"
                @update:model-value="write"
            />
            <v-text-field
                v-for="entry in components"
                :key="entry.key"
                :model-value="formatNumber(entry.value, entry.step < 0.01 ? 4 : 2)"
                :label="t(entry.labelKey, entry.fallback) + (entry.suffix ? ` (${entry.suffix})` : '')"
                type="number"
                :min="entry.min"
                :max="entry.max"
                :step="entry.step"
                density="compact"
                variant="outlined"
                hide-details
                class="mb-color-picker__number"
                @update:model-value="(value: string) => setComponent(entry.key, Number(value))"
            />
        </div>

        <v-text-field
            v-model="rawText"
            :label="t('appearance.color.any', 'Any notation')"
            :placeholder="t('appearance.color.anyHint', 'For example #1e88e5, oklch(0.6 0.15 250), or rebeccapurple')"
            :error-messages="rawError"
            density="compact"
            variant="outlined"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            hide-details="auto"
            class="mb-color-picker__raw"
            @blur="commitRawText"
            @keydown.enter.prevent="commitRawText"
        />

        <div class="mb-color-picker__shortcuts">
            <v-btn
                v-if="eyeDropper !== null"
                :prepend-icon="mdiEyedropperVariant"
                size="small"
                variant="tonal"
                @click="pickFromScreen"
            >
                {{ t("appearance.color.eyedropper", "Pick from the screen") }}
            </v-btn>
            <button
                v-for="entry in recent"
                :key="entry"
                type="button"
                class="mb-color-picker__recent"
                :style="{ background: entry }"
                :aria-label="t('appearance.color.recent', { color: entry }, 'Use the recent colour {color}')"
                @click="adoptModel(entry); write()"
            >
                <v-tooltip activator="parent" location="top" :text="entry" />
            </button>
        </div>

        <v-divider class="mb-color-picker__rule" />

        <h4 class="mb-color-picker__subtitle">{{ t("appearance.color.translator", "Every notation for this colour") }}</h4>

        <ConfigSearchField
            v-model="search"
            v-model:regex="searchRegex"
            v-model:flags="searchFlags"
            :label="t('appearance.color.searchLabel', 'Search the notations')"
            :sample="searchCorpus"
            :summary="t('appearance.color.searchSummary', { shown: rows.length, total: COLOR_SPACES.length }, 'Showing {shown} of {total} notations.')"
        />

        <ul class="mb-color-picker__rows">
            <li v-for="row in rows" :key="row.space" class="mb-color-picker__row">
                <span class="mb-color-picker__rowName">{{ row.title }}</span>

                <span v-if="!row.available" class="mb-color-picker__rowEmpty">
                    {{ t("appearance.color.noName", "This colour has no CSS keyword.") }}
                </span>

                <template v-else>
                    <code class="mb-color-picker__rowValue">{{ row.text }}</code>
                    <v-chip v-if="row.clipped" size="x-small" color="warning" variant="tonal">
                        {{ t("appearance.color.clipped", "Clipped") }}
                        <v-tooltip
                            activator="parent"
                            location="top"
                            :text="t('appearance.color.clippedHint', { notation: row.notation }, '{notation} cannot hold this colour, so this line shows a different one.')"
                        />
                    </v-chip>
                    <v-btn
                        :icon="copied === row.text ? mdiCheck : mdiContentCopy"
                        size="x-small"
                        variant="text"
                        :aria-label="t('appearance.color.copy', { notation: row.notation }, 'Copy the {notation} value')"
                        @click="copy(row.text)"
                    />
                    <v-btn size="x-small" variant="text" @click="pick(row)">
                        {{ t("appearance.color.useNotation", "Use") }}
                        <v-tooltip
                            activator="parent"
                            location="top"
                            :text="t('appearance.color.useNotationHint', 'Save the colour in this notation. The colour itself does not change.')"
                        />
                    </v-btn>
                </template>
            </li>
        </ul>

        <p v-if="rows.length === 0" class="mb-color-picker__hint">
            {{ t("appearance.color.noRows", "No notation matches that search.") }}
        </p>

        <template v-if="contrastOnBackground !== null || contrastOfForeground !== null">
            <v-divider class="mb-color-picker__rule" />
            <h4 class="mb-color-picker__subtitle">{{ t("appearance.color.contrast", "Contrast") }}</h4>
            <p v-if="contrastOnBackground !== null" class="mb-color-picker__hint">
                {{
                    t(
                        "appearance.color.contrastOn",
                        { ratio: contrastOnBackground.ratio, level: contrastOnBackground.level },
                        "{ratio} to 1 against the surface behind it ({level} for body text).",
                    )
                }}
            </p>
            <p v-if="contrastOfForeground !== null" class="mb-color-picker__hint">
                {{
                    t(
                        "appearance.color.contrastOf",
                        { ratio: contrastOfForeground.ratio, level: contrastOfForeground.level },
                        "{ratio} to 1 for the text on top of it ({level} for body text).",
                    )
                }}
            </p>
        </template>
    </div>
</template>

<style>
.mb-color-picker {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 280px;
}

.mb-color-picker__header {
    display: flex;
    align-items: center;
    gap: 8px;
}

.mb-color-picker__title {
    flex: 1 1 auto;
    margin: 0;
    font-size: 0.95rem;
    font-weight: 500;
}

.mb-color-picker__subtitle {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 500;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/*
 * The chequerboard is what makes an alpha visible at all: a half-transparent swatch over an
 * opaque panel looks exactly like an opaque lighter colour.
 */
.mb-color-picker__swatch {
    flex: 0 0 auto;
    inline-size: 28px;
    block-size: 28px;
    border-radius: 6px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.24);
    background-color: currentcolor;
}

.mb-color-picker__field {
    position: relative;
    block-size: 160px;
    border-radius: 8px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.24);
    touch-action: none;
    cursor: crosshair;
}

.mb-color-picker__field:focus-within {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-color-picker__thumb {
    position: absolute;
    inline-size: 14px;
    block-size: 14px;
    margin-inline-start: -7px;
    margin-block-start: -7px;
    border-radius: 50%;
    border: 2px solid rgb(255 255 255);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
    pointer-events: none;
}

/*
 * Focusable, operable and announced, but not drawn: the thumb above is the visible
 * representation of these two values. `clip` rather than `display: none` because a hidden
 * input is not focusable and the keyboard path would go with it.
 */
.mb-color-picker__axis {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
    inset-block-start: 0;
    inset-inline-start: 0;
}

.mb-color-picker__slider {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
}

.mb-color-picker__sliderLabel {
    flex: 0 0 auto;
    inline-size: 64px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-color-picker__slider input[type="range"] {
    flex: 1 1 auto;
    block-size: 16px;
    border-radius: 8px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.24);
    appearance: none;
}

.mb-color-picker__slider input[type="range"]:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-color-picker__entry {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.mb-color-picker__notation {
    flex: 1 1 140px;
}

.mb-color-picker__number {
    flex: 1 1 90px;
    min-inline-size: 90px;
}

.mb-color-picker__shortcuts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
}

.mb-color-picker__recent {
    inline-size: 22px;
    block-size: 22px;
    border-radius: 4px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.24);
}

.mb-color-picker__recent:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-color-picker__rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.mb-color-picker__row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-block-size: 28px;
}

.mb-color-picker__rowName {
    flex: 0 0 auto;
    inline-size: 116px;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-color-picker__rowValue {
    flex: 1 1 auto;
    overflow-x: auto;
    font-size: 0.75rem;
    white-space: nowrap;
}

.mb-color-picker__rowEmpty {
    flex: 1 1 auto;
    font-size: 0.75rem;
    font-style: italic;
    color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}

.mb-color-picker__hint {
    margin: 0;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-color-picker__rule {
    margin-block: 2px;
}

.mb-color-picker__notice {
    font-size: 0.8rem;
}
</style>
