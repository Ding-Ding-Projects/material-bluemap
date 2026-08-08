// @vitest-environment jsdom

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { generateConfigSet } from "@worldlens/config";
import ConfigFileForm from "./ConfigFileForm.vue";
import { loadWorkspace } from "./configWorkspace.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;

    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;
});

const vuetify = createVuetify();
const i18n = createI18n({
    legacy: false,
    locale: "none",
    fallbackLocale: "none",
    missingWarn: false,
    fallbackWarn: false,
    messages: {},
});

function mountForm() {
    const workspace = loadWorkspace(
        "/srv/bluemap/config",
        generateConfigSet({
            webroot: "/srv/bluemap/web",
            dataFolder: "/srv/bluemap/data",
            world: "/srv/minecraft/world",
            version: "5.22",
        }),
    );
    const core = workspace.entries.find((entry) => entry.key === "core");
    if (core === undefined) throw new Error("generated workspace has no core config");
    return mount(ConfigFileForm, {
        props: { file: core.file },
        global: { plugins: [vuetify, i18n] },
    });
}

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

describe("the config-group heading inside its expansion-panel flex row", () => {
    it("lets the label shrink and wrap while the trailing count stays readable", async () => {
        const source = (await import("./ConfigFileForm.vue?raw")).default as string;
        const labelRule = /\.mb-config-form__group\s*\{[^}]*\}/.exec(source)?.[0] ?? "";
        const countRule = /\.mb-config-form__count\s*\{[^}]*\}/.exec(source)?.[0] ?? "";

        expect(labelRule).toContain("min-width: 0");
        expect(labelRule).toMatch(/overflow-wrap:\s*anywhere/);
        expect(countRule).toMatch(/flex-shrink:\s*0/);
    });
});

describe("the raw-source disclosure", () => {
    it("points aria-controls at the source region it reveals", async () => {
        const view = mountForm();
        const toggle = view
            .findAll("button")
            .find((button) => button.text().includes("Show the file"));
        if (toggle === undefined) throw new Error("source disclosure toggle was not rendered");

        expect(toggle.attributes("aria-expanded")).toBe("false");
        const controlsId = toggle.attributes("aria-controls");
        expect(controlsId).toBeTruthy();
        expect(view.find(`#${controlsId}`).exists()).toBe(false);

        await toggle.trigger("click");

        expect(toggle.attributes("aria-expanded")).toBe("true");
        const source = view.find(`#${controlsId}`);
        expect(source.exists()).toBe(true);
        expect(source.element.tagName).toBe("DIV");
        expect(source.text()).toContain("accept-download");
        view.unmount();
    });
});
