import { describe, expect, it } from "vitest";

const VIEWPORT_CLAMP = "calc(100vw - 16px)";

describe("tab finder and group menu narrow-width sizing", () => {
    it.each([
        ["TabFinder.vue", ".mb-tabs-finder", import("./TabFinder.vue?raw")],
        ["TabGroupMenu.vue", ".mb-tabs-group-menu", import("./TabGroupMenu.vue?raw")],
    ])("keeps %s inside the tab-sheet viewport clamp", async (_fileName, selector, sourceModule) => {
        const source = (await sourceModule).default as string;
        const selectorPattern = selector.replace(".", "\\.");
        const rule = new RegExp(`${selectorPattern}\\s*\\{[^}]*\\}`).exec(source)?.[0] ?? "";

        expect(rule).toContain(`width: min(`);
        expect(rule).toContain(VIEWPORT_CLAMP);
        expect(rule).toContain("min-width: 0");
        expect(rule).toContain("box-sizing: border-box");
    });
});
