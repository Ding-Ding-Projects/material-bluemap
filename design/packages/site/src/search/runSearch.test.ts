import { describe, expect, it } from "vitest";

import { BoundedRegexEvaluator } from "./evaluator.js";
import { memoryPreferenceStore } from "./preferences.js";
import { SearchQueryModel } from "./queryModel.js";
import { buildCandidateIndex, resolveHits, runSearch } from "./runSearch.js";
import type { CandidateField } from "./runSearch.js";
import { createInProcessChannel } from "./workerChannel.js";

function evaluator(timeoutMs = 2000): BoundedRegexEvaluator {
    return new BoundedRegexEvaluator({ spawn: () => createInProcessChannel(), timeoutMs });
}

function model(): SearchQueryModel {
    return new SearchQueryModel({ fieldId: "test", store: memoryPreferenceStore() });
}

describe("runSearch", () => {
    it("lists everything when there is no query", async () => {
        const outcome = await runSearch({ kind: "empty" }, ["a", "b"], evaluator());
        expect(outcome.status).toBe("all");
    });

    it("matches plain text without touching the evaluator", async () => {
        const broken = new BoundedRegexEvaluator({ spawn: () => null });
        const outcome = await runSearch(
            { kind: "text", query: "tab", caseSensitive: false },
            ["Close Tab", "Settings"],
            broken,
        );
        expect(outcome.status).toBe("ok");
        if (outcome.status === "ok") {
            expect(outcome.hits.map((hit) => hit.index)).toEqual([0]);
        }
    });

    it("gives different results for the same input in plain text and in regex", async () => {
        const candidates = ["a.b", "axb", "a-b"];
        const bounded = evaluator();

        const plain = await runSearch(
            { kind: "text", query: "a.b", caseSensitive: false },
            candidates,
            bounded,
        );
        const regex = await runSearch(
            { kind: "regex", pattern: "a.b", flags: "gu" },
            candidates,
            bounded,
        );

        expect(plain.status).toBe("ok");
        expect(regex.status).toBe("ok");
        if (plain.status === "ok" && regex.status === "ok") {
            // Plain text finds the one string that really contains a dot; the pattern finds all
            // three, because there the dot means "any character".
            expect(plain.hits.map((hit) => hit.index)).toEqual([0]);
            expect(regex.hits.map((hit) => hit.index)).toEqual([0, 1, 2]);
        }
        bounded.dispose();
    });

    it("reports an invalid pattern instead of matching nothing quietly", async () => {
        const outcome = await runSearch(
            { kind: "invalid", message: "Unterminated group" },
            ["a"],
            evaluator(),
        );
        expect(outcome).toEqual({ status: "invalid", message: "Unterminated group" });
    });

    it("passes a limit violation through as a limit", async () => {
        const bounded = evaluator();
        const outcome = await runSearch(
            { kind: "regex", pattern: "a", flags: "" },
            ["a".repeat(100001)],
            bounded,
        );
        expect(outcome.status).toBe("limit");
        bounded.dispose();
    });

    it("finds a zero width regex match and reports an empty span", async () => {
        const bounded = evaluator();
        const outcome = await runSearch({ kind: "regex", pattern: "^", flags: "" }, ["ab"], bounded);
        expect(outcome.status).toBe("ok");
        if (outcome.status === "ok") {
            expect(outcome.hits[0]?.span).toEqual({ start: 0, end: 0 });
        }
        bounded.dispose();
    });

    it("runs a model's own effective query end to end in both modes", async () => {
        const field = model();
        const bounded = evaluator();
        const candidates = ["Map view", "map settings", "Markers"];

        field.setFieldValue("map");
        const plain = await runSearch(field.effectiveQuery(), candidates, bounded);
        expect(plain.status === "ok" && plain.hits.length).toBe(2);

        field.setMode("regex");
        field.setPattern("^Map");
        const sensitive = await runSearch(field.effectiveQuery(), candidates, bounded);
        expect(sensitive.status === "ok" && sensitive.hits.map((hit) => hit.index)).toEqual([0, 1]);

        field.setCaseSensitive(true);
        const strict = await runSearch(field.effectiveQuery(), candidates, bounded);
        expect(strict.status === "ok" && strict.hits.map((hit) => hit.index)).toEqual([0]);
        bounded.dispose();
    });
});

interface Row {
    readonly title: string;
    readonly body: string;
}

const ROW_FIELDS: readonly CandidateField<Row, "title" | "body">[] = [
    { name: "title", get: (row) => row.title },
    { name: "body", get: (row) => row.body },
];

describe("buildCandidateIndex and resolveHits", () => {
    const rows: Row[] = [
        { title: "Tabs", body: "Tab strips overflow into a menu." },
        { title: "Settings", body: "Appearance and language." },
        { title: "Empty", body: "" },
    ];

    it("flattens items into candidates and remembers where each came from", () => {
        const index = buildCandidateIndex(rows, ROW_FIELDS);
        expect(index.values).toHaveLength(5);
        expect(index.owners[0]).toEqual({ itemIndex: 0, field: "title" });
        expect(index.owners[4]).toEqual({ itemIndex: 2, field: "title" });
    });

    it("keeps one hit per item, preferring the earlier field", () => {
        const index = buildCandidateIndex(rows, ROW_FIELDS);
        const resolved = resolveHits(index, ["title", "body"], [
            { index: 1, span: { start: 0, end: 3 } },
            { index: 0, span: { start: 0, end: 3 } },
        ]);
        expect(resolved).toHaveLength(1);
        expect(resolved[0]?.field).toBe("title");
    });

    it("returns results in item order rather than in hit order", () => {
        const index = buildCandidateIndex(rows, ROW_FIELDS);
        const resolved = resolveHits(index, ["title", "body"], [
            { index: 2, span: null },
            { index: 0, span: null },
        ]);
        expect(resolved.map((hit) => hit.itemIndex)).toEqual([0, 1]);
    });
});
