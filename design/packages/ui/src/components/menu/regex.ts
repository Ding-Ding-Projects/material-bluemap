/**
 * Regex engine adapter for the menu search surfaces.
 *
 * The engine is the host JavaScript runtime's own `RegExp` (ECMAScript dialect), evaluated
 * locally on the main thread. Nothing is transmitted or persisted: patterns and sample text
 * live only in component state. The limits below keep a catastrophic-backtracking pattern
 * from freezing the interface.
 */

/** Longest pattern the builder will compile. */
export const MAX_PATTERN_LENGTH = 512;
/** Longest sample text the builder will evaluate against. */
export const MAX_SAMPLE_LENGTH = 20000;
/** Most matches reported before the result list is truncated. */
export const MAX_MATCHES = 200;
/** Wall-clock budget for one evaluation pass. */
export const MAX_EVAL_MS = 50;

/** Flags this dialect supports, in the order the builder shows them. */
export const SUPPORTED_FLAGS = ["g", "i", "m", "s", "u", "y"] as const;

export type RegexFlag = (typeof SUPPORTED_FLAGS)[number];

export interface RegexMatchResult {
    index: number;
    text: string;
    /** Numbered capture groups, 1-based in source order. */
    groups: (string | undefined)[];
    /** Named capture groups, empty when the pattern declares none. */
    named: Record<string, string | undefined>;
}

export interface RegexEvaluation {
    /** False when the pattern failed to compile or violated a limit. */
    ok: boolean;
    /** Human-readable failure reason, null when ok. */
    error: string | null;
    matches: RegexMatchResult[];
    /** True when MAX_MATCHES cut the result list short. */
    truncated: boolean;
    /** True when MAX_EVAL_MS stopped the scan early. */
    timedOut: boolean;
}

export interface CompileResult {
    regex: RegExp | null;
    error: string | null;
}

function normalizeFlags(flags: string): string {
    const seen = new Set<string>();
    for (const flag of flags) {
        if ((SUPPORTED_FLAGS as readonly string[]).includes(flag)) seen.add(flag);
    }
    return [...seen].join("");
}

/** Compiles a pattern, reporting limit violations and syntax errors as text. */
export function compilePattern(pattern: string, flags: string): CompileResult {
    if (pattern.length > MAX_PATTERN_LENGTH) {
        return {
            regex: null,
            error: `Pattern is longer than the ${MAX_PATTERN_LENGTH} character limit.`,
        };
    }
    try {
        return { regex: new RegExp(pattern, normalizeFlags(flags)), error: null };
    } catch (error) {
        return { regex: null, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Runs a pattern over sample text and returns every match with its capture groups.
 *
 * Zero-width matches advance `lastIndex` by hand, which is what stops `(?:)` or `a*` from
 * looping forever. A wall-clock budget stops a pathological pattern from freezing the tab;
 * `timedOut` says so explicitly rather than silently returning a short list.
 */
export function evaluatePattern(pattern: string, flags: string, sample: string): RegexEvaluation {
    const empty: RegexEvaluation = {
        ok: true,
        error: null,
        matches: [],
        truncated: false,
        timedOut: false,
    };

    if (!pattern) return empty;

    if (sample.length > MAX_SAMPLE_LENGTH) {
        return {
            ...empty,
            ok: false,
            error: `Sample text is longer than the ${MAX_SAMPLE_LENGTH} character limit.`,
        };
    }

    const { regex, error } = compilePattern(pattern, flags);
    if (!regex) return { ...empty, ok: false, error };

    // Enumeration always needs a global scan; the user's own flags are what gets copied out.
    const scanner = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");

    const matches: RegexMatchResult[] = [];
    let truncated = false;
    let timedOut = false;
    const deadline = Date.now() + MAX_EVAL_MS;

    let match: RegExpExecArray | null;
    while ((match = scanner.exec(sample)) !== null) {
        matches.push({
            index: match.index,
            text: match[0],
            groups: match.slice(1),
            named: { ...(match.groups ?? {}) },
        });

        if (matches.length >= MAX_MATCHES) {
            truncated = true;
            break;
        }
        if (Date.now() > deadline) {
            timedOut = true;
            break;
        }
        // Zero-width match: step forward by hand or exec() never terminates.
        if (match.index === scanner.lastIndex) scanner.lastIndex += 1;
    }

    return { ok: true, error: null, matches, truncated, timedOut };
}

/**
 * Case-insensitive substring test.
 *
 * Upstream monkey-patched `String.prototype.includesCI` in `webapp/src/main.js`; this port
 * does not extend built-ins, so the compare lives here.
 */
export function includesCI(haystack: string, needle: string): boolean {
    return haystack.toLowerCase().includes(needle.toLowerCase());
}

export interface MatcherResult {
    /** Tests one candidate string. Always true when the query is empty. */
    test: (value: string) => boolean;
    /** Compile error for regex mode, null when the pattern is usable. */
    error: string | null;
}

/**
 * Builds the predicate a search bar filters with.
 *
 * Plain text is the default and stays case-insensitive substring matching, exactly as
 * upstream's marker search behaved. Regex mode only takes over when the user turns it on,
 * and an invalid pattern matches nothing rather than falling back to a stale one.
 */
export function createMatcher(query: string, regexMode: boolean, flags: string): MatcherResult {
    if (!query) return { test: () => true, error: null };

    if (!regexMode) {
        return { test: (value: string) => includesCI(value, query), error: null };
    }

    const { regex, error } = compilePattern(query, flags);
    if (!regex) return { test: () => false, error };

    return {
        test: (value: string) => {
            // A sticky or global regex carries lastIndex between calls; reset per candidate.
            regex.lastIndex = 0;
            return regex.test(value);
        },
        error: null,
    };
}
