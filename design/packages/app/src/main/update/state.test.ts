import { describe, expect, it } from "vitest";
import { updateFailure } from "./failure.js";
import { initialUpdateState, isReady, reduceUpdate, type UpdateState } from "./state.js";

const AT = "2026-08-04T10:00:00-04:00";

function apply(state: UpdateState, ...events: Parameters<typeof reduceUpdate>[1][]): UpdateState {
    return events.reduce(reduceUpdate, state);
}

const start = initialUpdateState("0.1.0");

describe("reduceUpdate", () => {
    it("starts knowing only which version is running", () => {
        expect(start.status).toBe("idle");
        expect(start.currentVersion).toBe("0.1.0");
        expect(start.newVersion).toBeNull();
        expect(start.checking).toBe(false);
    });

    it("keeps the known state visible while a check is in flight", () => {
        const state = apply(start, { type: "up-to-date", at: AT }, { type: "check-started", manual: true });
        // Not a blank screen: the honest thing to show is "you are on 0.1.0, and I am looking".
        expect(state.status).toBe("up-to-date");
        expect(state.checking).toBe(true);
        expect(state.lastCheckWasManual).toBe(true);
    });

    it("walks the ordinary path: check, downloading, ready", () => {
        const state = apply(
            start,
            { type: "check-started", manual: false },
            { type: "downloading", version: null },
            { type: "downloaded", version: "0.2.0", notes: "Fixed things", notesUrl: "https://example.test/r", at: AT },
        );
        expect(state.status).toBe("ready");
        expect(state.readyVersion).toBe("0.2.0");
        expect(state.releaseNotes).toBe("Fixed things");
        expect(state.releaseNotesUrl).toBe("https://example.test/r");
        expect(isReady(state)).toBe(true);
    });

    it("keeps a staged update when the next check fails", () => {
        const ready = apply(start, {
            type: "downloaded",
            version: "0.2.0",
            notes: null,
            notesUrl: null,
            at: AT,
        });
        const afterFailure = reduceUpdate(ready, {
            type: "failed",
            failure: updateFailure("offline", "Offline."),
            at: AT,
        });
        // The bytes are already here and they still install. A network blip must not take
        // a working update away from somebody who was about to restart into it.
        expect(afterFailure.status).toBe("ready");
        expect(afterFailure.readyVersion).toBe("0.2.0");
        // And the failure is still recorded, because hiding it is a lie in the other
        // direction.
        expect(afterFailure.failure?.code).toBe("offline");
    });

    it("keeps a staged update when a later check says there is nothing new", () => {
        const ready = apply(start, {
            type: "downloaded",
            version: "0.2.0",
            notes: null,
            notesUrl: null,
            at: AT,
        });
        const after = reduceUpdate(ready, { type: "up-to-date", at: AT });
        expect(after.status).toBe("ready");
        expect(after.readyVersion).toBe("0.2.0");
        expect(after.checking).toBe(false);
    });

    it("clears a previous failure once a check succeeds", () => {
        const state = apply(
            start,
            { type: "failed", failure: updateFailure("offline", "Offline."), at: AT },
            { type: "up-to-date", at: AT },
        );
        expect(state.status).toBe("up-to-date");
        expect(state.failure).toBeNull();
    });

    it("treats unsupported as terminal, so a stray event cannot erase the explanation", () => {
        const state = apply(
            start,
            { type: "unsupported", reason: "Not installed by the installer." },
            { type: "check-started", manual: true },
            { type: "downloaded", version: "0.2.0", notes: null, notesUrl: null, at: AT },
            { type: "failed", failure: updateFailure("offline", "Offline."), at: AT },
        );
        expect(state.status).toBe("unsupported");
        expect(state.unsupportedReason).toBe("Not installed by the installer.");
        expect(state.readyVersion).toBeNull();
    });

    it("still reports a version an unsupported build cannot install", () => {
        const state = apply(
            start,
            { type: "unsupported", reason: "Not installed by the installer." },
            { type: "available", version: "0.2.0", notesUrl: "https://example.test/r" },
        );
        // Useful, and honest: it says a release exists without implying it can install it.
        expect(state.status).toBe("unsupported");
        expect(state.newVersion).toBe("0.2.0");
        expect(state.releaseNotesUrl).toBe("https://example.test/r");
    });

    it("carries render activity without disturbing anything else", () => {
        const state = apply(
            start,
            { type: "downloaded", version: "0.2.0", notes: null, notesUrl: null, at: AT },
            { type: "render-activity", active: true },
        );
        expect(state.renderInProgress).toBe(true);
        expect(state.status).toBe("ready");
    });

    it("never carries a credential: the feed event only sets an address", () => {
        const state = reduceUpdate(start, { type: "feed", url: "https://feed.example/x" });
        expect(state.feedUrl).toBe("https://feed.example/x");
        expect(Object.keys(state)).not.toContain("headers");
    });
});
