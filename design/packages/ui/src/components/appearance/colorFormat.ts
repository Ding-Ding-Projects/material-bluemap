/**
 * Writing a colour back out, in every notation the translator speaks.
 *
 * This is the half of the translator the user actually reads, and it has one job beyond
 * arithmetic: never to present a number as the colour when it is only an approximation of
 * it. Three of the eleven notations — hexadecimal, the HSL family and CMYK — are
 * re-parameterisations of the sRGB cube and simply cannot express a colour outside it. Given
 * `oklch(0.9 0.35 140)` they will each produce something, and that something will be a
 * different, duller colour. Every representation therefore carries its own
 * {@link ColorRepresentation.clipped} flag and the size of the difference, so the panel can
 * mark the rows that are lying and leave the rows that are not alone. That is the "warns
 * before clipping" clause of the contract, and it is per row rather than per panel because
 * the situation is genuinely per row: in the same instant, `oklch()` is exact and `#rrggbb`
 * is not.
 *
 * Rounding happens here and nowhere else. The picker's own state is the unrounded colour, so
 * moving between representations is lossless no matter how many times it is done; only the
 * text a human reads is rounded, and each space is rounded to a precision at which a
 * round trip through that text lands back on the same 8-bit pixel.
 */

import { nameOfHex } from "./colorNames.js";
import type { ColorSpaceId } from "./colorParse.js";
import {
    clipReport,
    clipRgb,
    compositeOver,
    contrastLevel,
    contrastRatio,
    gamutName,
    rgbToCmyk,
    rgbToHsl,
    rgbToHsv,
    rgbToHwb,
    rgbToLab,
    rgbToLch,
    rgbToOklab,
    rgbToOklch,
    type ContrastLevel,
    type GamutName,
    type Rgb,
} from "./colorSpaces.js";

/**
 * A number rounded for display, with trailing zeros dropped.
 *
 * `54.30` reads as a measurement taken to two decimal places and `54.3` reads as a number,
 * and in a panel of eleven rows the second is far easier to scan. `Number.parseFloat` on the
 * fixed string is the shortest way to get there that also handles `-0`, which otherwise
 * renders as `-0` in the a-axis of any neutral grey and looks like a bug.
 */
export function formatNumber(value: number, decimals: number): string {
    if (!Number.isFinite(value)) return "0";
    const rounded = Number.parseFloat(value.toFixed(decimals));
    return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** An 8-bit channel as two lowercase hexadecimal digits. */
function hexPair(channel: number): string {
    return Math.round(Math.min(1, Math.max(0, channel)) * 255)
        .toString(16)
        .padStart(2, "0");
}

/** `#rrggbb`, or `#rrggbbaa` when alpha is not fully opaque. */
export function formatHex(color: Rgb): string {
    const clipped = clipRgb(color);
    const base = `#${hexPair(clipped.r)}${hexPair(clipped.g)}${hexPair(clipped.b)}`;
    return clipped.alpha >= 1 ? base : `${base}${hexPair(clipped.alpha)}`;
}

/** The alpha suffix CSS's modern syntax uses, or nothing when the colour is opaque. */
function alphaSuffix(alpha: number): string {
    return alpha >= 1 ? "" : ` / ${formatNumber(alpha, 4)}`;
}

/**
 * The colour as a CSS value the browser will actually paint.
 *
 * Always clipped and always `rgb()`, because this is the string that goes into a `style`
 * binding rather than into the translator. Using the authored notation here would mean a
 * saved `oklch()` renders differently on an engine that has not shipped it, and an
 * appearance record that looks different depending on the browser version is not a record.
 */
export function cssColor(color: Rgb): string {
    const clipped = clipRgb(color);
    const r = Math.round(clipped.r * 255);
    const g = Math.round(clipped.g * 255);
    const b = Math.round(clipped.b * 255);
    return clipped.alpha >= 1
        ? `rgb(${r} ${g} ${b})`
        : `rgb(${r} ${g} ${b} / ${formatNumber(clipped.alpha, 4)})`;
}

/**
 * The colour written in one notation.
 *
 * Returns null only for `named`, and only when the colour has no CSS keyword — which is the
 * overwhelmingly common case. Every other space can express every colour, some of them
 * approximately, and the approximation is reported by {@link colorRepresentations} rather
 * than by refusing to write the string.
 */
export function formatColor(color: Rgb, space: ColorSpaceId): string | null {
    switch (space) {
        case "named": {
            if (color.alpha < 1) return null;
            const clipped = clipRgb(color);
            return nameOfHex(
                `#${hexPair(clipped.r)}${hexPair(clipped.g)}${hexPair(clipped.b)}`,
            );
        }

        case "hex":
            return formatHex(color);

        case "rgb": {
            const c = clipRgb(color);
            const r = Math.round(c.r * 255);
            const g = Math.round(c.g * 255);
            const b = Math.round(c.b * 255);
            return c.alpha >= 1
                ? `rgb(${r} ${g} ${b})`
                : `rgba(${r}, ${g}, ${b}, ${formatNumber(c.alpha, 4)})`;
        }

        case "hsl": {
            const hsl = rgbToHsl(color);
            return `hsl(${formatNumber(hsl.h, 2)} ${formatNumber(hsl.s, 2)}% ${formatNumber(hsl.l, 2)}%${alphaSuffix(hsl.alpha)})`;
        }

        case "hsv": {
            const hsv = rgbToHsv(color);
            return `hsv(${formatNumber(hsv.h, 2)} ${formatNumber(hsv.s, 2)}% ${formatNumber(hsv.v, 2)}%${alphaSuffix(hsv.alpha)})`;
        }

        case "hwb": {
            const hwb = rgbToHwb(color);
            return `hwb(${formatNumber(hwb.h, 2)} ${formatNumber(hwb.w, 2)}% ${formatNumber(hwb.b, 2)}%${alphaSuffix(hwb.alpha)})`;
        }

        case "lab": {
            const lab = rgbToLab(color);
            return `lab(${formatNumber(lab.l, 2)}% ${formatNumber(lab.a, 2)} ${formatNumber(lab.b, 2)}${alphaSuffix(lab.alpha)})`;
        }

        case "lch": {
            const lch = rgbToLch(color);
            return `lch(${formatNumber(lch.l, 2)}% ${formatNumber(lch.c, 2)} ${formatNumber(lch.h, 2)}${alphaSuffix(lch.alpha)})`;
        }

        case "oklab": {
            const oklab = rgbToOklab(color);
            return `oklab(${formatNumber(oklab.l, 5)} ${formatNumber(oklab.a, 5)} ${formatNumber(oklab.b, 5)}${alphaSuffix(oklab.alpha)})`;
        }

        case "oklch": {
            const oklch = rgbToOklch(color);
            return `oklch(${formatNumber(oklch.l, 5)} ${formatNumber(oklch.c, 5)} ${formatNumber(oklch.h, 2)}${alphaSuffix(oklch.alpha)})`;
        }

        case "cmyk": {
            const cmyk = rgbToCmyk(color);
            return `cmyk(${formatNumber(cmyk.c, 2)}% ${formatNumber(cmyk.m, 2)}% ${formatNumber(cmyk.y, 2)}% ${formatNumber(cmyk.k, 2)}%${alphaSuffix(cmyk.alpha)})`;
        }
    }
}

/**
 * The spaces that are a re-parameterisation of sRGB and therefore clip.
 *
 * Kept as data rather than as a condition inside the loop below, because "which notations
 * can lie about an out-of-gamut colour" is a fact about colour science that a reader should
 * be able to check at a glance, not one they have to reconstruct from control flow.
 */
const CLIPPING_SPACES: ReadonlySet<ColorSpaceId> = new Set<ColorSpaceId>([
    "named",
    "hex",
    "rgb",
    "hsl",
    "hsv",
    "hwb",
    "cmyk",
]);

/** The notation actually written, so a row can say HEX8 rather than claiming plain HEX. */
function notationOf(space: ColorSpaceId, color: Rgb): string {
    if (space === "hex") return color.alpha >= 1 ? "HEX" : "HEX8";
    if (space === "rgb") return color.alpha >= 1 ? "RGB" : "RGBA";
    if (space === "hsl") return color.alpha >= 1 ? "HSL" : "HSLA";
    if (space === "hsv") return "HSV";
    if (space === "hwb") return "HWB";
    if (space === "lab") return "CIELAB";
    if (space === "lch") return "CIELCH";
    if (space === "oklab") return "OKLab";
    if (space === "oklch") return "OKLCH";
    if (space === "cmyk") return "CMYK";
    return "Named";
}

/** One row of the translator. */
export interface ColorRepresentation {
    space: ColorSpaceId;
    /** The concrete notation this row wrote, e.g. `HEX8` rather than `HEX`. */
    notation: string;
    /** The written colour, or the empty string when this space cannot name it. */
    text: string;
    /** False only for `named`, and only when the colour has no CSS keyword. */
    available: boolean;
    /** True when writing this row cost the user part of their colour. */
    clipped: boolean;
    /** The largest single-channel difference clipping introduced, in 0..1 units. */
    clipDelta: number;
}

/**
 * Every representation of one colour, in panel order.
 *
 * Unavailable rows are kept rather than filtered out. A translator that hid the `named` row
 * for the 99.99% of colours with no keyword would look, to somebody who had only ever seen
 * it hidden, like a translator that does not do names at all — and the moment they landed on
 * `rebeccapurple` a row would appear from nowhere and shift everything below it. A row that
 * says plainly that there is no name is both more honest and less startling.
 */
export function colorRepresentations(
    color: Rgb,
    spaces: readonly ColorSpaceId[] = [
        "named",
        "hex",
        "rgb",
        "hsl",
        "hsv",
        "hwb",
        "lab",
        "lch",
        "oklab",
        "oklch",
        "cmyk",
    ],
): ColorRepresentation[] {
    const clip = clipReport(color);

    return spaces.map((space) => {
        const text = formatColor(color, space);
        // A row with nothing in it cannot also be a row that clipped: the `named` row for an
        // unnamed colour has not lost the user anything, it simply has nothing to say.
        const clips = text !== null && CLIPPING_SPACES.has(space) && clip.clipped;
        return {
            space,
            notation: notationOf(space, color),
            text: text ?? "",
            available: text !== null,
            clipped: clips,
            clipDelta: clips ? clip.delta : 0,
        };
    });
}

/* -------------------------------------------------------------------------- */
/* What the picker says about the colour itself                               */
/* -------------------------------------------------------------------------- */

/** The gamut and clipping summary shown above the translator. */
export interface ColorDescription {
    gamut: GamutName;
    clipped: boolean;
    clipDelta: number;
    /** What sRGB will actually paint, which is the swatch the user sees. */
    rendered: Rgb;
}

export function describeColor(color: Rgb): ColorDescription {
    const clip = clipReport(color);
    return {
        gamut: gamutName(color),
        clipped: clip.clipped,
        clipDelta: clip.delta,
        rendered: clip.color,
    };
}

/**
 * Contrast against the surface the colour is used on.
 *
 * Composited first, because the ratio of a translucent colour against a backdrop is a
 * property of the composite and not of the colour — and because reporting the uncomposited
 * figure is the specific mistake that certifies unreadable text as accessible. Both the
 * body-text and the large-text verdicts are returned rather than one chosen here: the caller
 * knows the size the colour is used at and this module does not.
 */
export interface ContrastReport {
    ratio: number;
    /** The verdict at body-text size, which is the stricter of the two thresholds. */
    level: ContrastLevel;
    /** The verdict at WCAG's large-text size, 18pt or 14pt bold. */
    largeLevel: ContrastLevel;
    /** The foreground after compositing, which is what the ratio was measured on. */
    composited: Rgb;
}

export function contrastReport(foreground: Rgb, backdrop: Rgb): ContrastReport {
    const composited = compositeOver(foreground, clipRgb(backdrop));
    const ratio = contrastRatio(composited, backdrop);
    return {
        ratio,
        level: contrastLevel(ratio, false),
        largeLevel: contrastLevel(ratio, true),
        composited,
    };
}

/** The i18n key naming a space, so the panel labels rows without a switch of its own. */
export function colorSpaceLabelKey(space: ColorSpaceId): string {
    return `appearance.color.space.${space}`;
}
