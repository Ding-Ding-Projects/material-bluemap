/**
 * The single matching predicate every tab search and both bulk-close actions use.
 *
 * There is exactly one compile path and exactly one `test`. "Close pages containing text" and
 * "Close pages not containing text" call the same compiled matcher and one of them negates
 * the result, which is what makes it impossible for the two directions to disagree about
 * case, Unicode handling, flags or scope. Two matchers would eventually drift; one cannot.
 *
 * Scope is the visible page name and nothing else. Page content and anything not displayed
 * are never inspected, and nothing matched here is transmitted, logged or persisted.
 *
 * Bounds, because a regular expression is visitor input:
 *   - the pattern is capped, so an enormous pattern is refused rather than compiled;
 *   - the subject is capped, so a pathological pattern has a small string to work on;
 *   - `g` and `y` are never used, so `test` has no lastIndex state to leak between calls.
 * A single catastrophic exec still cannot be interrupted from the main thread, which is why
 * the subject cap matters: with a bounded subject the worst case stays bounded too.
 */

export const MATCH_MODES = ["plain", "regex"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export const MAX_PATTERN_LENGTH = 2000;
export const MAX_SUBJECT_LENGTH = 2000;

export interface MatchSpec {
    readonly query: string;
    readonly mode: MatchMode;
    readonly caseSensitive: boolean;
}

export interface MatcherOk {
    readonly ok: true;
    readonly mode: MatchMode;
    /** True when the subject contains, or matches, the query. */
    readonly test: (text: string) => boolean;
}

export interface MatcherError {
    readonly ok: false;
    readonly reason: "empty" | "too-long" | "invalid";
    /** The engine's own message where there is one, so the visitor sees the real reason. */
    readonly message: string;
}

export type CompiledMatcher = MatcherOk | MatcherError;

export function compileMatcher(spec: MatchSpec): CompiledMatcher {
    if (spec.query.length === 0) {
        return { ok: false, reason: "empty", message: "" };
    }
    if (spec.query.length > MAX_PATTERN_LENGTH) {
        return {
            ok: false,
            reason: "too-long",
            message: `The pattern is ${spec.query.length} characters; the limit is ${MAX_PATTERN_LENGTH}.`,
        };
    }

    if (spec.mode === "plain") {
        const needle = spec.caseSensitive ? spec.query : spec.query.toLocaleLowerCase();
        return {
            ok: true,
            mode: "plain",
            test: (text) => {
                const subject = text.slice(0, MAX_SUBJECT_LENGTH);
                return (spec.caseSensitive ? subject : subject.toLocaleLowerCase()).includes(needle);
            },
        };
    }

    const baseFlags = spec.caseSensitive ? "" : "i";
    let expression: RegExp;
    try {
        // Unicode mode first, so \p{...} and astral characters behave. Some otherwise valid
        // patterns are rejected under `u`, so fall back rather than calling them invalid.
        expression = new RegExp(spec.query, `${baseFlags}u`);
    } catch {
        try {
            expression = new RegExp(spec.query, baseFlags);
        } catch (error) {
            return {
                ok: false,
                reason: "invalid",
                message: error instanceof Error ? error.message : String(error),
            };
        }
    }

    return {
        ok: true,
        mode: "regex",
        test: (text) => expression.test(text.slice(0, MAX_SUBJECT_LENGTH)),
    };
}
