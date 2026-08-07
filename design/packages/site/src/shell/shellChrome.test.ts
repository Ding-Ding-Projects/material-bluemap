/**
 * The topbar's scroll-linked elevation.
 *
 * The bar is flat at rest and only gains its shadow (and its three-hue gradient rule) once
 * `main.ts`'s `watchTopbarScrollShadow` marks it `data-scrolled="true"`. That wiring lives in
 * `main.ts`, which boots the whole application as an import side effect the moment
 * `document.readyState` is not `"loading"` -- true by default under jsdom -- so this file
 * does not import it directly. Instead it locks in the two halves of the contract as static
 * source assertions: `shell.css` declares the attribute-gated rules the feature depends on,
 * and `main.ts` actually wires the toggle up and calls it from `boot()`. A regression in
 * either half (the CSS rule renamed or dropped, or the wiring call deleted) fails here
 * without paying for a full DOM boot in every test that touches shell chrome.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const shellCss = readFileSync(resolve(here, "shell.css"), "utf8");
const mainTs = readFileSync(resolve(here, "..", "main.ts"), "utf8");

describe("topbar scroll-linked elevation", () => {
    it("is flat at rest in shell.css", () => {
        expect(shellCss).toMatch(/\.mb-shell-topbar\s*{[^}]*box-shadow:\s*none;/);
    });

    it("gains its elevation shadow only once data-scrolled is true", () => {
        expect(shellCss).toContain('.mb-shell-topbar[data-scrolled="true"]');
        expect(shellCss).toMatch(
            /\.mb-shell-topbar\[data-scrolled="true"\]\s*{[^}]*box-shadow:\s*var\(--md-sys-elevation-level1\);/,
        );
    });

    it("fades its shadow with a token duration and easing, not a literal ms value", () => {
        const rule = /\.mb-shell-topbar\s*{[^}]*}/.exec(shellCss)?.[0] ?? "";
        expect(rule).toMatch(/transition:\s*box-shadow\s+var\(--md-sys-motion-duration-short3\)/);
        expect(rule).toContain("var(--md-sys-motion-easing-standard-decelerate)");
    });

    it("draws its gradient rule from the primary/secondary/tertiary system roles, not literal colours", () => {
        const after = /\.mb-shell-topbar::after\s*{[^}]*}/.exec(shellCss)?.[0] ?? "";
        expect(after).toContain("var(--md-sys-color-primary)");
        expect(after).toContain("var(--md-sys-color-secondary)");
        expect(after).toContain("var(--md-sys-color-tertiary)");
    });

    it("respects prefers-reduced-motion through the shared token collapse, not a local override", () => {
        // tokens.css already collapses every --md-sys-motion-duration-* to 1ms under
        // prefers-reduced-motion; shell.css must lean on that rather than hand-rolling its
        // own reduced-motion branch for this transition.
        expect(shellCss).not.toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    });

    it("main.ts wires watchTopbarScrollShadow into the mounted topbar", () => {
        expect(mainTs).toContain("watchTopbarScrollShadow(topbar);");
        expect(mainTs).toContain("function watchTopbarScrollShadow(topbar: HTMLElement): void {");
    });

    it("the watcher no-ops outside a window and never throws while unmounted", () => {
        const fn =
            /function watchTopbarScrollShadow\(topbar: HTMLElement\): void \{[\s\S]*?\n}/.exec(
                mainTs,
            )?.[0];
        expect(fn).toBeDefined();
        expect(fn).toContain('if (typeof window === "undefined") return;');
        // Passive and rAF-throttled: it must never call scrollIntoView-style synchronous
        // work directly from the scroll event, only schedule it.
        expect(fn).toContain("{ passive: true }");
        expect(fn).toContain("window.requestAnimationFrame(apply)");
    });
});

describe("compact side navigation sizing", () => {
    it("keeps an expanded compact rail narrow enough to leave usable page content", () => {
        expect(shellCss).toMatch(
            /@media\s*\(width\s*<=\s*640px\)[\s\S]*?\.mb-shell-topbar\[data-placement="left"\][\s\S]*?flex-basis:\s*clamp\(7rem,\s*36vw,\s*10rem\);/,
        );
        expect(shellCss).toMatch(
            /@media\s*\(width\s*<=\s*640px\)[\s\S]*?\.mb-shell-topbar\[data-placement="left"\][\s\S]*?min-width:\s*7rem;/,
        );
    });

    it("keeps the collapsed compact rail at the shared minimum touch-target width", () => {
        expect(shellCss).toContain(
            'data-sidebar-collapsed="true"][data-placement="left"]',
        );
        expect(shellCss).toContain(
            "flex-basis: calc(var(--md-sys-min-touch-target) + 2 * var(--md-sys-spacing-2))",
        );
    });
});
