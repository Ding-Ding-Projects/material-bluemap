import { describe, expect, it } from "vitest";
import {
    MAX_MATCHES,
    MAX_PATTERN_LENGTH,
    MAX_SAMPLE_LENGTH,
    SUPPORTED_FLAGS,
    compilePreviewPattern,
    compileSearchPattern,
    createSettingMatcher,
    escapeLiteral,
    evaluatePattern,
    includesCI,
    normalizeFlags,
} from "./regexEngine.js";

describe("the dialect the builder states", () => {
    it("is the host runtime's own RegExp, so a pattern the builder accepts is one the search runs", () => {
        const { regexp } = compileSearchPattern("(?<who>\\w+)@\\d+", "");
        expect(regexp).toBeInstanceOf(RegExp);
        expect(regexp?.exec("ambient@42")?.groups?.["who"]).toBe("ambient");
    });

    it("escapes every metacharacter so a literal matches itself", () => {
        const literal = "a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o/p-q";
        const { regexp } = compileSearchPattern(escapeLiteral(literal), "");
        expect(regexp?.test(literal)).toBe(true);
    });

    it("keeps only supported flags, in a stable order, without duplicates", () => {
        expect(normalizeFlags("miigx")).toBe("gim");
        expect(SUPPORTED_FLAGS).toEqual(["g", "i", "m", "s", "u", "y"]);
    });
});

describe("bounds", () => {
    it("refuses a pattern longer than the stated limit rather than compiling it", () => {
        const long = "a".repeat(MAX_PATTERN_LENGTH + 1);
        expect(compilePreviewPattern(long, "").error).toContain(String(MAX_PATTERN_LENGTH));
        expect(compileSearchPattern(long, "").regexp).toBeNull();
    });

    it("reports a syntax error instead of throwing", () => {
        const result = compilePreviewPattern("(unclosed", "");
        expect(result.regexp).toBeNull();
        expect(result.error).toBeTruthy();
    });

    it("truncates the sample and says so", () => {
        const result = evaluatePattern("a", "", "a".repeat(MAX_SAMPLE_LENGTH + 10));
        expect(result.sampleTruncated).toBe(true);
        expect(result.matches.length).toBeLessThanOrEqual(MAX_MATCHES);
    });

    it("stops at the match limit and says so", () => {
        const result = evaluatePattern("a", "", "a".repeat(MAX_MATCHES + 50));
        expect(result.truncated).toBe(true);
        expect(result.matches).toHaveLength(MAX_MATCHES);
    });
});

describe("zero-width matches", () => {
    it("terminates on an empty pattern rather than looping forever", () => {
        const result = evaluatePattern("(?:)", "", "abc");
        expect(result.error).toBeNull();
        expect(result.matches.length).toBeGreaterThan(0);
        expect(result.matches.length).toBeLessThanOrEqual(4);
    });

    it("terminates on a quantifier that can match nothing", () => {
        const result = evaluatePattern("a*", "", "bbb");
        expect(result.matches.every((match) => match.text === "")).toBe(true);
    });
});

describe("capture groups", () => {
    it("reports numbered groups by position", () => {
        const result = evaluatePattern("(\\w)(\\d)", "", "a1 b2");
        expect(result.matches).toHaveLength(2);
        expect(result.matches[0]?.groups.map((group) => group.value)).toEqual(["a", "1"]);
    });

    it("reports named groups by name alongside the numbered ones", () => {
        const result = evaluatePattern("(?<letter>[a-z])", "", "q");
        expect(result.matches[0]?.groups.map((group) => group.name)).toContain("letter");
    });
});

describe("unicode and multiline", () => {
    it("honours the u flag", () => {
        const result = evaluatePattern("\\p{Letter}+", "u", "sky 天空");
        expect(result.matches.map((match) => match.text)).toContain("天空");
    });

    it("honours the m flag on anchors", () => {
        const result = evaluatePattern("^b", "m", "a\nb\nc");
        expect(result.matches).toHaveLength(1);
    });

    it("scans past the first line even without m, because the preview always forces g", () => {
        const result = evaluatePattern("\\w+", "", "a\nb");
        expect(result.matches).toHaveLength(2);
    });
});

describe("the search predicate", () => {
    it("is a case-insensitive substring test by default", () => {
        const matcher = createSettingMatcher("Ambient", false, "");
        expect(matcher.test("ambient-light")).toBe(true);
        expect(matcher.test("sky-light")).toBe(false);
        expect(matcher.error).toBeNull();
    });

    it("matches everything when the query is empty, and says it is not filtering", () => {
        const matcher = createSettingMatcher("", false, "");
        expect(matcher.active).toBe(false);
        expect(matcher.test("anything at all")).toBe(true);
    });

    it("treats the query literally in plain-text mode, even when it looks like a pattern", () => {
        const matcher = createSettingMatcher("a.c", false, "");
        expect(matcher.test("a.c")).toBe(true);
        expect(matcher.test("abc")).toBe(false);
    });

    it("only treats it as a pattern once regex mode is turned on", () => {
        const matcher = createSettingMatcher("a.c", true, "");
        expect(matcher.test("abc")).toBe(true);
    });

    it("matches nothing on an invalid pattern rather than falling back to a stale one", () => {
        const matcher = createSettingMatcher("(unclosed", true, "");
        expect(matcher.error).toBeTruthy();
        expect(matcher.test("unclosed")).toBe(false);
    });

    it("drops g and y so one instance can be reused across many candidates", () => {
        const matcher = createSettingMatcher("a", true, "gy");
        expect([matcher.test("a"), matcher.test("a"), matcher.test("a")]).toEqual([true, true, true]);
    });

    it("keeps i, which is the flag people actually reach for", () => {
        expect(createSettingMatcher("SKY", true, "i").test("sky-color")).toBe(true);
        expect(createSettingMatcher("SKY", true, "").test("sky-color")).toBe(false);
    });
});

describe("adversarial input", () => {
    /*
     * This assertion used to read `expect(result.error).toBeNull()` against twenty
     * characters of `a`, and it passed for the wrong reason: twenty characters is
     * about a million steps, which returns. The size limits allow twenty *thousand*,
     * which is 2^20000 and does not, and the wall-clock budget never gets a look in
     * because it is checked between matches and the first one never completes.
     *
     * So the shape is refused before it is compiled, and what is asserted here is the
     * refusal. `regexRisk.test.ts` next door holds the rest: which shapes are caught,
     * which ordinary patterns must keep working, and the timing proof against a sample
     * the size limits alone would have waved through.
     */
    it("refuses a nested unbounded quantifier rather than hanging on one", () => {
        const started = Date.now();
        const result = evaluatePattern("(a+)+$", "", `${"a".repeat(20)}b`);

        expect(Date.now() - started).toBeLessThan(5000);
        expect(result.matches).toEqual([]);
        expect(result.error).toContain("exponential time");
    });

    it("still runs the same search written without the redundant nesting", () => {
        const result = evaluatePattern("a+$", "", `${"a".repeat(20)}b`);
        expect(result.error).toBeNull();
    });
});

describe("includesCI", () => {
    it("ignores case in both directions", () => {
        expect(includesCI("Render Threads", "render")).toBe(true);
        expect(includesCI("render threads", "RENDER")).toBe(true);
        expect(includesCI("render", "threads")).toBe(false);
    });
});
