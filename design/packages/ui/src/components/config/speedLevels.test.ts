import { coreConfigDescriptor } from "@material-bluemap/config";
import { describe, expect, it } from "vitest";

import { DEFAULT_SPEED_LEVEL, SPEED_LEVELS, speedLevelByNumber, speedLevelFor } from "./speedLevels.js";

function coreDefault(path: string): unknown {
    const field = coreConfigDescriptor.fields.find((candidate) => candidate.path === path);
    if (field === undefined) throw new Error(`core.conf has no field ${path}`);
    return field.default;
}

describe("SPEED_LEVELS", () => {
    it("has exactly five levels, numbered 1 through 5 in order", () => {
        expect(SPEED_LEVELS.map((level) => level.level)).toEqual([1, 2, 3, 4, 5]);
    });

    it("writes each level's exact documented values", () => {
        expect(SPEED_LEVELS).toEqual([
            { level: 1, threadCount: -2, threadPriority: 1 },
            { level: 2, threadCount: -1, threadPriority: 3 },
            { level: 3, threadCount: 1, threadPriority: 5 },
            { level: 4, threadCount: 2, threadPriority: 7 },
            { level: 5, threadCount: 4, threadPriority: 10 },
        ]);
    });

    it("climbs monotonically in both columns, so no two levels can be confused", () => {
        for (let index = 1; index < SPEED_LEVELS.length; index++) {
            const previous = SPEED_LEVELS[index - 1] as (typeof SPEED_LEVELS)[number];
            const current = SPEED_LEVELS[index] as (typeof SPEED_LEVELS)[number];
            expect(current.threadCount, `level ${current.level} threadCount`).toBeGreaterThan(previous.threadCount);
            expect(current.threadPriority, `level ${current.level} threadPriority`).toBeGreaterThan(previous.threadPriority);
        }
    });

    it("keeps render-thread-priority inside the schema's advisory 1-10 range", () => {
        for (const level of SPEED_LEVELS) {
            expect(level.threadPriority, `level ${level.level}`).toBeGreaterThanOrEqual(1);
            expect(level.threadPriority, `level ${level.level}`).toBeLessThanOrEqual(10);
        }
    });
});

describe("the default level reproduces BlueMap's own defaults exactly", () => {
    it("matches core.conf's real render-thread-count and render-thread-priority defaults", () => {
        const level = speedLevelByNumber(DEFAULT_SPEED_LEVEL);
        expect(level.threadCount).toBe(coreDefault("render-thread-count"));
        expect(level.threadPriority).toBe(coreDefault("render-thread-priority"));
    });

    it("is level 3, Balanced, so a freshly opened core.conf lands in the middle of the dial", () => {
        expect(DEFAULT_SPEED_LEVEL).toBe(3);
    });
});

describe("speedLevelByNumber", () => {
    it("returns the level object for each of the five numbers", () => {
        for (const level of SPEED_LEVELS) {
            expect(speedLevelByNumber(level.level)).toEqual(level);
        }
    });
});

describe("speedLevelFor: round-trip detection", () => {
    it("detects every level from its own exact raw pair", () => {
        for (const level of SPEED_LEVELS) {
            expect(speedLevelFor(level.threadCount, level.threadPriority)).toEqual(level);
        }
    });

    it("returns null (Custom) for a pair that matches no level", () => {
        expect(speedLevelFor(3, 5)).toBeNull();
        expect(speedLevelFor(1, 6)).toBeNull();
        expect(speedLevelFor(-2, 5)).toBeNull();
        expect(speedLevelFor(0, 0)).toBeNull();
    });

    it("returns null when either value is not a plain number, rather than throwing", () => {
        expect(speedLevelFor(undefined, 5)).toBeNull();
        expect(speedLevelFor(1, undefined)).toBeNull();
        expect(speedLevelFor("1", 5)).toBeNull();
        expect(speedLevelFor(null, null)).toBeNull();
    });

    it("never snaps a mismatched pair onto its nearest level", () => {
        // One field exactly matches level 4 and the other exactly matches level 2: a naive
        // "closest level" heuristic would round this to something. The real answer is Custom,
        // because the raw values were never actually set to any one level's pair.
        expect(speedLevelFor(2, 3)).toBeNull();
    });
});
