/**
 * A style-source sweep for the class of defect filed as "the full GUI has a 'mouse click'
 * cursor": a `cursor: pointer` rule reaching a root, wildcard or shell-level selector, which
 * `cursor` being an inherited property then carries down into every plain heading, panel and
 * stretch of empty space under it.
 *
 * The actual bug (see `components/appearance/AppearanceTarget.test.ts`, "the wrapper's own
 * cursor") turned out not to be an authored selector at all: Vuetify's own normalize
 * stylesheet answers `[aria-controls]` with `cursor: pointer`, and Vuetify's `<v-menu
 * :activator="root">` wiring writes `aria-controls` onto `AppearanceTarget.vue`'s wrapper -
 * which the appearance contract puts around *every* rendered element. That file carries its
 * own dedicated regression test for the fix. This file is the other half: a standing guard
 * against a *plain, hand-written* broad selector ever being added directly to one of the
 * shell surfaces that legitimately cover large regions of the window - `App.vue`'s own
 * `<style>`, and the two global stylesheets `main.ts` loads for the whole application,
 * `styles/global.scss` and `styles/markers.scss`.
 *
 * A `?raw` style-source read rather than a mounted `getComputedStyle` assertion, for the same
 * reason `tabGroupPickerMount.test.ts` reads `TabGroupPicker.vue?raw`: this workspace's
 * `vitest.config.ts` does not enable `test.css`, so a mounted component's `<style>` block is
 * never injected into jsdom's `document.head`, and `getComputedStyle` would read empty (or,
 * worse, silently pass by never seeing a real leak at all) regardless of what any file here
 * actually declares.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Plain `.scss`/`.css` files read empty through Vite's `?raw` dynamic-import loader in this
 * workspace's test config (confirmed directly: `styles/global.scss?raw` resolves to a module
 * whose `default` is `""`, with no thrown error to say so) even though the very same loader
 * works exactly as documented for a `.vue` SFC's raw source - see the two `?raw` imports below.
 * `node:fs` sidesteps whatever in the CSS pipeline is swallowing it and is exactly as immune to
 * the workspace's disabled `test.css` option, since it never asks Vite to interpret the file at
 * all.
 */
function readSource(relativePath: string): string {
    return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

/**
 * Pulls the `<style>...</style>` body out of an SFC (plain CSS/SCSS text passes through
 * unchanged), then strips `/* ... *\/` comments. Comments matter here specifically because
 * several of these files quote a real CSS rule, braces and all, in prose - the doc comment
 * this very fix landed with quotes Vuetify's `[aria-controls] { cursor: pointer }` verbatim -
 * and an un-stripped comment can smuggle a brace pair into `broadPointerRules`'s rule matcher.
 */
function styleContent(source: string): string {
    const match = /<style[^>]*>([\s\S]*)<\/style>/.exec(source);
    const css = match?.[1] ?? source;
    return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Selectors that legitimately cover a large region of the window, and therefore must never be
 * the target of a `cursor: pointer` rule - if the whole window needs a pointer cursor,
 * something under it forgot to opt out, not the other way around.
 */
const BROAD_TOKENS = [
    "html",
    "body",
    ":root",
    "*",
    "#app",
    "#map-container",
    ".mb-app",
    ".mb-main",
    ".mb-shell-tabs",
    ".mb-world-host",
    ".v-application",
    ".v-application__wrap",
    ".mb-appearance-target",
];

/**
 * Finds every `selector { ... }` rule (or `.scss`-style nested block, which none of these
 * three files currently use at the top level, but the regex does not assume otherwise) whose
 * declaration body sets `cursor: pointer`, and returns the ones where at least one comma-
 * separated selector's *first* simple-selector segment is exactly one of `BROAD_TOKENS` -
 * exact equality after splitting on combinators, so `.mb-appearance-target` never
 * false-positives against `.mb-app`, and a compound selector like `.mb-app.something` (already
 * narrower than plain `.mb-app`) is deliberately left alone.
 */
function broadPointerRules(css: string): string[] {
    const offenders: string[] = [];
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = ruleRe.exec(css)) !== null) {
        const selectorText = match[1] ?? "";
        const body = match[2] ?? "";
        if (!/cursor:\s*pointer/i.test(body)) continue;
        for (const selector of selectorText.split(",")) {
            const trimmed = selector.trim();
            const firstSegment = trimmed.split(/[\s>+~]/)[0] ?? trimmed;
            if (BROAD_TOKENS.includes(firstSegment)) {
                offenders.push(`${trimmed} { ${body.trim()} }`);
            }
        }
    }
    return offenders;
}

describe("no shell-level file answers a broad selector with a pointer cursor", () => {
    it.each([
        ["App.vue", () => import("./App.vue?raw").then((mod) => mod.default as string)],
        ["styles/global.scss", () => Promise.resolve(readSource("./styles/global.scss"))],
        ["styles/markers.scss", () => Promise.resolve(readSource("./styles/markers.scss"))],
        [
            "components/appearance/AppearanceTarget.vue",
            () => import("./components/appearance/AppearanceTarget.vue?raw").then((mod) => mod.default as string),
        ],
    ] as const)("%s", async (_label, loader) => {
        const source = (await loader()) ?? "";
        expect(source.length).toBeGreaterThan(0);
        const offenders = broadPointerRules(styleContent(source));
        expect(offenders).toEqual([]);
    });

    it("the sweep itself actually catches the shape of the original bug", () => {
        // A meta-test for the sweep function: without this, a typo in `BROAD_TOKENS` or the
        // rule regex could make every case above vacuously pass forever. `[aria-controls]`
        // itself is deliberately not in `BROAD_TOKENS` - Vuetify owns that selector, not this
        // codebase - so this checks the mechanism with a stand-in root selector instead.
        const offenders = broadPointerRules("#app { cursor: pointer; }");
        expect(offenders).toEqual(['#app { cursor: pointer; }']);

        const clean = broadPointerRules(".mb-tabs-strip__tab { cursor: pointer; }");
        expect(clean).toEqual([]);
    });
});
