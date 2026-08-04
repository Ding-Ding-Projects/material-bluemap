<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCameraPlusOutline,
    mdiContentCopy,
    mdiDownload,
    mdiFilterVariant,
    mdiFolderClockOutline,
    mdiRefresh,
    mdiScissorsCutting,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VChip,
    VDivider,
    VIcon,
    VList,
    VListItem,
    VMenu,
    VNumberInput,
    VProgressLinear,
} from "vuetify/components";

import ChangelogDateFilter from "../changelog/ChangelogDateFilter.vue";
import type { DayKey } from "../changelog/changelogDates.js";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { raiseNotice } from "../../stores/notices.js";

import HistoryRevisionRow from "./HistoryRevisionRow.vue";
import {
    actionFacets,
    daysWithRevisions,
    exportRevisions,
    filterRevisions,
    historySpan,
    searchCorpus,
    EXPORT_EXTENSIONS,
    type ExportFormat,
} from "./historyModel.js";
import {
    useHistoryHost,
    type HistoryDiffFile,
    type HistoryHost,
    type HistoryListing,
    type HistoryRevision,
    type HistoryStatus,
} from "./historyHost.js";

/**
 * The version history of one BlueMap config folder: browse, diff, restore, label, trim and
 * export.
 *
 * ### What this panel is looking at
 *
 * A separate Git repository, kept beside this application's own data, holding a mirror of
 * the config folder. Never a `.git` inside the folder the person chose - the header states
 * where the repository actually is, because a version-control feature that does not say
 * where it put a repository is one people rightly distrust.
 *
 * ### Why a restore is safe to press
 *
 * The main process snapshots what is on disk *before* it writes anything back, then records
 * the restore as a new revision on top. Nothing is rewritten and nothing is dropped, so the
 * state a restore replaced is still in this list afterwards and can be restored in turn.
 * That is the property that makes this panel usable rather than frightening, and it is
 * worth saying on screen, which the footer does.
 *
 * ### The filters compose, and the actions come from the data
 *
 * The search, the date range and the action chips narrow each other rather than replacing
 * each other. The chips are built from the actions these revisions actually carry, each
 * with its count, so there is never a filter offered that is guaranteed to find nothing.
 * All of that lives in `historyModel.ts`, tested without mounting anything.
 *
 * ### Only one thing here destroys anything
 *
 * Trimming a history removes revisions for good. It is the single call on the host that
 * takes anything away, and it is the single control in this panel behind the two-key
 * super-confirmation gate. Everything else, restore included, only ever adds.
 */
const props = withDefaults(
    defineProps<{
        /** The config folder whose history this is. Absolute. */
        folder: string;
        /** Injected in tests; the desktop shell's bridge is found automatically. */
        host?: HistoryHost | null;
        /** Rows shown before the list scrolls inside its own bound. */
        maxRows?: number;
    }>(),
    // `host` deliberately has no default. Under `exactOptionalPropertyTypes` a default of
    // `undefined` is not assignable, and the distinction matters anyway: absent means "find
    // the shell's bridge", whereas an explicit `null` means "there is no host", which is
    // what the test for the browser-tab case passes in.
    { maxRows: 200 },
);

const { t } = useI18n();

const injected = useHistoryHost();
const host = computed<HistoryHost | null>(() => (props.host === undefined ? injected : props.host));

const status = ref<HistoryStatus | null>(null);
const listing = ref<HistoryListing | null>(null);
const loading = ref(false);
const busy = ref(false);

/* -------------------------------------------------------------------------- */
/* The three filters                                                          */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regex = ref(false);
const flags = ref("i");
const from = ref<DayKey | null>(null);
const to = ref<DayKey | null>(null);
const chosenActions = ref<string[]>([]);

/**
 * The filter row starts collapsed.
 *
 * It describes the collection rather than changing it until somebody touches it, and a
 * panel whose controls take more room than its content has buried the content. The count
 * beside the toggle is what keeps a collapsed row from hiding an active filter silently.
 */
const filtersOpen = ref(false);

const revisions = computed<readonly HistoryRevision[]>(() => listing.value?.revisions ?? []);
const facets = computed(() => actionFacets(revisions.value));
const span = computed(() => historySpan(revisions.value));
const markedDays = computed(() => daysWithRevisions(revisions.value));

const outcome = computed(() =>
    filterRevisions(revisions.value, {
        query: query.value,
        regex: regex.value,
        flags: flags.value,
        range: { from: from.value, to: to.value },
        actions: chosenActions.value,
    }),
);

const shown = computed(() => outcome.value.revisions.slice(0, props.maxRows ?? 200));

/** Real text for the regex builder's preview, so it previews this history and not a sample. */
const sample = computed(() =>
    revisions.value
        .slice(0, 40)
        .map((revision) => searchCorpus(revision).split("\n")[0] ?? "")
        .join("\n"),
);

const summary = computed(() => {
    const total = revisions.value.length;
    const kept = outcome.value.revisions.length;
    if (total === 0) return "";
    return kept === total
        ? t("history.summaryAll", { total: String(total) }, "{total} revisions")
        : t("history.summary", { kept: String(kept), total: String(total) }, "Showing {kept} of {total} revisions");
});

const activeFilterCount = computed(() => {
    let count = 0;
    if (query.value !== "") count += 1;
    if (from.value !== null || to.value !== null) count += 1;
    count += chosenActions.value.length;
    return count;
});

function toggleAction(action: string): void {
    chosenActions.value = chosenActions.value.includes(action)
        ? chosenActions.value.filter((entry) => entry !== action)
        : [...chosenActions.value, action];
}

function clearFilters(): void {
    query.value = "";
    regex.value = false;
    from.value = null;
    to.value = null;
    chosenActions.value = [];
}

/* -------------------------------------------------------------------------- */
/* Talking to the host                                                        */
/* -------------------------------------------------------------------------- */

const diffs = ref<Record<string, readonly HistoryDiffFile[]>>({});
const diffErrors = ref<Record<string, string>>({});
const expanded = ref<string | null>(null);

async function refresh(): Promise<void> {
    const current = host.value;
    if (current === null || props.folder === "") return;

    loading.value = true;
    try {
        status.value = await current.status();
        listing.value = await current.list(props.folder);
    } finally {
        loading.value = false;
    }
    // A revision's diff belongs to a revision, and after a reload the ones on screen may
    // not be the ones that were cached.
    diffs.value = {};
    diffErrors.value = {};
}

onMounted(() => void refresh());
watch(
    () => props.folder,
    () => void refresh(),
);

async function toggleDiff(id: string): Promise<void> {
    if (expanded.value === id) {
        expanded.value = null;
        return;
    }
    expanded.value = id;

    const current = host.value;
    if (current === null || diffs.value[id] !== undefined) return;

    const answer = await current.diff(props.folder, id);
    if (answer.ok) diffs.value = { ...diffs.value, [id]: answer.files };
    else diffErrors.value = { ...diffErrors.value, [id]: answer.message };
}

async function snapshotNow(): Promise<void> {
    const current = host.value;
    if (current === null) return;

    busy.value = true;
    try {
        const written = await current.snapshot(props.folder);
        if (!written.ok) raiseNotice("error", written.message);
        else if (written.revision === null) raiseNotice("info", written.message);
        else raiseNotice("success", t("history.snapshotTaken", { label: written.message }, "Recorded: {label}"));
        if (written.ok) await refresh();
    } finally {
        busy.value = false;
    }
}

async function restore(id: string): Promise<void> {
    const current = host.value;
    if (current === null) return;

    busy.value = true;
    try {
        const restored = await current.restore(props.folder, id);
        if (!restored.ok) {
            raiseNotice("error", restored.message);
            return;
        }

        raiseNotice("success", restored.message);
        for (const skip of restored.skipped) {
            raiseNotice(
                "warning",
                t(
                    "history.restoreSkipped",
                    { path: skip.path },
                    "{path} was left alone, because this editor does not write that file.",
                ),
                skip.reason,
            );
        }
        await refresh();
    } finally {
        busy.value = false;
    }
}

async function applyLabel(id: string, text: string): Promise<void> {
    const current = host.value;
    if (current === null) return;

    busy.value = true;
    try {
        const written = await current.label(props.folder, id, text);
        raiseNotice(written.ok ? "success" : "error", written.message);
        if (written.ok) await refresh();
    } finally {
        busy.value = false;
    }
}

/* -------------------------------------------------------------------------- */
/* Retention                                                                  */
/* -------------------------------------------------------------------------- */

const keep = ref(50);

const wouldDrop = computed(() => Math.max(0, revisions.value.length - Math.max(1, keep.value)));

const trimAffected = computed(() =>
    outcome.value.revisions
        .slice(Math.max(1, keep.value))
        .slice(0, 8)
        .map((revision) => `${revision.shortId}  ${revision.label}`),
);

/**
 * Removes every revision older than the newest `keep`.
 *
 * The one destructive action in this panel, which is why the button that reaches it is the
 * activator of a super-confirmation gate rather than a button. What it removes cannot be
 * restored by anything in this application afterwards, and the gate's copy says exactly
 * that with the count in it.
 */
async function trimHistory(): Promise<void> {
    const current = host.value;
    if (current === null) return;

    busy.value = true;
    try {
        const written = await current.discardOlderRevisions(props.folder, Math.max(1, keep.value));
        raiseNotice(written.ok ? "success" : "error", written.message);
        if (written.ok) await refresh();
    } finally {
        busy.value = false;
    }
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

const exportLabels = computed(() => ({
    title: t("history.exportTitle", "BlueMap config history"),
    folder: t("history.exportFolder", { folder: props.folder }, "Config folder: {folder}"),
    repository: t(
        "history.exportRepository",
        { repository: listing.value?.repository ?? "" },
        "History repository: {repository}",
    ),
    range: outcome.value.active
        ? t(
              "history.exportFiltered",
              { kept: String(outcome.value.revisions.length), total: String(revisions.value.length) },
              "This file holds {kept} of {total} revisions, the ones the filters on screen matched.",
          )
        : t("history.exportAll", "This file holds every revision recorded for this folder."),
    empty: t("history.exportEmpty", "Nothing matched these filters."),
}));

function exportText(format: ExportFormat): string {
    return exportRevisions(outcome.value.revisions, format, exportLabels.value);
}

async function copyView(): Promise<void> {
    const text = exportText("markdown");
    try {
        const bridge = typeof window === "undefined" ? undefined : window.materialBluemap;
        if (bridge) await bridge.writeClipboardText(text);
        else await navigator.clipboard.writeText(text);
        raiseNotice("success", t("history.copied", "The history on screen is on the clipboard."));
    } catch {
        raiseNotice("error", t("history.copyFailed", "Could not reach the clipboard."));
    }
}

function download(format: ExportFormat): void {
    const name = `bluemap-config-history.${EXPORT_EXTENSIONS[format]}`;
    const blob = new Blob([exportText(format)], {
        type: format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    raiseNotice("success", t("history.exported", { name }, "Exported {name}."));
}

/* -------------------------------------------------------------------------- */
/* What this panel can say about itself                                       */
/* -------------------------------------------------------------------------- */

const unavailable = computed<string | null>(() => {
    if (host.value === null) {
        return t(
            "history.noHost",
            "This build has no version history, because it is running without the desktop shell that keeps one.",
        );
    }
    if (status.value !== null && !status.value.available) return status.value.reason;
    if (listing.value !== null && !listing.value.available) return listing.value.reason;
    return null;
});

const canWrite = computed(() => host.value !== null && unavailable.value === null);
</script>

<template>
    <v-card class="mb-history" :aria-label="t('history.title', 'Version history')">
        <v-card-text>
            <header class="mb-history__head">
                <v-icon :icon="mdiFolderClockOutline" size="24" aria-hidden="true" />
                <div class="mb-history__headText">
                    <h2 class="mb-history__title">{{ t("history.title", "Version history") }}</h2>
                    <p class="mb-history__subtitle">
                        {{
                            t(
                                "history.subtitle",
                                "Every change to this config folder is recorded, so anything you create, edit or delete can be put back.",
                            )
                        }}
                    </p>
                </div>
                <v-btn
                    :icon="mdiRefresh"
                    :aria-label="t('history.reload', 'Read this folder\'s history again')"
                    variant="text"
                    size="small"
                    density="comfortable"
                    :disabled="loading || busy"
                    @click="refresh"
                />
            </header>

            <v-progress-linear v-if="loading || busy" indeterminate color="primary" class="mb-history__progress" />

            <v-alert v-if="unavailable" type="info" variant="tonal" density="comfortable" class="mb-history__notice">
                {{ unavailable }}
            </v-alert>

            <template v-else>
                <div class="mb-history__toolbar">
                    <ConfigSearchField
                        v-model="query"
                        v-model:regex="regex"
                        v-model:flags="flags"
                        :label="t('history.search', 'Search this history')"
                        :placeholder="t('history.searchHint', 'A map name, a label, a revision')"
                        :sample="sample"
                        :summary="summary"
                        class="mb-history__search"
                    />

                    <div class="mb-history__toolbarActions">
                        <v-btn
                            :prepend-icon="mdiCameraPlusOutline"
                            variant="tonal"
                            size="small"
                            :disabled="!canWrite || busy"
                            @click="snapshotNow"
                        >
                            {{ t("history.snapshot", "Record now") }}
                        </v-btn>

                        <v-btn
                            :prepend-icon="mdiContentCopy"
                            variant="text"
                            size="small"
                            :aria-label="t('history.copyView', 'Copy what is on screen to the clipboard')"
                            @click="copyView"
                        >
                            {{ t("history.copy", "Copy") }}
                        </v-btn>

                        <v-btn
                            :prepend-icon="mdiDownload"
                            variant="text"
                            size="small"
                            :aria-label="t('history.exportView', 'Export what is on screen to a file')"
                        >
                            {{ t("history.export", "Export") }}
                            <v-menu activator="parent" location="bottom end">
                                <v-list density="compact">
                                    <v-list-item
                                        :title="t('history.exportMarkdown', 'Markdown file')"
                                        @click="download('markdown')"
                                    />
                                    <v-list-item
                                        :title="t('history.exportJson', 'JSON file')"
                                        @click="download('json')"
                                    />
                                    <v-list-item :title="t('history.exportCsv', 'CSV file')" @click="download('csv')" />
                                    <v-list-item
                                        :title="t('history.exportPlain', 'Plain text file')"
                                        @click="download('text')"
                                    />
                                </v-list>
                            </v-menu>
                        </v-btn>

                        <v-btn
                            :prepend-icon="mdiFilterVariant"
                            variant="text"
                            size="small"
                            :aria-expanded="filtersOpen ? 'true' : 'false'"
                            aria-controls="mb-history-filters"
                            @click="filtersOpen = !filtersOpen"
                        >
                            {{ t("history.filters", "Filters") }}
                            <v-chip v-if="activeFilterCount > 0" size="x-small" class="ms-1" label>
                                {{ activeFilterCount }}
                            </v-chip>
                        </v-btn>
                    </div>
                </div>

                <div v-show="filtersOpen" id="mb-history-filters" class="mb-history__filters">
                    <ChangelogDateFilter
                        v-model:from="from"
                        v-model:to="to"
                        :earliest="span.earliest"
                        :latest="span.latest"
                        :days-with-entries="markedDays"
                    />

                    <div
                        class="mb-history__actions"
                        role="group"
                        :aria-label="t('history.actionFilter', 'Filter by what a revision did')"
                    >
                        <v-chip
                            v-for="facet in facets"
                            :key="facet.action"
                            :aria-pressed="chosenActions.includes(facet.action) ? 'true' : 'false'"
                            :color="chosenActions.includes(facet.action) ? 'primary' : undefined"
                            :variant="chosenActions.includes(facet.action) ? 'flat' : 'tonal'"
                            size="small"
                            label
                            @click="toggleAction(facet.action)"
                        >
                            {{ facet.action }}
                            <span class="mb-history__facetCount">{{ facet.count }}</span>
                        </v-chip>
                        <span v-if="facets.length === 0" class="mb-history__quiet">
                            {{ t("history.noActions", "Nothing has been recorded yet, so there is nothing to filter.") }}
                        </span>
                    </div>

                    <v-btn v-if="activeFilterCount > 0" variant="text" size="small" @click="clearFilters">
                        {{ t("history.clearFilters", "Clear every filter") }}
                    </v-btn>
                </div>

                <v-divider class="my-2" />

                <ul v-if="shown.length > 0" class="mb-history__list">
                    <HistoryRevisionRow
                        v-for="(revision, index) in shown"
                        :key="revision.id"
                        :revision="revision"
                        :current="index === 0 && !outcome.active"
                        :expanded="expanded === revision.id"
                        :diff="diffs[revision.id] ?? null"
                        :diff-error="diffErrors[revision.id] ?? null"
                        :busy="busy"
                        :writable="canWrite"
                        @toggle="toggleDiff"
                        @restore="restore"
                        @label="applyLabel"
                    />
                </ul>

                <p v-else class="mb-history__empty" role="status">
                    {{
                        revisions.length === 0
                            ? t(
                                  "history.emptyHistory",
                                  "Nothing has been recorded for this folder yet. Saving a change records the first revision, or press Record now.",
                              )
                            : t("history.emptyFiltered", "No revision matches these filters.")
                    }}
                </p>

                <p v-if="outcome.revisions.length > shown.length" class="mb-history__quiet">
                    {{
                        t(
                            "history.truncated",
                            { shown: String(shown.length), total: String(outcome.revisions.length) },
                            "Showing the newest {shown} of {total}. Narrow the search or the dates to reach the rest.",
                        )
                    }}
                </p>

                <v-divider class="my-3" />

                <footer class="mb-history__foot">
                    <div class="mb-history__retention">
                        <v-number-input
                            v-model="keep"
                            :label="t('history.keep', 'Revisions to keep')"
                            :min="1"
                            :max="10000"
                            control-variant="stacked"
                            density="compact"
                            variant="outlined"
                            hide-details="auto"
                            class="mb-history__keep"
                        />

                        <ConfigSuperConfirm
                            :title="t('history.trimTitle', 'Remove older revisions')"
                            :action="
                                t(
                                    'history.trimAction',
                                    { drop: String(wouldDrop), keep: String(Math.max(1, keep)) },
                                    'This removes {drop} older revisions for good and keeps the newest {keep}. What is removed cannot be restored afterwards, by this app or by anything else.',
                                )
                            "
                            :affected="trimAffected"
                            :confirm-label="t('history.trimConfirm', 'Slide to remove the older revisions')"
                            :disabled="!canWrite || busy || wouldDrop === 0"
                            @confirm="trimHistory"
                        >
                            <template #activator="{ props: activator }">
                                <v-btn
                                    v-bind="activator"
                                    :prepend-icon="mdiScissorsCutting"
                                    color="error"
                                    variant="text"
                                    size="small"
                                >
                                    {{
                                        wouldDrop === 0
                                            ? t("history.trimNothing", "Nothing to remove")
                                            : t(
                                                  "history.trim",
                                                  { drop: String(wouldDrop) },
                                                  "Remove {drop} older revisions",
                                              )
                                    }}
                                </v-btn>
                            </template>
                        </ConfigSuperConfirm>
                    </div>

                    <p class="mb-history__quiet">
                        {{
                            t(
                                "history.whereItLives",
                                { repository: listing?.repository ?? "" },
                                "Kept in its own repository at {repository}, beside this app's data. Nothing is written into your config folder except by a restore.",
                            )
                        }}
                    </p>
                    <p class="mb-history__quiet">
                        {{
                            listing && listing.remotes.length === 0
                                ? t(
                                      "history.local",
                                      "This history stays on this machine. It has nowhere to send itself and nothing to send it with.",
                                  )
                                : t(
                                      "history.remote",
                                      { remotes: (listing?.remotes ?? []).join(", ") },
                                      "This history has a remote configured ({remotes}). This app never sends anything to it.",
                                  )
                        }}
                    </p>
                    <p v-if="status?.version" class="mb-history__quiet">
                        {{ t("history.gitVersion", { version: status.version }, "Recorded with Git {version}.") }}
                    </p>
                </footer>
            </template>
        </v-card-text>
    </v-card>
</template>

<style>
.mb-history__head {
    display: flex;
    gap: 10px;
    align-items: flex-start;
}

.mb-history__headText {
    flex: 1 1 auto;
    min-width: 0;
}

.mb-history__title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 500;
}

.mb-history__subtitle {
    margin: 2px 0 0;
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-history__progress {
    margin-block-start: 8px;
}

.mb-history__notice {
    margin-block-start: 12px;
}

.mb-history__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-start;
    margin-block-start: 12px;
}

.mb-history__search {
    flex: 1 1 260px;
    min-width: 0;
}

.mb-history__toolbarActions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
}

.mb-history__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-block-start: 10px;
}

.mb-history__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}

.mb-history__facetCount {
    margin-inline-start: 6px;
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
}

/*
 * A flow column with its own bound, so a long history scrolls inside the panel rather than
 * pushing the retention controls off the bottom of it.
 */
.mb-history__list {
    max-height: 60vh;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
}

.mb-history__empty,
.mb-history__inline,
.mb-history__quiet {
    margin: 8px 0 0;
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-history__foot {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.mb-history__retention {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
}

.mb-history__keep {
    flex: 0 1 170px;
}
</style>
