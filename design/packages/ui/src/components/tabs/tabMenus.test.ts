/**
 * The context-menu filter, which has exactly two ways to be wrong: hiding
 * everything when the field is empty, and matching something the reader cannot
 * see on the row.
 */

import { describe, expect, it } from "vitest";
import { filterMenuItems, type TabMenuItem } from "./tabMenus.js";

const item = (id: string, label: string, shortcut: string | null = null): TabMenuItem => ({
    id,
    label,
    icon: "M0 0",
    shortcut,
    danger: false,
});

const items: readonly TabMenuItem[] = [
    item("close", "Close this tab", "Delete"),
    item("left", "Move this tab left", "Ctrl+Shift+Left"),
    item("pin", "Pin this tab"),
    item("group", "Put this tab in a new group"),
];

const labels = (found: readonly TabMenuItem[]): string[] => found.map((entry) => entry.label);

describe("filtering a context menu", () => {
    it("shows the whole menu for an empty query, and for whitespace", () => {
        expect(filterMenuItems(items, "")).toBe(items);
        expect(filterMenuItems(items, "   ")).toBe(items);
    });

    it("matches the visible label, case insensitively", () => {
        expect(labels(filterMenuItems(items, "MOVE"))).toEqual(["Move this tab left"]);
        expect(labels(filterMenuItems(items, "tab"))).toHaveLength(4);
    });

    it("does not match the id or the shortcut, which are not what the reader sees", () => {
        expect(filterMenuItems(items, "ctrl")).toEqual([]);
        expect(filterMenuItems(items, "left")).toHaveLength(1);
        expect(filterMenuItems(items, "group").map((entry) => entry.id)).toEqual(["group"]);
    });

    it("returns nothing rather than everything when nothing matches", () => {
        expect(filterMenuItems(items, "zzz")).toEqual([]);
    });
});
