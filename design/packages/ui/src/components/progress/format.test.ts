/**
 * The numbers, in words, with their units named.
 *
 * The translator here is the one every message helper in this package is tested with: it
 * substitutes the named values into the fallback, which is what a build with no translations
 * loaded actually does. That is deliberate, because the failure this guards against is a
 * value going missing while the sentence still reads like a sentence - "of maps done" is a
 * line somebody stares at without ever realising two numbers are absent.
 */

import { describe, expect, it } from "vitest";
import { formatClock, formatCount, formatNumber, formatRate, formatTransfer } from "./format.js";
import type { TransferStat } from "./progressModel.js";
import type { Translate } from "../world/worldFolder.js";

const t = ((key: string, a?: unknown, b?: unknown): string => {
    const [named, fallback] = typeof a === "string" ? [{}, a] : [a as Record<string, unknown>, b as string];
    return fallback.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in named ? String(named[name]) : whole,
    );
}) as Translate;

describe("counts name their unit", () => {
    it("gives both numbers when there is a denominator", () => {
        expect(formatCount({ done: 2, total: 3, unit: "maps" }, t)).toBe("2 of 3 maps done");
        expect(formatCount({ done: 4, total: 7, unit: "jobs" }, t)).toBe("4 of 7 jobs finished");
        expect(formatCount({ done: 5, total: 8, unit: "steps" }, t)).toBe("step 5 of 8");
    });

    it("phrases an unknown total differently rather than papering over it", () => {
        // "812 regions so far" is a true statement. "812 of ? regions" is a puzzle, and a
        // guessed denominator is the one thing that must never appear.
        expect(formatCount({ done: 812, total: null, unit: "regions" }, t)).toBe("812 regions so far");
    });

    it("renders a byte count as a size rather than as a number of bytes", () => {
        expect(formatCount({ done: 1_400_000_000, total: 6_600_000_000, unit: "bytes" }, t)).toBe(
            "1.4 GB of 6.6 GB",
        );
    });
});

describe("numbers survive a locale the application really runs with", () => {
    it("falls back rather than throwing on the placeholder locale", () => {
        // The application ships `locale: "none"`, which is not a valid BCP-47 tag, and
        // `Intl.NumberFormat` throws on it. Nearly every build is in that state.
        expect(formatNumber(1234, "none")).toBe("1234");
    });

    it("groups digits when the locale is a real one", () => {
        expect(formatNumber(1234, "en-GB")).toBe("1,234");
    });
});

describe("clocks and rates", () => {
    it("reads a clock, with hours only once there are hours", () => {
        expect(formatClock(0)).toBe("0:00");
        expect(formatClock(254_000)).toBe("4:14");
        expect(formatClock(3_754_000)).toBe("1:02:34");
    });

    it("states the unit of time a rate is per", () => {
        expect(formatRate(22_000_000, t)).toBe("22 MB/s");
    });

    it("puts a transfer into one sentence and drops the parts it does not know", () => {
        const known: TransferStat = {
            id: "world",
            direction: "up",
            label: { key: "x", fallback: "x", values: {} },
            bytesDone: 1_400_000_000,
            bytesTotal: 6_600_000_000,
            bytesPerSecond: 22_000_000,
        };

        expect(formatTransfer(known, t)).toBe("1.4 GB of 6.6 GB at 22 MB/s");
        // No total to divide by, and none invented: how much has moved is still worth having.
        expect(formatTransfer({ ...known, bytesTotal: null, bytesPerSecond: null }, t)).toBe("1.4 GB");
    });
});
