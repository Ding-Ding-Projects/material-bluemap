/**
 * The CSS half of "docked panels are non scrollable" - the half a mounted test cannot see.
 *
 * `DockedSurface.resize.test.ts`'s "the content region scrolls when it does not fit" tests
 * prove what a mounted test in this workspace can prove: the scroll container really holds
 * the slot content, it is keyboard-reachable, and `scrollTop` really moves. What they
 * cannot prove is that the *reason* it scrolls is the right one, because jsdom computes no
 * layout at all - not just no clipping, no CSS cascade either, so `getComputedStyle` here
 * never reflects a single rule from any `<style>` block regardless of whether it is right.
 * A test built on `getComputedStyle` would pass identically whether `.mb-docked__body` said
 * `overflow: auto` or `overflow: hidden`, which makes it worse than no test at all.
 *
 * The actual mechanism was checked against a real layout engine (Chromium, via Playwright)
 * while diagnosing the bug: a `<div>` with `top: 0; bottom: 0` and no explicit `height`
 * resolves a real pixel height for its descendants' percentages, but one with only
 * `max-height` and no `height` does not, and a flex chain whose links are not all
 * themselves flex containers never bounds anything at all - content just grows past the
 * box's edge with no scrollbar. That measurement cannot live in a committed test the way a
 * unit test can, so this file is the next best thing: it reads the real source of the four
 * files the fix touched and asserts the specific rules are still there in text, the same
 * "read the source, not a stand-in" idiom `components/confirm/superConfirmPolicy.test.ts`
 * uses for a property no mounted test can see either. A revert of any one of these rules
 * fails this file immediately, without needing a browser to notice.
 *
 * Deliberately not `@vitest-environment jsdom`: under jsdom `import.meta.url` is not a
 * `file:` URL, so `fileURLToPath` throws before a single assertion runs - the same note
 * `superConfirmPolicy.test.ts` carries for the same reason.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
    return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("the docked-panel scroll chain", () => {
    it("makes DockedSurface's own body a flex column, so its host's flex:1 1 auto content has a real height to fill", () => {
        const source = read("./DockedSurface.vue");
        const rule = source.match(/\.mb-docked__body\s*\{[^}]*\}/);
        expect(rule).not.toBeNull();
        const body = rule?.[0] ?? "";
        expect(body).toMatch(/display:\s*flex/);
        expect(body).toMatch(/flex-direction:\s*column/);
        // The outer safety net stays: a host that does not establish its own inner scroll
        // region still gets a scrollbar here rather than silently clipped content.
        expect(body).toMatch(/overflow:\s*auto/);
    });

    it("gives a floating panel a real height alongside max-height, in the function that produces its style", () => {
        const source = read("./dockPlacement.ts");
        const floatingBranch = source.match(/if \(layout\.placement === "floating"\) \{[\s\S]*?\n {4}\}/);
        expect(floatingBranch).not.toBeNull();
        const body = floatingBranch?.[0] ?? "";
        expect(body).toMatch(/\bheight,/);
        expect(body).toMatch(/"max-height":\s*height/);
    });

    it("hands EulaSurface's own body a bounded height to pass down to the viewer it wraps", () => {
        const source = read("../eula/EulaSurface.vue");
        const rule = source.match(/\.mb-eula-surface__body\s*\{[^}]*\}/);
        expect(rule).not.toBeNull();
        const body = rule?.[0] ?? "";
        expect(body).toMatch(/display:\s*flex/);
        expect(body).toMatch(/flex-direction:\s*column/);
        expect(body).toMatch(/flex:\s*1 1 auto/);
        expect(body).toMatch(/min-block-size:\s*0/);
    });

    it("lets EulaViewer's root fill that bounded height, so its own .mb-eula__panel can bound and scroll the section text", () => {
        const source = read("../eula/EulaViewer.vue");
        const rule = source.match(/\.mb-eula\s*\{[^}]*\}/);
        expect(rule).not.toBeNull();
        const body = rule?.[0] ?? "";
        expect(body).toMatch(/flex:\s*1 1 auto/);
        expect(body).toMatch(/min-block-size:\s*0/);

        // The actual scroll boundary this whole chain exists to reach, unchanged by the
        // fix but worth pinning here beside the chain that now actually reaches it.
        const panelRule = source.match(/\.mb-eula__panel\s*\{[^}]*\}/);
        expect(panelRule).not.toBeNull();
        expect(panelRule?.[0] ?? "").toMatch(/overflow:\s*auto/);
    });
});
