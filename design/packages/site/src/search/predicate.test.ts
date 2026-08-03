import { describe, expect, it } from "vitest";

import { createPlainTextMatcher, excerptAround, toHighlightRuns } from "./predicate.js";

describe("createPlainTextMatcher", () => {
    it("matches a literal exactly, treating regex syntax as ordinary characters", () => {
        const matcher = createPlainTextMatcher("a.b", false);
        expect(matcher.test("a.b")).toBe(true);
        expect(matcher.test("axb")).toBe(false);
    });

    it("ignores case by default and respects it when asked", () => {
        expect(createPlainTextMatcher("Tab", false).test("close tab")).toBe(true);
        expect(createPlainTextMatcher("Tab", true).test("close tab")).toBe(false);
    });

    it("keeps offsets correct for case-insensitive Unicode input", () => {
        // Folding this with toLowerCase() turns one code unit into two and puts every highlight
        // that follows it in the wrong place, which is why the matcher does not fold at all.
        const matcher = createPlainTextMatcher("İ", false);
        expect(matcher.firstSpan("İstanbul")).toEqual({ start: 0, end: 1 });
        expect("İstanbul".toLowerCase().length).toBe(9);
    });

    it("matches Cantonese and other non-Latin text", () => {
        const matcher = createPlainTextMatcher("規則", false);
        expect(matcher.test("砌 42 個規則")).toBe(true);
        expect(matcher.firstSpan("砌 42 個規則")).toEqual({ start: 6, end: 8 });
    });

    it("never matches on an empty query, so an empty field selects nothing implicitly", () => {
        const matcher = createPlainTextMatcher("", false);
        expect(matcher.test("anything")).toBe(false);
        expect(matcher.spans("anything")).toEqual([]);
    });

    it("reports every occurrence up to the span limit", () => {
        const matcher = createPlainTextMatcher("a", false);
        expect(matcher.spans("banana")).toEqual([
            { start: 1, end: 2 },
            { start: 3, end: 4 },
            { start: 5, end: 6 },
        ]);
        expect(matcher.spans("a".repeat(50), 5)).toHaveLength(5);
    });
});

describe("toHighlightRuns", () => {
    it("splits a value into plain and matched runs", () => {
        expect(toHighlightRuns("banana", [{ start: 1, end: 2 }])).toEqual([
            { text: "b", matched: false },
            { text: "a", matched: true },
            { text: "nana", matched: false },
        ]);
    });

    it("returns one plain run when there is nothing to highlight", () => {
        expect(toHighlightRuns("banana", [])).toEqual([{ text: "banana", matched: false }]);
    });

    it("ignores spans that overlap or fall outside the value", () => {
        expect(
            toHighlightRuns("abc", [
                { start: 0, end: 2 },
                { start: 1, end: 3 },
                { start: 5, end: 9 },
            ]),
        ).toEqual([
            { text: "ab", matched: true },
            { text: "c", matched: false },
        ]);
    });

    it("keeps a zero width span from swallowing the rest of the text", () => {
        expect(toHighlightRuns("abc", [{ start: 1, end: 1 }])).toEqual([
            { text: "a", matched: false },
            { text: "", matched: true },
            { text: "bc", matched: false },
        ]);
    });
});

describe("excerptAround", () => {
    it("centres the excerpt on the match and translates the span", () => {
        const body = `${"x".repeat(200)}needle${"y".repeat(200)}`;
        const excerpt = excerptAround(body, { start: 200, end: 206 }, 20);
        expect(excerpt.text.slice(excerpt.span?.start ?? 0, excerpt.span?.end ?? 0)).toBe("needle");
        expect(excerpt.truncatedStart).toBe(true);
        expect(excerpt.truncatedEnd).toBe(true);
    });

    it("falls back to the opening text when there is no match", () => {
        const excerpt = excerptAround("short body", null, 20);
        expect(excerpt.text).toBe("short body");
        expect(excerpt.span).toBeNull();
        expect(excerpt.truncatedEnd).toBe(false);
    });
});
