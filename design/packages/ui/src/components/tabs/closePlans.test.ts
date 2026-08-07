/**
 * The bulk closes, and the property the contract cares about most: that
 * "containing" and "not containing" partition the same set.
 *
 * The partition is proved rather than asserted case by case. For every query in
 * a list that deliberately includes an empty one, a case-different one, a
 * Unicode one, an all-match and a no-match, in both plain and regex mode, the
 * two directions are checked to be disjoint and to cover the eligible set
 * exactly. That is the assertion that catches the failure the contract names -
 * two matchers drifting on case or flags - because a drift immediately shows up
 * as a tab in neither direction or in both.
 *
 * The rest is about honesty: nothing runs on an empty query or an invalid
 * pattern, pinned tabs are out of scope until somebody says otherwise, and a tab
 * holding unsaved work is reported as kept rather than counted as closed.
 */

import { describe, expect, it } from "vitest";
import { createSettingMatcher } from "../config/regexEngine.js";
import { applyClosePlan, planCloseOthers, planCloseToEdge, planTextClose } from "./closePlans.js";
import {
    addTab,
    createGroup,
    pinTab,
    setTabDirty,
    tabOrder,
    type TabStripState,
} from "./tabModel.js";

const EMPTY: TabStripState = {
    id: "strip-main",
    label: "Main",
    windowId: "window-1",
    windowLabel: "Material BlueMap",
    placement: "left",
    tabs: [],
    groups: [],
    pinnedOrder: [],
    slots: [],
    activeTabId: null,
};

const LABELS = ["Overworld map", "Nether render", "End render", "Settings", "ÄNDERUNGEN", "notes"];

function strip(): TabStripState {
    let built = LABELS.reduce<TabStripState>(
        (state, label) => addTab(state, { id: label, pageId: "map", label }),
        EMPTY,
    );
    built = pinTab(built, "Overworld map");
    built = createGroup(built, { id: "g-renders", name: "Renders" }, [
        "Nether render",
        "End render",
    ]);
    return built;
}

const labels = (hits: readonly { readonly label: string }[]): string[] =>
    hits.map((hit) => hit.label);

describe("one predicate, used in both directions", () => {
    const cases: readonly {
        readonly query: string;
        readonly regexMode: boolean;
        readonly flags: string;
    }[] = [
        { query: "render", regexMode: false, flags: "i" },
        { query: "RENDER", regexMode: false, flags: "i" },
        { query: "änderungen", regexMode: false, flags: "i" },
        { query: "zzz", regexMode: false, flags: "i" },
        { query: ".", regexMode: true, flags: "" },
        { query: "^n", regexMode: true, flags: "i" },
        { query: "^n", regexMode: true, flags: "" },
        { query: "render|notes", regexMode: true, flags: "gi" },
        { query: "^$", regexMode: true, flags: "" },
    ];

    for (const includePinned of [false, true]) {
        for (const { query, regexMode, flags } of cases) {
            it(`partitions the eligible tabs for ${regexMode ? "regex" : "text"} ${JSON.stringify(query)}${
                includePinned ? " including pinned" : ""
            }`, () => {
                const state = strip();
                const matcher = createSettingMatcher(query, regexMode, flags);
                const common = { query, regexMode, matcher, includePinned };

                const inside = planTextClose(state, { ...common, direction: "containing" });
                const outside = planTextClose(state, { ...common, direction: "notContaining" });

                expect(labels(inside.eligible)).toEqual(labels(outside.eligible));

                const insideIds = new Set(inside.selected.map((hit) => hit.tabId));
                const outsideIds = new Set(outside.selected.map((hit) => hit.tabId));

                // Disjoint: no tab is claimed by both actions.
                expect([...insideIds].filter((id) => outsideIds.has(id))).toEqual([]);
                // Exhaustive: every eligible tab is claimed by exactly one of them.
                expect(new Set([...insideIds, ...outsideIds])).toEqual(
                    new Set(inside.eligible.map((hit) => hit.tabId)),
                );
            });
        }
    }

    it("keeps case-insensitivity identical in both directions", () => {
        const state = strip();
        const matcher = createSettingMatcher("RENDER", false, "i");
        const common = { query: "RENDER", regexMode: false, matcher, includePinned: false };

        expect(
            labels(planTextClose(state, { ...common, direction: "containing" }).selected),
        ).toEqual(["Nether render", "End render"]);
        expect(
            labels(planTextClose(state, { ...common, direction: "notContaining" }).selected),
        ).toEqual(["Settings", "ÄNDERUNGEN", "notes"]);
    });
});

describe("what a plan refuses to do", () => {
    const planFor = (query: string, regexMode: boolean, includePinned = false) =>
        planTextClose(strip(), {
            direction: "containing",
            query,
            regexMode,
            matcher: createSettingMatcher(query, regexMode, "i"),
            includePinned,
        });

    it("closes nothing on an empty query, and says that is why", () => {
        const plan = planFor("", false);
        expect(plan.refusal).toBe("empty-query");
        expect(plan.selected).toEqual([]);
        expect(plan.runnable).toBe(false);
    });

    it("closes nothing on whitespace, which is an empty query with extra steps", () => {
        expect(planFor("   ", false).refusal).toBe("empty-query");
    });

    it("closes nothing on a pattern that will not compile, and carries the error", () => {
        const plan = planFor("([unclosed", true);
        expect(plan.refusal).toBe("invalid-pattern");
        expect(plan.patternError).not.toBeNull();
        expect(plan.selected).toEqual([]);
    });

    it("is runnable but empty when the query is valid and simply matches nothing", () => {
        const plan = planFor("zzz", false);
        expect(plan.refusal).toBeNull();
        expect(plan.selected).toEqual([]);
        expect(plan.runnable).toBe(false);
    });

    it("states the matching mode, so a preview never has to guess", () => {
        expect(planFor("render", false).mode).toBe("text");
        expect(planFor("render", true).mode).toBe("regex");
        expect(planCloseOthers(strip(), "notes", false).mode).toBeNull();
    });
});

describe("scope", () => {
    const scoped = (
        groupId: string | null,
        direction: "containing" | "notContaining" = "notContaining",
    ) =>
        planTextClose(strip(), {
            direction,
            query: "nether",
            regexMode: false,
            matcher: createSettingMatcher("nether", false, "i"),
            includePinned: false,
            groupId,
        });

    it("covers the whole strip when no group was named, and says so", () => {
        const plan = scoped(null);
        expect(plan.scope).toEqual({ kind: "strip" });
        expect(labels(plan.eligible)).toEqual([
            "Nether render",
            "End render",
            "Settings",
            "ÄNDERUNGEN",
            "notes",
        ]);
    });

    it("never crosses the group boundary, in either direction", () => {
        const outside = scoped("g-renders");
        expect(outside.scope).toEqual({
            kind: "group",
            groupId: "g-renders",
            groupName: "Renders",
        });
        expect(labels(outside.eligible)).toEqual(["Nether render", "End render"]);
        expect(labels(outside.selected)).toEqual(["End render"]);
        expect(labels(scoped("g-renders", "containing").selected)).toEqual(["Nether render"]);
    });

    it("falls back to the strip rather than closing nothing when the group has gone", () => {
        expect(scoped("g-missing").scope).toEqual({ kind: "strip" });
    });
});

describe("pinned tabs", () => {
    it("are out of scope by default, and are named rather than merely absent", () => {
        const plan = planTextClose(strip(), {
            direction: "notContaining",
            query: "zzz",
            regexMode: false,
            matcher: createSettingMatcher("zzz", false, "i"),
            includePinned: false,
        });
        expect(labels(plan.selected)).not.toContain("Overworld map");
        expect(plan.protectedPinned.map((entry) => entry.hit.label)).toEqual(["Overworld map"]);
        expect(plan.protectedPinned.every((entry) => entry.reason === "pinned")).toBe(true);
    });

    it("come into scope only when the choice is made explicitly", () => {
        const plan = planTextClose(strip(), {
            direction: "containing",
            query: "map",
            regexMode: false,
            matcher: createSettingMatcher("map", false, "i"),
            includePinned: true,
        });
        expect(labels(plan.selected)).toEqual(["Overworld map"]);
        expect(plan.protectedPinned).toEqual([]);
    });

    it("are protected from close-others and close-to-the-right the same way", () => {
        expect(labels(planCloseOthers(strip(), "notes", false).selected)).toEqual([
            "Nether render",
            "End render",
            "Settings",
            "ÄNDERUNGEN",
        ]);
        expect(labels(planCloseOthers(strip(), "notes", true).selected)).toContain("Overworld map");
        expect(labels(planCloseToEdge(strip(), "Settings", "end", false).selected)).toEqual([
            "ÄNDERUNGEN",
            "notes",
        ]);
        expect(labels(planCloseToEdge(strip(), "Settings", "start", false).selected)).toEqual([
            "Nether render",
            "End render",
        ]);
    });
});

describe("unsaved work", () => {
    const dirtyStrip = (): TabStripState => setTabDirty(strip(), "Settings", true);

    const plan = (state: TabStripState) =>
        planTextClose(state, {
            direction: "notContaining",
            query: "render",
            regexMode: false,
            matcher: createSettingMatcher("render", false, "i"),
            includePinned: false,
        });

    it("names the tabs a confirmation has to mention, without removing them from scope", () => {
        const built = plan(dirtyStrip());
        expect(labels(built.selected)).toEqual(["Settings", "ÄNDERUNGEN", "notes"]);
        expect(built.unsaved.map((entry) => entry.hit.label)).toEqual(["Settings"]);
    });

    it("keeps them open and reports them, rather than counting them as closed", () => {
        const state = dirtyStrip();
        const outcome = applyClosePlan(state, plan(state));
        expect(labels(outcome.closed)).toEqual(["ÄNDERUNGEN", "notes"]);
        expect(outcome.kept.map((entry) => entry.hit.label)).toEqual(["Settings"]);
        expect(tabOrder(outcome.strip).map((tab) => tab.label)).toContain("Settings");
    });

    it("closes them once the confirmation says so", () => {
        const state = dirtyStrip();
        const outcome = applyClosePlan(state, plan(state), { closeUnsaved: true });
        expect(labels(outcome.closed)).toEqual(["Settings", "ÄNDERUNGEN", "notes"]);
        expect(outcome.kept).toEqual([]);
        expect(tabOrder(outcome.strip).map((tab) => tab.label)).toEqual([
            "Overworld map",
            "Nether render",
            "End render",
        ]);
    });
});

describe("applying a plan", () => {
    it("does nothing at all for a plan that refused, even if the caller insists", () => {
        const state = strip();
        const refused = planTextClose(state, {
            direction: "containing",
            query: "",
            regexMode: false,
            matcher: createSettingMatcher("", false, "i"),
            includePinned: false,
        });
        const outcome = applyClosePlan(state, refused, { closeUnsaved: true });
        expect(outcome.closed).toEqual([]);
        expect(outcome.strip).toBe(state);
    });

    it("closes exactly the previewed set, so the preview cannot overstate itself", () => {
        const state = strip();
        const built = planTextClose(state, {
            direction: "containing",
            query: "render",
            regexMode: false,
            matcher: createSettingMatcher("render", false, "i"),
            includePinned: false,
        });
        const outcome = applyClosePlan(state, built);
        expect(labels(outcome.closed)).toEqual(labels(built.selected));
        expect(tabOrder(outcome.strip).map((tab) => tab.label)).toEqual([
            "Overworld map",
            "Settings",
            "ÄNDERUNGEN",
            "notes",
        ]);
    });

    it("tidies away a group whose last tab it closed, and names it", () => {
        const state = strip();
        const built = planTextClose(state, {
            direction: "containing",
            query: "render",
            regexMode: false,
            matcher: createSettingMatcher("render", false, "i"),
            includePinned: false,
        });
        const outcome = applyClosePlan(state, built);
        expect(outcome.emptiedGroups.map((group) => group.name)).toEqual(["Renders"]);
        expect(outcome.strip.groups).toEqual([]);
    });

    it("keeps that group when the choice to keep it was made", () => {
        const state = strip();
        const built = planTextClose(state, {
            direction: "containing",
            query: "render",
            regexMode: false,
            matcher: createSettingMatcher("render", false, "i"),
            includePinned: false,
        });
        const outcome = applyClosePlan(state, built, { keepEmptyGroups: true });
        expect(outcome.emptiedGroups.map((group) => group.name)).toEqual(["Renders"]);
        expect(outcome.strip.groups.map((group) => group.tabIds)).toEqual([[]]);
    });
});
