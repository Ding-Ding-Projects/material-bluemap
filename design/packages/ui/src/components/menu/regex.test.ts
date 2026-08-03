import { describe, expect, it } from "vitest";
import {
    MAX_MATCHES,
    MAX_PATTERN_LENGTH,
    MAX_SAMPLE_LENGTH,
    compilePattern,
    createMatcher,
    evaluatePattern,
    includesCI,
} from "./regex";

describe("compilePattern", () => {
    it("compiles a valid pattern with its flags", () => {
        const { regex, error } = compilePattern("a(b)c", "gi");
        expect(error).toBeNull();
        expect(regex?.source).toBe("a(b)c");
        expect(regex?.flags).toBe("gi");
    });

    it("reports a syntax error instead of throwing", () => {
        const { regex, error } = compilePattern("a(", "");
        expect(regex).toBeNull();
        expect(error).toBeTruthy();
    });

    it("drops flags this dialect does not offer", () => {
        expect(compilePattern("a", "giz").regex?.flags).toBe("gi");
    });

    it("refuses a pattern over the length limit", () => {
        const { regex, error } = compilePattern("a".repeat(MAX_PATTERN_LENGTH + 1), "");
        expect(regex).toBeNull();
        expect(error).toContain(String(MAX_PATTERN_LENGTH));
    });
});

describe("evaluatePattern", () => {
    it("returns no matches and no error for an empty pattern", () => {
        const result = evaluatePattern("", "", "anything");
        expect(result.ok).toBe(true);
        expect(result.matches).toEqual([]);
    });

    it("reports numbered and named capture groups", () => {
        const result = evaluatePattern("(?<letter>[a-z])(\\d)", "", "a1 b2");
        expect(result.matches).toHaveLength(2);
        expect(result.matches[0]?.text).toBe("a1");
        expect(result.matches[0]?.index).toBe(0);
        expect(result.matches[0]?.groups).toEqual(["a", "1"]);
        expect(result.matches[0]?.named).toEqual({ letter: "a" });
    });

    it("terminates on a zero-width pattern", () => {
        const result = evaluatePattern("(?:)", "", "abc");
        expect(result.ok).toBe(true);
        expect(result.matches.every((match) => match.text === "")).toBe(true);
        expect(result.matches.length).toBeLessThanOrEqual(MAX_MATCHES);
    });

    it("terminates on an always-empty quantifier", () => {
        const result = evaluatePattern("a*", "", "bbbb");
        expect(result.ok).toBe(true);
        expect(result.matches.length).toBeLessThanOrEqual(MAX_MATCHES);
    });

    it("truncates rather than returning an unbounded list", () => {
        const result = evaluatePattern("a", "", "a".repeat(MAX_MATCHES + 50));
        expect(result.matches).toHaveLength(MAX_MATCHES);
        expect(result.truncated).toBe(true);
    });

    it("scans globally even when the user did not set the g flag", () => {
        expect(evaluatePattern("a", "", "aaa").matches).toHaveLength(3);
    });

    it("honours the multiline flag on anchors", () => {
        expect(evaluatePattern("^b", "m", "a\nb").matches).toHaveLength(1);
        expect(evaluatePattern("^b", "", "a\nb").matches).toHaveLength(0);
    });

    it("matches Unicode with the u flag", () => {
        expect(evaluatePattern("\\p{Lu}", "u", "aÉb").matches[0]?.text).toBe("É");
    });

    it("reports a syntax error rather than matching nothing silently", () => {
        const result = evaluatePattern("a(", "", "aaa");
        expect(result.ok).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it("refuses a sample over the length limit", () => {
        const result = evaluatePattern("a", "", "a".repeat(MAX_SAMPLE_LENGTH + 1));
        expect(result.ok).toBe(false);
        expect(result.error).toContain(String(MAX_SAMPLE_LENGTH));
    });
});

describe("includesCI", () => {
    it("ignores case", () => {
        expect(includesCI("Overworld", "world")).toBe(true);
        expect(includesCI("Overworld", "WORLD")).toBe(true);
        expect(includesCI("Overworld", "nether")).toBe(false);
    });
});

describe("createMatcher", () => {
    it("matches everything when the query is empty", () => {
        expect(createMatcher("", false, "i").test("anything")).toBe(true);
        expect(createMatcher("", true, "i").test("anything")).toBe(true);
    });

    it("treats a plain-text query literally", () => {
        const matcher = createMatcher("a.c", false, "i");
        expect(matcher.test("a.c")).toBe(true);
        expect(matcher.test("abc")).toBe(false);
    });

    it("treats a regex query as a pattern once regex mode is on", () => {
        const matcher = createMatcher("a.c", true, "i");
        expect(matcher.test("abc")).toBe(true);
        expect(matcher.test("AxC")).toBe(true);
    });

    it("matches nothing and reports the error for an invalid pattern", () => {
        const matcher = createMatcher("a(", true, "i");
        expect(matcher.error).toBeTruthy();
        expect(matcher.test("a(")).toBe(false);
    });

    it("does not let lastIndex leak between candidates with a global flag", () => {
        const matcher = createMatcher("a", true, "g");
        expect(matcher.test("a")).toBe(true);
        expect(matcher.test("a")).toBe(true);
        expect(matcher.test("a")).toBe(true);
    });

    it("returns to the literal query when regex mode is turned back off", () => {
        const query = "a+b";
        expect(createMatcher(query, true, "i").test("aaab")).toBe(true);
        expect(createMatcher(query, false, "i").test("aaab")).toBe(false);
        expect(createMatcher(query, false, "i").test("a+b")).toBe(true);
    });
});
