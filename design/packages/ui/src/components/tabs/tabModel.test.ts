/**
 * The ordering rules, which are the whole of this feature that can be got wrong
 * silently.
 *
 * A mis-ordered strip still renders, still responds, and still passes any test
 * that only asks whether a tab exists. So the assertions here are about position
 * and membership rather than presence: where an unpinned tab lands, what happens
 * to a group's members when the group is removed, which tab becomes active when
 * the active one closes, and whether a structure read back off disk with two
 * groups claiming the same tab is repaired into something with one answer.
 */

import { describe, expect, it } from "vitest";
import {
    addTab,
    applyGroupSeeds,
    assignTabToGroup,
    closeTabs,
    createGroup,
    filterHiddenSegments,
    fitCount,
    focusOrder,
    isGroupExpanded,
    moveGroup,
    moveTab,
    moveTabToIndex,
    nextId,
    normalizeStrip,
    pinTab,
    pinnedTabs,
    regionOfTab,
    removeGroup,
    seedTabOrder,
    setGroupAppearance,
    setGroupCollapsed,
    setTabAppearance,
    setTabPlacement,
    stripSegments,
    tabOrder,
    unpinTab,
    type TabGroupSeed,
    type TabPage,
    type TabStripState,
} from "./tabModel.js";

const EMPTY: TabStripState = {
    id: "strip-1",
    label: "Main",
    windowId: "window-1",
    windowLabel: "Worldlens",
    placement: "left",
    tabs: [],
    groups: [],
    pinnedOrder: [],
    slots: [],
    activeTabId: null,
};

/** A strip of ordinary tabs whose ids are their labels, so assertions read as prose. */
function stripOf(...labels: readonly string[]): TabStripState {
    return labels.reduce<TabStripState>(
        (strip, label) => addTab(strip, { id: label, pageId: "map", label }),
        EMPTY,
    );
}

const ids = (strip: TabStripState): string[] => tabOrder(strip).map((tab) => tab.id);

describe("opening and closing", () => {
    it("appends a new tab and makes it active", () => {
        const strip = stripOf("map", "world");
        expect(ids(strip)).toEqual(["map", "world"]);
        expect(strip.activeTabId).toBe("world");
    });

    it("hands the active state to the tab on the right when the active one closes", () => {
        const strip = closeTabs({ ...stripOf("a", "b", "c"), activeTabId: "b" }, ["b"]);
        expect(strip.activeTabId).toBe("c");
        expect(ids(strip)).toEqual(["a", "c"]);
    });

    it("falls back to the left when the active tab was the last one", () => {
        const strip = closeTabs({ ...stripOf("a", "b", "c"), activeTabId: "c" }, ["c"]);
        expect(strip.activeTabId).toBe("b");
    });

    it("leaves nothing active when every tab closes, rather than inventing one", () => {
        const strip = closeTabs(stripOf("a", "b"), ["a", "b"]);
        expect(strip.tabs).toEqual([]);
        expect(strip.activeTabId).toBeNull();
    });

    it("leaves the active tab alone when some other tab closes", () => {
        const strip = closeTabs({ ...stripOf("a", "b", "c"), activeTabId: "a" }, ["c"]);
        expect(strip.activeTabId).toBe("a");
    });
});

describe("four-edge placement", () => {
    it("changes only the strip edge and preserves every tab-layout field", () => {
        const before = createGroup(pinTab(stripOf("a", "b", "c"), "a"), { id: "g", name: "Work" }, [
            "b",
        ]);
        const after = setTabPlacement(before, "bottom");

        expect(after.placement).toBe("bottom");
        expect({ ...after, placement: "left" }).toEqual(before);
    });
});

describe("pinning", () => {
    it("moves a tab out of the ordinary region and into the pinned one", () => {
        const strip = pinTab(stripOf("a", "b", "c"), "b");
        expect(pinnedTabs(strip).map((tab) => tab.id)).toEqual(["b"]);
        expect(strip.slots).toEqual([
            { kind: "tab", tabId: "a" },
            { kind: "tab", tabId: "c" },
        ]);
        expect(ids(strip)).toEqual(["b", "a", "c"]);
    });

    it("takes the tab out of its group, because it cannot be in two places", () => {
        const grouped = createGroup(stripOf("a", "b", "c"), { name: "Work" }, ["a", "b"]);
        const strip = pinTab(grouped, "a");
        expect(strip.groups[0]?.tabIds).toEqual(["b"]);
        expect(regionOfTab(strip, "a")).toBe("pinned");
    });

    it("unpins to the front of the ordinary region, where the tab already was", () => {
        const strip = unpinTab(pinTab(stripOf("a", "b", "c"), "c"), "c");
        expect(strip.pinnedOrder).toEqual([]);
        expect(ids(strip)).toEqual(["c", "a", "b"]);
    });

    it("pins idempotently rather than listing a tab twice", () => {
        const strip = pinTab(pinTab(stripOf("a", "b"), "a"), "a");
        expect(strip.pinnedOrder).toEqual(["a"]);
    });
});

describe("reordering", () => {
    it("nudges an ordinary tab within the ordinary region", () => {
        expect(ids(moveTab(stripOf("a", "b", "c"), "a", 1))).toEqual(["b", "a", "c"]);
    });

    it("clamps at the edges instead of wrapping around", () => {
        expect(ids(moveTab(stripOf("a", "b", "c"), "a", -1))).toEqual(["a", "b", "c"]);
        expect(ids(moveTab(stripOf("a", "b", "c"), "c", 5))).toEqual(["a", "b", "c"]);
    });

    it("reorders within the pinned region without leaving it", () => {
        const pinned = pinTab(pinTab(stripOf("a", "b", "c"), "a"), "b");
        expect(moveTab(pinned, "a", 1).pinnedOrder).toEqual(["b", "a"]);
    });

    it("reorders within a group without leaving it", () => {
        const grouped = createGroup(stripOf("a", "b", "c"), { name: "Work" }, ["a", "b"]);
        expect(moveTab(grouped, "a", 1).groups[0]?.tabIds).toEqual(["b", "a"]);
    });

    it("drops a tab at an exact index, which is what a drag produces", () => {
        expect(ids(moveTabToIndex(stripOf("a", "b", "c"), "c", 0))).toEqual(["c", "a", "b"]);
    });

    it("moves a whole group past a neighbour, members and order intact", () => {
        const grouped = createGroup(stripOf("a", "b", "c"), { name: "Work" }, ["a", "b"]);
        const moved = moveGroup(grouped, grouped.groups[0]?.id ?? "", 1);
        expect(ids(moved)).toEqual(["c", "a", "b"]);
        expect(moved.groups[0]?.tabIds).toEqual(["a", "b"]);
    });
});

describe("groups", () => {
    it("takes the position of its first member rather than the end of the strip", () => {
        const strip = createGroup(stripOf("a", "b", "c", "d"), { name: "Work" }, ["b", "d"]);
        expect(ids(strip)).toEqual(["a", "b", "d", "c"]);
    });

    it("unpins a member on the way in", () => {
        const pinned = pinTab(stripOf("a", "b"), "a");
        const strip = createGroup(pinned, { name: "Work" }, ["a"]);
        expect(strip.pinnedOrder).toEqual([]);
        expect(strip.groups[0]?.tabIds).toEqual(["a"]);
    });

    it("removing a group keeps its tabs, in place and in order", () => {
        const grouped = createGroup(stripOf("a", "b", "c"), { name: "Work" }, ["a", "b"]);
        const strip = removeGroup(grouped, grouped.groups[0]?.id ?? "");
        expect(strip.groups).toEqual([]);
        expect(ids(strip)).toEqual(["a", "b", "c"]);
    });

    it("moves a tab between groups, leaving exactly one membership", () => {
        let strip = createGroup(stripOf("a", "b", "c"), { id: "g1", name: "One" }, ["a"]);
        strip = createGroup(strip, { id: "g2", name: "Two" }, ["b"]);
        strip = assignTabToGroup(strip, "a", "g2");
        expect(strip.groups.find((group) => group.id === "g1")?.tabIds).toEqual([]);
        expect(strip.groups.find((group) => group.id === "g2")?.tabIds).toEqual(["b", "a"]);
    });

    it("moves a tab out of every group to the end of the ordinary region", () => {
        const grouped = createGroup(stripOf("a", "b", "c"), { id: "g1", name: "One" }, ["a", "b"]);
        const strip = assignTabToGroup(grouped, "a", null);
        expect(strip.groups[0]?.tabIds).toEqual(["b"]);
        expect(ids(strip)).toEqual(["b", "c", "a"]);
    });

    it("keeps a collapsed group's tabs in the strip order but out of the focus order", () => {
        let strip = createGroup(stripOf("a", "b", "c"), { id: "g1", name: "One" }, ["a", "b"]);
        strip = setGroupCollapsed(strip, "g1", true);
        expect(ids(strip)).toEqual(["a", "b", "c"]);
        expect(focusOrder(strip).map((tab) => tab.id)).toEqual(["c"]);
    });

    it("reveals a collapsed group for focus without touching the saved preference", () => {
        let strip = createGroup(stripOf("a", "b", "c"), { id: "g1", name: "One" }, ["a", "b"]);
        strip = setGroupCollapsed(strip, "g1", true);

        const revealed = new Set(["g1"]);
        const group = strip.groups[0];
        expect(focusOrder(strip, revealed).map((tab) => tab.id)).toEqual(["a", "b", "c"]);
        expect(group?.collapsed).toBe(true);
        expect(group !== undefined && isGroupExpanded(group, revealed)).toBe(true);
    });

    it("draws a group as one segment carrying its members", () => {
        const strip = createGroup(stripOf("a", "b", "c"), { id: "g1", name: "One" }, ["a", "b"]);
        const segments = stripSegments(strip);
        expect(segments.map((segment) => segment.kind)).toEqual(["group", "tab"]);
        expect(segments[0]?.kind === "group" && segments[0].tabs.map((tab) => tab.id)).toEqual([
            "a",
            "b",
        ]);
    });
});

describe("repairing a structure that came off disk", () => {
    it("drops a duplicate tab, a duplicate pin and a group claiming a tab that is gone", () => {
        const strip = normalizeStrip({
            ...EMPTY,
            tabs: [
                { id: "a", pageId: "map", label: "A", icon: null, dirty: false, appearance: null },
                {
                    id: "a",
                    pageId: "map",
                    label: "A again",
                    icon: null,
                    dirty: false,
                    appearance: null,
                },
                { id: "b", pageId: "map", label: "B", icon: null, dirty: false, appearance: null },
            ],
            groups: [
                {
                    id: "g1",
                    name: "One",
                    color: "primary",
                    collapsed: false,
                    tabIds: ["b", "ghost", "b"],
                    appearance: null,
                },
            ],
            pinnedOrder: ["a", "a", "ghost"],
            slots: [
                { kind: "group", groupId: "g1" },
                { kind: "group", groupId: "gone" },
            ],
            activeTabId: "ghost",
        });

        expect(strip.tabs.map((tab) => tab.id)).toEqual(["a", "b"]);
        expect(strip.pinnedOrder).toEqual(["a"]);
        expect(strip.groups[0]?.tabIds).toEqual(["b"]);
        expect(strip.slots).toEqual([{ kind: "group", groupId: "g1" }]);
        expect(strip.activeTabId).toBe("a");
    });

    it("takes a pinned tab out of the group that also claimed it", () => {
        const strip = normalizeStrip({
            ...EMPTY,
            tabs: [
                { id: "a", pageId: "map", label: "A", icon: null, dirty: false, appearance: null },
            ],
            groups: [
                {
                    id: "g1",
                    name: "One",
                    color: "primary",
                    collapsed: false,
                    tabIds: ["a"],
                    appearance: null,
                },
            ],
            pinnedOrder: ["a"],
            slots: [],
            activeTabId: "a",
        });
        expect(strip.groups[0]?.tabIds).toEqual([]);
        expect(strip.pinnedOrder).toEqual(["a"]);
    });

    it("gives a tab mentioned nowhere a slot at the end rather than losing it", () => {
        const strip = normalizeStrip({
            ...EMPTY,
            tabs: [
                { id: "a", pageId: "map", label: "A", icon: null, dirty: false, appearance: null },
                { id: "b", pageId: "map", label: "B", icon: null, dirty: false, appearance: null },
            ],
            slots: [{ kind: "tab", tabId: "b" }],
            activeTabId: "b",
        });
        expect(ids(strip)).toEqual(["b", "a"]);
    });

    it("changes nothing the second time, so a repair cannot creep", () => {
        const once = normalizeStrip(
            createGroup(pinTab(stripOf("a", "b", "c"), "c"), { name: "One" }, ["a"]),
        );
        expect(normalizeStrip(once)).toEqual(once);
    });
});

describe("the appearance slot", () => {
    it("attaches a record to a tab and to a group without reading inside it", () => {
        let strip = createGroup(stripOf("a", "b"), { id: "g1", name: "One" }, ["a"]);
        strip = setTabAppearance(strip, "a", { anything: { nested: true } });
        strip = setGroupAppearance(strip, "g1", { tint: "#ff0000" });

        expect(strip.tabs.find((tab) => tab.id === "a")?.appearance).toEqual({
            anything: { nested: true },
        });
        expect(strip.groups[0]?.appearance).toEqual({ tint: "#ff0000" });
    });

    it("carries the record through a pin, a move and a regroup", () => {
        let strip = setTabAppearance(stripOf("a", "b", "c"), "a", { weight: 700 });
        strip = pinTab(strip, "a");
        strip = unpinTab(strip, "a");
        strip = moveTab(strip, "a", 2);
        strip = createGroup(strip, { name: "One" }, ["a"]);
        expect(strip.tabs.find((tab) => tab.id === "a")?.appearance).toEqual({ weight: 700 });
    });
});

describe("identity and overflow arithmetic", () => {
    it("picks the first free id rather than a random one", () => {
        expect(nextId(["tab-1", "tab-3"], "tab")).toBe("tab-2");
        expect(nextId([], "group")).toBe("group-1");
    });

    it("fits everything when everything fits", () => {
        expect(fitCount([100, 100, 100], 400, 40)).toBe(3);
    });

    it("pays for the overflow button out of the budget, so the last tab is listed not hidden", () => {
        // Three 100px tabs in 250px. Two fit only once the 40px button is paid for.
        expect(fitCount([100, 100, 100], 250, 40)).toBe(2);
    });

    it("answers all of them before the first measurement, rather than briefly emptying the strip", () => {
        expect(fitCount([0, 0, 0], 0, 40)).toBe(3);
    });

    it("keeps nothing when nothing can fit beside the button", () => {
        expect(fitCount([100, 100], 60, 40)).toBe(0);
    });
});

describe("filtering the overflow menu's own segments", () => {
    // The tab-strip overflow list used to be a bare fixed list with no search field at
    // all, so nothing here narrowed it. This is the algorithm behind the search field it
    // gained, proven directly against fixtures rather than by forcing a real overflow
    // inside a mounted component -- jsdom has no layout engine, so nothing would ever
    // actually measure as not fitting there.
    const matches = (query: string) => (label: string) =>
        label.toLowerCase().includes(query.toLowerCase());

    function segmentsOf(strip: TabStripState): ReturnType<typeof stripSegments> {
        return stripSegments(strip);
    }

    it("keeps a lone tab only when its own label matches", () => {
        const strip = stripOf("Alpha", "Bravo", "Charlie");
        const segments = segmentsOf(strip);

        const filtered = filterHiddenSegments(segments, matches("bravo"));

        expect(filtered).toHaveLength(1);
        expect(filtered[0]).toMatchObject({ kind: "tab", tab: { label: "Bravo" } });
    });

    it("keeps every member of a group whose own name matches, even ones that do not", () => {
        const withGroup = createGroup(
            stripOf("Alpha", "Bravo", "Charlie"),
            { name: "My Project" },
            ["Bravo", "Charlie"],
        );
        const segments = segmentsOf(withGroup);

        const filtered = filterHiddenSegments(segments, matches("project"));

        expect(filtered).toHaveLength(1);
        const group = filtered[0];
        if (group?.kind !== "group") throw new Error("expected a group segment");
        expect(group.tabs.map((tab) => tab.label)).toEqual(["Bravo", "Charlie"]);
    });

    it("narrows a non-matching group down to just the members that match", () => {
        const withGroup = createGroup(
            stripOf("Alpha", "Bravo", "Charlie"),
            { name: "My Project" },
            ["Bravo", "Charlie"],
        );
        const segments = segmentsOf(withGroup);

        const filtered = filterHiddenSegments(segments, matches("bravo"));

        expect(filtered).toHaveLength(1);
        const group = filtered[0];
        if (group?.kind !== "group") throw new Error("expected a group segment");
        expect(group.tabs.map((tab) => tab.label)).toEqual(["Bravo"]);
    });

    it("drops a group entirely once neither its name nor any member matches", () => {
        const withGroup = createGroup(
            stripOf("Alpha", "Bravo", "Charlie"),
            { name: "My Project" },
            ["Bravo", "Charlie"],
        );
        const segments = segmentsOf(withGroup);

        const filtered = filterHiddenSegments(segments, matches("nothing here matches that"));

        expect(filtered).toEqual([]);
    });

    it("returns every segment unchanged when the query matches everything", () => {
        const withGroup = createGroup(
            stripOf("Alpha", "Bravo", "Charlie"),
            { name: "My Project" },
            ["Bravo", "Charlie"],
        );
        const segments = segmentsOf(withGroup);

        const filtered = filterHiddenSegments(segments, () => true);

        expect(filtered).toEqual(segments);
    });
});
