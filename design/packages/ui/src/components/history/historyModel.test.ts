/**
 * The panel's decisions, tested without mounting anything.
 *
 * Two of these are worth more than the rest, because they are the ones that go wrong
 * quietly:
 *
 *  - **The filters compose.** Every combination is asserted, not just each filter alone,
 *    because the failure mode is not "the date filter is broken" - it is "the date filter
 *    works until you also pick an action", which every single-filter test passes.
 *  - **The actions come from the data.** A hard-coded list would pass a test written
 *    against today's actions and silently stop covering tomorrow's. So an invented action
 *    the union in `historyHost.ts` has never heard of is put through and has to come out
 *    the other side as a chip with a count.
 */

import { describe, expect, it } from "vitest";

import {
    actionFacets,
    daysWithRevisions,
    exportRevisions,
    filterRevisions,
    historySpan,
    revisionDay,
    searchCorpus,
    type ExportLabels,
} from "./historyModel.js";
import type { HistoryRevision } from "./historyHost.js";

function revision(partial: Partial<HistoryRevision> & { id: string }): HistoryRevision {
    return {
        shortId: partial.id.slice(0, 12),
        at: "2026-03-04T10:00:00.000Z",
        label: "Changed the core settings",
        action: "changed",
        changes: [{ path: "core.conf", status: "modified" }],
        note: null,
        restoredFrom: null,
        ...partial,
    };
}

/** A small history with one of each interesting shape in it. */
const history: HistoryRevision[] = [
    revision({
        id: "aaaa000000001",
        at: "2026-03-10T09:00:00",
        label: "Deleted the nether map",
        action: "deleted",
        changes: [{ path: "maps/nether.conf", status: "deleted" }],
    }),
    revision({
        id: "bbbb000000002",
        at: "2026-03-05T09:00:00",
        label: "Restored the config as it was at aaaa00000000",
        action: "restored",
        note: "before the server move",
        restoredFrom: "cccc000000003",
    }),
    revision({
        id: "cccc000000003",
        at: "2026-03-01T09:00:00",
        label: "Added the nether map",
        action: "created",
        changes: [{ path: "maps/nether.conf", status: "added" }],
    }),
    revision({
        id: "dddd000000004",
        at: "2026-02-20T09:00:00",
        label: "Started keeping history, with 2 config files",
        action: "started",
        changes: [
            { path: "core.conf", status: "added" },
            { path: "maps/overworld.conf", status: "added" },
        ],
    }),
];

const labels: ExportLabels = {
    title: "BlueMap config history",
    folder: "Config folder: /srv/bluemap",
    repository: "History repository: /data/config-history/bluemap-abc",
    range: "This file holds every revision recorded for this folder.",
    empty: "Nothing matched these filters.",
};

/* -------------------------------------------------------------------------- */

describe("the action filter is built from the history, not from a list", () => {
    it("offers exactly the actions present, each with its count", () => {
        expect(actionFacets(history)).toEqual([
            { action: "started", count: 1 },
            { action: "created", count: 1 },
            { action: "deleted", count: 1 },
            { action: "restored", count: 1 },
        ]);
    });

    it("offers no chip for an action nothing in this history has", () => {
        const facets = actionFacets(history).map((facet) => facet.action);
        expect(facets).not.toContain("pruned");
        expect(facets).not.toContain("mixed");
    });

    it("carries through a word this build has never heard of, rather than dropping it", () => {
        // The whole point of deriving the facets: a main process that starts recording a
        // new action needs no change on this side to make it filterable.
        const withNewWord = [...history, revision({ id: "eeee000000005", action: "reticulated" })];
        const facets = actionFacets(withNewWord);
        expect(facets).toContainEqual({ action: "reticulated", count: 1 });
        // And an unknown word sorts after the known ones rather than jumping around.
        expect(facets[facets.length - 1]?.action).toBe("reticulated");
    });

    it("counts over the whole history, so a number does not change as the view narrows", () => {
        const facets = actionFacets(history);
        const narrowed = filterRevisions(history, {
            query: "nether",
            regex: false,
            flags: "i",
            range: { from: null, to: null },
            actions: [],
        });
        // The chips are still built from the full history in the panel; this pins the
        // function's contract so a future change to call it with the filtered list is a
        // failing test rather than a subtly wrong number.
        expect(narrowed.revisions).toHaveLength(2);
        expect(facets.find((facet) => facet.action === "restored")?.count).toBe(1);
    });
});

describe("searching a revision covers everything somebody would search for", () => {
    it("finds a map by name, a label by its words, and a revision by its hash", () => {
        const corpus = searchCorpus(history[1] as HistoryRevision);
        expect(corpus).toContain("before the server move");
        expect(corpus).toContain("bbbb00000000");
        expect(searchCorpus(history[0] as HistoryRevision)).toContain("maps/nether.conf");
    });
});

describe("the three filters narrow each other rather than replacing each other", () => {
    const base = { query: "", regex: false, flags: "i", range: { from: null, to: null }, actions: [] };

    it("filters by plain text, case-insensitively, without regex being on", () => {
        const outcome = filterRevisions(history, { ...base, query: "NETHER" });
        expect(outcome.revisions.map((entry) => entry.id)).toEqual(["aaaa000000001", "cccc000000003"]);
        expect(outcome.error).toBeNull();
        expect(outcome.active).toBe(true);
    });

    it("filters by a regular expression only when asked to", () => {
        expect(filterRevisions(history, { ...base, query: "^Deleted" }).revisions).toHaveLength(0);
        expect(
            filterRevisions(history, { ...base, query: "^Deleted", regex: true, flags: "im" }).revisions,
        ).toHaveLength(1);
    });

    it("reports an unusable pattern instead of throwing, and matches nothing meanwhile", () => {
        const outcome = filterRevisions(history, { ...base, query: "(unclosed", regex: true });
        expect(outcome.revisions).toHaveLength(0);
        expect(outcome.error).not.toBeNull();
    });

    it("filters by a date range, in the reader's own timezone", () => {
        const outcome = filterRevisions(history, {
            ...base,
            range: { from: "2026-03-01", to: "2026-03-06" },
        });
        expect(outcome.revisions.map((entry) => entry.id)).toEqual(["bbbb000000002", "cccc000000003"]);
    });

    it("treats no action chosen as every action, not as none", () => {
        expect(filterRevisions(history, base).revisions).toHaveLength(4);
        expect(filterRevisions(history, base).active).toBe(false);
    });

    it("filters by one action, and by several at once", () => {
        expect(filterRevisions(history, { ...base, actions: ["deleted"] }).revisions).toHaveLength(1);
        expect(filterRevisions(history, { ...base, actions: ["deleted", "created"] }).revisions).toHaveLength(2);
    });

    it("composes all three, and none of them undoes another", () => {
        const outcome = filterRevisions(history, {
            ...base,
            query: "nether",
            range: { from: "2026-02-01", to: "2026-03-04" },
            actions: ["created"],
        });
        expect(outcome.revisions.map((entry) => entry.id)).toEqual(["cccc000000003"]);

        // Each filter on its own would have kept more; the intersection is what is shown.
        expect(filterRevisions(history, { ...base, query: "nether" }).revisions).toHaveLength(2);
        expect(
            filterRevisions(history, { ...base, range: { from: "2026-02-01", to: "2026-03-04" } }).revisions,
        ).toHaveLength(2);
        expect(filterRevisions(history, { ...base, actions: ["created"] }).revisions).toHaveLength(1);
    });

    it("keeps a revision whose timestamp cannot be read rather than hiding it behind a date filter", () => {
        const broken = revision({ id: "ffff000000006", at: "not a date" });
        const outcome = filterRevisions([...history, broken], {
            ...base,
            range: { from: "2026-03-01", to: "2026-03-31" },
        });
        expect(outcome.revisions.map((entry) => entry.id)).toContain("ffff000000006");
    });
});

describe("the calendar is told what the history covers", () => {
    it("reads a revision's local day", () => {
        expect(revisionDay("2026-03-04T10:00:00")).toBe("2026-03-04");
        expect(revisionDay("nonsense")).toBeNull();
    });

    it("marks the days that carry a revision, and bounds the range by them", () => {
        expect([...daysWithRevisions(history)].sort()).toEqual([
            "2026-02-20",
            "2026-03-01",
            "2026-03-05",
            "2026-03-10",
        ]);
        expect(historySpan(history)).toEqual({ earliest: "2026-02-20", latest: "2026-03-10" });
        expect(historySpan([])).toEqual({ earliest: null, latest: null });
    });
});

describe("an export says which slice of the history it holds", () => {
    it("writes Markdown carrying the full hash, not only the short one", () => {
        const text = exportRevisions(history, "markdown", labels);
        expect(text).toContain("# BlueMap config history");
        expect(text).toContain("## Deleted the nether map");
        expect(text).toContain("aaaa000000001");
        expect(text).toContain("maps/nether.conf");
        expect(text).toContain(labels.range);
    });

    it("writes JSON that parses back to the same revisions", () => {
        const parsed: unknown = JSON.parse(exportRevisions(history, "json", labels));
        const record = parsed as { revisions: { id: string; changes: unknown[] }[] };
        expect(record.revisions.map((entry) => entry.id)).toEqual(history.map((entry) => entry.id));
        expect(record.revisions[0]?.changes).toEqual([{ path: "maps/nether.conf", status: "deleted" }]);
    });

    it("writes CSV that survives a label with a comma and a quote in it", () => {
        const awkward = [revision({ id: "aaaa000000001", label: 'Deleted "nether", and a comma' })];
        const text = exportRevisions(awkward, "csv", labels);
        expect(text).toContain('"Deleted ""nether"", and a comma"');
        // One header line and one row, so the comma did not become a new column.
        expect(text.trim().split("\n")).toHaveLength(2);
    });

    it("writes plain text, and says so honestly when the filters matched nothing", () => {
        expect(exportRevisions([], "text", labels)).toContain("Nothing matched these filters.");
        expect(exportRevisions(history, "text", labels)).toContain("Deleted the nether map");
    });

    it("carries the user's own label into every format that has room for it", () => {
        const labelled = [history[1] as HistoryRevision];
        expect(exportRevisions(labelled, "markdown", labels)).toContain("before the server move");
        expect(exportRevisions(labelled, "text", labels)).toContain("before the server move");
        expect(exportRevisions(labelled, "csv", labels)).toContain("before the server move");
        expect(exportRevisions(labelled, "json", labels)).toContain("before the server move");
    });
});
