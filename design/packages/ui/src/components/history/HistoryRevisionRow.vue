<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAlphaABox,
    mdiAlphaBBox,
    mdiChevronDown,
    mdiChevronUp,
    mdiHistory,
    mdiLabelOutline,
    mdiRestore,
} from "@mdi/js";
import { VBtn, VChip, VIcon, VProgressCircular, VTextField } from "vuetify/components";

import HistoryReadableDiff from "./HistoryReadableDiff.vue";
import type { HistoryComparisonFile, HistoryRevision } from "./historyHost.js";

/**
 * One revision in the history panel.
 *
 * ### Restore asks twice, and does not open a dialog to do it
 *
 * Restoring is not destructive - the state it replaces is snapshotted first and stays in
 * the history forever - so it does not earn the two-key gate, which is reserved for things
 * that genuinely cannot be undone. What it *is* is a click that rewrites files on disk, and
 * a single click that does that sitting in a list of forty rows is a slip waiting to
 * happen. So the button turns into a confirm button in place: the second click is a
 * deliberate one, nothing blocks the rest of the application in the meantime, and Escape or
 * moving away puts it back.
 *
 * ### The label is the user's own words
 *
 * A revision already says what changed. The label field is for what it *meant*: "before the
 * server move", "the config that actually worked". It is stored as a git note, so writing
 * one changes no revision and re-writing one rewrites no history.
 *
 * ### The diff is fetched when it is opened, never before
 *
 * A history of four hundred revisions would otherwise run four hundred `git diff` calls to
 * draw a list nobody has scrolled to yet. The row asks its parent for the diff on expand
 * and the parent caches it.
 *
 * ### The row itself is the focus target
 *
 * The list is walked with the arrow keys, and what moves is focus on the `<li>` rather than
 * on one of the buttons inside it. That is the difference between a list a screen-reader
 * user can skim and one they have to tab through four controls per row to cross. Tab still
 * reaches every control of the focused row, which is the standard roving-tabindex bargain:
 * arrows choose the row, Tab works inside it.
 */
const props = withDefaults(
    defineProps<{
        revision: HistoryRevision;
        /** True for the revision that is on disk right now. Never inferred from position. */
        current?: boolean;
        expanded?: boolean;
        /** The fetched comparison against this revision's parent, or null while fetching. */
        diff?: readonly HistoryComparisonFile[] | null;
        /** Why the diff could not be read, shown in place of it. */
        diffError?: string | null;
        /** True while any history operation is in flight, which disables the actions. */
        busy?: boolean;
        /** False when the host cannot write, so the row offers no action it cannot perform. */
        writable?: boolean;
        /** True when this row is the one the arrow keys would move away from. */
        active?: boolean;
        /** Which end of the comparison this revision is, when it is one. */
        compareRole?: "a" | "b" | null;
        /** False when the host cannot compare, so the A and B buttons are not offered. */
        comparable?: boolean;
        /** True when the host can put single files and settings back. */
        selective?: boolean;
        /**
         * False when the host cannot attach a note to a revision, so the label pencil is
         * not offered where pressing it would throw.
         *
         * The config-folder history this row was built for offers `history:label`
         * unconditionally, so this defaults to `true` and every existing caller is
         * unaffected. The profile-list and application-settings histories added later offer
         * only read, save, list and restore - see `docs/config-history.md` - so the browser
         * built for those passes `false` here rather than presenting a control with nothing
         * behind it.
         */
        labellable?: boolean;
    }>(),
    {
        current: false,
        expanded: false,
        diff: null,
        diffError: null,
        busy: false,
        writable: true,
        active: false,
        compareRole: null,
        comparable: false,
        selective: false,
        labellable: true,
    },
);

const emit = defineEmits<{
    toggle: [id: string];
    restore: [id: string];
    label: [id: string, text: string];
    pick: [id: string, end: "a" | "b"];
    restoreFile: [id: string, path: string];
    restoreSetting: [id: string, path: string, key: string];
}>();

const { t, locale } = useI18n();

const confirming = ref(false);
const editingLabel = ref(false);
const labelText = ref(props.revision.note ?? "");
const labelField = ref<InstanceType<typeof VTextField> | null>(null);
const restoreButton = ref<InstanceType<typeof VBtn> | null>(null);
const rowElement = ref<HTMLLIElement | null>(null);

/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`, so the
 * optional props are normalised once here rather than coalesced at every binding.
 */
const isExpanded = computed(() => props.expanded === true);
const isBusy = computed(() => props.busy === true);
const isCurrent = computed(() => props.current === true);
const isActive = computed(() => props.active === true);
const canWrite = computed(() => props.writable !== false);
const canCompare = computed(() => props.comparable === true);
const canSelect = computed(() => props.selective === true);
const canLabel = computed(() => props.labellable !== false);
const role = computed<"a" | "b" | null>(() => props.compareRole ?? null);
const diffFiles = computed<readonly HistoryComparisonFile[] | null>(() => props.diff ?? null);
const diffProblem = computed(() => props.diffError ?? null);

const localeTag = computed(() => (locale.value === "none" ? "en" : locale.value));

/** The full timestamp, spelled out. A relative time alone is unusable in a bug report. */
const when = computed(() => {
    const date = new Date(props.revision.at);
    if (Number.isNaN(date.getTime())) return props.revision.at;
    return new Intl.DateTimeFormat(localeTag.value, { dateStyle: "medium", timeStyle: "short" }).format(date);
});

const panelId = computed(() => `mb-history-detail-${props.revision.shortId}`);

/**
 * The action word, in a sentence rather than as a bare token.
 *
 * A chip reading `mixed` tells somebody nothing. These are the words this build knows;
 * anything else falls back to the raw word, which is honest and readable enough, and is
 * what lets the main process add an action without this file needing a release.
 */
const actionLabel = computed(() => {
    switch (props.revision.action) {
        case "started":
            return t("history.action.started", "History started");
        case "created":
            return t("history.action.created", "Added");
        case "changed":
            return t("history.action.changed", "Changed");
        case "deleted":
            return t("history.action.deleted", "Deleted");
        case "mixed":
            return t("history.action.mixed", "Several changes");
        case "restored":
            return t("history.action.restored", "Restored");
        case "pruned":
            return t("history.action.pruned", "Trimmed");
        default:
            return props.revision.action;
    }
});

const actionColour = computed(() => {
    switch (props.revision.action) {
        case "deleted":
            return "error";
        case "created":
            return "success";
        case "restored":
            return "primary";
        default:
            return undefined;
    }
});

/**
 * The whole row in one sentence, which is what a screen reader announces on arrow.
 *
 * Built rather than left to the reader's own concatenation of four chips, because the order
 * those would be read in is the order they happen to be in the markup, and "Deleted, on disk
 * now, A, 12 March" is not a sentence. Selection is in here too, so choosing A is audible
 * without hunting for what changed on screen.
 */
const rowLabel = computed(() => {
    const parts = [props.revision.label, when.value, actionLabel.value];
    if (props.revision.note !== null) parts.push(props.revision.note);
    if (isCurrent.value) parts.push(t("history.row.current", "On disk now"));
    if (role.value === "a") parts.push(t("history.row.pickedA", "Chosen as A, the older end"));
    if (role.value === "b") parts.push(t("history.row.pickedB", "Chosen as B, the newer end"));
    return parts.join(". ");
});

function askRestore(): void {
    confirming.value = true;
}

function cancelRestore(): void {
    if (!confirming.value) return;
    confirming.value = false;
    // Focus goes back to the button that opened the question, never to the page.
    void nextTick(() => {
        (restoreButton.value?.$el as HTMLElement | undefined)?.focus();
    });
}

function doRestore(): void {
    confirming.value = false;
    emit("restore", props.revision.id);
}

function startLabelling(): void {
    labelText.value = props.revision.note ?? "";
    editingLabel.value = true;
    void nextTick(() => {
        (labelField.value?.$el as HTMLElement | undefined)?.querySelector("input")?.focus();
    });
}

function commitLabel(): void {
    editingLabel.value = false;
    emit("label", props.revision.id, labelText.value.trim());
}

function cancelLabel(): void {
    editingLabel.value = false;
    labelText.value = props.revision.note ?? "";
}

/** Lets the list move focus here without reaching into the DOM for a class name. */
function focusRow(): void {
    rowElement.value?.focus();
}

defineExpose({ focusRow });
</script>

<template>
    <li
        ref="rowElement"
        class="mb-history-row"
        :class="{
            'mb-history-row--current': isCurrent,
            'mb-history-row--picked': role !== null,
        }"
        role="group"
        :tabindex="isActive ? 0 : -1"
        :aria-label="rowLabel"
        :aria-current="isCurrent ? 'true' : undefined"
        :data-revision="revision.id"
        :data-pick="role ?? undefined"
    >
        <div class="mb-history-row__head">
            <v-icon
                :icon="revision.action === 'restored' ? mdiRestore : mdiHistory"
                size="20"
                class="mb-history-row__icon"
                aria-hidden="true"
            />

            <div class="mb-history-row__text">
                <p class="mb-history-row__label">{{ revision.label }}</p>

                <p class="mb-history-row__meta">
                    <span>{{ when }}</span>
                    <span class="mb-history-row__id">{{ revision.shortId }}</span>
                    <v-chip :color="actionColour" size="x-small" variant="tonal" label>{{ actionLabel }}</v-chip>
                    <v-chip v-if="isCurrent" size="x-small" variant="tonal" color="primary" label>
                        {{ t("history.row.current", "On disk now") }}
                    </v-chip>
                    <v-chip v-if="role" size="x-small" variant="flat" color="secondary" label>
                        {{
                            role === "a"
                                ? t("history.row.chipA", "A")
                                : t("history.row.chipB", "B")
                        }}
                    </v-chip>
                </p>

                <p v-if="revision.note && !editingLabel" class="mb-history-row__note">
                    <v-icon :icon="mdiLabelOutline" size="14" aria-hidden="true" />
                    {{ revision.note }}
                </p>

                <div v-if="editingLabel" class="mb-history-row__labelEdit">
                    <v-text-field
                        ref="labelField"
                        v-model="labelText"
                        :label="t('history.row.labelField', 'Label for this revision')"
                        :placeholder="t('history.row.labelHint', 'What this moment was, in your own words')"
                        density="compact"
                        variant="outlined"
                        hide-details="auto"
                        spellcheck="false"
                        @keydown.enter.prevent="commitLabel"
                        @keydown.esc.stop.prevent="cancelLabel"
                    />
                    <v-btn size="small" variant="tonal" color="primary" @click="commitLabel">
                        {{ t("history.row.labelSave", "Save label") }}
                    </v-btn>
                    <v-btn size="small" variant="text" @click="cancelLabel">
                        {{ t("history.row.labelCancel", "Cancel") }}
                    </v-btn>
                </div>
            </div>

            <div class="mb-history-row__actions">
                <template v-if="canCompare">
                    <v-btn
                        :icon="mdiAlphaABox"
                        :aria-label="
                            t(
                                'history.row.pickALong',
                                { label: revision.label },
                                'Compare from here: make {label} the older end, A',
                            )
                        "
                        :aria-pressed="role === 'a' ? 'true' : 'false'"
                        :color="role === 'a' ? 'secondary' : undefined"
                        variant="text"
                        size="small"
                        density="comfortable"
                        @click="emit('pick', revision.id, 'a')"
                    />
                    <v-btn
                        :icon="mdiAlphaBBox"
                        :aria-label="
                            t(
                                'history.row.pickBLong',
                                { label: revision.label },
                                'Compare to here: make {label} the newer end, B',
                            )
                        "
                        :aria-pressed="role === 'b' ? 'true' : 'false'"
                        :color="role === 'b' ? 'secondary' : undefined"
                        variant="text"
                        size="small"
                        density="comfortable"
                        @click="emit('pick', revision.id, 'b')"
                    />
                </template>

                <v-btn
                    :icon="isExpanded ? mdiChevronUp : mdiChevronDown"
                    :aria-label="
                        isExpanded
                            ? t('history.row.hideChanges', 'Hide what this revision changed')
                            : t('history.row.showChanges', 'Show what this revision changed')
                    "
                    :aria-expanded="isExpanded ? 'true' : 'false'"
                    :aria-controls="panelId"
                    variant="text"
                    size="small"
                    density="comfortable"
                    @click="emit('toggle', revision.id)"
                />

                <v-btn
                    v-if="canWrite && canLabel && !editingLabel"
                    :icon="mdiLabelOutline"
                    :aria-label="
                        revision.note
                            ? t('history.row.relabel', 'Change this revision\'s label')
                            : t('history.row.label', 'Give this revision a label')
                    "
                    variant="text"
                    size="small"
                    density="comfortable"
                    :disabled="isBusy"
                    @click="startLabelling"
                />

                <template v-if="canWrite">
                    <v-btn
                        v-if="!confirming"
                        ref="restoreButton"
                        :prepend-icon="mdiRestore"
                        variant="text"
                        size="small"
                        :disabled="isBusy"
                        @click="askRestore"
                    >
                        {{ t("history.row.restore", "Restore") }}
                    </v-btn>
                    <span v-else class="mb-history-row__confirm" @keydown.esc.stop.prevent="cancelRestore">
                        <v-btn
                            color="primary"
                            variant="tonal"
                            size="small"
                            :disabled="isBusy"
                            :aria-label="
                                t(
                                    'history.row.restoreConfirmLong',
                                    { label: revision.label },
                                    'Write the config folder back to: {label}. The state it replaces is saved first, so this can be undone.',
                                )
                            "
                            @click="doRestore"
                        >
                            {{ t("history.row.restoreConfirm", "Write these files back") }}
                        </v-btn>
                        <v-btn variant="text" size="small" @click="cancelRestore">
                            {{ t("history.row.restoreCancel", "Keep what is there") }}
                        </v-btn>
                    </span>
                </template>
            </div>
        </div>

        <div :id="panelId" v-show="isExpanded" class="mb-history-row__detail">
            <ul class="mb-history-row__files">
                <li v-for="change in revision.changes" :key="change.path">
                    <span class="mb-history-row__status" :data-status="change.status">{{ change.status }}</span>
                    {{ change.path }}
                </li>
                <li v-if="revision.changes.length === 0" class="mb-history-row__empty">
                    {{ t("history.row.noFiles", "This revision recorded no file changes.") }}
                </li>
            </ul>

            <p v-if="diffProblem" class="mb-history-row__problem" role="status">{{ diffProblem }}</p>

            <div v-else-if="diffFiles === null && isExpanded" class="mb-history-row__loading">
                <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
                <span>{{ t("history.row.loadingDiff", "Reading what changed...") }}</span>
            </div>

            <HistoryReadableDiff
                v-else-if="diffFiles"
                :files="diffFiles"
                :restorable="canWrite && canSelect"
                :busy="isBusy"
                restore-side="after"
                :source-label="revision.shortId"
                @restore-setting="(path, key) => emit('restoreSetting', revision.id, path, key)"
                @restore-file="(path) => emit('restoreFile', revision.id, path)"
            />
        </div>
    </li>
</template>

<style>
.mb-history-row {
    padding: 10px 4px;
    border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    list-style: none;
}

/*
 * A row is a focus target, so it needs a focus ring of its own. Without this the arrow keys
 * move something invisible and the list reads as broken to anybody not using a pointer.
 */
.mb-history-row:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
    border-radius: 4px;
}

.mb-history-row--current {
    background: rgba(var(--v-theme-primary), 0.04);
}

.mb-history-row--picked {
    box-shadow: inset 3px 0 0 rgb(var(--v-theme-secondary));
}

.mb-history-row__head {
    display: flex;
    gap: 10px;
    align-items: flex-start;
}

.mb-history-row__icon {
    margin-block-start: 2px;
    opacity: 0.7;
}

.mb-history-row__text {
    flex: 1 1 auto;
    min-width: 0;
}

.mb-history-row__label {
    margin: 0;
    font-weight: 500;
    overflow-wrap: anywhere;
}

.mb-history-row__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin: 2px 0 0;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-history-row__id {
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
}

.mb-history-row__note {
    display: flex;
    gap: 4px;
    align-items: center;
    margin: 4px 0 0;
    font-size: 0.8125rem;
    font-style: italic;
}

.mb-history-row__labelEdit {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-block-start: 8px;
}

.mb-history-row__labelEdit .v-input {
    flex: 1 1 220px;
}

.mb-history-row__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    align-items: center;
}

.mb-history-row__confirm {
    display: inline-flex;
    gap: 4px;
    align-items: center;
}

.mb-history-row__detail {
    padding: 8px 0 4px 30px;
}

.mb-history-row__files {
    margin: 0;
    padding: 0;
    font-size: 0.8125rem;
    list-style: none;
}

.mb-history-row__files li {
    overflow-wrap: anywhere;
}

.mb-history-row__status {
    display: inline-block;
    min-width: 4.5rem;
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: 0.6875rem;
    text-transform: uppercase;
    opacity: 0.75;
}

.mb-history-row__status[data-status="added"] {
    color: rgb(var(--v-theme-success));
}

.mb-history-row__status[data-status="deleted"] {
    color: rgb(var(--v-theme-error));
}

.mb-history-row__empty,
.mb-history-row__problem {
    margin: 4px 0 0;
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-history-row__loading {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-block-start: 8px;
    font-size: 0.8125rem;
}
</style>
