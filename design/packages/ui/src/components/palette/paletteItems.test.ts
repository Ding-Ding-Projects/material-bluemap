/**
 * The row model, and what a query is actually tested against.
 *
 * Two claims here are worth more than the rest. The first is that a row is searchable by the
 * things a person can see, including the labels of the options they have *not* chosen yet,
 * because "how do I make it dark" is by definition a search for an option that is not
 * selected. The second is that an invalid pattern hides everything rather than quietly
 * showing the last result set that compiled, which is what makes the count beneath the
 * search box honest.
 */

import { describe, expect, it } from "vitest";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    controlText,
    countByKind,
    filterItems,
    groupItems,
    itemHaystack,
    paletteSample,
    type PaletteItem,
    type PaletteSetting,
} from "./paletteItems.js";

function command(id: string, group: string, title: string): PaletteItem {
    return { kind: "command", id, group, title, description: "", keywords: [], run: () => {} };
}

function destination(id: string, group: string, title: string, where: string): PaletteItem {
    return { kind: "destination", id, group, title, description: "", keywords: [], where, go: () => {} };
}

const themeRow: PaletteSetting = {
    kind: "setting",
    id: "viewer.theme",
    group: "Theme",
    title: "Theme",
    description: "Light, dark, high contrast, or whatever the system is set to.",
    keywords: ["appearance"],
    control: {
        kind: "choice",
        value: "default",
        options: [
            { id: "default", label: "Default (System/Browser)" },
            { id: "dark", label: "Dark" },
            { id: "light", label: "Light" },
        ],
        set: () => {},
    },
};

const distanceRow: PaletteSetting = {
    kind: "setting",
    id: "viewer.hires",
    group: "Render Distance",
    title: "Hires layer",
    description: "How far the detailed tiles are loaded.",
    keywords: [],
    control: { kind: "number", value: 120, min: 50, max: 500, step: 10, unit: "blocks", set: () => {} },
};

const debugRow: PaletteSetting = {
    kind: "setting",
    id: "viewer.debug",
    group: "Debug",
    title: "Debug",
    description: "Shows the viewer's own diagnostics.",
    keywords: [],
    control: { kind: "toggle", value: false, set: () => {} },
};

describe("what a control contributes to the search", () => {
    it("offers every option of a choice, not only the one in force", () => {
        expect(controlText(themeRow.control)).toContain("Dark");
    });

    it("carries a number's unit, so 'blocks' finds the render distance", () => {
        expect(controlText(distanceRow.control)).toBe("120 blocks");
    });

    it("says nothing at all for a toggle, or every switch would match a search for 'false'", () => {
        expect(controlText(debugRow.control)).toBe("");
    });
});

describe("the haystack", () => {
    it("includes the title, the group, the explanation, the keywords and the values", () => {
        const haystack = itemHaystack(themeRow);
        for (const part of ["Theme", "high contrast", "appearance", "Dark"]) {
            expect(haystack).toContain(part);
        }
    });

    it("includes a destination's sentence about where it goes", () => {
        expect(itemHaystack(destination("a", "App", "Servers", "Opens the server list."))).toContain(
            "Opens the server list.",
        );
    });
});

describe("filtering", () => {
    const items = [themeRow, distanceRow, debugRow];

    it("shows everything when the box is empty", () => {
        expect(filterItems(items, createSettingMatcher("", false, "im"))).toHaveLength(3);
    });

    it("finds a setting by an option it is not currently set to", () => {
        const found = filterItems(items, createSettingMatcher("dark", false, "im"));
        expect(found.map((item) => item.id)).toEqual(["viewer.theme"]);
    });

    it("takes a regular expression when one is asked for", () => {
        const found = filterItems(items, createSettingMatcher("^Hires", true, "im"));
        expect(found.map((item) => item.id)).toEqual(["viewer.hires"]);
    });

    it("shows nothing for a pattern that does not compile, rather than the last one that did", () => {
        const found = filterItems(items, createSettingMatcher("[unclosed", true, "im"));
        expect(found).toEqual([]);
    });
});

describe("the regex builder's preview text", () => {
    it("gives one line per row, which is what makes a match a row", () => {
        const sample = paletteSample([themeRow, debugRow]);
        expect(sample.split("\n")).toHaveLength(2);
        expect(sample).not.toContain("\n\n");
    });
});

describe("grouping", () => {
    it("keeps the catalogue's order rather than sorting the headings", () => {
        const grouped = groupItems([
            command("a", "App", "Reset camera"),
            destination("b", "Menu", "Maps", "Opens the menu."),
            command("c", "App", "Something else"),
        ]);

        expect(grouped.map((group) => group.label)).toEqual(["App", "Menu"]);
        expect(grouped[0]?.items.map((item) => item.id)).toEqual(["a", "c"]);
    });
});

describe("the honest count", () => {
    it("counts each kind separately, because they promise different things", () => {
        expect(countByKind([themeRow, debugRow, command("a", "App", "x"), destination("b", "App", "y", "z")])).toEqual({
            commands: 1,
            settings: 2,
            destinations: 1,
        });
    });
});
