/**
 * The console's model: what a line is, how many are kept, what is on screen, and when
 * the view is allowed to follow the newest one.
 *
 * All of it is pure. The component that renders the console owns a scroll container, a
 * clipboard and a translator, and none of those can be reasoned about in a unit test;
 * the decisions that actually go wrong here can. Whether the view should stick to the
 * bottom is arithmetic over three numbers. Whether the ring dropped a line is arithmetic
 * over a length. Both are separated out for that reason rather than for tidiness.
 */

import type { ConsoleAnnotation, ConsoleText } from "./annotations.js";

/* -------------------------------------------------------------------------- */
/* Levels                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What a line can be.
 *
 * `error`, `warning`, `info` and `debug` are exactly the four `PrintStreamLogger` can
 * print, so nothing is invented for the engine's own output. `signal` is this app
 * narrating its own state (starting, running, stopping, stopped), and `tip` exists so
 * the advice beside a line is coloured from the same palette as the line itself rather
 * than from a second one that has to be kept in step with it.
 */
export type ConsoleLevel = "error" | "warning" | "info" | "debug" | "signal" | "tip";

/** Every level, in the order the filter offers them: loudest first. */
export const CONSOLE_LEVELS: readonly ConsoleLevel[] = ["error", "warning", "info", "debug", "signal", "tip"];

/**
 * The short tag printed beside every line.
 *
 * This is what makes the colouring non-decorative. A reader who cannot distinguish the
 * colours, or who has copied the log into a text file, still sees which level each line
 * is, because the level is written down. Colour alone would make the most important
 * distinction in the console invisible to a substantial number of the people using it.
 *
 * Deliberately not translated. It is an identifier printed by the engine's own logger,
 * it is what a person searching upstream's issues will be looking for, and it has to
 * line up in a fixed-width column at every language setting.
 */
export const LEVEL_TAGS: Readonly<Record<ConsoleLevel, string>> = {
    error: "ERROR",
    warning: "WARN",
    info: "INFO",
    debug: "DEBUG",
    signal: "SIGNAL",
    tip: "TIP",
};

/**
 * The level a raw string means.
 *
 * The engine sends `INFO`, `WARNING`, `ERROR` and `DEBUG` in upper case, and the bridge
 * types the field as a plain `string`, so a build whose preload lower-cases them, or a
 * test that writes `"info"`, must not silently fall into a different colour. Anything
 * genuinely unrecognised becomes `info` rather than being dropped: a line nobody can
 * classify is still a line the person needs to read, and hiding it would be the worst
 * possible response to not knowing what it was.
 */
export function normaliseLevel(raw: string): ConsoleLevel {
    const value = raw.trim().toLowerCase();
    switch (value) {
        case "error":
        case "err":
        case "severe":
        case "fatal":
            return "error";
        case "warning":
        case "warn":
            return "warning";
        case "debug":
        case "trace":
        case "fine":
            return "debug";
        case "signal":
            return "signal";
        case "tip":
            return "tip";
        default:
            return "info";
    }
}

/* -------------------------------------------------------------------------- */
/* Lines                                                                      */
/* -------------------------------------------------------------------------- */

export interface ConsoleLine {
    readonly id: number;
    readonly level: ConsoleLevel;
    /** Who wrote it: the engine, or this app narrating what it is doing. */
    readonly origin: "engine" | "app";
    /**
     * The engine's own text, exactly as it printed it. Empty for a line this app wrote,
     * which carries {@link text} instead.
     */
    readonly message: string;
    /** What to translate at render time, for a line this app wrote. Null otherwise. */
    readonly text: ConsoleText | null;
    readonly at: string;
    /** This app's advice about this line. Empty for almost every line. */
    readonly annotations: readonly ConsoleAnnotation[];
}

/**
 * How many lines are kept.
 *
 * Two orders of magnitude above the 200 this panel used to keep, which was small enough
 * that a render of a large world had thrown away its own beginning by the time it
 * finished, and the beginning is where the setup problems are printed. Ten thousand
 * lines of the engine's output is a few megabytes of strings, which is nothing beside
 * what the renderer is already holding, and it covers a long render end to end.
 *
 * It is still a cap, and the console says so on screen along with how many lines it has
 * dropped. A history that quietly loses its own start is worse than a short one, because
 * nothing tells the reader that the answer they are looking for used to be there.
 */
export const CONSOLE_LINE_CAP = 10_000;

export interface AppendResult {
    readonly lines: readonly ConsoleLine[];
    /** How many were dropped off the front by this append. Zero until the cap is met. */
    readonly dropped: number;
}

/**
 * Adds one line, keeping the most recent {@link CONSOLE_LINE_CAP}.
 *
 * Returns the number dropped rather than only the new array, because the count is what
 * the console reports. A ring that silently forgets is exactly the behaviour this whole
 * console exists to replace.
 */
export function appendLine(
    lines: readonly ConsoleLine[],
    line: ConsoleLine,
    cap: number = CONSOLE_LINE_CAP,
): AppendResult {
    const next = [...lines, line];
    if (next.length <= cap) return { lines: next, dropped: 0 };
    const dropped = next.length - cap;
    return { lines: next.slice(dropped), dropped };
}

/**
 * The clock column, from whatever the event carried.
 *
 * The main process stamps every event with `new Date().toISOString()`, and printing
 * thirty characters of that in front of every line pushes the engine's own message off
 * the right of a narrow window. Only the time is shown, because the date is the same for
 * every line of one render and is on the run's own summary already.
 *
 * Anything that is not an ISO instant is passed through untouched rather than being
 * rejected: a bridge that stamps a plain `HH:MM:SS` is a build with a shorter timestamp,
 * not a build whose log should render a blank column.
 */
export function clockText(at: string): string {
    const match = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})/.exec(at);
    return match?.[1] ?? at;
}

/* -------------------------------------------------------------------------- */
/* Sticky scrolling                                                           */
/* -------------------------------------------------------------------------- */

/** The three numbers a scroll container reports, and the only ones this needs. */
export interface ScrollMetrics {
    readonly scrollTop: number;
    readonly scrollHeight: number;
    readonly clientHeight: number;
}

/**
 * How close to the bottom still counts as being at the bottom.
 *
 * Not zero. Sub-pixel layout, a fractional device pixel ratio and a partially visible
 * last line all leave a container that a person has scrolled fully to the bottom
 * reporting one or two pixels short, and a threshold of zero turns that into a console
 * that stops following for no visible reason and never starts again.
 */
export const STICK_THRESHOLD_PX = 24;

export function distanceFromBottom(metrics: ScrollMetrics): number {
    return Math.max(0, metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop);
}

/**
 * Whether the view is at the bottom, and therefore whether the next line should scroll.
 *
 * This is the whole of the sticky-scroll rule, and it is a rule about what the reader is
 * doing rather than about what the log is doing. A console that scrolls on every new line
 * cannot be read while it is running: you scroll up to look at the error, the engine
 * prints its next progress tick a second later, and you are back at the bottom. So the
 * view follows only while it is already there, and the moment somebody scrolls away it
 * stops and stays where they put it.
 *
 * Content shorter than the container is at the bottom by definition, which is what keeps
 * an empty console from starting out detached.
 */
export function isAtBottom(metrics: ScrollMetrics, threshold: number = STICK_THRESHOLD_PX): boolean {
    return distanceFromBottom(metrics) <= threshold;
}

/* -------------------------------------------------------------------------- */
/* What is on screen                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A line with its text already resolved.
 *
 * Filtering and searching both need the words, and for a line this app wrote the words
 * do not exist until a translator has been applied. Resolving once, where the translator
 * is, keeps the search matching what the reader can actually see: a search over the raw
 * message would silently never match any of the app's own status lines.
 */
export interface ConsoleRow {
    readonly line: ConsoleLine;
    readonly text: string;
}

/** How many lines of each level there are, so the filter can show counts. */
export function countByLevel(lines: readonly ConsoleLine[]): Record<ConsoleLevel, number> {
    const counts = { error: 0, warning: 0, info: 0, debug: 0, signal: 0, tip: 0 };
    for (const line of lines) counts[line.level]++;
    return counts;
}

/**
 * The rows that survive the level filter and the search.
 *
 * An empty level set means no level filter rather than nothing selected. The alternative
 * reading is defensible and produces an empty console the first time somebody clears the
 * last chip, which reads as the log having been lost.
 *
 * The search is applied to the line's own text and to the text of this app's advice
 * beside it, because the advice is on screen and a reader who searches for a word they
 * can see and gets no result concludes the search is broken.
 */
export function selectRows(
    rows: readonly ConsoleRow[],
    levels: ReadonlySet<ConsoleLevel>,
    matches: (text: string) => boolean,
    adviceText: (annotation: ConsoleAnnotation) => string = () => "",
): readonly ConsoleRow[] {
    return rows.filter((row) => {
        if (levels.size > 0 && !levels.has(row.line.level)) return false;
        if (matches(row.text)) return true;
        return row.line.annotations.some((annotation) => matches(adviceText(annotation)));
    });
}

/* -------------------------------------------------------------------------- */
/* Copying and exporting                                                      */
/* -------------------------------------------------------------------------- */

/** Width of the level column, so the text of every line starts in the same place. */
const TAG_WIDTH = 6;

/**
 * The rows as plain text.
 *
 * Plain text rather than anything cleverer because the destination is a bug report, a
 * chat message or a text file, and every one of those wants something that survives
 * being pasted. The engine's line is reproduced exactly; this app's advice is indented
 * under it behind a `>` so that a reader of the exported file can still tell the two
 * apart, which is the same promise the console makes on screen.
 *
 * The header is passed in already written, because it states which slice was exported
 * and that sentence has to be in the reader's own language.
 */
export function consoleText(
    rows: readonly ConsoleRow[],
    adviceText: (annotation: ConsoleAnnotation) => string,
    header = "",
): string {
    const body: string[] = [];
    for (const row of rows) {
        const tag = LEVEL_TAGS[row.line.level].padEnd(TAG_WIDTH);
        body.push(`${row.line.at} ${tag} ${row.text}`);
        for (const annotation of row.line.annotations) {
            body.push(`${" ".repeat(TAG_WIDTH + 2)}> ${adviceText(annotation)}`);
        }
    }
    return header === "" ? body.join("\n") : [header, ...body].join("\n");
}

/**
 * What an export actually covers, so the file can say so.
 *
 * Every field here answers a question somebody reading the exported file will otherwise
 * have to guess at: is this all of it, was anything filtered out, and did the console
 * throw away the beginning before I got here. An export that states none of those looks
 * complete and may be a tenth of the render.
 */
export interface SliceSummary {
    /** Rows written out. */
    readonly shown: number;
    /** Rows the console was holding. */
    readonly kept: number;
    /** Lines dropped off the front by the cap over the life of the render. */
    readonly dropped: number;
    readonly cap: number;
    /** True when a level filter or a search narrowed the export. */
    readonly filtered: boolean;
}

export function describeSlice(
    shown: number,
    kept: number,
    dropped: number,
    cap: number = CONSOLE_LINE_CAP,
): SliceSummary {
    return { shown, kept, dropped, cap, filtered: shown !== kept };
}
