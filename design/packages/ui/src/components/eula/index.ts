/**
 * Mojang's EULA, readable inside the application.
 *
 * {@link EulaViewer} is the whole feature and is embeddable anywhere: the first-run
 * licence step and the consent settings row both mount it directly.
 * {@link EulaSurface} is the same viewer as a docked panel the user can place, for a
 * shell that wants to open it on its own.
 *
 * The pure modules are exported because they are where the guarantees live: the sections
 * are contiguous ranges over the document rather than copies of its text, and
 * {@link sectionsCoverText} is the checkable statement of that.
 */

export { default as EulaViewer } from "./EulaViewer.vue";
export { default as EulaSurface } from "./EulaSurface.vue";
export { default as EulaSectionPanel } from "./EulaSectionPanel.vue";

export {
    FALLBACK_TEXT,
    createEulaController,
    formatFetchedAt,
    interpretResult,
    resolveEulaBridge,
    unavailableState,
} from "./eulaBridge.js";
export type {
    EulaBridge,
    EulaController,
    EulaControllerOptions,
    EulaDocumentLike,
    EulaLoadResultLike,
    EulaState,
    EulaTextSource,
} from "./eulaBridge.js";

export {
    EULA_EXPORT_FORMATS,
    exportEula,
    exportFilename,
    exportHeaderLines,
} from "./eulaExport.js";
export type { EulaExportContext, EulaExportFormat } from "./eulaExport.js";

export {
    EULA_CATEGORIES,
    categoriseBlock,
    categoriseEula,
    isEulaCategory,
    looksLikeHeading,
    sectionParagraphs,
    sectionPreview,
    sectionText,
    sectionsCoverText,
    splitBlocks,
} from "./eulaSections.js";
export type { EulaBlock, EulaCategory, EulaSection } from "./eulaSections.js";

export { MAX_HIGHLIGHTS, highlightRuns, reportSectionMatches, runsPreserve } from "./eulaSearch.js";
export type { SectionMatchReport, TextRun } from "./eulaSearch.js";

export {
    EULA_TAB_STORAGE_VERSION,
    readEulaStrip,
    reconcileEulaStrip,
    seedEulaStrip,
    writeEulaStrip,
} from "./eulaStorage.js";
export type { EulaTabStorage } from "./eulaStorage.js";
