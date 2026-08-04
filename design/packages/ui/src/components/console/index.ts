/**
 * The render console.
 *
 * Mount {@link RenderConsole} with the lines a run has collected, how many the cap has
 * dropped, and the cap itself. It owns its own search (with the anchored regex builder
 * every search surface in this app carries), its own level filter, its own sticky-scroll
 * behaviour and its own copy and export.
 *
 * The two modules beside it are pure and are exported for the surfaces that build the
 * lines rather than render them: `consoleModel.ts` decides what a line is, how many are
 * kept and when the view follows, and `annotations.ts` holds the table of engine output
 * this app has something useful to say about.
 */

export { default as RenderConsole } from "./RenderConsole.vue";

export { ANNOTATION_RULES, annotationsFor, createAnnotator } from "./annotations.js";
export type {
    AnnotationKind,
    AnnotationRule,
    AnnotationTone,
    Annotator,
    ConsoleAnnotation,
    ConsoleText,
} from "./annotations.js";

export {
    CONSOLE_LEVELS,
    CONSOLE_LINE_CAP,
    LEVEL_TAGS,
    STICK_THRESHOLD_PX,
    appendLine,
    clockText,
    consoleText,
    countByLevel,
    describeSlice,
    distanceFromBottom,
    isAtBottom,
    normaliseLevel,
    selectRows,
} from "./consoleModel.js";
export type {
    AppendResult,
    ConsoleLevel,
    ConsoleLine,
    ConsoleRow,
    ScrollMetrics,
    SliceSummary,
} from "./consoleModel.js";
