<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAlertOutline,
    mdiContentSaveOutline,
    mdiFileDocumentOutline,
    mdiFilePlusOutline,
    mdiTrashCanOutline,
} from "@mdi/js";
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
import ActionArtwork from "../actionArtwork/ActionArtwork.vue";
import ConfigSuperConfirm from "./ConfigSuperConfirm.vue";
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

/**
 * Blocks Escape and an outside click while a write is in flight, matching the disabled
 * Cancel button beside them.
 *
 * The Cancel button being disabled during a save was never the whole guard: `v-dialog`
 * closes on Escape and on a click outside by default, and neither of those paths looks at
 * a disabled button. A file delete this dialog is in the middle of writing has no way
 * back once it lands - `host.deleteFiles` inside `confirmSave` is a real removal from
 * disk - so dismissing the dialog mid-write must not look like cancelling something that
 * can still be cancelled. `persistent` is only ever true while `isSaving` is, so the
 * dialog is dismissable exactly the rest of the time: opening it, reviewing the plan, and
 * after a save has finished or failed.
 */
const guardDismissal = computed(() => isSaving.value);

const errors = computed(() => props.issues.filter((issue) => issue.severity === "error"));
const warnings = computed(() => props.issues.filter((issue) => issue.severity === "warning"));

const blocked = computed(() => errors.value.length > 0);

const changedPaths = computed(() => props.plan.writes.map((file) => file.path));
const createdPaths = computed(() => new Set(props.plan.created));

const reRenderCount = computed(() => props.plan.affectedMapIds.length);

/* -------------------------------------------------------------------------- */
/* The half of this dialog that is genuinely irreversible                      */
/* -------------------------------------------------------------------------- */

/**
 * Whether saving would take files off the disk, as opposed to only putting them there.
 *
 * This is the moment the delete actually happens. The gate on the maps and storages screens
 * guards *staging* a removal: it takes the entry out of the in-memory workspace and puts
 * its file on this plan's `deletes` list, and reopening the folder at that point brings
 * everything back because nothing has left the disk yet. Only `confirmSave` calls
 * `host.deleteFiles`, and that call is the one with no way back.
 *
 * So the irreversible step gets the gate the contract asks for, and the reversible one that
 * merely writes and updates files does not. Writing is not nothing, but a config file
 * rewritten with its comments kept is a change somebody can look at and change again;
 * a file removed from the folder is not on the disk to look at. Gating every save behind
 * two keys and a slider would also be the fastest way to teach people to turn both keys
 * without reading, which is how a gate stops protecting anything at all.
 */
const deletesFiles = computed(() => props.plan.deletes.length > 0);

/** Disabled for exactly the reasons the plain button is, so the two paths cannot diverge. */
const cannotSave = computed(() => blocked.value || props.plan.empty || isSaving.value);

/** Named individually, because "3 files" is not a list anybody can check. */
const deletedPaths = computed<string[]>(() => [...props.plan.deletes]);
</script>

<template>
    <v-dialog v-model="open" max-width="620" scrollable :persistent="guardDismissal">
        <v-card>
            <v-card-title class="mb-config-apply__title mb-responsive-card-title">
                <v-icon :icon="mdiContentSaveOutline" size="22" aria-hidden="true" />
                <span class="mb-responsive-card-title__text">{{ t("config.apply.title", "Save the config folder") }}</span>
            </v-card-title>

            <v-divider />

            <v-card-text>
                <ActionArtwork
                    v-if="deletesFiles"
                    artwork="configDeleteConfirmation"
                    :alt="
                        t(
                            'config.apply.artwork.alt',
                            'Changed configuration pages being reviewed before selected files move into a deletion tray',
                        )
                    "
                    eager
                />
                <p v-if="folder" class="mb-config-apply__folder">{{ folder }}</p>

                <v-alert v-if="plan.empty" type="info" density="compact" variant="tonal">
                    {{
                        t(
                            "config.apply.nothing",
                            "Nothing has changed, so nothing would be written.",
                        )
                    }}
                </v-alert>

                <template v-else>
                    <h3 class="mb-config-apply__heading">
                        {{ t("config.apply.files", "Files") }}
                        <v-chip size="x-small" variant="outlined">
                            {{
                                t(
                                    "config.apply.fileCount",
                                    { writes: plan.writes.length, deletes: plan.deletes.length },
                                    "{writes} written, {deletes} deleted",
                                )
                            }}
                        </v-chip>
                    </h3>

                    <!--
                        Neither row below binds `title` as a prop: on `<v-list-item>` that
                        binds Vuetify's own display-text prop, never an HTML `title`
                        attribute (`VListItem.js` only ever calls
                        `toDisplayString(props.title)`), and `.v-list-item-title` defaults to
                        `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. A
                        config file's path is exactly the value this dialog exists to let
                        someone verify before an overwrite or a delete that cannot be undone,
                        so silently ellipsing it with no way to recover the rest is the one
                        place in this whole dialog that must not happen. The `#title` slot
                        still renders inside Vuetify's own `.v-list-item-title` wrapper, so
                        the same span carries a genuine native `title` instead.
                    -->
                    <v-list density="compact" class="mb-config-apply__list">
                        <v-list-item
                            v-for="path in changedPaths"
                            :key="path"
                            :prepend-icon="
                                createdPaths.has(path) ? mdiFilePlusOutline : mdiFileDocumentOutline
                            "
                            :subtitle="
                                createdPaths.has(path)
                                    ? t('config.apply.newFile', 'New file')
                                    : t('config.apply.updated', 'Updated, keeping its comments')
                            "
                        >
                            <template #title>
                                <span :title="path">{{ path }}</span>
                            </template>
                        </v-list-item>
                        <v-list-item
                            v-for="path in plan.deletes"
                            :key="path"
                            :prepend-icon="mdiTrashCanOutline"
                            :subtitle="t('config.apply.willDelete', 'Deleted from the folder')"
                        >
                            <template #title>
                                <span :title="path">{{ path }}</span>
                            </template>
                        </v-list-item>
                    </v-list>

                    <template v-if="plan.entryChanges.length > 0">
                        <h3 class="mb-config-apply__heading">
                            {{ t("config.apply.changes", "What changes") }}
                        </h3>
                        <ul class="mb-config-apply__changes">
                            <li v-for="group in plan.entryChanges" :key="group.entry.key">
                                <strong>{{ group.entry.file.path }}</strong>
                                <ul>
                                    <li v-for="change in group.changes" :key="change.field.path">
                                        {{ change.field.label }}:
                                        <code>{{ valueToText(change.from) || "not set" }}</code>
                                        →
                                        <code>{{ valueToText(change.to) || "not set" }}</code>
                                        <v-chip
                                            v-if="change.invalidatesTiles"
                                            size="x-small"
                                            color="warning"
                                            variant="tonal"
                                            class="ml-1"
                                        >
                                            {{ t("config.apply.reRender", "re-render") }}
                                        </v-chip>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </template>

                    <v-alert
                        v-if="reRenderCount > 0"
                        type="warning"
                        density="compact"
                        variant="tonal"
                        class="mt-3"
                    >
                        <template #prepend><v-icon :icon="mdiAlertOutline" /></template>
                        <p>
                            <strong>{{
                                t(
                                    "config.apply.reRenderTitle",
                                    "Tiles that are already rendered become wrong.",
                                )
                            }}</strong>
                        </p>
                        <p>
                            {{
                                t(
                                    "config.apply.reRenderBody",
                                    { maps: plan.affectedMapIds.join(", ") },
                                    "These maps have to be rendered again before what you see matches what you saved: {maps}. Saving does not start that render; it only changes the config.",
                                )
                            }}
                        </p>
                        <ul class="mb-config-apply__reasons">
                            <li v-for="group in plan.tileInvalidating" :key="group.entry.key">
                                <template v-for="change in group.changes" :key="change.field.path">
                                    <template v-if="change.invalidatesTiles">
                                        <strong>{{ change.field.label }}</strong>
                                        {{
                                            change.invalidationNote ??
                                            t(
                                                "config.apply.reRenderGeneric",
                                                "changes how tiles are produced.",
                                            )
                                        }}
                                    </template>
                                </template>
                            </li>
                        </ul>
                    </v-alert>
                </template>

                <v-alert
                    v-for="issue in errors"
                    :key="issue.message"
                    type="error"
                    density="compact"
                    variant="tonal"
                    class="mt-2"
                    role="alert"
                >
                    {{ issue.message }}
                </v-alert>

                <v-alert
                    v-for="issue in warnings"
                    :key="issue.message"
                    type="warning"
                    density="compact"
                    variant="tonal"
                    class="mt-2"
                >
                    {{ issue.message }}
                </v-alert>

                <v-alert
                    v-if="failure"
                    type="error"
                    density="compact"
                    variant="tonal"
                    class="mt-2"
                    role="alert"
                >
                    {{ failure }}
                </v-alert>

                <v-progress-linear v-if="isSaving" indeterminate color="primary" class="mt-3" />
            </v-card-text>

            <v-divider />

            <v-card-actions>
                <v-btn variant="text" :disabled="isSaving" @click="open = false">{{
                    t("config.apply.cancel", "Cancel")
                }}</v-btn>
                <v-spacer />
                <span v-if="blocked" class="mb-config-apply__blocked">
                    {{
                        t(
                            "config.apply.blocked",
                            "Fix the problems above first. BlueMap would refuse to start with these.",
                        )
                    }}
                </span>
                <!--
                    A save that only writes is one button. A save that also deletes is the
                    same button behind the super-confirmation gate, because this is where
                    the files actually leave the folder.
                -->
                <ConfigSuperConfirm
                    v-if="deletesFiles"
                    :title="t('config.apply.deleteTitle', 'Delete files from the config folder')"
                    :action="
                        t(
                            'config.apply.deleteAction',
                            { folder: folder ?? '' },
                            'Saving now deletes the files listed below from {folder}. They leave the disk, this application keeps no copy of them, and it cannot put them back.',
                        )
                    "
                    :affected="deletedPaths"
                    :confirm-label="t('config.apply.confirm', 'Write the files')"
                    :disabled="cannotSave"
                    @confirm="emit('confirm')"
                >
                    <template #activator="{ props: activatorProps }">
                        <v-btn
                            v-bind="activatorProps"
                            color="error"
                            variant="flat"
                            :prepend-icon="mdiContentSaveOutline"
                        >
                            {{ t("config.apply.confirm", "Write the files") }}
                        </v-btn>
                    </template>
                </ConfigSuperConfirm>
                <v-btn
                    v-else
                    color="primary"
                    variant="flat"
                    :disabled="cannotSave"
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
    flex-wrap: wrap;
    /*
     * `<v-card-title>` defaults to `overflow: hidden; text-overflow: ellipsis;
     * white-space: nowrap` for a single-line block title. Flexing it (above) leaves
     * all three in place: `overflow: hidden` still clips, and the inherited `nowrap`
     * means the title can never wrap, so the bilingual title was silently cut off with
     * no ellipsis and no indication anything was missing. Same fix as
     * `DockerWorldSourcePanel.vue`'s `.mb-docker-world__card > .v-card-title`.
     */
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
}

.mb-config-apply__folder {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    margin-block-end: 8px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    /* An absolute Windows path is backslash-separated, giving the browser no natural break
       point inside this 620px-wide dialog; without this a long one overflows sideways
       instead of wrapping. */
    overflow-wrap: anywhere;
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
