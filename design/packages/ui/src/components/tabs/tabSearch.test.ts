/**
 * The four searches, and the ways they could quietly become fewer than four.
 *
 * Each scope is proved to return what it claims and nothing from outside it: a
 * per-group search that silently widened to the strip, or a strip search that
 * reached into another window, would both look perfectly reasonable on screen
 * and be wrong. The location fields are asserted for the same reason - a master
 * search that returns two rows both labelled "Settings" without saying which
 * window each is in is a search nobody can act on.
 *
 * The stateful-flag case is here because it is the one leak that survives having
 * four separate matchers: a `RegExp` carrying `g` remembers `lastIndex` between
 * calls, so one instance tested against a list matches roughly every other item.
 * `createSettingMatcher` strips it, and this pins that.
 */

import { describe, expect, it } from "vitest";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    actionsFor,
    groupNameSample,
    groupSample,
    searchAllTabs,
    searchGroupTabs,
    searchGroups,
    searchStripTabs,
    stripSample,
    workspaceGroupCount,
    workspaceSample,
    workspaceTabCount,
} from "./tabSearch.js";
import {
    addTab,
    createGroup,
    pinTab,
    setGroupCollapsed,
    type TabStripState,
    type TabWorkspaceState,
} from "./tabModel.js";

function emptyStrip(
    id: string,
    label: string,
    windowId: string,
    windowLabel: string,
): TabStripState {
    return {
        id,
        label,
        windowId,
        windowLabel,
        placement: "left",
        tabs: [],
        groups: [],
        pinnedOrder: [],
        slots: [],
        activeTabId: null,
    };
}

/** The main strip: a pinned map, a group of two renders, and two loose tabs. */
function mainStrip(): TabStripState {
    let strip = emptyStrip("strip-main", "Main", "window-1", "Material BlueMap");
    for (const label of [
        "Overworld map",
        "Nether render",
        "End render",
        "Settings",
        "Änderungen",
    ]) {
        strip = addTab(strip, { id: label, pageId: "map", label });
    }
    strip = pinTab(strip, "Overworld map");
    strip = createGroup(strip, { id: "g-renders", name: "Renders", color: "tertiary" }, [
        "Nether render",
        "End render",
    ]);
    return strip;
}

/** A second strip in a second window, which only the master search may reach. */
function otherStrip(): TabStripState {
    let strip = emptyStrip("strip-side", "Side", "window-2", "Second window");
    strip = addTab(strip, { id: "side-settings", pageId: "settings", label: "Settings" });
    strip = createGroup(strip, { id: "g-notes", name: "Render notes", color: "info" }, [
        "side-settings",
    ]);
    return strip;
}

const workspace = (): TabWorkspaceState => ({ strips: [mainStrip(), otherStrip()] });

const plain = (query: string) => createSettingMatcher(query, false, "i");
const regex = (pattern: string, flags = "i") => createSettingMatcher(pattern, true, flags);

describe("1: the current strip", () => {
    it("returns the strip's tabs in strip order, pinned first", () => {
        expect(searchStripTabs(mainStrip(), plain("")).map((hit) => hit.label)).toEqual([
            "Overworld map",
            "Nether render",
            "End render",
            "Settings",
            "Änderungen",
        ]);
    });

    it("finds a tab inside a collapsed group, because collapsed is not gone", () => {
        const collapsed = setGroupCollapsed(mainStrip(), "g-renders", true);
        const hits = searchStripTabs(collapsed, plain("nether"));
        expect(hits.map((hit) => hit.label)).toEqual(["Nether render"]);
        expect(hits[0]?.groupCollapsed).toBe(true);
    });

    it("says where every result is, which is the only way two Settings tabs differ", () => {
        const hit = searchStripTabs(mainStrip(), plain("nether"))[0];
        expect(hit).toMatchObject({
            label: "Nether render",
            windowId: "window-1",
            windowLabel: "Material BlueMap",
            stripId: "strip-main",
            stripLabel: "Main",
            groupId: "g-renders",
            groupName: "Renders",
            pinned: false,
        });
    });

    it("reports the pinned state, and the pinned tab's own position", () => {
        const hit = searchStripTabs(mainStrip(), plain("overworld"))[0];
        expect(hit?.pinned).toBe(true);
        expect(hit?.index).toBe(0);
        expect(hit?.groupId).toBeNull();
    });

    it("matches the visible label and nothing behind it", () => {
        // Every tab's `pageId` is "map"; searching for it must find none of them.
        expect(searchStripTabs(mainStrip(), plain("pageId"))).toEqual([]);
        expect(searchStripTabs(mainStrip(), plain("map")).map((hit) => hit.label)).toEqual([
            "Overworld map",
        ]);
    });
});

describe("2: inside one group", () => {
    it("returns that group's tabs and refuses to widen to the strip", () => {
        expect(
            searchGroupTabs(mainStrip(), "g-renders", plain("")).map((hit) => hit.label),
        ).toEqual(["Nether render", "End render"]);
        // "Settings" exists in the strip and not in this group.
        expect(searchGroupTabs(mainStrip(), "g-renders", plain("settings"))).toEqual([]);
    });

    it("returns nothing for a group that is not there, rather than everything", () => {
        expect(searchGroupTabs(mainStrip(), "g-missing", plain(""))).toEqual([]);
    });
});

describe("3: groups by name", () => {
    it("matches group names across every strip and says where each one lives", () => {
        const hits = searchGroups(workspace(), plain("render"));
        expect(hits.map((hit) => hit.name)).toEqual(["Renders", "Render notes"]);
        expect(hits[1]).toMatchObject({
            groupId: "g-notes",
            windowId: "window-2",
            stripId: "strip-side",
            tabCount: 1,
        });
    });

    it("matches names, not the labels of the tabs inside", () => {
        // "Nether render" is a tab in "Renders"; no group is called Nether.
        expect(searchGroups(workspace(), plain("nether"))).toEqual([]);
    });
});

describe("4: every tab everywhere", () => {
    it("crosses windows and strips, and keeps each result locatable", () => {
        const hits = searchAllTabs(workspace(), plain("settings"));
        expect(hits).toHaveLength(2);
        expect(hits.map((hit) => hit.windowLabel)).toEqual(["Material BlueMap", "Second window"]);
        expect(hits.map((hit) => hit.stripLabel)).toEqual(["Main", "Side"]);
        expect(hits[1]?.groupName).toBe("Render notes");
    });

    it("counts what the scopes hold, so a summary can be honest about the total", () => {
        expect(workspaceTabCount(workspace())).toBe(6);
        expect(workspaceGroupCount(workspace())).toBe(2);
    });
});

describe("the scopes do not leak into one another", () => {
    it("gives four different answers for the same query, one per scope", () => {
        const space = workspace();
        const strip = space.strips[0] as TabStripState;
        const query = plain("render");

        expect(searchStripTabs(strip, query)).toHaveLength(2);
        expect(searchGroupTabs(strip, "g-renders", query)).toHaveLength(2);
        expect(searchGroups(space, query)).toHaveLength(2);
        expect(searchAllTabs(space, query)).toHaveLength(2);

        // A different query in one scope cannot change another's answer, because
        // no function here holds any state between calls.
        expect(searchStripTabs(strip, plain("settings"))).toHaveLength(1);
        expect(searchGroupTabs(strip, "g-renders", query)).toHaveLength(2);
    });

    it("does not skip every other result when the pattern carries a global flag", () => {
        const hits = searchStripTabs(mainStrip(), regex("render", "gi"));
        expect(hits.map((hit) => hit.label)).toEqual(["Nether render", "End render"]);
    });

    it("matches nothing at all when the pattern will not compile", () => {
        const broken = regex("([unclosed");
        expect(broken.error).not.toBeNull();
        expect(searchStripTabs(mainStrip(), broken)).toEqual([]);
        expect(searchAllTabs(workspace(), broken)).toEqual([]);
    });

    it("handles Unicode, a case-sensitive pattern and a zero-width one", () => {
        expect(searchStripTabs(mainStrip(), plain("änderungen")).map((hit) => hit.label)).toEqual([
            "Änderungen",
        ]);
        expect(searchStripTabs(mainStrip(), regex("^End", "")).map((hit) => hit.label)).toEqual([
            "End render",
        ]);
        expect(searchStripTabs(mainStrip(), regex("^", "")).map((hit) => hit.label)).toHaveLength(
            5,
        );
    });
});

describe("the corpora the builders preview against", () => {
    it("is the same text the matching search runs over, one candidate per line", () => {
        expect(stripSample(mainStrip()).split("\n")).toEqual([
            "Overworld map",
            "Nether render",
            "End render",
            "Settings",
            "Änderungen",
        ]);
        expect(groupSample(mainStrip(), "g-renders").split("\n")).toEqual([
            "Nether render",
            "End render",
        ]);
        expect(groupNameSample(workspace()).split("\n")).toEqual(["Renders", "Render notes"]);
        expect(workspaceSample(workspace()).split("\n")).toHaveLength(6);
    });

    it("is empty rather than wrong for a group that is not there", () => {
        expect(groupSample(mainStrip(), "g-missing")).toBe("");
    });
});

describe("the actions a result may offer", () => {
    it("offers unpin for a pinned result and pin for an ordinary one, never both", () => {
        const pinnedHit = searchStripTabs(mainStrip(), plain("overworld"))[0];
        const looseHit = searchStripTabs(mainStrip(), plain("settings"))[0];
        expect(pinnedHit && actionsFor(pinnedHit)).toEqual(["activate", "unpin", "close"]);
        expect(looseHit && actionsFor(looseHit)).toEqual(["activate", "pin", "close"]);
    });

    it("offers ungroup only where there is a group to leave", () => {
        const grouped = searchStripTabs(mainStrip(), plain("nether"))[0];
        expect(grouped && actionsFor(grouped)).toEqual(["activate", "pin", "ungroup", "close"]);
    });
});
