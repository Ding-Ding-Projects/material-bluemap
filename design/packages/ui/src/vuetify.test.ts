// @vitest-environment jsdom

/**
 * The complete Material Design 3 colour system, held to its own claim.
 *
 * Each theme used to name five colours, and every other role a component asked for was
 * answered by Vuetify's grey reference palette - so `outline`, `surface-variant` and the
 * container tiers were not this product's palette at all, and the marker layer derived
 * its own approximations with `color-mix`. The themes now carry the full role set, and
 * this file is what keeps that true: a role dropped from one theme falls back to a grey
 * nobody chose, visibly, in exactly one theme, which is the kind of regression that
 * survives a code review and dies in a test.
 *
 * The contrast pairs are asserted with real WCAG arithmetic rather than by trusting the
 * generator: every `on-X` must read against its `X` at 4.5:1 or better, in all three
 * themes. The contrast theme additionally has to stay what it is for - black surfaces,
 * white text - because a "contrast" theme that drifted toward taste would be a fourth
 * ordinary theme wearing the accessibility label.
 */

import { describe, expect, it } from "vitest";
import { THEME_SCHEMES } from "./vuetify.js";

/** Every role each theme must answer for. One list, so a theme cannot quietly shrink. */
const REQUIRED_ROLES = [
    "primary",
    "on-primary",
    "primary-container",
    "on-primary-container",
    "secondary",
    "on-secondary",
    "secondary-container",
    "on-secondary-container",
    "tertiary",
    "on-tertiary",
    "tertiary-container",
    "on-tertiary-container",
    "error",
    "on-error",
    "error-container",
    "on-error-container",
    "background",
    "on-background",
    "surface",
    "on-surface",
    "surface-dim",
    "surface-bright",
    "surface-light",
    "surface-container-lowest",
    "surface-container-low",
    "surface-container",
    "surface-container-high",
    "surface-container-highest",
    "surface-variant",
    "on-surface-variant",
    "outline",
    "outline-variant",
    "inverse-surface",
    "inverse-on-surface",
    "inverse-primary",
    "surface-tint",
    "scrim",
    "shadow",
] as const;

/** The `on-X` against `X` pairs a reader actually reads, held to WCAG AA for text. */
const CONTRAST_PAIRS: readonly (readonly [string, string])[] = [
    ["primary", "on-primary"],
    ["primary-container", "on-primary-container"],
    ["secondary", "on-secondary"],
    ["secondary-container", "on-secondary-container"],
    ["tertiary", "on-tertiary"],
    ["tertiary-container", "on-tertiary-container"],
    ["error", "on-error"],
    ["error-container", "on-error-container"],
    ["background", "on-background"],
    ["surface", "on-surface"],
    ["surface-variant", "on-surface-variant"],
    ["inverse-surface", "inverse-on-surface"],
];

function colorsOf(theme: "dark" | "light" | "contrast"): Record<string, string> {
    return (THEME_SCHEMES[theme].colors ?? {}) as Record<string, string>;
}

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
    const channel = (offset: number): number => {
        const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio between two #RRGGBB colours. */
function contrastRatio(a: string, b: string): number {
    const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
        number,
        number,
    ];
    return (lighter + 0.05) / (darker + 0.05);
}

const THEMES = ["dark", "light", "contrast"] as const;

describe("every theme carries the complete M3 role set", () => {
    for (const theme of THEMES) {
        it(`${theme}: defines all ${REQUIRED_ROLES.length} roles as real hex colours`, () => {
            const colors = colorsOf(theme);
            for (const role of REQUIRED_ROLES) {
                expect(colors[role], `${theme} is missing the ${role} role`).toBeDefined();
                expect(colors[role], `${theme}'s ${role} is not a hex colour`).toMatch(
                    /^#[0-9A-F]{6}$/i,
                );
            }
        });
    }
});

describe("every on-role reads against its role at WCAG AA or better", () => {
    for (const theme of THEMES) {
        it(`${theme}: all ${CONTRAST_PAIRS.length} reading pairs reach 4.5:1`, () => {
            const colors = colorsOf(theme);
            for (const [base, on] of CONTRAST_PAIRS) {
                const ratio = contrastRatio(colors[base]!, colors[on]!);
                expect(
                    ratio,
                    `${theme}: ${on} (${colors[on]}) on ${base} (${colors[base]}) is ${ratio.toFixed(2)}:1`,
                ).toBeGreaterThanOrEqual(4.5);
            }
        });
    }
});

describe("what must not drift", () => {
    it("keeps the two long-shipped anchors: the blue family's tone 80 and tone 40", () => {
        // These two were the product's palette before the full role set existed; every
        // other role was generated from their family. If either moves, the whole scheme
        // was regenerated from a different seed, which is a decision and not a cleanup.
        expect(colorsOf("dark").primary).toBe("#8FCDFF");
        expect(colorsOf("light").primary).toBe("#00639B");
    });

    it("keeps the contrast theme maximal: black surfaces, white text, at every tier", () => {
        const colors = colorsOf("contrast");
        for (const role of [
            "surface",
            "background",
            "surface-container-lowest",
            "surface-container-low",
            "surface-container",
            "surface-container-high",
            "surface-container-highest",
        ]) {
            expect(colors[role], `contrast ${role} must stay black`).toBe("#000000");
        }
        expect(colors["on-surface"]).toBe("#FFFFFF");
        expect(colors.outline).toBe("#FFFFFF");
        expect(contrastRatio(colors.surface!, colors["on-surface"]!)).toBeCloseTo(21, 0);
    });

    it("marks dark and contrast as dark schemes and light as a light one", () => {
        expect(THEME_SCHEMES.dark.dark).toBe(true);
        expect(THEME_SCHEMES.contrast.dark).toBe(true);
        expect(THEME_SCHEMES.light.dark).toBe(false);
    });
});
