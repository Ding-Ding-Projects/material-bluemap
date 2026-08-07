<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiChevronDown, mdiChevronUp, mdiClose, mdiPlus } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VChip,
    VExpansionPanel,
    VExpansionPanelText,
    VExpansionPanelTitle,
    VExpansionPanels,
    VTextField,
    VTextarea,
    VTooltip,
} from "vuetify/components";
import { MARKER_SET_FIELDS, type FieldMeta, type PlainValue } from "@worldlens/config";
import ConfigControl from "./ConfigControl.vue";
import { docShownText, isDocLong, provenanceOf } from "./explainField.js";
import { GlossaryTerm } from "../glossary/index.js";

/**
 * The `marker-sets` block of a map config.
 *
 * A marker set's own container fields — `label`, `sorting`, `toggleable` and
 * `default-hidden` — are rendered from `MARKER_SET_FIELDS` in
 * `@worldlens/config`, the same way `ConfigMaskField.vue` renders a mask
 * shape's fields from `MASK_SHAPES`: one `ConfigControl` per entry, plus that
 * entry's own doc-disclosure and default-provenance line. A fifth container
 * property added to that array reaches this editor with no change here. The
 * markers inside a set are not modelled the same way: their shapes belong to the
 * markers contract rather than to the config schema, and half-modelling them
 * here would produce an editor that silently dropped every field it did not know
 * about. They are shown as formatted JSON, editable as text, and written back
 * exactly as given.
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

/** One container field's current value: what the set's own record says, or the field's default. */
function containerFieldValue(value: PlainValue, field: FieldMeta): PlainValue {
    const existing = asRecord(value)[field.path];
    return existing === undefined ? (field.default as PlainValue) : existing;
}

function setContainerField(id: string, field: FieldMeta, next: PlainValue): void {
    updateSet(id, { [field.path]: next });
}

/**
 * Whether one marker set's own explanation of one container field is expanded.
 *
 * Keyed by the set's id and the field's path: every marker set shares the same
 * four fields, so a per-field key with no set id in it would open "Sorting" on
 * every set at once the moment one was opened.
 */
const docOpen = ref<Record<string, boolean>>({});

function docKey(id: string, path: string): string {
    return `${id}:${path}`;
}

function isDocOpen(id: string, path: string): boolean {
    return docOpen.value[docKey(id, path)] ?? false;
}

function toggleDoc(id: string, path: string): void {
    const key = docKey(id, path);
    docOpen.value = { ...docOpen.value, [key]: !isDocOpen(id, path) };
}

/** Provenance for one container field against this marker set's own record. */
function containerProvenance(field: FieldMeta, value: PlainValue) {
    return provenanceOf(field, asRecord(value));
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
        // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n compiles
        // the message itself, so it consumes `{id}` as its own named parameter and a later
        // `replace` finds nothing left to substitute, leaving a refusal that names no set.
        notice.value = t("config.markers.duplicate", { id }, "There is already a marker set called {id}.");
        return;
    }
    notice.value = null;
    newId.value = "";
    // None of the four container properties are written here, on purpose: the person
    // typed an id, not a label, a sorting value, a toggle state or a starting visibility,
    // and writing BlueMap's own defaults into the record as if they had would make the
    // provenance line below claim "Set here" for four things nobody set. `markers` is
    // the one genuine structural requirement - every set needs a markers object, even an
    // empty one - and carries no default of its own to fabricate. Verified against
    // `MarkerSet`'s deserialization constructor in `vendor/BlueMap`: a set with none of
    // the four keys present loads exactly as one that named them all with these values,
    // so nothing here changes what a freshly created set looks like once BlueMap reads it.
    commit({
        ...(props.modelValue ?? {}),
        [id]: { markers: {} },
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
            <GlossaryTerm term="marker" />
        </p>

        <p v-if="sets.length === 0" class="mb-config-markers__empty">
            {{ t("config.markers.empty", "No marker sets in this map config.") }}
        </p>

        <v-expansion-panels v-else variant="accordion" class="mb-config-markers__panels">
            <v-expansion-panel v-for="[id, value] in sets" :key="id">
                <v-expansion-panel-title>
                    <span class="mb-config-markers__title">{{ id }}</span>
                    <span class="mb-config-markers__count">
                        {{ t("config.markers.count", { n: markerCount(value) }, "{n} markers") }}
                    </span>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                    <v-card variant="flat">
                        <v-card-text class="mb-config-markers__body">
                            <template v-for="field in MARKER_SET_FIELDS" :key="field.path">
                                <ConfigControl
                                    :control="field.control"
                                    :model-value="containerFieldValue(value, field)"
                                    :label="field.label"
                                    :disabled="isDisabled"
                                    @update:model-value="(next: PlainValue) => setContainerField(id, field, next)"
                                />
                                <p class="mb-config-markers__doc">{{ docShownText(field.doc, isDocOpen(id, field.path)) }}</p>
                                <v-btn
                                    v-if="isDocLong(field.doc)"
                                    :append-icon="isDocOpen(id, field.path) ? mdiChevronUp : mdiChevronDown"
                                    :aria-expanded="isDocOpen(id, field.path) ? 'true' : 'false'"
                                    variant="text"
                                    size="x-small"
                                    density="comfortable"
                                    @click="toggleDoc(id, field.path)"
                                >
                                    {{
                                        isDocOpen(id, field.path)
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
                                <p class="mb-config-markers__state">
                                    <span v-if="!containerProvenance(field, value).explicit">
                                        {{
                                            t(
                                                "config.explain.inherited",
                                                { value: containerProvenance(field, value).defaultText || t("config.explain.nothing", "nothing") },
                                                "Not set here, so BlueMap uses {value}.",
                                            )
                                        }}
                                    </span>
                                    <span v-else-if="containerProvenance(field, value).usingDefault">
                                        {{ t("config.explain.setToDefault", "Set here, and it matches BlueMap's default.") }}
                                    </span>
                                    <span v-else>
                                        {{
                                            t(
                                                "config.explain.changed",
                                                { value: containerProvenance(field, value).defaultText || t("config.explain.nothing", "nothing") },
                                                "Set here. BlueMap's default is {value}.",
                                            )
                                        }}
                                    </span>
                                </p>
                            </template>

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
    /*
     * `.v-expansion-panel-title` is `display: flex; width: 100%` with no `min-width: 0`
     * of its own (Vuetify's default), so a flex child's min-width defaults to its
     * unwrapped content size. A marker set's own id is arbitrary user text with no
     * length limit and often no spaces to break at (a slug), so without these two
     * properties a long id overflows the panel header horizontally instead of wrapping
     * -- the same class of bug the appearance editor's zero-height tab strip came from.
     */
    min-width: 0;
    overflow-wrap: anywhere;
}

.mb-config-markers__count {
    margin-inline-start: auto;
    margin-inline-end: 12px;
    font-size: 0.75rem;
    flex-shrink: 0;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-markers__body {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.mb-config-markers__doc {
    font-size: 0.75rem;
    line-height: 1.45;
    white-space: pre-line;
    margin-block-start: -6px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-markers__state {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: -6px;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
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
