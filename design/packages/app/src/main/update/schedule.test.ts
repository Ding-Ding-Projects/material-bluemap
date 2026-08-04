import { describe, expect, it } from "vitest";
import {
    CHECK_INTERVAL_MS,
    MAX_BACKOFF_MS,
    MIN_INTERVAL_MS,
    initialSchedule,
    nextCheckDelay,
    scheduleAfterFailure,
    scheduleAfterSuccess,
} from "./schedule.js";

describe("nextCheckDelay", () => {
    it("uses the ordinary interval when nothing has gone wrong", () => {
        expect(nextCheckDelay(initialSchedule())).toBe(CHECK_INTERVAL_MS);
    });

    it("backs off after a failure rather than retrying at the same rate", () => {
        const once = scheduleAfterFailure(initialSchedule());
        const twice = scheduleAfterFailure(once);
        const first = nextCheckDelay(once);
        const second = nextCheckDelay(twice);
        expect(first).not.toBeNull();
        expect(second).not.toBeNull();
        expect(second as number).toBeGreaterThan(first as number);
    });

    it("caps the back-off at a day, so an offline week is not an offline forever", () => {
        let schedule = initialSchedule();
        for (let attempt = 0; attempt < 50; attempt += 1) schedule = scheduleAfterFailure(schedule);
        expect(nextCheckDelay(schedule)).toBe(MAX_BACKOFF_MS);
    });

    it("never returns a delay below the floor", () => {
        let schedule = initialSchedule();
        for (let attempt = 0; attempt < 5; attempt += 1) {
            schedule = scheduleAfterFailure(schedule);
            const delay = nextCheckDelay(schedule);
            expect(delay).not.toBeNull();
            expect(delay as number).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
        }
    });

    it("resets the back-off once a check works again", () => {
        const recovered = scheduleAfterSuccess(scheduleAfterFailure(scheduleAfterFailure(initialSchedule())), false);
        expect(nextCheckDelay(recovered)).toBe(CHECK_INTERVAL_MS);
    });

    it("stops checking once an update is staged", () => {
        // Nothing left to discover: the installer is on disk and only the user's choice
        // changes the situation, so more requests would buy no decision.
        expect(nextCheckDelay(scheduleAfterSuccess(initialSchedule(), true))).toBeNull();
    });
});
