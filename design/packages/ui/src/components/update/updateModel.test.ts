import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../stores/appSettingsHistorySync.js", () => ({ recordAppSetting: vi.fn() }));
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

import { memoryStorage, setSetupStorage } from "../setup/setupPrefs.js";
import {
    bannerFor,
    clearDismissedUpdate,
    dismissUpdate,
    readDismissedUpdate,
    statusFor,
    unknownUpdateState,
} from "./updateModel.js";
import type { UpdateState } from "./updateBridge.js";

beforeEach(() => {
    setSetupStorage(memoryStorage());
});

function state(overrides: Partial<UpdateState> = {}): UpdateState {
    return { ...unknownUpdateState("0.1.0"), ...overrides };
}

const ready = state({ status: "ready", readyVersion: "0.2.0", newVersion: "0.2.0" });

describe("bannerFor", () => {
    it("shows nothing until there is something staged", () => {
        expect(bannerFor(state()).visible).toBe(false);
        expect(bannerFor(state({ status: "up-to-date" })).visible).toBe(false);
        expect(bannerFor(state({ status: "downloading", newVersion: "0.2.0" })).visible).toBe(false);
        // A failed check informs; it belongs in the notification corner, not in a fixture
        // that occupies the top of the window until somebody dismisses it.
        expect(bannerFor(state({ status: "failed" })).visible).toBe(false);
    });

    it("shows the staged version, exactly, as a variable rather than as copy", () => {
        const banner = bannerFor(ready);
        expect(banner.visible).toBe(true);
        expect(banner.vars["version"]).toBe("0.2.0");
        expect(banner.canRestart).toBe(true);
        expect(banner.tone).toBe("success");
    });

    it("holds Restart visibly while a render runs, and says why", () => {
        const banner = bannerFor({ ...ready, renderInProgress: true });
        expect(banner.visible).toBe(true);
        expect(banner.canRestart).toBe(false);
        expect(banner.tone).toBe("warning");
        // A different sentence, not merely a disabled button: a control that looks live and
        // does nothing is indistinguishable from a broken one.
        expect(banner.bodyKey).toBe("update.banner.heldBody");
    });

    it("hides Restart when the build can report an update but not install one", () => {
        expect(bannerFor(ready, { canRestart: false }).canRestart).toBe(false);
    });

    it("stays away once dismissed for that version", () => {
        expect(bannerFor(ready, { dismissedVersion: "0.2.0" }).visible).toBe(false);
    });

    it("comes back for the next version, so Later never means never", () => {
        const next = { ...ready, readyVersion: "0.3.0", newVersion: "0.3.0" };
        expect(bannerFor(next, { dismissedVersion: "0.2.0" }).visible).toBe(true);
    });

    it("carries the notes and the link when the feed gave them", () => {
        const banner = bannerFor({
            ...ready,
            releaseNotes: "Fixed a thing",
            releaseNotesUrl: "https://example.test/r",
        });
        expect(banner.notes).toBe("Fixed a thing");
        expect(banner.notesUrl).toBe("https://example.test/r");
    });
});

describe("the dismissal store", () => {
    it("remembers a dismissal per version and can be cleared", () => {
        expect(readDismissedUpdate()).toBeNull();
        dismissUpdate("0.2.0");
        expect(readDismissedUpdate()).toBe("0.2.0");
        clearDismissedUpdate();
        expect(readDismissedUpdate()).toBeNull();
    });

    describe("mirroring into the application-settings history", () => {
        beforeEach(() => {
            vi.mocked(recordAppSetting).mockClear();
        });

        it("mirrors the dismissed version under the updateDismissed key", () => {
            dismissUpdate("0.2.0");
            expect(recordAppSetting).toHaveBeenCalledTimes(1);
            expect(recordAppSetting).toHaveBeenCalledWith("updateDismissed", "0.2.0");
        });
    });
});

describe("statusFor", () => {
    it("names every state the row has to show", () => {
        expect(statusFor(state()).status).toBe("idle");
        expect(statusFor(state({ checking: true })).status).toBe("checking");
        expect(statusFor(state({ status: "up-to-date" })).status).toBe("up-to-date");
        expect(statusFor(state({ status: "downloading" })).status).toBe("downloading");
        expect(statusFor(ready).status).toBe("ready");
        expect(statusFor(state({ status: "failed" })).status).toBe("failed");
        expect(statusFor(state({ status: "unsupported" })).status).toBe("unsupported");
    });

    it("keeps a failure visible while a new check runs", () => {
        const model = statusFor(
            state({
                status: "failed",
                checking: true,
                failure: { code: "offline", message: "Offline.", detail: "ENOTFOUND", retryable: true },
            }),
        );
        // The spinner sits beside what is known, never instead of it - which is the whole
        // of "never hide a failure behind a spinner".
        expect(model.status).toBe("checking");
        expect(model.failureMessage).toBe("Offline.");
        expect(model.failureDetail).toBe("ENOTFOUND");
    });

    it("will not start a second check while one is running", () => {
        expect(statusFor(state({ checking: true })).canCheck).toBe(false);
    });

    it("offers no check at all on a build that cannot update", () => {
        const model = statusFor(state({ status: "unsupported", unsupportedReason: "Not packaged." }));
        expect(model.canCheck).toBe(false);
        expect(model.unsupportedReason).toBe("Not packaged.");
    });

    it("reports a version an unsupported build cannot install, without offering to", () => {
        const model = statusFor(
            state({ status: "unsupported", unsupportedReason: "Not packaged.", newVersion: "0.9.0" }),
        );
        expect(model.messageKey).toBe("update.status.available");
        expect(model.vars["version"]).toBe("0.9.0");
        expect(model.canRestart).toBe(false);
    });

    it("offers Restart only when something is staged and nothing is rendering", () => {
        expect(statusFor(ready).canRestart).toBe(true);
        expect(statusFor({ ...ready, renderInProgress: true }).canRestart).toBe(false);
        expect(statusFor(state({ status: "downloading" })).canRestart).toBe(false);
        expect(statusFor(ready, { canRestart: false }).canRestart).toBe(false);
    });

    it("reports a build with no manual check as having none", () => {
        expect(statusFor(state(), { canCheck: false }).canCheck).toBe(false);
    });
});
