<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCheckAll,
    mdiCheckboxMultipleMarkedOutline,
    mdiCodeJson,
    mdiEyeOffOutline,
    mdiLanguageMarkdown,
    mdiSelectInverse,
    mdiSelectOff,
    mdiTrashCanOutline,
} from "@mdi/js";
import { VBtn, VDivider } from "vuetify/components";
import ConfigSuperConfirm from "./config/ConfigSuperConfirm.vue";
import { GATE_COMPLETION_HOLD_MS } from "./confirm/superConfirmGate.js";
import { formatNoticesAsMarkdown } from "./notifications/noticeCentre.js";
import {
    bulkDismiss,
    deleteImpact,
    deleteSelectedHistory,
    dismissImpact,
    emptySelection,
    exportImpact,
    formatNoticesAsJson,
    invertSelection,
    markSelectedAsRead,
    noticeSummary,
    readImpact,
    selectExactly,
    selectedAmong,
    type SelectionSet,
} from "./notifications/noticeBulk.js";
import type { Notice, NoticeState } from "./config/notifications.js";

/**
 * The notification centre's bulk-action bar: select-all in both of its honest scopes, invert,
 * clear, and every bulk action a single notice already offers - dismiss, delete, export as
 * JSON or Markdown, and mark-as-read.
 *
 * Lives at `components/NoticeBulkToolbar.vue`, outside `components/notifications/`, for the
 * reason `notificationsBulk.ts`'s file header explains: `components/notifications` is a
 * finished surface in `catalogueCoverage.test.ts`, and this toolbar's copy is not registered
 * there yet. `NoticeCentrePanel.vue` mounts this as a child and adds no `t()` call of its own
 * for anything it renders.
 *
 * Selection itself is owned by the parent, not here: `selected` arrives as a prop and every
 * change to it - select all in either scope, invert, clear, or the selection an action
 * consumes once it runs - leaves through `update:selected` rather than being held as local
 * state. The parent is also where each row's own checkbox lives, and a selection split
 * across two independent copies is a selection that can only ever agree by accident.
 *
 * Every action that actually changes something previews its honest impact right on its own
 * button and status line before it runs, per `noticeBulk.ts`'s `BulkImpact`/`ReadImpact`:
 * how many are selected against how many will really change, so "5 selected" and "3 will
 * dismiss" are never conflated into one number that quietly means whichever is convenient.
 * Delete is the one destructive action here, and it never runs from a plain click at all -
 * it sits behind the same two-key, full-range-slider gate every other delete in this
 * application does, with the exact count and the notices themselves as the reviewable
 * preview `ConfigSuperConfirm` shows before the slider can even move.
 */
const props = defineProps<{
    state: NoticeState;
    /** The notices the active filter and search are currently showing, in display order. */
    visible: readonly Notice[];
    selected: SelectionSet;
}>();

const emit = defineEmits<{ "update:selected": [SelectionSet] }>();

const { t } = useI18n();

const status = ref("");

/**
 * Dismiss, mark-as-read, clear and delete all remove their own triggering button from the DOM
 * on the very next render - each of them empties the selection, and
 * `dismissImpact`/`readImpact`/`deleteImpact` all recompute off state these same actions just
 * changed, so the `v-if` guarding the clicked button (or the whole `hasSelection` block it
 * lives in) closes right under the pointer. Left alone, the browser drops focus to `<body>`
 * the instant that happens, stranding a keyboard or screen-reader user with no way back into
 * the toolbar without starting over from the top of the document.
 *
 * The status paragraph below is the one element in this toolbar that is never conditionally
 * rendered - it is also the live region that just announced what happened - so it is where
 * focus lands instead. `tabindex="-1"` on it makes that a legal, if unusual, focus target
 * without adding it to the normal tab order.
 *
 * Delete needs one more thing the other three do not: see `runDelete`'s own comment for why
 * its act is deferred rather than immediate.
 */
const statusRegion = ref<HTMLElement | null>(null);

function focusStatusRegion(): void {
    void nextTick(() => {
        statusRegion.value?.focus();
    });
}

const visibleIds = computed(() => props.visible.map((notice) => notice.id));
const historyIds = computed(() => props.state.history.map((notice) => notice.id));

const selectedCount = computed(() => props.selected.size);
const hasSelection = computed(() => selectedCount.value > 0);

const dismissImp = computed(() => dismissImpact(props.state, props.selected));
const deleteImp = computed(() => deleteImpact(props.state, props.selected));
const exportImp = computed(() => exportImpact(props.visible, props.selected));
const readImp = computed(() => readImpact(props.state, props.selected));

/** Up to ten notices named for the delete gate's reviewable preview, plus an honest "+N more". */
const deleteAffected = computed<string[]>(() => {
    const notices = props.state.history.filter((notice) => props.selected.has(notice.id));
    const named = notices.slice(0, 10).map((notice) => noticeSummary(notice));
    return notices.length > 10 ? [...named, `+${notices.length - 10} more`] : named;
});

const deleteAction = computed(() =>
    t(
        "noticeBulk.deleteExplain",
        { count: String(deleteImp.value.changingCount) },
        "This removes {count} notifications from the history for good. It cannot be undone.",
    ),
);

/**
 * Dismiss's own reassurance, rendered as a permanently visible sentence under the button row
 * rather than only living in `notificationsBulk.ts`'s catalogue entry: the one fact a reader
 * needs before clearing several notices at once is that dismiss is not delete, and a fact
 * that only appeared inside a hover tooltip - reachable by mouse hover or an explicit
 * keyboard focus, never by simply reading the panel - was not actually doing its job. Shown
 * the same way `deleteAction` already is inside the gate, and `markReadExplain` already is in
 * the exclusion list below.
 */
const dismissAction = computed(() =>
    t(
        "noticeBulk.dismissExplain",
        { count: String(dismissImp.value.changingCount) },
        "This clears {count} notifications from the corner. Each one is still in the history and can be shown again.",
    ),
);

/** Export's own promise -- exactly the filtered set, never quietly widened -- shown the same
 *  permanently visible way as `dismissAction`, and shared by both format buttons since the
 *  promise itself does not change between JSON and Markdown. */
const exportAction = computed(() =>
    t(
        "noticeBulk.exportExplain",
        { count: String(exportImp.value.changingCount) },
        "This writes {count} notifications, exactly the ones that match your current filter.",
    ),
);

function selectAllVisible(): void {
    emit("update:selected", selectExactly(visibleIds.value));
}

function selectAllHistory(): void {
    emit("update:selected", selectExactly(historyIds.value));
}

function invert(): void {
    emit("update:selected", invertSelection(visibleIds.value, props.selected));
}

function clear(): void {
    emit("update:selected", emptySelection());
    focusStatusRegion();
}

function runDismiss(): void {
    const changed = bulkDismiss(props.state, props.selected);
    status.value = t("noticeBulk.actionDone", { count: String(changed) }, "Done. {count} changed.");
    emit("update:selected", emptySelection());
    focusStatusRegion();
}

/**
 * The delete gate's own completion timer, mirrored here so the act it guards does not run
 * before the gate has finished showing that it ran. Cleared on unmount so a panel closed
 * mid-hold cannot call back into state nobody is looking at any more.
 */
let deleteTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Deleting is deferred past `ConfigSuperConfirm`'s own documented completion hold, unlike
 * dismiss and mark-as-read above, which act at once.
 *
 * `ConfigSuperConfirm` authorizes synchronously the moment the slider reaches the end, but
 * then holds its "Authorized." status, checkmark and flash animation on screen for
 * `GATE_COMPLETION_HOLD_MS` before closing itself and returning focus to its own activator -
 * that hold, and that focus return, are the two things `superConfirmPolicy.test.ts` requires
 * every gate to keep. This button's own `<ConfigSuperConfirm v-if="deleteImp.changingCount >
 * 0">` depends on the very history entries and selection the delete removes, so running
 * `deleteSelectedHistory` immediately - the previous behaviour - cleared them in the same
 * tick the gate authorized: `deleteImp.changingCount` fell to zero before Vue had rendered a
 * single frame of "Authorized.", the `v-if` tore the still-open gate out of the DOM, and the
 * gate's own `returnFocusTo` fired into a button that no longer existed.
 *
 * Waiting the same `GATE_COMPLETION_HOLD_MS` the gate itself waits lets that hold actually
 * play out before anything unmounts it, and `focusStatusRegion()` below - not the gate's own
 * `returnFocusTo` - is what recovers focus afterwards, because by the time this runs the
 * button the gate would have refocused is itself gone.
 */
function runDelete(): void {
    if (deleteTimer !== null) clearTimeout(deleteTimer);
    deleteTimer = setTimeout(() => {
        deleteTimer = null;
        const changed = deleteSelectedHistory(props.state, props.selected);
        status.value = t("noticeBulk.actionDone", { count: String(changed) }, "Done. {count} changed.");
        emit("update:selected", emptySelection());
        focusStatusRegion();
    }, GATE_COMPLETION_HOLD_MS);
}

onBeforeUnmount(() => {
    if (deleteTimer !== null) clearTimeout(deleteTimer);
});

function runMarkRead(): void {
    const changed = markSelectedAsRead(props.state, props.selected);
    status.value = t("noticeBulk.actionDone", { count: String(changed) }, "Done. {count} changed.");
    emit("update:selected", emptySelection());
    focusStatusRegion();
}

/**
 * Copies exactly the selected notices that the active filter is still showing, which is what
 * makes the export match what the user sees rather than the raw selection underneath it.
 */
async function exportSelected(format: "json" | "markdown"): Promise<void> {
    const notices = selectedAmong(props.visible, props.selected);
    const text = format === "json" ? formatNoticesAsJson(notices) : formatNoticesAsMarkdown(notices);
    try {
        await navigator.clipboard.writeText(text);
        status.value = t(
            "noticeBulk.exported",
            { count: String(notices.length) },
            "Copied {count} to the clipboard.",
        );
    } catch {
        status.value = t("noticeBulk.exportFailed", {}, "Could not reach the clipboard.");
    }
}
</script>

<template>
    <div class="mb-notice-bulk">
        <div class="mb-notice-bulk__row">
            <!--
                Hidden rather than disabled when a control would have nothing to act on: this
                panel's own convention (see "Show again" versus "Showing now" in
                NoticeCentrePanel.vue) is that a button which is actually on screen always
                does something, and NoticeCentrePanel.test.ts holds every button in this whole
                panel to that by name.
            -->
            <v-btn
                v-if="visibleIds.length > 0"
                :prepend-icon="mdiCheckboxMultipleMarkedOutline"
                variant="text"
                size="small"
                density="comfortable"
                @click="selectAllVisible"
            >
                {{ t("noticeBulk.selectAllVisible", { count: String(visibleIds.length) }, "Select all {count} shown") }}
            </v-btn>
            <v-btn
                v-if="historyIds.length > 0"
                :prepend-icon="mdiCheckboxMultipleMarkedOutline"
                variant="text"
                size="small"
                density="comfortable"
                @click="selectAllHistory"
            >
                {{ t("noticeBulk.selectAllHistory", { count: String(historyIds.length) }, "Select all {count} in history") }}
            </v-btn>
            <v-btn
                v-if="visibleIds.length > 0"
                :prepend-icon="mdiSelectInverse"
                variant="text"
                size="small"
                density="comfortable"
                @click="invert"
            >
                {{ t("noticeBulk.invert", {}, "Invert selection") }}
            </v-btn>
            <v-btn
                v-if="hasSelection"
                :prepend-icon="mdiSelectOff"
                variant="text"
                size="small"
                density="comfortable"
                @click="clear"
            >
                {{ t("noticeBulk.clearSelection", {}, "Clear selection") }}
            </v-btn>
        </div>

        <p ref="statusRegion" class="mb-notice-bulk__status" role="status" aria-live="polite" tabindex="-1">
            {{ t("noticeBulk.selectionStatus", { count: String(selectedCount) }, "{count} selected") }}
            <template v-if="status">{{ status }}</template>
        </p>

        <template v-if="hasSelection">
            <v-divider class="my-2" />

            <div class="mb-notice-bulk__row">
                <v-btn
                    v-if="dismissImp.changingCount > 0"
                    :prepend-icon="mdiEyeOffOutline"
                    variant="tonal"
                    size="small"
                    density="comfortable"
                    @click="runDismiss"
                >
                    {{ t("noticeBulk.dismissButton", { count: String(dismissImp.changingCount) }, "Dismiss {count} selected") }}
                </v-btn>
                <v-btn
                    v-if="readImp.changingCount > 0"
                    :prepend-icon="mdiCheckAll"
                    variant="tonal"
                    size="small"
                    density="comfortable"
                    @click="runMarkRead"
                >
                    {{ t("noticeBulk.markReadButton", { count: String(readImp.changingCount) }, "Mark {count} as read") }}
                </v-btn>
                <v-btn
                    v-if="exportImp.changingCount > 0"
                    :prepend-icon="mdiCodeJson"
                    variant="tonal"
                    size="small"
                    density="comfortable"
                    @click="exportSelected('json')"
                >
                    {{ t("noticeBulk.exportJsonButton", { count: String(exportImp.changingCount) }, "Export {count} as JSON") }}
                </v-btn>
                <v-btn
                    v-if="exportImp.changingCount > 0"
                    :prepend-icon="mdiLanguageMarkdown"
                    variant="tonal"
                    size="small"
                    density="comfortable"
                    @click="exportSelected('markdown')"
                >
                    {{ t("noticeBulk.exportMarkdownButton", { count: String(exportImp.changingCount) }, "Export {count} as Markdown") }}
                </v-btn>

                <ConfigSuperConfirm
                    v-if="deleteImp.changingCount > 0"
                    :title="t('noticeBulk.deleteTitle', {}, 'Delete selected notifications')"
                    :action="deleteAction"
                    :affected="deleteAffected"
                    :confirm-label="t('noticeBulk.deleteConfirmLabel', {}, 'Slide to delete the selected notifications')"
                    @confirm="runDelete"
                >
                    <template #activator="{ props: activator }">
                        <v-btn
                            v-bind="activator"
                            :prepend-icon="mdiTrashCanOutline"
                            color="error"
                            variant="tonal"
                            size="small"
                            density="comfortable"
                        >
                            {{ t("noticeBulk.deleteButton", { count: String(deleteImp.changingCount) }, "Delete {count} selected") }}
                        </v-btn>
                    </template>
                </ConfigSuperConfirm>
            </div>

            <!--
                Dismiss's and export's own honest-preview sentences, permanently on screen
                rather than living only inside a hover tooltip - a tooltip is not reachable by
                simply reading the panel, and the fact each one states (dismiss is reversible,
                export matches the active filter) is exactly the kind of thing somebody
                deciding whether to press the button needs to already be able to see.
            -->
            <p v-if="dismissImp.changingCount > 0" class="mb-notice-bulk__preview" data-test="dismiss-preview">
                {{ dismissAction }}
            </p>
            <p v-if="exportImp.changingCount > 0" class="mb-notice-bulk__preview" data-test="export-preview">
                {{ exportAction }}
            </p>

            <ul
                v-if="
                    dismissImp.excludedCount > 0 ||
                    deleteImp.excludedCount > 0 ||
                    exportImp.excludedCount > 0 ||
                    readImp.excludedCount > 0 ||
                    readImp.extraCount > 0
                "
                class="mb-notice-bulk__excluded"
            >
                <li v-if="dismissImp.excludedCount > 0">
                    {{
                        t(
                            "noticeBulk.excludedDismiss",
                            { excluded: String(dismissImp.excludedCount) },
                            "{excluded} of the selection were not currently showing, so dismiss left them alone",
                        )
                    }}
                </li>
                <li v-if="deleteImp.excludedCount > 0">
                    {{
                        t(
                            "noticeBulk.excludedDelete",
                            { excluded: String(deleteImp.excludedCount) },
                            "{excluded} of the selection are already gone from the history, so delete left them alone",
                        )
                    }}
                </li>
                <li v-if="exportImp.excludedCount > 0">
                    {{
                        t(
                            "noticeBulk.excludedExport",
                            { excluded: String(exportImp.excludedCount) },
                            "{excluded} of the selection do not match the active filter, so export left them out",
                        )
                    }}
                </li>
                <li v-if="readImp.excludedCount > 0">
                    {{
                        t(
                            "noticeBulk.excludedMarkRead",
                            { excluded: String(readImp.excludedCount) },
                            "{excluded} of the selection no longer exist in the history, so marking as read left them alone",
                        )
                    }}
                </li>
                <li v-if="readImp.extraCount > 0">
                    {{
                        t(
                            "noticeBulk.markReadExplain",
                            { count: String(readImp.changingCount) },
                            "This marks {count} notifications as read. Because read is tracked as one line rather than per notification, anything unread in between the oldest and newest of your selection is marked too.",
                        )
                    }}
                </li>
            </ul>
        </template>
    </div>
</template>

<style>
.mb-notice-bulk {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 16px 8px;
}

.mb-notice-bulk__row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.mb-notice-bulk__status {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-notice-bulk__preview {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-notice-bulk__excluded {
    font-size: 0.75rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
