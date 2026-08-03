/**
 * Plain text matching, and the shared shape a match takes on every surface.
 *
 * Plain text is the default everywhere. It is implemented with a fully escaped literal pattern
 * rather than `String.prototype.includes` for one reason: case-insensitive comparison needs
 * Unicode case folding, and folding a string with `toLowerCase()` can change its length, which
 * would make every highlight offset wrong. A literal pattern has no quantifier and no alternation,
 * so it cannot backtrack, which is why it is safe to run on this thread while a visitor-written
 * pattern is not.
 */

import { escapeRegExp } from "./engine.js";

export interface MatchSpan {
    readonly start: number;
    readonly end: number;
}

/** How many highlights a single string is allowed to report. */
export const MAX_SPANS_PER_VALUE = 200;

export interface PlainTextMatcher {
    readonly kind: "text";
    readonly query: string;
    readonly caseSensitive: boolean;
    test(value: string): boolean;
    firstSpan(value: string): MatchSpan | null;
    spans(value: string, limit?: number): MatchSpan[];
}

/** Build a matcher for a literal query. An empty query matches nothing, never everything. */
export function createPlainTextMatcher(query: string, caseSensitive: boolean): PlainTextMatcher {
    const flags = caseSensitive ? "gu" : "giu";
    const expression = query === "" ? null : new RegExp(escapeRegExp(query), flags);

    function firstSpan(value: string): MatchSpan | null {
        if (expression === null) {
            return null;
        }
        expression.lastIndex = 0;
        const match = expression.exec(value);
        if (match === null) {
            return null;
        }
        return { start: match.index, end: match.index + (match[0] ?? "").length };
    }

    return {
        kind: "text",
        query,
        caseSensitive,
        test(value) {
            return firstSpan(value) !== null;
        },
        firstSpan,
        spans(value, limit = MAX_SPANS_PER_VALUE) {
            if (expression === null) {
                return [];
            }
            const found: MatchSpan[] = [];
            expression.lastIndex = 0;
            let match = expression.exec(value);
            while (match !== null && found.length < limit) {
                const length = (match[0] ?? "").length;
                found.push({ start: match.index, end: match.index + length });
                if (length === 0) {
                    // Cannot happen with a non-empty literal, but a stuck loop is not a risk worth
                    // leaving open.
                    break;
                }
                match = expression.exec(value);
            }
            return found;
        },
    };
}

/**
 * Split a value into alternating plain and matched runs, so a caller can build highlighted output
 * without ever inserting markup into text it did not create.
 */
export interface HighlightRun {
    readonly text: string;
    readonly matched: boolean;
}

export function toHighlightRuns(value: string, spans: readonly MatchSpan[]): HighlightRun[] {
    const runs: HighlightRun[] = [];
    let cursor = 0;
    for (const span of spans) {
        if (span.start < cursor || span.end > value.length || span.end < span.start) {
            continue;
        }
        if (span.start > cursor) {
            runs.push({ text: value.slice(cursor, span.start), matched: false });
        }
        runs.push({ text: value.slice(span.start, span.end), matched: true });
        cursor = span.end;
    }
    if (cursor < value.length) {
        runs.push({ text: value.slice(cursor), matched: false });
    }
    return runs;
}

/**
 * A short excerpt centred on a match, for result rows that cannot show a whole article body.
 * Returns the excerpt and the span translated into excerpt coordinates.
 */
export interface Excerpt {
    readonly text: string;
    readonly span: MatchSpan | null;
    readonly truncatedStart: boolean;
    readonly truncatedEnd: boolean;
}

export function excerptAround(value: string, span: MatchSpan | null, radius = 60): Excerpt {
    if (span === null) {
        const text = value.slice(0, radius * 2);
        return {
            text,
            span: null,
            truncatedStart: false,
            truncatedEnd: text.length < value.length,
        };
    }
    const start = Math.max(0, span.start - radius);
    const end = Math.min(value.length, span.end + radius);
    return {
        text: value.slice(start, end),
        span: { start: span.start - start, end: span.end - start },
        truncatedStart: start > 0,
        truncatedEnd: end < value.length,
    };
}
