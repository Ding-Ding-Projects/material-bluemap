/**
 * Finding a phrase in the licence without changing a word of it.
 *
 * Every obvious way of highlighting text in a Vue component goes through `v-html`, and
 * `v-html` on a document fetched from a third party is the one thing this feature must
 * never do. So the search produces **runs**: a list of `{ text, hit }` pairs whose `text`
 * fields, concatenated in order, are byte-identical to the paragraph they came from. The
 * component renders a `<mark>` around the runs that hit and a plain span around the rest,
 * so the browser is never handed markup and the reader is never shown a paragraph that
 * differs by so much as a space from the source.
 *
 * {@link runsPreserve} states that as a checkable condition, and the test asserts it for
 * plain-text and regex searches alike, including the awkward cases: a zero-width match, a
 * match at index 0, a match running to the end of the string, and a pattern with no match
 * at all.
 *
 * ## Filtering hides tabs, never words
 *
 * A search over a legal document must not be able to hide part of it. So the query never
 * removes a paragraph: it counts hits per section, marks the sections that contain one,
 * and highlights inside whichever section is open. What the reader chooses to look at
 * changes; what the document says does not.
 */

import {
    compilePreviewPattern,
    MAX_SAMPLE_LENGTH,
    type SettingMatcher,
} from "../config/regexEngine.js";
import type { EulaSection } from "./eulaSections.js";
import { sectionText } from "./eulaSections.js";

/** One stretch of a paragraph, either matched by the query or not. */
export interface TextRun {
    readonly text: string;
    readonly hit: boolean;
}

/** Most highlights drawn in one paragraph before the rest are left unmarked. */
export const MAX_HIGHLIGHTS = 200;

/**
 * Splits a paragraph into matched and unmatched runs.
 *
 * Plain text is a case-insensitive substring scan, which is what plain-text search means
 * everywhere else in this application. Regex mode compiles through the shared engine, so
 * the same bounds, the same refusal of catastrophically backtracking patterns and the
 * same dialect apply here as in every other search bar.
 *
 * An empty query, an invalid pattern or a query the paragraph does not contain all
 * produce a single unmatched run holding the whole paragraph. None of those is an error
 * worth a different code path: the paragraph still has to render, unaltered.
 */
export function highlightRuns(paragraph: string, query: string, regexMode: boolean, flags: string): readonly TextRun[] {
    const whole: readonly TextRun[] = [{ text: paragraph, hit: false }];
    if (query.length === 0 || paragraph.length === 0) return whole;
    // The shared engine caps the text it will scan. Beyond the cap the paragraph renders
    // without highlights rather than with highlights that stop half way, which would read
    // as the search having missed something.
    if (paragraph.length > MAX_SAMPLE_LENGTH) return whole;

    const spans = regexMode ? regexSpans(paragraph, query, flags) : literalSpans(paragraph, query);
    if (spans.length === 0) return whole;

    const runs: TextRun[] = [];
    let cursor = 0;
    for (const [start, end] of spans) {
        if (start > cursor) runs.push({ text: paragraph.slice(cursor, start), hit: false });
        runs.push({ text: paragraph.slice(start, end), hit: true });
        cursor = end;
    }
    if (cursor < paragraph.length) runs.push({ text: paragraph.slice(cursor), hit: false });
    return runs;
}

/** Case-insensitive literal occurrences, as non-overlapping `[start, end)` pairs. */
function literalSpans(paragraph: string, query: string): readonly (readonly [number, number])[] {
    const haystack = paragraph.toLowerCase();
    const needle = query.toLowerCase();
    const spans: (readonly [number, number])[] = [];
    let from = 0;
    while (spans.length < MAX_HIGHLIGHTS) {
        const at = haystack.indexOf(needle, from);
        if (at === -1) break;
        spans.push([at, at + needle.length]);
        from = at + needle.length;
    }
    return spans;
}

/**
 * Regex occurrences, as non-overlapping `[start, end)` pairs.
 *
 * A zero-width match is dropped rather than rendered: `\b` matches the empty string at
 * every word boundary, and a `<mark>` around nothing is an invisible element in every
 * gap of the document. The scan still advances past it, without which `exec` never
 * terminates.
 */
function regexSpans(paragraph: string, pattern: string, flags: string): readonly (readonly [number, number])[] {
    const { regexp } = compilePreviewPattern(pattern, flags);
    if (regexp === null) return [];

    const spans: (readonly [number, number])[] = [];
    let result: RegExpExecArray | null;
    while ((result = regexp.exec(paragraph)) !== null && spans.length < MAX_HIGHLIGHTS) {
        if (result[0].length > 0) spans.push([result.index, result.index + result[0].length]);
        if (result.index === regexp.lastIndex) regexp.lastIndex++;
    }
    return spans;
}

/** Whether a set of runs really is the paragraph, split up. The safety property. */
export function runsPreserve(paragraph: string, runs: readonly TextRun[]): boolean {
    return runs.map((run) => run.text).join("") === paragraph;
}

/** How many sections contain a hit, and which. Used for the honest "showing X of Y". */
export interface SectionMatchReport {
    readonly matching: ReadonlySet<string>;
    readonly total: number;
}

/**
 * Which sections the query appears in.
 *
 * Nothing is hidden by this. The viewer marks the tabs that contain a hit and says how
 * many sections matched; every tab stays in the strip, because a licence with three of
 * its nine sections removed from the navigation is a licence somebody could reasonably
 * believe they had finished reading.
 */
export function reportSectionMatches(
    text: string,
    sections: readonly EulaSection[],
    matcher: SettingMatcher,
): SectionMatchReport {
    if (!matcher.active) {
        return { matching: new Set(sections.map((section) => section.id)), total: sections.length };
    }
    const matching = new Set<string>();
    for (const section of sections) {
        if (matcher.test(sectionText(text, section))) matching.add(section.id);
    }
    return { matching, total: sections.length };
}
