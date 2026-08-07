import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const shellCss = readFileSync(resolve(here, "shell.css"), "utf8");
const shellTs = readFileSync(resolve(here, "ExpressiveSiteShell.ts"), "utf8");
const mainTs = readFileSync(resolve(here, "..", "main.ts"), "utf8");

describe("ground-up M3 Expressive shell", () => {
    it("owns four explicit application regions rather than relying on append order", () => {
        expect(shellTs).toContain('this.appBar.className = "mb-app-bar"');
        expect(shellTs).toContain('this.navigation.className = "mb-shell-topbar"');
        expect(shellTs).toContain('this.main.className = "mb-main"');
        expect(shellTs).toContain(
            "this.element.append(this.appBar, frame, this.navigationScrim, options.footer)",
        );
        expect(mainTs).toContain("new ExpressiveSiteShell({");
    });

    it("gives the top app bar scroll-linked elevation with token motion", () => {
        expect(shellCss).toMatch(/\.mb-app-bar\s*{[^}]*box-shadow:\s*none;/);
        expect(shellCss).toMatch(
            /\.mb-app-bar\[data-scrolled="true"\]\s*{[^}]*box-shadow:\s*var\(--md-sys-elevation-level2\);/,
        );
        const rule = /\.mb-app-bar\s*{[^}]*}/.exec(shellCss)?.[0] ?? "";
        expect(rule).toContain("var(--md-sys-motion-duration-short4)");
        expect(rule).toContain("var(--md-sys-motion-easing-standard)");
        expect(shellTs).toContain('this.appBar.dataset["scrolled"] = next ? "true" : "false"');
        expect(shellTs).toContain("window.requestAnimationFrame(apply)");
        expect(shellTs).toContain("{ passive: true }");
    });

    it("draws the site signature only from M3 system roles", () => {
        const footer = /\.mb-shell-footer::before\s*{[\s\S]*?\n}/.exec(shellCss)?.[0] ?? "";
        expect(footer).toContain("var(--md-sys-color-primary)");
        expect(footer).toContain("var(--md-sys-color-secondary)");
        expect(footer).toContain("var(--md-sys-color-tertiary)");
        expect(footer).not.toMatch(/#[0-9a-f]{3,8}/i);
    });

    it("ships an adaptive mobile drawer, persistent reachable toggle and scrim", () => {
        expect(shellCss).toContain("@media (width <= 720px)");
        expect(shellCss).toContain("--mb-navigation-width: min(19rem, calc(100vw - 3rem))");
        expect(shellCss).toContain("--mb-navigation-collapsed-width: 4rem");
        expect(shellCss).toContain('.mb-app-shell[data-navigation-open="true"]');
        expect(shellTs).toContain('this.navigationScrim.className = "mb-navigation-scrim"');
        expect(shellTs).toContain("options.sidebar.setCollapsed(true)");
    });

    it("uses a responsive bounded content canvas without hiding horizontal overflow", () => {
        expect(shellCss).toContain("--mb-content-max-width: 92rem");
        expect(shellCss).toMatch(/\.mb-main\s*{[^}]*min-width:\s*0;/);
        expect(shellCss).toMatch(
            /\.mb-main > \.tab-panels\s*{[^}]*width:\s*min\(100%, var\(--mb-content-max-width\)\);/,
        );
        expect(shellCss).not.toMatch(/\.mb-main\s*{[^}]*overflow-x:\s*hidden/);
    });

    it("keeps every quick action real and the palette shortcut-labelled", () => {
        for (const action of ["search", "settings", "notifications", "palette"] as const) {
            expect(shellTs).toContain(`this.options.actions.${action}`);
        }
        expect(shellTs).toContain('"Command palette (Ctrl+Shift+F)"');
        expect(mainTs).toContain("palette: () => palette.open()");
    });

    it("provides reduced-motion and forced-colour adaptations", () => {
        expect(shellCss).toContain("@media (prefers-reduced-motion: reduce)");
        expect(shellCss).toContain("transition: none");
        expect(shellCss).toContain("@media (forced-colors: active)");
        expect(shellCss).toContain("background: Canvas");
        expect(shellCss).toContain("color: CanvasText");
    });
});
