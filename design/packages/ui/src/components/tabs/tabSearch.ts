/**
 * The four tab searches, and the one thing they all agree on.
 *
 * The contract asks for four separate search scopes, and the trap it is written
 * around is sharing state between them: one builder that quietly applies to
 * whichever field was touched last, or one query ref that two fields both write
 * to. Nothing in this module holds any state at all. Each function takes the
 * scope it searches and a matcher the caller built from its own query, mode and
 * flags, so four fields means four matchers and there is no shared thing left
 * for them to leak through.
 *
 *  1. {@link searchStripTabs} - the current strip, including the tabs currently
 *     pushed into the overflow surface and the members of collapsed groups.
 *  2. {@link searchGroupTabs} - one named group, and nothing outside it.
 *  3. {@link searchGroups} - group names, across every strip.
 *  4. {@link searchAllTabs} - every tab in every strip in every window.
 *
 * ### What is searched
 *
 * The visible label, and only the visible label. Not the page behind the tab,
 * not an id, not anything the tab is holding. That is the contract's deliberate
 * scope and it is also the honest one: a person searching a tab strip is looking
 * for a word they can see, and a search that quietly matched hidden text would
 * close tabs whose labels do not contain the query at all.
 *
 * A collapsed group's members are searched. Collapsed is a display state, not a
 * claim that the tabs have gone, and a search that skipped them would make a
 * group into a hiding place. What must not happen is the reveal writing back:
 * see `isGroupExpanded` in `tabModel.ts` for the runtime set that shows a result
 * without touching the saved preference.
 */

import type { SettingMatcher } from "../config/regexEngine.js";
import { indexStrip, tabOrder, type TabGroup, type TabStripState, type TabWorkspaceState } from "./tabModel.js";

/**
 * One tab found by a search, with everything needed to say where it is.
 *
 * The location fields are not decoration. A master search crossing windows and
 * strips returns rows that are otherwise indistinguishable - two tabs called
 * "Settings" in different windows look identical - so the row states the window,
 * the strip, the group and whether the tab is pinned, and the contract requires
 * exactly that.
 */
export interface TabHit {
    readonly tabId: string;
    readonly label: string;
    readonly windowId: string;
    readonly windowLabel: string;
    readonly stripId: string;
    readonly stripLabel: string;
    readonly groupId: string | null;
    readonly groupName: string | null;
    /** The saved preference, so a row can say the result is inside a collapsed group. */
    readonly groupCollapsed: boolean;
    readonly pinned: boolean;
    /** Left-to-right position in its strip, so activation lands on the right tab. */
    readonly index: number;
}

/** One group found by the group-name search. */
export interface GroupHit {
    readonly groupId: string;
    readonly name: string;
    readonly color: string;
    readonly collapsed: boolean;
    readonly tabCount: number;
    readonly windowId: string;
    readonly windowLabel: string;
    readonly stripId: string;
    readonly stripLabel: string;
}

/**
 * The tab-management actions a result may legitimately offer.
 *
 * The contract says a result exposes "only the tab-management actions valid for
 * that result", which rules out the usual approach of drawing every action and
 * disabling most of them. An Unpin on a tab that is not pinned is a control that
 * cannot do its labelled job, and this project treats that as a defect rather
 * than as a greyed-out convenience.
 */
export type TabResultAction = "activate" | "pin" | "unpin" | "ungroup" | "close";

export function actionsFor(hit: TabHit): readonly TabResultAction[] {
    const actions: TabResultAction[] = ["activate"];
    actions.push(hit.pinned ? "unpin" : "pin");
    if (hit.groupId !== null) actions.push("ungroup");
    actions.push("close");
    return actions;
}

/** Describes every tab of a strip, in strip order, before any filtering. */
function hitsForStrip(strip: TabStripState): readonly TabHit[] {
    const { groupOfTab, pinned } = indexStrip(strip);
    return tabOrder(strip).map((tab, index) => {
        const group: TabGroup | undefined = groupOfTab.get(tab.id);
        return {
            tabId: tab.id,
            label: tab.label,
            windowId: strip.windowId,
            windowLabel: strip.windowLabel,
            stripId: strip.id,
            stripLabel: strip.label,
            groupId: group?.id ?? null,
            groupName: group?.name ?? null,
            groupCollapsed: group?.collapsed ?? false,
            pinned: pinned.has(tab.id),
            index,
        };
    });
}

/** Search 1: every tab in one strip, in the order the strip draws them. */
export function searchStripTabs(strip: TabStripState, matcher: SettingMatcher): readonly TabHit[] {
    return hitsForStrip(strip).filter((hit) => matcher.test(hit.label));
}

/**
 * Search 2: one group's tabs, and nothing else.
 *
 * Scoped by the group's own membership rather than by filtering a strip-wide
 * result, so a group search can never report a tab that has left the group -
 * which is the failure the contract calls out as scope drifting between fields.
 */
export function searchGroupTabs(
    strip: TabStripState,
    groupId: string,
    matcher: SettingMatcher,
): readonly TabHit[] {
    const group = strip.groups.find((candidate) => candidate.id === groupId);
    if (group === undefined) return [];
    const members = new Set(group.tabIds);
    return hitsForStrip(strip).filter((hit) => members.has(hit.tabId) && matcher.test(hit.label));
}

/** Search 3: groups by their visible names, across every strip in the workspace. */
export function searchGroups(workspace: TabWorkspaceState, matcher: SettingMatcher): readonly GroupHit[] {
    const found: GroupHit[] = [];
    for (const strip of workspace.strips) {
        for (const group of strip.groups) {
            if (!matcher.test(group.name)) continue;
            found.push({
                groupId: group.id,
                name: group.name,
                color: group.color,
                collapsed: group.collapsed,
                tabCount: group.tabIds.length,
                windowId: strip.windowId,
                windowLabel: strip.windowLabel,
                stripId: strip.id,
                stripLabel: strip.label,
            });
        }
    }
    return found;
}

/** Search 4: every tab this application owns, wherever it is. */
export function searchAllTabs(workspace: TabWorkspaceState, matcher: SettingMatcher): readonly TabHit[] {
    return workspace.strips.flatMap((strip) => searchStripTabs(strip, matcher));
}

/* -------------------------------------------------------------------------- */
/* Corpora for the builders                                                   */
/* -------------------------------------------------------------------------- */

/*
 * Every one of these is the real text the matching search will run over, one
 * candidate per line. The regex builder previews against it, so what the preview
 * highlights and what the search then returns cannot disagree - which is the
 * whole reason the builder is anchored to its own field rather than shared.
 */

export function stripSample(strip: TabStripState): string {
    return tabOrder(strip)
        .map((tab) => tab.label)
        .join("\n");
}

export function groupSample(strip: TabStripState, groupId: string): string {
    const group = strip.groups.find((candidate) => candidate.id === groupId);
    if (group === undefined) return "";
    const { tabById } = indexStrip(strip);
    return group.tabIds
        .map((id) => tabById.get(id)?.label ?? "")
        .filter((label) => label !== "")
        .join("\n");
}

export function groupNameSample(workspace: TabWorkspaceState): string {
    return workspace.strips.flatMap((strip) => strip.groups.map((group) => group.name)).join("\n");
}

export function workspaceSample(workspace: TabWorkspaceState): string {
    return workspace.strips.map((strip) => stripSample(strip)).filter((text) => text !== "").join("\n");
}

/* -------------------------------------------------------------------------- */
/* Counting what a scope holds                                                */
/* -------------------------------------------------------------------------- */

/** How many tabs a scope holds in total, so a summary can say "3 of 14" honestly. */
export function stripTabCount(strip: TabStripState): number {
    return strip.tabs.length;
}

export function workspaceTabCount(workspace: TabWorkspaceState): number {
    return workspace.strips.reduce((total, strip) => total + strip.tabs.length, 0);
}

export function workspaceGroupCount(workspace: TabWorkspaceState): number {
    return workspace.strips.reduce((total, strip) => total + strip.groups.length, 0);
}
