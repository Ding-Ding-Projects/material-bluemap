/**
 * The menu-choice row's segmented toggle.
 *
 * The toggle itself already sizes as a floor (`height: auto; min-height: 32px`), but the
 * rule for its buttons pinned a fixed `height` straight back on. At (0,3,0) that rule also
 * out-ranked bilingual.css's `html[data-language-mode="bilingual"] .v-btn { height: auto;
 * min-height: 36px }` at (0,2,1), so in bilingual mode the Cantonese half of the marker
 * sort labels (`markers.sort.by.*`) was clipped inside the 32px box.
 *
 * The assertion reads the shipped rule out of the component source. This workspace's
 * `vitest.config.ts` does not enable `test.css`, so no stylesheet is attached to a mounted
 * component and a real cascade is not observable from a test here at all; `RunScreen.test.ts`
 * and the components fixed alongside it check their own CSS fixes the same way.
 */

import { describe, expect, it } from "vitest";

import menuChoiceSource from "./MenuChoice.vue?raw";

/** The buttons' rule body with its comments removed, so prose never trips an assertion. */
function buttonDeclarations(): string {
    const rule = /\.mb-menu-choice__group\.v-btn-toggle \.v-btn\s*\{[^}]*\}/.exec(menuChoiceSource)?.[0] ?? "";
    return rule.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("the choice group's buttons", () => {
    it("size as a floor, like the toggle around them, so a second label line can grow the box", () => {
        const declarations = buttonDeclarations();
        expect(declarations).not.toBe("");
        expect(declarations).toContain("height: auto");
        expect(declarations).toContain("min-height: 32px");
        // The fixed height is what did the clipping; it must not come back.
        expect(declarations).not.toMatch(/(?<!min-)height: 32px/);
    });

    it("pad the grown box so a wrapped label does not touch its edges", () => {
        expect(buttonDeclarations()).toContain("padding-block: 4px");
    });
});
