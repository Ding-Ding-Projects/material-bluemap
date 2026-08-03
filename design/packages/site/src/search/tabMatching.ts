/**
 * What the two bulk-close actions actually do, with no DOM involved.
 *
 * "Close tabs containing text" and "Close tabs not containing text" are one predicate and a
 * boolean. They cannot drift apart on casing, Unicode, flags or scope, because there is only one
 * matcher and `planBulkClose` inverts the selection rather than re-deciding what a match is. The
 * tests prove the two halves partition the same eligible set exactly.
 *
 * Only the visible label and title are ever matched. Page content and hidden metadata are not
 * read, per the tab navigation contract.
 */

import type { SearchableTab, SearchableTabGroup, TabExclusionReason } from "./contract.js";
import type { CandidateField } from "./runSearch.js";

export type TabField = "label" | "title";
export type GroupField = "label";

/** Field priority for tab searches: the visible label first, then the visible title. */
export const TAB_FIELDS: readonly CandidateField<SearchableTab, TabField>[] = [
    { name: "label", get: (tab) => tab.label },
    { name: "title", get: (tab) => tab.title },
];

export const GROUP_FIELDS: readonly CandidateField<SearchableTabGroup, GroupField>[] = [
    { name: "label", get: (group) => group.label },
];

export interface TabPartition {
    readonly matching: readonly SearchableTab[];
    readonly notMatching: readonly SearchableTab[];
}

/**
 * Split tabs by the one predicate. Every tab lands in exactly one half, which is what makes the
 * inverse action honest.
 */
export function partitionTabs(
    tabs: readonly SearchableTab[],
    matchedIndices: ReadonlySet<number>,
): TabPartition {
    const matching: SearchableTab[] = [];
    const notMatching: SearchableTab[] = [];
    tabs.forEach((tab, index) => {
        if (matchedIndices.has(index)) {
            matching.push(tab);
        } else {
            notMatching.push(tab);
        }
    });
    return { matching, notMatching };
}

export interface BulkCloseOptions {
    /** `false` closes the tabs that matched, `true` closes the tabs that did not. */
    readonly invert: boolean;
    /** Pinned tabs stay open unless the visitor explicitly includes them. */
    readonly includePinned: boolean;
}

export interface BulkCloseExclusion {
    readonly tab: SearchableTab;
    readonly reason: TabExclusionReason;
}

export interface BulkClosePlan {
    /** Tabs the predicate selected, before any protection was applied. */
    readonly selected: readonly SearchableTab[];
    /** Tabs that will actually be asked to close. */
    readonly willClose: readonly SearchableTab[];
    /** Selected tabs that will stay open, each with the reason. */
    readonly excluded: readonly BulkCloseExclusion[];
}

/**
 * Work out exactly what a bulk close would do. The preview shown to the visitor is built from this
 * plan and from nothing else, so the preview and the action cannot disagree.
 */
export function planBulkClose(
    tabs: readonly SearchableTab[],
    matchedIndices: ReadonlySet<number>,
    options: BulkCloseOptions,
): BulkClosePlan {
    const partition = partitionTabs(tabs, matchedIndices);
    const selected = options.invert ? partition.notMatching : partition.matching;
    const willClose: SearchableTab[] = [];
    const excluded: BulkCloseExclusion[] = [];

    for (const tab of selected) {
        if (tab.pinned && !options.includePinned) {
            excluded.push({ tab, reason: "pinned" });
            continue;
        }
        if (tab.hasUnsavedWork === true) {
            // Unsaved work is the host's decision, not a bulk action's. It is reported, never
            // closed as a side effect of a text match.
            excluded.push({ tab, reason: "unsaved-work" });
            continue;
        }
        willClose.push(tab);
    }

    return { selected, willClose, excluded };
}

/** Counts for the preview line, grouped by reason. */
export function countExclusions(
    excluded: readonly BulkCloseExclusion[],
): Record<TabExclusionReason, number> {
    const counts: Record<TabExclusionReason, number> = {
        pinned: 0,
        "unsaved-work": 0,
        protected: 0,
        "not-found": 0,
    };
    for (const entry of excluded) {
        counts[entry.reason] += 1;
    }
    return counts;
}

/** Tabs in one strip, in their given order. */
export function tabsInStrip(
    tabs: readonly SearchableTab[],
    stripId: string,
): readonly SearchableTab[] {
    return tabs.filter((tab) => tab.stripId === stripId);
}

/** Tabs in one group, in their given order. */
export function tabsInGroup(
    tabs: readonly SearchableTab[],
    groupId: string,
): readonly SearchableTab[] {
    return tabs.filter((tab) => tab.groupId === groupId);
}
