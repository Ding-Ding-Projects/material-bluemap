<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiClose, mdiPlus } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VExpansionPanel,
    VExpansionPanelText,
    VExpansionPanelTitle,
    VExpansionPanels,
    VSwitch,
    VTextField,
    VTextarea,
} from "vuetify/components";
import type { PlainValue } from "@material-bluemap/config";

/**
 * The `marker-sets` block of a map config.
 *
 * A marker set's own container fields are edited as controls. The markers inside
 * it are not: their shapes belong to the markers contract rather than to the
 * config schema, and half-modelling them here would produce an editor that
 * silently dropped every field it did not know about. They are shown as
 * formatted JSON, editable as text, and written back exactly as given.
 *
 * That is a deliberate limit, stated where the user can see it rather than left
 * for them to discover after a save loses something.
 */
const props = withDefaults(
    defineProps<{
        modelValue: Readonly<Record<string, PlainValue>> | null;
        label: string;
        disabled?: boolean;
    }>(),
    { disabled: false },
);

const emit = defineEmits<{ "update:modelValue": [value: Record<string, PlainValue>] }>();

const { t } = useI18n();

const newId = ref("");
const notice = ref<string | null>(null);
const markerErrors = ref<Record<string, string>>({});
const markerDrafts = ref<Record<string, string>>({});
/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`,
 * so an optional prop of ours is normalised once here rather than coalesced at
 * every binding in the template.
 */
const isDisabled = computed(() => props.disabled === true);


const sets = computed(() => Object.entries(props.modelValue ?? {}));

function asRecord(value: PlainValue): Record<string, PlainValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

function commit(next: Record<string, PlainValue>): void {
    emit("update:modelValue", next);
}

function updateSet(id: string, patch: Record<string, PlainValue>): void {
    const current = asRecord((props.modelValue ?? {})[id] ?? {});
    commit({ ...(props.modelValue ?? {}), [id]: { ...current, ...patch } });
}

function removeSet(id: string): void {
    const next: Record<string, PlainValue> = {};
    for (const [key, value] of Object.entries(props.modelValue ?? {})) {
        if (key !== id) next[key] = value;
    }
    commit(next);
}

function addSet(): void {
    const id = newId.value.trim();
    if (id === "") return;
    if (Object.prototype.hasOwnProperty.call(props.modelValue ?? {}, id)) {
        notice.value = t("config.markers.duplicate", "There is already a marker set called {id}.").replace("{id}", id);
        return;
    }
    notice.value = null;
    newId.value = "";
    commit({
        ...(props.modelValue ?? {}),
        [id]: { label: id, toggleable: true, "default-hidden": false, sorting: 0, markers: {} },
    });
}

function markerCount(value: PlainValue): number {
    const markers = asRecord(value)["markers"];
    return typeof markers === "object" && markers !== null && !Array.isArray(markers) ? Object.keys(markers).length : 0;
}

function markersText(id: string, value: PlainValue): string {
    const draft = markerDrafts.value[id];
    if (draft !== undefined) return draft;
    return JSON.stringify(asRecord(value)["markers"] ?? {}, null, 2);
}

/**
 * Parses the raw markers block on every keystroke and reports a syntax error
 * inline, without writing anything until it parses.
 *
 * Writing a half-typed object would replace a working set of markers with
 * whatever was on screen mid-edit, which is exactly the kind of silent loss the
 * round-tripping editor exists to avoid.
 */
function commitMarkers(id: string, raw: string): void {
    markerDrafts.value = { ...markerDrafts.value, [id]: raw };

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw === "" ? "{}" : raw);
    } catch (error) {
        markerErrors.value = { ...markerErrors.value, [id]: error instanceof Error ? error.message : String(error) };
        return;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        markerErrors.value = {
            ...markerErrors.value,
            [id]: t("config.markers.notAnObject", "Markers are an object keyed by marker id, not a list."),
        };
        return;
    }

    const nextErrors = { ...markerErrors.value };
    delete nextErrors[id];
    markerErrors.value = nextErrors;

    updateSet(id, { markers: parsed as Record<string, PlainValue> });
}
</script>

<template>
    <div class="mb-config-markers" role="group" :aria-label="label">
        <p class="mb-config-markers__note">
            {{
                t(
                    "config.markers.scope",
                    "These are the markers written into the map config itself. Their container settings are edited below; the markers inside each set are passed through exactly as written.",
                )
            }}
        </p>

        <p v-if="sets.length === 0" class="mb-config-markers__empty">
            {{ t("config.markers.empty", "No marker sets in this map config.") }}
        </p>

        <v-expansion-panels v-else variant="accordion" class="mb-config-markers__panels">
            <v-expansion-panel v-for="[id, value] in sets" :key="id">
                <v-expansion-panel-title>
                    <span class="mb-config-markers__title">{{ id }}</span>
                    <span class="mb-config-markers__count">
                        {{ t("config.markers.count", "{n} markers").replace("{n}", String(markerCount(value))) }}
                    </span>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                    <v-card variant="flat">
                        <v-card-text class="mb-config-markers__body">
                            <v-text-field
                                :model-value="String(asRecord(value)['label'] ?? '')"
                                :label="t('config.markers.label', 'Label shown in the menu')"
                                :disabled="isDisabled"
                                variant="outlined"
                                density="compact"
                                hide-details="auto"
                                @update:model-value="(next: string) => updateSet(id, { label: next })"
                            />
                            <v-text-field
                                :model-value="String(asRecord(value)['sorting'] ?? 0)"
                                :label="t('config.markers.sorting', 'Sorting')"
                                :disabled="isDisabled"
                                type="number"
                                variant="outlined"
                                density="compact"
                                hide-details="auto"
                                @update:model-value="(next: string) => updateSet(id, { sorting: Number(next) || 0 })"
                            />
                            <v-switch
                                :model-value="asRecord(value)['toggleable'] !== false"
                                :label="t('config.markers.toggleable', 'Visitors can turn this set off')"
                                :disabled="isDisabled"
                                color="primary"
                                density="compact"
                                hide-details="auto"
                                inset
                                @update:model-value="(next: boolean | null) => updateSet(id, { toggleable: next === true })"
                            />
                            <v-switch
                                :model-value="asRecord(value)['default-hidden'] === true"
                                :label="t('config.markers.defaultHidden', 'Hidden until a visitor turns it on')"
                                :disabled="isDisabled"
                                color="primary"
                                density="compact"
                                hide-details="auto"
                                inset
                                @update:model-value="(next: boolean | null) => updateSet(id, { 'default-hidden': next === true })"
                            />

                            <v-textarea
                                :model-value="markersText(id, value)"
                                :label="t('config.markers.raw', 'Markers, as written in the file')"
                                :error-messages="markerErrors[id] ?? null"
                                :disabled="isDisabled"
                                class="mb-config-markers__raw"
                                rows="6"
                                variant="outlined"
                                density="compact"
                                spellcheck="false"
                                hide-details="auto"
                                @update:model-value="(next: string) => commitMarkers(id, next)"
                            />

                            <v-btn
                                :prepend-icon="mdiClose"
                                :disabled="isDisabled"
                                color="error"
                                variant="text"
                                size="small"
                                @click="removeSet(id)"
                            >
                                {{ t("config.markers.removeSet", "Remove this marker set") }}
                            </v-btn>
                        </v-card-text>
                    </v-card>
                </v-expansion-panel-text>
            </v-expansion-panel>
        </v-expansion-panels>

        <v-alert v-if="notice" type="warning" density="compact" variant="tonal" class="mt-2" role="alert">
            {{ notice }}
        </v-alert>

        <div class="mb-config-markers__add">
            <v-text-field
                v-model="newId"
                :label="t('config.markers.newId', 'New marker set id')"
                :disabled="isDisabled"
                variant="outlined"
                density="compact"
                spellcheck="false"
                autocapitalize="off"
                hide-details="auto"
                @keydown.enter.prevent="addSet"
            />
            <v-btn :prepend-icon="mdiPlus" :disabled="isDisabled || newId.trim() === ''" variant="tonal" size="small" @click="addSet">
                {{ t("config.markers.add", "Add") }}
            </v-btn>
        </div>
    </div>
</template>

<style>
.mb-config-markers__panels {
    border-radius: 12px;
    overflow: hidden;
}

.mb-config-markers__title {
    font-weight: 500;
}

.mb-config-markers__count {
    margin-inline-start: auto;
    margin-inline-end: 12px;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-markers__body {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.mb-config-markers__raw textarea {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
}

.mb-config-markers__add {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-block-start: 8px;
}

.mb-config-markers__add .v-text-field {
    flex: 1 1 auto;
    min-width: 0;
}

.mb-config-markers__note,
.mb-config-markers__empty {
    font-size: 0.75rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
