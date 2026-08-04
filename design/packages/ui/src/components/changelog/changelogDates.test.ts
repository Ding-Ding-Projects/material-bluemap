/**
 * The date filter's parser and calendar layout.
 *
 * Two behaviours here are the whole reason this file exists rather than a `<input type="date">`.
 * The first is that a half-typed date is not an error: a field that clears itself at the fifth
 * keystroke cannot be typed into at all, so `2026-08` has to come back as "incomplete" with the
 * text untouched. The second is that the same six digits mean different days in different
 * locales, and guessing produces a plausible wrong answer rather than a visible failure.
 *
 * The month grid is pinned too, because an off-by-one in the leading pad shifts every date in
 * the calendar by a day, which is exactly the kind of bug that looks fine until somebody checks
 * one against the changelog.
 */

import { describe, expect, it } from "vitest";
import {
    dayInputHint,
    dayKey,
    daysInMonth,
    inRange,
    isDayKey,
    isRealDate,
    localeDateOrder,
    monthGrid,
    orderRange,
    parseDayInput,
    presetRange,
    shiftDays,
    shiftMonths,
    todayKey,
    weekStart,
    weekdayLabels,
} from "./changelogDates.js";

describe("parsing what somebody types", () => {
    it("takes ISO in every locale, because that is the form the changelog itself prints", () => {
        for (const locale of ["en-US", "en-GB", "de-DE", "zh-Hant-HK"]) {
            expect(parseDayInput("2026-08-04", locale)).toEqual({ day: "2026-08-04", error: null });
        }
    });

    it("accepts a single-digit ISO month and day", () => {
        expect(parseDayInput("2026-8-4", "en-US")).toEqual({ day: "2026-08-04", error: null });
    });

    it("reads the locale's own numeric order, which the same digits disagree about", () => {
        expect(parseDayInput("04/08/2026", "en-GB").day).toBe("2026-08-04");
        expect(parseDayInput("04/08/2026", "en-US").day).toBe("2026-04-08");
    });

    it("treats an empty field as no bound rather than as an error", () => {
        expect(parseDayInput("   ", "en-US")).toEqual({ day: null, error: null });
    });

    it("reports a part-typed date as incomplete, so the caller can keep the text", () => {
        expect(parseDayInput("2026", "en-US").error).toBe("incomplete");
        expect(parseDayInput("2026-0", "en-US").error).toBe("incomplete");
        expect(parseDayInput("2026-08", "en-US").error).toBe("incomplete");
        expect(parseDayInput("8/4", "en-US").error).toBe("incomplete");
    });

    it("distinguishes a date that does not exist from text that is not a date", () => {
        expect(parseDayInput("2026-02-31", "en-US").error).toBe("impossible");
        expect(parseDayInput("2026-13-01", "en-US").error).toBe("impossible");
        expect(parseDayInput("last tuesday", "en-US").error).toBe("unparsable");
        expect(parseDayInput("1/2/3/4", "en-US").error).toBe("unparsable");
    });

    it("never returns a day alongside an error, so a caller cannot apply a rejected date", () => {
        for (const text of ["2026-02-31", "2026-08", "nonsense"]) {
            const parsed = parseDayInput(text, "en-US");
            expect(parsed.day).toBeNull();
            expect(parsed.error).not.toBeNull();
        }
    });

    it("reads a two-digit year as this century, the only reading ever meant here", () => {
        expect(parseDayInput("04/08/26", "en-GB").day).toBe("2026-08-04");
    });

    it("hints a format its own parser accepts", () => {
        const hint = dayInputHint("en-GB");
        expect(hint).toContain("2026-08-04");
        for (const form of hint.split(", ")) {
            expect(parseDayInput(form, "en-GB").day).toBe("2026-08-04");
        }
    });

    it("asks Intl for the field order rather than assuming one", () => {
        expect(localeDateOrder("en-US")).toEqual(["month", "day", "year"]);
        expect(localeDateOrder("en-GB")).toEqual(["day", "month", "year"]);
    });
});

describe("day keys", () => {
    it("knows a real date from an invented one", () => {
        expect(isRealDate(2026, 2, 28)).toBe(true);
        expect(isRealDate(2026, 2, 29)).toBe(false);
        expect(isRealDate(2024, 2, 29)).toBe(true);
        expect(isDayKey("2026-13-01")).toBe(false);
        expect(isDayKey("2026-8-4")).toBe(false);
    });

    it("steps days and months in UTC, so a DST boundary cannot move a date", () => {
        expect(shiftDays("2026-03-01", -1)).toBe("2026-02-28");
        expect(shiftDays("2026-12-31", 1)).toBe("2027-01-01");
        expect(shiftMonths("2026-08-04", 1)).toBe("2026-09-01");
        expect(shiftMonths("2026-01-31", -1)).toBe("2025-12-01");
        expect(daysInMonth(2026, 2)).toBe(28);
        expect(daysInMonth(2024, 2)).toBe(29);
    });

    it("reads today from the reader's own calendar rather than from UTC", () => {
        // Constructed in local time, so the assertion holds in every timezone the suite runs in.
        const local = new Date(2026, 7, 4, 23, 30);
        expect(todayKey(local)).toBe("2026-08-04");
    });
});

describe("the month grid", () => {
    const august = monthGrid(2026, 8, 1);

    it("is always six weeks, so paging months does not move the buttons", () => {
        expect(august).toHaveLength(6);
        for (const week of august) expect(week).toHaveLength(7);
    });

    it("starts on the requested weekday and pads from the neighbouring months", () => {
        // 2026-08-01 is a Saturday, so a Monday-start grid opens on 27 July.
        expect(august[0]?.[0]?.key).toBe("2026-07-27");
        expect(august[0]?.[0]?.inMonth).toBe(false);
        expect(august[0]?.[5]?.key).toBe("2026-08-01");
        expect(august[0]?.[5]?.inMonth).toBe(true);
    });

    it("moves the whole grid when the week starts on Sunday instead", () => {
        expect(monthGrid(2026, 8, 7)[0]?.[0]?.key).toBe("2026-07-26");
    });

    it("runs consecutively with no repeated or skipped day", () => {
        const keys = august.flat().map((cell) => cell.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (let index = 1; index < keys.length; index++) {
            expect(keys[index]).toBe(shiftDays(keys[index - 1] ?? "", 1));
        }
    });

    it("labels the columns in the grid's own order", () => {
        expect(weekdayLabels("en-US", 1)).toHaveLength(7);
        expect(weekdayLabels("en-US", 1)[0]).toMatch(/^Mon/);
        expect(weekdayLabels("en-US", 7)[0]).toMatch(/^Sun/);
    });

    it("answers a week start for a locale it has never heard of", () => {
        expect(weekStart("qq-XX")).toBeGreaterThanOrEqual(1);
        expect(weekStart("qq-XX")).toBeLessThanOrEqual(7);
    });
});

describe("presets and ranges", () => {
    const today = "2026-08-04";

    it("computes each preset against the day it is given, not against the clock", () => {
        expect(presetRange("today", today)).toEqual({ from: today, to: today });
        expect(presetRange("last7", today)).toEqual({ from: "2026-07-29", to: today });
        expect(presetRange("last30", today)).toEqual({ from: "2026-07-06", to: today });
        expect(presetRange("thisMonth", today)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
        expect(presetRange("thisYear", today)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
        expect(presetRange("all", today)).toEqual({ from: null, to: null });
    });

    it("puts a backwards range the right way round instead of refusing it", () => {
        expect(orderRange({ from: "2026-08-04", to: "2026-08-01" })).toEqual({
            from: "2026-08-01",
            to: "2026-08-04",
        });
        expect(orderRange({ from: null, to: "2026-08-01" })).toEqual({ from: null, to: "2026-08-01" });
    });

    it("treats a missing bound as unbounded on that side", () => {
        expect(inRange("1999-01-01", { from: null, to: "2026-08-04" })).toBe(true);
        expect(inRange("2999-01-01", { from: null, to: "2026-08-04" })).toBe(false);
        expect(inRange("2999-01-01", { from: "2026-08-04", to: null })).toBe(true);
        expect(inRange(dayKey(2026, 8, 4), { from: "2026-08-04", to: "2026-08-04" })).toBe(true);
    });
});
