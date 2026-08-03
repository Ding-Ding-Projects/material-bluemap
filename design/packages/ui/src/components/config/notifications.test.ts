import { describe, expect, it } from "vitest";
import {
    HISTORY_LIMIT,
    INFO_TIMEOUT_MS,
    SUCCESS_TIMEOUT_MS,
    createNoticeState,
    dismiss,
    dismissAll,
    localTimestamp,
    notify,
    timeoutFor,
} from "./notifications.js";

describe("how long a notice stays", () => {
    it("dismisses information and success by itself", () => {
        expect(timeoutFor("info")).toBe(INFO_TIMEOUT_MS);
        expect(timeoutFor("success")).toBe(SUCCESS_TIMEOUT_MS);
    });

    it("leaves a warning or an error on screen until it is dismissed, because a failure that vanishes is a failure nobody read", () => {
        expect(timeoutFor("warning")).toBeNull();
        expect(timeoutFor("error")).toBeNull();
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

describe("timestamps", () => {
    it("are ISO-8601 with an offset, so the history is readable and sortable", () => {
        expect(localTimestamp(new Date(2026, 7, 3, 13, 5, 9))).toMatch(/^2026-08-03T13:05:09[+-]\d{2}:\d{2}$/);
    });
});
