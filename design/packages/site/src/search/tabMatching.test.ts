import { describe, expect, it } from "vitest";

import type { SearchableTab } from "./contract.js";
import { BoundedRegexEvaluator } from "./evaluator.js";
import { buildCandidateIndex, resolveHits, runSearch } from "./runSearch.js";
import {
    TAB_FIELDS,
    countExclusions,
    partitionTabs,
    planBulkClose,
    tabsInGroup,
    tabsInStrip,
} from "./tabMatching.js";
import { createInProcessChannel } from "./workerChannel.js";

function tab(overrides: Partial<SearchableTab> & { id: string; label: string }): SearchableTab {
    return {
        stripId: "main",
        stripLabel: "Main",
        windowId: "w1",
        windowLabel: "Window 1",
        groupId: null,
        groupLabel: null,
        groupCollapsed: false,
        pinned: false,
        active: false,
        ...overrides,
    };
}

const tabs: SearchableTab[] = [
    tab({ id: "1", label: "Overview" }),
    tab({ id: "2", label: "Overview copy", pinned: true }),
    tab({ id: "3", label: "Settings", groupId: "g1", groupLabel: "Config", groupCollapsed: true }),
    tab({ id: "4", label: "Draft", hasUnsavedWork: true }),
    tab({ id: "5", label: "Markers", stripId: "side", stripLabel: "Side" }),
];

async function matchedIndices(query: string, tabList: readonly SearchableTab[]): Promise<Set<number>> {
    const evaluator = new BoundedRegexEvaluator({
        spawn: () => createInProcessChannel(),
        timeoutMs: 2000,
    });
    const index = buildCandidateIndex(tabList, TAB_FIELDS);
    const outcome = await runSearch(
        { kind: "text", query, caseSensitive: false },
        index.values,
        evaluator,
    );
    evaluator.dispose();
    if (outcome.status !== "ok") {
        throw new Error(`expected a result, got ${outcome.status}`);
    }
    return new Set(resolveHits(index, ["label", "title"], outcome.hits).map((hit) => hit.itemIndex));
}

describe("partitionTabs", () => {
    it("puts every tab in exactly one half", () => {
        const partition = partitionTabs(tabs, new Set([0, 2]));
        expect(partition.matching.map((entry) => entry.id)).toEqual(["1", "3"]);
        expect(partition.notMatching.map((entry) => entry.id)).toEqual(["2", "4", "5"]);
        expect(partition.matching.length + partition.notMatching.length).toBe(tabs.length);
        const overlap = partition.matching.filter((entry) =>
            partition.notMatching.some((other) => other.id === entry.id),
        );
        expect(overlap).toEqual([]);
    });
});

describe("planBulkClose", () => {
    it("closes what matched and leaves pinned tabs open by default", async () => {
        const plan = planBulkClose(tabs, await matchedIndices("overview", tabs), {
            invert: false,
            includePinned: false,
        });
        expect(plan.selected.map((entry) => entry.id)).toEqual(["1", "2"]);
        expect(plan.willClose.map((entry) => entry.id)).toEqual(["1"]);
        expect(plan.excluded).toEqual([{ tab: tabs[1], reason: "pinned" }]);
    });

    it("includes pinned tabs only when the visitor says so", async () => {
        const plan = planBulkClose(tabs, await matchedIndices("overview", tabs), {
            invert: false,
            includePinned: true,
        });
        expect(plan.willClose.map((entry) => entry.id)).toEqual(["1", "2"]);
        expect(plan.excluded).toEqual([]);
    });

    it("never closes a tab holding unsaved work, and says why", async () => {
        const plan = planBulkClose(tabs, await matchedIndices("draft", tabs), {
            invert: false,
            includePinned: true,
        });
        expect(plan.willClose).toEqual([]);
        expect(plan.excluded).toEqual([{ tab: tabs[3], reason: "unsaved-work" }]);
    });

    it("makes containing and not containing partition the same eligible set", async () => {
        const indices = await matchedIndices("overview", tabs);
        const containing = planBulkClose(tabs, indices, { invert: false, includePinned: true });
        const notContaining = planBulkClose(tabs, indices, { invert: true, includePinned: true });

        const selectedIds = [
            ...containing.selected.map((entry) => entry.id),
            ...notContaining.selected.map((entry) => entry.id),
        ].sort();
        expect(selectedIds).toEqual(tabs.map((entry) => entry.id).sort());

        const shared = containing.selected.filter((entry) =>
            notContaining.selected.some((other) => other.id === entry.id),
        );
        expect(shared).toEqual([]);
    });

    it("applies the same protection rules in both directions", async () => {
        const indices = await matchedIndices("overview", tabs);
        const notContaining = planBulkClose(tabs, indices, { invert: true, includePinned: false });
        // The unsaved draft and the side-strip marker did not match, so the inverse selects them;
        // the draft is still protected.
        expect(notContaining.selected.map((entry) => entry.id)).toEqual(["3", "4", "5"]);
        expect(notContaining.willClose.map((entry) => entry.id)).toEqual(["3", "5"]);
        expect(notContaining.excluded.map((entry) => entry.reason)).toEqual(["unsaved-work"]);
    });

    it("closes nothing when nothing matched", async () => {
        const plan = planBulkClose(tabs, await matchedIndices("nothing-matches-this", tabs), {
            invert: false,
            includePinned: true,
        });
        expect(plan.selected).toEqual([]);
        expect(plan.willClose).toEqual([]);
    });

    it("matches the visible title as well as the label", async () => {
        const withTitle = [tab({ id: "9", label: "Untitled", title: "Chunk loader notes" })];
        const plan = planBulkClose(withTitle, await matchedIndices("chunk", withTitle), {
            invert: false,
            includePinned: false,
        });
        expect(plan.willClose.map((entry) => entry.id)).toEqual(["9"]);
    });
});

describe("countExclusions", () => {
    it("counts each reason separately", () => {
        const counts = countExclusions([
            { tab: tabs[0] as SearchableTab, reason: "pinned" },
            { tab: tabs[1] as SearchableTab, reason: "pinned" },
            { tab: tabs[3] as SearchableTab, reason: "unsaved-work" },
        ]);
        expect(counts.pinned).toBe(2);
        expect(counts["unsaved-work"]).toBe(1);
        expect(counts.protected).toBe(0);
    });
});

describe("scoping helpers", () => {
    it("keeps a strip search to its own strip", () => {
        expect(tabsInStrip(tabs, "side").map((entry) => entry.id)).toEqual(["5"]);
    });

    it("keeps a group search to its own group", () => {
        expect(tabsInGroup(tabs, "g1").map((entry) => entry.id)).toEqual(["3"]);
    });

    it("does not change a collapsed group's state by finding a tab inside it", () => {
        const before = tabs.map((entry) => entry.groupCollapsed);
        tabsInGroup(tabs, "g1");
        expect(tabs.map((entry) => entry.groupCollapsed)).toEqual(before);
    });
});
