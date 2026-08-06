<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiArrowDown, mdiArrowUp, mdiChevronDown, mdiChevronUp, mdiClose, mdiPencilRuler, mdiPlus, mdiVectorDifference } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VChip, VDivider, VSelect, VSwitch, VTooltip } from "vuetify/components";
import { MASK_SHAPES, MASK_TYPE_OPTIONS, type FieldMeta, type PlainValue } from "@material-bluemap/config";
import ConfigControl from "./ConfigControl.vue";
import ConfigListField from "./ConfigListField.vue";
import { docShownText, isDocLong, provenanceOf } from "./explainField.js";
import MaskDrawingCanvas from "./MaskDrawingCanvas.vue";
import { UNKNOWN_WORLD, type ShapeKind, type WorldOrientation } from "./maskCanvas.js";
import { estimateRenderCost } from "./maskGeometry.js";
import { normalizeMaskList } from "./maskRecordNormalize.js";

/** The four shapes the drawing canvas can actually draw. A blur has no footprint of its own. */
const DRAWABLE_KINDS: readonly ShapeKind[] = ["box", "circle", "ellipse", "polygon"];

/**
 * The render mask: an ordered list of shapes, each either adding to or
 * subtracting from the area BlueMap renders.
 *
 * Order is the whole semantics here, so the rows can be moved. A blur shape
 * holds a nested list of shapes, which is why this component renders itself
 * recursively; a blur inside a blur is unusual but legal, and an editor that
 * refused it would refuse a file BlueMap loads.
 *
 * The shape list and every shape's fields come from `MASK_SHAPES` in
 * `@material-bluemap/config`, so a shape added to BlueMap's registry and to that
 * table appears here with its controls and its documentation already attached.
 */
const props = withDefaults(
    defineProps<{
        modelValue: readonly PlainValue[];
        label: string;
        disabled?: boolean;
        /** Nesting depth, so a blur's own list can be indented and named. */
        depth?: number;
        /**
         * What is honestly known about the world this mask belongs to, for the drawing
         * canvas's presets and orientation banner. Optional and defaults to
         * {@link UNKNOWN_WORLD}: a caller that has not wired up region-file measurement or
         * spawn reading yet still gets a fully working canvas, just one that says plainly it
         * does not know the world's shape, rather than one that fails to render at all.
         */
        world?: WorldOrientation;
    }>(),
    { disabled: false, depth: 0, world: () => UNKNOWN_WORLD },
);

const emit = defineEmits<{ "update:modelValue": [value: PlainValue[]] }>();

const { t } = useI18n();
/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`,
 * so an optional prop of ours is normalised once here rather than coalesced at
 * every binding in the template.
 */
const isDisabled = computed(() => props.disabled === true);
const depthValue = computed(() => props.depth ?? 0);
const worldOrientation = computed<WorldOrientation>(() => props.world);

/**
 * The whole render-mask's honest cost, shown only at the top level (never inside a blur's
 * own nested list, which is a modifier over its parent's shapes rather than a mask of its
 * own). `maskGeometry.ts`'s `estimateRenderCost` already knows the four cases that matter:
 * no shapes at all (the whole world, and that is correct), exactly one additive shape (the
 * real number), more than one or any subtraction (an explicit upper bound, since the true
 * overlap is not worth computing here), and a shape left unbounded on some axis (no number
 * at all rather than an invented one).
 */
const wholeMaskCost = computed(() => (depthValue.value === 0 ? estimateRenderCost(normalizeMaskList(props.modelValue)) : null));


interface ShapeRow {
    readonly index: number;
    readonly record: Record<string, PlainValue>;
    readonly typeKey: string;
    readonly shape: (typeof MASK_SHAPES)[number] | undefined;
}

function asRecord(value: PlainValue): Record<string, PlainValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

/** Normalises a bare `circle` to `bluemap:circle`, exactly as `Key.parse` does. */
function formatKey(value: string): string {
    return value.includes(":") ? value : `bluemap:${value}`;
}

const rows = computed<ShapeRow[]>(() =>
    props.modelValue.map((item, index) => {
        const record = asRecord(item);
        const rawType = typeof record["type"] === "string" ? record["type"] : "box";
        const typeKey = formatKey(rawType);
        return { index, record, typeKey, shape: MASK_SHAPES.find((candidate) => candidate.formattedKey === typeKey) };
    }),
);

const typeItems = computed(() =>
    MASK_TYPE_OPTIONS.map((option) => ({
        value: formatKey(String(option.value)),
        title: option.label,
        subtitle: option.description ?? "",
    })),
);

function commit(next: PlainValue[]): void {
    emit("update:modelValue", next);
}

function replaceAt(index: number, record: Record<string, PlainValue>): void {
    const next = [...props.modelValue];
    next[index] = record;
    commit(next);
}

function addShape(): void {
    commit([...props.modelValue, { type: "bluemap:box" }]);
}

function removeShape(index: number): void {
    commit(props.modelValue.filter((_, candidate) => candidate !== index));
}

function move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= props.modelValue.length) return;

    const next = [...props.modelValue];
    const moved = next[index] as PlainValue;
    next[index] = next[target] as PlainValue;
    next[target] = moved;
    commit(next);
}

/**
 * Changes a shape's type, keeping only the keys the new shape recognises.
 *
 * Carrying `radius` over to a box would leave a key BlueMap ignores in the file,
 * which the validator would then report as an unknown setting. Dropping it is
 * the honest edit; `subtract` is kept because every shape has it and it is the
 * one thing somebody switching shape almost certainly meant to keep.
 */
function setType(index: number, typeKey: string): void {
    const row = rows.value[index];
    if (row === undefined) return;

    const shape = MASK_SHAPES.find((candidate) => candidate.formattedKey === typeKey);
    const kept: Record<string, PlainValue> = { type: typeKey };
    if (row.record["subtract"] === true) kept["subtract"] = true;

    if (shape !== undefined) {
        for (const field of shape.fields) {
            if (field.path === "subtract") continue;
            const existing = row.record[field.path];
            if (existing !== undefined) kept[field.path] = existing;
        }
    }
    replaceAt(index, kept);
}

function setSubtract(index: number, value: boolean): void {
    const row = rows.value[index];
    if (row === undefined) return;
    replaceAt(index, { ...row.record, subtract: value });
}

function fieldValueOf(row: ShapeRow, field: FieldMeta): PlainValue {
    const existing = row.record[field.path];
    return existing === undefined ? (field.default as PlainValue) : existing;
}

function setField(index: number, field: FieldMeta, value: PlainValue): void {
    const row = rows.value[index];
    if (row === undefined) return;
    replaceAt(index, { ...row.record, [field.path]: value });
}

function nestedMasks(row: ShapeRow): PlainValue[] {
    const value = row.record["masks"];
    return Array.isArray(value) ? value : [];
}

/**
 * Whether one row's own field explanation is expanded.
 *
 * Keyed by the row's index and the field's path rather than by the field alone:
 * every row of the same shape shares the same fields, so a per-field key with no
 * row in it would open "Minimum X" on every box at once the moment one was
 * opened.
 */
const docOpen = ref<Record<string, boolean>>({});

function docKey(rowIndex: number, path: string): string {
    return `${rowIndex}:${path}`;
}

function isDocOpen(rowIndex: number, path: string): boolean {
    return docOpen.value[docKey(rowIndex, path)] ?? false;
}

function toggleDoc(rowIndex: number, path: string): void {
    const key = docKey(rowIndex, path);
    docOpen.value = { ...docOpen.value, [key]: !isDocOpen(rowIndex, path) };
}

/**
 * Whether a row's drawing canvas is open. Same per-row-index keying as `docOpen` above, and
 * the same reason: every box row shares one key space, so opening one row's canvas must
 * never also open every other box row's.
 */
const drawOpen = ref<Record<number, boolean>>({});

function isDrawOpen(rowIndex: number): boolean {
    return drawOpen.value[rowIndex] ?? false;
}

function toggleDraw(rowIndex: number): void {
    drawOpen.value = { ...drawOpen.value, [rowIndex]: !isDrawOpen(rowIndex) };
}

/** The shape kind a row can be drawn as, or `null` for a blur, which has no footprint of its own. */
function drawableKind(row: ShapeRow): ShapeKind | null {
    const bare = row.typeKey.replace(/^bluemap:/, "");
    return (DRAWABLE_KINDS as readonly string[]).includes(bare) ? (bare as ShapeKind) : null;
}

/** Provenance for one field against the shape's own record, not a whole config file. */
function maskProvenance(row: ShapeRow, field: FieldMeta) {
    return provenanceOf(field, row.record);
}

function shapeSummary(row: ShapeRow): string {
    const name = row.shape?.label ?? row.typeKey;
    // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n compiles the
    // message itself, so it consumes `{shape}` as its own named parameter and a later
    // `replace` finds nothing left to substitute — the row would summarise as ", subtracted".
    return row.record["subtract"] === true ? t("config.mask.subtracts", { shape: name }, "{shape}, subtracted") : name;
}
</script>

<template>
    <div class="mb-config-mask" role="group" :aria-label="label">
        <!--
          The whole list's own honest cost, once -- never repeated per row, and never shown
          for a blur's nested list, which describes a softening of its parent rather than an
          area of its own.
        -->
        <v-alert
            v-if="wholeMaskCost !== null"
            type="info"
            density="compact"
            variant="tonal"
            class="mb-config-mask__cost"
        >
            <template v-if="wholeMaskCost.basis === 'whole-world'">
                {{ t("mask.cost.wholeWorld", "No mask, so the whole world renders.") }}
            </template>
            <template v-else-if="wholeMaskCost.basis === 'unbounded'">
                {{ t("mask.cost.unbounded", "At least one shape has no limit on some axis, so no area number can be given.") }}
            </template>
            <template v-else-if="wholeMaskCost.basis === 'exact'">
                {{ t("mask.cost.label", "Selected area") }}:
                {{
                    t(
                        "mask.cost.exact",
                        {
                            blocks: (wholeMaskCost.areaBlocks ?? 0).toLocaleString(),
                            chunks: (wholeMaskCost.areaChunks ?? 0).toLocaleString(),
                            regions: (wholeMaskCost.areaRegions ?? 0).toLocaleString(),
                        },
                        "{blocks} blocks (about {chunks} chunks, about {regions} regions).",
                    )
                }}
            </template>
            <template v-else>
                {{ t("mask.cost.label", "Selected area") }}:
                {{
                    t(
                        "mask.cost.upperBound",
                        {
                            blocks: (wholeMaskCost.areaBlocks ?? 0).toLocaleString(),
                            chunks: (wholeMaskCost.areaChunks ?? 0).toLocaleString(),
                            regions: (wholeMaskCost.areaRegions ?? 0).toLocaleString(),
                        },
                        "Up to {blocks} blocks (up to about {chunks} chunks, up to about {regions} regions). The real area may be smaller once shapes overlap or subtract.",
                    )
                }}
            </template>
            <span v-if="wholeMaskCost.extent !== null" class="mb-config-mask__extentLine">
                {{ t("mask.cost.extentLabel", "Extent") }}:
                X {{ wholeMaskCost.extent.minX }}..{{ wholeMaskCost.extent.maxX }},
                Z {{ wholeMaskCost.extent.minZ }}..{{ wholeMaskCost.extent.maxZ }}
                ({{ t("mask.cost.units.blocks", "blocks") }})
            </span>
        </v-alert>

        <p v-if="rows.length === 0" class="mb-config-mask__empty">
            {{
                t(
                    "config.mask.empty",
                    "No mask, so the whole world is rendered. Add a shape to limit it.",
                )
            }}
        </p>

        <ol v-else class="mb-config-mask__rows">
            <li v-for="row in rows" :key="row.index">
                <v-card variant="tonal" class="mb-config-mask__card">
                    <v-card-text>
                        <div class="mb-config-mask__head">
                            <v-chip size="small" variant="flat" :prepend-icon="mdiVectorDifference">
                                {{ depthValue > 0 ? `${depthValue}.${row.index + 1}` : String(row.index + 1) }}
                            </v-chip>
                            <span class="mb-config-mask__summary">{{ shapeSummary(row) }}</span>
                            <div class="mb-config-mask__actions">
                                <v-btn
                                    v-if="drawableKind(row) !== null"
                                    :prepend-icon="mdiPencilRuler"
                                    :aria-expanded="isDrawOpen(row.index) ? 'true' : 'false'"
                                    :disabled="isDisabled"
                                    variant="text"
                                    size="small"
                                    density="comfortable"
                                    @click="toggleDraw(row.index)"
                                >
                                    {{ isDrawOpen(row.index) ? t("config.mask.hideDraw", "Hide drawing") : t("config.mask.draw", "Draw…") }}
                                </v-btn>
                                <v-btn
                                    :icon="mdiArrowUp"
                                    :aria-label="t('config.mask.moveUp', 'Move this shape earlier')"
                                    :disabled="isDisabled || row.index === 0"
                                    variant="text"
                                    size="small"
                                    density="comfortable"
                                    @click="move(row.index, -1)"
                                />
                                <v-btn
                                    :icon="mdiArrowDown"
                                    :aria-label="t('config.mask.moveDown', 'Move this shape later')"
                                    :disabled="isDisabled || row.index === rows.length - 1"
                                    variant="text"
                                    size="small"
                                    density="comfortable"
                                    @click="move(row.index, 1)"
                                />
                                <v-btn
                                    :icon="mdiClose"
                                    :aria-label="t('config.mask.remove', 'Remove this shape')"
                                    :disabled="isDisabled"
                                    variant="text"
                                    size="small"
                                    density="comfortable"
                                    color="error"
                                    @click="removeShape(row.index)"
                                />
                            </div>
                        </div>

                        <v-select
                            :model-value="row.typeKey"
                            :items="typeItems"
                            :label="t('config.mask.shape', 'Shape')"
                            :disabled="isDisabled"
                            item-title="title"
                            item-value="value"
                            variant="outlined"
                            density="compact"
                            hide-details="auto"
                            class="mb-2"
                            @update:model-value="(value: string) => setType(row.index, value)"
                        />

                        <p v-if="row.shape" class="mb-config-mask__doc">{{ row.shape.doc }}</p>

                        <MaskDrawingCanvas
                            v-if="isDrawOpen(row.index) && drawableKind(row) !== null"
                            :model-value="row.record"
                            :shape-kind="drawableKind(row)!"
                            :label="t('config.mask.drawLabel', { index: row.index + 1 }, 'Drawing surface for shape {index}')"
                            :world="worldOrientation"
                            :disabled="isDisabled"
                            class="mb-config-mask__canvas"
                            @update:model-value="(value) => replaceAt(row.index, value)"
                        />

                        <v-switch
                            :model-value="row.record['subtract'] === true"
                            :label="t('config.mask.subtract', 'Subtract instead of add')"
                            :disabled="isDisabled"
                            color="primary"
                            density="compact"
                            hide-details="auto"
                            inset
                            @update:model-value="(value: boolean | null) => setSubtract(row.index, value === true)"
                        />

                        <template v-if="row.shape">
                            <template v-for="field in row.shape.fields" :key="field.path">
                                <template v-if="field.path !== 'subtract'">
                                    <v-divider class="my-2" />

                                    <ConfigMaskField
                                        v-if="field.control.kind === 'mask-list'"
                                        :model-value="nestedMasks(row)"
                                        :label="field.label"
                                        :disabled="isDisabled"
                                        :depth="depthValue + 1"
                                        :world="worldOrientation"
                                        @update:model-value="(value: PlainValue[]) => setField(row.index, field, value)"
                                    />
                                    <ConfigListField
                                        v-else-if="field.control.kind === 'list'"
                                        :control="field.control"
                                        :model-value="Array.isArray(fieldValueOf(row, field)) ? (fieldValueOf(row, field) as PlainValue[]) : []"
                                        :label="field.label"
                                        :disabled="isDisabled"
                                        @update:model-value="(value: PlainValue[]) => setField(row.index, field, value)"
                                    />
                                    <ConfigControl
                                        v-else
                                        :control="field.control"
                                        :model-value="fieldValueOf(row, field)"
                                        :label="field.label"
                                        :disabled="isDisabled"
                                        @update:model-value="(value: PlainValue) => setField(row.index, field, value)"
                                    />
                                </template>

                                <!--
                                  The explanation and provenance line apply to every field of
                                  the shape, `subtract` included: its own switch is above, but
                                  it gets the same doc and the same "did this file set it"
                                  answer as every other setting here.
                                -->
                                <p class="mb-config-mask__doc">{{ docShownText(field.doc, isDocOpen(row.index, field.path)) }}</p>
                                <v-btn
                                    v-if="isDocLong(field.doc)"
                                    :append-icon="isDocOpen(row.index, field.path) ? mdiChevronUp : mdiChevronDown"
                                    :aria-expanded="isDocOpen(row.index, field.path) ? 'true' : 'false'"
                                    variant="text"
                                    size="x-small"
                                    density="comfortable"
                                    @click="toggleDoc(row.index, field.path)"
                                >
                                    {{
                                        isDocOpen(row.index, field.path)
                                            ? t("config.explain.less", "Show less")
                                            : t("config.explain.more", "Show the rest of the explanation")
                                    }}
                                </v-btn>
                                <v-chip v-if="field.docSource === 'authored'" size="x-small" variant="outlined">
                                    {{ t("config.explain.authored", "Explained for this app") }}
                                    <v-tooltip
                                        activator="parent"
                                        location="top"
                                        :text="
                                            t(
                                                'config.explain.authoredHint',
                                                'BlueMap has no comment for this one in any generated file, so this explanation is written from the Java class it configures rather than copied from the file.',
                                            )
                                        "
                                    />
                                </v-chip>
                                <p class="mb-config-mask__state">
                                    <span v-if="!maskProvenance(row, field).explicit">
                                        {{
                                            t(
                                                "config.explain.inherited",
                                                { value: maskProvenance(row, field).defaultText || t("config.explain.nothing", "nothing") },
                                                "Not set here, so BlueMap uses {value}.",
                                            )
                                        }}
                                    </span>
                                    <span v-else-if="maskProvenance(row, field).usingDefault">
                                        {{ t("config.explain.setToDefault", "Set here, and it matches BlueMap's default.") }}
                                    </span>
                                    <span v-else>
                                        {{
                                            t(
                                                "config.explain.changed",
                                                { value: maskProvenance(row, field).defaultText || t("config.explain.nothing", "nothing") },
                                                "Set here. BlueMap's default is {value}.",
                                            )
                                        }}
                                    </span>
                                </p>
                            </template>
                        </template>
                        <p v-else class="mb-config-mask__doc" role="alert">
                            {{
                                t(
                                    "config.mask.unknownShape",
                                    { type: row.typeKey },
                                    'This file names a shape called "{type}", which this build does not know about. It is left exactly as it is; pick a shape above to replace it.',
                                )
                            }}
                        </p>
                    </v-card-text>
                </v-card>
            </li>
        </ol>

        <v-btn :prepend-icon="mdiPlus" :disabled="isDisabled" variant="tonal" size="small" density="comfortable" class="mt-2" @click="addShape">
            {{ t("config.mask.add", "Add a shape") }}
        </v-btn>

        <p class="mb-config-mask__note">
            {{
                t(
                    "config.mask.orderNote",
                    "Shapes combine from top to bottom. Changing the mask does not force a full re-render: BlueMap updates the map and deletes tiles that fall outside the new limits.",
                )
            }}
        </p>
    </div>
</template>

<style>
.mb-config-mask__cost {
    margin-block-end: 8px;
}

.mb-config-mask__extentLine {
    display: block;
    font-size: 0.75rem;
    margin-block-start: 4px;
    opacity: 0.85;
}

.mb-config-mask__canvas {
    display: block;
    margin-block: 8px;
}

.mb-config-mask__rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-config-mask__card {
    border-radius: 12px;
}

.mb-config-mask__head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-end: 8px;
}

.mb-config-mask__summary {
    font-weight: 500;
    font-size: 0.875rem;
}

.mb-config-mask__actions {
    margin-inline-start: auto;
    display: flex;
    align-items: center;
}

.mb-config-mask__doc,
.mb-config-mask__empty,
.mb-config-mask__note {
    font-size: 0.75rem;
    line-height: 1.45;
    white-space: pre-line;
    margin-block: 4px 0;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-mask__state {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block: 4px 0;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}
</style>
