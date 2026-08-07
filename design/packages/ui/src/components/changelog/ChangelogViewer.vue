<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCalendarRange,
    mdiChevronDown,
    mdiChevronUp,
    mdiContentCopy,
    mdiDownload,
} from "@mdi/js";
import { VBtn, VChip, VDivider, VMenu } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import MenuSearchList, { type MenuSearchItem } from "../menuSearch/MenuSearchList.vue";
import ChangelogDateFilter from "./ChangelogDateFilter.vue";
import ChangelogEntryRow from "./ChangelogEntryRow.vue";
import {
    CHANGELOG_REPOSITORY_URL,
    CHANGELOG_UNRELEASED,
    CHANGELOG_VERSIONS,
} from "./changelogData.generated.js";
import { type DayKey, formatDay } from "./changelogDates.js";
import {
    type ChangelogCategory,
    type ChangelogEntry,
    type ChangelogVersion,
    type ExportLabels,
    changelogSampleText,
    commitUrl,
    dayOf,
    filterChangelog,
    toMarkdown,
    toPlainText,
} from "./changelogModel.js";

/**
 * The in-app changelog: every released version, not only the newest one.
 *
 * The data is generated from this repository's own git history and release tags by
 * `scripts/build-changelog.mjs`, which validates every SHA it emits against `git cat-file` and
 * refuses to write a reference it cannot resolve. Nothing here is written by hand, so nothing
 * here can drift from what actually shipped, and a version that shipped with no changes of its
 * own says exactly that rather than being quietly dropped from the list.
 *
 * ### The two filters compose
 *
 * The search and the date range are combined with "and", never with "whichever was touched
 * last". Both are reported in the count line above the list, so a result that looks surprising
 * can be explained by reading one sentence rather than by clearing controls one at a time to
 * find out which one was doing it. When they leave nothing, the empty state names what was
 * filtering rather than saying "no results" and leaving the reader to guess.
 *
 * ### The search is the app's own
 *
 * `ConfigSearchField` and the regex builder anchored to it, the same pair every other search
 * surface in this app uses. Plain text is the default and stays a case-insensitive substring
 * match; regex is an explicit opt-in; the query, the pattern, the flags and the mode are one
 * piece of state shared by the field and the builder rather than two that can disagree.
 */
const props = withDefaults(
    defineProps<{
        /** Injectable for tests. Defaults to the generated changelog. */
        versions?: readonly ChangelogVersion[];
        unreleased?: readonly ChangelogEntry[];
        repositoryUrl?: string;
    }>(),
    {
        versions: () => CHANGELOG_VERSIONS,
        unreleased: () => CHANGELOG_UNRELEASED,
        repositoryUrl: CHANGELOG_REPOSITORY_URL,
    },
);

const { t, locale } = useI18n();

const localeTag = computed(() => (locale.value === "none" ? "en" : locale.value));

/**
 * The props, normalised once.
 *
 * `exactOptionalPropertyTypes` makes a defaulted optional prop `T | undefined` wherever it is
 * read, and coalescing that at each of a dozen use sites is how one of them ends up coalescing
 * to something different from the rest.
 */
const versions = computed(() => props.versions ?? CHANGELOG_VERSIONS);
const unreleased = computed(() => props.unreleased ?? CHANGELOG_UNRELEASED);
const repository = computed(() => props.repositoryUrl ?? CHANGELOG_REPOSITORY_URL);

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regex = ref(false);
const flags = ref("i");
const from = ref<DayKey | null>(null);
const to = ref<DayKey | null>(null);
const datesOpen = ref(false);

/** The predicate the shared engine builds, so this list filters exactly as settings do. */
const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));

const view = computed(() =>
    filterChangelog(versions.value, unreleased.value, {
        matcher: matcher.value.test,
        from: from.value,
        to: to.value,
        active: matcher.value.active || from.value !== null || to.value !== null,
    }),
);

const sample = computed(() => changelogSampleText(versions.value, unreleased.value));

const allEntries = computed(() => [
    ...unreleased.value,
    ...versions.value.flatMap((version) => [...version.entries]),
]);

const daysWithEntries = computed(() => new Set(allEntries.value.map((entry) => dayOf(entry.date))));

const extent = computed(() => {
    const days = [...daysWithEntries.value].sort();
    return { earliest: days[0] ?? null, latest: days.at(-1) ?? null };
});

const dateActive = computed(() => from.value !== null || to.value !== null);

const dateSummary = computed(() => {
    const start = from.value === null ? null : formatDay(from.value, localeTag.value);
    const end = to.value === null ? null : formatDay(to.value, localeTag.value);
    if (start === null && end === null) return t("changelog.date.any", "Any date");
    if (start !== null && end !== null && start === end) {
        return t("changelog.date.on", { day: start }, "On {day}");
    }
    if (start !== null && end !== null) {
        return t("changelog.date.between", { from: start, to: end }, "{from} to {to}");
    }
    if (start !== null) return t("changelog.date.after", { from: start }, "From {from}");
    return t("changelog.date.before", { to: end }, "Up to {to}");
});

/** The honest count line: what is on screen, out of what exists. */
const countLine = computed(() =>
    t(
        "changelog.showing",
        { shown: view.value.shown, total: view.value.total },
        "Showing {shown} of {total} entries.",
    ),
);

/**
 * What is doing the filtering, in one sentence.
 *
 * Written out even when only one filter is active, because "no matches" with a date range
 * quietly set three minutes ago is the single most confusing state a filtered list can be in.
 */
const filterLine = computed(() => {
    const parts: string[] = [];
    if (matcher.value.active) {
        parts.push(
            regex.value
                ? t("changelog.filterRegex", { pattern: query.value }, "the pattern {pattern}")
                : t("changelog.filterText", { text: query.value }, "the text {text}"),
        );
    }
    if (dateActive.value) {
        parts.push(t("changelog.filterDates", { range: dateSummary.value }, "dates {range}"));
    }
    if (parts.length === 0) return "";
    const joined = parts.join(` ${t("changelog.and", "and")} `);
    return t("changelog.filteredBy", { filters: joined }, "Filtered by {filters}.");
});

function clearFilters(): void {
    query.value = "";
    regex.value = false;
    from.value = null;
    to.value = null;
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Selected SHAs, which the copy and the export honour when there are any.
 *
 * Keyed by SHA rather than by position, so a selection survives the list being re-filtered
 * underneath it: an entry that scrolls out of view because the search narrowed has not been
 * deselected, and it comes back selected when the search widens again.
 */
const selection = ref(new Set<string>());

function toggle(sha: string, on: boolean): void {
    const next = new Set(selection.value);
    if (on) next.add(sha);
    else next.delete(sha);
    selection.value = next;
}

const selectedShown = computed(
    () =>
        [
            ...view.value.unreleasedEntries,
            ...view.value.versions.flatMap((version) => [...version.entries]),
        ].filter((entry) => selection.value.has(entry.sha)).length,
);

function selectShown(): void {
    const next = new Set(selection.value);
    for (const entry of view.value.unreleasedEntries) next.add(entry.sha);
    for (const version of view.value.versions) {
        for (const entry of version.entries) next.add(entry.sha);
    }
    selection.value = next;
}

function clearSelection(): void {
    selection.value = new Set<string>();
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

function categoryLabel(category: ChangelogCategory): string {
    switch (category) {
        case "interface":
            return t("changelog.category.interface", "Interface");
        case "engine":
            return t("changelog.category.engine", "Rendering and world data");
        case "services":
            return t("changelog.category.services", "Server, CLI and configuration");
        case "shell":
            return t("changelog.category.shell", "Desktop shell");
        case "site":
            return t("changelog.category.site", "Landing page and documentation site");
        case "build":
            return t("changelog.category.build", "Build, release and tooling");
        case "docs":
            return t("changelog.category.docs", "Documentation");
        case "other":
            return t("changelog.category.other", "Elsewhere in the repository");
    }
}

function summaryLabel(count: number): string {
    return t(
        "changelog.summaryOf",
        { count },
        "Summary of {count} commits, which are listed here as well",
    );
}

const noChangesLine = computed(() =>
    t(
        "changelog.noChanges",
        "No changes were recorded for this version: its tag points at a commit an earlier release already carried.",
    ),
);

/* -------------------------------------------------------------------------- */
/* Copy and export                                                            */
/* -------------------------------------------------------------------------- */

const notice = ref("");

const copyMenuOpen = ref(false);
const exportMenuOpen = ref(false);

const copyItems = computed<MenuSearchItem[]>(() => [
    { id: "markdown", label: t("changelog.copyMarkdown", "As Markdown") },
    { id: "text", label: t("changelog.copyText", "As plain text") },
]);

const exportFormatItems = computed<MenuSearchItem[]>(() => [
    { id: "markdown", label: t("changelog.exportMarkdown", "Markdown file") },
    { id: "text", label: t("changelog.exportText", "Plain text file") },
]);

function chooseCopy(id: string): void {
    copyMenuOpen.value = false;
    void copy(id as "markdown" | "text");
}

function chooseExportFormat(id: string): void {
    exportMenuOpen.value = false;
    download(id as "markdown" | "text");
}

/**
 * The line every export opens with, stating exactly which slice of the changelog it holds.
 *
 * A copied changelog leaves this app and is read somewhere with no filter controls in sight, so
 * a file that does not say what was filtered out of it is a file that will eventually be read
 * as the whole record.
 */
const exportRange = computed(() => {
    const scope =
        selection.value.size > 0
            ? t(
                  "changelog.exportSelection",
                  { count: selectedShown.value },
                  "{count} selected entries",
              )
            : t(
                  "changelog.exportShown",
                  { shown: view.value.shown, total: view.value.total },
                  "{shown} of {total} entries",
              );
    const filters =
        filterLine.value === "" ? t("changelog.exportNoFilter", "No filter was applied.") : filterLine.value;
    return t(
        "changelog.exportRange",
        { scope, filters },
        "This file holds {scope}. {filters} Every entry carries the full commit SHA it came from.",
    );
});

const exportLabels = computed<ExportLabels>(() => ({
    title: t("changelog.title", "Changelog"),
    range: exportRange.value,
    unreleased: t("changelog.unreleased", "Unreleased"),
    categories: {
        interface: categoryLabel("interface"),
        engine: categoryLabel("engine"),
        services: categoryLabel("services"),
        shell: categoryLabel("shell"),
        site: categoryLabel("site"),
        build: categoryLabel("build"),
        docs: categoryLabel("docs"),
        other: categoryLabel("other"),
    },
    noChanges: noChangesLine.value,
    summary: summaryLabel,
    noMatches: t("changelog.exportEmpty", "Nothing matched these filters."),
}));

function renderExport(kind: "markdown" | "text"): string {
    const options = {
        repositoryUrl: repository.value,
        labels: exportLabels.value,
        ...(selection.value.size > 0 ? { selection: selection.value } : {}),
    };
    return kind === "markdown" ? toMarkdown(view.value, options) : toPlainText(view.value, options);
}

/**
 * The app's own clipboard channel first, the browser's second.
 *
 * The desktop shell exposes `clipboard:writeText` over the preload bridge and this package also
 * runs in a plain browser tab, so both routes are tried and a failure says so rather than
 * leaving a button that looks like it worked.
 */
async function copy(kind: "markdown" | "text"): Promise<void> {
    const text = renderExport(kind);
    try {
        const bridge = window.worldlens;
        if (bridge) await bridge.writeClipboardText(text);
        else await navigator.clipboard.writeText(text);
        notice.value = t("changelog.copied", "The changelog on screen is on the clipboard.");
    } catch {
        notice.value = t("changelog.copyFailed", "Could not reach the clipboard.");
    }
}

function download(kind: "markdown" | "text"): void {
    const body = renderExport(kind);
    const extension = kind === "markdown" ? "md" : "txt";
    const stamp = from.value === null && to.value === null ? "" : `-${from.value ?? "start"}-to-${to.value ?? "latest"}`;
    const name = `changelog${stamp}.${extension}`;
    const blob = new Blob([body], {
        type: `${kind === "markdown" ? "text/markdown" : "text/plain"};charset=utf-8`,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    notice.value = t("changelog.exported", { name }, "Exported {name}.");
}

/* -------------------------------------------------------------------------- */
/* Rendering helpers                                                          */
/* -------------------------------------------------------------------------- */

function versionUrl(version: ChangelogVersion): string {
    return commitUrl(repository.value, version.commit);
}

function shortOf(version: ChangelogVersion): string {
    return version.commit.slice(0, 10);
}

function dayLabel(iso: string): string {
    return formatDay(dayOf(iso), localeTag.value);
}
</script>

<template>
    <section class="mb-changelog" aria-labelledby="mb-changelog-title">
        <header class="mb-changelog__header">
            <h2 id="mb-changelog-title" class="mb-changelog__title">
                {{ t("changelog.title", "Changelog") }}
            </h2>
            <p class="mb-changelog__lede">
                {{
                    t(
                        "changelog.lede",
                        "Every release this project has published, and the commits that made it. Each entry links the commit it came from, and the list is generated from the repository's own history rather than written by hand.",
                    )
                }}
            </p>
        </header>

        <div class="mb-changelog__controls">
            <ConfigSearchField
                v-model="query"
                v-model:regex="regex"
                v-model:flags="flags"
                :label="t('changelog.search', 'Search the changelog')"
                :placeholder="t('changelog.searchHint', 'Subject, message text or a commit SHA')"
                :sample="sample"
                density="compact"
            />

            <!--
                The date controls collapse, and start collapsed: they describe the list rather
                than being the first thing anybody reaches for, and left open they take more
                room than the entries they filter. The button says what the range is even while
                the panel is shut, so a filter can never be silently in force.
            -->
            <div class="mb-changelog__filterbar">
                <v-btn
                    :prepend-icon="mdiCalendarRange"
                    :append-icon="datesOpen ? mdiChevronUp : mdiChevronDown"
                    :aria-expanded="datesOpen ? 'true' : 'false'"
                    aria-controls="mb-changelog-dates"
                    :color="dateActive ? 'primary' : undefined"
                    variant="text"
                    size="small"
                    @click="datesOpen = !datesOpen"
                >
                    {{ t("changelog.dateFilter", { range: dateSummary }, "Dates: {range}") }}
                </v-btn>

                <v-btn
                    :prepend-icon="mdiContentCopy"
                    :aria-label="t('changelog.copyView', 'Copy what is on screen')"
                    :aria-expanded="copyMenuOpen ? 'true' : 'false'"
                    aria-haspopup="menu"
                    variant="text"
                    size="small"
                >
                    {{ t("changelog.copy", "Copy") }}
                    <v-menu
                        v-model="copyMenuOpen"
                        activator="parent"
                        :close-on-content-click="false"
                        location="bottom end"
                        offset="8"
                    >
                        <!--
                            Gated on `copyMenuOpen` itself so choosing a format unmounts the
                            search field and its query immediately, rather than waiting on
                            the overlay's own close transition to finish.
                        -->
                        <MenuSearchList
                            v-if="copyMenuOpen"
                            :items="copyItems"
                            :label="t('changelog.copy', 'Copy')"
                            @choose="chooseCopy"
                        />
                    </v-menu>
                </v-btn>

                <v-btn
                    :prepend-icon="mdiDownload"
                    :aria-label="t('changelog.exportView', 'Export what is on screen to a file')"
                    :aria-expanded="exportMenuOpen ? 'true' : 'false'"
                    aria-haspopup="menu"
                    variant="text"
                    size="small"
                >
                    {{ t("changelog.export", "Export") }}
                    <v-menu
                        v-model="exportMenuOpen"
                        activator="parent"
                        :close-on-content-click="false"
                        location="bottom end"
                        offset="8"
                    >
                        <MenuSearchList
                            v-if="exportMenuOpen"
                            :items="exportFormatItems"
                            :label="t('changelog.export', 'Export')"
                            @choose="chooseExportFormat"
                        />
                    </v-menu>
                </v-btn>

                <v-btn v-if="view.shown > 0" variant="text" size="small" @click="selectShown">
                    {{ t("changelog.selectShown", "Select all shown") }}
                </v-btn>

                <v-chip v-if="selection.size > 0" size="small" variant="outlined" closable @click:close="clearSelection">
                    {{
                        t(
                            "changelog.selected",
                            { count: selection.size, shown: selectedShown },
                            "{count} selected, {shown} of them on screen",
                        )
                    }}
                </v-chip>
            </div>

            <div v-show="datesOpen" id="mb-changelog-dates" class="mb-changelog__dates">
                <ChangelogDateFilter
                    v-model:from="from"
                    v-model:to="to"
                    :earliest="extent.earliest"
                    :latest="extent.latest"
                    :days-with-entries="daysWithEntries"
                />
            </div>

            <p class="mb-changelog__count" aria-live="polite">
                {{ countLine }}
                <span v-if="filterLine">{{ " " }}{{ filterLine }}</span>
            </p>
            <p v-if="notice" class="mb-changelog__notice" aria-live="polite">{{ notice }}</p>
        </div>

        <p v-if="view.shown === 0 && view.versions.length === 0" class="mb-changelog__empty">
            {{
                filterLine === ""
                    ? t("changelog.noEntries", "This build carries no changelog entries at all.")
                    : t(
                          "changelog.noMatches",
                          { filters: filterLine },
                          "Nothing in the changelog matches. {filters} Widen the dates or clear the search to see the rest.",
                      )
            }}
            <v-btn v-if="filterLine !== ''" class="mb-changelog__clear" variant="tonal" size="small" @click="clearFilters">
                {{ t("changelog.clearFilters", "Clear the filters") }}
            </v-btn>
        </p>

        <template v-else>
            <article v-if="view.unreleasedEntries.length > 0" class="mb-changelog__version">
                <h3 class="mb-changelog__version-title">{{ t("changelog.unreleased", "Unreleased") }}</h3>
                <p class="mb-changelog__version-meta">
                    {{
                        t(
                            "changelog.unreleasedMeta",
                            "Committed to the repository, not yet carried by a published release.",
                        )
                    }}
                </p>
                <template v-for="section in view.unreleased" :key="section.category">
                    <h4 class="mb-changelog__section">{{ categoryLabel(section.category) }}</h4>
                    <ul class="mb-changelog__entries">
                        <ChangelogEntryRow
                            v-for="entry in section.entries"
                            :key="entry.sha"
                            :entry="entry"
                            :selected="selection.has(entry.sha)"
                            :repository-url="repository"
                            :summary-label="entry.summarizes === undefined ? '' : summaryLabel(entry.summarizes)"
                            @update:selected="(on: boolean) => toggle(entry.sha, on)"
                        />
                    </ul>
                </template>
            </article>

            <article v-for="version in view.versions" :key="version.version.tag" class="mb-changelog__version">
                <h3 class="mb-changelog__version-title">
                    {{ version.version.version }}
                    <span class="mb-changelog__version-date">{{ dayLabel(version.version.date) }}</span>
                </h3>
                <p class="mb-changelog__version-meta">
                    {{ t("changelog.taggedAt", "Tagged at") }}
                    <a
                        class="mb-changelog__sha"
                        :href="versionUrl(version.version)"
                        target="_blank"
                        rel="noopener noreferrer"
                        :aria-label="t('changelog.openCommit', { sha: version.version.commit }, 'Open commit {sha}')"
                        >{{ shortOf(version.version) }}</a
                    >
                </p>

                <p v-if="version.empty" class="mb-changelog__none">{{ noChangesLine }}</p>

                <template v-for="section in version.sections" :key="section.category">
                    <h4 class="mb-changelog__section">{{ categoryLabel(section.category) }}</h4>
                    <ul class="mb-changelog__entries">
                        <ChangelogEntryRow
                            v-for="entry in section.entries"
                            :key="entry.sha"
                            :entry="entry"
                            :selected="selection.has(entry.sha)"
                            :repository-url="repository"
                            :summary-label="entry.summarizes === undefined ? '' : summaryLabel(entry.summarizes)"
                            @update:selected="(on: boolean) => toggle(entry.sha, on)"
                        />
                    </ul>
                </template>
                <v-divider class="mb-changelog__rule" />
            </article>
        </template>
    </section>
</template>

<style>
.mb-changelog {
    padding: 8px 16px 16px;
}

.mb-changelog__title {
    font-size: 1.125rem;
    font-weight: 500;
    margin-block: 4px 2px;
}

.mb-changelog__lede,
.mb-changelog__count,
.mb-changelog__notice,
.mb-changelog__version-meta {
    font-size: 0.75rem;
    line-height: 1.45;
    margin-block: 2px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-changelog__controls {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-block: 8px;
}

.mb-changelog__filterbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
}

.mb-changelog__dates {
    padding: 4px 0;
}

.mb-changelog__empty {
    padding: 12px 0;
    font-size: 0.875rem;
}

.mb-changelog__clear {
    margin-inline-start: 8px;
}

.mb-changelog__version {
    margin-block-start: 14px;
}

.mb-changelog__version-title {
    font-size: 1rem;
    font-weight: 500;
    margin-block: 0 2px;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
}

.mb-changelog__version-date {
    font-size: 0.75rem;
    font-weight: 400;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-changelog__section {
    font-size: 0.8125rem;
    font-weight: 500;
    margin-block: 10px 2px;
}

.mb-changelog__entries {
    list-style: none;
    margin: 0;
    padding: 0;
}

.mb-changelog__entry {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    padding-block: 2px;
}

.mb-changelog__entry-body {
    min-width: 0;
    flex: 1 1 auto;
}

.mb-changelog__subject {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.4;
    overflow-wrap: anywhere;
}

.mb-changelog__meta {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-changelog__sha {
    font-family: "Roboto Mono", ui-monospace, monospace;
    color: rgb(var(--v-theme-primary));
}

.mb-changelog__none {
    margin-block: 6px;
    font-size: 0.8125rem;
    font-style: italic;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-changelog__details {
    margin-block-start: 4px;
}

.mb-changelog__details summary {
    font-size: 0.6875rem;
    cursor: pointer;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-changelog__details pre {
    margin-block: 4px;
    padding: 8px;
    border-radius: 8px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    line-height: 1.5;
    /* Long bilingual bodies wrap rather than forcing the whole page sideways. */
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 22em;
    overflow-y: auto;
}

.mb-changelog__rule {
    margin-block-start: 12px;
}
</style>
