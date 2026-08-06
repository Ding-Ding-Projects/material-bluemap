import { describe, expect, it } from "vitest";
import {
    HISTORY_LIMIT,
    INFO_TIMEOUT_MS,
    SUCCESS_TIMEOUT_MS,
    createNoticeState,
    dismiss,
    dismissAll,
    localTimestamp,
    markReviewed,
    notify,
    restore,
    setNoticeDurationLevel,
    timeoutFor,
    unreadCount,
} from "./notifications.js";
import { DEFAULT_NOTICE_DURATION_LEVEL, NOTICE_DURATION_LEVELS } from "./noticeDurationLevels.js";

describe("how long a notice stays", () => {
    it("dismisses information and success by itself, at the shipped default level", () => {
        expect(timeoutFor("info")).toBe(INFO_TIMEOUT_MS);
        expect(timeoutFor("success")).toBe(SUCCESS_TIMEOUT_MS);
    });

    it("leaves a warning or an error on screen until it is dismissed, because a failure that vanishes is a failure nobody read", () => {
        expect(timeoutFor("warning")).toBeNull();
        expect(timeoutFor("error")).toBeNull();
    });

    it("leaves a warning or an error on screen at every duration level, not only the default", () => {
        for (const { level } of NOTICE_DURATION_LEVELS) {
            expect(timeoutFor("warning", level)).toBeNull();
            expect(timeoutFor("error", level)).toBeNull();
        }
    });

    it("follows the dial for info and success, level by level", () => {
        for (const entry of NOTICE_DURATION_LEVELS) {
            expect(timeoutFor("info", entry.level)).toBe(entry.infoTimeoutMs);
            expect(timeoutFor("success", entry.level)).toBe(entry.successTimeoutMs);
        }
    });

    it("never auto-dismisses info or success at the top level, the same as a warning", () => {
        expect(timeoutFor("info", 5)).toBeNull();
        expect(timeoutFor("success", 5)).toBeNull();
    });
});

describe("the state's own duration level", () => {
    it("defaults to the shipped level, so a fresh session behaves exactly as it always has", () => {
        const state = createNoticeState();
        expect(state.durationLevel).toBe(DEFAULT_NOTICE_DURATION_LEVEL);

        const notice = notify(state, "info", "Read 9 config files.");
        expect(notice.timeout).toBe(INFO_TIMEOUT_MS);
    });

    it("changes what every notice raised after it gets, not what is already on screen", () => {
        const state = createNoticeState();
        const before = notify(state, "info", "before the change");

        setNoticeDurationLevel(state, 5);
        const after = notify(state, "info", "after the change");

        // The already-raised notice keeps the timeout it was given; a live setting change
        // must not retroactively alter a toast that is already counting down.
        expect(before.timeout).toBe(INFO_TIMEOUT_MS);
        expect(after.timeout).toBeNull();
    });

    it("still leaves errors and warnings alone at every level, including the quickest", () => {
        const state = createNoticeState();
        setNoticeDurationLevel(state, 1);

        expect(notify(state, "error", "boom").timeout).toBeNull();
        expect(notify(state, "warning", "careful").timeout).toBeNull();
    });
});

describe("raising a notice", () => {
    it("puts it on screen and in the history at once", () => {
        const state = createNoticeState();
        const notice = notify(state, "info", "Read 9 config files.");

        expect(state.live).toEqual([notice]);
        expect(state.history).toEqual([notice]);
    });

    it("stacks newest last on screen and newest first in the history", () => {
        const state = createNoticeState();
        notify(state, "info", "first");
        notify(state, "info", "second");

        expect(state.live.map((notice) => notice.message)).toEqual(["first", "second"]);
        expect(state.history.map((notice) => notice.message)).toEqual(["second", "first"]);
    });

    it("carries a detail when there is one, and leaves the field off when there is not", () => {
        const state = createNoticeState();
        const withDetail = notify(state, "error", "The files were not written.", "EACCES: permission denied");
        const without = notify(state, "info", "Nothing to do.");

        expect(withDetail.detail).toBe("EACCES: permission denied");
        expect("detail" in without).toBe(false);
    });

    it("gives every notice its own id", () => {
        const state = createNoticeState();
        const ids = [notify(state, "info", "a").id, notify(state, "info", "b").id, notify(state, "info", "c").id];
        expect(new Set(ids).size).toBe(3);
    });
});

describe("dismissing", () => {
    it("takes one notice off the screen and leaves it in the history", () => {
        const state = createNoticeState();
        const notice = notify(state, "error", "boom");

        dismiss(state, notice.id);
        expect(state.live).toEqual([]);
        expect(state.history).toHaveLength(1);
    });

    it("clears the screen without clearing the history", () => {
        const state = createNoticeState();
        notify(state, "info", "a");
        notify(state, "warning", "b");

        dismissAll(state);
        expect(state.live).toEqual([]);
        expect(state.history).toHaveLength(2);
    });

    it("ignores an id that is not there rather than throwing", () => {
        const state = createNoticeState();
        notify(state, "info", "a");
        dismiss(state, 9999);
        expect(state.live).toHaveLength(1);
    });
});

describe("the history", () => {
    it("is bounded, so a long session cannot grow without limit", () => {
        const state = createNoticeState();
        for (let index = 0; index < HISTORY_LIMIT + 10; index++) notify(state, "info", `notice ${index}`);

        expect(state.history).toHaveLength(HISTORY_LIMIT);
        expect(state.history[0]?.message).toBe(`notice ${HISTORY_LIMIT + 9}`);
    });
});

describe("what a notice can carry", () => {
    it("takes a title and actions, and keeps them on the same object the history holds", () => {
        const state = createNoticeState();
        const notice = notify(state, "error", "The files were not written.", {
            title: "Save failed",
            detail: "EACCES: permission denied",
            actions: [{ id: "retry", label: "Retry the save" }],
        });

        expect(notice.title).toBe("Save failed");
        expect(notice.actions?.[0]?.id).toBe("retry");
        // Identity is compared through the id rather than with `toBe`: the state is
        // `reactive`, so reading an entry back hands out a proxy of the same object.
        expect(state.history[0]?.id).toBe(notice.id);
        expect(state.history[0]?.actions?.[0]?.label).toBe("Retry the save");
    });

    it("still takes a bare detail string, which is what every existing caller passes", () => {
        const state = createNoticeState();
        const notice = notify(state, "error", "boom", "EACCES: permission denied");

        expect(notice.detail).toBe("EACCES: permission denied");
        expect("title" in notice).toBe(false);
    });

    it("leaves the fields off rather than storing an empty one, so a toast can test for them", () => {
        const state = createNoticeState();
        const notice = notify(state, "info", "Nothing to do.", { actions: [] });

        expect("title" in notice).toBe(false);
        expect("detail" in notice).toBe(false);
        expect("actions" in notice).toBe(false);
    });
});

describe("bringing a dismissed notice back", () => {
    it("puts the same notice on screen again, id and actions intact", () => {
        const state = createNoticeState();
        const notice = notify(state, "error", "The files were not written.", {
            actions: [{ id: "retry", label: "Retry the save" }],
        });
        dismiss(state, notice.id);

        expect(restore(state, notice.id)).toBe(true);
        expect(state.live[0]?.id).toBe(notice.id);
        expect(state.live[0]?.actions?.[0]?.label).toBe("Retry the save");
        // The history did not gain a second copy: the notice on screen is the notice in it.
        expect(state.history).toHaveLength(1);
    });

    it("does not show it twice when it is already on screen", () => {
        const state = createNoticeState();
        const notice = notify(state, "error", "boom");

        expect(restore(state, notice.id)).toBe(true);
        expect(state.live).toHaveLength(1);
    });

    it("says so rather than throwing when the id has fallen off the end of the history", () => {
        const state = createNoticeState();
        expect(restore(state, 9999)).toBe(false);
        expect(state.live).toEqual([]);
    });
});

describe("what counts as unread", () => {
    it("counts everything raised until the centre is opened over it", () => {
        const state = createNoticeState();
        notify(state, "info", "a");
        notify(state, "error", "b");

        expect(unreadCount(state)).toBe(2);

        markReviewed(state);
        expect(unreadCount(state)).toBe(0);
    });

    it("counts a notice raised after that, without counting the older ones again", () => {
        const state = createNoticeState();
        notify(state, "info", "a");
        markReviewed(state);
        notify(state, "error", "b");

        expect(unreadCount(state)).toBe(1);
    });

    it("is not thrown off by the history dropping its oldest entry, which a count would be", () => {
        const state = createNoticeState();
        for (let index = 0; index < HISTORY_LIMIT; index++) notify(state, "info", `notice ${index}`);
        markReviewed(state);

        for (let index = 0; index < 5; index++) notify(state, "info", `later ${index}`);

        expect(state.history).toHaveLength(HISTORY_LIMIT);
        expect(unreadCount(state)).toBe(5);
    });

    it("marks nothing read on an empty history, so a notice raised mid-open is not lost", () => {
        const state = createNoticeState();
        markReviewed(state);
        notify(state, "error", "raised while the panel was opening");

        expect(unreadCount(state)).toBe(1);
    });
});

describe("timestamps", () => {
    it("are ISO-8601 with an offset, so the history is readable and sortable", () => {
        expect(localTimestamp(new Date(2026, 7, 3, 13, 5, 9))).toMatch(/^2026-08-03T13:05:09[+-]\d{2}:\d{2}$/);
    });
});

describe("a category's cooldown", () => {
    it("keeps a second success in the same category off the toast stack, within the window", () => {
        const state = createNoticeState();
        notify(state, "success", "first", { category: "autosave", cooldownMs: 30_000 });
        notify(state, "success", "second", { category: "autosave", cooldownMs: 30_000 });

        expect(state.live.map((notice) => notice.message)).toEqual(["first"]);
    });

    it("never drops the throttled notice from the reviewable history", () => {
        const state = createNoticeState();
        notify(state, "success", "first", { category: "autosave", cooldownMs: 30_000 });
        notify(state, "success", "second", { category: "autosave", cooldownMs: 30_000 });

        expect(state.history.map((notice) => notice.message)).toEqual(["second", "first"]);
    });

    it("never throttles a warning or an error, even inside the window", () => {
        const state = createNoticeState();
        notify(state, "error", "first failure", { category: "autosave", cooldownMs: 30_000 });
        notify(state, "error", "second failure", { category: "autosave", cooldownMs: 30_000 });

        expect(state.live.map((notice) => notice.message)).toEqual(["first failure", "second failure"]);
    });

    it("does nothing without a category, even with a cooldown given", () => {
        const state = createNoticeState();
        notify(state, "success", "first", { cooldownMs: 30_000 });
        notify(state, "success", "second", { cooldownMs: 30_000 });

        expect(state.live).toHaveLength(2);
    });

    it("does not cross-throttle two different categories", () => {
        const state = createNoticeState();
        notify(state, "success", "autosave ok", { category: "autosave", cooldownMs: 30_000 });
        notify(state, "success", "render done", { category: "render", cooldownMs: 30_000 });

        expect(state.live).toHaveLength(2);
    });
});
