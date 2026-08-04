/**
 * The typography spec, tested where it can lie.
 *
 * Three things here are worth more than the rest. The first is that a fully-populated spec
 * produces the exact declarations somebody would write by hand — asserted as whole strings,
 * because "contains bold somewhere" is a test that passes for a stylesheet that renders
 * nothing. The second is capability reporting, whose whole purpose is that it must not invent
 * a failure: no `CSS.supports` at all has to mean "assume it works", and an engine that
 * refuses exactly one declaration has to mark exactly the controls that declaration backs and
 * not one more. The third is the decoration conflict, which is the one place CSS is genuinely
 * narrower than the editor and therefore the one place a silent choice would be a lie.
 */

import { describe, expect, it } from "vitest";
import {
    ASSUMED_SUPPORT_LABEL_KEY,
    BASELINE_SHIFT_FONT_SCALE,
    BOLD_MINIMUM_WEIGHT,
    DEFAULT_TYPOGRAPHY,
    TYPOGRAPHY_PROPERTIES,
    detectTypographyCapabilities,
    mergeTypography,
    resetTypographyProperty,
    typographyCss,
    typographyPropertyLabelKey,
    typographySearchText,
    type CssSupport,
    type TypographyCapabilities,
    type TypographyPropertyId,
    type TypographySpec,
} from "./typographySpec.js";

/** Everything supported, which is what a Chromium with all of this shipped reports. */
const ALL_SUPPORTED: TypographyCapabilities = detectTypographyCapabilities(null);

/** A `CSS.supports` that refuses exactly the declarations named, and accepts the rest. */
function refusing(...refused: readonly string[]): CssSupport {
    return {
        supports: (property: string, value: string) => !refused.includes(`${property}: ${value}`),
    };
}

/**
 * A spec with every decorative property switched on, so one call exercises every branch.
 *
 * Deliberately not superscript: the baseline interaction changes the emitted font size, and
 * it gets its own tests below where the scaling is the point rather than a distraction.
 */
const FULL: TypographySpec = {
    fontFamily: "Segoe UI",
    fontSize: 16,
    fontSizeUnit: "px",
    fontWeight: 500,
    bold: true,
    italic: "oblique",
    obliqueAngle: 12,
    variableAxes: { wght: 620, wdth: 87.5 },
    underline: "solid",
    underlineColor: "#ff0000",
    strikethrough: "single",
    overline: true,
    capitalization: "uppercase",
    smallCaps: true,
    baselineShift: "none",
    baselineOffset: 0,
    textColor: "#101010",
    highlight: "#ffff00",
    outlineWidth: 1,
    outlineColor: "#000000",
    shadow: { offsetX: 2, offsetY: 3, blur: 4, color: "#333333" },
    glow: { radius: 6, color: "#00ffff" },
    letterSpacing: 0.5,
    wordSpacing: 2,
    lineHeight: 1.5,
    textDirection: "rtl",
    textAlign: "justify",
};

describe("the property list", () => {
    it("names every key of the spec exactly once", () => {
        const keys = Object.keys(DEFAULT_TYPOGRAPHY).sort();
        expect([...TYPOGRAPHY_PROPERTIES].sort()).toEqual(keys);
        expect(new Set(TYPOGRAPHY_PROPERTIES).size).toBe(TYPOGRAPHY_PROPERTIES.length);
    });

    it("starts with the face, which is what a font dialog puts first", () => {
        expect(TYPOGRAPHY_PROPERTIES[0]).toBe("fontFamily");
        expect(TYPOGRAPHY_PROPERTIES[1]).toBe("fontSize");
    });

    it("gives every property an i18n key and searchable words", () => {
        for (const id of TYPOGRAPHY_PROPERTIES) {
            expect(typographyPropertyLabelKey(id)).toBe(`appearance.type.${id}`);
            expect(typographySearchText(id).length).toBeGreaterThan(0);
        }
    });

    it("puts the words a user would actually type into the search text", () => {
        expect(typographySearchText("letterSpacing")).toContain("tracking");
        expect(typographySearchText("capitalization")).toContain("all caps");
        expect(typographySearchText("baselineShift")).toContain("superscript");
    });
});

describe("the defaults", () => {
    it("are Material's body role, with every decoration off", () => {
        expect(DEFAULT_TYPOGRAPHY.fontFamily).toBe("Roboto");
        expect(DEFAULT_TYPOGRAPHY.fontSize).toBe(14);
        expect(DEFAULT_TYPOGRAPHY.fontSizeUnit).toBe("px");
        expect(DEFAULT_TYPOGRAPHY.fontWeight).toBe(400);
        expect(DEFAULT_TYPOGRAPHY.bold).toBe(false);
        expect(DEFAULT_TYPOGRAPHY.underline).toBe("none");
        expect(DEFAULT_TYPOGRAPHY.strikethrough).toBe("none");
        expect(DEFAULT_TYPOGRAPHY.lineHeight).toBe(1.5);
    });

    it("render as a stack, a size, a weight and a paragraph and nothing else", () => {
        const { style, unsupported, notes } = typographyCss(DEFAULT_TYPOGRAPHY, ALL_SUPPORTED, "Roboto, sans-serif");
        expect(style).toEqual({
            "font-family": "Roboto, sans-serif",
            "font-size": "14px",
            "font-weight": "400",
            "line-height": "1.5",
            direction: "ltr",
            "text-align": "start",
        });
        expect(unsupported).toEqual([]);
        expect(notes).toEqual([]);
    });
});

describe("turning a full spec into CSS", () => {
    const { style, unsupported, notes } = typographyCss(FULL, ALL_SUPPORTED, '"Segoe UI", Roboto, sans-serif');

    it("uses the stack it was handed rather than the bare family name", () => {
        expect(style["font-family"]).toBe('"Segoe UI", Roboto, sans-serif');
    });

    it("writes the size with its unit", () => {
        expect(style["font-size"]).toBe("16px");
    });

    it("lets the bold toggle raise a lighter weight to 700", () => {
        expect(style["font-weight"]).toBe("700");
        expect(BOLD_MINIMUM_WEIGHT).toBe(700);
    });

    it("keeps a numeric weight that is already heavier than bold", () => {
        const heavy = typographyCss({ ...FULL, fontWeight: 800 }, ALL_SUPPORTED, "x");
        expect(heavy.style["font-weight"]).toBe("800");
    });

    it("leaves the weight alone when the bold toggle is off", () => {
        const plain = typographyCss({ ...FULL, bold: false }, ALL_SUPPORTED, "x");
        expect(plain.style["font-weight"]).toBe("500");
    });

    it("writes an oblique with its angle", () => {
        expect(style["font-style"]).toBe("oblique 12deg");
    });

    it("writes a true italic without one", () => {
        const italic = typographyCss({ ...FULL, italic: "italic" }, ALL_SUPPORTED, "x");
        expect(italic.style["font-style"]).toBe("italic");
    });

    it("sorts variable axes by tag so the declaration is stable", () => {
        expect(style["font-variation-settings"]).toBe('"wdth" 87.5, "wght" 620');
    });

    it("orders the decoration lines underline, line-through, overline", () => {
        expect(style["text-decoration-line"]).toBe("underline line-through overline");
        expect(style["text-decoration-style"]).toBe("solid");
        expect(style["text-decoration-color"]).toBe("#ff0000");
    });

    it("maps capitalization onto text-transform and small caps onto font-variant-caps", () => {
        expect(style["text-transform"]).toBe("uppercase");
        expect(style["font-variant-caps"]).toBe("small-caps");
    });

    it("draws the outline with -webkit-text-stroke", () => {
        expect(style["-webkit-text-stroke"]).toBe("1px #000000");
    });

    it("composes the shadow and the glow into one text-shadow, shadow first", () => {
        expect(style["text-shadow"]).toBe("2px 3px 4px #333333, 0 0 6px #00ffff");
    });

    it("emits only the shadow when there is no glow, and only the glow when there is no shadow", () => {
        const shadowOnly = typographyCss({ ...FULL, glow: { radius: 0, color: "" } }, ALL_SUPPORTED, "x");
        expect(shadowOnly.style["text-shadow"]).toBe("2px 3px 4px #333333");

        const glowOnly = typographyCss(
            { ...FULL, shadow: { offsetX: 2, offsetY: 3, blur: 4, color: "" } },
            ALL_SUPPORTED,
            "x",
        );
        expect(glowOnly.style["text-shadow"]).toBe("0 0 6px #00ffff");
    });

    it("writes the spacings in px and the line height unitless", () => {
        expect(style["letter-spacing"]).toBe("0.5px");
        expect(style["word-spacing"]).toBe("2px");
        expect(style["line-height"]).toBe("1.5");
    });

    it("writes the colour and the highlight", () => {
        expect(style.color).toBe("#101010");
        expect(style["background-color"]).toBe("#ffff00");
    });

    it("omits the highlight entirely when it is empty rather than writing a blank value", () => {
        const noHighlight = typographyCss({ ...FULL, highlight: "" }, ALL_SUPPORTED, "x");
        expect("background-color" in noHighlight.style).toBe(false);
    });

    it("maps the paragraph settings", () => {
        expect(style.direction).toBe("rtl");
        expect(style["text-align"]).toBe("justify");
    });

    it("does not shift the baseline when nothing asked it to", () => {
        expect("vertical-align" in style).toBe(false);
    });

    it("reports nothing unsupported and, apart from the shared colour, nothing surprising", () => {
        expect(unsupported).toEqual([]);
        expect(notes.map((note) => note.code)).toEqual(["decoration-color-shared"]);
    });
});

describe("the baseline", () => {
    it("raises a superscript and shrinks it, because a full-size raised run looks broken", () => {
        const { style } = typographyCss({ ...FULL, baselineShift: "superscript" }, ALL_SUPPORTED, "x");
        expect(style["vertical-align"]).toBe("super");
        expect(style["font-size"]).toBe(`${16 * BASELINE_SHIFT_FONT_SCALE}px`);
        expect(style["font-size"]).toBe("12px");
    });

    it("lowers a subscript the same way", () => {
        const { style } = typographyCss({ ...FULL, baselineShift: "subscript" }, ALL_SUPPORTED, "x");
        expect(style["vertical-align"]).toBe("sub");
    });

    it("rounds the shrunken size to two decimals rather than emitting float noise", () => {
        const { style } = typographyCss(
            { ...FULL, fontSize: 14, baselineShift: "superscript" },
            ALL_SUPPORTED,
            "x",
        );
        expect(style["font-size"]).toBe("10.5px");
    });

    it("uses vertical-align in px for a manual offset when there is no shift", () => {
        const { style, notes } = typographyCss({ ...FULL, baselineOffset: 3 }, ALL_SUPPORTED, "x");
        expect(style["vertical-align"]).toBe("3px");
        expect(style["font-size"]).toBe("16px");
        expect(notes.some((note) => note.code === "baseline-offset-ignored")).toBe(false);
    });

    it("says so rather than silently dropping an offset set alongside a shift", () => {
        const { style, notes } = typographyCss(
            { ...FULL, baselineShift: "superscript", baselineOffset: 3 },
            ALL_SUPPORTED,
            "x",
        );
        expect(style["vertical-align"]).toBe("super");
        const note = notes.find((candidate) => candidate.code === "baseline-offset-ignored");
        expect(note?.property).toBe("baselineOffset");
        expect(note?.message).toContain("vertical-align");
    });
});

/*
 * CSS draws every decoration line in one style. The documented resolution is: the underline's
 * style wins, every other line inherits it, and each line that wanted something else is named
 * in a note. The value stays in the spec either way, so the control keeps showing what the
 * user chose and the note explains what the preview is actually drawing.
 */
describe("the one style CSS has for three decoration lines", () => {
    it("draws a double strikethrough wavy under a wavy underline, and names the loser", () => {
        const { style, notes } = typographyCss(
            { ...FULL, underline: "wavy", strikethrough: "double", overline: false },
            ALL_SUPPORTED,
            "x",
        );
        expect(style["text-decoration-line"]).toBe("underline line-through");
        expect(style["text-decoration-style"]).toBe("wavy");

        const conflict = notes.find((note) => note.code === "decoration-style-conflict");
        expect(conflict?.property).toBe("strikethrough");
        expect(conflict?.message).toContain("wavy");
        expect(conflict?.message).toContain("double");
    });

    it("lets the strikethrough choose the style when there is no underline to lose to", () => {
        const { style, notes } = typographyCss(
            { ...FULL, underline: "none", strikethrough: "double", overline: false },
            ALL_SUPPORTED,
            "x",
        );
        expect(style["text-decoration-line"]).toBe("line-through");
        expect(style["text-decoration-style"]).toBe("double");
        expect(notes.filter((note) => note.code === "decoration-style-conflict")).toEqual([]);
    });

    it("notes the overline too when the underline drags it away from solid", () => {
        const { notes } = typographyCss(
            { ...FULL, underline: "dotted", strikethrough: "none", overline: true },
            ALL_SUPPORTED,
            "x",
        );
        const conflicts = notes.filter((note) => note.code === "decoration-style-conflict");
        expect(conflicts.map((note) => note.property)).toEqual(["overline"]);
    });

    it("says nothing when every line wanted the same style anyway", () => {
        const { notes } = typographyCss(
            { ...FULL, underline: "solid", strikethrough: "single", overline: true, underlineColor: "" },
            ALL_SUPPORTED,
            "x",
        );
        expect(notes).toEqual([]);
    });

    it("warns that one decoration colour paints all the lines, but only when there are several", () => {
        const shared = typographyCss({ ...FULL, strikethrough: "none", overline: false }, ALL_SUPPORTED, "x");
        expect(shared.style["text-decoration-color"]).toBe("#ff0000");
        expect(shared.notes).toEqual([]);

        const { notes } = typographyCss({ ...FULL, overline: false }, ALL_SUPPORTED, "x");
        const note = notes.find((candidate) => candidate.code === "decoration-color-shared");
        expect(note?.property).toBe("underlineColor");
    });
});

describe("capability detection", () => {
    it("assumes everything works when there is no CSS.supports to ask", () => {
        const capabilities = detectTypographyCapabilities(null);
        for (const id of TYPOGRAPHY_PROPERTIES) {
            expect(capabilities[id].supported).toBe(true);
            expect(capabilities[id].reason).toBe("");
        }
    });

    it("gives the caller a key for saying that it assumed", () => {
        expect(ASSUMED_SUPPORT_LABEL_KEY).toBe("appearance.type.assumedSupport");
    });

    it("marks exactly the controls a refused declaration backs, and nothing else", () => {
        const capabilities = detectTypographyCapabilities(refusing('font-variation-settings: "wght" 700'));
        const refused = TYPOGRAPHY_PROPERTIES.filter((id) => !capabilities[id].supported);
        expect(refused).toEqual(["variableAxes"]);
    });

    it("names the declaration the engine refused, in one plain sentence", () => {
        const capabilities = detectTypographyCapabilities(refusing("text-decoration-style: wavy"));
        expect(capabilities.underline.supported).toBe(false);
        expect(capabilities.underline.reason).toContain("text-decoration-style: wavy");
        expect(capabilities.underline.reason.endsWith(".")).toBe(true);
        expect(capabilities.overline.supported).toBe(true);
        expect(capabilities.overline.reason).toBe("");
    });

    it("marks both properties that share one declaration", () => {
        const stroke = detectTypographyCapabilities(refusing("-webkit-text-stroke: 1px #000000"));
        expect(TYPOGRAPHY_PROPERTIES.filter((id) => !stroke[id].supported)).toEqual([
            "outlineWidth",
            "outlineColor",
        ]);

        const shadow = detectTypographyCapabilities(refusing("text-shadow: 0 0 2px #000000"));
        expect(TYPOGRAPHY_PROPERTIES.filter((id) => !shadow[id].supported)).toEqual(["shadow", "glow"]);
    });

    it("assumes support rather than inventing a failure when supports() itself throws", () => {
        const capabilities = detectTypographyCapabilities({
            supports: () => {
                throw new Error("no");
            },
        });
        for (const id of TYPOGRAPHY_PROPERTIES) expect(capabilities[id].supported).toBe(true);
    });
});

describe("a property the engine refuses", () => {
    const capabilities = detectTypographyCapabilities(refusing('font-variation-settings: "wght" 700'));
    const { style, unsupported } = typographyCss(FULL, capabilities, "x");

    it("emits no declaration for it", () => {
        expect("font-variation-settings" in style).toBe(false);
    });

    it("is listed so the editor can explain the still-visible control", () => {
        expect(unsupported).toEqual(["variableAxes"]);
    });

    it("keeps its value in the spec, so a newer engine renders it again untouched", () => {
        expect(FULL.variableAxes).toEqual({ wght: 620, wdth: 87.5 });
        const better = typographyCss(FULL, ALL_SUPPORTED, "x");
        expect(better.style["font-variation-settings"]).toBe('"wdth" 87.5, "wght" 620');
    });

    it("takes the whole decoration line with it only for the line that was refused", () => {
        const noStrike = detectTypographyCapabilities(refusing("text-decoration-style: double"));
        const result = typographyCss(FULL, noStrike, "x");
        expect(result.style["text-decoration-line"]).toBe("underline overline");
        expect(result.unsupported).toEqual(["strikethrough"]);
    });

    it("lists the refusals in editor order, not in probe order", () => {
        const many = detectTypographyCapabilities(
            refusing("letter-spacing: 0.5px", "font-weight: 700", "text-transform: uppercase"),
        );
        const result = typographyCss(FULL, many, "x");
        expect(result.unsupported).toEqual(["fontWeight", "capitalization", "letterSpacing"]);
    });

    it("drops the bold toggle back to the plain weight when only synthesis is refused", () => {
        const noSynthesis = detectTypographyCapabilities(refusing("font-synthesis: weight"));
        const result = typographyCss(FULL, noSynthesis, "x");
        expect(result.style["font-weight"]).toBe("500");
        expect(result.unsupported).toEqual(["bold"]);
    });
});

describe("layering overrides", () => {
    it("lets a later layer win", () => {
        const merged = mergeTypography(DEFAULT_TYPOGRAPHY, { fontSize: 18 }, { fontSize: 22 });
        expect(merged.fontSize).toBe(22);
    });

    it("never lets an absent key overwrite an inherited value", () => {
        const merged = mergeTypography(DEFAULT_TYPOGRAPHY, { fontSize: 18, bold: true }, { fontWeight: 300 });
        expect(merged.fontSize).toBe(18);
        expect(merged.bold).toBe(true);
        expect(merged.fontWeight).toBe(300);
    });

    /*
     * `exactOptionalPropertyTypes` stops a typed caller writing this, which is the point of
     * having it on. A record parsed from a settings file is not a typed caller, and JSON that
     * has been round-tripped through an older build arrives with explicit nulls turning into
     * undefined keys - so the runtime guard has to hold even though the compiler would have
     * caught it. Hence the cast.
     */
    it("treats an explicit undefined the same as an absent key", () => {
        const erased = { fontSize: undefined } as unknown as Partial<TypographySpec>;
        const merged = mergeTypography(DEFAULT_TYPOGRAPHY, { fontSize: 18 }, erased);
        expect(merged.fontSize).toBe(18);
    });

    it("merges variable axes rather than replacing the whole record", () => {
        const merged = mergeTypography(
            { ...DEFAULT_TYPOGRAPHY, variableAxes: { wght: 400, opsz: 14 } },
            { variableAxes: { wdth: 90 } },
            { variableAxes: { wght: 700 } },
        );
        expect(merged.variableAxes).toEqual({ wght: 700, opsz: 14, wdth: 90 });
    });

    /*
     * A well-typed layer always carries a complete shadow, so this only differs from wholesale
     * replacement for a half-written record read off disk - which is exactly the case the deep
     * merge exists for, and the only way to write the test. The cast stands in for JSON.
     */
    it("keeps the fields a partly-written shadow or glow did not mention", () => {
        const layer = { shadow: { blur: 9 }, glow: { radius: 4 } } as Partial<TypographySpec>;
        const merged = mergeTypography(
            {
                ...DEFAULT_TYPOGRAPHY,
                shadow: { offsetX: 1, offsetY: 2, blur: 3, color: "#000" },
                glow: { radius: 1, color: "#fff" },
            },
            layer,
        );
        expect(merged.shadow).toEqual({ offsetX: 1, offsetY: 2, blur: 9, color: "#000" });
        expect(merged.glow).toEqual({ radius: 4, color: "#fff" });
    });

    it("replaces a complete shadow wholesale, which is what a typed layer supplies", () => {
        const merged = mergeTypography(DEFAULT_TYPOGRAPHY, {
            shadow: { offsetX: 5, offsetY: 5, blur: 5, color: "#abc" },
        });
        expect(merged.shadow).toEqual({ offsetX: 5, offsetY: 5, blur: 5, color: "#abc" });
    });

    it("mutates neither the base nor the layers, and shares no nested reference", () => {
        const base: TypographySpec = { ...DEFAULT_TYPOGRAPHY, variableAxes: { wght: 400 } };
        const layer: Partial<TypographySpec> = { variableAxes: { wdth: 90 }, fontSize: 20 };
        const merged = mergeTypography(base, layer);

        expect(base.variableAxes).toEqual({ wght: 400 });
        expect(base.fontSize).toBe(DEFAULT_TYPOGRAPHY.fontSize);
        expect(layer.variableAxes).toEqual({ wdth: 90 });
        expect(merged.variableAxes).not.toBe(base.variableAxes);
        expect(merged.shadow).not.toBe(base.shadow);
        expect(merged.glow).not.toBe(base.glow);
    });

    it("returns a complete spec even with no layers at all", () => {
        const merged = mergeTypography(DEFAULT_TYPOGRAPHY);
        expect(merged).toEqual(DEFAULT_TYPOGRAPHY);
        expect(merged).not.toBe(DEFAULT_TYPOGRAPHY);
    });
});

describe("resetting one property", () => {
    it("removes the key rather than writing the default back", () => {
        const overrides: Partial<TypographySpec> = { fontSize: 20, bold: true };
        const next = resetTypographyProperty(overrides, "fontSize");
        expect("fontSize" in next).toBe(false);
        expect(next.bold).toBe(true);
    });

    it("does not mutate what it was given", () => {
        const overrides: Partial<TypographySpec> = { fontSize: 20 };
        const next = resetTypographyProperty(overrides, "fontSize");
        expect(overrides.fontSize).toBe(20);
        expect(next).not.toBe(overrides);
    });

    it("is a no-op for a property that had no override", () => {
        const overrides: Partial<TypographySpec> = { fontSize: 20 };
        expect(resetTypographyProperty(overrides, "highlight")).toEqual({ fontSize: 20 });
    });

    it("lets the base show through again once the override is gone", () => {
        const overrides: Partial<TypographySpec> = { fontSize: 20 };
        const cleared: TypographyPropertyId = "fontSize";
        expect(mergeTypography(DEFAULT_TYPOGRAPHY, resetTypographyProperty(overrides, cleared)).fontSize).toBe(
            DEFAULT_TYPOGRAPHY.fontSize,
        );
    });
});
