/**
 * The in-app changelog.
 *
 * Mount {@link ChangelogViewer} anywhere a reader would look for "what changed" - this port's
 * About surface is the intended home. It needs no props: the data is compiled in from
 * `./changelogData.generated.ts`, which `scripts/build-changelog.mjs` generates from this repository's
 * git history and release tags and validates against `git cat-file` before writing. The props
 * exist so a test can mount the viewer over a fixture instead of over 86 real commits.
 *
 * Everything else is exported for tests and for anything that wants to render the same record
 * somewhere else: the filters and the export renderers are pure functions over the data, and
 * the date helpers are the parser and the calendar layout the date filter is built from.
 */

export { default as ChangelogViewer } from "./ChangelogViewer.vue";
export { default as ChangelogDateFilter } from "./ChangelogDateFilter.vue";
export { default as ChangelogEntryRow } from "./ChangelogEntryRow.vue";

export {
    CHANGELOG_REPOSITORY_URL,
    CHANGELOG_UNRELEASED,
    CHANGELOG_VERSIONS,
} from "./changelogData.generated.js";

export {
    CHANGELOG_CATEGORIES,
    changelogSampleText,
    commitUrl,
    dayOf,
    entryMatches,
    entrySearchText,
    filterChangelog,
    toMarkdown,
    toPlainText,
} from "./changelogModel.js";
export type {
    ChangelogCategory,
    ChangelogEntry,
    ChangelogFilter,
    ChangelogSection,
    ChangelogVersion,
    ExportLabels,
    ExportOptions,
    FilteredChangelog,
    FilteredVersion,
} from "./changelogModel.js";

export {
    DAY_KEY,
    PRESET_IDS,
    dayInputHint,
    dayKey,
    daysInMonth,
    formatDay,
    inRange,
    isDayKey,
    isRealDate,
    localeDateOrder,
    monthGrid,
    monthLabels,
    orderRange,
    parseDayInput,
    presetRange,
    shiftDays,
    shiftMonths,
    todayKey,
    weekStart,
    weekdayLabels,
} from "./changelogDates.js";
export type { CalendarDay, DayKey, DayParse, DayParseError, DayRange, PresetId } from "./changelogDates.js";
