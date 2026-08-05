/**
 * The model behind the "Move this tab into group..." picker.
 *
 * The tab context menu used to grow one menu item per existing group -- `assign:g1`,
 * `assign:g2`, `assign:g3` -- which is clutter that gets worse with every group somebody
 * makes. This module is the pure half of the replacement: one row per group (its name,
 * its colour and how many tabs it already holds), a plain-text-first filter over those
 * rows sharing the project's own settings matcher, and a flat, keyboard-navigable entry
 * list that always ends in a "New group..." action so creating a group and moving into it
 * is never a dead end even when the strip has none yet.
 *
 * `TabGroupPicker.vue` next door is the anchored, non-modal surface built on top of this;
 * everything here is plain data and plain functions so it can be tested without mounting
 * Vue at all.
 */

import type { TabGroup, TabStripState } from "./tabModel.js";

/** One row the picker can move the tab into. */
export interface TabGroupPickerRow {
    readonly id: string;
    readonly name: string;
    readonly color: string;
    readonly memberCount: number;
}

/** A predicate over row names. `createSettingMatcher` from `config/regexEngine.js` satisfies this. */
export interface TabGroupPickerMatcher {
    readonly test: (value: string) => boolean;
}

/**
 * Every group the tab could move into, in strip order, minus the group it is already in.
 *
 * The tab's current group is excluded for the same reason the old per-group menu items
 * excluded it: a "move into the group it is already in" row would either do nothing or
 * silently reorder the tab within that group, neither of which is what this command is
 * for. Ungrouping stays its own separate command elsewhere in the menu.
 */
export function pickerRows(strip: TabStripState, excludeGroupId: string | null): readonly TabGroupPickerRow[] {
    return strip.groups
        .filter((group: TabGroup) => group.id !== excludeGroupId)
        .map((group: TabGroup) => ({
            id: group.id,
            name: group.name,
            color: group.color,
            memberCount: group.tabIds.length,
        }));
}

/** Filters rows by name with the given matcher. An always-true matcher (empty query) returns every row. */
export function filterPickerRows(
    rows: readonly TabGroupPickerRow[],
    matcher: TabGroupPickerMatcher,
): readonly TabGroupPickerRow[] {
    return rows.filter((row) => matcher.test(row.name));
}

/** What the anchored regex builder previews against: one group name per line. */
export function pickerSample(rows: readonly TabGroupPickerRow[]): string {
    return rows.map((row) => row.name).join("\n");
}

export type TabGroupPickerEntry =
    | { readonly kind: "group"; readonly row: TabGroupPickerRow }
    | { readonly kind: "new-group" };

/**
 * The flat, keyboard-navigable list the picker actually draws: the (already filtered)
 * group rows, then "New group..." at the end.
 *
 * "New group..." is deliberately outside the search filter -- it is an action, not a
 * group with a name to match -- so it never disappears while somebody is typing, and it
 * is what keeps an empty strip from being a dead end: filtered to nothing or starting
 * with no groups at all, there is always exactly one more entry to land on.
 */
export function pickerEntries(rows: readonly TabGroupPickerRow[]): readonly TabGroupPickerEntry[] {
    return [...rows.map((row): TabGroupPickerEntry => ({ kind: "group", row })), { kind: "new-group" }];
}

/**
 * Moves the active index by `delta`, wrapping at both ends.
 *
 * Wrapping rather than clamping matches the listbox convention every other menu in this
 * app already uses (arrow past the last row and land back on the first), and it means a
 * single ArrowUp from "no selection yet" reaches the last entry -- typically "New
 * group..." -- in one keystroke rather than requiring a lap of the whole list.
 */
export function stepEntryIndex(count: number, current: number, delta: number): number {
    if (count === 0) return -1;
    if (current < 0) return delta > 0 ? 0 : count - 1;
    return (current + delta + count) % count;
}
