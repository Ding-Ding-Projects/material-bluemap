import { describe, expect, it } from "vitest";

import {
    REGEX_LIMITS,
    createRegexEngine,
    escapeRegExp,
    findBacktrackingRisk,
} from "./engine.js";
import { buildRegexWorkerSource } from "./workerChannel.js";
import type { RegexResponse } from "./workerChannel.js";

const engine = createRegexEngine();

describe("createRegexEngine", () => {
    it("reports the limits the user-facing copy quotes", () => {
        expect(engine.limits).toEqual(REGEX_LIMITS);
    });

    it("matches a valid pattern and reports the position of every match", () => {
        const result = engine.runRegex({ pattern: "\\d+", flags: "g", sample: "a1 bb 234" });
        expect(result.matches.map((match) => match.value)).toEqual(["1", "234"]);
        expect(result.matches[0]).toMatchObject({ index: 1, end: 2 });
        expect(result.matches[1]).toMatchObject({ index: 6, end: 9 });
        expect(result.truncated).toBe(false);
    });

    it("throws a syntax error for an invalid pattern rather than matching nothing", () => {
        expect(() => engine.runRegex({ pattern: "(unclosed", flags: "", sample: "x" })).toThrow(
            SyntaxError,
        );
    });

    it("returns an empty result for a valid pattern that matches nothing", () => {
        const result = engine.runRegex({ pattern: "zzz", flags: "g", sample: "abc" });
        expect(result.matches).toEqual([]);
        expect(result.truncated).toBe(false);
    });

    it("handles Unicode property escapes and astral characters", () => {
        const result = engine.runRegex({
            pattern: "\\p{Script=Han}+",
            flags: "gu",
            sample: "hello 廣東話 world",
        });
        expect(result.matches.map((match) => match.value)).toEqual(["廣東話"]);

        const astral = engine.runRegex({ pattern: ".", flags: "gu", sample: "😀a" });
        expect(astral.matches.map((match) => match.value)).toEqual(["😀", "a"]);
    });

    it("anchors per line with the multiline flag and per string without it", () => {
        const multiline = engine.runRegex({
            pattern: "^b",
            flags: "gm",
            sample: "a\nb\nb",
        });
        expect(multiline.matches).toHaveLength(2);

        const single = engine.runRegex({ pattern: "^b", flags: "g", sample: "a\nb\nb" });
        expect(single.matches).toHaveLength(0);
    });

    it("advances past zero width matches instead of looping forever", () => {
        const result = engine.runRegex({ pattern: "(?:)", flags: "g", sample: "ab" });
        expect(result.matches.map((match) => match.index)).toEqual([0, 1, 2]);
        expect(result.matches.every((match) => match.index === match.end)).toBe(true);
    });

    it("advances by a whole code point for zero width matches in Unicode mode", () => {
        const result = engine.runRegex({ pattern: "(?:)", flags: "gu", sample: "😀" });
        expect(result.matches.map((match) => match.index)).toEqual([0, 2]);
    });

    it("reports numbered and named capture groups, including groups that did not participate", () => {
        const result = engine.runRegex({
            pattern: "(?<letter>[a-z])(\\d)?",
            flags: "g",
            sample: "a1 b",
        });
        expect(result.matches[0]?.namedGroups).toEqual({ letter: "a" });
        expect(result.matches[0]?.captures).toEqual(["a", "1"]);
        expect(result.matches[1]?.captures).toEqual(["b", null]);
    });

    it("truncates at the match limit and says so", () => {
        const result = engine.runRegex({
            pattern: "a",
            flags: "g",
            sample: "a".repeat(20),
            maxMatches: 5,
        });
        expect(result.matches).toHaveLength(5);
        expect(result.truncated).toBe(true);
    });

    it("refuses input beyond the stated limits", () => {
        expect(() =>
            engine.runRegex({
                pattern: "a".repeat(REGEX_LIMITS.maxPatternLength + 1),
                flags: "",
                sample: "a",
            }),
        ).toThrow(RangeError);
        expect(() =>
            engine.runRegex({
                pattern: "a",
                flags: "",
                sample: "a".repeat(REGEX_LIMITS.maxSampleLength + 1),
            }),
        ).toThrow(RangeError);
    });

    it("completes on a small adversarial input, which is the shape the timeout exists for", () => {
        const started = Date.now();
        const result = engine.runRegex({
            pattern: "(a+)+$",
            flags: "",
            sample: `${"a".repeat(16)}!`,
        });
        expect(result.matches).toHaveLength(0);
        // The point is not the duration, it is that this shape grows exponentially with the input.
        expect(Date.now() - started).toBeLessThan(10000);
    });

    it("filters candidate strings and reports where each one first matched", () => {
        const result = engine.filterCandidates({
            pattern: "b",
            flags: "g",
            candidates: ["abc", "xyz", "bbb"],
        });
        expect(result.hits).toEqual([
            { index: 0, start: 1, end: 2 },
            { index: 2, start: 0, end: 1 },
        ]);
    });

    it("does not let a global or sticky flag leak lastIndex between candidates", () => {
        const global = engine.filterCandidates({
            pattern: "a",
            flags: "g",
            candidates: ["a", "a", "a"],
        });
        expect(global.hits).toHaveLength(3);

        const sticky = engine.filterCandidates({
            pattern: "a",
            flags: "y",
            candidates: ["a", "a"],
        });
        expect(sticky.hits).toHaveLength(2);
    });
});

describe("escapeRegExp", () => {
    it("makes a literal match only itself", () => {
        const pattern = new RegExp(escapeRegExp("a.b"), "u");
        expect(pattern.test("a.b")).toBe(true);
        expect(pattern.test("axb")).toBe(false);
    });

    it("produces a pattern that compiles in Unicode mode", () => {
        // `\-` is a syntax error in Unicode mode outside a character class, so the escape set has
        // to stop at the syntax characters.
        expect(() => new RegExp(escapeRegExp("a-b [c] (d) {e} /f/ \\g"), "u")).not.toThrow();
        expect(new RegExp(escapeRegExp("a-b"), "u").test("a-b")).toBe(true);
    });
});

describe("findBacktrackingRisk", () => {
    it("warns about a quantifier nested inside a quantified group", () => {
        expect(findBacktrackingRisk("(a+)+")).toBe("nested-quantifier");
        expect(findBacktrackingRisk("^(\\w+\\s?)*$")).toBe("nested-quantifier");
    });

    it("warns about a repeated group containing alternation", () => {
        expect(findBacktrackingRisk("(a|a)*")).toBe("alternation-loop");
    });

    it("stays quiet for ordinary patterns", () => {
        expect(findBacktrackingRisk("\\d{4}-\\d{2}")).toBeNull();
        expect(findBacktrackingRisk("(?<word>[\\p{L}]+)")).toBeNull();
    });
});

describe("buildRegexWorkerSource", () => {
    interface FakeWorkerScope {
        listeners: ((event: { data: unknown }) => void)[];
        addEventListener(type: string, listener: (event: { data: unknown }) => void): void;
        postMessage(response: RegexResponse): void;
    }

    function startWorkerSource(): { scope: FakeWorkerScope; sent: RegexResponse[] } {
        const sent: RegexResponse[] = [];
        const scope: FakeWorkerScope = {
            listeners: [],
            addEventListener(type, listener) {
                if (type === "message") {
                    scope.listeners.push(listener);
                }
            },
            postMessage(response) {
                sent.push(response);
            },
        };
        // The worker source has to be a complete program on its own. If `createRegexEngine` ever
        // starts closing over a module-scope value, this call is where that breaks.
        new Function("self", buildRegexWorkerSource())(scope);
        return { scope, sent };
    }

    function send(scope: FakeWorkerScope, data: unknown): void {
        for (const listener of scope.listeners) {
            listener({ data });
        }
    }

    it("runs a pattern and answers with the matches", () => {
        const { scope, sent } = startWorkerSource();
        send(scope, { id: 7, op: "run", pattern: "\\w+", flags: "g", sample: "one two" });
        const response = sent[0];
        expect(response?.ok).toBe(true);
        if (response?.ok === true && response.op === "run") {
            expect(response.id).toBe(7);
            expect(response.result.matches.map((match) => match.value)).toEqual(["one", "two"]);
        }
    });

    it("filters candidates", () => {
        const { scope, sent } = startWorkerSource();
        send(scope, { id: 1, op: "filter", pattern: "^a", flags: "", candidates: ["ab", "ba"] });
        const response = sent[0];
        if (response === undefined || !response.ok || response.op !== "filter") {
            throw new Error("the worker source should have answered a filter request");
        }
        expect(response.result.hits).toEqual([{ index: 0, start: 0, end: 1 }]);
    });

    it("reports an invalid pattern as a failure code, not as a crash", () => {
        const { scope, sent } = startWorkerSource();
        send(scope, { id: 2, op: "run", pattern: "(", flags: "", sample: "x" });
        const response = sent[0];
        expect(response?.ok).toBe(false);
        if (response?.ok === false) {
            expect(response.code).toBe("invalid-pattern");
            expect(response.message).not.toBe("");
        }
    });

    it("reports an oversized input as a limit failure", () => {
        const { scope, sent } = startWorkerSource();
        send(scope, {
            id: 3,
            op: "run",
            pattern: "a",
            flags: "",
            sample: "a".repeat(REGEX_LIMITS.maxSampleLength + 1),
        });
        const response = sent[0];
        if (response === undefined || response.ok) {
            throw new Error("an oversized sample should be refused");
        }
        expect(response.code).toBe("limit-exceeded");
    });
});
