import { beforeEach, describe, expect, it } from "vitest";

import { memoryPreferenceStore } from "./preferences.js";
import type { SearchPreferenceStore } from "./preferences.js";
import { SearchQueryModel } from "./queryModel.js";

let store: SearchPreferenceStore;

function model(fieldId = "field-a"): SearchQueryModel {
    return new SearchQueryModel({ fieldId, store });
}

beforeEach(() => {
    store = memoryPreferenceStore();
});

describe("SearchQueryModel", () => {
    it("starts in plain text mode, which is the default everywhere", () => {
        expect(model().snapshot().mode).toBe("text");
    });

    it("shows the literal in plain text mode and the pattern in regex mode", () => {
        const field = model();
        field.setFieldValue("a.b");
        expect(field.snapshot().fieldValue).toBe("a.b");
        field.setMode("regex");
        expect(field.snapshot().fieldValue).toBe("a\\.b");
    });

    it("seeds the pattern from the literal so opting into regex does not change what matches", () => {
        const field = model();
        field.setQuery("a.b");
        field.setMode("regex");
        const snapshot = field.snapshot();
        expect(snapshot.pattern).toBe("a\\.b");
        expect(new RegExp(snapshot.pattern, "u").test("axb")).toBe(false);
        expect(new RegExp(snapshot.pattern, "u").test("a.b")).toBe(true);
    });

    it("restores the literal untouched when the visitor goes back to plain text", () => {
        const field = model();
        field.setQuery("a.b");
        field.setMode("regex");
        field.setPattern("a.b");
        field.setMode("text");
        expect(field.snapshot().query).toBe("a.b");
        expect(field.snapshot().fieldValue).toBe("a.b");
        expect(field.effectiveQuery()).toEqual({ kind: "text", query: "a.b", caseSensitive: false });
    });

    it("keeps a hand written pattern when the literal has not moved on", () => {
        const field = model();
        field.setQuery("abc");
        field.setMode("regex");
        field.setPattern("a.c");
        field.setMode("text");
        field.setMode("regex");
        expect(field.snapshot().pattern).toBe("a.c");
    });

    it("reseeds the pattern when the literal changed while in plain text mode", () => {
        const field = model();
        field.setQuery("abc");
        field.setMode("regex");
        field.setPattern("a.c");
        field.setMode("text");
        field.setQuery("xyz");
        field.setMode("regex");
        expect(field.snapshot().pattern).toBe("xyz");
    });

    it("treats Match case and the i flag as one value seen two ways", () => {
        const field = model();
        expect(field.snapshot().flags).toContain("i");
        expect(field.snapshot().caseSensitive).toBe(false);

        field.setCaseSensitive(true);
        expect(field.snapshot().flags).not.toContain("i");
        expect(field.snapshot().caseSensitive).toBe(true);

        field.setFlag("i", true);
        expect(field.snapshot().caseSensitive).toBe(false);
    });

    it("keeps flags in the order RegExp reports them", () => {
        const field = model();
        field.setFlags("miug");
        expect(field.snapshot().flags).toBe("gimu");
    });

    it("never holds both Unicode flags at once", () => {
        const field = model();
        field.setFlag("v", true);
        expect(field.snapshot().flags).toContain("v");
        expect(field.snapshot().flags).not.toContain("u");
        field.setFlag("u", true);
        expect(field.snapshot().flags).toContain("u");
        expect(field.snapshot().flags).not.toContain("v");
    });

    it("reports an invalid pattern and refuses to run anything", () => {
        const field = model();
        field.setMode("regex");
        field.setPattern("(unclosed");
        const snapshot = field.snapshot();
        expect(snapshot.validation.status).toBe("invalid");
        expect(snapshot.validation.message).not.toBeNull();
        expect(field.effectiveQuery().kind).toBe("invalid");
    });

    it("does not leave a stale valid pattern running once the pattern becomes invalid", () => {
        const field = model();
        field.setMode("regex");
        field.setPattern("\\d+");
        expect(field.effectiveQuery()).toEqual({ kind: "regex", pattern: "\\d+", flags: "giu" });
        field.setPattern("\\d+(");
        expect(field.effectiveQuery().kind).toBe("invalid");
    });

    it("warns about a backtracking shape without refusing the pattern", () => {
        const field = model();
        field.setMode("regex");
        field.setPattern("(a+)+$");
        const snapshot = field.snapshot();
        expect(snapshot.validation.status).toBe("valid");
        expect(snapshot.validation.risk).toBe("nested-quantifier");
    });

    it("treats an empty field as empty rather than as a match-everything query", () => {
        const field = model();
        expect(field.effectiveQuery()).toEqual({ kind: "empty" });
        field.setMode("regex");
        expect(field.effectiveQuery()).toEqual({ kind: "empty" });
    });

    it("notifies subscribers on every change and stops after unsubscribe", () => {
        const field = model();
        let calls = 0;
        const unsubscribe = field.subscribe(() => {
            calls += 1;
        });
        field.setQuery("a");
        field.setMode("regex");
        expect(calls).toBe(2);
        unsubscribe();
        field.setQuery("b");
        expect(calls).toBe(2);
    });

    it("remembers mode and flags per field, and never the query or the pattern", () => {
        const first = model("remembered");
        first.setMode("regex");
        first.setFlags("gm");
        first.setPattern("secret-looking-text");

        const stored = store.read("remembered");
        expect(stored).toEqual({ mode: "regex", flags: "gm" });
        expect(JSON.stringify(stored)).not.toContain("secret");

        const reopened = model("remembered");
        expect(reopened.snapshot().mode).toBe("regex");
        expect(reopened.snapshot().flags).toBe("gm");
        expect(reopened.snapshot().pattern).toBe("");
    });

    it("keeps two fields entirely separate", () => {
        const left = model("left");
        const right = model("right");
        left.setMode("regex");
        left.setPattern("\\d+");
        expect(right.snapshot().mode).toBe("text");
        expect(right.snapshot().pattern).toBe("");
    });

    it("clears the query without disturbing the mode or the flags", () => {
        const field = model();
        field.setMode("regex");
        field.setFlags("gm");
        field.setPattern("\\d+");
        field.clear();
        expect(field.snapshot().pattern).toBe("");
        expect(field.snapshot().mode).toBe("regex");
        expect(field.snapshot().flags).toBe("gm");
    });

    it("resets back to the shipped defaults", () => {
        const field = model();
        field.setMode("regex");
        field.setFlags("m");
        field.setPattern("\\d+");
        field.reset();
        expect(field.snapshot()).toMatchObject({ mode: "text", pattern: "", flags: "giu" });
    });

    it("writes a literal that can be pasted into JavaScript", () => {
        const field = model();
        field.setMode("regex");
        field.setPattern("\\d+");
        field.setFlags("gu");
        expect(field.toLiteral()).toBe("/\\d+/gu");
        field.clear();
        expect(field.toLiteral()).toBe("/(?:)/gu");
    });
});
