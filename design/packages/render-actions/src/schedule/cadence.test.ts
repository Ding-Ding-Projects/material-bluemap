import { describe, expect, it } from "vitest";
import {
    CI_SCHEDULE_CADENCES,
    cadenceIntervalMs,
    describeCadenceCost,
    isCadenceDue,
    isCiScheduleCadence,
    nextCheckAt,
} from "./cadence.js";

describe("the cadence set is small and honest", () => {
    it("offers exactly four named choices, finest first", () => {
        expect(CI_SCHEDULE_CADENCES).toEqual(["hourly", "sixHourly", "daily", "weekly"]);
    });

    it("recognises only those four strings", () => {
        for (const cadence of CI_SCHEDULE_CADENCES) expect(isCiScheduleCadence(cadence)).toBe(true);
        expect(isCiScheduleCadence("0 */3 * * *")).toBe(false);
        expect(isCiScheduleCadence("")).toBe(false);
        expect(isCiScheduleCadence("hourlyish")).toBe(false);
    });

    it("orders the intervals from shortest to longest", () => {
        const intervals = CI_SCHEDULE_CADENCES.map(cadenceIntervalMs);
        for (let index = 1; index < intervals.length; index++) {
            expect(intervals[index]).toBeGreaterThan(intervals[index - 1]!);
        }
    });

    it("maps each cadence to the number of hours or days it names", () => {
        expect(cadenceIntervalMs("hourly")).toBe(60 * 60 * 1000);
        expect(cadenceIntervalMs("sixHourly")).toBe(6 * 60 * 60 * 1000);
        expect(cadenceIntervalMs("daily")).toBe(24 * 60 * 60 * 1000);
        expect(cadenceIntervalMs("weekly")).toBe(7 * 24 * 60 * 60 * 1000);
    });
});

describe("isCadenceDue", () => {
    it("is due when nothing has ever been checked", () => {
        const now = new Date("2026-08-05T12:00:00Z");
        expect(isCadenceDue("daily", null, now).due).toBe(true);
    });

    it("is due when the recorded timestamp does not parse, rather than getting stuck", () => {
        const now = new Date("2026-08-05T12:00:00Z");
        expect(isCadenceDue("daily", "not a date", now).due).toBe(true);
    });

    it("is not due before the interval has elapsed", () => {
        const lastCheckAt = "2026-08-05T00:00:00Z";
        const now = new Date("2026-08-05T05:59:59Z");
        expect(isCadenceDue("sixHourly", lastCheckAt, now).due).toBe(false);
    });

    it("is due exactly on the boundary", () => {
        const lastCheckAt = "2026-08-05T00:00:00Z";
        const now = new Date("2026-08-05T06:00:00Z");
        expect(isCadenceDue("sixHourly", lastCheckAt, now).due).toBe(true);
    });

    it("is due once the interval has passed", () => {
        const lastCheckAt = "2026-08-05T00:00:00Z";
        const now = new Date("2026-08-06T00:00:01Z");
        expect(isCadenceDue("daily", lastCheckAt, now).due).toBe(true);
    });

    it("reports the next check time even when not yet due, matching nextCheckAt", () => {
        const lastCheckAt = "2026-08-05T00:00:00Z";
        const now = new Date("2026-08-05T01:00:00Z");
        const due = isCadenceDue("weekly", lastCheckAt, now);
        expect(due.due).toBe(false);
        expect(due.nextCheckAt).toBe(nextCheckAt("weekly", lastCheckAt));
        expect(due.nextCheckAt).toBe("2026-08-12T00:00:00.000Z");
    });
});

describe("describeCadenceCost", () => {
    it("computes an exact monthly check count rather than a fabricated runner-minute figure", () => {
        expect(describeCadenceCost("hourly").checksPerMonth).toBe(720);
        expect(describeCadenceCost("sixHourly").checksPerMonth).toBe(120);
        expect(describeCadenceCost("daily").checksPerMonth).toBe(30);
        expect(describeCadenceCost("weekly").checksPerMonth).toBe(4);
    });

    it("names the count in its own sentence, so the two can never disagree", () => {
        const cost = describeCadenceCost("daily");
        expect(cost.description).toContain(String(cost.checksPerMonth));
    });
});
