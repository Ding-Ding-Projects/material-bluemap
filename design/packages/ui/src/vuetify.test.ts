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

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { COMPONENT_DEFAULTS, THEME_SCHEMES, vuetify } from "./vuetify.js";

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

/**
 * The shape language, held to the same standard as the colour.
 *
 * Colour was the axis that got a token system; shape was the axis every component answered
 * for itself, which is why an app made entirely of M3 colours still read as stock Vuetify.
 * `COMPONENT_DEFAULTS` is the one lever that moves every rounded surface in the product at
 * once, and the failure it guards against is not a crash - it is somebody deleting four
 * lines during a merge and the whole app quietly reverting to Vuetify's 8px corners, which
 * nobody notices in a diff and everybody notices in a screenshot six weeks later.
 *
 * So the intent is asserted by name: pills are pills, containers are large, overlays are
 * extra-large. Reverting to stock has to fail here.
 */
describe("the component defaults carry one deliberate M3 Expressive shape language", () => {
    /** What `createVuetify` actually ended up with, blueprint merged and all. */
    function resolved(): Record<string, Record<string, unknown>> {
        return vuetify.defaults.value as unknown as Record<string, Record<string, unknown>>;
    }

    it("rounds everything a person presses to a full pill", () => {
        for (const component of ["VBtn", "VChip", "VBtnGroup"]) {
            expect(
                resolved()[component]?.rounded,
                `${component} must stay a pill; "xl" is the Vuetify stock value`,
            ).toBe("pill");
        }
    });

    it("keeps a button group's own segments square so only the group's outer edge is a pill", () => {
        // The blueprint sets this and the defaults restate it; a group whose segments each
        // became pills would render as a row of separate-looking buttons.
        expect((resolved().VBtnGroup?.VBtn as Record<string, unknown>).rounded).toBeNull();
    });

    it("gives every container surface the M3 large corner", () => {
        for (const component of [
            "VCard",
            "VSheet",
            "VAlert",
            "VBanner",
            "VSnackbar",
            "VExpansionPanel",
            "VList",
            "VListItem",
        ]) {
            expect(resolved()[component]?.rounded, `${component} must be rounded "lg"`).toBe("lg");
        }
    });

    it("gives overlays the extra-large corner, through the surfaces they actually contain", () => {
        // VDialog and VMenu take no `rounded` prop of their own, so the corner has to be set
        // on the card / sheet / list inside them or it is set on nothing at all.
        for (const overlay of ["VDialog", "VMenu"]) {
            for (const inner of ["VCard", "VSheet", "VList"]) {
                const nested = resolved()[overlay]?.[inner] as Record<string, unknown> | undefined;
                expect(nested?.rounded, `${overlay} > ${inner} must be rounded "xl"`).toBe("xl");
            }
        }
    });

    it("sits fields one step tighter than their container, at the 12px step Vuetify's own scale lacks", () => {
        expect(resolved().VTextField?.rounded).toBe("md");
        expect(resolved().VTextarea?.rounded).toBe("md");
        // "md" is not in Vuetify's radius map; `.rounded-md` exists only because global.scss
        // defines it, so the two have to stay together.
        expect(read("./styles/global.scss")).toMatch(/\.rounded-md\s*\{/);
    });

    it("merges over the md3 blueprint rather than replacing it", () => {
        // `createVuetify` does mergeDeep(blueprint, options). If that ever stopped being
        // true, every field in the app would silently lose its outlined variant.
        expect(resolved().VTextField?.variant).toBe("outlined");
        expect(resolved().VSelect?.variant).toBe("outlined");
        expect(resolved().VList?.prependGap).toBe(16);
    });

    it("exports the same object it installs, so the intent is readable without booting Vuetify", () => {
        expect(COMPONENT_DEFAULTS.VBtn.rounded).toBe("pill");
        expect(COMPONENT_DEFAULTS.VCard.rounded).toBe("lg");
        expect(COMPONENT_DEFAULTS.VDialog.VCard.rounded).toBe("xl");
    });
});

function read(relativePath: string): string {
    return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

/**
 * The same source with its comments removed.
 *
 * Both of these sheets explain themselves at length, and several of those explanations quote
 * the very declarations they exist to warn about - "no rule below adds an `!important`", "a
 * component picks `font-size: 1.5rem`". An assertion about what a stylesheet *does* has to
 * read what it does, or the file is punished for being well documented.
 */
function code(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * The token sheet, read as source.
 *
 * Same reason `App.shellFabClearance.test.ts` reads `App.vue` as text: jsdom computes no
 * layout and resolves no stylesheet, so `getComputedStyle` there would return the empty
 * string whether these tokens are right, wrong or absent. Reading the source is the only
 * assertion available, and it is the right one here anyway - what has to hold is that the
 * names exist and carry the spec's values, which is exactly what the file says.
 *
 * The whole point of the sheet is that it is the single place these numbers live. A token
 * dropped from it does not throw; it makes one `var()` resolve to nothing and one surface
 * fall back to whatever the browser felt like, in one theme, on one screen.
 */
describe("the M3 token sheet publishes the whole system, not only the colour half", () => {
    const source = read("./styles/md3.scss");

    /** The declared value of one custom property, or undefined when it is not declared. */
    function token(name: string): string | undefined {
        const match = source.match(new RegExp(`\\${name}\\s*:\\s*([^;]+);`));
        return match?.[1]?.replace(/\s+/g, " ").trim();
    }

    it("publishes the M3 corner scale at the spec's own steps", () => {
        expect(token("--md-sys-shape-corner-none")).toBe("0px");
        expect(token("--md-sys-shape-corner-xs")).toBe("4px");
        expect(token("--md-sys-shape-corner-sm")).toBe("8px");
        expect(token("--md-sys-shape-corner-md")).toBe("12px");
        expect(token("--md-sys-shape-corner-lg")).toBe("16px");
        expect(token("--md-sys-shape-corner-xl")).toBe("28px");
        // 9999px and not 50%: 50% on a box wider than it is tall is an ellipse.
        expect(token("--md-sys-shape-corner-full")).toBe("9999px");
    });

    it("publishes all fifteen type ramps with a size, a line height, a weight and a tracking", () => {
        const ramps = [
            "display-large",
            "display-medium",
            "display-small",
            "headline-large",
            "headline-medium",
            "headline-small",
            "title-large",
            "title-medium",
            "title-small",
            "body-large",
            "body-medium",
            "body-small",
            "label-large",
            "label-medium",
            "label-small",
        ];
        for (const ramp of ramps) {
            for (const axis of ["size", "line-height", "weight", "tracking"]) {
                expect(
                    token(`--md-sys-typescale-${ramp}-${axis}`),
                    `the ${ramp} ramp has no ${axis}`,
                ).toBeDefined();
            }
        }
        // Spot-check the two ends of the ladder against the spec's px figures over 16.
        expect(token("--md-sys-typescale-display-large-size")).toBe("3.5625rem");
        expect(token("--md-sys-typescale-label-small-size")).toBe("0.6875rem");
    });

    it("expresses every type value in rem, so the interface-size dial still scales it", () => {
        // `uiSizeSetting.ts` scales the interface through Chromium zoom / the CSS `zoom`
        // property, both of which scale the root font size. A px value in the scale would be
        // a string that refuses to grow when somebody who cannot read 14px asks it to.
        const sizes = source.match(/--md-sys-typescale-[a-z-]+-(?:size|line-height):[^;]+;/g) ?? [];
        expect(sizes.length).toBeGreaterThanOrEqual(30);
        for (const declaration of sizes) {
            expect(declaration, `${declaration} is not in rem`).toMatch(/rem;/);
        }
    });

    it("never sets a root font size, which belongs to the interface-size dial alone", () => {
        expect(code(source)).not.toMatch(/(?:^|[^-])font-size\s*:/);
        expect(code(read("./styles/global.scss"))).not.toMatch(
            /\b(?:html|:root)\s*\{[^}]*font-size/,
        );
    });

    it("publishes elevation 0-5 as real box-shadows under a name the marker sheet has not claimed", () => {
        expect(token("--md-sys-elevation-shadow-level0")).toBe("none");
        for (const level of [1, 2, 3, 4, 5]) {
            const value = token(`--md-sys-elevation-shadow-level${level}`);
            expect(value, `elevation level ${level} is missing`).toBeDefined();
            // Two shadows - M3's key plus ambient - tinted from the theme's own shadow role.
            expect(value).toMatch(/rgba\(var\(--v-theme-shadow\), 0\.3\)/);
            expect(value).toMatch(/rgba\(var\(--v-theme-shadow\), 0\.15\)/);
        }
        // `markers.scss` owns `--md-sys-elevation-levelN` for a drop-shadow() filter chain,
        // and is imported after this sheet. Publishing a box-shadow under that name would be
        // overwritten by the filter, and `box-shadow: drop-shadow(...)` drops silently.
        expect(source).not.toMatch(/--md-sys-elevation-level\d\s*:/);
    });

    it("publishes all four M3 state-layer opacities", () => {
        expect(token("--md-sys-state-hover-opacity")).toBe("8%");
        expect(token("--md-sys-state-focus-opacity")).toBe("10%");
        expect(token("--md-sys-state-pressed-opacity")).toBe("10%");
        expect(token("--md-sys-state-dragged-opacity")).toBe("16%");
    });

    it("agrees value-for-value with the marker sheet on every token both of them declare", () => {
        // `markers.scss` declares its own subset on the same selector and is imported later,
        // so its value is the one that lands. Where the two disagree, the chrome and the map
        // layer stop being the same design and nothing anywhere reports it.
        const markers = read("./styles/markers.scss");
        const shared = [
            "--md-sys-state-hover-opacity",
            "--md-sys-state-pressed-opacity",
            "--md-sys-motion-easing-standard",
            "--md-sys-motion-duration-short4",
            "--md-sys-motion-duration-medium2",
            "--md-ref-typeface-plain",
            "--md-sys-typescale-body-medium-size",
            "--md-sys-typescale-body-medium-line-height",
            "--md-sys-typescale-body-medium-tracking",
            "--md-sys-typescale-body-small-size",
            "--md-sys-typescale-label-large-size",
            "--md-sys-typescale-label-large-weight",
            "--md-sys-typescale-label-medium-tracking",
        ];
        for (const name of shared) {
            const there = markers.match(new RegExp(`\\${name}\\s*:\\s*([^;]+);`))?.[1]?.trim();
            expect(there, `${name} is not in markers.scss any more`).toBeDefined();
            expect(token(name), `${name} disagrees with markers.scss`).toBe(there);
        }
    });

    it("publishes the MD3 Expressive easing set and the whole duration ladder", () => {
        expect(token("--md-sys-motion-easing-emphasized")).toBe("cubic-bezier(0.2, 0, 0, 1)");
        expect(token("--md-sys-motion-easing-standard")).toBe("cubic-bezier(0.2, 0, 0, 1)");
        expect(token("--md-sys-motion-easing-emphasized-decelerate")).toBe(
            "cubic-bezier(0.05, 0.7, 0.1, 1)",
        );
        expect(token("--md-sys-motion-easing-emphasized-accelerate")).toBe(
            "cubic-bezier(0.3, 0, 0.8, 0.15)",
        );
        expect(token("--md-sys-motion-easing-standard-decelerate")).toBe(
            "cubic-bezier(0, 0, 0, 1)",
        );
        expect(token("--md-sys-motion-easing-standard-accelerate")).toBe(
            "cubic-bezier(0.3, 0, 1, 1)",
        );

        const ladder: Record<string, string> = {
            short1: "50ms",
            short2: "100ms",
            short3: "150ms",
            short4: "200ms",
            medium1: "250ms",
            medium2: "300ms",
            medium3: "350ms",
            medium4: "400ms",
            long1: "450ms",
            long2: "500ms",
            long3: "550ms",
            long4: "600ms",
        };
        for (const [step, value] of Object.entries(ladder)) {
            expect(token(`--md-sys-motion-duration-${step}`), `duration ${step}`).toBe(value);
        }
    });

    it("is actually imported, or none of the above reaches a running app", () => {
        expect(read("./main.ts")).toMatch(/import "\.\/styles\/md3\.scss"/);
    });
});

/**
 * The rules that spend the tokens, and the three things they must not break.
 *
 * Same raw-source idiom, same reason. What is pinned here is deliberately narrow: not how
 * the app looks, but the handful of properties of `global.scss` that other things depend on
 * being true - the reduced-motion kill switch, the map layer's stacking and pointer-events
 * contract, and the appearance editor's ability to override anything this file says.
 */
describe("global.scss spends the tokens without breaking what was already load-bearing", () => {
    const source = read("./styles/global.scss");

    it("re-points Vuetify's radius and elevation utilities at the tokens rather than hard-coding a second scale", () => {
        for (const [utility, tokenName] of [
            [".rounded-sm", "--md-sys-shape-corner-sm"],
            [".rounded-lg", "--md-sys-shape-corner-lg"],
            [".rounded-xl", "--md-sys-shape-corner-xl"],
            [".rounded-pill", "--md-sys-shape-corner-full"],
        ]) {
            expect(source).toMatch(
                new RegExp(`\\${utility}\\s*\\{\\s*border-radius:\\s*var\\(${tokenName}\\)`),
            );
        }
        for (const level of [0, 1, 2, 3, 4, 5]) {
            expect(source).toMatch(
                new RegExp(
                    `\\.elevation-${level}\\s*\\{\\s*box-shadow:\\s*var\\(--md-sys-elevation-shadow-level${level}\\)`,
                ),
            );
        }
    });

    it("retunes Vuetify's own state-layer variables to the M3 opacities", () => {
        expect(source).toMatch(/--v-hover-opacity:\s*0\.08;/);
        expect(source).toMatch(/--v-focus-opacity:\s*0\.1;/);
        expect(source).toMatch(/--v-pressed-opacity:\s*0\.1;/);
        expect(source).toMatch(/--v-dragged-opacity:\s*0\.16;/);
    });

    it("applies the heading scale at zero specificity, so components and the appearance editor still win", () => {
        // `:where()` contributes nothing to specificity. A component that already sized its
        // own heading keeps that size, and this is a floor rather than a takeover.
        for (const heading of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
            expect(source).toMatch(new RegExp(`:where\\(#app\\) :where\\(${heading}\\)`));
        }
    });

    it("caps prose at a readable measure without touching containers, tables or code", () => {
        expect(source).toMatch(/--mb-measure-prose:\s*68ch;/);
        expect(source).toMatch(/:where\(#app\) p \{\s*max-inline-size: var\(--mb-measure-prose\);/);
        // The escape hatch has to exist, and has to come after the cap so it wins at equal
        // specificity. A `<p>` inside a table or a log is a cell, not a paragraph.
        const capAt = source.indexOf(":where(#app) p {");
        const releaseAt = source.indexOf("max-inline-size: none");
        expect(releaseAt).toBeGreaterThan(capAt);
        expect(source).toMatch(
            /:where\(#app\) :where\(table, \.v-table, \.v-data-table, pre, code/,
        );
    });

    it("adds no !important outside the two Vuetify utilities that already had one", () => {
        // An `!important` declaration outranks an inline style, and the appearance editor
        // applies a user's overrides inline. Anything here that is `!important` and is not
        // replacing an already-`!important` Vuetify utility is a user locked out of their own
        // theme. The map-layer background rule predates all of this and is exempt.
        const important = code(source).match(/^.*!important.*$/gm) ?? [];
        for (const line of important) {
            expect(
                /border-radius|box-shadow|transition-duration|animation-duration|background: transparent/.test(
                    line,
                ),
                `unexpected !important: ${line.trim()}`,
            ).toBe(true);
        }
    });

    it("keeps the reduced-motion kill switch last, and still absolute over every motion token", () => {
        const killSwitch = source.indexOf("@media (prefers-reduced-motion: reduce)");
        expect(killSwitch).toBeGreaterThan(0);
        expect(source.indexOf("--md-sys-motion-duration", 0)).toBeLessThan(killSwitch);
        expect(source.slice(killSwitch)).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
        expect(source.slice(killSwitch)).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    });

    it("leaves the map layer's stacking and pointer-events contract exactly as it was", () => {
        // These are the rules that keep the Vue chrome above the fixed map canvas and keep
        // the gaps between controls click-through. Nothing in a token system has any business
        // near them, and this is what says so out loud.
        expect(source).toMatch(/#map-container \{\s*position: fixed;/);
        expect(source).toMatch(/inset: var\(--mb-titlebar-height, 0px\) 0 0 0;/);
        expect(source).toMatch(
            /#app \{\s*position: fixed;\s*inset: 0;\s*z-index: 10;\s*pointer-events: none;/,
        );
        expect(source).toMatch(/\.mb-interactive \{\s*pointer-events: auto;\s*\}/);
        expect(source).toMatch(
            /#app \.v-main \{\s*position: relative;\s*pointer-events: none;\s*\}/,
        );
    });
});
