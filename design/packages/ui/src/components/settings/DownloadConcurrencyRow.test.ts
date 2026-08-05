// @vitest-environment jsdom

/**
 * `DownloadConcurrencyRow.vue`, mounted: that it shows the default preselected, that
 * typing a new number and pressing Save really calls through to the setting object with
 * the field's own value, and that Reset really puts it back to the default. The setting
 * object's own round trip through a bridge is `downloadConcurrencySetting.test.ts`'s job;
 * this file is the wiring between the controls on screen and that object, the same split
 * `RenderMemoryRow.test.ts` draws for its own row.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { createDownloadConcurrencySetting } from "./downloadConcurrencySetting.js";
import DownloadConcurrencyRow from "./DownloadConcurrencyRow.vue";
import type { DownloadConcurrencyReadout, DownloadConcurrencyWriteResult, SettingsBridge } from "./settingsBridge.js";

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

    Element.prototype.scrollIntoView = () => {};
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

/** The bridge's own readout is `readonly` for every real caller; this fake is the one place allowed to mutate it. */
type MutableReadout = { -readonly [Key in keyof DownloadConcurrencyReadout]: DownloadConcurrencyReadout[Key] };

function fakeBridge(): SettingsBridge & { readonly written: number[] } {
    const state: MutableReadout = {
        workers: 4,
        isDefault: true,
        defaultWorkers: 4,
        minimumWorkers: 1,
        maximumWorkers: 16,
        explanation: "Up to 4 parts of a split download are fetched at once.",
    };
    const written: number[] = [];

    return {
        written,
        downloadConcurrency: () => Promise.resolve({ ...state }),
        setDownloadConcurrency: (workers): Promise<DownloadConcurrencyWriteResult> => {
            written.push(workers);
            state.workers = workers;
            state.isDefault = workers === state.defaultWorkers;
            state.explanation = `Up to ${String(workers)} parts of a split download are fetched at once.`;
            return Promise.resolve({ ok: true, setting: { ...state } });
        },
    };
}

afterEach(() => {
    delete (globalThis as { materialBluemap?: unknown }).materialBluemap;
});

describe("the default view", () => {
    it("shows four preselected, with the explanation, and Reset disabled", async () => {
        const bridge = fakeBridge();
        const setting = createDownloadConcurrencySetting({ bridge });
        await setting.load();

        const wrapper = mount(DownloadConcurrencyRow, {
            props: { setting },
            global: { plugins: [vuetify, i18n] },
        });
        await wrapper.vm.$nextTick();

        const field = wrapper.find("input[type='number']");
        expect(field.exists()).toBe(true);
        expect((field.element as HTMLInputElement).value).toBe("4");
        expect(wrapper.text()).toContain("Up to 4 parts");
        // Reset is disabled: the default is already the stored setting, nothing to put back.
        const reset = wrapper.findAll("button").find((btn) => btn.text() === "Reset to default");
        expect(reset?.attributes("disabled")).toBeDefined();

        wrapper.unmount();
    });

    it("says plainly when this build cannot report the setting at all", () => {
        const setting = createDownloadConcurrencySetting({ bridge: null });
        const wrapper = mount(DownloadConcurrencyRow, {
            props: { setting },
            global: { plugins: [vuetify, i18n] },
        });

        expect(wrapper.text()).toContain("cannot report or change");

        wrapper.unmount();
    });
});

describe("changing the number and saving", () => {
    it("Save writes exactly the number in the field, through the setting object", async () => {
        const bridge = fakeBridge();
        const setting = createDownloadConcurrencySetting({ bridge });
        await setting.load();

        const wrapper = mount(DownloadConcurrencyRow, {
            props: { setting },
            global: { plugins: [vuetify, i18n] },
        });
        await wrapper.vm.$nextTick();

        const field = wrapper.find("input[type='number']");
        await field.setValue("8");

        const save = wrapper.findAll("button").find((btn) => btn.text() === "Save this limit");
        await save?.trigger("click");
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        // The row never talks to the bridge directly - it only ever goes through the
        // setting object, and this is that object's own record of what was actually sent.
        expect(bridge.written).toEqual([8]);
        expect(wrapper.text()).toContain("Saved.");

        wrapper.unmount();
    });

    it("disables Save while the field holds a value outside the bounds", async () => {
        const bridge = fakeBridge();
        const setting = createDownloadConcurrencySetting({ bridge });
        await setting.load();

        const wrapper = mount(DownloadConcurrencyRow, {
            props: { setting },
            global: { plugins: [vuetify, i18n] },
        });
        await wrapper.vm.$nextTick();

        const field = wrapper.find("input[type='number']");
        await field.setValue("99");
        await wrapper.vm.$nextTick();

        const save = wrapper.findAll("button").find((btn) => btn.text() === "Save this limit");
        expect(save?.attributes("disabled")).toBeDefined();
        expect(bridge.written).toHaveLength(0);

        wrapper.unmount();
    });
});

describe("resetting", () => {
    it("Reset puts a changed value back to the default, through the setting object", async () => {
        const bridge = fakeBridge();
        const setting = createDownloadConcurrencySetting({ bridge });
        await setting.load();
        setting.workers.value = "8";
        await setting.save();

        const wrapper = mount(DownloadConcurrencyRow, {
            props: { setting },
            global: { plugins: [vuetify, i18n] },
        });
        await wrapper.vm.$nextTick();

        const reset = wrapper.findAll("button").find((btn) => btn.text() === "Reset to default");
        expect(reset?.attributes("disabled")).toBeUndefined();
        await reset?.trigger("click");
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        expect(bridge.written.at(-1)).toBe(4);
        expect(setting.workers.value).toBe("4");

        wrapper.unmount();
    });
});
