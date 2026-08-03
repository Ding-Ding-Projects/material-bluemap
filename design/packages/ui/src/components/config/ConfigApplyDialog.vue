<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertOutline, mdiContentSaveOutline, mdiFileDocumentOutline, mdiFilePlusOutline, mdiTrashCanOutline } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VChip,
    VDialog,
    VDivider,
    VIcon,
    VList,
    VListItem,
    VProgressLinear,
    VSpacer,
} from "vuetify/components";
import { valueToText } from "./fieldValue.js";
import type { WorkspaceIssue, WorkspacePlan } from "./configWorkspace.js";

/**
 * The save gate: everything that is about to happen, before it happens.
 *
 * This is a decision the user has to make, so it is a blocking dialog rather
 * than a notification. What it must never do is understate the consequence: a
 * setting flagged `invalidatesTiles` in the schema means the tiles already on
 * disk become wrong, and the maps that have to be rendered again are named here
 * by id rather than described as "some maps".
 *
 * Errors found across files block the save outright. Warnings do not, because
 * BlueMap itself would load the folder; they are shown and the user decides.
 */
const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        plan: WorkspacePlan;
        issues: readonly WorkspaceIssue[];
        folder: string | null;
        /** True while the host is writing, which disables the button and shows progress. */
        saving?: boolean;
        /** Set when the last attempt failed, reported verbatim. */
        failure?: string | null;
    }>(),
    { saving: false, failure: null },
);

const emit = defineEmits<{ "update:modelValue": [value: boolean]; confirm: [] }>();

const { t } = useI18n();

const open = computed<boolean>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});


/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`,
 * so an optional prop of ours is normalised once here rather than coalesced at
 * every binding in the template.
 */
const isSaving = computed(() => props.saving === true);

const errors = computed(() => props.issues.filter((issue) => issue.severity === "error"));
const warnings = computed(() => props.issues.filter((issue) => issue.severity === "warning"));

const blocked = computed(() => errors.value.length > 0);

const changedPaths = computed(() => props.plan.writes.map((file) => file.path));
const createdPaths = computed(() => new Set(props.plan.created));

const reRenderCount = computed(() => props.plan.affectedMapIds.length);
</script>

<template>
    <v-dialog v-model="open" max-width="620" scrollable>
        <v-card>
            <v-card-title class="mb-config-apply__title">
                <v-icon :icon="mdiContentSaveOutline" size="22" aria-hidden="true" />
                {{ t("config.apply.title", "Save the config folder") }}
            </v-card-title>

            <v-divider />

            <v-card-text>
                <p v-if="folder" class="mb-config-apply__folder">{{ folder }}</p>

                <v-alert v-if="plan.empty" type="info" density="compact" variant="tonal">
                    {{ t("config.apply.nothing", "Nothing has changed, so nothing would be written.") }}
                </v-alert>

                <template v-else>
                    <h3 class="mb-config-apply__heading">
                        {{ t("config.apply.files", "Files") }}
                        <v-chip size="x-small" variant="outlined">
                            {{
                                t("config.apply.fileCount", "{writes} written, {deletes} deleted")
                                    .replace("{writes}", String(plan.writes.length))
                                    .replace("{deletes}", String(plan.deletes.length))
                            }}
                        </v-chip>
                    </h3>

                    <v-list density="compact" class="mb-config-apply__list">
                        <v-list-item
                            v-for="path in changedPaths"
                            :key="path"
                            :prepend-icon="createdPaths.has(path) ? mdiFilePlusOutline : mdiFileDocumentOutline"
                            :title="path"
                            :subtitle="
                                createdPaths.has(path)
                                    ? t('config.apply.newFile', 'New file')
                                    : t('config.apply.updated', 'Updated, keeping its comments')
                            "
                        />
                        <v-list-item
                            v-for="path in plan.deletes"
                            :key="path"
                            :prepend-icon="mdiTrashCanOutline"
                            :title="path"
                            :subtitle="t('config.apply.willDelete', 'Deleted from the folder')"
                        />
                    </v-list>

                    <template v-if="plan.entryChanges.length > 0">
                        <h3 class="mb-config-apply__heading">{{ t("config.apply.changes", "What changes") }}</h3>
                        <ul class="mb-config-apply__changes">
                            <li v-for="group in plan.entryChanges" :key="group.entry.key">
                                <strong>{{ group.entry.file.path }}</strong>
                                <ul>
                                    <li v-for="change in group.changes" :key="change.field.path">
                                        {{ change.field.label }}:
                                        <code>{{ valueToText(change.from) || "not set" }}</code>
                                        →
                                        <code>{{ valueToText(change.to) || "not set" }}</code>
                                        <v-chip v-if="change.invalidatesTiles" size="x-small" color="warning" variant="tonal" class="ml-1">
                                            {{ t("config.apply.reRender", "re-render") }}
                                        </v-chip>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </template>

                    <v-alert v-if="reRenderCount > 0" type="warning" density="compact" variant="tonal" class="mt-3">
                        <template #prepend><v-icon :icon="mdiAlertOutline" /></template>
                        <p>
                            <strong>{{ t("config.apply.reRenderTitle", "Tiles that are already rendered become wrong.") }}</strong>
                        </p>
                        <p>
                            {{
                                t(
                                    "config.apply.reRenderBody",
                                    "These maps have to be rendered again before what you see matches what you saved: {maps}. Saving does not start that render; it only changes the config.",
                                ).replace("{maps}", plan.affectedMapIds.join(", "))
                            }}
                        </p>
                        <ul class="mb-config-apply__reasons">
                            <li v-for="group in plan.tileInvalidating" :key="group.entry.key">
                                <template v-for="change in group.changes" :key="change.field.path">
                                    <template v-if="change.invalidatesTiles">
                                        <strong>{{ change.field.label }}</strong>
                                        {{ change.invalidationNote ?? t("config.apply.reRenderGeneric", "changes how tiles are produced.") }}
                                    </template>
                                </template>
                            </li>
                        </ul>
                    </v-alert>
                </template>

                <v-alert v-for="issue in errors" :key="issue.message" type="error" density="compact" variant="tonal" class="mt-2" role="alert">
                    {{ issue.message }}
                </v-alert>

                <v-alert v-for="issue in warnings" :key="issue.message" type="warning" density="compact" variant="tonal" class="mt-2">
                    {{ issue.message }}
                </v-alert>

                <v-alert v-if="failure" type="error" density="compact" variant="tonal" class="mt-2" role="alert">
                    {{ failure }}
                </v-alert>

                <v-progress-linear v-if="isSaving" indeterminate color="primary" class="mt-3" />
            </v-card-text>

            <v-divider />

            <v-card-actions>
                <v-btn variant="text" :disabled="isSaving" @click="open = false">{{ t("config.apply.cancel", "Cancel") }}</v-btn>
                <v-spacer />
                <span v-if="blocked" class="mb-config-apply__blocked">
                    {{ t("config.apply.blocked", "Fix the problems above first. BlueMap would refuse to start with these.") }}
                </span>
                <v-btn
                    color="primary"
                    variant="flat"
                    :disabled="blocked || plan.empty || isSaving"
                    :prepend-icon="mdiContentSaveOutline"
                    @click="emit('confirm')"
                >
                    {{ t("config.apply.confirm", "Write the files") }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<style>
.mb-config-apply__title {
    display: flex;
    align-items: center;
    gap: 8px;
}

.mb-config-apply__folder {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    margin-block-end: 8px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-apply__heading {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9375rem;
    font-weight: 500;
    margin-block: 12px 4px;
}

.mb-config-apply__list {
    background: transparent;
}

.mb-config-apply__changes,
.mb-config-apply__reasons {
    margin: 0 0 0 1.1em;
    font-size: 0.8125rem;
    line-height: 1.6;
}

.mb-config-apply__changes code {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
}

.mb-config-apply__blocked {
    font-size: 0.75rem;
    margin-inline-end: 8px;
    color: rgb(var(--v-theme-error));
}
</style>
