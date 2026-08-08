/**
 * The global `[hidden]` guard in `base.css`.
 *
 * `[hidden] { display: none }` is only ever a user-agent stylesheet rule. The moment any
 * component's own stylesheet gives a hidden-toggled element a `display` of its own -
 * `.tab { display: flex; }`, `.md-button { display: inline-flex; }`, and so on - the author
 * rule wins over the user agent's, regardless of selector specificity, because author-origin
 * declarations always outrank user-agent-origin ones in the cascade. A verification pass at
 * 400px caught exactly this: `.tab` elements pushed into overflow by `TabStrip.ts`'s own
 * `child.hidden = true` kept rendering anyway, their truncated labels overlapping the overflow
 * button's "N more" text and chevron.
 *
 * The fix restates `[hidden] { display: none !important; }` once, globally, in `base.css`, so
 * no individual component has to remember a guard it does not know it needs.
 *
 * This is a source assertion rather than a rendered-DOM one on purpose. `jsdom`'s
 * `getComputedStyle` does not reproduce the real cascade conflict this guards against: probing
 * it directly shows that jsdom forces `display: none` for a `hidden` element **even with no
 * guard rule present at all** (jsdom special-cases the `hidden` IDL attribute instead of
 * weighing it against a conflicting author `display` declaration by cascade origin, the way a
 * real browser does). A `getComputedStyle` test here would pass whether or not the guard
 * existed, proving nothing. Reading the stylesheet's own source is the assertion that can
 * actually fail if the guard is ever removed.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const baseCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "base.css"), "utf8");

describe("base.css [hidden] guard", () => {
    it("restates the user-agent [hidden] rule with real author-origin weight", () => {
        // Author `display: none !important` beats any other author `display` declaration on
        // the same element regardless of that other rule's specificity, which is exactly what
        // is needed: `.tab`, `.tab-group`, `.md-button`, `.mbm-icon-button` and every future
        // component that sets its own `display` must still disappear once `hidden` is set.
        expect(baseCss).toMatch(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important[^}]*\}/);
    });

    it("declares the guard before any component stylesheet could plausibly need it", () => {
        // Cascade origin (not source order) is what actually makes this guard win, so source
        // position is not load-bearing - but keeping it in the shared base layer, imported by
        // every page before any component-specific stylesheet, is the project's own
        // documented convention for a rule every component depends on.
        const guardIndex = baseCss.search(/\[hidden\]\s*\{/);
        const htmlRuleIndex = baseCss.indexOf("html {");
        expect(guardIndex).toBeGreaterThan(-1);
        expect(htmlRuleIndex).toBeGreaterThan(-1);
        expect(guardIndex).toBeLessThan(htmlRuleIndex);
    });
});

describe("base.css bilingual button layout", () => {
    it("lets the block-level secondary Cantonese label expand a button instead of clipping it", () => {
        const buttonRule = baseCss.match(/\.md-button\s*\{(?<body>[^}]*)\}/)?.groups?.["body"];

        expect(buttonRule).toBeDefined();
        expect(buttonRule).toMatch(/min-height:\s*var\(--md-comp-button-height\)/);
        expect(buttonRule).not.toMatch(/(?:^|\n)\s*height:\s*var\(--md-comp-button-height\)/);
        expect(buttonRule).toMatch(/overflow:\s*visible/);
        expect(buttonRule).not.toMatch(/overflow:\s*hidden/);
        expect(buttonRule).toMatch(/white-space:\s*normal/);
        expect(buttonRule).toMatch(/overflow-wrap:\s*anywhere/);
    });
});
