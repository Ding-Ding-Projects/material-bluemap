/**
 * Bounded ECMAScript regular-expression evaluation for the settings search bars
 * and their builders.
 *
 * The engine is the host runtime's own `RegExp`, which is also what
 * {@link createSettingMatcher} filters settings with, so the builder's preview
 * cannot disagree with the search that consumes the pattern. Evaluation is local
 * and in memory: no pattern and no sample text is transmitted, logged or
 * persisted anywhere.
 *
 * Each search surface in this app owns its own copy of this adapter (the marker
 * menu has `markers/regexEngine.ts`, the main menu has `menu/regex.ts`) so that
 * one surface's limits cannot be changed out from under another's.
 *
 * ### Dialect and escaping
 *
 * ECMAScript, as implemented by the running JavaScript engine. A literal is made
 * to match itself by backslash-escaping every metacharacter, which is what
 * {@link escapeLiteral} does. `\d`, `\w`, `\s`, `\b`, named groups `(?<name>…)`,
 * back-references and lookaround all behave exactly as they do in the browser.
 *
 * ### Limits
 *
 * Pattern 512 characters, sample 20000 characters, 500 reported matches, 100 ms
 * of wall clock per preview run. They are stated in the builder's own interface
 * as well as here, because a limit the user cannot see is a limit that reads as
 * a bug when it bites.
 */

/** Longest pattern this build will compile. */
export const MAX_PATTERN_LENGTH = 512;
/** Longest sample text the preview will scan. */
export const MAX_SAMPLE_LENGTH = 20000;
/** Most matches reported before the preview says it truncated. */
export const MAX_MATCHES = 500;
/** Wall-clock budget for one preview run, checked between matches. */
export const MAX_EVAL_MS = 100;

/** Flags this build offers, in the order the builder shows them. */
export const SUPPORTED_FLAGS = ["g", "i", "m", "s", "u", "y"] as const;
export type SupportedFlag = (typeof SUPPORTED_FLAGS)[number];

/**
 * Flags that must not reach a reused search predicate.
 *
 * `g` and `y` make a `RegExp` stateful through `lastIndex`, so one instance
 * tested against a list of settings would skip roughly every other one. The
 * builder still offers them for the preview, where scanning is the whole point.
 */
const PREDICATE_UNSAFE_FLAGS = /[gy]/g;

export interface CaptureGroup {
    readonly name: string;
    readonly value: string | undefined;
}

export interface RegexMatch {
    readonly index: number;
    readonly text: string;
    readonly groups: readonly CaptureGroup[];
}

export interface RegexEvaluation {
    readonly matches: readonly RegexMatch[];
    /** Compile error message, or null when the pattern compiled. */
    readonly error: string | null;
    /** True when {@link MAX_MATCHES} was reached and later matches were dropped. */
    readonly truncated: boolean;
    /** True when {@link MAX_EVAL_MS} elapsed and scanning stopped early. */
    readonly timedOut: boolean;
    /** True when the sample was cut to {@link MAX_SAMPLE_LENGTH} before scanning. */
    readonly sampleTruncated: boolean;
}

export interface CompileResult {
    readonly regexp: RegExp | null;
    readonly error: string | null;
}

/** Escapes a literal so that it matches itself. */
export function escapeLiteral(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\/\-]/g, "\\$&");
}

/** Keeps only the flags this build supports, in a stable order, without duplicates. */
export function normalizeFlags(flags: string): string {
    const seen = new Set<string>();
    for (const flag of flags) {
        if ((SUPPORTED_FLAGS as readonly string[]).includes(flag)) seen.add(flag);
    }
    return SUPPORTED_FLAGS.filter((flag) => seen.has(flag)).join("");
}

/**
 * Compiles a pattern for the preview.
 *
 * `g` is forced on so the scan finds every match, and `y` is dropped because a
 * sticky scan stops at the first gap and would report "no matches" for a pattern
 * that matches perfectly well further along.
 */
export function compilePreviewPattern(pattern: string, flags: string): CompileResult {
    if (pattern.length > MAX_PATTERN_LENGTH) {
        return { regexp: null, error: `Pattern is longer than ${MAX_PATTERN_LENGTH} characters.` };
    }
    const previewFlags = normalizeFlags(flags).replace(PREDICATE_UNSAFE_FLAGS, "") + "g";
    try {
        return { regexp: new RegExp(pattern, previewFlags), error: null };
    } catch (error) {
        return { regexp: null, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Compiles a pattern for filtering, keeping the user's flags apart from `g` and
 * `y` so the same instance can be tested against many candidate strings.
 */
export function compileSearchPattern(pattern: string, flags: string): CompileResult {
    if (pattern.length > MAX_PATTERN_LENGTH) {
        return { regexp: null, error: `Pattern is longer than ${MAX_PATTERN_LENGTH} characters.` };
    }
    try {
        return {
            regexp: new RegExp(pattern, normalizeFlags(flags).replace(PREDICATE_UNSAFE_FLAGS, "")),
            error: null,
        };
    } catch (error) {
        return { regexp: null, error: error instanceof Error ? error.message : String(error) };
    }
}

function now(): number {
    return typeof performance === "undefined" ? Date.now() : performance.now();
}

/**
 * Runs a pattern over sample text under explicit bounds.
 *
 * A catastrophic backtrack inside a single `exec` call cannot be interrupted on
 * the main thread, which is why the pattern and the sample are both capped
 * before the run rather than only checked during it. Between matches the elapsed
 * time is checked, so a pattern that is merely slow across many matches stops
 * and says so instead of freezing the interface. Zero-width matches advance
 * `lastIndex` by hand, without which `exec` never terminates.
 */
export function evaluatePattern(pattern: string, flags: string, sample: string): RegexEvaluation {
    const sampleTruncated = sample.length > MAX_SAMPLE_LENGTH;
    const text = sampleTruncated ? sample.slice(0, MAX_SAMPLE_LENGTH) : sample;

    const { regexp, error } = compilePreviewPattern(pattern, flags);
    if (!regexp) return { matches: [], error, truncated: false, timedOut: false, sampleTruncated };

    const matches: RegexMatch[] = [];
    let truncated = false;
    let timedOut = false;

    if (pattern.length > 0) {
        const startedAt = now();
        let result: RegExpExecArray | null;
        while ((result = regexp.exec(text)) !== null) {
            const groups: CaptureGroup[] = [];
            for (let index = 1; index < result.length; index++) {
                groups.push({ name: String(index), value: result[index] });
            }
            if (result.groups) {
                for (const [name, value] of Object.entries(result.groups)) groups.push({ name, value });
            }
            matches.push({ index: result.index, text: result[0], groups });

            // Zero-width match: step forward by hand or exec() never advances.
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

/** Case-insensitive substring test, which is what plain-text search means here. */
export function includesCI(haystack: string, needle: string): boolean {
    return haystack.toLowerCase().includes(needle.toLowerCase());
}

export interface SettingMatcher {
    /** True for a candidate string. Always true when the query is empty. */
    readonly test: (value: string) => boolean;
    /** Compile error in regex mode, null when the pattern is usable. */
    readonly error: string | null;
    /** True when the query is doing any filtering at all. */
    readonly active: boolean;
}

/**
 * Builds the predicate a settings search bar filters with.
 *
 * Plain text is the default and stays case-insensitive substring matching. Regex
 * only takes over when the user turns it on, and an invalid pattern matches
 * nothing rather than quietly falling back to the last one that compiled, which
 * would show results for a pattern that is no longer on screen.
 */
export function createSettingMatcher(query: string, regexMode: boolean, flags: string): SettingMatcher {
    if (query.length === 0) return { test: () => true, error: null, active: false };

    if (!regexMode) {
        return { test: (value: string) => includesCI(value, query), error: null, active: true };
    }

    const { regexp, error } = compileSearchPattern(query, flags);
    if (!regexp) return { test: () => false, error, active: true };

    return {
        test: (value: string) => {
            regexp.lastIndex = 0;
            return regexp.test(value);
        },
        error: null,
        active: true,
    };
}
