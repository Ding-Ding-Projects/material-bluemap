/**
 * What the notification centre decides, without a component in the way.
 *
 * Filtering is where a review surface quietly stops being reviewable: a search that only
 * reads the message body cannot find the notice by the file name in its stack trace, and a
 * level row that treats "nothing selected" as "nothing shown" hides the whole history the
 * first time somebody presses a chip twice. Neither failure is visible in a screenshot, and
 * both are one assertion each here.
 */

import { describe, expect, it } from "vitest";
import { createSettingMatcher } from "../config/regexEngine.js";
import { createNoticeState, notify, type Notice, type NoticeLevel } from "../config/notifications.js";
import {
    NOTICE_LEVELS,
    countByLevel,
    daysWithNotices,
    filterNotices,
    formatNoticesAsMarkdown,
    noticeDay,
    noticeHistorySpan,
    noticeSampleText,
    noticeSearchText,
} from "./noticeCentre.js";

/** A history with one of each level, plus a detail and an action to search through. */
function sampleHistory(): Notice[] {
    const state = createNoticeState();
    notify(state, "info", "Read 9 config files.");
    notify(state, "success", "Saved the BlueMap configuration in /srv/bluemap.");
    notify(state, "warning", "These maps have to be rendered again: overworld.");
    notify(state, "error", "The files were not written.", {
        title: "Save failed",
        detail: "EACCES: permission denied, open '/srv/bluemap/core.conf'",
        actions: [{ id: "retry", label: "Retry the save" }],
    });
    return state.history;
}

/** Plain text, which is what the field defaults to. */
function plain(query: string) {
    return createSettingMatcher(query, false, "i");
}

const ALL_LEVELS: readonly NoticeLevel[] = [];

describe("what a search is tested against", () => {
    it("reads the title, the body, the detail and the action labels", () => {
        const history = sampleHistory();
        const failure = history[0] as Notice;
        const text = noticeSearchText(failure);

        expect(text).toContain("Save failed");
        expect(text).toContain("The files were not written.");
        expect(text).toContain("EACCES");
        expect(text).toContain("Retry the save");
    });

    it("includes the level name, because that is what somebody types before they find the chips", () => {
        const history = sampleHistory();
        const matches = filterNotices(history, { levels: ALL_LEVELS, matcher: plain("error") });

        expect(matches.map((notice) => notice.message)).toEqual(["The files were not written."]);
    });

    it("includes the timestamp, so a session can be narrowed to a day without a date picker", () => {
        const history = sampleHistory();
        const day = (history[0] as Notice).at.slice(0, 10);

        expect(filterNotices(history, { levels: ALL_LEVELS, matcher: plain(day) })).toHaveLength(4);
    });

    it("keeps one notice on one line, so the builder previews against what the filter tests", () => {
        const history = sampleHistory();
        const lines = noticeSampleText(history).split("\n");

        expect(lines).toHaveLength(history.length);
        expect(lines[0]).toBe(noticeSearchText(history[0] as Notice));
    });
});

describe("filtering by level", () => {
    it("shows everything when nothing is selected, because that is a user who has not filtered", () => {
        const history = sampleHistory();
        expect(filterNotices(history, { levels: [], matcher: plain("") })).toHaveLength(4);
    });

    it("keeps only the levels asked for", () => {
        const history = sampleHistory();
        const matches = filterNotices(history, {
            levels: ["error", "warning"],
            matcher: plain(""),
        });

        expect(matches.map((notice) => notice.level)).toEqual(["error", "warning"]);
    });

    it("composes with the search rather than overriding it", () => {
        const history = sampleHistory();
        const matches = filterNotices(history, {
            levels: ["error", "warning"],
            matcher: plain("overworld"),
        });

        expect(matches.map((notice) => notice.level)).toEqual(["warning"]);
    });

    it("keeps the history's own order, newest first", () => {
        const history = sampleHistory();
        const matches = filterNotices(history, { levels: ALL_LEVELS, matcher: plain("") });

        expect(matches.map((notice) => notice.level)).toEqual(["error", "warning", "success", "info"]);
    });
});

describe("searching with a regular expression", () => {
    it("uses the same engine the settings search bars use", () => {
        const history = sampleHistory();
        const matches = filterNotices(history, {
            levels: ALL_LEVELS,
            matcher: createSettingMatcher("^error\\b", true, "i"),
        });

        expect(matches.map((notice) => notice.level)).toEqual(["error"]);
    });

    it("matches nothing when the pattern does not compile, rather than falling back to everything", () => {
        const history = sampleHistory();
        const matcher = createSettingMatcher("(unclosed", true, "");

        expect(matcher.error).not.toBeNull();
        expect(filterNotices(history, { levels: ALL_LEVELS, matcher })).toEqual([]);
    });
});

/** A notice at an exact timestamp, built directly rather than through `notify()`'s `now`. */
function noticeAt(partial: Partial<Notice> & { id: number; at: string }): Notice {
    return {
        level: "info",
        message: "something happened",
        timeout: null,
        ...partial,
    };
}

describe("filtering by a date range", () => {
    // No timezone offset on purpose, matching `HistoryPanel.test.ts`'s own fixtures:
    // `noticeDay` reads local-time getters, so a timestamp already written in local time is
    // read back on the same day on every machine this suite runs on, offset or not.
    const history: Notice[] = [
        noticeAt({ id: 3, at: "2026-03-10T09:00:00", message: "the newest one" }),
        noticeAt({ id: 2, at: "2026-03-05T09:00:00", message: "the middle one" }),
        noticeAt({ id: 1, at: "2026-03-01T09:00:00", message: "the oldest one" }),
    ];

    it("keeps everything when no range is given, the same as before this filter existed", () => {
        const matches = filterNotices(history, { levels: ALL_LEVELS, matcher: plain("") });
        expect(matches).toHaveLength(3);
    });

    it("narrows to the days inside the range, inclusive of both ends", () => {
        const matches = filterNotices(history, {
            levels: ALL_LEVELS,
            matcher: plain(""),
            range: { from: "2026-03-05", to: "2026-03-10" },
        });
        expect(matches.map((notice) => notice.id)).toEqual([3, 2]);
    });

    it("composes with the search and the level filter rather than overriding either", () => {
        const matches = filterNotices(history, {
            levels: ALL_LEVELS,
            matcher: plain("middle"),
            range: { from: "2026-03-01", to: "2026-03-31" },
        });
        expect(matches.map((notice) => notice.id)).toEqual([2]);

        const excluded = filterNotices(history, {
            levels: ALL_LEVELS,
            matcher: plain("middle"),
            range: { from: "2026-03-06", to: "2026-03-31" },
        });
        expect(excluded).toEqual([]);
    });

    it("keeps a notice whose timestamp cannot be read, rather than hiding it from a date filter", () => {
        const broken = [noticeAt({ id: 9, at: "not a real date", message: "unparseable" })];
        const matches = filterNotices(broken, {
            levels: ALL_LEVELS,
            matcher: plain(""),
            range: { from: "2026-01-01", to: "2026-01-02" },
        });
        expect(matches).toHaveLength(1);
    });

    it("reads the local day a notice falls on, for the calendar's own marks and span", () => {
        expect(noticeDay(history[0] as Notice)).toBe("2026-03-10");
        expect(daysWithNotices(history)).toEqual(new Set(["2026-03-10", "2026-03-05", "2026-03-01"]));
        expect(noticeHistorySpan(history)).toEqual({ earliest: "2026-03-01", latest: "2026-03-10" });
    });

    it("reports null for a notice whose timestamp cannot be read", () => {
        expect(noticeDay(noticeAt({ id: 9, at: "not a real date" }))).toBeNull();
    });
});

describe("the level counts", () => {
    it("reports every level even at zero, so a chip cannot vanish and be unfindable later", () => {
        const state = createNoticeState();
        notify(state, "error", "boom");
        notify(state, "error", "boom again");

        expect(countByLevel(state.history)).toEqual({ error: 2, warning: 0, success: 0, info: 0 });
    });

    it("covers every level the type has, in worst-first order", () => {
        expect([...NOTICE_LEVELS].sort()).toEqual(["error", "info", "success", "warning"]);
        expect(NOTICE_LEVELS[0]).toBe("error");
    });
});

describe("copying what is shown", () => {
    it("carries the level, the timestamp and the detail, so a pasted extract still says what happened", () => {
        const history = sampleHistory();
        const failure = history[0] as Notice;
        const text = formatNoticesAsMarkdown([failure]);

        expect(text).toContain("**error**");
        expect(text).toContain(failure.at);
        expect(text).toContain("Save failed");
        expect(text).toContain("The files were not written.");
        expect(text).toContain("EACCES");
    });

    it("exports the filtered view rather than quietly widening to everything", () => {
        const history = sampleHistory();
        const visible = filterNotices(history, { levels: ["error"], matcher: plain("") });

        expect(formatNoticesAsMarkdown(visible).split("\n- ")).toHaveLength(1);
        expect(formatNoticesAsMarkdown(history).split("\n- ")).toHaveLength(4);
    });
});
