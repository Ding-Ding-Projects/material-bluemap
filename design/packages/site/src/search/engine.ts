/**
 * The regex engine used by every search surface and by the builder.
 *
 * The dialect is the browser's own ECMAScript `RegExp`. There is no second implementation and no
 * translation layer, so a pattern that works in the builder is the same pattern the search bar
 * runs. Escaping rules are `RegExp` escaping rules.
 *
 * `createRegexEngine` is deliberately self-contained: it declares every constant and helper inside
 * its own body and closes over nothing. That lets `buildRegexWorkerSource()` stringify it into a
 * worker without a bundler step, and lets the tests run the exact code the worker runs.
 * `engine.test.ts` asserts both properties, so keep the body free of module-scope references.
 */

/** One match, with its captures. */
export interface RegexMatch {
    readonly index: number;
    readonly end: number;
    readonly value: string;
    readonly captures: readonly (string | null)[];
    readonly namedGroups: Readonly<Record<string, string | null>>;
}

/** Result of running a pattern over sample text. */
export interface RegexRunResult {
    readonly matches: readonly RegexMatch[];
    /** True when the match limit was reached and later matches were dropped. */
    readonly truncated: boolean;
    readonly source: string;
    readonly flags: string;
}

/** Where a candidate string first matched. */
export interface CandidateHit {
    /** Index into the candidate array that was submitted. */
    readonly index: number;
    readonly start: number;
    readonly end: number;
}

/** Result of filtering a list of candidate strings. */
export interface RegexFilterResult {
    readonly hits: readonly CandidateHit[];
    readonly source: string;
    readonly flags: string;
}

/** Every bound the engine enforces. Stated in the builder's own copy, not just in code. */
export interface RegexEngineLimits {
    readonly maxPatternLength: number;
    readonly maxSampleLength: number;
    readonly maxMatches: number;
    readonly maxCandidates: number;
    readonly maxCandidateLength: number;
    readonly maxTotalCandidateLength: number;
}

export interface RunRegexRequest {
    readonly pattern: string;
    readonly flags: string;
    readonly sample: string;
    readonly maxMatches?: number;
}

export interface FilterCandidatesRequest {
    readonly pattern: string;
    readonly flags: string;
    readonly candidates: readonly string[];
}

export interface RegexEngine {
    readonly limits: RegexEngineLimits;
    runRegex(request: RunRegexRequest): RegexRunResult;
    filterCandidates(request: FilterCandidatesRequest): RegexFilterResult;
}

/**
 * The limits, restated at module scope so user-facing copy can quote them without constructing an
 * engine. `engine.test.ts` proves these stay equal to the values inside the factory.
 */
export const REGEX_LIMITS: RegexEngineLimits = {
    maxPatternLength: 2000,
    maxSampleLength: 20000,
    maxMatches: 500,
    maxCandidates: 20000,
    maxCandidateLength: 100000,
    maxTotalCandidateLength: 4000000,
};

/** Milliseconds an evaluation is allowed to run before the worker is terminated. */
export const REGEX_TIMEOUT_MS = 300;

/** Flags this build offers, in the order `RegExp` reports them. */
export const SUPPORTED_FLAGS = ["d", "g", "i", "m", "s", "u", "v", "y"] as const;

export type SupportedFlag = (typeof SUPPORTED_FLAGS)[number];

/**
 * Build the engine. The body must stay self-contained: no imports, no module constants, no
 * references to anything declared outside this function.
 */
export function createRegexEngine(): RegexEngine {
    const maxPatternLength = 2000;
    const maxSampleLength = 20000;
    const maxMatches = 500;
    const maxCandidates = 20000;
    const maxCandidateLength = 100000;
    const maxTotalCandidateLength = 4000000;

    function advanceStringIndex(value: string, index: number, unicode: boolean): number {
        if (!unicode || index + 1 >= value.length) {
            return index + 1;
        }
        const first = value.charCodeAt(index);
        if (first < 0xd800 || first > 0xdbff) {
            return index + 1;
        }
        const second = value.charCodeAt(index + 1);
        return second >= 0xdc00 && second <= 0xdfff ? index + 2 : index + 1;
    }

    function assertStrings(pattern: unknown, flags: unknown): void {
        if (typeof pattern !== "string" || typeof flags !== "string") {
            throw new TypeError("Pattern and flags must be strings.");
        }
    }

    function assertPatternLength(pattern: string): void {
        if (pattern.length > maxPatternLength) {
            throw new RangeError(`Pattern exceeds ${maxPatternLength} characters.`);
        }
    }

    function toNamedGroups(groups: Record<string, string | undefined> | undefined) {
        const named: Record<string, string | null> = {};
        if (groups) {
            for (const key of Object.keys(groups)) {
                const value = groups[key];
                named[key] = value === undefined ? null : value;
            }
        }
        return named;
    }

    function runRegex(request: RunRegexRequest): RegexRunResult {
        const pattern = request.pattern;
        const flags = request.flags;
        const sample = request.sample;
        assertStrings(pattern, flags);
        if (typeof sample !== "string") {
            throw new TypeError("Sample must be a string.");
        }
        assertPatternLength(pattern);
        if (sample.length > maxSampleLength) {
            throw new RangeError(`Sample exceeds ${maxSampleLength} characters.`);
        }

        const limit = request.maxMatches === undefined ? maxMatches : request.maxMatches;
        if (!Number.isInteger(limit) || limit < 1 || limit > maxMatches) {
            throw new RangeError(`Match limit must be between 1 and ${maxMatches}.`);
        }

        const expression = new RegExp(pattern, flags);
        const matches: RegexMatch[] = [];
        let truncated = false;

        for (;;) {
            const match = expression.exec(sample);
            if (match === null) {
                break;
            }

            const captures: (string | null)[] = [];
            for (let index = 1; index < match.length; index += 1) {
                const capture = match[index];
                captures.push(capture === undefined ? null : capture);
            }

            const value = match[0] ?? "";
            matches.push({
                index: match.index,
                end: match.index + value.length,
                value,
                captures,
                namedGroups: toNamedGroups(match.groups),
            });

            if (matches.length > limit) {
                // Keep exactly `limit` matches and say plainly that the rest were dropped, rather
                // than letting the caller believe the pattern happened to stop here.
                matches.pop();
                truncated = true;
                break;
            }

            if (!expression.global) {
                break;
            }

            if (value === "") {
                const unicodeSets = (expression as { unicodeSets?: boolean }).unicodeSets === true;
                expression.lastIndex = advanceStringIndex(
                    sample,
                    expression.lastIndex,
                    expression.unicode || unicodeSets,
                );
            }
        }

        return {
            matches,
            truncated,
            source: expression.source,
            flags: expression.flags,
        };
    }

    function filterCandidates(request: FilterCandidatesRequest): RegexFilterResult {
        const pattern = request.pattern;
        const flags = request.flags;
        const candidates = request.candidates;
        assertStrings(pattern, flags);
        if (!Array.isArray(candidates)) {
            throw new TypeError("Candidates must be an array of strings.");
        }
        assertPatternLength(pattern);
        if (candidates.length > maxCandidates) {
            throw new RangeError(`Candidate count exceeds ${maxCandidates}.`);
        }

        let total = 0;
        for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index];
            if (typeof candidate !== "string") {
                throw new TypeError("Candidates must be an array of strings.");
            }
            if (candidate.length > maxCandidateLength) {
                throw new RangeError(`Candidate ${index} exceeds ${maxCandidateLength} characters.`);
            }
            total += candidate.length;
            if (total > maxTotalCandidateLength) {
                throw new RangeError(`Candidates exceed ${maxTotalCandidateLength} characters.`);
            }
        }

        const expression = new RegExp(pattern, flags);
        const hits: CandidateHit[] = [];

        for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index] ?? "";
            expression.lastIndex = 0;
            const match = expression.exec(candidate);
            if (match !== null) {
                const value = match[0] ?? "";
                hits.push({ index, start: match.index, end: match.index + value.length });
            }
        }

        return { hits, source: expression.source, flags: expression.flags };
    }

    return {
        limits: {
            maxPatternLength,
            maxSampleLength,
            maxMatches,
            maxCandidates,
            maxCandidateLength,
            maxTotalCandidateLength,
        },
        runRegex,
        filterCandidates,
    };
}

/**
 * A main-thread engine instance. Use it to *compile* a pattern (compiling is cheap and cannot
 * backtrack) and for plain-text work. Never run an untrusted pattern against text on the main
 * thread with this: matching is what backtracks, and only the worker can be interrupted.
 */
export const regexEngine: RegexEngine = createRegexEngine();

/** Escape a literal so `new RegExp(escapeRegExp(text))` matches exactly that text. */
export function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
}

/**
 * Advisory check for the shapes that cause catastrophic backtracking: a quantified group whose
 * body is itself quantified or alternated, such as `(a+)+` or `(a|a)*`. It is a heuristic, so it
 * warns rather than blocks. The worker timeout is the actual protection.
 */
export function findBacktrackingRisk(pattern: string): string | null {
    const nestedQuantifier = /\((?:\?[:=!<][^)]*|[^)])*[*+][^)]*\)\s*[*+]|\)\s*\{\d+,\}/;
    const alternationLoop = /\((?:\?:)?[^)]*\|[^)]*\)\s*[*+]/;
    if (nestedQuantifier.test(pattern)) {
        return "nested-quantifier";
    }
    if (alternationLoop.test(pattern)) {
        return "alternation-loop";
    }
    return null;
}
