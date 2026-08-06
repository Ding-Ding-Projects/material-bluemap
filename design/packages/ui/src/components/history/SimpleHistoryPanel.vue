<script setup lang="ts">
import { computed, onMounted, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { mdiDownload, mdiFilterVariant, mdiRefresh, mdiScissorsCutting } from "@mdi/js";
import { VAlert, VBtn, VChip, VMenu, VNumberInput, VProgressCircular } from "vuetify/components";

import ChangelogDateFilter from "../changelog/ChangelogDateFilter.vue";
import { type DayKey } from "../changelog/changelogDates.js";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import MenuSearchList, { type MenuSearchItem } from "../menuSearch/MenuSearchList.vue";
import { raiseNotice } from "../../stores/notices.js";
import HistoryRevisionRow from "./HistoryRevisionRow.vue";
import {
    EXPORT_EXTENSIONS,
    actionFacets,
    daysWithRevisions,
    exportRevisions,
    filterRevisions,
    historySpan,
    searchCorpus,
    type ExportFormat,
} from "./historyModel.js";
import type { SimpleHistoryHost } from "./simpleHistoryHost.js";

/**
 * Browse, filter and restore for a history that offers only that: the profile list's and the
 * application settings' own, per `main/profiles/ipc.ts` and `main/settings/ipc.ts`.
 *
 * ### A sibling of `SimpleHistoryList.vue`, not a change to it
 *
 * `SimpleHistoryList.vue` is also mounted by `ProjectEditor.vue`'s own History tab, wired to a
 * world's project history - a surface a separate, concurrent piece of work is extending into a
 * project-autosave history with its own search and date requirements already in its brief.
 * Changing the file both surfaces share would land this change on top of that one rather than
 * beside it. So the filtering below lives in a component of its own: same host contract, same
 * row, same restore-in-place gate as `SimpleHistoryList.vue`, with a search bar and a date range
 * added on top. `ProjectEditor.vue` and `SimpleHistoryList.vue` are untouched by this file.
 *
 * `historyModel.ts`'s filter functions are shared with `HistoryPanel.vue` regardless of which
 * component calls them - they take a plain `HistoryRevision[]` and know nothing about which host
 * produced it - so reusing them here is a second *caller*, not a second implementation that could
 * quietly stop matching the first.
 *
 * `HistoryPanel.vue`'s comparing-two-revisions and restoring-one-file/one-setting extras stay
 * absent, because neither exists on the other side of {@link SimpleHistoryHost} yet
 * (`docs/config-history.md` names them as config-folder history's own extras). Offering them
 * here would be offering buttons that throw the moment they are pressed.
 *
 * Retention is different: {@link SimpleHistoryHost.discardOlderRevisions} is optional and
 * probed the same way every other extra on this project's host contracts is, so the trim
 * control below appears only once the bridge genuinely has it, and export needs nothing from
 * the host at all - it only formats the revisions already on screen, exactly as
 * `HistoryPanel.vue`'s own export does.
 */
const props = defineProps<{
    /** What this history is of, e.g. "Server profiles". Shown as the section's own heading. */
    title: string;
    /**
     * Left out, the shell's bridge is probed for the given namespace; `null` says there is
     * deliberately none - a browser tab, or a test - and the surface says so rather than
     * pretending a control it cannot honour.
     */
    host: SimpleHistoryHost | null;
}>();

const { t } = useI18n();

type Revision = Awaited<ReturnType<SimpleHistoryHost["list"]>>["revisions"][number];

/** Unique per mounted instance, so two panels (profiles, application settings) never collide. */
const filtersId = `mb-simple-history-filters-${useId()}`;

const loading = ref(true);
const available = ref(true);
const reason = ref<string | null>(null);
const repository = ref("");
const revisions = ref<readonly Revision[]>([]);
const expandedId = ref<string | null>(null);
const busy = ref(false);
const restoreMessage = ref<string | null>(null);
const restoreFailed = ref(false);

/**
 * Never fetched: this host offers no diff channel at all, so every row is told so rather
 * than left spinning on a comparison that will never arrive. `HistoryRevisionRow`'s
 * "reading what changed" spinner only shows while `diff` is null and no `diffError` is
 * given; supplying this unconditionally is what keeps that spinner from running forever.
 */
const diffUnavailable = () =>
    t(
        "history.simple.diffUnavailable",
        "This history does not keep a comparison between revisions, only the list of files each one touched.",
    );

async function load(): Promise<void> {
    if (props.host === null) {
        loading.value = false;
        available.value = false;
        reason.value = null;
        return;
    }
    loading.value = true;
    try {
        const listing = await props.host.list();
        available.value = listing.available;
        reason.value = listing.reason;
        repository.value = listing.repository;
        revisions.value = listing.revisions;
    } finally {
        loading.value = false;
    }
}

onMounted(() => {
    void load();
});

function toggle(id: string): void {
    expandedId.value = expandedId.value === id ? null : id;
}

async function restore(id: string): Promise<void> {
    if (props.host === null || busy.value) return;
    busy.value = true;
    restoreMessage.value = null;
    restoreFailed.value = false;
    try {
        const result = await props.host.restore(id);
        restoreMessage.value = result.message;
        restoreFailed.value = !result.ok;
        if (result.ok) await load();
    } finally {
        busy.value = false;
    }
}

defineExpose({ reload: load });

/* -------------------------------------------------------------------------- */
/* Search, date range and action - the three filters, composed                */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regex = ref(false);
const flags = ref("i");
const from = ref<DayKey | null>(null);
const to = ref<DayKey | null>(null);
const chosenActions = ref<string[]>([]);

/**
 * Starts collapsed, the same as `HistoryPanel.vue`'s own filter row: it describes the
 * collection rather than changing it until somebody opens it, and the badge on the toggle is
 * what keeps a collapsed row from hiding an active filter silently.
 */
const filtersOpen = ref(false);

/** The revision that is on disk right now, taken from the whole (unfiltered) list. */
const liveId = computed(() => revisions.value[0]?.id ?? null);

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

const shown = computed(() => outcome.value.revisions);

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
/* Retention (optional - only offered when the host really has it)            */
/* -------------------------------------------------------------------------- */

const keep = ref(20);

/** Against every revision, not the filtered view - trimming keeps the newest, full stop. */
const wouldDrop = computed(() => Math.max(0, revisions.value.length - Math.max(1, keep.value)));

const trimAffected = computed(() =>
    revisions.value.slice(Math.max(1, keep.value)).slice(0, 8).map((revision) => `${revision.shortId}  ${revision.label}`),
);

async function trimHistory(): Promise<void> {
    const current = props.host;
    if (current === null || current.discardOlderRevisions === undefined || busy.value) return;

    busy.value = true;
    try {
        const written = await current.discardOlderRevisions(Math.max(1, keep.value));
        raiseNotice(written.ok ? "success" : "error", written.message);
        if (written.ok) await load();
    } finally {
        busy.value = false;
    }
}

/* -------------------------------------------------------------------------- */
/* Export (client-side: formats the filtered revisions already on screen)     */
/* -------------------------------------------------------------------------- */

const exportOpen = ref(false);

const exportItems = computed<MenuSearchItem[]>(() => [
    { id: "markdown", label: t("history.exportMarkdown", "Markdown file") },
    { id: "json", label: t("history.exportJson", "JSON file") },
    { id: "csv", label: t("history.exportCsv", "CSV file") },
    { id: "text", label: t("history.exportPlain", "Plain text file") },
]);

function exportText(format: ExportFormat): string {
    return exportRevisions(shown.value, format, {
        title: props.title,
        folder: repository.value,
        repository: repository.value,
        range:
            activeFilterCount.value > 0
                ? t(
                      "history.exportFiltered",
                      { kept: String(shown.value.length), total: String(revisions.value.length) },
                      "This file holds {kept} of {total} revisions, filtered the same way the screen was.",
                  )
                : t("history.exportAll", "This file holds every revision recorded for this folder."),
        empty: t("history.exportEmpty", "Nothing matched these filters."),
    });
}

function slug(text: string): string {
    return text.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "") || "history";
}

function download(format: ExportFormat): void {
    const name = `${slug(props.title)}-history.${EXPORT_EXTENSIONS[format]}`;
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

function chooseExport(id: string): void {
    exportOpen.value = false;
    download(id as ExportFormat);
}
</script>

<template>
    <section class="mb-simple-history" :aria-label="title">
        <div class="mb-simple-history__head">
            <h4 class="mb-simple-history__title">{{ title }}</h4>
            <div class="mb-simple-history__headActions">
                <v-btn
                    v-if="available && revisions.length > 0"
                    :prepend-icon="mdiDownload"
                    variant="text"
                    size="small"
                    :aria-label="t('history.exportView', 'Export what is on screen to a file')"
                    :aria-expanded="exportOpen ? 'true' : 'false'"
                    aria-haspopup="menu"
                >
                    {{ t("history.export", "Export") }}
                    <v-menu v-model="exportOpen" activator="parent" :close-on-content-click="false" location="bottom end">
                        <MenuSearchList
                            v-if="exportOpen"
                            :items="exportItems"
                            :label="t('history.exportView', 'Export what is on screen to a file')"
                            @choose="chooseExport"
                        />
                    </v-menu>
                </v-btn>
                <v-btn
                    :prepend-icon="mdiRefresh"
                    :aria-label="t('history.simple.refresh', { title }, 'Read {title} history again')"
                    variant="text"
                    size="small"
                    :disabled="loading || host === null"
                    @click="load"
                >
                    {{ t("history.simple.refreshShort", "Refresh") }}
                </v-btn>
            </div>
        </div>

        <p v-if="host === null" class="mb-simple-history__note">
            {{
                t(
                    "history.noHost",
                    "This build has no version history, because it is running without the desktop shell that keeps one.",
                )
            }}
        </p>

        <div v-else-if="loading" class="mb-simple-history__loading" role="status" aria-live="polite">
            <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
            <span>{{ t("history.simple.loading", "Reading the history...") }}</span>
        </div>

        <p v-else-if="!available" class="mb-simple-history__note" role="status">
            {{ reason ?? t("history.simple.unavailable", "This history is not available right now.") }}
        </p>

        <template v-else>
            <p class="mb-simple-history__repository">{{ repository }}</p>

            <v-alert
                v-if="restoreMessage"
                :type="restoreFailed ? 'error' : 'success'"
                density="compact"
                variant="tonal"
                class="mb-simple-history__alert"
                role="status"
            >
                {{ restoreMessage }}
            </v-alert>

            <p v-if="revisions.length === 0" class="mb-simple-history__note">
                {{
                    t(
                        "history.simple.empty",
                        "No revisions recorded yet. One is kept every time this is saved.",
                    )
                }}
            </p>

            <template v-else>
                <div class="mb-simple-history__toolbar">
                    <ConfigSearchField
                        v-model="query"
                        v-model:regex="regex"
                        v-model:flags="flags"
                        :label="t('history.search', 'Search this history')"
                        :placeholder="t('history.simple.searchHint', 'A label, an action, a revision')"
                        :sample="sample"
                        :summary="summary"
                        density="compact"
                        class="mb-simple-history__search"
                    />

                    <v-btn
                        :prepend-icon="mdiFilterVariant"
                        variant="text"
                        size="small"
                        :aria-expanded="filtersOpen ? 'true' : 'false'"
                        :aria-controls="filtersId"
                        @click="filtersOpen = !filtersOpen"
                    >
                        {{ t("history.filters", "Filters") }}
                        <v-chip v-if="activeFilterCount > 0" size="x-small" class="ms-1" label>
                            {{ activeFilterCount }}
                        </v-chip>
                    </v-btn>
                </div>

                <div v-show="filtersOpen" :id="filtersId" class="mb-simple-history__filters">
                    <ChangelogDateFilter
                        v-model:from="from"
                        v-model:to="to"
                        :earliest="span.earliest"
                        :latest="span.latest"
                        :days-with-entries="markedDays"
                    />

                    <div
                        v-if="facets.length > 0"
                        class="mb-simple-history__actions"
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
                            <span class="mb-simple-history__facetCount">{{ facet.count }}</span>
                        </v-chip>
                    </div>

                    <v-btn v-if="activeFilterCount > 0" variant="text" size="small" @click="clearFilters">
                        {{ t("history.clearFilters", "Clear every filter") }}
                    </v-btn>
                </div>

                <p v-if="shown.length === 0" class="mb-simple-history__note" role="status">
                    {{ t("history.emptyFiltered", "No revision matches these filters.") }}
                </p>

                <ul v-else class="mb-simple-history__list">
                    <HistoryRevisionRow
                        v-for="(revision, index) in shown"
                        :key="revision.id"
                        :revision="revision"
                        :current="revision.id === liveId"
                        :active="index === 0"
                        :expanded="expandedId === revision.id"
                        :diff="null"
                        :diff-error="diffUnavailable()"
                        :busy="busy"
                        :writable="true"
                        :labellable="false"
                        :comparable="false"
                        :selective="false"
                        @toggle="toggle"
                        @restore="restore"
                    />
                </ul>
            </template>

            <div v-if="host !== null && host.discardOlderRevisions !== undefined" class="mb-simple-history__retention">
                <v-number-input
                    v-model="keep"
                    :label="t('history.keep', 'Revisions to keep')"
                    :min="1"
                    :max="10000"
                    control-variant="stacked"
                    density="compact"
                    variant="outlined"
                    hide-details="auto"
                    class="mb-simple-history__keep"
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
                    :disabled="busy || wouldDrop === 0"
                    @confirm="trimHistory"
                >
                    <template #activator="{ props: activator }">
                        <v-btn v-bind="activator" :prepend-icon="mdiScissorsCutting" color="error" variant="text" size="small">
                            {{
                                wouldDrop === 0
                                    ? t("history.trimNothing", "Nothing to remove")
                                    : t("history.trim", { drop: String(wouldDrop) }, "Remove {drop} older revisions")
                            }}
                        </v-btn>
                    </template>
                </ConfigSuperConfirm>
            </div>
        </template>
    </section>
</template>

<style>
.mb-simple-history {
    margin-block-end: 20px;
}

.mb-simple-history__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-simple-history__headActions {
    display: flex;
    align-items: center;
    gap: 4px;
}

.mb-simple-history__title {
    font-size: 0.9375rem;
    font-weight: 500;
    margin: 0;
}

.mb-simple-history__note,
.mb-simple-history__repository {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    margin: 4px 0 0;
}

.mb-simple-history__repository {
    font-family: "Roboto Mono", ui-monospace, monospace;
    word-break: break-all;
}

.mb-simple-history__loading {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-block-start: 8px;
    font-size: 0.8125rem;
}

.mb-simple-history__alert {
    margin-block-start: 8px;
}

.mb-simple-history__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-start;
    margin-block-start: 10px;
}

.mb-simple-history__search {
    flex: 1 1 220px;
    min-width: 0;
}

.mb-simple-history__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-block-start: 8px;
}

.mb-simple-history__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}

.mb-simple-history__facetCount {
    margin-inline-start: 6px;
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
}

.mb-simple-history__list {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
    max-height: 360px;
    overflow-y: auto;
}

.mb-simple-history__retention {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-block-start: 12px;
}

.mb-simple-history__keep {
    max-width: 160px;
}
</style>
