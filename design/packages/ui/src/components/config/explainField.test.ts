import { describe, expect, it } from "vitest";
import type { FieldMeta } from "@worldlens/config";
import { DOC_PREVIEW_LINES, docLinesOf, docShownText, isDocLong, provenanceOf } from "./explainField.js";

function field(overrides: Partial<FieldMeta> = {}): FieldMeta {
    return {
        path: "size",
        key: "size",
        segments: ["size"],
        javaField: "size",
        label: "Blur size",
        doc: "How wide the softened edge is, in blocks. 0 or less disables the blur.",
        group: "mask",
        control: { kind: "number", integer: true },
        default: 5,
        commentedOutInTemplate: false,
        hidden: false,
        invalidatesTiles: false,
        advanced: false,
        ...overrides,
    };
}

describe("the disclosure toggle", () => {
    it("treats three lines or fewer as already fully shown", () => {
        const doc = "one\ntwo\nthree";
        expect(docLinesOf(doc)).toHaveLength(3);
        expect(isDocLong(doc)).toBe(false);
        expect(docShownText(doc, false)).toBe(doc);
        expect(docShownText(doc, true)).toBe(doc);
    });

    it("collapses a doc past the preview length until it is opened", () => {
        const doc = "one\ntwo\nthree\nfour\nfive";
        expect(isDocLong(doc)).toBe(true);
        expect(docShownText(doc, false)).toBe("one\ntwo\nthree");
        expect(docShownText(doc, true)).toBe(doc);
    });

    it("matches ConfigField.vue's own preview length", () => {
        expect(DOC_PREVIEW_LINES).toBe(3);
    });
});

describe("provenance against a record", () => {
    it("reports a field the record never mentions as inherited", () => {
        const state = provenanceOf(field(), {});
        expect(state.explicit).toBe(false);
        expect(state.usingDefault).toBe(true);
        expect(state.defaultText).toBe("5");
    });

    it("reports a field written to the default value as explicit, not inherited", () => {
        const state = provenanceOf(field(), { size: 5 });
        expect(state.explicit).toBe(true);
        expect(state.usingDefault).toBe(true);
    });

    it("reports a field written to something other than the default as changed", () => {
        const state = provenanceOf(field(), { size: 12 });
        expect(state.explicit).toBe(true);
        expect(state.usingDefault).toBe(false);
    });

    it("does not confuse an explicit falsy value with an absent one", () => {
        const boolField = field({ path: "subtract", key: "subtract", segments: ["subtract"], control: { kind: "switch" }, default: false });
        const state = provenanceOf(boolField, { subtract: false });
        expect(state.explicit).toBe(true);
        expect(state.usingDefault).toBe(true);
    });

    it("renders a null default as an empty string, for the caller to fall back on", () => {
        const nullField = field({ path: "world", key: "world", segments: ["world"], control: { kind: "text" }, default: null });
        expect(provenanceOf(nullField, {}).defaultText).toBe("");
    });
});
