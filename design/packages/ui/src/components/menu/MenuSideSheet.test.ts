/**
 * The side sheet's own stacking rule.
 *
 * `AppSettings.vue` mounts `DockedSurface.vue`, and a user can persist that panel's
 * placement to the left edge (`dockPlacement.ts`'s `DOCK_PLACEMENTS` includes `"left"`,
 * stored per surface id). That is the same edge this drawer opens on, and nothing in
 * `App.vue` closes or inerts the main menu when Settings opens (`openSettings()` only
 * flips `settingsOpen`). Both panels used to paint at the identical `z-index: 1500`, so
 * which one a user actually sees and can click was left to accidental paint order rather
 * than to either component's own rule.
 *
 * This suite's `vitest.config.ts` (`design/vitest.config.ts`) does not enable `test.css`,
 * so a mounted component's `<style>` block is never actually injected into
 * `document.head` under jsdom -- `getComputedStyle` comes back empty regardless of what
 * either file declares. A `?raw` import sidesteps CSS processing entirely (Vite's
 * plain-text asset loader) and reads the exact rule each fix lives in, the same way a
 * reviewer would.
 */

import { describe, expect, it } from "vitest";

/** The first `{ ... }` block whose selector is exactly `selector`, not a `selector--foo`. */
function ruleFor(source: string, selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`${escaped}\\s*\\{[^}]*\\}`).exec(source);
    return match?.[0] ?? "";
}

function zIndexOf(rule: string): number {
    const match = /z-index:\s*(\d+)/.exec(rule);
    if (match === null) throw new Error(`no z-index found in rule: ${rule || "(empty)"}`);
    return Number(match[1]);
}

describe("stacking against a same-edge docked surface", () => {
    it("sits above DockedSurface.vue's `.mb-docked`, not tied to it", async () => {
        const sheetSource = (await import("./MenuSideSheet.vue?raw")).default as string;
        const dockedSource = (
            await import("../settings/DockedSurface.vue?raw")
        ).default as string;

        const sheetRule = ruleFor(sheetSource, ".mb-side-sheet.v-navigation-drawer");
        const dockedRule = ruleFor(dockedSource, ".mb-docked");

        expect(sheetRule).not.toBe("");
        expect(dockedRule).not.toBe("");

        const sheetZ = zIndexOf(sheetRule);
        const dockedZ = zIndexOf(dockedRule);

        // Regression: both were `1500`, so a main menu opened over a left-docked Settings
        // panel (or vice versa) collided at a tied z-index with no defined winner.
        expect(sheetZ).toBeGreaterThan(dockedZ);
    });
});
