import { describe, expect, it } from "vitest";

import { specFromSnapshot } from "./attachBuilder.js";
import { memoryPreferenceStore } from "./preferences.js";
import { SearchQueryModel } from "./queryModel.js";

function model(): SearchQueryModel {
    return new SearchQueryModel({ fieldId: "attached", store: memoryPreferenceStore() });
}

describe("specFromSnapshot", () => {
    it("reports the literal in plain mode, under the name the tab matcher uses", () => {
        const field = model();
        field.setFieldValue("a.b");
        expect(specFromSnapshot(field.snapshot())).toEqual({
            query: "a.b",
            mode: "plain",
            caseSensitive: false,
            flags: "giu",
            valid: true,
            message: null,
        });
    });

    it("reports the pattern in regex mode", () => {
        const field = model();
        field.setFieldValue("a.b");
        field.setMode("regex");
        const spec = specFromSnapshot(field.snapshot());
        expect(spec.mode).toBe("regex");
        expect(spec.query).toBe("a\\.b");
    });

    it("marks an invalid pattern as not valid and carries the engine's message", () => {
        const field = model();
        field.setMode("regex");
        field.setPattern("(");
        const spec = specFromSnapshot(field.snapshot());
        expect(spec.valid).toBe(false);
        expect(spec.message).not.toBeNull();
    });

    it("tracks Match case in both directions", () => {
        const field = model();
        field.setCaseSensitive(true);
        expect(specFromSnapshot(field.snapshot()).caseSensitive).toBe(true);
        expect(specFromSnapshot(field.snapshot()).flags).not.toContain("i");
    });
});
