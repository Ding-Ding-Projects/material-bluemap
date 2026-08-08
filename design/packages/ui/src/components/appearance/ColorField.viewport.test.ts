// @vitest-environment node

/**
 * Viewport-width contract for the one colour-picker popover.
 *
 * A DOM-only unit test cannot prove layout because jsdom has no layout engine. This contract
 * instead locks both halves of the CSS mechanism the real browser relies on: the menu panel
 * owns a viewport-relative width, and its child gives up the old unconditional 280px floor.
 * Keeping both assertions together prevents a future parent-only clamp that the child can
 * silently defeat.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const colorField = readFileSync(resolve(here, "ColorField.vue"), "utf8");
const picker = readFileSync(resolve(here, "InfiniteColorPicker.vue"), "utf8");

function rule(source: string, selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${escaped}\\s*\\{[^}]*\\}`, "s").exec(source)?.[0] ?? "";
}

describe("colour-picker popover viewport sizing", () => {
    it("keeps the painted panel inside a narrow visual viewport", () => {
        const panel = rule(colorField, ".mb-color-field__panel");

        expect(panel).toContain("box-sizing: border-box");
        expect(panel).toContain("inline-size: min(320px, 92vw)");
        expect(panel).toContain("max-inline-size: calc(100vw - 16px)");
        expect(panel).toContain("overflow-y: auto");
    });

    it("lets the picker shrink with its panel instead of enforcing 280px", () => {
        const root = rule(picker, ".mb-color-picker");

        expect(root).toContain("box-sizing: border-box");
        expect(root).toContain("inline-size: 100%");
        expect(root).toContain("min-inline-size: min(280px, 100%)");
        expect(root).toContain("max-inline-size: 100%");
        expect(root).not.toMatch(/\bmin-width:\s*280px/);
    });
});
