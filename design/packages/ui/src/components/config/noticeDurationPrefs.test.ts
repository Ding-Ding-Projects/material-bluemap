import { beforeEach, describe, expect, it } from "vitest";
import { memoryStorage, setSetupStorage, setupStorage } from "../setup/setupPrefs.js";
import { DEFAULT_NOTICE_DURATION_LEVEL } from "./noticeDurationLevels.js";
import {
    NOTICE_DURATION_KEY,
    readNoticeDurationLevel,
    writeNoticeDurationLevel,
} from "./noticeDurationPrefs.js";

beforeEach(() => {
    setSetupStorage(memoryStorage());
});

describe("reading before anything has been chosen", () => {
    it("answers the shipped default, so a fresh install behaves exactly as it always has", () => {
        expect(readNoticeDurationLevel()).toBe(DEFAULT_NOTICE_DURATION_LEVEL);
    });

    it("also answers the default for a stored value that no longer parses as a real level", () => {
        setupStorage().write(NOTICE_DURATION_KEY, "not a level");
        expect(readNoticeDurationLevel()).toBe(DEFAULT_NOTICE_DURATION_LEVEL);

        setupStorage().write(NOTICE_DURATION_KEY, "9");
        expect(readNoticeDurationLevel()).toBe(DEFAULT_NOTICE_DURATION_LEVEL);
    });
});

describe("writing and reading back", () => {
    it("remembers the exact level across the round trip, for every level", () => {
        for (const level of [1, 2, 3, 4, 5] as const) {
            writeNoticeDurationLevel(level);
            expect(readNoticeDurationLevel()).toBe(level);
        }
    });

    it("persists through the same storage a restart would read from", () => {
        writeNoticeDurationLevel(5);
        // A second, independent read of the same underlying key - standing in for the
        // settings surface being reopened after the app restarted.
        expect(setupStorage().read(NOTICE_DURATION_KEY)).toBe("5");
    });
});
