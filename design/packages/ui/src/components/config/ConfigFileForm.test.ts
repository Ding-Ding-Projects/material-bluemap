import { describe, expect, it } from "vitest";

/**
 * Regression: `<v-card-title>` defaults to `overflow: hidden; text-overflow: ellipsis;
 * white-space: nowrap` for a single-line block title (Vuetify's own `VCard.css`). That
 * `white-space: nowrap` is inherited by everything underneath it, including a `<v-btn>`'s
 * own `.v-btn__content` (which sets `white-space: nowrap` again, redundantly, directly).
 * `.mb-config-form__source-head` turns the card title into a flex row so the "Show the file
 * as it will be written" and "Copy" buttons sit side by side, but `display: flex` alone does
 * not clear `overflow: hidden` on the ancestor - so at a narrow width, or with the longer
 * bilingual button labels, a button could be silently cut off rather than wrapping to a
 * second line.
 *
 * `test.css` is not enabled for this suite's `vitest.config.ts`, so a `?raw` import reads
 * the exact rule the fix landed in rather than relying on jsdom's own (absent) CSS cascade,
 * the same way `ConfigApplyDialog.test.ts` reads its own CSS fixes.
 */
describe("the source-view head, which shares its <v-card-title> with two buttons", () => {
    it("clears the inherited overflow, text-overflow and white-space so the buttons can wrap", async () => {
        const source = (await import("./ConfigFileForm.vue?raw")).default as string;
        const match = /\.mb-config-form__source-head\s*\{[^}]*\}/.exec(source);
        expect(match).not.toBeNull();
        const rule = match?.[0] ?? "";
        expect(rule).toMatch(/overflow:\s*visible/);
        expect(rule).toMatch(/text-overflow:\s*clip/);
        expect(rule).toMatch(/white-space:\s*normal/);
    });
});
