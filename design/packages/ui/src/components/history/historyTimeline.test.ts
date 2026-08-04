/**
 * The timeline, tested on the two things it can quietly get wrong.
 *
 *  - **Which revision is on disk now.** Taking it from the first row of the list is right
 *    until a filter is on, and then it is a confident lie in exactly the situation where
 *    being wrong about which state is live matters most. So the id is passed in from the
 *    unfiltered history and marked wherever it lands, or nowhere at all.
 *  - **A revision whose date cannot be read.** It has to survive grouping. A revision that
 *    exists and cannot be placed on a calendar is still one somebody may need to restore,
 *    and a timeline that dropped it would make it findable only by turning the timeline
 *    off, which nobody would think to do.
 */

import { describe, expect, it } from "vitest";

import { currentRevisionId, groupRevisionsByDay, revisionCounts } from "./historyTimeline.js";
import type { HistoryRevision } from "./historyHost.js";

function revision(partial: Partial<HistoryRevision> & { id: string }): HistoryRevision {
    return {
        shortId: partial.id.slice(0, 12),
        at: "2026-03-04T10:00:00",
        label: "Changed the core settings",
        action: "changed",
        changes: [{ path: "core.conf", status: "modified" }],
        note: null,
        restoredFrom: null,
        ...partial,
    };
}

/** Newest first, which is the order the panel hands over. */
const history: HistoryRevision[] = [
    revision({
        id: "aaaa000000001",
        at: "2026-03-10T18:00:00",
        changes: [{ path: "maps/nether.conf", status: "deleted" }],
    }),
    revision({
        id: "bbbb000000002",
        at: "2026-03-10T09:00:00",
        changes: [
            { path: "core.conf", status: "modified" },
            { path: "maps/nether.conf", status: "modified" },
        ],
    }),
    revision({
        id: "cccc000000003",
        at: "2026-03-04T09:00:00",
        changes: [{ path: "maps/nether.conf", status: "added" }],
    }),
];

/* -------------------------------------------------------------------------- */

describe("a long history becomes a short list of days", () => {
    it("groups by the local day, newest day first", () => {
        const days = groupRevisionsByDay(history);
        expect(days.map((day) => day.day)).toEqual(["2026-03-10", "2026-03-04"]);
        expect(days[0]?.revisions.map((entry) => entry.id)).toEqual(["aaaa000000001", "bbbb000000002"]);
    });

    it("keeps the order it was given inside each day rather than re-sorting", () => {
        const reversed = [...history].reverse();
        const days = groupRevisionsByDay(reversed);
        // A timeline that silently re-sorted would disagree with the list beside it.
        expect(days[0]?.revisions.map((entry) => entry.id)).toEqual(["cccc000000003"]);
        expect(days[1]?.revisions.map((entry) => entry.id)).toEqual(["bbbb000000002", "aaaa000000001"]);
    });

    it("counts distinct files, so two edits to one file count once", () => {
        const days = groupRevisionsByDay(history);
        // Three changes across two revisions, but only two files: core.conf and nether.
        expect(days[0]?.files).toBe(2);
        expect(days[0]?.counts).toEqual({ added: 0, modified: 2, deleted: 1 });
    });

    it("splits one revision's own files the same way", () => {
        expect(revisionCounts(history[1] as HistoryRevision)).toEqual({ added: 0, modified: 2, deleted: 0 });
        expect(revisionCounts(revision({ id: "x", changes: [] }))).toEqual({ added: 0, modified: 0, deleted: 0 });
    });

    it("has nothing to group when there is nothing recorded", () => {
        expect(groupRevisionsByDay([])).toEqual([]);
    });
});

describe("the state that is on disk now is marked, never inferred", () => {
    it("marks the day holding the given revision, and only that day", () => {
        const days = groupRevisionsByDay(history, "cccc000000003");
        expect(days.map((day) => day.holdsCurrent)).toEqual([false, true]);
    });

    it("marks nothing when the live revision is filtered out of the view", () => {
        // The newest row of a filtered view is only the newest thing that matched, and
        // calling it "on disk now" would be wrong exactly when it matters.
        const filtered = history.slice(1);
        const days = groupRevisionsByDay(filtered, "aaaa000000001");
        expect(days.some((day) => day.holdsCurrent)).toBe(false);
    });

    it("reads the live revision from the whole history, which is its newest", () => {
        expect(currentRevisionId(history)).toBe("aaaa000000001");
        expect(currentRevisionId([])).toBeNull();
    });
});

describe("a revision with an unreadable date is kept rather than dropped", () => {
    const broken = revision({ id: "dddd000000004", at: "not a date" });

    it("puts it in its own group at the end", () => {
        const days = groupRevisionsByDay([...history, broken]);
        expect(days[days.length - 1]?.day).toBeNull();
        expect(days[days.length - 1]?.revisions.map((entry) => entry.id)).toEqual(["dddd000000004"]);
    });

    it("does not collide with a day that is literally the word null", () => {
        const days = groupRevisionsByDay([broken, revision({ id: "eeee000000005" })]);
        expect(days).toHaveLength(2);
        expect(days.filter((day) => day.day === null)).toHaveLength(1);
    });

    it("can still hold the live revision", () => {
        const days = groupRevisionsByDay([broken], "dddd000000004");
        expect(days[0]?.holdsCurrent).toBe(true);
    });
});
