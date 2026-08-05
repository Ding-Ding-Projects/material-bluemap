import { describe, expect, it } from "vitest";
import { INFO_TIMEOUT_MS, SUCCESS_TIMEOUT_MS } from "./notifications.js";
import {
    DEFAULT_NOTICE_DURATION_LEVEL,
    NOTICE_DURATION_LEVELS,
    isNoticeDurationLevel,
    noticeDurationLevelByNumber,
} from "./noticeDurationLevels.js";

describe("NOTICE_DURATION_LEVELS", () => {
    it("has exactly five levels, numbered 1 through 5 in order", () => {
        expect(NOTICE_DURATION_LEVELS.map((level) => level.level)).toEqual([1, 2, 3, 4, 5]);
    });

    it("climbs monotonically in both columns up to the top level, so no two levels are confused", () => {
        for (let index = 1; index < NOTICE_DURATION_LEVELS.length - 1; index++) {
            const previous = NOTICE_DURATION_LEVELS[index - 1] as (typeof NOTICE_DURATION_LEVELS)[number];
            const current = NOTICE_DURATION_LEVELS[index] as (typeof NOTICE_DURATION_LEVELS)[number];
            expect(current.infoTimeoutMs, `level ${current.level} infoTimeoutMs`).toBeGreaterThan(
                previous.infoTimeoutMs as number,
            );
            expect(current.successTimeoutMs, `level ${current.level} successTimeoutMs`).toBeGreaterThan(
                previous.successTimeoutMs as number,
            );
        }
    });

    it("keeps success shorter than info at every timed level, matching notify()'s own distinction", () => {
        for (const level of NOTICE_DURATION_LEVELS) {
            if (level.infoTimeoutMs === null || level.successTimeoutMs === null) continue;
            expect(level.successTimeoutMs, `level ${level.level}`).toBeLessThan(level.infoTimeoutMs);
        }
    });

    it("sets the top level to null on both fields: stays until dismissed, like a warning", () => {
        const top = NOTICE_DURATION_LEVELS.at(-1);
        expect(top?.level).toBe(5);
        expect(top?.infoTimeoutMs).toBeNull();
        expect(top?.successTimeoutMs).toBeNull();
    });
});

describe("the default level reproduces this queue's own shipped timeouts exactly", () => {
    it("matches INFO_TIMEOUT_MS and SUCCESS_TIMEOUT_MS", () => {
        const level = noticeDurationLevelByNumber(DEFAULT_NOTICE_DURATION_LEVEL);
        expect(level.infoTimeoutMs).toBe(INFO_TIMEOUT_MS);
        expect(level.successTimeoutMs).toBe(SUCCESS_TIMEOUT_MS);
    });

    it("is level 3, so a freshly opened profile lands in the middle of the dial", () => {
        expect(DEFAULT_NOTICE_DURATION_LEVEL).toBe(3);
    });
});

describe("noticeDurationLevelByNumber", () => {
    it("returns the level object for each of the five numbers", () => {
        for (const level of NOTICE_DURATION_LEVELS) {
            expect(noticeDurationLevelByNumber(level.level)).toEqual(level);
        }
    });
});

describe("isNoticeDurationLevel", () => {
    it("accepts exactly the five real level numbers", () => {
        for (const level of NOTICE_DURATION_LEVELS) {
            expect(isNoticeDurationLevel(level.level)).toBe(true);
        }
    });

    it("rejects everything else, including a number that merely looks plausible", () => {
        expect(isNoticeDurationLevel(0)).toBe(false);
        expect(isNoticeDurationLevel(6)).toBe(false);
        expect(isNoticeDurationLevel(3.5)).toBe(false);
        expect(isNoticeDurationLevel("3")).toBe(false);
        expect(isNoticeDurationLevel(null)).toBe(false);
        expect(isNoticeDurationLevel(undefined)).toBe(false);
    });
});
