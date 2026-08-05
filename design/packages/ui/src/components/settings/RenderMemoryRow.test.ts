// @vitest-environment jsdom

/**
 * `RenderMemoryRow.vue`, mounted: that it shows the automatic default preselected, that
 * switching to Manual and pressing Save really calls through to the setting object with
 * the field's own value, and that Reset really puts it back to automatic. The setting
 * object's own round trip through a bridge is `renderMemorySetting.test.ts`'s job; this
 * file is the wiring between the buttons on screen and that object, the same split
 * `StorageSettingRow.test.ts` draws for its own row.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { createRenderMemorySetting } from "./renderMemorySetting.js";
import RenderMemoryRow from "./RenderMemoryRow.vue";
import type {
    RenderMemoryReadout,
    RenderMemoryWriteRequest,
    RenderMemoryWriteResult,
    SettingsBridge,
} from "./settingsBridge.js";

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

function fakeBridge(): SettingsBridge & { readonly written: RenderMemoryWriteRequest[] } {
    const state: RenderMemoryReadout = {
        mode: "automatic",
        megabytes: 4096,
        recommendedMegabytes: 4096,
        machineMegabytes: 16384,
        minimumMegabytes: 1024,
        automaticCeilingMegabytes: 8192,
        explanation: "Chosen automatically: the render may use up to 4096 MB (4.0 GB).",
        jvmArgs: ["-Xmx4096m"],
    };
    const written: RenderMemoryWriteRequest[] = [];

    return {
        written,
        renderMemory: () => Promise.resolve({ ...state }),
        setRenderMemory: (setting): Promise<RenderMemoryWriteResult> => {
            written.push(setting);
            if (setting.mode === "automatic") {
                state.mode = "automatic";
                state.megabytes = state.recommendedMegabytes;
            } else {
                state.mode = "manual";
                state.megabytes = setting.megabytes;
            }
            state.jvmArgs = [`-Xmx${String(state.megabytes)}m`];
            return Promise.resolve({ ok: true, setting: { ...state } });
        },
    };
}

afterEach(() => {
    delete (globalThis as { materialBluemap?: unknown }).materialBluemap;
});

describe("the default view", () => {
    it("shows Automatic preselected, with the explanation and no manual field", async () => {
        const bridge = fakeBridge();
        const setting = createRenderMemorySetting({ bridge });
        await setting.load();

        const wrapper = mount(RenderMemoryRow, {
            props: { setting },
            global: { plugins: [vuetify, i18n] },
        });
        await wrapper.vm.$nextTick();

        expect(wrapper.text()).toContain("4096 MB");
        // The manual field only appears once Manual is chosen.
        expect(wrapper.find("input[type='number']").exists()).toBe(false);
        // Reset is disabled: automatic already is the stored setting, nothing to put back.
        const reset = wrapper.findAll("button").find((btn) => btn.text() === "Reset to automatic");
        expect(reset?.attributes("disabled")).toBeDefined();

        wrapper.unmount();
    });

    it("says plainly when this build cannot report the setting at all", () => {
        const setting = createRenderMemorySetting({ bridge: null });
        const wrapper = mount(RenderMemoryRow, {
            props: { setting },
            global: { plugins: [vuetify, i18n] },
        });

        expect(wrapper.text()).toContain("cannot report or change");

        wrapper.unmount();
    });
});

describe("switching to Manual and saving", () => {
    it("Save writes exactly the number in the field, through the setting object", async () => {
        const bridge = fakeBridge();
        const setting = createRenderMemorySetting({ bridge });
        await setting.load();

        const wrapper = mount(RenderMemoryRow, {
            props: { setting },
            global: { plugins: [vuetify, i18n] },
        });
        await wrapper.vm.$nextTick();

        const manualButton = wrapper.findAll("button").find((btn) => btn.text() === "Manual");
        await manualButton?.trigger("click");
        await wrapper.vm.$nextTick();

        const field = wrapper.find("input[type='number']");
        expect(field.exists()).toBe(true);
        await field.setValue("3072");

        const save = wrapper.findAll("button").find((btn) => btn.text() === "Save this limit");
        await save?.trigger("click");
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        // The row never talks to the bridge directly - it only ever goes through the
        // setting object, and this is that object's own record of what was actually sent.
        expect(bridge.written).toEqual([{ mode: "manual", megabytes: 3072 }]);
        expect(wrapper.text()).toContain("Saved.");

        wrapper.unmount();
    });
});

describe("resetting", () => {
    it("Reset puts a manual value back to automatic, through the setting object", async () => {
        const bridge = fakeBridge();
        const setting = createRenderMemorySetting({ bridge });
        await setting.load();
        setting.mode.value = "manual";
        setting.megabytes.value = "3072";
        await setting.save();

        const wrapper = mount(RenderMemoryRow, {
            props: { setting },
            global: { plugins: [vuetify, i18n] },
        });
        await wrapper.vm.$nextTick();

        const reset = wrapper.findAll("button").find((btn) => btn.text() === "Reset to automatic");
        expect(reset?.attributes("disabled")).toBeUndefined();
        await reset?.trigger("click");
        await wrapper.vm.$nextTick();
        await wrapper.vm.$nextTick();

        expect(bridge.written.at(-1)).toEqual({ mode: "automatic" });
        expect(setting.mode.value).toBe("automatic");
        expect(wrapper.find("input[type='number']").exists()).toBe(false);

        wrapper.unmount();
    });
});
