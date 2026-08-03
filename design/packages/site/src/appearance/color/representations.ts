/**
 * The bidirectional colour translator.
 *
 * Every representation here parses and formats, so a value the picker prints can
 * be pasted straight back in. Alpha survives both directions in every form that
 * can carry it; the forms that cannot (`hex`, `rgb`, the named colours) say so
 * rather than dropping it silently.
 */

import type { ColorSpace, Triple } from "./spaces.js";
import { clipToSrgb, componentsOf, convert, isInSrgbGamut } from "./spaces.js";
import type { ColorValue } from "./value.js";
import { color, inSpace, round, srgb, srgbCoords } from "./value.js";
import { lookupNamedColor, nameForSrgb } from "./named.js";

export type RepresentationId =
    | "named"
    | "hex"
    | "hex8"
    | "rgb"
    | "rgba"
    | "hsl"
    | "hsla"
    | "hsv"
    | "hwb"
    | "lab"
    | "lch"
    | "oklab"
    | "oklch"
    | "cmyk";

export const REPRESENTATION_IDS: readonly RepresentationId[] = [
    "named",
    "hex",
    "hex8",
    "rgb",
    "rgba",
    "hsl",
    "hsla",
    "hsv",
    "hwb",
    "lab",
    "lch",
    "oklab",
    "oklch",
    "cmyk",
];

export interface RepresentationInfo {
    readonly id: RepresentationId;
    /** Short label for the translator row. Localised copy wraps this, it is not user prose. */
    readonly label: string;
    /** True when the syntax is valid CSS as written. */
    readonly css: boolean;
    /** True when the form can carry alpha. */
    readonly carriesAlpha: boolean;
    /** The storage space a value parsed from this form is kept in. */
    readonly space: ColorSpace;
}

export const REPRESENTATIONS: Readonly<Record<RepresentationId, RepresentationInfo>> = {
    named: { id: "named", label: "CSS name", css: true, carriesAlpha: false, space: "srgb" },
    hex: { id: "hex", label: "HEX", css: true, carriesAlpha: false, space: "srgb" },
    hex8: { id: "hex8", label: "HEX8", css: true, carriesAlpha: true, space: "srgb" },
    rgb: { id: "rgb", label: "RGB", css: true, carriesAlpha: false, space: "srgb" },
    rgba: { id: "rgba", label: "RGBA", css: true, carriesAlpha: true, space: "srgb" },
    hsl: { id: "hsl", label: "HSL", css: true, carriesAlpha: false, space: "hsl" },
    hsla: { id: "hsla", label: "HSLA", css: true, carriesAlpha: true, space: "hsl" },
    hsv: { id: "hsv", label: "HSV / HSB", css: false, carriesAlpha: true, space: "hsv" },
    hwb: { id: "hwb", label: "HWB", css: true, carriesAlpha: true, space: "hwb" },
    lab: { id: "lab", label: "CIELAB", css: true, carriesAlpha: true, space: "lab" },
    lch: { id: "lch", label: "LCH", css: true, carriesAlpha: true, space: "lch" },
    oklab: { id: "oklab", label: "OKLab", css: true, carriesAlpha: true, space: "oklab" },
    oklch: { id: "oklch", label: "OKLCH", css: true, carriesAlpha: true, space: "oklch" },
    cmyk: { id: "cmyk", label: "CMYK", css: false, carriesAlpha: false, space: "srgb" },
};

/** What a formatted representation could not carry, so the picker can say it out loud. */
export type RepresentationLoss = "alpha" | "gamut" | "no-exact-name" | "not-color-managed";

export interface FormattedRepresentation {
    readonly id: RepresentationId;
    /** The text, or an empty string when the value has no representation in this form. */
    readonly text: string;
    /** Everything this form could not express about the value. Empty when lossless. */
    readonly losses: readonly RepresentationLoss[];
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

function hexPair(channel: number): string {
    const byte = Math.round(Math.min(1, Math.max(0, channel)) * 255);
    return byte.toString(16).padStart(2, "0");
}

function formatNumber(value: number, precision: number): string {
    const rounded = round(value, precision);
    return Object.is(rounded, -0) ? "0" : String(rounded);
}

function alphaSuffix(alpha: number, modern: boolean): string {
    if (alpha >= 1) return "";
    return modern ? ` / ${formatNumber(alpha, 4)}` : `, ${formatNumber(alpha, 4)}`;
}

function gamutLoss(value: ColorValue): RepresentationLoss[] {
    return isInSrgbGamut(srgbCoords(value)) ? [] : ["gamut"];
}

function alphaLoss(value: ColorValue): RepresentationLoss[] {
    return value.alpha < 1 ? ["alpha"] : [];
}

/** Convert to naive CMYK. Not colour management: no profile, no ink model, no black generation. */
export function srgbToNaiveCmyk(rgb: Triple): readonly [number, number, number, number] {
    const r = Math.min(1, Math.max(0, rgb[0]));
    const g = Math.min(1, Math.max(0, rgb[1]));
    const b = Math.min(1, Math.max(0, rgb[2]));
    const k = 1 - Math.max(r, g, b);
    if (k >= 1) return [0, 0, 0, 1];
    return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k];
}

export function naiveCmykToSrgb(cmyk: readonly [number, number, number, number]): Triple {
    const [c, m, y, k] = cmyk;
    return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
}

export function formatRepresentation(
    value: ColorValue,
    id: RepresentationId
): FormattedRepresentation {
    const rgb = srgbCoords(value);
    const clipped = clipToSrgb(rgb);

    switch (id) {
        case "named": {
            const name = nameForSrgb(clipped, value.alpha);
            if (name === null) {
                return { id, text: "", losses: ["no-exact-name"] };
            }
            return { id, text: name, losses: gamutLoss(value) };
        }
        case "hex":
            return {
                id,
                text: `#${hexPair(clipped[0])}${hexPair(clipped[1])}${hexPair(clipped[2])}`,
                losses: [...alphaLoss(value), ...gamutLoss(value)],
            };
        case "hex8":
            return {
                id,
                text: `#${hexPair(clipped[0])}${hexPair(clipped[1])}${hexPair(clipped[2])}${hexPair(value.alpha)}`,
                losses: gamutLoss(value),
            };
        case "rgb": {
            const parts = clipped.map((channel) => String(Math.round(channel * 255)));
            return {
                id,
                text: `rgb(${parts.join(" ")})`,
                losses: [...alphaLoss(value), ...gamutLoss(value)],
            };
        }
        case "rgba": {
            const parts = clipped.map((channel) => String(Math.round(channel * 255)));
            return {
                id,
                text: `rgba(${parts.join(", ")}, ${formatNumber(value.alpha, 4)})`,
                losses: gamutLoss(value),
            };
        }
        case "hsl": {
            const hsl = convert("srgb", "hsl", clipped);
            return {
                id,
                text: `hsl(${formatNumber(hsl[0], 1)} ${formatNumber(hsl[1], 1)}% ${formatNumber(hsl[2], 1)}%)`,
                losses: [...alphaLoss(value), ...gamutLoss(value)],
            };
        }
        case "hsla": {
            const hsl = convert("srgb", "hsl", clipped);
            return {
                id,
                text: `hsla(${formatNumber(hsl[0], 1)}, ${formatNumber(hsl[1], 1)}%, ${formatNumber(hsl[2], 1)}%, ${formatNumber(value.alpha, 4)})`,
                losses: gamutLoss(value),
            };
        }
        case "hsv": {
            const hsv = convert("srgb", "hsv", clipped);
            return {
                id,
                text: `hsv(${formatNumber(hsv[0], 1)} ${formatNumber(hsv[1], 1)}% ${formatNumber(hsv[2], 1)}%${alphaSuffix(value.alpha, true)})`,
                losses: gamutLoss(value),
            };
        }
        case "hwb": {
            const hwb = convert("srgb", "hwb", clipped);
            return {
                id,
                text: `hwb(${formatNumber(hwb[0], 1)} ${formatNumber(hwb[1], 1)}% ${formatNumber(hwb[2], 1)}%${alphaSuffix(value.alpha, true)})`,
                losses: gamutLoss(value),
            };
        }
        case "lab": {
            const lab = inSpace(value, "lab").coords;
            return {
                id,
                text: `lab(${formatNumber(lab[0], 3)} ${formatNumber(lab[1], 3)} ${formatNumber(lab[2], 3)}${alphaSuffix(value.alpha, true)})`,
                losses: [],
            };
        }
        case "lch": {
            const lch = inSpace(value, "lch").coords;
            return {
                id,
                text: `lch(${formatNumber(lch[0], 3)} ${formatNumber(lch[1], 3)} ${formatNumber(lch[2], 2)}${alphaSuffix(value.alpha, true)})`,
                losses: [],
            };
        }
        case "oklab": {
            const oklab = inSpace(value, "oklab").coords;
            return {
                id,
                text: `oklab(${formatNumber(oklab[0], 5)} ${formatNumber(oklab[1], 5)} ${formatNumber(oklab[2], 5)}${alphaSuffix(value.alpha, true)})`,
                losses: [],
            };
        }
        case "oklch": {
            const oklch = inSpace(value, "oklch").coords;
            return {
                id,
                text: `oklch(${formatNumber(oklch[0], 5)} ${formatNumber(oklch[1], 5)} ${formatNumber(oklch[2], 2)}${alphaSuffix(value.alpha, true)})`,
                losses: [],
            };
        }
        case "cmyk": {
            const cmyk = srgbToNaiveCmyk(clipped);
            const parts = cmyk.map((channel) => `${formatNumber(channel * 100, 2)}%`);
            return {
                id,
                text: `cmyk(${parts.join(" ")})`,
                losses: [
                    ...alphaLoss(value),
                    ...gamutLoss(value),
                    "not-color-managed" as RepresentationLoss,
                ],
            };
        }
    }
}

/** Format the value in every representation at once, for the translator panel. */
export function formatAll(value: ColorValue): readonly FormattedRepresentation[] {
    return REPRESENTATION_IDS.map((id) => formatRepresentation(value, id));
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

export interface ParseResult {
    readonly value: ColorValue | null;
    /** Which representation the text was recognised as. */
    readonly id: RepresentationId | null;
    /** Present when the text could not be read. Plain, specific, and safe to show. */
    readonly error: string | null;
}

const HEX_PATTERN = /^#([0-9a-f]{3,8})$/i;
const FUNCTION_PATTERN = /^([a-z]+)\(([^()]*)\)$/i;

function parseAngle(token: string): number | null {
    const match = /^([+-]?(?:\d+\.?\d*|\.\d+))(deg|grad|rad|turn)?$/i.exec(token);
    if (match === null) return null;
    const magnitude = Number(match[1]);
    if (!Number.isFinite(magnitude)) return null;
    switch ((match[2] ?? "deg").toLowerCase()) {
        case "grad":
            return (magnitude * 360) / 400;
        case "rad":
            return (magnitude * 180) / Math.PI;
        case "turn":
            return magnitude * 360;
        default:
            return magnitude;
    }
}

interface ScalarToken {
    readonly value: number;
    readonly percentage: boolean;
}

function parseScalar(token: string): ScalarToken | null {
    if (token.toLowerCase() === "none") return { value: 0, percentage: false };
    const match = /^([+-]?(?:\d+\.?\d*|\.\d+))(%)?$/.exec(token);
    if (match === null) return null;
    const magnitude = Number(match[1]);
    if (!Number.isFinite(magnitude)) return null;
    return { value: magnitude, percentage: match[2] === "%" };
}

/** Split `a b c / d` or `a, b, c, d` into components plus an optional alpha token. */
function splitArguments(body: string): { components: string[]; alpha: string | null } {
    const slash = body.indexOf("/");
    if (slash >= 0) {
        const head = body.slice(0, slash).trim();
        const tail = body.slice(slash + 1).trim();
        return { components: head.split(/[\s,]+/).filter(Boolean), alpha: tail === "" ? null : tail };
    }
    const tokens = body.split(/[\s,]+/).filter(Boolean);
    if (tokens.length > 3) {
        const alpha = tokens[tokens.length - 1] ?? null;
        return { components: tokens.slice(0, tokens.length - 1), alpha };
    }
    return { components: tokens, alpha: null };
}

function parseAlpha(token: string | null): number | null {
    if (token === null) return 1;
    const scalar = parseScalar(token);
    if (scalar === null) return null;
    const value = scalar.percentage ? scalar.value / 100 : scalar.value;
    return Math.min(1, Math.max(0, value));
}

function expandHex(digits: string): { rgb: Triple; alpha: number } | null {
    const expand = (pair: string): number => parseInt(pair, 16) / 255;
    if (digits.length === 3 || digits.length === 4) {
        const parts = digits.split("").map((digit) => `${digit}${digit}`);
        const r = parts[0];
        const g = parts[1];
        const b = parts[2];
        if (r === undefined || g === undefined || b === undefined) return null;
        const a = parts[3];
        return { rgb: [expand(r), expand(g), expand(b)], alpha: a === undefined ? 1 : expand(a) };
    }
    if (digits.length === 6 || digits.length === 8) {
        const r = digits.slice(0, 2);
        const g = digits.slice(2, 4);
        const b = digits.slice(4, 6);
        const a = digits.length === 8 ? digits.slice(6, 8) : null;
        return { rgb: [expand(r), expand(g), expand(b)], alpha: a === null ? 1 : expand(a) };
    }
    return null;
}

/**
 * Read any supported representation.
 *
 * Nothing here touches the DOM or asks the browser to parse a colour, so the same
 * text produces the same value regardless of which engine is running, and a value
 * the visitor typed is never reinterpreted by a stylesheet.
 */
export function parseColor(input: string): ParseResult {
    const text = input.trim();
    if (text === "") return { value: null, id: null, error: "empty" };

    const named = lookupNamedColor(text);
    if (named !== null) {
        return { value: srgb(named.rgb[0], named.rgb[1], named.rgb[2], named.alpha), id: "named", error: null };
    }

    const hexMatch = HEX_PATTERN.exec(text);
    if (hexMatch !== null) {
        const digits = hexMatch[1] ?? "";
        const expanded = expandHex(digits);
        if (expanded === null) return { value: null, id: null, error: "hex-length" };
        return {
            value: srgb(expanded.rgb[0], expanded.rgb[1], expanded.rgb[2], expanded.alpha),
            id: digits.length === 4 || digits.length === 8 ? "hex8" : "hex",
            error: null,
        };
    }

    const functionMatch = FUNCTION_PATTERN.exec(text);
    if (functionMatch === null) return { value: null, id: null, error: "unrecognised" };

    const name = (functionMatch[1] ?? "").toLowerCase();
    const { components, alpha: alphaToken } = splitArguments(functionMatch[2] ?? "");
    const alpha = parseAlpha(alphaToken);
    if (alpha === null) return { value: null, id: null, error: "alpha" };

    const required = name === "cmyk" ? 4 : name === "color" ? 4 : 3;
    if (components.length !== required) return { value: null, id: null, error: "component-count" };

    const first = components[0] ?? "";
    const second = components[1] ?? "";
    const third = components[2] ?? "";

    switch (name) {
        case "rgb":
        case "rgba": {
            const parts = [first, second, third].map(parseScalar);
            if (parts.some((part) => part === null)) return { value: null, id: null, error: "component" };
            const channels = parts.map((part) => {
                const scalar = part as ScalarToken;
                return scalar.percentage ? scalar.value / 100 : scalar.value / 255;
            });
            return {
                value: srgb(channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0, alpha),
                id: name === "rgba" || alphaToken !== null ? "rgba" : "rgb",
                error: null,
            };
        }
        case "hsl":
        case "hsla":
        case "hsv":
        case "hsb":
        case "hwb": {
            const hue = parseAngle(first) ?? (first.toLowerCase() === "none" ? 0 : null);
            const b = parseScalar(second);
            const c = parseScalar(third);
            if (hue === null || b === null || c === null) {
                return { value: null, id: null, error: "component" };
            }
            const space: ColorSpace = name === "hwb" ? "hwb" : name === "hsl" || name === "hsla" ? "hsl" : "hsv";
            const id: RepresentationId =
                space === "hwb" ? "hwb" : space === "hsv" ? "hsv" : name === "hsla" || alphaToken !== null ? "hsla" : "hsl";
            return { value: color(space, [hue, b.value, c.value], alpha), id, error: null };
        }
        case "lab":
        case "oklab": {
            const l = parseScalar(first);
            const a = parseScalar(second);
            const b = parseScalar(third);
            if (l === null || a === null || b === null) {
                return { value: null, id: null, error: "component" };
            }
            // CIELAB lightness is 0..100 whether written as a number or a percentage.
            // OKLab lightness is 0..1 as a number and 0..100% as a percentage.
            const lightness = name === "lab" || !l.percentage ? l.value : l.value / 100;
            const axisScale = name === "lab" ? 125 : 0.4;
            const axis = (token: ScalarToken): number =>
                token.percentage ? (token.value / 100) * axisScale : token.value;
            return {
                value: color(name, [lightness, axis(a), axis(b)], alpha),
                id: name,
                error: null,
            };
        }
        case "lch":
        case "oklch": {
            const l = parseScalar(first);
            const c = parseScalar(second);
            const hue = parseAngle(third) ?? (third.toLowerCase() === "none" ? 0 : null);
            if (l === null || c === null || hue === null) {
                return { value: null, id: null, error: "component" };
            }
            const lightness = name === "lch" ? l.value : l.percentage ? l.value / 100 : l.value;
            const chromaScale = name === "lch" ? 150 : 0.4;
            const chroma = c.percentage ? (c.value / 100) * chromaScale : c.value;
            return { value: color(name, [lightness, chroma, hue], alpha), id: name, error: null };
        }
        case "cmyk": {
            const parts = components.map(parseScalar);
            if (parts.some((part) => part === null)) return { value: null, id: null, error: "component" };
            const channels = parts.map((part) => {
                const scalar = part as ScalarToken;
                return Math.min(1, Math.max(0, scalar.percentage ? scalar.value / 100 : scalar.value));
            });
            const rgb = naiveCmykToSrgb([
                channels[0] ?? 0,
                channels[1] ?? 0,
                channels[2] ?? 0,
                channels[3] ?? 0,
            ]);
            return { value: srgb(rgb[0], rgb[1], rgb[2], alpha), id: "cmyk", error: null };
        }
        case "color": {
            // `color(srgb r g b / a)`. Only the sRGB predefined space is accepted, because
            // claiming display-p3 support while converting through sRGB would be a lie.
            const space = first.toLowerCase();
            if (space !== "srgb") return { value: null, id: null, error: "color-space" };
            const parts = [second, third, components[3] ?? ""].map(parseScalar);
            if (parts.some((part) => part === null)) return { value: null, id: null, error: "component" };
            const channels = parts.map((part) => {
                const scalar = part as ScalarToken;
                return scalar.percentage ? scalar.value / 100 : scalar.value;
            });
            return {
                value: srgb(channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0, alpha),
                id: "rgb",
                error: null,
            };
        }
        default:
            return { value: null, id: null, error: "unrecognised" };
    }
}

/** Component labels and bounds for a space, re-exported so the picker has one import. */
export { componentsOf };
