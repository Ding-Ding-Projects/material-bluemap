/**
 * The shell's one notification queue.
 *
 * The rules the queue follows are already covered next door in
 * `components/config/notifications.test.ts`; nothing here re-tests them. What this file
 * pins is the part only a singleton can get wrong: that every caller writes to the same
 * state, that the state is reactive so one mounted corner repaints for all of them, and
 * that a message outlives the screen that raised it. That last one is the whole reason the
 * queue was hoisted out of the options editor, and it is invisible to a test that builds
 * its own state with `createNoticeState()`.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { watchEffect } from "vue";
import { dismissAll, notify } from "../components/config/notifications.js";
import { notices, raiseNotice } from "./notices.js";

beforeEach(() => {
    dismissAll(notices);
    notices.history.length = 0;
});

describe("the shared corner", () => {
    it("puts a raised notice on the one state every reader is watching", () => {
        const notice = raiseNotice("success", "Wrote 9 files in /srv/bluemap.");

        expect(notices.live).toEqual([notice]);
        expect(notices.history).toEqual([notice]);
    });

    it("carries a detail through to the same state", () => {
        raiseNotice("error", "The files were not written.", "EACCES: permission denied");

        expect(notices.live[0]?.detail).toBe("EACCES: permission denied");
    });

    it("is reactive, so a corner mounted once repaints when anything raises a notice", () => {
        const seen: number[] = [];
        const stop = watchEffect(() => seen.push(notices.live.length), { flush: "sync" });

        raiseNotice("info", "Read 4 config files.");
        stop();

        expect(seen).toEqual([0, 1]);
    });

    it("is the same queue whether it is written through the helper or through notify", () => {
        raiseNotice("info", "from the shell");
        notify(notices, "info", "from the options editor");

        expect(notices.live.map((notice) => notice.message)).toEqual([
            "from the shell",
            "from the options editor",
        ]);
    });

    it("keeps a notice after the screen that raised it is gone, which is why it was hoisted", () => {
        // Nothing here unmounts anything, because the point is that there is nothing to
        // unmount: the queue is module state, so closing the editor cannot take the
        // message with it and a warning about maps needing a re-render still gets read.
        raiseNotice("warning", "These maps have to be rendered again: overworld.");

        expect(notices.live).toHaveLength(1);
    });
});
