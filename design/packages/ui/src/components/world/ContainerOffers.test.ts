import { describe, expect, it } from "vitest";

/**
 * Regression: `<v-card-title>` defaults to `overflow: hidden; text-overflow: ellipsis;
 * white-space: nowrap` for a single-line block title (Vuetify's own `VCard.css`).
 * `.mb-container-offers__head` turns it into a flex row so the "where" and map-id chips sit
 * beside the container name, but `display: flex` alone does not clear any of the three
 * inherited properties: `overflow: hidden` still clips, and the inherited `nowrap` means
 * `offer.containerName` - a Docker container name, with no length limit this component
 * controls - never gets a line to break on. A long container name was silently cut off with
 * no ellipsis and no indication anything was missing, matching the same defect this project
 * already fixed once in `DockerWorldSourcePanel.vue`'s
 * `.mb-docker-world__card > .v-card-title`.
 *
 * `test.css` is not enabled for this suite's `vitest.config.ts`, so a `?raw` import reads
 * the exact rule the fix landed in rather than relying on jsdom's own (absent) CSS cascade,
 * the same way `ConfigApplyDialog.test.ts` reads its own CSS fixes.
 */
describe("the container-offer card head, which shares its <v-card-title> with two chips", () => {
    it("clears the inherited overflow, text-overflow and white-space so the container name can wrap", async () => {
        const source = (await import("./ContainerOffers.vue?raw")).default as string;
        const match = /\.mb-container-offers__head\s*\{[^}]*\}/.exec(source);
        expect(match).not.toBeNull();
        const rule = match?.[0] ?? "";
        expect(rule).toMatch(/overflow:\s*visible/);
        expect(rule).toMatch(/text-overflow:\s*clip/);
        expect(rule).toMatch(/white-space:\s*normal/);
    });
});
