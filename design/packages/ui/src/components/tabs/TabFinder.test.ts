/**
 * The finder owns a separate render path for group names from TabResultList:
 * its own group search renders a colour chip below the button that opens that
 * group. Keep the CSS assertion separate so the two paths cannot regress in
 * lockstep behind a shared test.
 */

import { describe, expect, it } from "vitest";

describe("TabFinder group-name chip", () => {
    it("wraps the full user-authored name inside a compact meta row", async () => {
        const source = (await import("./TabFinder.vue?raw")).default as string;
        const chipRule = /\.mb-tabs-finder__group-name\.v-chip\s*\{[^}]*\}/.exec(source)?.[0] ?? "";
        const contentRule =
            /\.mb-tabs-finder__group-name\s+\.v-chip__content\s*\{[^}]*\}/.exec(source)?.[0] ?? "";

        expect(chipRule).toContain("min-width: 0");
        expect(chipRule).toContain("max-width: 100%");
        expect(chipRule).toContain("height: auto");
        expect(contentRule).toContain("white-space: normal");
        expect(contentRule).toContain("overflow-wrap: anywhere");
    });
});
