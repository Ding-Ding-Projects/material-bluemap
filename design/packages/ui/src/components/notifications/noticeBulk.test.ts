/**
 * The bulk-action model, unit tested without a component: what a click, a shift-click, an
 * invert and a scoped "select all" do to a selection, what each bulk action honestly reports
 * before it runs, and what it actually leaves behind afterwards.
 */

import { describe, expect, it } from "vitest";
import { createNoticeState, notify, type NoticeState } from "../config/notifications.js";
import {
    bulkDismiss,
    deleteImpact,
    deleteSelectedHistory,
    dismissImpact,
    emptySelection,
    exportImpact,
    formatNoticesAsJson,
    invertSelection,
    markSelectedAsRead,
    noticeSummary,
    rangeSelection,
    readImpact,
    selectedAmong,
    selectExactly,
    toggleSelection,
} from "./noticeBulk.js";
import { filterNotices, formatNoticesAsMarkdown } from "./noticeCentre.js";
import { createSettingMatcher } from "../config/regexEngine.js";

/** Five notices, ids 1..5 in the order raised (history holds them newest first). */
function fiveNotices(): NoticeState {
    const state = createNoticeState();
    notify(state, "info", "one");
    notify(state, "info", "two");
    notify(state, "warning", "three");
    notify(state, "error", "four", { title: "Save failed" });
    notify(state, "success", "five");
    return state;
}

describe("selection: a plain click", () => {
    it("picks an id up that was not picked", () => {
        const next = toggleSelection(emptySelection(), 3);
        expect([...next]).toEqual([3]);
    });

    it("puts an id back down that was picked", () => {
        const once = toggleSelection(emptySelection(), 3);
        const twice = toggleSelection(once, 3);
        expect([...twice]).toEqual([]);
    });

    it("leaves every other pick alone", () => {
        const start = new Set([1, 2]);
        const next = toggleSelection(start, 3);
        expect([...next].sort()).toEqual([1, 2, 3]);
    });
});

describe("selection: shift-click ranges", () => {
    it("falls back to a plain pick when there is no anchor yet", () => {
        const next = rangeSelection([5, 4, 3, 2, 1], emptySelection(), null, 3);
        expect([...next]).toEqual([3]);
    });

    it("adds every id between the anchor and the click, in the visible order", () => {
        const next = rangeSelection([5, 4, 3, 2, 1], emptySelection(), 5, 2);
        expect([...next].sort((a, b) => a - b)).toEqual([2, 3, 4, 5]);
    });

    it("works backwards from a later anchor to an earlier click", () => {
        const next = rangeSelection([5, 4, 3, 2, 1], emptySelection(), 2, 5);
        expect([...next].sort((a, b) => a - b)).toEqual([2, 3, 4, 5]);
    });

    it("extends an existing selection rather than replacing it", () => {
        const start = new Set([1]);
        const next = rangeSelection([5, 4, 3, 2, 1], start, 5, 4);
        expect([...next].sort((a, b) => a - b)).toEqual([1, 4, 5]);
    });

    it("never sweeps in an id the filter is currently hiding", () => {
        // Only 5, 3 and 1 are visible right now (2 and 4 are filtered out); a shift-click
        // range between 5 and 1 must not silently pick up 4 or 2.
        const next = rangeSelection([5, 3, 1], emptySelection(), 5, 1);
        expect([...next].sort((a, b) => a - b)).toEqual([1, 3, 5]);
    });

    it("degrades to a plain pick if either end is not in the visible order", () => {
        const next = rangeSelection([5, 3, 1], emptySelection(), 99, 3);
        expect([...next]).toEqual([3]);
    });
});

describe("selection: scoped select all", () => {
    it("selects exactly the ids given, replacing whatever was picked before", () => {
        const start = new Set([99]);
        const next = selectExactly([1, 2, 3]);
        expect(next).not.toBe(start);
        expect([...next].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    });
});

describe("selection: invert", () => {
    it("flips every visible id and leaves a selection outside that set untouched", () => {
        const start = new Set([1, 99]);
        const next = invertSelection([1, 2, 3], start);
        // 1 was visible and picked: it comes out. 2 and 3 were visible and unpicked: they
        // go in. 99 was not visible at all: it is left exactly as it was.
        expect([...next].sort((a, b) => a - b)).toEqual([2, 3, 99]);
    });
});

describe("dismiss: the honest preview and the action", () => {
    it("counts only the selected ids that are actually showing right now", () => {
        const state = fiveNotices();
        // Nothing raised by notify() auto-dismisses instantly in a test, so everything is
        // still live; drop two of them off screen to make the counts interesting.
        state.live = state.live.filter((notice) => notice.id !== 2 && notice.id !== 4);

        const impact = dismissImpact(state, new Set([1, 2, 3, 4, 5]));
        expect(impact).toEqual({ selectedCount: 5, changingCount: 3, excludedCount: 2 });
    });

    it("clears only the selected ids off the corner, leaving the history alone", () => {
        const state = fiveNotices();
        const removed = bulkDismiss(state, new Set([1, 3]));

        expect(removed).toBe(2);
        expect(state.live.map((notice) => notice.id).sort((a, b) => a - b)).toEqual([2, 4, 5]);
        expect(state.history).toHaveLength(5);
    });
});

describe("delete: the honest preview, the gate's job, and the action", () => {
    it("counts only the selected ids still present in the history", () => {
        const state = fiveNotices();
        const impact = deleteImpact(state, new Set([1, 2, 999]));
        expect(impact).toEqual({ selectedCount: 3, changingCount: 2, excludedCount: 1 });
    });

    it("removes the selected ids from the history and off the corner, and nothing else", () => {
        const state = fiveNotices();
        const removed = deleteSelectedHistory(state, new Set([2, 4]));

        expect(removed).toBe(2);
        expect(state.history.map((notice) => notice.id).sort((a, b) => a - b)).toEqual([1, 3, 5]);
        expect(state.live.map((notice) => notice.id)).not.toContain(2);
        expect(state.live.map((notice) => notice.id)).not.toContain(4);
    });

    it("does nothing when the selection is stale, rather than throwing", () => {
        const state = fiveNotices();
        const removed = deleteSelectedHistory(state, new Set([12345]));
        expect(removed).toBe(0);
        expect(state.history).toHaveLength(5);
    });
});

describe("mark as read: the watermark, honestly", () => {
    it("advances the line only as far as the newest selected notice", () => {
        const state = fiveNotices();
        expect(state.reviewedId).toBe(0);

        const changed = markSelectedAsRead(state, new Set([2]));

        expect(state.reviewedId).toBe(2);
        expect(changed).toBe(2); // ids 1 and 2 both flip, because the line is one watermark
    });

    it("reports the notices that ride along even though only one id was picked", () => {
        const state = fiveNotices();
        const impact = readImpact(state, new Set([2]));

        expect(impact.selectedCount).toBe(1);
        expect(impact.changingCount).toBe(2); // ids 1 and 2
        expect(impact.extraCount).toBe(1); // id 1 rode along
        expect(impact.missingCount).toBe(0);
    });

    it("reports missing ids separately from the ones that changed", () => {
        const state = fiveNotices();
        const impact = readImpact(state, new Set([2, 999]));

        expect(impact.missingCount).toBe(1);
        expect(impact.changingCount).toBe(2);
    });

    it("never moves the line backwards", () => {
        const state = fiveNotices();
        markSelectedAsRead(state, new Set([4]));
        expect(state.reviewedId).toBe(4);

        const changed = markSelectedAsRead(state, new Set([1]));
        expect(state.reviewedId).toBe(4);
        expect(changed).toBe(0);
    });

    it("does nothing when every picked id is stale", () => {
        const state = fiveNotices();
        const changed = markSelectedAsRead(state, new Set([999]));
        expect(changed).toBe(0);
        expect(state.reviewedId).toBe(0);
    });
});

describe("export: matches what the filter is showing, not the whole selection", () => {
    it("counts only the selected ids the current filter keeps visible", () => {
        const state = fiveNotices();
        const visible = filterNotices(state.history, {
            levels: [],
            matcher: createSettingMatcher("four", false, "i"),
        });

        const impact = exportImpact(visible, new Set([1, 2, 4]));
        expect(impact).toEqual({ selectedCount: 3, changingCount: 1, excludedCount: 2 });
    });

    it("resolves the selection down to notices, in the filter's own order", () => {
        const state = fiveNotices();
        const picked = selectedAmong(state.history, new Set([1, 3, 5]));
        // state.history is newest first: 5, 4, 3, 2, 1. Picking {1, 3, 5} in that order
        // keeps 5 before 3 before 1, which is the order the panel would actually show them.
        expect(picked.map((notice) => notice.message)).toEqual(["five", "three", "one"]);
        expect(picked.map((notice) => notice.id).sort((a, b) => a - b)).toEqual([1, 3, 5]);
    });

    it("writes JSON that round-trips the selected notices' real fields", () => {
        const state = fiveNotices();
        const failure = state.history.find((notice) => notice.title === "Save failed");
        const json = formatNoticesAsJson(failure ? [failure] : []);
        const parsed = JSON.parse(json) as unknown[];

        expect(parsed).toHaveLength(1);
        expect((parsed[0] as { title: string }).title).toBe("Save failed");
        expect((parsed[0] as { message: string }).message).toBe("four");
    });

    it("writes Markdown through the same formatter the single-item copy button uses", () => {
        const state = fiveNotices();
        const picked = selectedAmong(state.history, new Set([1]));
        expect(formatNoticesAsMarkdown(picked)).toContain("one");
    });
});

describe("noticeSummary", () => {
    it("prefers the title when there is one", () => {
        const state = fiveNotices();
        const failure = state.history.find((notice) => notice.title === "Save failed");
        expect(noticeSummary(failure as (typeof state.history)[number])).toBe("Save failed");
    });

    it("falls back to the message otherwise", () => {
        const state = fiveNotices();
        const plain = state.history.find((notice) => notice.message === "two");
        expect(noticeSummary(plain as (typeof state.history)[number])).toBe("two");
    });

    it("truncates a very long summary rather than overflowing a row", () => {
        const state = createNoticeState();
        notify(state, "info", "x".repeat(200));
        expect(noticeSummary(state.history[0] as (typeof state.history)[number]).length).toBeLessThanOrEqual(80);
    });
});
