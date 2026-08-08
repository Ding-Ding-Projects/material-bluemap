/**
 * The CSS half of "the bottom-left utility FABs do not paint over page content" - the half
 * a mounted test cannot see.
 *
 * `App.test.ts` proves `.mb-world-host` is the element every page (World, Projects,
 * CI-render, Servers, Backups, Pages, Docs, and the options editor) is mounted inside; it
 * cannot prove that host reserves real clearance for `.mb-shell-fabs`, because jsdom
 * computes no layout at all - `getComputedStyle` there never reflects a single rule from
 * any `<style>` block regardless of whether it is right. This is the same "read the
 * source, not a stand-in" idiom `components/settings/dockScrollChain.test.ts` and
 * `components/confirm/superConfirmPolicy.test.ts` use for the same reason.
 *
 * A visual audit of the current screenshot set (`docs/visual-audit-2026-08-05.md`) found
 * the FAB stack (four buttons at the time; the licence and welcome buttons have since
 * moved out, leaving Settings and the options editor), which is `position: fixed` at the
 * bottom-left, painting directly over scrolled-to text in nine separate screenshots
 * across six surfaces - "Rendering" reading "ndering", "Pick an account" reading "ck an
 * account", and at higher display scales the icons sitting on top of actual radio-button
 * controls. The fix reserves a permanent left gutter on `.mb-world-host` sized to the
 * stack's own footprint - a footprint set by the buttons' shared width, not their count,
 * so it holds for two buttons exactly as it did for four; this file pins the two numbers
 * together so a future edit to either cannot silently reopen the gap between them.
 *
 * ## The reported "ninth instance" was the eighth one, seen through a doorway
 *
 * A later handoff flagged `docs/screenshots/settings-drawer.png` as a ninth instance
 * living inside the Settings drawer's own scroll region (`DockedSurface.vue`'s
 * `.mb-docked__body`), distinct from the eight `.mb-world-host` pages this file already
 * covers. Re-checked against the current tree, that is not where the cropped text comes
 * from: `settings-drawer.png` is captured by clicking the Settings FAB while the Backups
 * tab is still the active page underneath it (`screenshots.spec.ts`'s "captures the
 * settings surface" test runs immediately after "captures the backup screen" without
 * switching tabs), and "Choose the world or folder to back up before this can start." is
 * `BackupScreen.vue`'s own copy (`copy/surfaces/backup.ts`'s `backup.blocked.source`),
 * not anything `AppSettings.vue` or `DockedSurface.vue` renders - `worldFolderCopy()`, the
 * only settings-drawer copy that mentions a world folder, says something else entirely.
 * The drawer is docked to the right by default, so the Backups page's text visible to its
 * left is exactly the eighth, already-covered instance, not a new one.
 *
 * Whether a *docked-left, docked-bottom, or floating* placement could still trap the
 * drawer's own content under the stack turns out to be answered by `.mb-docked`'s
 * `z-index: 1500` below: confirmed against a real layout engine (Chromium, via
 * Playwright, the same idiom `components/settings/dockScrollChain.test.ts` and
 * `2b04a82`'s docked-panel fix used) with the two rulesets below transplanted verbatim
 * into a bare page, `document.elementFromPoint` at the FAB's own centre - and at that
 * point after scrolling arbitrary filler content underneath it - always resolves to the
 * docked panel, never the FAB, in every placement that covers that corner at all. A
 * docked surface's own explicit stacking level already wins; padding wired to the same
 * 76px is not needed and would just narrow it for no reason. The second `describe` below
 * pins both halves of the ordering that makes this true, so it stays true rather than
 * staying true by accident.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
    return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("the bottom-left FAB stack and the page hosts it floats over", () => {
    const source = read("./App.vue");

    function rule(selector: string): string {
        const pattern = new RegExp(`\\.${selector}\\s*\\{[^}]*\\}`);
        const match = source.match(pattern);
        expect(match, `no rule found for .${selector}`).not.toBeNull();
        return match?.[0] ?? "";
    }

    it("still floats the stack 12px from the left edge, at its documented 48px width", () => {
        const stack = rule("mb-shell-fabs");
        expect(stack).toMatch(/left:\s*calc\(12px/);

        const button = rule("mb-shell-fab");
        expect(button).toMatch(/width:\s*48px/);
    });

    it("gives every page host a left gutter that clears the stack's own right edge with room to spare", () => {
        const host = rule("mb-world-host");
        const match = host.match(/padding-inline-start:\s*calc\((\d+)px/);
        expect(match, "mb-world-host has no padding-inline-start reserving the gutter").not.toBeNull();

        const reserved = Number(match?.[1] ?? 0);
        // 12px inset + 48px button = 60px is the stack's own right edge; the reserved
        // gutter has to clear that with a real margin, not land exactly on it.
        const stackRightEdge = 12 + 48;
        expect(reserved).toBeGreaterThan(stackRightEdge);
    });

    it("mounts every one of the shell's tabbed pages, plus the options editor, inside that same gutter", () => {
        // `.mb-shell-fabs` is `position: fixed`, always floating over whatever page is
        // active, so the fix has to reach every host that wraps a page rather than one.
        // App.test.ts already proves the world page lands in `.mb-world-host`; this
        // counts every wrapper that reuses the class, so a page moved off it later would
        // drop this count and be caught here rather than silently losing its clearance.
        const hostUsages = source.match(/class="mb-world-host mb-interactive"/g) ?? [];
        expect(hostUsages.length).toBeGreaterThanOrEqual(8);
    });
});

/**
 * The docked-surface half of the same defect class: `AppSettings.vue` (the Settings
 * drawer) and `EulaSurface.vue` both render their content through `DockedSurface.vue`'s
 * `.mb-docked`, which the fixed FAB stack can visually cover in a docked-left,
 * docked-bottom or floating-over-the-corner placement. Unlike `.mb-world-host`, this
 * surface needs no reserved padding of its own - see the file header for the real-layout
 * verification - because `.mb-docked` already declares an explicit `z-index` and
 * `.mb-shell-fabs` deliberately does not, which is what lets a docked surface's own
 * background paint over the stack rather than the other way around. These tests pin both
 * halves of that ordering so neither can drift without this file noticing: raising
 * `.mb-shell-fabs` to any explicit z-index, or dropping `.mb-docked`'s, would silently
 * reopen exactly the gap this was checked for.
 */
describe("the docked-surface chrome (Settings, the EULA panel) stacks above the FAB corner instead of needing a gutter from it", () => {
    const appSource = read("./App.vue");
    const dockedSource = read("./components/settings/DockedSurface.vue");

    function rule(source: string, selector: string): string {
        const pattern = new RegExp(`(?<!-)\\.${selector}\\s*\\{[^}]*\\}`);
        const match = source.match(pattern);
        expect(match, `no rule found for .${selector}`).not.toBeNull();
        return match?.[0] ?? "";
    }

    it("gives every docked surface's chrome an explicit, positive stacking level", () => {
        const docked = rule(dockedSource, "mb-docked");
        const match = docked.match(/z-index:\s*(\d+)/);
        expect(match, ".mb-docked has no explicit z-index reserving its stacking level").not.toBeNull();
        expect(Number(match?.[1] ?? 0)).toBeGreaterThan(0);
    });

    it("leaves the FAB stack at the implicit stacking level, which is what a docked surface's explicit level always wins against", () => {
        const stack = rule(appSource, "mb-shell-fabs");
        // Any explicit z-index here - even 1 - would still lose to `.mb-docked`'s much
        // larger one, but it would mean this test (and the reasoning in the file header)
        // is pinning a coincidence rather than the actual mechanism, so the absence of
        // one is exactly what has to hold.
        expect(stack).not.toMatch(/z-index/);
    });

    it("routes the Settings drawer's own content through that same docked chrome", () => {
        const settingsSource = read("./components/settings/AppSettings.vue");
        expect(settingsSource).toMatch(/<DockedSurface\b/);
        expect(settingsSource).toMatch(/class="mb-settings"/);
    });
});


/* -------------------------------------------------------------------------- */
/* Clearing the tab strip itself                                              */
/* -------------------------------------------------------------------------- */

/**
 * The other half of "these buttons do not paint over anything", found the same way the
 * first half was: by looking at a capture of the running application.
 *
 * The clearance above is about page *content*. This is about the strip. The stack is fixed
 * to the bottom-left corner, which was empty while the strip ran along the top of the
 * window - but the strip's default placement is the left edge, so that corner is the
 * strip's own. `diagnostic-pages-publishing-screen.png` from a real harness run shows the
 * configuration button drawn on top of the strip's overflow and search controls, and the
 * run itself failed on a click the button had intercepted rather than on anything wrong
 * with the tab.
 *
 * The fix is the pattern `AppTitleBar.vue` already uses for `--mb-titlebar-height`:
 * `TabStrip.vue` measures its own width and publishes it, and this stack offsets by it.
 * Measured rather than hard-coded because the strip is as wide as its widest label needs,
 * the user can move it to any of four edges, and it is `0px` for the three placements that
 * leave the left edge alone.
 */
describe("the stack clears the tab strip as well as the page", () => {
    const app = read("./App.vue");
    const strip = read("./components/tabs/TabStrip.vue");

    it("offsets itself by the strip's own published width", () => {
        const rule = /\.mb-shell-fabs\s*\{[^}]*\}/s.exec(app)?.[0] ?? "";
        expect(rule).not.toBe("");
        expect(rule).toContain("--mb-tabs-strip-inline-size");
    });

    it("falls back to no offset, so a build with no strip keeps its buttons in the corner", () => {
        const rule = /\.mb-shell-fabs\s*\{[^}]*\}/s.exec(app)?.[0] ?? "";
        expect(rule).toMatch(/var\(--mb-tabs-strip-inline-size,\s*0px\)/);
    });

    it("is published by the strip from a real measurement, not a constant", () => {
        expect(strip).toContain("--mb-tabs-strip-inline-size");
        expect(strip).toContain("offsetWidth");
        // Only the left edge takes the offset: a top, bottom or right strip must leave
        // these buttons exactly where they have always been.
        expect(strip).toMatch(/placement === "left"/);
    });

    it("is published by the shell's strip alone, not by the four this app draws", () => {
        // The document has one custom property and this application renders four strips -
        // the shell's, the settings sheet's, the config editor's and the project editor's.
        // Ungated, whichever mounted last overwrote the shell's measurement with a
        // panel-sized number, which a real capture showed as buttons offset far past the
        // strip they were meant to clear.
        expect(strip).toContain("props.publishesInset");
        expect(read("./components/tabs/TabbedNavigation.vue")).toContain("publishesInset: false");
        // The shell is the one caller that opts in.
        expect(app).toContain("publishes-inset");
    });

    it("re-publishes when the strip resizes and when the strip itself changes", () => {
        // A number measured once is wrong the first time somebody renames a group, moves
        // the strip to another edge, or resizes the window.
        const publisher = /function publishStripInset\(\)[\s\S]*?\n\}/.exec(strip)?.[0] ?? "";
        expect(publisher).not.toBe("");
        expect(strip.match(/publishStripInset\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    });
});
