/**
 * The colour value the picker edits, and the gamut reporting built on it.
 *
 * A value keeps the space it was authored in. That matters: an OKLCH colour the
 * visitor dialled in deliberately stays OKLCH, so it is never quietly rewritten
 * to the nearest sRGB triple behind their back, and the picker can say which
 * space is active because the value itself knows.
 */

import type { ColorSpace, Triple } from "./spaces.js";
import { clipToSrgb, convert, isInSrgbGamut, toSrgb } from "./spaces.js";

export interface ColorValue {
    /** The space the components below are expressed in. */
    readonly space: ColorSpace;
    /** sRGB is held 0..1; every other space uses its own authored units. */
    readonly coords: Triple;
    /** 0..1. Preserved across every conversion and every representation that can carry it. */
    readonly alpha: number;
}

export function color(space: ColorSpace, coords: Triple, alpha = 1): ColorValue {
    return { space, coords, alpha: Math.min(1, Math.max(0, alpha)) };
}

export function srgb(r: number, g: number, b: number, alpha = 1): ColorValue {
    return color("srgb", [r, g, b], alpha);
}

/** Re-express a value in another space. Alpha rides along untouched. */
export function inSpace(value: ColorValue, space: ColorSpace): ColorValue {
    if (value.space === space) return value;
    return { space, coords: convert(value.space, space, value.coords), alpha: value.alpha };
}

/** The value as gamma-encoded sRGB. Components may fall outside 0..1 for wide-gamut input. */
export function srgbCoords(value: ColorValue): Triple {
    return toSrgb(value.space, value.coords);
}

export interface GamutReport {
    /** True when the colour can be shown on an sRGB display without alteration. */
    readonly inGamut: boolean;
    /** The authored colour, unchanged. */
    readonly authored: Triple;
    /** What an sRGB display will actually show. Equal to `authored` when in gamut. */
    readonly displayed: Triple;
    /** Largest single-channel distance between authored and displayed, 0..1. */
    readonly maxChannelShift: number;
}

/**
 * How much a screen will change this colour, if at all.
 *
 * The picker shows this before the value is applied, because a wide-gamut colour
 * that clips is still a legitimate thing to store; what is not legitimate is
 * storing it while implying the visitor will see it.
 */
export function gamutReport(value: ColorValue): GamutReport {
    const authored = srgbCoords(value);
    if (isInSrgbGamut(authored)) {
        return { inGamut: true, authored, displayed: authored, maxChannelShift: 0 };
    }
    const displayed = clipToSrgb(authored);
    const shift = Math.max(
        Math.abs(authored[0] - displayed[0]),
        Math.abs(authored[1] - displayed[1]),
        Math.abs(authored[2] - displayed[2])
    );
    return { inGamut: false, authored, displayed, maxChannelShift: shift };
}

/** A CSS colour string that renders correctly today, clipped to sRGB if it has to be. */
export function toRenderableCss(value: ColorValue): string {
    const rgb = clipToSrgb(srgbCoords(value));
    const r = Math.round(rgb[0] * 255);
    const g = Math.round(rgb[1] * 255);
    const b = Math.round(rgb[2] * 255);
    if (value.alpha >= 1) return `rgb(${r} ${g} ${b})`;
    return `rgb(${r} ${g} ${b} / ${round(value.alpha, 4)})`;
}

export function colorsEqual(a: ColorValue, b: ColorValue, tolerance = 1e-6): boolean {
    if (Math.abs(a.alpha - b.alpha) > tolerance) return false;
    const left = srgbCoords(a);
    const right = srgbCoords(b);
    return (
        Math.abs(left[0] - right[0]) <= tolerance &&
        Math.abs(left[1] - right[1]) <= tolerance &&
        Math.abs(left[2] - right[2]) <= tolerance
    );
}

export function round(value: number, precision: number): number {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
}

/** Composite a colour over an opaque backdrop, so contrast is measured against what is seen. */
export function compositeOver(top: ColorValue, backdrop: ColorValue): ColorValue {
    if (top.alpha >= 1) return top;
    const t = clipToSrgb(srgbCoords(top));
    const b = clipToSrgb(srgbCoords(backdrop));
    const a = top.alpha;
    return srgb(t[0] * a + b[0] * (1 - a), t[1] * a + b[1] * (1 - a), t[2] * a + b[2] * (1 - a), 1);
}
