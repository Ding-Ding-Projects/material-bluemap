// @vitest-environment jsdom

/**
 * `ThemeRow.vue`, mounted: that all four choices are offered with the system one
 * preselected on a fresh profile, that pressing one genuinely changes the shared theme
 * record - the same record the viewer's own menu writes - and that the row reflects a
 * choice made elsewhere. `themeSetting.test.ts` already proves the two-writer
 * convergence rules; this file is the buttons on top of them.
 */

import { nextTick } from "vue";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { setBlueMapApp } from "../../stores/bluemap.js";
import { THEME_STORAGE_KEY, changeTheme, currentTheme } from "./themeSetting.js";
import ThemeRow from "./ThemeRow.vue";

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
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

function mountRow(): ReturnType<typeof mount> {
    return mount(ThemeRow, { global: { plugins: [vuetify, i18n] } });
}

beforeEach(async () => {
    setBlueMapApp(null);
    localStorage.clear();
    changeTheme(null);
    await nextTick();
});

afterEach(async () => {
    setBlueMapApp(null);
    localStorage.clear();
    changeTheme(null);
    await nextTick();
});

describe("the theme row", () => {
    it("offers all four choices with follow-the-system preselected on a fresh profile", () => {
        const wrapper = mountRow();
        const labels = wrapper.findAll(".v-btn-group button").map((button) => button.text());
        expect(labels).toEqual(["Default (System/Browser)", "Dark", "Light", "Contrast"]);

        const pressed = wrapper.findAll("[aria-pressed='true']");
        expect(pressed).toHaveLength(1);
        expect(pressed[0]!.text()).toContain("Default (System/Browser)");
        wrapper.unmount();
    });

    it("pressing Dark writes the viewer's own stored record, with no map open at all", async () => {
        const wrapper = mountRow();
        const dark = wrapper.findAll("button").find((button) => button.text() === "Dark");
        await dark!.trigger("click");

        expect(currentTheme.value).toBe("dark");
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(JSON.stringify("dark"));
        wrapper.unmount();
    });

    it("reflects a choice made elsewhere, so two controls cannot disagree", async () => {
        const wrapper = mountRow();
        changeTheme("contrast");
        await nextTick();

        const pressed = wrapper.findAll("[aria-pressed='true']");
        expect(pressed).toHaveLength(1);
        expect(pressed[0]!.text()).toContain("Contrast");
        wrapper.unmount();
    });
});
