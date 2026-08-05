/**
 * The picker's model, exercised without mounting anything: which rows it offers, how a
 * search narrows them, and how the keyboard moves through the flat entry list.
 */

import { describe, expect, it } from "vitest";

import type { TabStripState } from "./tabModel.js";
import {
    filterPickerRows,
    pickerEntries,
    pickerRows,
    pickerSample,
    stepEntryIndex,
    type TabGroupPickerRow,
} from "./tabGroupPicker.js";

function strip(overrides: Partial<TabStripState> = {}): TabStripState {
    return {
        id: "s1",
        label: "Main",
        windowId: "window-1",
        windowLabel: "Material BlueMap",
        tabs: [],
        pinnedOrder: [],
        groups: [],
        slots: [],
        activeTabId: null,
        ...overrides,
    };
}

const GROUPS = [
    { id: "g1", name: "Research", color: "primary", collapsed: false, tabIds: ["a", "b"], appearance: null },
    { id: "g2", name: "Reference", color: "secondary", collapsed: false, tabIds: ["c"], appearance: null },
    { id: "g3", name: "Scratch", color: "tertiary", collapsed: true, tabIds: [], appearance: null },
];

describe("pickerRows", () => {
    it("lists every group as a row, with its name, colour and member count", () => {
        const rows = pickerRows(strip({ groups: GROUPS }), null);
        expect(rows).toEqual([
            { id: "g1", name: "Research", color: "primary", memberCount: 2 },
            { id: "g2", name: "Reference", color: "secondary", memberCount: 1 },
            { id: "g3", name: "Scratch", color: "tertiary", memberCount: 0 },
        ]);
    });

    it("excludes the tab's own current group", () => {
        const rows = pickerRows(strip({ groups: GROUPS }), "g2");
        expect(rows.map((row) => row.id)).toEqual(["g1", "g3"]);
    });

    it("is empty when the strip has no groups yet", () => {
        expect(pickerRows(strip(), null)).toEqual([]);
    });
});

describe("filterPickerRows", () => {
    const rows = pickerRows(strip({ groups: GROUPS }), null);

    it("keeps everything for a matcher that is always true (an empty query)", () => {
        expect(filterPickerRows(rows, { test: () => true })).toEqual(rows);
    });

    it("narrows to whatever the matcher accepts, by name", () => {
        const shown = filterPickerRows(rows, { test: (value) => value.startsWith("Re") });
        expect(shown.map((row) => row.name)).toEqual(["Research", "Reference"]);
    });

    it("returns nothing rather than everything when nothing matches", () => {
        expect(filterPickerRows(rows, { test: () => false })).toEqual([]);
    });
});

describe("pickerSample", () => {
    it("is one row name per line, for the regex builder's preview", () => {
        const rows = pickerRows(strip({ groups: GROUPS }), null);
        expect(pickerSample(rows)).toBe("Research\nReference\nScratch");
    });

    it("is an empty string when there are no rows", () => {
        expect(pickerSample([])).toBe("");
    });
});

describe("pickerEntries", () => {
    it("appends New group... after the given rows", () => {
        const rows: TabGroupPickerRow[] = [{ id: "g1", name: "Research", color: "primary", memberCount: 2 }];
        const entries = pickerEntries(rows);
        expect(entries).toEqual([
            { kind: "group", row: rows[0] },
            { kind: "new-group" },
        ]);
    });

    it("is New group... alone when there are no rows at all", () => {
        expect(pickerEntries([])).toEqual([{ kind: "new-group" }]);
    });
});

describe("stepEntryIndex", () => {
    it("is -1 for zero entries, whichever direction", () => {
        expect(stepEntryIndex(0, -1, 1)).toBe(-1);
        expect(stepEntryIndex(0, -1, -1)).toBe(-1);
    });

    it("lands on the first entry moving down from no selection", () => {
        expect(stepEntryIndex(3, -1, 1)).toBe(0);
    });

    it("lands on the last entry moving up from no selection", () => {
        expect(stepEntryIndex(3, -1, -1)).toBe(2);
    });

    it("wraps forward past the last entry to the first", () => {
        expect(stepEntryIndex(3, 2, 1)).toBe(0);
    });

    it("wraps backward past the first entry to the last", () => {
        expect(stepEntryIndex(3, 0, -1)).toBe(2);
    });

    it("moves by one within bounds otherwise", () => {
        expect(stepEntryIndex(3, 0, 1)).toBe(1);
        expect(stepEntryIndex(3, 1, -1)).toBe(0);
    });
});
