/**
 * The version-history panel for a BlueMap config folder.
 *
 * ```vue
 * <script setup lang="ts">
 * import { HistoryPanel } from "./components/history/index.js";
 * </script>
 *
 * <template>
 *     <HistoryPanel :folder="workspace.folder" />
 * </template>
 * ```
 *
 * The panel finds the desktop shell's bridge by itself and says so plainly when there is
 * none, so it can be mounted unconditionally. Pass `host` to hand it a stand-in, which is
 * what the tests do.
 *
 * Anything that saves a config folder should also call the host's `snapshot(folder)`
 * afterwards. It costs nothing when nothing changed, it never rejects, and its failure is
 * a value nobody has to act on - a broken history must never become a broken save.
 */

export { default as HistoryComparison } from "./HistoryComparison.vue";
export { default as HistoryPanel } from "./HistoryPanel.vue";
export { default as HistoryReadableDiff } from "./HistoryReadableDiff.vue";
export { default as HistoryRevisionRow } from "./HistoryRevisionRow.vue";
export { default as SimpleHistoryList } from "./SimpleHistoryList.vue";
export { default as SimpleHistoryPanel } from "./SimpleHistoryPanel.vue";

export {
    simpleHistoryHostFrom,
    type SimpleHistoryHost,
    type SimpleHistoryListing,
} from "./simpleHistoryHost.js";

export {
    ACTION_ORDER,
    historyHostFromBridge,
    provideHistoryHost,
    useHistoryHost,
    type HistoryChangeStatus,
    type HistoryCompareResult,
    type HistoryComparisonFile,
    type HistoryDiffFile,
    type HistoryDiffResult,
    type HistoryFileChange,
    type HistoryFilesResult,
    type HistoryHost,
    type HistoryListing,
    type HistoryMergedFile,
    type HistoryRestoreResult,
    type HistoryRevision,
    type HistoryRevisionFile,
    type HistorySkippedFile,
    type HistoryStatus,
    type HistoryWrite,
    type KnownHistoryAction,
} from "./historyHost.js";

export {
    EXPORT_EXTENSIONS,
    EXPORT_FORMATS,
    actionFacets,
    daysWithRevisions,
    exportComparison,
    exportRevisions,
    filterRevisions,
    historySpan,
    revisionDay,
    searchCorpus,
    type ActionFacet,
    type ComparisonExportLabels,
    type ExportFormat,
    type ExportLabels,
    type FilterOutcome,
    type HistoryFilter,
} from "./historyModel.js";

export {
    MAX_LISTED_SETTINGS,
    MAX_READABLE_TEXT,
    MAX_VALUE_LENGTH,
    configFileName,
    diffSettings,
    diffTotals,
    flattenSettings,
    formatOf,
    formatSettingValue,
    readSettings,
    readableDiff,
    readableFileDiff,
    sameValue,
    type ConfigFileKind,
    type ConfigFileName,
    type DiffTotals,
    type ReadOutcome,
    type ReadableFileDiff,
    type ReadableFormat,
    type SettingChange,
    type SettingChangeKind,
    type SettingMap,
} from "./historyDiff.js";

export {
    isAddressableKey,
    mergeSettingsBack,
    settingValueAt,
    type MergePlan,
    type RefusedSetting,
    type SettingSelection,
} from "./historyRestore.js";

export {
    currentRevisionId,
    groupRevisionsByDay,
    revisionCounts,
    type ChangeCounts,
    type TimelineDay,
} from "./historyTimeline.js";
