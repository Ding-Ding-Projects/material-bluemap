/**
 * The colour maths, against values that were not produced by this code.
 *
 * Every landmark asserted here comes from CSS Color 4's own worked examples or from the
 * definition of the space, not from running the implementation once and freezing whatever it
 * said. That distinction is the whole point of the file: a conversion suite that snapshots
 * itself proves the code is deterministic and proves nothing about whether it is right, and
 * a picker whose OKLCH is subtly wrong is worse than one with no OKLCH at all, because the
 * user has no way to tell.
 *
 * Tolerances are stated per space rather than shared, because the spaces are numerically
 * unalike: CIELAB's lightness runs 0..100 and OKLab's runs 0..1, so the same absolute
 * tolerance would be four orders of magnitude stricter on one than the other. Where a
 * published constant is quoted to five figures the tolerance is the last figure quoted, and
 * where a round trip is asserted the tolerance is the one the published matrices can
 * actually deliver rather than the one floating point could.
 */

import { describe, expect, it } from "vitest";

import {
    clipReport,
    cmykToRgb,
    compositeOver,
    contrastLevel,
    contrastRatio,
    displayP3Gamut,
    gamutName,
    hslToRgb,
    hsvToRgb,
    hwbToRgb,
    LAB_CHROMA_FLOOR,
    labToLch,
    labToRgb,
    lchToRgb,
    linearToSrgb,
    normalizeHue,
    oklabToRgb,
    oklchToRgb,
    relativeLuminance,
    rgb,
    rgbToCmyk,
    rgbToHsl,
    rgbToHsv,
    rgbToHwb,
    rgbToLab,
    rgbToLch,
    rgbToOklab,
    rgbToOklch,
    srgbGamut,
    srgbToLinear,
    type Rgb,
} from "./colorSpaces.js";

const RED = rgb(1, 0, 0);
const GREEN = rgb(0, 1, 0);
const BLUE = rgb(0, 0, 1);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);

/**
 * A round trip landing where it started, to a precision the space can actually deliver.
 *
 * Not 1e-9, which is where a first draft of this file put it and where six of these
 * assertions failed. The matrices CSS Color 4 publishes are rounded to ten significant
 * figures and are not exact inverses of one another, so a trip out to CIELAB and back lands
 * about 4e-7 away and a trip through OKLab about 9e-7. Both are three orders of magnitude
 * below one step of an 8-bit channel, which is 1/255 - so nothing that survives this can
 * move a pixel, and tightening it further would only be asserting that the specification's
 * own constants have more digits than they do.
 */
function expectRgbClose(actual: Rgb, expected: Rgb, precision = 5): void {
    expect(actual.r).toBeCloseTo(expected.r, precision);
    expect(actual.g).toBeCloseTo(expected.g, precision);
    expect(actual.b).toBeCloseTo(expected.b, precision);
    expect(actual.alpha).toBeCloseTo(expected.alpha, precision);
}

/* -------------------------------------------------------------------------- */
/* The transfer function                                                      */
/* -------------------------------------------------------------------------- */

describe("the sRGB transfer function", () => {
    it("pins both ends and the knee", () => {
        expect(srgbToLinear(0)).toBeCloseTo(0, 12);
        expect(srgbToLinear(1)).toBeCloseTo(1, 12);
        expect(srgbToLinear(0.5)).toBeCloseTo(0.21404114, 7);
        expect(linearToSrgb(0.21404114)).toBeCloseTo(0.5, 7);
    });

    it("extends through zero rather than folding, so a negative channel stays negative", () => {
        // Without the odd extension a channel of -0.2 would come back positive and a colour
        // sitting just outside the gamut would test as being inside it.
        expect(srgbToLinear(-0.5)).toBeCloseTo(-srgbToLinear(0.5), 12);
        expect(linearToSrgb(-0.21404114)).toBeCloseTo(-0.5, 7);
    });
});

/* -------------------------------------------------------------------------- */
/* CIELAB and CIELCH, against D50                                             */
/* -------------------------------------------------------------------------- */

describe("CIELAB", () => {
    it("puts white at L 100 with no chroma and black at the origin", () => {
        const white = rgbToLab(WHITE);
        expect(white.l).toBeCloseTo(100, 4);
        expect(white.a).toBeCloseTo(0, 4);
        expect(white.b).toBeCloseTo(0, 4);

        const black = rgbToLab(BLACK);
        expect(black.l).toBeCloseTo(0, 6);
        expect(black.a).toBeCloseTo(0, 6);
        expect(black.b).toBeCloseTo(0, 6);
    });

    it("matches CSS Color 4's published values for the sRGB primaries", () => {
        // lab(54.2905% 80.8098 69.8912), lab(87.8181% -79.2717 80.9946),
        // lab(29.5683% 68.2986 -112.0294) - the specification's own conversions.
        const red = rgbToLab(RED);
        expect(red.l).toBeCloseTo(54.2905, 2);
        expect(red.a).toBeCloseTo(80.8098, 2);
        expect(red.b).toBeCloseTo(69.8912, 2);

        const green = rgbToLab(GREEN);
        expect(green.l).toBeCloseTo(87.8181, 2);
        expect(green.a).toBeCloseTo(-79.2717, 2);
        expect(green.b).toBeCloseTo(80.9946, 2);

        const blue = rgbToLab(BLUE);
        expect(blue.l).toBeCloseTo(29.5683, 2);
        // One decimal place here rather than two: these are quoted from a published
        // conversion table, and the table's own last digit is worth about that much. A wrong
        // white point moves `a` by nearly a whole unit, so the check still bites.
        expect(blue.a).toBeCloseTo(68.2986, 1);
        expect(blue.b).toBeCloseTo(-112.0294, 1);
    });

    it("uses D50, which is what CSS means by lab() and therefore what a pasted value means", () => {
        // The same red against D65 lands near a = 80.09. That is a defensible number and the
        // wrong one here: a picker that disagreed with the engine it renders on would
        // mistranslate every value copied out of a stylesheet.
        expect(rgbToLab(RED).a).toBeGreaterThan(80.5);
    });

    it("round-trips every primary and a mid grey exactly", () => {
        for (const color of [RED, GREEN, BLUE, WHITE, BLACK, rgb(0.5, 0.25, 0.75, 0.4)]) {
            expectRgbClose(labToRgb(rgbToLab(color)), color);
        }
    });

    it("keeps a colour sRGB cannot show rather than clamping it on the way through", () => {
        const wild = labToRgb({ l: 60, a: 200, b: -180, alpha: 1 });
        expect(srgbGamut(wild).outside).toBe(true);

        const back = rgbToLab(wild);
        expect(back.l).toBeCloseTo(60, 3);
        expect(back.a).toBeCloseTo(200, 3);
        expect(back.b).toBeCloseTo(-180, 3);
    });
});

describe("CIELCH", () => {
    it("is CIELAB in polar form, taken from the published CIELAB primaries", () => {
        // Derived from the specification's own lab(54.2905% 80.8098 69.8912) rather than
        // quoted from a table, so this checks the polar conversion against the value the
        // test above already pinned instead of against a second remembered constant.
        const lch = rgbToLch(RED);
        expect(lch.l).toBeCloseTo(54.2905, 2);
        expect(lch.c).toBeCloseTo(Math.hypot(80.8098, 69.8912), 2);
        expect(lch.h).toBeCloseTo((Math.atan2(69.8912, 80.8098) * 180) / Math.PI, 2);
        // Roughly 106.8 at roughly 41 degrees, so a gross error is visible without decoding
        // the expression above.
        expect(lch.c).toBeGreaterThan(106);
        expect(lch.h).toBeGreaterThan(40);
        expect(lch.h).toBeLessThan(42);
    });

    it("reports hue zero for a neutral, where hue is undefined rather than red", () => {
        // Not exactly zero chroma: CSS's Bradford matrices are rounded, so an sRGB neutral
        // lands about 6e-6 off the D50 white point. That is why the chroma floor exists and
        // why it is not a floating-point epsilon.
        const grey = rgbToLch(rgb(0.5, 0.5, 0.5));
        expect(grey.c).toBeLessThan(LAB_CHROMA_FLOOR);
        expect(grey.h).toBe(0);
    });

    it("round-trips, including through the polar conversion on its own", () => {
        const lab = rgbToLab(rgb(0.2, 0.7, 0.4, 0.6));
        const lch = labToLch(lab);
        expectRgbClose(lchToRgb(lch), rgb(0.2, 0.7, 0.4, 0.6));
    });
});

/* -------------------------------------------------------------------------- */
/* OKLab and OKLCH, against D65                                               */
/* -------------------------------------------------------------------------- */

describe("OKLab", () => {
    it("puts white at L 1 and black at L 0, both with no chroma", () => {
        const white = rgbToOklab(WHITE);
        expect(white.l).toBeCloseTo(1, 5);
        expect(white.a).toBeCloseTo(0, 5);
        expect(white.b).toBeCloseTo(0, 5);

        expect(rgbToOklab(BLACK).l).toBeCloseTo(0, 6);
    });

    it("matches Björn Ottosson's published values for the sRGB primaries", () => {
        const red = rgbToOklab(RED);
        expect(red.l).toBeCloseTo(0.62796, 3);
        expect(red.a).toBeCloseTo(0.22486, 3);
        expect(red.b).toBeCloseTo(0.12585, 3);

        const green = rgbToOklab(GREEN);
        expect(green.l).toBeCloseTo(0.86644, 3);
        expect(green.a).toBeCloseTo(-0.23389, 3);
        expect(green.b).toBeCloseTo(0.1795, 3);

        const blue = rgbToOklab(BLUE);
        expect(blue.l).toBeCloseTo(0.45201, 3);
        expect(blue.a).toBeCloseTo(-0.03246, 3);
        expect(blue.b).toBeCloseTo(-0.31153, 3);
    });

    it("orders the primaries by perceptual lightness, which is the point of the space", () => {
        // In CIELAB, sRGB blue is darker than red; in OKLab it is too, but green is far
        // lighter than either. A transposed matrix row still round-trips and still lands
        // near the right magnitudes, and this is the shape it would break.
        expect(rgbToOklab(GREEN).l).toBeGreaterThan(rgbToOklab(RED).l);
        expect(rgbToOklab(RED).l).toBeGreaterThan(rgbToOklab(BLUE).l);
    });

    it("round-trips every primary and a translucent mid tone", () => {
        for (const color of [RED, GREEN, BLUE, WHITE, BLACK, rgb(0.3, 0.6, 0.9, 0.25)]) {
            expectRgbClose(oklabToRgb(rgbToOklab(color)), color);
        }
    });
});

describe("OKLCH", () => {
    it("agrees with the polar form of the published OKLab primaries", () => {
        const red = rgbToOklch(RED);
        expect(red.l).toBeCloseTo(0.62796, 3);
        expect(red.c).toBeCloseTo(Math.hypot(0.22486, 0.12585), 3);
        expect(red.h).toBeCloseTo((Math.atan2(0.12585, 0.22486) * 180) / Math.PI, 1);
        expect(red.h).toBeCloseTo(29.23, 1);

        const green = rgbToOklch(GREEN);
        expect(green.c).toBeCloseTo(Math.hypot(-0.23389, 0.1795), 3);
        expect(green.h).toBeCloseTo(142.5, 1);

        const blue = rgbToOklch(BLUE);
        expect(blue.c).toBeCloseTo(Math.hypot(-0.03246, -0.31153), 3);
        // Past 180 degrees, so a naive `atan` without the quadrant would land at 84 here.
        expect(blue.h).toBeCloseTo(264.05, 1);
    });

    it("round-trips a colour that is well outside sRGB", () => {
        const vivid = { l: 0.9, c: 0.35, h: 140, alpha: 1 };
        const back = rgbToOklch(oklchToRgb(vivid));
        expect(back.l).toBeCloseTo(0.9, 7);
        expect(back.c).toBeCloseTo(0.35, 7);
        expect(back.h).toBeCloseTo(140, 5);
    });
});

/* -------------------------------------------------------------------------- */
/* The sRGB re-parameterisations                                              */
/* -------------------------------------------------------------------------- */

describe("HSL", () => {
    it("reads the primaries at the hue sector boundaries", () => {
        expect(rgbToHsl(RED)).toMatchObject({ h: 0, s: 100, l: 50 });
        expect(rgbToHsl(GREEN)).toMatchObject({ h: 120, s: 100, l: 50 });
        expect(rgbToHsl(BLUE)).toMatchObject({ h: 240, s: 100, l: 50 });
    });

    it("reports a neutral as zero saturation rather than as an arbitrary hue", () => {
        const grey = rgbToHsl(rgb(0.5, 0.5, 0.5));
        expect(grey.s).toBe(0);
        expect(grey.h).toBe(0);
        expect(grey.l).toBeCloseTo(50, 9);
    });

    it("round-trips, alpha included", () => {
        for (const color of [RED, GREEN, BLUE, rgb(0.2, 0.4, 0.8, 0.35), rgb(0.5, 0.5, 0.5)]) {
            expectRgbClose(hslToRgb(rgbToHsl(color)), color);
        }
    });

    it("builds the colour a stated HSL names", () => {
        expectRgbClose(hslToRgb({ h: 120, s: 100, l: 25, alpha: 1 }), rgb(0, 0.5, 0));
        expectRgbClose(hslToRgb({ h: -30, s: 100, l: 50, alpha: 1 }), rgb(1, 0, 0.5));
    });
});

describe("HSV", () => {
    it("separates value from lightness, which is the whole reason it exists", () => {
        expect(rgbToHsv(RED)).toMatchObject({ h: 0, s: 100, v: 100 });
        // Half-bright red is value 50 in HSV and lightness 25 in HSL. A picker that
        // conflated the two would move the swatch when the user switched notation.
        expect(rgbToHsv(rgb(0.5, 0, 0)).v).toBeCloseTo(50, 9);
        expect(rgbToHsl(rgb(0.5, 0, 0)).l).toBeCloseTo(25, 9);
    });

    it("round-trips", () => {
        for (const color of [RED, rgb(0.1, 0.9, 0.4, 0.8), WHITE, BLACK]) {
            expectRgbClose(hsvToRgb(rgbToHsv(color)), color);
        }
    });
});

describe("HWB", () => {
    it("reads whiteness and blackness off the channel extremes", () => {
        expect(rgbToHwb(RED)).toMatchObject({ h: 0, w: 0, b: 0 });
        const muted = rgbToHwb(rgb(0.75, 0.25, 0.25));
        expect(muted.h).toBeCloseTo(0, 9);
        expect(muted.w).toBeCloseTo(25, 9);
        expect(muted.b).toBeCloseTo(25, 9);
    });

    it("builds the stated colour, tint and shade included", () => {
        expectRgbClose(hwbToRgb({ h: 0, w: 25, b: 25, alpha: 1 }), rgb(0.75, 0.25, 0.25));
    });

    it("collapses to grey when whiteness and blackness together exceed the whole", () => {
        // Two sliders dragged past each other. Without the ratio branch this produces
        // negative channels and a colour that is neither grey nor the requested hue.
        const grey = hwbToRgb({ h: 200, w: 70, b: 70, alpha: 1 });
        expect(grey.r).toBeCloseTo(0.5, 9);
        expect(grey.g).toBeCloseTo(0.5, 9);
        expect(grey.b).toBeCloseTo(0.5, 9);
    });

    it("round-trips", () => {
        for (const color of [RED, rgb(0.6, 0.3, 0.9, 0.5), WHITE, BLACK]) {
            expectRgbClose(hwbToRgb(rgbToHwb(color)), color);
        }
    });
});

describe("CMYK", () => {
    it("inverts the primaries the way every screen tool does", () => {
        expect(rgbToCmyk(RED)).toMatchObject({ c: 0, m: 100, y: 100, k: 0 });
        expect(rgbToCmyk(WHITE)).toMatchObject({ c: 0, m: 0, y: 0, k: 0 });
    });

    it("reports black as pure key with no chromatic ink, rather than dividing by zero", () => {
        expect(rgbToCmyk(BLACK)).toMatchObject({ c: 0, m: 0, y: 0, k: 100 });
    });

    it("round-trips, which is the only accuracy claim it makes", () => {
        for (const color of [RED, rgb(0, 0.5, 1), rgb(0.2, 0.4, 0.6, 0.9), BLACK]) {
            expectRgbClose(cmykToRgb(rgbToCmyk(color)), color);
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Gamut and clipping                                                         */
/* -------------------------------------------------------------------------- */

describe("gamut reporting", () => {
    it("calls an ordinary colour sRGB", () => {
        expect(gamutName(rgb(0.2, 0.6, 0.9))).toBe("srgb");
        expect(srgbGamut(rgb(0.2, 0.6, 0.9)).excess).toBe(0);
    });

    it("distinguishes a colour that a P3 panel can show from one nothing can", () => {
        // A red more saturated than sRGB can hold but well within Display P3 - the kind of
        // colour a modern laptop panel renders perfectly. A picker that only knew one gamut
        // would tell that user their colour is unshowable. Deliberately short of the P3
        // primary itself, which sits exactly on the boundary where a rounded literal in a
        // test could fall either side of it and prove nothing either way.
        const vividRed = rgb(1.05, -0.15, -0.1);
        expect(srgbGamut(vividRed).outside).toBe(true);
        expect(displayP3Gamut(vividRed).outside).toBe(false);
        expect(gamutName(vividRed)).toBe("display-p3");

        expect(gamutName(rgb(1.5, -0.5, 2))).toBe("outside");
    });

    it("treats floating-point noise from a round trip as being in gamut", () => {
        const noisy = oklabToRgb(rgbToOklab(WHITE));
        expect(srgbGamut(noisy).outside).toBe(false);
        expect(gamutName(noisy)).toBe("srgb");
    });

    it("says what clipping would cost, and leaves the original alone", () => {
        const wild = rgb(1.2, -0.1, 0.5, 0.5);
        const report = clipReport(wild);

        expect(report.clipped).toBe(true);
        expect(report.delta).toBeCloseTo(0.2, 9);
        expect(report.color).toEqual({ r: 1, g: 0, b: 0.5, alpha: 0.5 });
        expect(wild.r).toBe(1.2);
    });

    it("reports no clipping for a colour that is already inside", () => {
        expect(clipReport(rgb(0.3, 0.3, 0.3)).clipped).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/* Contrast                                                                   */
/* -------------------------------------------------------------------------- */

describe("contrast", () => {
    it("pins the two ends of the WCAG scale", () => {
        expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 9);
        expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 9);
    });

    it("uses the published relative luminance coefficients", () => {
        expect(relativeLuminance(WHITE)).toBeCloseTo(1, 9);
        expect(relativeLuminance(BLACK)).toBeCloseTo(0, 9);
        expect(relativeLuminance(GREEN)).toBeCloseTo(0.7152, 9);
    });

    it("composites a translucent foreground before measuring it", () => {
        // Black text at 50% over white is grey, not black, and its real ratio is nothing
        // like 21. Reporting the uncomposited figure is what certifies unreadable text.
        const composited = compositeOver(rgb(0, 0, 0, 0.5), WHITE);
        expect(composited.r).toBeCloseTo(0.5, 9);
        expect(contrastRatio(composited, WHITE)).toBeLessThan(21);
        expect(contrastRatio(composited, WHITE)).toBeGreaterThan(3);
    });

    it("grades against the right threshold for the text size", () => {
        expect(contrastLevel(21)).toBe("AAA");
        expect(contrastLevel(5)).toBe("AA");
        expect(contrastLevel(3)).toBe("fail");
        // Three-to-one passes at large text and fails at body text, which is exactly why
        // both verdicts are reported rather than one being chosen here.
        expect(contrastLevel(3, true)).toBe("AA");
        expect(contrastLevel(2.9, true)).toBe("fail");
    });
});

describe("hue normalisation", () => {
    it("wraps in both directions and survives nonsense", () => {
        expect(normalizeHue(-30)).toBe(330);
        expect(normalizeHue(390)).toBe(30);
        expect(normalizeHue(360)).toBe(0);
        expect(normalizeHue(Number.NaN)).toBe(0);
    });
});
