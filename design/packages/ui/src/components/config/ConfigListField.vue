<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiArrowDown, mdiArrowUp, mdiClose, mdiPlus } from "@mdi/js";
import { VAlert, VBtn, VTooltip } from "vuetify/components";
import type { ListControl, PlainValue } from "@material-bluemap/config";
import ConfigControl from "./ConfigControl.vue";
import { blankValueFor, valueToText } from "./fieldValue.js";

/**
 * An ordered list of same-shaped values: `hidden-game-modes`, a polygon's points,
 * the web app's script and style lists.
 *
 * Order is part of the value for some of these, so the rows can be moved rather
 * than only added and removed. A list marked `unique` in the schema stands in
 * for a Java `LinkedHashSet`, where a duplicate is silently dropped when the file
 * loads; this refuses the duplicate and says why instead of accepting a row that
 * would disappear on the next read.
 */
const props = withDefaults(
    defineProps<{
        control: ListControl;
        modelValue: readonly PlainValue[];
        label: string;
        disabled?: boolean;
    }>(),
    { disabled: false },
);

const emit = defineEmits<{ "update:modelValue": [value: PlainValue[]] }>();

const { t } = useI18n();
const notice = ref<string | null>(null);
/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`,
 * so an optional prop of ours is normalised once here rather than coalesced at
 * every binding in the template.
 */
const isDisabled = computed(() => props.disabled === true);


const items = computed(() => [...props.modelValue]);

function isDuplicate(value: PlainValue, ignoreIndex: number): boolean {
    if (!props.control.unique) return false;
    const encoded = JSON.stringify(value);
    return items.value.some((candidate, index) => index !== ignoreIndex && JSON.stringify(candidate) === encoded);
}

function commit(next: PlainValue[]): void {
    emit("update:modelValue", next);
}

function add(): void {
    notice.value = null;
    commit([...items.value, blankValueFor(props.control.item)]);
}

function remove(index: number): void {
    notice.value = null;
    commit(items.value.filter((_, candidate) => candidate !== index));
}

function move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= items.value.length) return;

    const next = [...items.value];
    const moved = next[index] as PlainValue;
    next[index] = next[target] as PlainValue;
    next[target] = moved;
    commit(next);
}

function update(index: number, value: PlainValue): void {
    if (isDuplicate(value, index)) {
        notice.value = t(
            "config.list.duplicate",
            "BlueMap keeps only one copy of each entry in this list, so a duplicate would disappear the next time the file is read.",
        );
        return;
    }
    notice.value = null;

    const next = [...items.value];
    next[index] = value;
    commit(next);
}
</script>

<template>
    <div class="mb-config-list" role="group" :aria-label="label">
        <p v-if="items.length === 0" class="mb-config-list__empty">
            {{ t("config.list.empty", "Nothing in this list yet.") }}
        </p>

        <ol v-else class="mb-config-list__rows">
            <li v-for="(item, index) in items" :key="index" class="mb-config-list__row">
                <ConfigControl
                    :control="control.item"
                    :model-value="item"
                    :label="`${control.itemLabel} ${index + 1}`"
                    :disabled="isDisabled"
                    @update:model-value="(value: PlainValue) => update(index, value)"
                />
                <!--
                    `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n
                    compiles the message itself and consumes `{item}` as its own named parameter,
                    so a later `replace` finds nothing left to substitute. These are icon buttons
                    whose accessible name is the whole label, so the broken form gives every row
                    the same nameless "Move  up" and a screen reader cannot tell them apart.
                -->
                <div class="mb-config-list__actions">
                    <v-btn
                        :icon="mdiArrowUp"
                        :aria-label="
                            t('config.list.moveUp', { item: `${control.itemLabel} ${index + 1}` }, 'Move {item} up')
                        "
                        :disabled="isDisabled || index === 0"
                        variant="text"
                        size="small"
                        density="comfortable"
                        @click="move(index, -1)"
                    />
                    <v-btn
                        :icon="mdiArrowDown"
                        :aria-label="
                            t('config.list.moveDown', { item: `${control.itemLabel} ${index + 1}` }, 'Move {item} down')
                        "
                        :disabled="isDisabled || index === items.length - 1"
                        variant="text"
                        size="small"
                        density="comfortable"
                        @click="move(index, 1)"
                    />
                    <v-btn
                        :icon="mdiClose"
                        :aria-label="
                            t(
                                'config.list.remove',
                                { item: valueToText(item) || `${control.itemLabel} ${index + 1}` },
                                'Remove {item}',
                            )
                        "
                        :disabled="isDisabled"
                        variant="text"
                        size="small"
                        density="comfortable"
                        color="error"
                        @click="remove(index)"
                    >
                        <v-tooltip activator="parent" location="top" :text="t('config.list.removeHint', 'Remove this entry')" />
                    </v-btn>
                </div>
            </li>
        </ol>

        <v-alert v-if="notice" type="warning" density="compact" variant="tonal" class="mt-2" role="alert">
            {{ notice }}
        </v-alert>

        <v-btn
            :prepend-icon="mdiPlus"
            :disabled="isDisabled"
            variant="tonal"
            size="small"
            density="comfortable"
            class="mt-2"
            @click="add"
        >
            {{ t("config.list.add", { item: control.itemLabel.toLowerCase() }, "Add {item}") }}
        </v-btn>
    </div>
</template>

<style>
.mb-config-list__rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-config-list__row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
}

.mb-config-list__row > *:first-child {
    flex: 1 1 auto;
    min-width: 0;
}

.mb-config-list__actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
}

.mb-config-list__empty {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
