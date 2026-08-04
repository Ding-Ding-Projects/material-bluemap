<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertOutline, mdiBackupRestore, mdiChevronDown, mdiChevronUp, mdiRefreshAuto, mdiShieldCheckOutline } from "@mdi/js";
import { VAlert, VBtn, VChip, VIcon, VTooltip } from "vuetify/components";
import type { FieldMeta, PlainValue } from "@material-bluemap/config";
import ConfigControl from "./ConfigControl.vue";
import ConfigKeyValueField from "./ConfigKeyValueField.vue";
import ConfigListField from "./ConfigListField.vue";
import ConfigMarkerSetsField from "./ConfigMarkerSetsField.vue";
import ConfigMaskField from "./ConfigMaskField.vue";
import { fieldValue, isExplicit, type EditableConfigFile } from "./configModel.js";
import { isDefaultValue, toControlValue, valueToText } from "./fieldValue.js";

/**
 * One setting, with everything around it that makes it usable without the file
 * open in a text editor beside it.
 *
 * The documentation shown is upstream BlueMap's own comment for the setting,
 * carried verbatim by `@material-bluemap/config`, so the interface explains a
 * setting at least as well as the generated file did. Nothing here is written
 * per setting: the control, the documentation, the default, the advisory range
 * and the re-render warning all come from the schema.
 */
const props = withDefaults(
    defineProps<{
        field: FieldMeta;
        file: EditableConfigFile;
        disabled?: boolean;
        /** Draws attention to this row after the search or palette navigates to it. */
        highlighted?: boolean;
    }>(),
    { disabled: false, highlighted: false },
);

const emit = defineEmits<{
    set: [field: FieldMeta, value: PlainValue];
    clear: [field: FieldMeta];
    /** Raised for `accept-download`, which is answered by the consent record. */
    consent: [];
}>();

const { t } = useI18n();

const docOpen = ref(false);
/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`,
 * so an optional prop of ours is normalised once here rather than coalesced at
 * every binding in the template.
 */
const isDisabled = computed(() => props.disabled === true);


const value = computed(() => fieldValue(props.file, props.field));
const controlValue = computed(() => toControlValue(props.field.control, value.value));
const explicit = computed(() => isExplicit(props.file, props.field));
const usingDefault = computed(() => isDefaultValue(props.field, value.value));

const docLines = computed(() => props.field.doc.split("\n"));
const docIsLong = computed(() => docLines.value.length > 3);
const docShown = computed(() => (docIsLong.value && !docOpen.value ? docLines.value.slice(0, 3).join("\n") : props.field.doc));

const issues = computed(() => props.file.issues.filter((issue) => issue.path === props.field.path));
const errorText = computed(() => issues.value.find((issue) => issue.severity === "error")?.message ?? null);
const warnings = computed(() => issues.value.filter((issue) => issue.severity === "warning"));

/**
 * `accept-download` is Mojang licence acceptance, not an ordinary switch.
 *
 * The app asks once at first launch and remembers the answer forever. This row
 * therefore reports the state and points at the setting that owns it; it does
 * not put a licence in front of somebody who came here to change a render
 * setting, and it does not offer a second place to accept.
 */
const consentGated = computed(() => props.field.consentGated === true);
const accepted = computed(() => value.value === true);

const advisoryText = computed(() => props.field.advisory?.note ?? null);

const templateNote = computed(() => {
    const template = props.field.templateValue;
    if (template === undefined) return null;
    // `t(key, named, fallback)` throughout this file, never `t(key, fallback).replace(...)`:
    // vue-i18n compiles the message itself, so it consumes `{value}` as its own named
    // parameter and a later `replace` finds nothing left to substitute. These rows exist to
    // report what a value actually is, so the broken form states a default and omits it.
    return t(
        "config.field.templateNote",
        { value: valueToText(template.value as PlainValue), note: template.note },
        "A freshly generated file writes {value} here. {note}",
    );
});

function set(next: PlainValue): void {
    emit("set", props.field, next);
}
</script>

<template>
    <div
        class="mb-config-field"
        :class="{ 'mb-config-field--highlight': highlighted, 'mb-config-field--changed': explicit }"
        :data-field-path="field.path"
    >
        <div class="mb-config-field__badges">
            <v-chip v-if="field.invalidatesTiles" size="x-small" variant="tonal" color="warning" :prepend-icon="mdiRefreshAuto">
                {{ t("config.field.reRender", "Re-render") }}
                <v-tooltip
                    activator="parent"
                    location="top"
                    :text="
                        field.invalidationNote ??
                        t(
                            'config.field.reRenderHint',
                            'Changing this makes tiles that are already rendered wrong, so they have to be rendered again.',
                        )
                    "
                />
            </v-chip>
            <v-chip v-if="field.advanced" size="x-small" variant="outlined">
                {{ t("config.field.advanced", "Advanced") }}
            </v-chip>
            <v-chip v-if="field.hidden" size="x-small" variant="outlined">
                {{ t("config.field.undocumented", "Not in the generated file") }}
                <v-tooltip
                    activator="parent"
                    location="top"
                    :text="
                        t(
                            'config.field.undocumentedHint',
                            'BlueMap reads this setting but never writes it into a generated config, so most people have never seen it.',
                        )
                    "
                />
            </v-chip>
            <v-chip v-if="field.secret" size="x-small" variant="outlined" color="error">
                {{ t("config.field.secret", "Credential") }}
            </v-chip>
            <span class="mb-config-field__path">{{ field.path }}</span>
        </div>

        <!-- consent-gated: reported, never re-asked -->
        <div v-if="consentGated" class="mb-config-field__consent">
            <v-icon :icon="accepted ? mdiShieldCheckOutline : mdiAlertOutline" :color="accepted ? 'success' : 'warning'" aria-hidden="true" />
            <div>
                <p class="mb-config-field__consent-state">
                    <strong>{{ field.label }}:</strong>
                    <template v-if="accepted">
                        {{ t("config.field.consentAccepted", "accepted, so rendering can download the files it needs.") }}
                    </template>
                    <template v-else>
                        {{
                            t(
                                "config.field.consentMissing",
                                "not accepted yet, so a render stops before it starts. It is answered once, in the app's own settings.",
                            )
                        }}
                    </template>
                </p>
                <v-btn variant="tonal" size="small" density="comfortable" @click="emit('consent')">
                    {{ t("config.field.openConsent", "Open the download setting") }}
                </v-btn>
            </div>
        </div>

        <template v-else>
            <ConfigMaskField
                v-if="field.control.kind === 'mask-list'"
                :model-value="Array.isArray(value) ? value : []"
                :label="field.label"
                :disabled="isDisabled"
                @update:model-value="set"
            />
            <ConfigMarkerSetsField
                v-else-if="field.control.kind === 'marker-sets'"
                :model-value="typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null"
                :label="field.label"
                :disabled="isDisabled"
                @update:model-value="set"
            />
            <ConfigListField
                v-else-if="field.control.kind === 'list'"
                :control="field.control"
                :model-value="Array.isArray(controlValue) ? controlValue : []"
                :label="field.label"
                :disabled="isDisabled"
                @update:model-value="set"
            />
            <ConfigKeyValueField
                v-else-if="field.control.kind === 'key-value'"
                :control="field.control"
                :model-value="
                    typeof controlValue === 'object' && controlValue !== null && !Array.isArray(controlValue) ? controlValue : {}
                "
                :label="field.label"
                :disabled="isDisabled"
                @update:model-value="set"
            />
            <!--
              `reset-value` is what the control's own clear affordance should mean
              here. The shared colour field carries one, and in the appearance editor
              an empty colour means "inherit"; a BlueMap config file has no spelling
              for that, so the honest reading is BlueMap's own documented default.
            -->
            <ConfigControl
                v-else
                :control="field.control"
                :model-value="controlValue"
                :label="field.label"
                :disabled="isDisabled"
                :error="errorText"
                :reset-value="(field.default as PlainValue)"
                @update:model-value="set"
            />
        </template>

        <p class="mb-config-field__doc">{{ docShown }}</p>
        <v-btn
            v-if="docIsLong"
            :append-icon="docOpen ? mdiChevronUp : mdiChevronDown"
            :aria-expanded="docOpen ? 'true' : 'false'"
            variant="text"
            size="x-small"
            density="comfortable"
            @click="docOpen = !docOpen"
        >
            {{ docOpen ? t("config.field.less", "Show less") : t("config.field.more", "Show the rest of the explanation") }}
        </v-btn>

        <p v-if="templateNote" class="mb-config-field__doc mb-config-field__doc--faint">{{ templateNote }}</p>

        <v-alert v-for="warning in warnings" :key="warning.message" type="warning" density="compact" variant="tonal" class="mt-2">
            {{ warning.message }}
        </v-alert>
        <v-alert v-if="advisoryText && warnings.length === 0" type="info" density="compact" variant="tonal" class="mt-2">
            {{ advisoryText }}
        </v-alert>

        <div class="mb-config-field__state">
            <span v-if="!explicit">
                {{
                    t(
                        "config.field.inherited",
                        { value: valueToText(field.default as PlainValue) || t("config.field.nothing", "nothing") },
                        "Not set in this file, so BlueMap uses {value}.",
                    )
                }}
            </span>
            <span v-else-if="usingDefault">
                {{ t("config.field.setToDefault", "Written in the file, and the same as BlueMap's default.") }}
            </span>
            <span v-else>
                {{
                    t(
                        "config.field.changed",
                        { value: valueToText(field.default as PlainValue) || t("config.field.nothing", "nothing") },
                        "Set in this file. BlueMap's default is {value}.",
                    )
                }}
            </span>

            <v-btn
                v-if="explicit && !consentGated"
                :prepend-icon="mdiBackupRestore"
                :disabled="isDisabled"
                variant="text"
                size="x-small"
                density="comfortable"
                @click="emit('clear', field)"
            >
                {{ t("config.field.reset", "Remove this line") }}
                <v-tooltip
                    activator="parent"
                    location="top"
                    :text="
                        t(
                            'config.field.resetHint',
                            'Deletes the setting from the file so BlueMap falls back to its own default. The comment explaining it stays.',
                        )
                    "
                />
            </v-btn>
        </div>
    </div>
</template>

<style>
.mb-config-field {
    padding: 12px 0;
    border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    scroll-margin-block-start: 96px;
}

.mb-config-field:last-child {
    border-block-end: none;
}

.mb-config-field--highlight {
    background: rgba(var(--v-theme-primary), 0.08);
    border-radius: 12px;
    padding-inline: 8px;
}

.mb-config-field__badges {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-block-end: 6px;
}

.mb-config-field__path {
    margin-inline-start: auto;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}

.mb-config-field__doc {
    margin-block-start: 6px;
    font-size: 0.75rem;
    line-height: 1.45;
    white-space: pre-line;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-field__doc--faint {
    font-style: italic;
}

.mb-config-field__state {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 6px;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}

.mb-config-field__consent {
    display: flex;
    align-items: flex-start;
    gap: 10px;
}

.mb-config-field__consent-state {
    font-size: 0.8125rem;
    line-height: 1.45;
    margin-block-end: 6px;
}

@media (prefers-reduced-motion: reduce) {
    .mb-config-field,
    .mb-config-field * {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>
