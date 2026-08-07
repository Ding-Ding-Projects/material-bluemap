// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ActionArtwork from "./ActionArtwork.vue";
import { ACTION_ARTWORK } from "./actionArtwork.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));

/**
 * This is intentionally not discovered by a glob: omitting a dialog from a glob-produced
 * inventory is exactly the silent gap this test exists to catch.
 */
const EXPECTED_ACTIONS = {
    cloudRenderSetup: {
        owner: "components/cirender/CiRenderScreen.vue",
        filename: "cloud-render-setup.png",
        alt: "A local Minecraft world travelling through a cloud render pipeline and returning as a finished map",
    },
    localRenderSpeed: {
        owner: "components/config/SpeedControl.vue",
        filename: "local-render-speed.png",
        alt: "A desktop workstation turning terrain chunks into a map at five increasing processing levels",
    },
    restartToInstall: {
        owner: "components/update/UpdateBanner.vue",
        filename: "restart-to-install.png",
        alt: "A completed update package ready beside a workstation while the open map remains safely visible",
    },
    repositoryPublication: {
        owner: "components/backup/BackupScreen.vue",
        filename: "repository-publication.png",
        alt: "A world folder split into checked archive parts and uploaded into a repository vault",
    },
    configDeleteConfirmation: {
        owner: "components/config/ConfigApplyDialog.vue",
        filename: "config-delete-confirmation.png",
        alt: "Changed configuration pages being reviewed before selected files move into a deletion tray",
    },
} as const;

describe("action-specific artwork inventory", () => {
    it("maps every declared action to one unique bundled file and semantic alt", () => {
        expect(
            Object.fromEntries(
                Object.entries(ACTION_ARTWORK).map(([id, row]) => [
                    id,
                    {
                        owner: row.owner,
                        filename: row.filename,
                        alt: row.alt,
                    },
                ]),
            ),
        ).toEqual(EXPECTED_ACTIONS);

        const filenames = Object.values(ACTION_ARTWORK).map((row) => row.filename);
        expect(new Set(filenames).size).toBe(filenames.length);

        for (const row of Object.values(ACTION_ARTWORK)) {
            expect(row.action.trim().length).toBeGreaterThan(12);
            expect(row.alt.trim().length).toBeGreaterThan(20);
            expect(
                existsSync(resolve(testDirectory, "../../assets/action-artwork", row.filename)),
                `${row.action} is missing ${row.filename}`,
            ).toBe(true);
        }
    });

    it("wires every inventoried action into its exact owning surface", () => {
        for (const [id, row] of Object.entries(ACTION_ARTWORK)) {
            const owner = readFileSync(resolve(testDirectory, "../../", row.owner), "utf8");
            expect(owner, `${row.owner} does not render ${id}`).toContain(`artwork="${id}"`);
        }
    });

    it("renders a responsive real image with semantic fallback text and no fake controls", () => {
        const wrapper = mount(ActionArtwork, { props: { artwork: "cloudRenderSetup" } });
        const image = wrapper.get("img");

        expect(image.attributes("alt")).toBe(EXPECTED_ACTIONS.cloudRenderSetup.alt);
        expect(image.attributes("loading")).toBe("lazy");
        expect(image.attributes("decoding")).toBe("async");
        expect(wrapper.findAll("button")).toHaveLength(0);
        expect(wrapper.attributes("data-action-artwork")).toBe("cloudRenderSetup");
    });

    it("honours translated alt text and explicit eager loading", () => {
        const wrapper = mount(ActionArtwork, {
            props: {
                artwork: "restartToInstall",
                alt: "準備好重新啟動安裝更新的電腦",
                eager: true,
            },
        });

        expect(wrapper.get("img").attributes("alt")).toBe("準備好重新啟動安裝更新的電腦");
        expect(wrapper.get("img").attributes("loading")).toBe("eager");
    });

    it("pins narrow and reduced-motion layout rules in the shipped component", async () => {
        const source = (await import("./ActionArtwork.vue?raw")).default as string;
        expect(source).toContain("aspect-ratio: 16 / 7");
        expect(source).toContain("@media (max-width: 560px)");
        expect(source).toContain("aspect-ratio: 4 / 3");
        expect(source).toContain("object-fit: cover");
        expect(source).toContain("@media (prefers-reduced-motion: reduce)");
    });
});
