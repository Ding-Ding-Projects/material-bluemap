import { describe, expect, it } from "vitest";

import { COLOR_SPACES, convert, fromSrgb, isInSrgbGamut, toSrgb } from "./spaces.js";
import type { ColorSpace, Triple } from "./spaces.js";

/**
 * Every space this picker offers is expected to round-trip a plain sRGB colour back to
 * itself. The picker's whole "infinite" promise rests on that: a visitor who dials a colour
 * in through OKLCH and reads it back in HSL must see the colour they actually picked, not a
 * neighbour that drifted through the conversion.
 */
describe("colour space conversions", () => {
    const SAMPLES: readonly Triple[] = [
        [0, 0, 0],
        [1, 1, 1],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        [0.5, 0.5, 0.5],
        [0.831, 0.204, 0.204],
        [0.204, 0.62, 0.831],
    ];

    for (const space of COLOR_SPACES) {
        it(`round-trips sRGB through ${space} within floating-point tolerance`, () => {
            for (const rgb of SAMPLES) {
                const converted = fromSrgb(space, rgb);
                const back = toSrgb(space, converted);
                expect(back[0]).toBeCloseTo(rgb[0], 4);
                expect(back[1]).toBeCloseTo(rgb[1], 4);
                expect(back[2]).toBeCloseTo(rgb[2], 4);
            }
        });
    }

    it("converts directly between two non-sRGB spaces without losing the colour", () => {
        const start: Triple = [0.7, 0.3, 0.1];
        const viaOklch = convert("srgb", "oklch", start);
        const viaLab = convert("oklch", "lab", viaOklch);
        const back = convert("lab", "srgb", viaLab);
        expect(back[0]).toBeCloseTo(start[0], 3);
        expect(back[1]).toBeCloseTo(start[1], 3);
        expect(back[2]).toBeCloseTo(start[2], 3);
    });

    it("treats an identity conversion as a no-op, coordinates included", () => {
        const coords: Triple = [0.4, 0.6, 0.9];
        expect(convert("hsl", "hsl", coords)).toBe(coords);
    });

    it("recognises pure red as hue 0, full saturation, in HSL and HSV alike", () => {
        const hsl = fromSrgb("hsl", [1, 0, 0]);
        expect(hsl[0]).toBeCloseTo(0, 3);
        expect(hsl[1]).toBeCloseTo(100, 3);
        expect(hsl[2]).toBeCloseTo(50, 3);

        const hsv = fromSrgb("hsv", [1, 0, 0]);
        expect(hsv[0]).toBeCloseTo(0, 3);
        expect(hsv[1]).toBeCloseTo(100, 3);
        expect(hsv[2]).toBeCloseTo(100, 3);
    });

    it("reports white and black HWB components for the extremes of the cube", () => {
        const white = fromSrgb("hwb", [1, 1, 1]);
        expect(white[1]).toBeCloseTo(100, 3);
        const black = fromSrgb("hwb", [0, 0, 0]);
        expect(black[2]).toBeCloseTo(100, 3);
    });

    it("keeps every grey achromatic in every cylindrical space", () => {
        const grey: Triple = [0.5, 0.5, 0.5];
        for (const space of ["hsl", "hsv", "hwb"] as const) {
            const converted = fromSrgb(space, grey);
            // Saturation (HSL/HSV) or the absence of both black and white headroom (HWB)
            // reads as zero chroma for a colour with equal channels.
            if (space === "hsl" || space === "hsv") expect(converted[1]).toBeCloseTo(0, 3);
        }
    });

    it("says a plain sRGB triple is always in its own gamut", () => {
        expect(isInSrgbGamut([0, 0, 0])).toBe(true);
        expect(isInSrgbGamut([1, 1, 1])).toBe(true);
        expect(isInSrgbGamut([0.4, 0.6, 0.2])).toBe(true);
    });

    it("says a value outside 0..1 is out of the sRGB gamut", () => {
        expect(isInSrgbGamut([1.2, 0, 0])).toBe(false);
        expect(isInSrgbGamut([0, -0.1, 0])).toBe(false);
    });

    const EXPECTED_SPACES: readonly ColorSpace[] = [
        "srgb",
        "hsl",
        "hsv",
        "hwb",
        "lab",
        "lch",
        "oklab",
        "oklch",
    ];
    it("offers exactly the eight spaces the appearance contract promises", () => {
        expect([...COLOR_SPACES].sort()).toEqual([...EXPECTED_SPACES].sort());
    });
});
