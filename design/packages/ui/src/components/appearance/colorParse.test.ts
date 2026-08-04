/**
 * Reading colours the way users actually write them.
 *
 * The cases here are not invented: they are the shapes that arrive when somebody pastes into
 * a translator. A hex without its hash, a legacy `rgba()` with commas from an older
 * stylesheet, a modern `rgb()` with a slash from a browser's dev tools, an `oklch()` from a
 * design token file, a keyword typed from memory, `cmyk()` in the percentages every print
 * tool uses. A parser that handled only its own output would fail every one of them.
 *
 * The negative cases matter at least as much. The one behaviour this parser must never have
 * is answering black to a typo: a picker that did would overwrite a colour the user already
 * had with one they never chose, and they would discover it somewhere else entirely.
 */

import { describe, expect, it } from "vitest";

import { parseColor, parseHex, type ColorParseResult } from "./colorParse.js";
import { rgb, type Rgb } from "./colorSpaces.js";

function parsed(input: string): Rgb {
    const result: ColorParseResult = parseColor(input);
    if (!result.ok) throw new Error(`expected ${input} to parse, got ${result.error}`);
    return result.value.color;
}

function expectColor(input: string, expected: Rgb, precision = 5): void {
    const color = parsed(input);
    expect(color.r).toBeCloseTo(expected.r, precision);
    expect(color.g).toBeCloseTo(expected.g, precision);
    expect(color.b).toBeCloseTo(expected.b, precision);
    expect(color.alpha).toBeCloseTo(expected.alpha, precision);
}

describe("hexadecimal", () => {
    it("reads all four lengths, with the hash optional", () => {
        expectColor("#ff0000", rgb(1, 0, 0));
        expectColor("#f00", rgb(1, 0, 0));
        expectColor("ff0000", rgb(1, 0, 0));
        expectColor("#FF0000", rgb(1, 0, 0));
    });

    it("carries alpha through the four-digit and eight-digit forms", () => {
        expectColor("#ff000080", rgb(1, 0, 0, 128 / 255));
        expectColor("#f008", rgb(1, 0, 0, 136 / 255));
    });

    it("expands a short digit by repetition, not by padding with zero", () => {
        // `#abc` is `#aabbcc`. Padding instead would give `#a0b0c0`, a visibly different
        // colour, and the mistake is invisible until somebody compares two swatches.
        expectColor("#abc", rgb(0xaa / 255, 0xbb / 255, 0xcc / 255));
    });

    it("refuses a length that is not a colour rather than reading part of it", () => {
        expect(parseHex("#ff00")).not.toBeNull();
        expect(parseHex("#ff000")).toBeNull();
        expect(parseHex("#gg0000")).toBeNull();
        expect(parseColor("#ff000")).toEqual({ ok: false, error: "bad-hex", input: "#ff000" });
    });
});

describe("keywords", () => {
    it("reads the CSS names, case-insensitively", () => {
        expectColor("red", rgb(1, 0, 0));
        expectColor("RebeccaPurple", rgb(0x66 / 255, 0x33 / 255, 0x99 / 255));
    });

    it("reads transparent as a zero alpha rather than as a hue", () => {
        expectColor("transparent", rgb(0, 0, 0, 0));
    });

    it("names the failure for a word that is not a colour, instead of guessing", () => {
        const result = parseColor("chartruse");
        expect(result).toEqual({ ok: false, error: "unknown-keyword", input: "chartruse" });
    });

    it("prefers the keyword over an accidental hexadecimal reading", () => {
        // `beef` is four hexadecimal digits and not a keyword; `faded` is neither. What must
        // never happen is a real keyword losing to a hex reading, so the word is tried first.
        expect(parseColor("red").ok).toBe(true);
        expect(parsed("red")).toEqual(rgb(1, 0, 0));
        expect(parseColor("beef").ok).toBe(false);
    });
});

describe("the sRGB functional notations", () => {
    it("reads both the legacy comma form and the modern slash form", () => {
        expectColor("rgb(255, 0, 0)", rgb(1, 0, 0));
        expectColor("rgb(255 0 0)", rgb(1, 0, 0));
        expectColor("rgba(255, 0, 0, 0.5)", rgb(1, 0, 0, 0.5));
        expectColor("rgb(255 0 0 / 50%)", rgb(1, 0, 0, 0.5));
    });

    it("reads percentage components as well as 0-255 numbers", () => {
        expectColor("rgb(100% 0% 0%)", rgb(1, 0, 0));
    });

    it("reads HSL, HSV and HWB, with every CSS angle unit", () => {
        expectColor("hsl(120 100% 25%)", rgb(0, 0.5, 0));
        expectColor("hsl(120deg 100% 25%)", rgb(0, 0.5, 0));
        expectColor("hsl(0.333333turn 100% 25%)", rgb(0, 0.5, 0), 3);
        expectColor("hsl(133.3333grad 100% 25%)", rgb(0, 0.5, 0), 3);
        expectColor("hsla(0, 100%, 50%, 0.25)", rgb(1, 0, 0, 0.25));
        expectColor("hsv(0 100% 100%)", rgb(1, 0, 0));
        expectColor("hsb(0 100% 50%)", rgb(0.5, 0, 0));
        expectColor("hwb(0 25% 25%)", rgb(0.75, 0.25, 0.25));
    });

    it("reads a negative hue by wrapping rather than by refusing", () => {
        expectColor("hsl(-120 100% 50%)", rgb(0, 0, 1));
    });
});

describe("the device-independent notations", () => {
    it("reads CIELAB and CIELCH against D50", () => {
        expectColor("lab(54.2905% 80.8098 69.8912)", rgb(1, 0, 0), 3);
        expectColor("lab(100% 0 0)", rgb(1, 1, 1), 3);
        expectColor("lch(54.2905% 106.8371 40.8576)", rgb(1, 0, 0), 2);
    });

    it("reads OKLab and OKLCH against D65", () => {
        expectColor("oklab(0.62796 0.22486 0.12585)", rgb(1, 0, 0), 3);
        expectColor("oklch(0.62796 0.25768 29.234)", rgb(1, 0, 0), 3);
    });

    it("keeps a colour that is outside sRGB rather than clamping it on the way in", () => {
        // The single most important behaviour in this file. Clamping here would make the
        // gamut warning impossible to write, because by the time anything could warn, the
        // colour worth warning about would already be gone.
        const wide = parsed("oklch(0.9 0.35 140)");
        expect(wide.g).toBeGreaterThan(1);
    });

    it("reads the missing-component keyword browsers now emit, as a zero", () => {
        // Asserted against the same colour written with an explicit zero rather than against
        // a hand-computed triple, because the claim being made is exactly that `none` and `0`
        // mean the same thing here - not that this particular OKLCH is that particular red.
        expect(parsed("oklch(0.62796 0.25768 none)")).toEqual(parsed("oklch(0.62796 0.25768 0)"));
        expectColor("rgb(none 0 0)", rgb(0, 0, 0));
        expectColor("rgb(255 none none)", rgb(1, 0, 0));
    });
});

describe("CMYK", () => {
    it("reads cmyk() in the percentages every print tool writes", () => {
        expectColor("cmyk(0% 100% 100% 0%)", rgb(1, 0, 0));
        expectColor("cmyk(0 100 100 0)", rgb(1, 0, 0));
    });

    it("reads device-cmyk() in the 0-to-1 numbers CSS defines", () => {
        // The divergence is deliberate and documented: a stylesheet says `device-cmyk(0 1 1 0)`
        // and a print panel says `cmyk(0 100 100 0)`, and both of those are red. Reading
        // either under the other's convention gives a colour nobody asked for.
        expectColor("device-cmyk(0 1 1 0)", rgb(1, 0, 0));
        expectColor("device-cmyk(0% 100% 100% 0%)", rgb(1, 0, 0));
    });

    it("carries alpha", () => {
        expectColor("cmyk(0% 100% 100% 0% / 0.4)", rgb(1, 0, 0, 0.4));
    });
});

describe("failures", () => {
    it("never falls back to black", () => {
        for (const input of ["", "   ", "#ff000", "notacolour", "rgb(1 2)", "rgb(a b c)"]) {
            expect(parseColor(input).ok).toBe(false);
        }
    });

    it("says which kind of failure it was, so the field can explain it", () => {
        expect(parseColor("").ok).toBe(false);
        expect(parseColor("")).toMatchObject({ error: "empty" });
        expect(parseColor("rgb(1 2)")).toMatchObject({ error: "wrong-component-count" });
        expect(parseColor("rgb(1 2 x)")).toMatchObject({ error: "bad-component" });
        expect(parseColor("rgb(1 2 3 / x)")).toMatchObject({ error: "bad-component" });
        expect(parseColor("frobnicate(1 2 3)")).toMatchObject({ error: "unknown-function" });
    });

    it("keeps what the user typed on the failure, so nothing they wrote is thrown away", () => {
        const result = parseColor("  #ff000  ");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.input).toBe("  #ff000  ");
    });

    it("clamps alpha rather than rejecting it, because there is no more-than-opaque", () => {
        expectColor("rgb(255 0 0 / 3)", rgb(1, 0, 0, 1));
        expectColor("rgb(255 0 0 / -1)", rgb(1, 0, 0, 0));
    });
});

describe("what was parsed", () => {
    it("reports the notation it was written in, so the picker can say so", () => {
        const spaces = ["red", "#ff0000", "rgb(255 0 0)", "hsl(0 100% 50%)", "oklch(0.6 0.2 30)"]
            .map((input) => {
                const result = parseColor(input);
                return result.ok ? result.value.space : "failed";
            });

        expect(spaces).toEqual(["named", "hex", "rgb", "hsl", "oklch"]);
    });

    it("keeps the raw input beside the parsed colour", () => {
        const result = parseColor(" Red ");
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.input).toBe(" Red ");
    });
});
