/**
 * The finder's four section-toggle headings.
 *
 * Each heading is a translated sentence in a `size="small"` `<v-btn>` inside a panel
 * capped at `max-width: 460px`. The label span is a flex item inside Vuetify's
 * `.v-btn__content`, so its default `min-width: auto` kept it from ever shrinking -- the
 * old `overflow: hidden; text-overflow: ellipsis` pair painted nothing -- and the
 * `white-space: nowrap` it inherits from `.v-btn` kept it from wrapping, so a long
 * heading (`tabs.find.groups` and friends) hard-clipped at the panel edge with nothing
 * to say anything was missing. The fix wraps rather than truncates, and the button turns
 * its fixed small-size height into a floor so the second line has room.
 *
 * The assertions read the shipped rules out of the component source. This workspace's
 * `vitest.config.ts` does not enable `test.css`, so no stylesheet is attached to a mounted
 * component and a real cascade is not observable from a test here at all; `RunScreen.test.ts`
 * and the components fixed alongside it check their own CSS fixes the same way.
 */

import { describe, expect, it } from "vitest";

import tabFinderSource from "./TabFinder.vue?raw";

/** A rule's body with its comments removed, so prose never trips an assertion. */
function declarationsOf(selector: RegExp): string {
    const rule = selector.exec(tabFinderSource)?.[0] ?? "";
    return rule.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("the section headings' label span", () => {
    it("shrinks and wraps instead of clipping at the panel edge", () => {
        const declarations = declarationsOf(/\.mb-tabs-finder__toggle-label\s*\{[^}]*\}/);
        expect(declarations).not.toBe("");
        expect(declarations).toContain("min-width: 0");
        expect(declarations).toContain("white-space: normal");
        expect(declarations).toContain("overflow-wrap: anywhere");
    });

    it("no longer carries the ellipsis pair that wrapping made moot", () => {
        const declarations = declarationsOf(/\.mb-tabs-finder__toggle-label\s*\{[^}]*\}/);
        expect(declarations).not.toContain("text-overflow");
        expect(declarations).not.toContain("overflow: hidden");
    });
});

describe("the toggle button around it", () => {
    it("treats the small-size height as a floor so a wrapped second line fits", () => {
        const declarations = declarationsOf(/\.mb-tabs-finder__toggle\s*\{[^}]*\}/);
        expect(declarations).not.toBe("");
        expect(declarations).toContain("height: auto");
        expect(declarations).toContain("min-height: 28px");
    });
});
