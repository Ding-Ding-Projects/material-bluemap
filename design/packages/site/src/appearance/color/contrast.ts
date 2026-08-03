/**
 * Accessible contrast reporting for the colour picker.
 *
 * WCAG 2.1 contrast is what the accessibility rules in this project are written
 * against, so that is what is reported. It is computed against the colour the
 * visitor will actually see: a translucent colour is composited over its backdrop
 * first, because a ratio measured against an unblended value is a number that
 * describes nothing on screen.
 */

import { clipToSrgb, srgbToLinear } from "./spaces.js";
import type { ColorValue } from "./value.js";
import { compositeOver, srgbCoords } from "./value.js";

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(value: ColorValue): number {
    const rgb = clipToSrgb(srgbCoords(value));
    return (
        0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2])
    );
}

export type ContrastGrade = "fail" | "aa-large" | "aa" | "aaa";

export interface ContrastReport {
    /** 1 to 21. */
    readonly ratio: number;
    /** Highest WCAG 2.1 threshold the ratio clears for body text. */
    readonly grade: ContrastGrade;
    readonly passesAaNormal: boolean;
    readonly passesAaLarge: boolean;
    readonly passesAaaNormal: boolean;
    readonly passesAaaLarge: boolean;
    /** True when either colour had to be composited because it was translucent. */
    readonly composited: boolean;
    /** True when either colour fell outside sRGB and was clipped before measuring. */
    readonly clipped: boolean;
}

/**
 * Contrast between a foreground and a background.
 *
 * `page` is the opaque surface behind both, used to resolve any translucency.
 * Without it a half-transparent foreground over a half-transparent background has
 * no defined ratio at all.
 */
export function contrastReport(
    foreground: ColorValue,
    background: ColorValue,
    page: ColorValue
): ContrastReport {
    const composited = foreground.alpha < 1 || background.alpha < 1;
    const flatBackground = compositeOver(background, page);
    const flatForeground = compositeOver(foreground, flatBackground);

    const rawForeground = srgbCoords(foreground);
    const rawBackground = srgbCoords(background);
    const clipped =
        rawForeground.some((channel) => channel < -1e-4 || channel > 1 + 1e-4) ||
        rawBackground.some((channel) => channel < -1e-4 || channel > 1 + 1e-4);

    const lighter = Math.max(relativeLuminance(flatForeground), relativeLuminance(flatBackground));
    const darker = Math.min(relativeLuminance(flatForeground), relativeLuminance(flatBackground));
    const ratio = (lighter + 0.05) / (darker + 0.05);

    const passesAaNormal = ratio >= 4.5;
    const passesAaLarge = ratio >= 3;
    const passesAaaNormal = ratio >= 7;
    const passesAaaLarge = ratio >= 4.5;

    let grade: ContrastGrade = "fail";
    if (passesAaaNormal) grade = "aaa";
    else if (passesAaNormal) grade = "aa";
    else if (passesAaLarge) grade = "aa-large";

    return {
        ratio,
        grade,
        passesAaNormal,
        passesAaLarge,
        passesAaaNormal,
        passesAaaLarge,
        composited,
        clipped,
    };
}

/** Formatted to two decimals, the precision WCAG thresholds are stated at. */
export function formatRatio(ratio: number): string {
    return `${ratio.toFixed(2)}:1`;
}
