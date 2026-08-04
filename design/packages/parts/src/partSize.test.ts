/**
 * The part size, and why it is a choice rather than a constant.
 *
 * Every assertion here is about a refusal that has to arrive *before* any bytes are read.
 * A part size that is wrong is not discovered cheaply: by the time an upload rejects it,
 * the file has already been read, hashed and transferred, and on a large world that is
 * measured in hours rather than seconds.
 */

import { describe, expect, it } from "vitest";
import {
    DEFAULT_PART_SIZE,
    GITHUB_ASSET_LIMIT,
    MAX_PART_SIZE,
    MIN_PART_SIZE,
    PART_SIZE_CHOICES,
    checkPartSize,
} from "./manifest.js";

describe("the bounds", () => {
    it("never lets a part reach the size a release asset is refused at", () => {
        // This is the assertion the whole feature rests on. A part at or above the cap is an
        // upload that fails after the reading and the hashing are already paid for.
        expect(MAX_PART_SIZE).toBeLessThan(GITHUB_ASSET_LIMIT);
        expect(checkPartSize(GITHUB_ASSET_LIMIT).ok).toBe(false);
        expect(checkPartSize(MAX_PART_SIZE + 1).ok).toBe(false);
    });

    it("accepts both ends of the range it advertises", () => {
        expect(checkPartSize(MIN_PART_SIZE).ok).toBe(true);
        expect(checkPartSize(MAX_PART_SIZE).ok).toBe(true);
    });

    it("refuses a part too small to be worth the round trips", () => {
        const refusal = checkPartSize(MIN_PART_SIZE - 1);
        expect(refusal.ok).toBe(false);
        // The sentence has to say why, not merely that. Somebody who picked 50 MB was
        // reasoning about reliability and needs to know what it costs them.
        if (!refusal.ok) expect(refusal.message).toMatch(/more uploads|more requests/i);
    });

    it("says what the ceiling is about rather than only that there is one", () => {
        const refusal = checkPartSize(GITHUB_ASSET_LIMIT);
        if (!refusal.ok) expect(refusal.message).toMatch(/2 GB|release asset/i);
    });

    it("refuses anything that is not a whole number of bytes", () => {
        for (const bad of [NaN, Infinity, 1.5, "500000000", null, undefined, {}]) {
            expect(checkPartSize(bad).ok).toBe(false);
        }
    });
});

describe("the choices offered", () => {
    it("are all sizes the checker itself accepts", () => {
        // A menu that offers a value the validator refuses is a menu that produces a
        // refusal the person could not have avoided.
        for (const choice of PART_SIZE_CHOICES) {
            expect(checkPartSize(choice.bytes).ok, `${choice.label} is offered but refused`).toBe(true);
        }
    });

    it("ascend, and end at the default", () => {
        const sizes = PART_SIZE_CHOICES.map((choice) => choice.bytes);
        expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
        expect(sizes.at(-1)).toBe(DEFAULT_PART_SIZE);
    });

    it("each say what the trade actually is", () => {
        // Not decoration: "500 MB" and "1.7 GB" mean nothing on their own, and the whole
        // reason to expose this setting is that the trade-off is invisible from the number.
        for (const choice of PART_SIZE_CHOICES) {
            expect(choice.why.length).toBeGreaterThan(10);
        }
    });
});
