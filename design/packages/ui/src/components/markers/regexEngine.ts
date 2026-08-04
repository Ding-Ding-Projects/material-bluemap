/**
 * Bounded ECMAScript regular-expression evaluation for the marker search bar's regex
 * builder preview.
 *
 * The engine is the browser's own `RegExp`, which is also what the marker filter runs,
 * so what the preview shows is exactly what the search will do. Nothing is sent
 * anywhere: patterns and sample text stay in memory and are never persisted.
 *
 * The size and time limits below bound a pattern that is slow. A pattern that is
 * exponentially slow is refused before compiling instead, because the wall clock is
 * checked between matches and an exponential pattern never returns from the first one;
 * `../config/regexRisk.ts` carries the argument and the shapes it detects.
 */

import { backtrackingRefusal } from "../config/regexRisk.js";
import { MAX_PATTERN_LENGTH } from "./markerFilter.js";

export { MAX_PATTERN_LENGTH };

/** Longest sample text accepted by the preview. */
export const MAX_SAMPLE_LENGTH = 5000;
/** Most matches reported before the preview says it truncated. */
export const MAX_MATCHES = 500;
/** Wall-clock budget for one preview run, checked between matches. */
export const MAX_EVAL_MS = 250;

/** Flags this build offers, in the order they are shown. */
export const SUPPORTED_FLAGS = ["g", "i", "m", "s", "u", "y"] as const;
export type SupportedFlag = (typeof SUPPORTED_FLAGS)[number];

export interface CaptureGroup {
    name: string;
    value: string | undefined;
}

export interface RegexMatch {
    index: number;
    text: string;
    groups: CaptureGroup[];
}

export interface RegexEvaluation {
    matches: RegexMatch[];
    /** Compile error message, or null when the pattern compiled. */
    error: string | null;
    /** True when {@link MAX_MATCHES} was reached and later matches were dropped. */
    truncated: boolean;
    /** True when {@link MAX_EVAL_MS} elapsed and scanning stopped early. */
    timedOut: boolean;
    /** True when the sample was cut to {@link MAX_SAMPLE_LENGTH}. */
    sampleTruncated: boolean;
}

export interface CompileResult {
    regexp: RegExp | null;
    error: string | null;
}

/** Escapes a literal so it matches itself, for the builder's "insert literal" action. */
export function escapeLiteral(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\/\-]/g, "\\$&");
}

/**
 * Compiles a pattern for the preview. `g` is forced on so scanning finds every match,
 * and `y` is dropped because a sticky scan would stop at the first gap.
 */
export function compilePreviewPattern(pattern: string, flags: string): CompileResult {
    if (pattern.length > MAX_PATTERN_LENGTH) {
        return { regexp: null, error: `Pattern is longer than ${MAX_PATTERN_LENGTH} characters.` };
    }
    const refusal = backtrackingRefusal(pattern);
    if (refusal !== null) return { regexp: null, error: refusal };
    const previewFlags = flags.replace(/[gy]/g, "") + "g";
    try {
        return { regexp: new RegExp(pattern, previewFlags), error: null };
    } catch (error) {
        return { regexp: null, error: (error as Error).message };
    }
}

function now(): number {
    return typeof performance === "undefined" ? Date.now() : performance.now();
}

/**
 * Runs a pattern over sample text under explicit bounds.
 *
 * A single catastrophic backtrack inside one `exec` call cannot be pre-empted on the
 * main thread, which is why the pattern and the sample are both capped before the run
 * rather than only interrupted during it. Between matches the elapsed time is checked,
 * so a pattern that is merely slow across many matches stops instead of freezing the
 * interface. Zero-width matches advance `lastIndex` by hand so the scan terminates.
 */
export function evaluatePattern(
    pattern: string,
    flags: string,
    sample: string,
): RegexEvaluation {
    const sampleTruncated = sample.length > MAX_SAMPLE_LENGTH;
    const text = sampleTruncated ? sample.slice(0, MAX_SAMPLE_LENGTH) : sample;

    const { regexp, error } = compilePreviewPattern(pattern, flags);
    if (!regexp) {
        return { matches: [], error, truncated: false, timedOut: false, sampleTruncated };
    }

    const matches: RegexMatch[] = [];
    let truncated = false;
    let timedOut = false;

    if (pattern.length > 0) {
        const startedAt = now();
        let result: RegExpExecArray | null;
        while ((result = regexp.exec(text)) !== null) {
            const groups: CaptureGroup[] = [];
            for (let i = 1; i < result.length; i++) {
                groups.push({ name: String(i), value: result[i] });
            }
            if (result.groups) {
                for (const [name, value] of Object.entries(result.groups)) {
                    groups.push({ name, value });
                }
            }
            matches.push({ index: result.index, text: result[0], groups });

            // zero-width match: step forward by hand or exec() never advances
            if (result.index === regexp.lastIndex) regexp.lastIndex++;

            if (matches.length >= MAX_MATCHES) {
                truncated = true;
                break;
            }
            if (now() - startedAt > MAX_EVAL_MS) {
                timedOut = true;
                break;
            }
        }
    }

    return { matches, error: null, truncated, timedOut, sampleTruncated };
}
