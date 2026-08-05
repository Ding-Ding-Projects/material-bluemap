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
 * the gear/config/licence FAB stack, which is `position: fixed` at the bottom-left,
 * painting directly over scrolled-to text in nine separate screenshots across six
 * surfaces - "Rendering" reading "ndering", "Pick an account" reading "ck an account",
 * and at higher display scales the icons sitting on top of actual radio-button controls.
 * The fix reserves a permanent left gutter on `.mb-world-host` sized to the stack's own
 * footprint; this file pins the two numbers together so a future edit to either cannot
 * silently reopen the gap between them.
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
