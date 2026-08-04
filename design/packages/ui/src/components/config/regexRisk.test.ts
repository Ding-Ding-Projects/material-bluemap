/**
 * The complexity guard, on the patterns it has to get right in both directions.
 *
 * Two kinds of failure matter here and they pull against each other. Missing a
 * catastrophic pattern hangs the window with no way back, so the classic shapes
 * are pinned one by one. Refusing an ordinary pattern is quieter and just as
 * real: somebody searching their settings for `(sky|fog)-color` gets told no for
 * no reason, and the only evidence is a search that will not run. So the larger
 * half of this file is patterns that must be allowed.
 *
 * The timing test at the end is the one that would actually have caught the gap
 * this guard was written to close. It runs the real engine, against a sample the
 * engine's own limits allow, and asserts it comes back.
 */

import { describe, expect, it } from "vitest";
import { backtrackingRefusal, inspectPattern } from "./regexRisk.js";
import { compilePreviewPattern, compileSearchPattern, evaluatePattern } from "./regexEngine.js";

/** Reads better than `.risky` at every call site below. */
function refused(pattern: string): boolean {
    return inspectPattern(pattern).risky;
}

describe("nested unbounded quantifiers", () => {
    it("refuses the textbook exponential shapes", () => {
        expect(refused("(a+)+")).toBe(true);
        expect(refused("(a*)*")).toBe(true);
        expect(refused("(a+)*")).toBe(true);
        expect(refused("(a*)+")).toBe(true);
        expect(refused("(a+)+$")).toBe(true);
    });

    it("refuses them through a character class or a shorthand", () => {
        expect(refused("([a-z]+)+")).toBe(true);
        expect(refused("(\\d+)+")).toBe(true);
        expect(refused("(\\w*)*")).toBe(true);
        expect(refused("(.*)*")).toBe(true);
    });

    it("refuses them when the two quantifiers are not adjacent", () => {
        expect(refused("((a+)b)+")).toBe(true);
        expect(refused("(x(y+)z)*")).toBe(true);
        expect(refused("((\\w+)\\s)+")).toBe(true);
    });

    it("refuses a non-capturing group, which changes nothing about the backtracking", () => {
        expect(refused("(?:a+)+")).toBe(true);
        expect(refused("(?:[a-z]*)*")).toBe(true);
    });

    it("refuses the braced spelling of an open upper bound", () => {
        expect(refused("(a{1,})+")).toBe(true);
        expect(refused("(a+){2,}")).toBe(true);
    });

    it("still refuses when the repetition is lazy, which changes the order and not the count", () => {
        expect(refused("(a+?)+")).toBe(true);
        expect(refused("(a+)+?")).toBe(true);
    });

    it("names the shape and the fix rather than reporting a bare failure", () => {
        const reason = backtrackingRefusal("(a+)+") ?? "";
        expect(reason).toContain("unbounded repetition");
        expect(reason).toContain("a+ rather than (a+)+");
    });
});

describe("a repeated group with identical alternatives", () => {
    it("refuses two branches written the same way", () => {
        expect(refused("(a|a)+")).toBe(true);
        expect(refused("(foo|bar|foo)*")).toBe(true);
    });

    it("allows branches that merely start alike, which is not what it claims to detect", () => {
        // `(a|ab)+` really is ambiguous and really can blow up. Deciding that needs
        // an ambiguity analysis rather than a comparison, and an approximation of
        // one refuses ordinary patterns. The gap is documented in `regexRisk.ts`.
        expect(refused("(a|ab)+")).toBe(false);
    });

    it("says which of the two problems it found", () => {
        expect(backtrackingRefusal("(a|a)+") ?? "").toContain("alternatives are identical");
    });
});

describe("patterns a person would actually type, which must all be allowed", () => {
    const allowed = [
        "sky",
        "^render-threads$",
        "sky|fog",
        "(sky|fog)-color",
        "(sky|fog)+",
        "\\d+",
        "[a-z]+",
        ".*",
        "^\\s*#",
        "world/(nether|end)",
        "(?<dimension>overworld|nether)",
        "(\\d{1,3}\\.){3}\\d{1,3}",
        "https?://\\S+",
        "a{2,5}",
        "(ab)+",
        "(ab)?",
        "(ab)*c",
        "\\(literal\\+\\)\\+",
        "[+*{]+",
        "x\\{2\\}",
        "(a)(b)(c)+",
        "^(?!draft)",
        "colou?r",
    ];

    it.each(allowed)("allows %s", (pattern) => {
        expect(refused(pattern)).toBe(false);
    });
});

describe("input the guard must not choke on", () => {
    it("draws no conclusion from an unbalanced pattern, which the compiler will reject anyway", () => {
        expect(refused("(a+")).toBe(false);
        expect(refused("a+)")).toBe(false);
        expect(refused("")).toBe(false);
    });

    it("reads an escaped metacharacter as the literal it is", () => {
        // `\(` `\)` are literal parentheses, so there is no group here to repeat.
        expect(refused("\\(a\\+\\)\\+")).toBe(false);
    });

    it("reads a quantifier inside a character class as a member of the class", () => {
        expect(refused("([*+]+)x")).toBe(false);
        expect(refused("[)(]+")).toBe(false);
    });
});

describe("the engine refuses what the guard flags, on both compile paths", () => {
    it("refuses the preview, so the builder shows the reason instead of hanging", () => {
        const compiled = compilePreviewPattern("(a+)+$", "");
        expect(compiled.regexp).toBeNull();
        expect(compiled.error).toContain("unbounded repetition");
    });

    it("refuses the search predicate, so the filter cannot run what the preview would not", () => {
        const compiled = compileSearchPattern("(a+)+$", "i");
        expect(compiled.regexp).toBeNull();
        expect(compiled.error).toContain("unbounded repetition");
    });

    it("returns immediately on a sample the size limits alone would have allowed", () => {
        // Nineteen thousand characters is well inside MAX_SAMPLE_LENGTH, and `(a+)+$`
        // over it is 2^19000 steps against text that does not match. Before the guard
        // this call did not return at all: the wall-clock budget is checked between
        // matches, and there was never going to be a first one. The assertion is that
        // it now comes back, and says why.
        const started = Date.now();
        const result = evaluatePattern("(a+)+$", "", `${"a".repeat(19000)}b`);

        expect(Date.now() - started).toBeLessThan(1000);
        expect(result.matches).toEqual([]);
        expect(result.error).toContain("exponential time");
    });

    it("leaves the same search working once the redundant nesting is dropped", () => {
        // The point of refusing rather than silently degrading: the intent behind
        // `(a+)+$` is expressible without the nesting, and that form runs fine over
        // the same text.
        const result = evaluatePattern("^a+$", "", `${"a".repeat(19000)}b`);
        expect(result.error).toBeNull();
        expect(result.matches).toEqual([]);
    });
});
