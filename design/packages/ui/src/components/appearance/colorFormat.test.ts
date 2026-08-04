/**
 * Writing colours out, and the honesty of the rows that carry them.
 *
 * Two kinds of assertion live here and they are testing different promises. The exact-string
 * checks pin what a user sees and copies, so a change to the rounding of a space shows up as
 * a failing test rather than as a silently different clipboard. The round-trip-through-text
 * checks pin the harder property: that every notation the panel prints can be pasted back
 * into the field it came from and land on the same colour. A translator that only satisfied
 * the first would look right and be useless.
 *
 * The clipping rows are the contract's "warns before clipping" clause and are asserted per
 * row rather than per colour, because that is how the situation really behaves. For a colour
 * outside sRGB, `oklch()` is exact and `#rrggbb` is not, in the same instant, in the same
 * panel.
 */

import { describe, expect, it } from "vitest";

import {
    colorRepresentations,
    contrastReport,
    cssColor,
    describeColor,
    formatColor,
    formatHex,
    formatNumber,
} from "./colorFormat.js";
import { parseColor, COLOR_SPACES, type ColorSpaceId } from "./colorParse.js";
import { oklchToRgb, rgb, type Rgb } from "./colorSpaces.js";

const RED = rgb(1, 0, 0);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);

/** A vivid green no sRGB display can show, used everywhere clipping is the subject. */
const OUT_OF_GAMUT = oklchToRgb({ l: 0.9, c: 0.35, h: 140, alpha: 1 });

/**
 * The notations that store eight bits a channel, and therefore cannot round-trip better.
 *
 * `named` belongs here because a keyword is looked up from the eight-bit hexadecimal.
 */
const EIGHT_BIT_SPACES: ReadonlySet<ColorSpaceId> = new Set<ColorSpaceId>(["named", "hex", "rgb"]);

describe("formatNumber", () => {
    it("drops trailing zeros so a panel of eleven rows stays scannable", () => {
        expect(formatNumber(54.3, 2)).toBe("54.3");
        expect(formatNumber(54.29999, 2)).toBe("54.3");
        expect(formatNumber(100, 2)).toBe("100");
    });

    it("writes negative zero as zero, which is what a neutral's a-axis is", () => {
        // Every grey lands on -0 in at least one opponent axis, and `-0` in a colour panel
        // reads as a bug rather than as a number.
        expect(formatNumber(-0, 2)).toBe("0");
        expect(formatNumber(-0.0001, 2)).toBe("0");
    });
});

describe("exact output", () => {
    it("writes the notations whose rounding a user will copy", () => {
        expect(formatColor(RED, "named")).toBe("red");
        expect(formatColor(RED, "hex")).toBe("#ff0000");
        expect(formatColor(RED, "rgb")).toBe("rgb(255 0 0)");
        expect(formatColor(RED, "hsl")).toBe("hsl(0 100% 50%)");
        expect(formatColor(RED, "hsv")).toBe("hsv(0 100% 100%)");
        expect(formatColor(RED, "hwb")).toBe("hwb(0 0% 0%)");
        expect(formatColor(RED, "cmyk")).toBe("cmyk(0% 100% 100% 0%)");
    });

    it("switches to the alpha-carrying spelling rather than dropping the alpha", () => {
        const half = rgb(1, 0, 0, 0.5);
        expect(formatColor(half, "hex")).toBe("#ff000080");
        expect(formatColor(half, "rgb")).toBe("rgba(255, 0, 0, 0.5)");
        expect(formatColor(half, "hsl")).toBe("hsl(0 100% 50% / 0.5)");
        expect(formatHex(rgb(0, 0, 0, 0))).toBe("#00000000");
    });

    it("has no CSS keyword for most colours, and says so instead of inventing one", () => {
        expect(formatColor(rgb(0.123, 0.456, 0.789), "named")).toBeNull();
        // A named colour with alpha is no longer that keyword, so the row goes quiet rather
        // than reporting `red` for something half transparent.
        expect(formatColor(rgb(1, 0, 0, 0.5), "named")).toBeNull();
    });

    it("writes a paintable CSS value for the style binding, always clipped, always rgb()", () => {
        expect(cssColor(RED)).toBe("rgb(255 0 0)");
        expect(cssColor(rgb(1, 0, 0, 0.25))).toBe("rgb(255 0 0 / 0.25)");
        // The out-of-gamut colour has to become something a browser will accept, and the
        // warning about that belongs to the translator rather than to the style attribute.
        expect(cssColor(OUT_OF_GAMUT)).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
    });
});

describe("every notation can be pasted back into the field it came from", () => {
    const samples: Rgb[] = [
        RED,
        WHITE,
        BLACK,
        rgb(0.2, 0.6, 0.9),
        rgb(0.5, 0.25, 0.75, 0.4),
        rgb(0.4, 0.4, 0.4),
    ];

    for (const space of COLOR_SPACES) {
        it(`round-trips ${space}`, () => {
            for (const sample of samples) {
                const text = formatColor(sample, space);
                if (text === null) continue; // Only `named`, and only for an unnamed colour.

                const back = parseColor(text);
                expect(back.ok, `${space}: ${text} did not parse`).toBe(true);
                if (!back.ok) continue;

                // The tolerance is the precision the notation itself carries, not a
                // tolerance for the conversion. `#rrggbb` and `rgb()` quantise to eight
                // bits, so half a step - 1/510, about 0.002 - is the best any round trip
                // through them can do and demanding more would be demanding that hexadecimal
                // stop being hexadecimal. Everything else is written to two or more decimal
                // places and recovers to about one part in ten thousand.
                const precision = EIGHT_BIT_SPACES.has(space) ? 2 : 3;
                expect(back.value.color.r).toBeCloseTo(sample.r, precision);
                expect(back.value.color.g).toBeCloseTo(sample.g, precision);
                expect(back.value.color.b).toBeCloseTo(sample.b, precision);
                expect(back.value.color.alpha).toBeCloseTo(sample.alpha, precision);
            }
        });
    }

    it("round-trips a colour outside sRGB through the spaces that can hold one", () => {
        for (const space of ["lab", "lch", "oklab", "oklch"] as ColorSpaceId[]) {
            const text = formatColor(OUT_OF_GAMUT, space);
            expect(text).not.toBeNull();
            const back = parseColor(text ?? "");
            expect(back.ok).toBe(true);
            if (!back.ok) continue;
            expect(back.value.color.g).toBeCloseTo(OUT_OF_GAMUT.g, 3);
            expect(back.value.color.g).toBeGreaterThan(1);
        }
    });
});

describe("the translator's rows", () => {
    it("lists every space in panel order, including the ones with nothing to say", () => {
        const rows = colorRepresentations(rgb(0.123, 0.456, 0.789));
        expect(rows.map((row) => row.space)).toEqual([...COLOR_SPACES]);

        const named = rows[0];
        expect(named?.space).toBe("named");
        expect(named?.available).toBe(false);
        expect(named?.text).toBe("");
        // Kept rather than filtered: a row that appears from nowhere the moment somebody
        // lands on `rebeccapurple` would shift every row beneath it.
        expect(rows).toHaveLength(COLOR_SPACES.length);
    });

    it("names the notation it actually wrote, so HEX8 is not reported as HEX", () => {
        const opaque = colorRepresentations(RED);
        expect(opaque.find((row) => row.space === "hex")?.notation).toBe("HEX");
        expect(opaque.find((row) => row.space === "rgb")?.notation).toBe("RGB");

        const translucent = colorRepresentations(rgb(1, 0, 0, 0.5));
        expect(translucent.find((row) => row.space === "hex")?.notation).toBe("HEX8");
        expect(translucent.find((row) => row.space === "rgb")?.notation).toBe("RGBA");
        expect(translucent.find((row) => row.space === "hsl")?.notation).toBe("HSLA");
    });

    it("marks nothing as clipped for a colour that is inside sRGB", () => {
        expect(colorRepresentations(rgb(0.2, 0.6, 0.9)).some((row) => row.clipped)).toBe(false);
    });

    it("marks exactly the rows that cannot hold an out-of-gamut colour", () => {
        const rows = colorRepresentations(OUT_OF_GAMUT);
        const clipped = rows.filter((row) => row.clipped).map((row) => row.space);
        const exact = rows.filter((row) => row.available && !row.clipped).map((row) => row.space);

        // `named` is in the clipped list and that is the point of the flag rather than a
        // surprise: this particular green clips to exactly #00ff00, so the row would
        // otherwise read `lime` and quietly claim a keyword for a colour that is nothing
        // like it.
        expect(clipped).toEqual(["named", "hex", "rgb", "hsl", "hsv", "hwb", "cmyk"]);
        expect(exact).toEqual(["lab", "lch", "oklab", "oklch"]);
    });

    it("says how much a clipped row costs, so the warning is about a size and not a fact", () => {
        const hex = colorRepresentations(OUT_OF_GAMUT).find((row) => row.space === "hex");
        expect(hex?.clipped).toBe(true);
        expect(hex?.clipDelta).toBeGreaterThan(0);
        // A whole channel step is 1/255; anything at or above that is visible.
        expect(hex?.clipDelta).toBeGreaterThan(1 / 255);
    });

    it("does not call an empty row a clipped one", () => {
        // Out of gamut, and its clipped value has no keyword either, so the `named` row has
        // nothing to say and nothing to have lost.
        const unnamed = colorRepresentations(rgb(1.2, 0.4, 0.35));
        const named = unnamed.find((row) => row.space === "named");
        expect(named?.available).toBe(false);
        expect(named?.clipped).toBe(false);
        expect(unnamed.find((row) => row.space === "hex")?.clipped).toBe(true);
    });
});

describe("what the picker says about the colour", () => {
    it("names the gamut and reports what sRGB will actually paint", () => {
        expect(describeColor(rgb(0.2, 0.6, 0.9)).gamut).toBe("srgb");
        expect(describeColor(rgb(0.2, 0.6, 0.9)).clipped).toBe(false);

        const wide = describeColor(OUT_OF_GAMUT);
        expect(wide.gamut).toBe("outside");
        expect(wide.clipped).toBe(true);
        expect(wide.rendered.g).toBe(1);
        // The original is untouched, so nothing about asking the question changed the answer.
        expect(OUT_OF_GAMUT.g).toBeGreaterThan(1);
    });

    it("reports contrast against the surface, composited when the colour is translucent", () => {
        const onWhite = contrastReport(BLACK, WHITE);
        expect(onWhite.ratio).toBeCloseTo(21, 6);
        expect(onWhite.level).toBe("AAA");
        expect(onWhite.largeLevel).toBe("AAA");

        const faded = contrastReport(rgb(0, 0, 0, 0.2), WHITE);
        expect(faded.ratio).toBeLessThan(onWhite.ratio);
        expect(faded.level).toBe("fail");
        expect(faded.composited.alpha).toBe(1);
    });

    it("separates the body-text verdict from the large-text one", () => {
        // Mid grey on white sits in the band that passes as a heading and fails as body
        // copy. Reporting one number would certify or condemn both.
        const grey = contrastReport(rgb(0.5, 0.5, 0.5), WHITE);
        expect(grey.ratio).toBeGreaterThan(3);
        expect(grey.ratio).toBeLessThan(4.5);
        expect(grey.level).toBe("fail");
        expect(grey.largeLevel).toBe("AA");
    });
});
