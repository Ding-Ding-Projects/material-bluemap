/**
 * The search module: one regex builder, and every search surface on the site.
 *
 * Styles live in `./search.css`. Import it once from the site entry, or `@import` it from the
 * site's global stylesheet, so the search surfaces are themed:
 *
 *     import "./search/search.css";
 *
 * Wiring, in the order a page usually does it:
 *
 *     import { mountDocsSearch } from "./search/index.js";
 *     const view = mountDocsSearch(container, { host: myDocsHost });
 *
 * `contract.ts` defines what a host must provide. The search module reads through those interfaces
 * and never reaches into the tabs, settings or documentation modules directly.
 *
 * What is guaranteed here:
 *
 *   - plain text search is the default on every field, and regex is an explicit opt in;
 *   - every field owns its own model and its own anchored builder, so no two fields share state;
 *   - visitor-written patterns are only ever matched inside a worker with a deadline, so a pattern
 *     that backtracks forever costs a terminated worker and not a frozen page;
 *   - queries, patterns and sample text are never transmitted, logged or stored. Only the search
 *     mode, the flags and whether the options row was left open are remembered, and
 *     `resetSearchPreferences()` clears all of that.
 */

export type {
    DocsSearchHost,
    SearchableArticle,
    SearchableSetting,
    SearchableTab,
    SearchableTabGroup,
    SearchableTabStrip,
    SettingsSearchHost,
    TabCloseReport,
    TabExclusionReason,
    TabSearchHost,
} from "./contract.js";

export {
    REGEX_LIMITS,
    REGEX_TIMEOUT_MS,
    SUPPORTED_FLAGS,
    createRegexEngine,
    escapeRegExp,
    findBacktrackingRisk,
    regexEngine,
} from "./engine.js";
export type {
    CandidateHit,
    RegexEngine,
    RegexEngineLimits,
    RegexFilterResult,
    RegexMatch,
    RegexRunResult,
    SupportedFlag,
} from "./engine.js";

export { BoundedRegexEvaluator, setSharedRegexEvaluator, sharedRegexEvaluator } from "./evaluator.js";
export type { EvaluationOutcome, FilterOutcome, RunOutcome } from "./evaluator.js";

export { buildRegexWorkerSource, createInProcessChannel, createWorkerChannel } from "./workerChannel.js";
export type { RegexChannel, RegexRequest, RegexResponse } from "./workerChannel.js";

export { SearchQueryModel } from "./queryModel.js";
export type {
    EffectiveQuery,
    SearchMode,
    SearchQuerySnapshot,
    SearchValidation,
    ValidationStatus,
} from "./queryModel.js";

export {
    MAX_SPANS_PER_VALUE,
    createPlainTextMatcher,
    excerptAround,
    toHighlightRuns,
} from "./predicate.js";
export type { Excerpt, HighlightRun, MatchSpan, PlainTextMatcher } from "./predicate.js";

export { buildCandidateIndex, resolveHits, runSearch } from "./runSearch.js";
export type { CandidateField, CandidateIndex, ResolvedHit, SearchOutcome } from "./runSearch.js";

export {
    GROUP_FIELDS,
    TAB_FIELDS,
    countExclusions,
    partitionTabs,
    planBulkClose,
    tabsInGroup,
    tabsInStrip,
} from "./tabMatching.js";
export type {
    BulkCloseExclusion,
    BulkCloseOptions,
    BulkClosePlan,
    GroupField,
    TabField,
    TabPartition,
} from "./tabMatching.js";

export {
    browserPreferenceStore,
    memoryPreferenceStore,
    resetSearchPreferences,
    searchPreferenceStore,
    setSearchPreferenceStore,
} from "./preferences.js";
export type { SearchPreferenceStore, StoredFieldPreference } from "./preferences.js";

export { label, localeTag, onSearchLocaleChange, phrase, searchLocale, secondaryPhrase, setSearchLocale } from "./strings.js";
export type { FunnyLevel, LanguageMode, SearchLocale, SearchStringKey } from "./strings.js";

export { AnchoredPanel } from "./anchoredPanel.js";
export { createBuilderController, createRegexBuilder } from "./builderPanel.js";
export type { RegexBuilderOptions, RegexBuilderView } from "./builderPanel.js";

export { createSearchField } from "./searchField.js";
export type { SearchFieldOptions, SearchFieldView } from "./searchField.js";

export { attachRegexBuilder } from "./attachBuilder.js";
export type { AttachRegexBuilderOptions, AttachedBuilder, AttachedMode, AttachedSpec } from "./attachBuilder.js";

export { createSearchSurface, highlightedText, metaChip } from "./searchSurface.js";
export type { SearchSurfaceOptions, SearchSurfaceView, SurfaceResult } from "./searchSurface.js";

export { createDocsSearch, mountDocsSearch } from "./docsSearch.js";
export type { DocsSearchOptions } from "./docsSearch.js";

export { createSettingsSearch, mountSettingsSearch } from "./settingsSearch.js";
export type { SettingsSearchOptions } from "./settingsSearch.js";

export {
    createBulkCloseAction,
    createBulkCloseControls,
    createMasterTabSearch,
    createTabGroupNameSearch,
    createTabGroupSearch,
    createTabStripSearch,
} from "./tabSearch.js";
export type { BulkCloseActionOptions, BulkCloseActionView, TabSearchOptions } from "./tabSearch.js";
