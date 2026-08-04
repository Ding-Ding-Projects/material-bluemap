/**
 * Reading a colour the user typed.
 *
 * The picker is continuous, so nobody has to type anything — but the moment a translator
 * exists, people paste into it, and what they paste comes from wherever they were: a hex
 * from a design file, an `oklch()` from a stylesheet, a `cmyk()` from a print spec, a
 * keyword from memory. A translator that only accepted its own output would be a formatter
 * with extra steps.
 *
 * Two decisions run through the file and are worth stating up front.
 *
 * **A failure names what went wrong, and never guesses.** `parseColor` returns a code rather
 * than a rendered sentence, because this module has no business calling `t()` and because a
 * caller may want to render the same failure differently in a field and in a tooltip. What
 * it never does is fall back to black. A picker that answered "black" to a typo would
 * silently overwrite the colour the user already had with one they never chose, and they
 * would find out later, somewhere else.
 *
 * **Nothing is clamped away on the way in.** `lab(60% 200 -180)` describes a colour no
 * display can show, and it parses, and it stays exactly as far outside the gamut as it was
 * written. The gamut and clipping reports in `colorSpaces` are what tell the user about it;
 * quietly pulling it back into sRGB here would make those reports impossible to write.
 */

import { hexOfName } from "./colorNames.js";
import {
    clamp,
    cmykToRgb,
    hslToRgb,
    hsvToRgb,
    hwbToRgb,
    labToRgb,
    lchToRgb,
    normalizeHue,
    oklabToRgb,
    oklchToRgb,
    rgb,
    type Rgb,
} from "./colorSpaces.js";

/**
 * The notations the translator speaks, in the order the panel lists them.
 *
 * `hex` covers both `#rrggbb` and `#rrggbbaa`; they are one notation with an optional alpha
 * pair rather than two, and splitting them would put two rows in the translator that always
 * agree. The same reasoning collapses `rgb`/`rgba`, `hsl`/`hsla` and the polar pairs.
 */
export const COLOR_SPACES = [
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
] as const;

export type ColorSpaceId = (typeof COLOR_SPACES)[number];

/** Why a string could not be read as a colour. Rendered by the caller, not here. */
export type ColorParseError =
    | "empty"
    | "unknown-keyword"
    | "bad-hex"
    | "unknown-function"
    | "wrong-component-count"
    | "bad-component";

export interface ParsedColor {
    /** The colour itself, unclamped, so an out-of-gamut input survives being read. */
    color: Rgb;
    /** The notation it was written in, so the picker can say "you typed OKLCH". */
    space: ColorSpaceId;
    /** Exactly what the user typed, kept so nothing they wrote is thrown away. */
    input: string;
}

export type ColorParseResult =
    | { ok: true; value: ParsedColor }
    | { ok: false; error: ColorParseError; input: string };

function fail(error: ColorParseError, input: string): ColorParseResult {
    return { ok: false, error, input };
}

/* -------------------------------------------------------------------------- */
/* Component tokens                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What a component token may be worth.
 *
 * `percentReference` is the value 100% stands for in this position, which differs by space
 * and by axis: 100% is 255 in `rgb()`, 100 in `lab()`'s lightness, 125 in its a and b axes,
 * and 0.4 in `oklab()`'s. Passing it in per position is verbose and correct; a single global
 * rule would silently misread three of those four.
 */
interface NumberOptions {
    percentReference: number;
    /** The multiplier applied to a bare number, when it is not already the unit wanted. */
    numberScale: number;
}

/**
 * One numeric component, or null when the token is not a number at all.
 *
 * `none` is CSS Color 4's missing-component keyword and resolves to zero. It is accepted
 * because a value copied out of a modern browser can contain it, and rejecting it would make
 * the translator refuse text the platform itself produced.
 */
function readNumber(token: string, options: NumberOptions): number | null {
    const text = token.trim().toLowerCase();
    if (text === "") return null;
    if (text === "none") return 0;

    if (text.endsWith("%")) {
        const value = Number(text.slice(0, -1));
        return Number.isFinite(value) ? (value / 100) * options.percentReference : null;
    }

    const value = Number(text);
    return Number.isFinite(value) ? value * options.numberScale : null;
}

/** An angle in degrees, honouring the four CSS angle units. A bare number is degrees. */
function readAngle(token: string): number | null {
    const text = token.trim().toLowerCase();
    if (text === "" ) return null;
    if (text === "none") return 0;

    const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(deg|grad|rad|turn)?$/.exec(text);
    if (match === null) return null;

    const value = Number(match[1]);
    if (!Number.isFinite(value)) return null;

    switch (match[2]) {
        case "grad":
            return (value * 360) / 400;
        case "rad":
            return (value * 180) / Math.PI;
        case "turn":
            return value * 360;
        default:
            return value;
    }
}

/** Alpha, as a 0..1 number or a percentage, clamped because there is no super-opaque. */
function readAlpha(token: string | null): number | null {
    if (token === null) return 1;
    const value = readNumber(token, { percentReference: 1, numberScale: 1 });
    return value === null ? null : clamp(value, 0, 1);
}

/**
 * The arguments of a functional notation, with the alpha pulled out however it was written.
 *
 * Both syntaxes are live in the wild and both have to work: the legacy comma form
 * `rgba(255, 0, 0, 0.5)` that every older tool emits, and the modern space-separated form
 * `rgb(255 0 0 / 50%)` that browsers now print. Detecting the slash first and only then
 * splitting on whitespace-or-comma handles both without a syntax flag, and means a mixed
 * form pasted from a half-updated stylesheet still reads.
 */
function splitArguments(body: string): { parts: string[]; alpha: string | null } {
    const slash = body.lastIndexOf("/");
    const head = slash === -1 ? body : body.slice(0, slash);
    const alphaText = slash === -1 ? null : body.slice(slash + 1).trim();

    const parts = head
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter((part) => part !== "");

    return { parts, alpha: alphaText === "" ? null : alphaText };
}

/* -------------------------------------------------------------------------- */
/* Hexadecimal                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `#rgb`, `#rgba`, `#rrggbb` and `#rrggbbaa`, with the hash optional.
 *
 * The hash is optional because a hex is the one notation people habitually paste without it,
 * and the ambiguity that creates is smaller than it looks: `parseColor` tries keywords first,
 * so a word that happens to be spellable in hex digits — there is no CSS keyword that is —
 * would still be read as the keyword.
 */
export function parseHex(input: string): Rgb | null {
    const text = input.trim().replace(/^#/, "").toLowerCase();
    if (!/^[0-9a-f]+$/.test(text)) return null;

    const expand = (pair: string): number => Number.parseInt(pair, 16) / 255;

    if (text.length === 3 || text.length === 4) {
        const [r, g, b, a] = [...text];
        return rgb(
            expand(`${r ?? "0"}${r ?? "0"}`),
            expand(`${g ?? "0"}${g ?? "0"}`),
            expand(`${b ?? "0"}${b ?? "0"}`),
            a === undefined ? 1 : expand(`${a}${a}`),
        );
    }

    if (text.length === 6 || text.length === 8) {
        return rgb(
            expand(text.slice(0, 2)),
            expand(text.slice(2, 4)),
            expand(text.slice(4, 6)),
            text.length === 8 ? expand(text.slice(6, 8)) : 1,
        );
    }

    return null;
}

/* -------------------------------------------------------------------------- */
/* The functional notations                                                   */
/* -------------------------------------------------------------------------- */

/** The three-component-plus-alpha shape every function here shares. */
interface Triple {
    a: number;
    b: number;
    c: number;
    alpha: number;
}

type ComponentReader = (token: string, index: number) => number | null;

function readTriple(
    parts: string[],
    alphaToken: string | null,
    read: ComponentReader,
): Triple | ColorParseError {
    if (parts.length !== 3) return "wrong-component-count";

    const values: number[] = [];
    for (let i = 0; i < 3; i++) {
        const value = read(parts[i] ?? "", i);
        if (value === null) return "bad-component";
        values.push(value);
    }

    const alpha = readAlpha(alphaToken);
    if (alpha === null) return "bad-component";

    return { a: values[0] ?? 0, b: values[1] ?? 0, c: values[2] ?? 0, alpha };
}

/**
 * `rgb()` and `rgba()`.
 *
 * The legacy four-argument comma form puts alpha in the fourth slot rather than after a
 * slash, so it is folded into the slash position before the shared reader sees it. Doing it
 * here rather than in `splitArguments` keeps that helper honest about what it split, and
 * `hsl()` needs exactly the same fold.
 */
function foldLegacyAlpha(parts: string[], alpha: string | null): [string[], string | null] {
    if (alpha === null && parts.length === 4) return [parts.slice(0, 3), parts[3] ?? null];
    return [parts, alpha];
}

/**
 * `cmyk()` counts in percent, `device-cmyk()` counts in CSS's 0..1 numbers.
 *
 * This is a real divergence and it is deliberate. CSS Color 5 defines `device-cmyk()` with
 * bare numbers running 0 to 1, and a value copied from a stylesheet has to mean that. Every
 * print tool and every colour panel a designer has ever used writes CMYK as four
 * percentages, and `cmyk(0 100 100 0)` typed into this field means red, not four hundred
 * percent of everything. Supporting both notations with their own conventions is the only
 * reading under which both sources are interpreted correctly, and the picker labels which
 * one it wrote.
 */
function parseCmykFunction(name: string, parts: string[], alphaToken: string | null): ParsedColor | ColorParseError {
    if (parts.length !== 4) return "wrong-component-count";

    const scale = name === "device-cmyk" ? 100 : 1;
    const values: number[] = [];
    for (let i = 0; i < 4; i++) {
        const value = readNumber(parts[i] ?? "", { percentReference: 100, numberScale: scale });
        if (value === null) return "bad-component";
        values.push(value);
    }

    const alpha = readAlpha(alphaToken);
    if (alpha === null) return "bad-component";

    return {
        color: cmykToRgb({
            c: values[0] ?? 0,
            m: values[1] ?? 0,
            y: values[2] ?? 0,
            k: values[3] ?? 0,
            alpha,
        }),
        space: "cmyk",
        input: "",
    };
}

function parseFunction(name: string, body: string): ParsedColor | ColorParseError {
    const split = splitArguments(body);

    switch (name) {
        case "rgb":
        case "rgba": {
            const [parts, alphaToken] = foldLegacyAlpha(split.parts, split.alpha);
            const triple = readTriple(parts, alphaToken, (token) =>
                readNumber(token, { percentReference: 255, numberScale: 1 }),
            );
            if (typeof triple === "string") return triple;
            return {
                color: rgb(triple.a / 255, triple.b / 255, triple.c / 255, triple.alpha),
                space: "rgb",
                input: "",
            };
        }

        case "hsl":
        case "hsla": {
            const [parts, alphaToken] = foldLegacyAlpha(split.parts, split.alpha);
            const triple = readTriple(parts, alphaToken, (token, index) =>
                index === 0
                    ? readAngle(token)
                    : readNumber(token, { percentReference: 100, numberScale: 1 }),
            );
            if (typeof triple === "string") return triple;
            return {
                color: hslToRgb({ h: triple.a, s: triple.b, l: triple.c, alpha: triple.alpha }),
                space: "hsl",
                input: "",
            };
        }

        case "hsv":
        case "hsb": {
            const [parts, alphaToken] = foldLegacyAlpha(split.parts, split.alpha);
            const triple = readTriple(parts, alphaToken, (token, index) =>
                index === 0
                    ? readAngle(token)
                    : readNumber(token, { percentReference: 100, numberScale: 1 }),
            );
            if (typeof triple === "string") return triple;
            return {
                color: hsvToRgb({ h: triple.a, s: triple.b, v: triple.c, alpha: triple.alpha }),
                space: "hsv",
                input: "",
            };
        }

        case "hwb": {
            const triple = readTriple(split.parts, split.alpha, (token, index) =>
                index === 0
                    ? readAngle(token)
                    : readNumber(token, { percentReference: 100, numberScale: 1 }),
            );
            if (typeof triple === "string") return triple;
            return {
                color: hwbToRgb({ h: triple.a, w: triple.b, b: triple.c, alpha: triple.alpha }),
                space: "hwb",
                input: "",
            };
        }

        case "lab": {
            const triple = readTriple(split.parts, split.alpha, (token, index) =>
                readNumber(token, {
                    percentReference: index === 0 ? 100 : 125,
                    numberScale: 1,
                }),
            );
            if (typeof triple === "string") return triple;
            return {
                color: labToRgb({ l: triple.a, a: triple.b, b: triple.c, alpha: triple.alpha }),
                space: "lab",
                input: "",
            };
        }

        case "lch": {
            const triple = readTriple(split.parts, split.alpha, (token, index) => {
                if (index === 2) return readAngle(token);
                return readNumber(token, {
                    percentReference: index === 0 ? 100 : 150,
                    numberScale: 1,
                });
            });
            if (typeof triple === "string") return triple;
            return {
                color: lchToRgb({ l: triple.a, c: triple.b, h: triple.c, alpha: triple.alpha }),
                space: "lch",
                input: "",
            };
        }

        case "oklab": {
            const triple = readTriple(split.parts, split.alpha, (token, index) =>
                readNumber(token, {
                    percentReference: index === 0 ? 1 : 0.4,
                    numberScale: 1,
                }),
            );
            if (typeof triple === "string") return triple;
            return {
                color: oklabToRgb({ l: triple.a, a: triple.b, b: triple.c, alpha: triple.alpha }),
                space: "oklab",
                input: "",
            };
        }

        case "oklch": {
            const triple = readTriple(split.parts, split.alpha, (token, index) => {
                if (index === 2) return readAngle(token);
                return readNumber(token, {
                    percentReference: index === 0 ? 1 : 0.4,
                    numberScale: 1,
                });
            });
            if (typeof triple === "string") return triple;
            return {
                color: oklchToRgb({
                    l: triple.a,
                    c: triple.b,
                    h: normalizeHue(triple.c),
                    alpha: triple.alpha,
                }),
                space: "oklch",
                input: "",
            };
        }

        case "cmyk":
        case "device-cmyk":
            return parseCmykFunction(name, split.parts, split.alpha);

        default:
            return "unknown-function";
    }
}

/* -------------------------------------------------------------------------- */
/* The entry point                                                            */
/* -------------------------------------------------------------------------- */

const FUNCTIONAL = /^([a-z-]+)\s*\((.*)\)$/s;

/**
 * Read any of the notations the translator speaks.
 *
 * Keywords are tried before hexadecimal so a word never loses to an accidental hex reading,
 * and `transparent` is handled beside them because it is a keyword whose value is an alpha
 * rather than a hue. The order after that does not matter: a functional notation is
 * unambiguous, and anything that is neither a keyword, a hex, nor a function is a syntax
 * error rather than a colour to be guessed at.
 */
export function parseColor(input: string): ColorParseResult {
    const text = input.trim();
    if (text === "") return fail("empty", input);

    const lower = text.toLowerCase();

    if (lower === "transparent") {
        return { ok: true, value: { color: rgb(0, 0, 0, 0), space: "named", input } };
    }

    if (/^[a-z]+$/.test(lower)) {
        const hex = hexOfName(lower);
        if (hex === null) return fail("unknown-keyword", input);
        const color = parseHex(hex);
        return color === null
            ? fail("unknown-keyword", input)
            : { ok: true, value: { color, space: "named", input } };
    }

    const functional = FUNCTIONAL.exec(lower);
    if (functional !== null) {
        const parsed = parseFunction(functional[1] ?? "", functional[2] ?? "");
        return typeof parsed === "string"
            ? fail(parsed, input)
            : { ok: true, value: { ...parsed, input } };
    }

    const hex = parseHex(text);
    if (hex !== null) return { ok: true, value: { color: hex, space: "hex", input } };

    return fail(text.startsWith("#") ? "bad-hex" : "unknown-function", input);
}

/** The i18n key for a parse failure, so the caller renders it without a switch of its own. */
export function colorParseErrorKey(error: ColorParseError): string {
    return `appearance.color.error.${error}`;
}
