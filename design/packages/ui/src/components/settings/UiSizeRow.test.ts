// @vitest-environment jsdom

/**
 * `UiSizeRow.vue`, mounted: that it shows Standard preselected on a fresh profile, that
 * pressing a stop genuinely resizes the interface - the document root's zoom in this
 * DOM, since jsdom has no preload bridge - and persists the choice, and that Reset puts
 * everything back. `uiSizeSetting.test.ts` already proves the rules underneath; this
 * file is the wiring between the buttons on screen and that shared state, the same split
 * `NotificationDurationRow.test.ts` draws.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import {
    DEFAULT_UI_SIZE_LEVEL,
    UI_SIZE_KEY,
    changeUiSize,
    currentUiSizeLevel,
} from "./uiSizeSetting.js";
import UiSizeRow from "./UiSizeRow.vue";

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
    return mount(UiSizeRow, { global: { plugins: [vuetify, i18n] } });
}

beforeEach(() => {
    localStorage.clear();
    changeUiSize(DEFAULT_UI_SIZE_LEVEL);
});

afterEach(() => {
    localStorage.clear();
    changeUiSize(DEFAULT_UI_SIZE_LEVEL);
});

describe("the dial", () => {
    it("shows Standard preselected on a fresh profile, with the default chip on it", () => {
        const wrapper = mountRow();
        const pressed = wrapper.findAll("[aria-pressed='true']");
        expect(pressed).toHaveLength(1);
        expect(pressed[0]!.text()).toContain("1 · Standard");
        expect(pressed[0]!.text()).toContain("Default");
        wrapper.unmount();
    });

    it("pressing Large genuinely resizes the interface and persists the choice", async () => {
        const wrapper = mountRow();
        const large = wrapper
            .findAll("button")
            .find((button) => button.text().includes("3 · Large"));
        expect(large).toBeDefined();

        await large!.trigger("click");

        expect(currentUiSizeLevel.value).toBe(3);
        expect(localStorage.getItem(UI_SIZE_KEY)).toBe("3");
        expect(document.documentElement.style.getPropertyValue("zoom")).toBe("1.5");
        expect(wrapper.text()).toContain("150%");
        wrapper.unmount();
    });

    it("Reset puts the designed size back, and is disabled once it has nothing to undo", async () => {
        const wrapper = mountRow();
        const reset = () =>
            wrapper.findAll("button").find((button) => button.text().includes("Reset to Standard"));
        expect(reset()!.attributes("disabled")).toBeDefined();

        const largest = wrapper
            .findAll("button")
            .find((button) => button.text().includes("5 · Largest"));
        await largest!.trigger("click");
        expect(reset()!.attributes("disabled")).toBeUndefined();

        await reset()!.trigger("click");
        expect(currentUiSizeLevel.value).toBe(DEFAULT_UI_SIZE_LEVEL);
        expect(document.documentElement.style.getPropertyValue("zoom")).toBe("");
        wrapper.unmount();
    });
});

describe("holding its shape at every size", () => {
    it("lets the toggle wrap and grow instead of clipping five labels into a fixed row", async () => {
        // The whole section exists to fix sizing failures, so its own control must not
        // ship one: `v-btn-toggle` hard-codes a single-row fixed-height group, and these
        // are the two declarations that undo that. Asserted on the shipped rule text the
        // way every clipping regression test here does - `test.css` is off, so a mounted
        // component shows no cascade to assert on.
        const source = (await import("./UiSizeRow.vue?raw")).default as string;
        const rule = /\.mb-ui-size__toggle\s*\{[^}]*\}/s.exec(source)?.[0] ?? "";
        expect(rule).toContain("display: grid !important");
        expect(rule).toContain("grid-auto-rows: minmax(48px, auto)");
        expect(rule).toContain("height: auto !important");
    });
});
