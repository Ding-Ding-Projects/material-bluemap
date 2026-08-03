<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiArrowDown, mdiArrowUp, mdiClose, mdiPlus, mdiVectorDifference } from "@mdi/js";
import { VBtn, VCard, VCardText, VChip, VDivider, VSelect, VSwitch } from "vuetify/components";
import { MASK_SHAPES, MASK_TYPE_OPTIONS, type FieldMeta, type PlainValue } from "@material-bluemap/config";
import ConfigControl from "./ConfigControl.vue";
import ConfigListField from "./ConfigListField.vue";

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
    }>(),
    { disabled: false, depth: 0 },
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

function shapeSummary(row: ShapeRow): string {
    const name = row.shape?.label ?? row.typeKey;
    return row.record["subtract"] === true
        ? t("config.mask.subtracts", "{shape}, subtracted").replace("{shape}", name)
        : name;
}
</script>

<template>
    <div class="mb-config-mask" role="group" :aria-label="label">
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

                                    <p class="mb-config-mask__doc">{{ field.doc }}</p>
                                </template>
                            </template>
                        </template>
                        <p v-else class="mb-config-mask__doc" role="alert">
                            {{
                                t(
                                    "config.mask.unknownShape",
                                    'This file names a shape called "{type}", which this build does not know about. It is left exactly as it is; pick a shape above to replace it.',
                                ).replace("{type}", row.typeKey)
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
</style>
