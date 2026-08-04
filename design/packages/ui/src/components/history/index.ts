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

export { default as HistoryPanel } from "./HistoryPanel.vue";
export { default as HistoryRevisionRow } from "./HistoryRevisionRow.vue";

export {
    ACTION_ORDER,
    historyHostFromBridge,
    provideHistoryHost,
    useHistoryHost,
    type HistoryChangeStatus,
    type HistoryDiffFile,
    type HistoryDiffResult,
    type HistoryFileChange,
    type HistoryFilesResult,
    type HistoryHost,
    type HistoryListing,
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
    exportRevisions,
    filterRevisions,
    historySpan,
    revisionDay,
    searchCorpus,
    type ActionFacet,
    type ExportFormat,
    type ExportLabels,
    type FilterOutcome,
    type HistoryFilter,
} from "./historyModel.js";
