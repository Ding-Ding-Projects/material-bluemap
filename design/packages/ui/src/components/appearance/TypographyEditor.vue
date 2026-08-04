<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiRestore } from "@mdi/js";
import {
    VBtn,
    VCheckbox,
    VChip,
    VMenu,
    VSelect,
    VSlider,
    VTextField,
    VTooltip,
} from "vuetify/components";

import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import ColorField from "./ColorField.vue";
import { fontFamilyStack, searchFonts, type FontFamily } from "./fontCatalog.js";
import {
    ASSUMED_SUPPORT_LABEL_KEY,
    TYPOGRAPHY_PROPERTIES,
    typographyPropertyLabelKey,
    typographySearchText,
    type TypographyCapabilities,
    type TypographyNote,
    type TypographyPropertyId,
    type TypographySpec,
} from "./typographySpec.js";

/**
 * The typography editor, at the depth the contract asks for.
 *
 * Two rules shape everything below, and both are about not lying to the user.
 *
 * **A property the engine will not render stays on screen.** It keeps its control, it keeps
 * its value, and it gains a chip saying which CSS declaration was refused. Hiding it would
 * make a saved value invisible and then, on the next save, gone - which is the exact failure
 * the contract calls out. The capability probe errs towards "supported" for the same reason:
 * a false negative hides a control the platform can perfectly well render.
 *
 * **A compromise CSS forces is reported rather than resolved in silence.** There is one
 * `text-decoration-style` for the underline, the strikethrough and the overline together, so
 * a wavy underline beside a double strikethrough cannot be drawn as asked. Both lines are
 * still drawn, and the note beneath says which one did not get the style it wanted. The
 * alternative - picking a winner quietly - leaves somebody adjusting a control that has
 * stopped doing anything.
 *
 * Every row is reachable from the search bar at the top, which is the project's own field
 * with its own regex builder rather than a second search implementation. The searchable text
 * for a row is the words a person would actually type: "tracking" finds letter spacing.
 */
const props = defineProps<{
    /** The fully resolved specification, which is what the preview renders. */
    spec: TypographySpec;
    /** This element's own overrides, so a reset can be offered only where there is one. */
    overrides: Partial<TypographySpec>;
    capabilities: TypographyCapabilities;
    fonts: readonly FontFamily[];
    /** Compromises the engine forced, reported beneath the rows that caused them. */
    notes: readonly TypographyNote[];
}>();

const emit = defineEmits<{
    set: [id: TypographyPropertyId, value: unknown];
    reset: [id: TypographyPropertyId];
}>();

const { t } = useI18n();

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The English label for each property.
 *
 * Held here rather than in the pure module because it is user-facing copy and belongs beside
 * the interface that renders it; the module exports the i18n keys, which is the part a
 * translator needs.
 */
const LABELS: Readonly<Record<TypographyPropertyId, string>> = {
    fontFamily: "Font",
    fontSize: "Size",
    fontSizeUnit: "Size unit",
    fontWeight: "Weight",
    bold: "Bold",
    italic: "Italic",
    obliqueAngle: "Oblique angle",
    variableAxes: "Variable axes",
    underline: "Underline",
    underlineColor: "Underline colour",
    strikethrough: "Strikethrough",
    overline: "Overline",
    capitalization: "Capitalisation",
    smallCaps: "Small caps",
    baselineShift: "Superscript or subscript",
    baselineOffset: "Baseline offset",
    textColor: "Text colour",
    highlight: "Highlight",
    outlineWidth: "Outline width",
    outlineColor: "Outline colour",
    shadow: "Shadow",
    glow: "Glow",
    letterSpacing: "Character spacing",
    wordSpacing: "Word spacing",
    lineHeight: "Line height",
    textDirection: "Text direction",
    textAlign: "Alignment",
};

function label(id: TypographyPropertyId): string {
    return t(typographyPropertyLabelKey(id), LABELS[id]);
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

const search = ref("");
const searchRegex = ref(false);
const searchFlags = ref("i");

const rows = computed(() => {
    const matcher = createSettingMatcher(search.value, searchRegex.value, searchFlags.value);
    return TYPOGRAPHY_PROPERTIES.map((id) => {
        const capability = props.capabilities[id];
        return {
            id,
            label: label(id),
            supported: capability.supported,
            reason: capability.reason,
            overridden: id in props.overrides,
            notes: props.notes.filter((note) => note.property === id),
        };
    }).filter((row) => matcher.test(`${row.label} ${typographySearchText(row.id)}`));
});

const searchCorpus = computed(() =>
    TYPOGRAPHY_PROPERTIES.map((id) => `${label(id)} ${typographySearchText(id)}`).join("\n"),
);

/* -------------------------------------------------------------------------- */
/* The font list                                                              */
/* -------------------------------------------------------------------------- */

const fontOpen = ref(false);
const fontSearch = ref("");
const fontRegex = ref(false);
const fontFlags = ref("i");

const visibleFonts = computed(() => {
    const matcher = createSettingMatcher(fontSearch.value, fontRegex.value, fontFlags.value);
    return searchFonts(props.fonts, (text) => matcher.test(text));
});

const fontCorpus = computed(() => props.fonts.map((font) => font.family).join("\n"));

function chooseFont(family: string): void {
    emit("set", "fontFamily", family);
    fontOpen.value = false;
}

/* -------------------------------------------------------------------------- */
/* Variable axes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The four axes OpenType registers, offered generically.
 *
 * The platform gives this app no way to read a face's axis list: `queryLocalFonts()` reports
 * family names and nothing else, and parsing the font binary to find its `fvar` table is not
 * something a settings panel should be doing. So the registered axes are offered for every
 * face, with the note below saying plainly that a face without one ignores it rather than
 * implying the app has checked. A free-entry row covers the custom axes a foundry defines.
 */
const REGISTERED_AXES: readonly { tag: string; label: string; min: number; max: number }[] = [
    { tag: "wght", label: "Weight (wght)", min: 1, max: 1000 },
    { tag: "wdth", label: "Width (wdth)", min: 50, max: 200 },
    { tag: "slnt", label: "Slant (slnt)", min: -20, max: 0 },
    { tag: "opsz", label: "Optical size (opsz)", min: 6, max: 144 },
];

const customAxisTag = ref("");
const customAxisValue = ref(0);

function setAxis(tag: string, value: number | null): void {
    const next: Record<string, number> = { ...props.spec.variableAxes };
    if (value === null) delete next[tag];
    else next[tag] = value;
    emit("set", "variableAxes", next);
}

function addCustomAxis(): void {
    const tag = customAxisTag.value.trim();
    if (tag === "") return;
    setAxis(tag, customAxisValue.value);
    customAxisTag.value = "";
}

const customAxes = computed(() =>
    Object.entries(props.spec.variableAxes).filter(
        ([tag]) => !REGISTERED_AXES.some((axis) => axis.tag === tag),
    ),
);

/* -------------------------------------------------------------------------- */
/* Nested values                                                              */
/* -------------------------------------------------------------------------- */

function setShadow(part: "offsetX" | "offsetY" | "blur" | "color", value: number | string): void {
    emit("set", "shadow", { ...props.spec.shadow, [part]: value });
}

function setGlow(part: "radius" | "color", value: number | string): void {
    emit("set", "glow", { ...props.spec.glow, [part]: value });
}

/* -------------------------------------------------------------------------- */
/* Choice lists                                                               */
/* -------------------------------------------------------------------------- */

function choices(id: TypographyPropertyId, entries: readonly [string, string][]): { title: string; value: string }[] {
    return entries.map(([value, fallback]) => ({
        title: t(`appearance.type.${id}.${value}`, fallback),
        value,
    }));
}

const sizeUnits = computed(() =>
    choices("fontSizeUnit", [
        ["px", "Pixels"],
        ["pt", "Points"],
        ["rem", "Root em"],
    ]),
);

const italicChoices = computed(() =>
    choices("italic", [
        ["none", "Upright"],
        ["italic", "Italic"],
        ["oblique", "Oblique"],
    ]),
);

const underlineChoices = computed(() =>
    choices("underline", [
        ["none", "None"],
        ["solid", "Solid"],
        ["double", "Double"],
        ["dotted", "Dotted"],
        ["dashed", "Dashed"],
        ["wavy", "Wavy"],
    ]),
);

const strikethroughChoices = computed(() =>
    choices("strikethrough", [
        ["none", "None"],
        ["single", "Single"],
        ["double", "Double"],
    ]),
);

const capitalizationChoices = computed(() =>
    choices("capitalization", [
        ["none", "As typed"],
        ["uppercase", "UPPERCASE"],
        ["lowercase", "lowercase"],
        ["capitalize", "Capitalise Each Word"],
    ]),
);

const baselineChoices = computed(() =>
    choices("baselineShift", [
        ["none", "On the baseline"],
        ["superscript", "Superscript"],
        ["subscript", "Subscript"],
    ]),
);

const directionChoices = computed(() =>
    choices("textDirection", [
        ["ltr", "Left to right"],
        ["rtl", "Right to left"],
    ]),
);

const alignChoices = computed(() =>
    choices("textAlign", [
        ["start", "Start"],
        ["center", "Centre"],
        ["end", "End"],
        ["justify", "Justified"],
    ]),
);

/** A number field's value, guarding against the empty string a cleared input produces. */
function number(value: string, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
</script>

<template>
    <div class="mb-type-editor">
        <ConfigSearchField
            v-model="search"
            v-model:regex="searchRegex"
            v-model:flags="searchFlags"
            :label="t('appearance.type.search', 'Search the typography settings')"
            :sample="searchCorpus"
            :summary="t('appearance.type.searchSummary', { shown: rows.length, total: TYPOGRAPHY_PROPERTIES.length }, 'Showing {shown} of {total} settings.')"
        />

        <p v-if="rows.length === 0" class="mb-type-editor__hint">
            {{ t("appearance.type.noMatch", "No typography setting matches that search.") }}
        </p>

        <div v-for="row in rows" :key="row.id" class="mb-type-row">
            <div class="mb-type-row__head">
                <span class="mb-type-row__label">{{ row.label }}</span>
                <v-chip v-if="row.overridden" size="x-small" variant="tonal" color="primary">
                    {{ t("appearance.type.overridden", "Set here") }}
                </v-chip>
                <v-btn
                    v-if="row.overridden"
                    :icon="mdiRestore"
                    size="x-small"
                    variant="text"
                    :aria-label="t('appearance.type.reset', { property: row.label }, 'Reset {property}')"
                    @click="emit('reset', row.id)"
                >
                    <v-tooltip
                        activator="parent"
                        location="top"
                        :text="t('appearance.type.resetHint', 'Remove this override so the element follows whatever is above it.')"
                    />
                </v-btn>
            </div>

            <!--
                Kept visible, kept editable, and kept in the record. The chip says which CSS
                declaration this engine refused, so the value is not silently doing nothing.
            -->
            <p v-if="!row.supported" class="mb-type-row__unsupported">
                {{ row.reason }}
            </p>

            <div class="mb-type-row__control">
                <template v-if="row.id === 'fontFamily'">
                    <v-btn
                        variant="outlined"
                        size="small"
                        class="mb-type-editor__fontButton"
                        :style="{ fontFamily: fontFamilyStack(spec.fontFamily, fonts) }"
                        :aria-label="t('appearance.type.fontOpen', { family: spec.fontFamily }, 'Choose a font. Currently {family}.')"
                        :aria-expanded="fontOpen ? 'true' : 'false'"
                    >
                        {{ spec.fontFamily }}
                        <v-menu
                            v-model="fontOpen"
                            activator="parent"
                            :close-on-content-click="false"
                            location="bottom start"
                            offset="8"
                        >
                            <div class="mb-type-editor__fontPanel">
                                <ConfigSearchField
                                    v-model="fontSearch"
                                    v-model:regex="fontRegex"
                                    v-model:flags="fontFlags"
                                    :label="t('appearance.type.fontSearch', 'Search fonts')"
                                    :sample="fontCorpus"
                                    :summary="t('appearance.type.fontSummary', { shown: visibleFonts.length, total: fonts.length }, 'Showing {shown} of {total} fonts.')"
                                />
                                <ul class="mb-type-editor__fontList">
                                    <li v-for="font in visibleFonts" :key="font.family">
                                        <button
                                            type="button"
                                            class="mb-type-editor__fontItem"
                                            :class="{ 'mb-type-editor__fontItem--current': font.family === spec.fontFamily }"
                                            :style="{ fontFamily: fontFamilyStack(font.family, fonts) }"
                                            :aria-current="font.family === spec.fontFamily ? 'true' : undefined"
                                            @click="chooseFont(font.family)"
                                        >
                                            <span class="mb-type-editor__fontName">{{ font.family }}</span>
                                            <span class="mb-type-editor__fontSample">{{ font.sample }}</span>
                                            <v-chip v-if="font.source === 'installed'" size="x-small" variant="tonal">
                                                {{ t("appearance.type.fontInstalled", "Installed") }}
                                            </v-chip>
                                        </button>
                                    </li>
                                </ul>
                                <p v-if="visibleFonts.length === 0" class="mb-type-editor__hint">
                                    {{ t("appearance.type.noFont", "No font matches that search.") }}
                                </p>
                            </div>
                        </v-menu>
                    </v-btn>
                </template>

                <template v-else-if="row.id === 'fontSize'">
                    <v-text-field
                        :model-value="spec.fontSize"
                        type="number"
                        min="1"
                        max="400"
                        step="0.5"
                        density="compact"
                        variant="outlined"
                        hide-details
                        :label="t('appearance.type.fontSizeEntry', 'Any size')"
                        @update:model-value="(value: string) => emit('set', 'fontSize', number(value, spec.fontSize))"
                    />
                    <v-slider
                        :model-value="spec.fontSize"
                        :min="8"
                        :max="72"
                        :step="1"
                        density="compact"
                        hide-details
                        :aria-label="t('appearance.type.fontSizeStep', 'Size, in steps')"
                        @update:model-value="(value: number) => emit('set', 'fontSize', value)"
                    />
                </template>

                <v-select
                    v-else-if="row.id === 'fontSizeUnit'"
                    :model-value="spec.fontSizeUnit"
                    :items="sizeUnits"
                    density="compact"
                    variant="outlined"
                    hide-details
                    :label="row.label"
                    @update:model-value="(value: string) => emit('set', 'fontSizeUnit', value)"
                />

                <v-slider
                    v-else-if="row.id === 'fontWeight'"
                    :model-value="spec.fontWeight"
                    :min="1"
                    :max="1000"
                    :step="1"
                    thumb-label
                    density="compact"
                    hide-details
                    :aria-label="row.label"
                    @update:model-value="(value: number) => emit('set', 'fontWeight', value)"
                />

                <v-checkbox
                    v-else-if="row.id === 'bold'"
                    :model-value="spec.bold"
                    density="compact"
                    hide-details
                    :label="t('appearance.type.boldHint', 'Bold, which raises the weight to at least 700')"
                    @update:model-value="(value: boolean | null) => emit('set', 'bold', value === true)"
                />

                <v-select
                    v-else-if="row.id === 'italic'"
                    :model-value="spec.italic"
                    :items="italicChoices"
                    density="compact"
                    variant="outlined"
                    hide-details
                    :label="row.label"
                    @update:model-value="(value: string) => emit('set', 'italic', value)"
                />

                <v-slider
                    v-else-if="row.id === 'obliqueAngle'"
                    :model-value="spec.obliqueAngle"
                    :min="-90"
                    :max="90"
                    :step="1"
                    thumb-label
                    density="compact"
                    hide-details
                    :disabled="spec.italic !== 'oblique'"
                    :aria-label="row.label"
                    @update:model-value="(value: number) => emit('set', 'obliqueAngle', value)"
                />

                <template v-else-if="row.id === 'variableAxes'">
                    <p class="mb-type-editor__hint">
                        {{
                            t(
                                "appearance.type.axesHint",
                                "The platform does not tell this app which axes a font has, so the registered ones are always offered. A face without an axis simply ignores it.",
                            )
                        }}
                    </p>
                    <div v-for="axis in REGISTERED_AXES" :key="axis.tag" class="mb-type-editor__axis">
                        <span class="mb-type-editor__axisTag">{{ axis.label }}</span>
                        <v-slider
                            :model-value="spec.variableAxes[axis.tag] ?? axis.min"
                            :min="axis.min"
                            :max="axis.max"
                            :step="1"
                            thumb-label
                            density="compact"
                            hide-details
                            :aria-label="axis.label"
                            @update:model-value="(value: number) => setAxis(axis.tag, value)"
                        />
                        <v-btn
                            v-if="spec.variableAxes[axis.tag] !== undefined"
                            :icon="mdiRestore"
                            size="x-small"
                            variant="text"
                            :aria-label="t('appearance.type.axisClear', { axis: axis.tag }, 'Stop setting the {axis} axis')"
                            @click="setAxis(axis.tag, null)"
                        />
                    </div>
                    <div v-for="[tag, value] in customAxes" :key="tag" class="mb-type-editor__axis">
                        <span class="mb-type-editor__axisTag">{{ tag }}</span>
                        <v-text-field
                            :model-value="value"
                            type="number"
                            density="compact"
                            variant="outlined"
                            hide-details
                            :label="tag"
                            @update:model-value="(next: string) => setAxis(tag, number(next, value))"
                        />
                        <v-btn
                            :icon="mdiRestore"
                            size="x-small"
                            variant="text"
                            :aria-label="t('appearance.type.axisClear', { axis: tag }, 'Stop setting the {axis} axis')"
                            @click="setAxis(tag, null)"
                        />
                    </div>
                    <div class="mb-type-editor__axis">
                        <v-text-field
                            v-model="customAxisTag"
                            density="compact"
                            variant="outlined"
                            hide-details
                            maxlength="4"
                            :label="t('appearance.type.axisTag', 'Custom axis tag')"
                        />
                        <v-text-field
                            v-model.number="customAxisValue"
                            type="number"
                            density="compact"
                            variant="outlined"
                            hide-details
                            :label="t('appearance.type.axisValue', 'Value')"
                        />
                        <v-btn size="small" variant="tonal" @click="addCustomAxis">
                            {{ t("appearance.type.axisAdd", "Add") }}
                        </v-btn>
                    </div>
                </template>

                <v-select
                    v-else-if="row.id === 'underline'"
                    :model-value="spec.underline"
                    :items="underlineChoices"
                    density="compact"
                    variant="outlined"
                    hide-details
                    :label="row.label"
                    @update:model-value="(value: string) => emit('set', 'underline', value)"
                />

                <ColorField
                    v-else-if="row.id === 'underlineColor'"
                    :model-value="spec.underlineColor"
                    :label="row.label"
                    @update:model-value="(value: string) => emit('set', 'underlineColor', value)"
                />

                <v-select
                    v-else-if="row.id === 'strikethrough'"
                    :model-value="spec.strikethrough"
                    :items="strikethroughChoices"
                    density="compact"
                    variant="outlined"
                    hide-details
                    :label="row.label"
                    @update:model-value="(value: string) => emit('set', 'strikethrough', value)"
                />

                <v-checkbox
                    v-else-if="row.id === 'overline'"
                    :model-value="spec.overline"
                    density="compact"
                    hide-details
                    :label="row.label"
                    @update:model-value="(value: boolean | null) => emit('set', 'overline', value === true)"
                />

                <v-select
                    v-else-if="row.id === 'capitalization'"
                    :model-value="spec.capitalization"
                    :items="capitalizationChoices"
                    density="compact"
                    variant="outlined"
                    hide-details
                    :label="row.label"
                    @update:model-value="(value: string) => emit('set', 'capitalization', value)"
                />

                <v-checkbox
                    v-else-if="row.id === 'smallCaps'"
                    :model-value="spec.smallCaps"
                    density="compact"
                    hide-details
                    :label="row.label"
                    @update:model-value="(value: boolean | null) => emit('set', 'smallCaps', value === true)"
                />

                <v-select
                    v-else-if="row.id === 'baselineShift'"
                    :model-value="spec.baselineShift"
                    :items="baselineChoices"
                    density="compact"
                    variant="outlined"
                    hide-details
                    :label="row.label"
                    @update:model-value="(value: string) => emit('set', 'baselineShift', value)"
                />

                <v-slider
                    v-else-if="row.id === 'baselineOffset'"
                    :model-value="spec.baselineOffset"
                    :min="-20"
                    :max="20"
                    :step="0.5"
                    thumb-label
                    density="compact"
                    hide-details
                    :aria-label="row.label"
                    @update:model-value="(value: number) => emit('set', 'baselineOffset', value)"
                />

                <ColorField
                    v-else-if="row.id === 'textColor'"
                    :model-value="spec.textColor"
                    :label="row.label"
                    :contrast-background="spec.highlight"
                    @update:model-value="(value: string) => emit('set', 'textColor', value)"
                />

                <ColorField
                    v-else-if="row.id === 'highlight'"
                    :model-value="spec.highlight"
                    :label="row.label"
                    :contrast-foreground="spec.textColor"
                    @update:model-value="(value: string) => emit('set', 'highlight', value)"
                />

                <v-slider
                    v-else-if="row.id === 'outlineWidth'"
                    :model-value="spec.outlineWidth"
                    :min="0"
                    :max="8"
                    :step="0.25"
                    thumb-label
                    density="compact"
                    hide-details
                    :aria-label="row.label"
                    @update:model-value="(value: number) => emit('set', 'outlineWidth', value)"
                />

                <ColorField
                    v-else-if="row.id === 'outlineColor'"
                    :model-value="spec.outlineColor"
                    :label="row.label"
                    @update:model-value="(value: string) => emit('set', 'outlineColor', value)"
                />

                <template v-else-if="row.id === 'shadow'">
                    <v-text-field
                        :model-value="spec.shadow.offsetX"
                        type="number"
                        step="0.5"
                        density="compact"
                        variant="outlined"
                        hide-details
                        :label="t('appearance.type.shadowX', 'Sideways')"
                        @update:model-value="(value: string) => setShadow('offsetX', number(value, spec.shadow.offsetX))"
                    />
                    <v-text-field
                        :model-value="spec.shadow.offsetY"
                        type="number"
                        step="0.5"
                        density="compact"
                        variant="outlined"
                        hide-details
                        :label="t('appearance.type.shadowY', 'Down')"
                        @update:model-value="(value: string) => setShadow('offsetY', number(value, spec.shadow.offsetY))"
                    />
                    <v-text-field
                        :model-value="spec.shadow.blur"
                        type="number"
                        min="0"
                        step="0.5"
                        density="compact"
                        variant="outlined"
                        hide-details
                        :label="t('appearance.type.shadowBlur', 'Blur')"
                        @update:model-value="(value: string) => setShadow('blur', number(value, spec.shadow.blur))"
                    />
                    <ColorField
                        :model-value="spec.shadow.color"
                        :label="t('appearance.type.shadowColor', 'Shadow colour')"
                        @update:model-value="(value: string) => setShadow('color', value)"
                    />
                </template>

                <template v-else-if="row.id === 'glow'">
                    <v-slider
                        :model-value="spec.glow.radius"
                        :min="0"
                        :max="40"
                        :step="1"
                        thumb-label
                        density="compact"
                        hide-details
                        :aria-label="t('appearance.type.glowRadius', 'Glow radius')"
                        @update:model-value="(value: number) => setGlow('radius', value)"
                    />
                    <ColorField
                        :model-value="spec.glow.color"
                        :label="t('appearance.type.glowColor', 'Glow colour')"
                        @update:model-value="(value: string) => setGlow('color', value)"
                    />
                </template>

                <v-slider
                    v-else-if="row.id === 'letterSpacing'"
                    :model-value="spec.letterSpacing"
                    :min="-5"
                    :max="20"
                    :step="0.1"
                    thumb-label
                    density="compact"
                    hide-details
                    :aria-label="row.label"
                    @update:model-value="(value: number) => emit('set', 'letterSpacing', value)"
                />

                <v-slider
                    v-else-if="row.id === 'wordSpacing'"
                    :model-value="spec.wordSpacing"
                    :min="-10"
                    :max="40"
                    :step="0.5"
                    thumb-label
                    density="compact"
                    hide-details
                    :aria-label="row.label"
                    @update:model-value="(value: number) => emit('set', 'wordSpacing', value)"
                />

                <v-slider
                    v-else-if="row.id === 'lineHeight'"
                    :model-value="spec.lineHeight"
                    :min="0.8"
                    :max="4"
                    :step="0.05"
                    thumb-label
                    density="compact"
                    hide-details
                    :aria-label="row.label"
                    @update:model-value="(value: number) => emit('set', 'lineHeight', value)"
                />

                <v-select
                    v-else-if="row.id === 'textDirection'"
                    :model-value="spec.textDirection"
                    :items="directionChoices"
                    density="compact"
                    variant="outlined"
                    hide-details
                    :label="row.label"
                    @update:model-value="(value: string) => emit('set', 'textDirection', value)"
                />

                <v-select
                    v-else-if="row.id === 'textAlign'"
                    :model-value="spec.textAlign"
                    :items="alignChoices"
                    density="compact"
                    variant="outlined"
                    hide-details
                    :label="row.label"
                    @update:model-value="(value: string) => emit('set', 'textAlign', value)"
                />
            </div>

            <p v-for="note in row.notes" :key="note.code" class="mb-type-row__note">
                {{ note.message }}
            </p>
        </div>

        <p class="mb-type-editor__hint">
            {{ t(ASSUMED_SUPPORT_LABEL_KEY, "Where this app cannot ask the engine what it supports, it assumes everything is supported rather than hiding a control that would have worked.") }}
        </p>
    </div>
</template>

<style>
.mb-type-editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.mb-type-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-block: 6px;
    border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.mb-type-row__head {
    display: flex;
    align-items: center;
    gap: 6px;
}

.mb-type-row__label {
    flex: 1 1 auto;
    font-size: 0.8rem;
    font-weight: 500;
}

.mb-type-row__control {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.mb-type-row__control > * {
    flex: 1 1 140px;
    min-inline-size: 0;
}

.mb-type-row__unsupported {
    margin: 0;
    font-size: 0.72rem;
    color: rgb(var(--v-theme-warning));
}

.mb-type-row__note {
    margin: 0;
    font-size: 0.72rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-type-editor__hint {
    margin: 0;
    font-size: 0.72rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-type-editor__fontButton {
    justify-content: flex-start;
    text-transform: none;
}

/*
 * Its own surface, its own bound, its own scrollbar. A font list on a laptop is longer than
 * the window, and an overlay that merely capped its height would delete the families past
 * the cap with nothing on screen to say they exist.
 */
.mb-type-editor__fontPanel {
    inline-size: min(360px, 90vw);
    max-block-size: min(60vh, 480px);
    overflow-y: auto;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    box-shadow: 0 4px 8px 3px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.3);
}

.mb-type-editor__fontList {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
}

.mb-type-editor__fontItem {
    display: flex;
    align-items: baseline;
    gap: 8px;
    inline-size: 100%;
    padding: 6px 8px;
    border-radius: 6px;
    text-align: start;
}

.mb-type-editor__fontItem:hover {
    background: rgba(var(--v-theme-on-surface), 0.06);
}

.mb-type-editor__fontItem:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.mb-type-editor__fontItem--current {
    background: rgba(var(--v-theme-primary), 0.12);
}

.mb-type-editor__fontName {
    flex: 0 0 auto;
    font-size: 0.85rem;
}

.mb-type-editor__fontSample {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.8rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-type-editor__axis {
    display: flex;
    align-items: center;
    gap: 8px;
    inline-size: 100%;
}

.mb-type-editor__axisTag {
    flex: 0 0 auto;
    inline-size: 140px;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
