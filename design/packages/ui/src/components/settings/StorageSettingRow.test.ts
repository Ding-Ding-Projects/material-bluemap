// @vitest-environment jsdom

/**
 * `StorageSettingRow.vue`'s browse affordance: the shared `PathField` picking a folder
 * writes straight into the same field typing does, through `props.setting.value`.
 *
 * Everything else about this row - the relative-path refusal, the save/revert cycle, the
 * "this is the default" hint - is already exercised end to end through `AppSettings.vue`'s
 * own mount in `AppSettings.test.ts`. This file is narrowly about the one thing that
 * changed: the row no longer draws a row-local "Choose folder" button gated on
 * `props.setting.canBrowse` (backed by `chooseMapStorageDirectory`, which nothing on the
 * real preload implements - `mapStorageSetting.test.ts` still covers that dead pair
 * directly), and instead adopts `PathField`, which probes `window.materialBluemap.dialog`.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { memoryStorage, setSetupStorage } from "../setup/setupPrefs.js";
import { createMapStorageSetting } from "./mapStorageSetting.js";
import StorageSettingRow from "./StorageSettingRow.vue";

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

function browseButton(wrapper: ReturnType<typeof mount>) {
    return wrapper
        .findAll("button")
        .find((candidate) => candidate.attributes("aria-label")?.startsWith("Browse for") === true);
}

afterEach(() => {
    setSetupStorage(memoryStorage());
    delete (globalThis as { materialBluemap?: unknown }).materialBluemap;
});

describe("browsing for the folder", () => {
    it("writes the picked folder through the same v-model typing uses, via the shared PathField", async () => {
        setSetupStorage(memoryStorage());
        (globalThis as { materialBluemap?: unknown }).materialBluemap = {
            dialog: {
                pickFolder: async () => "/picked/maps",
                pickFile: async () => null,
            },
        };

        const setting = createMapStorageSetting({ bridge: null, platform: "linux" });
        const wrapper = mount(StorageSettingRow, {
            props: { setting, missing: false },
            global: { plugins: [vuetify, i18n] },
        });

        const button = browseButton(wrapper);
        expect(button).toBeDefined();
        expect(button?.attributes("disabled")).toBeUndefined();

        await button?.trigger("click");

        expect(setting.value.value).toBe("/picked/maps");

        wrapper.unmount();
    });

    it("disables the browse button, and draws no dead 'Choose folder' fallback, when there is no dialog bridge", () => {
        setSetupStorage(memoryStorage());
        const setting = createMapStorageSetting({ bridge: null, platform: "linux" });
        const wrapper = mount(StorageSettingRow, {
            props: { setting, missing: false },
            global: { plugins: [vuetify, i18n] },
        });

        const button = browseButton(wrapper);
        expect(button).toBeDefined();
        expect(button?.attributes("disabled")).toBeDefined();
        // The old row-local button is gone entirely, not merely hidden by another name.
        expect(wrapper.text()).not.toContain("Choose folder");

        wrapper.unmount();
    });

    it("leaves the field untouched on a cancelled pick", async () => {
        setSetupStorage(memoryStorage());
        (globalThis as { materialBluemap?: unknown }).materialBluemap = {
            dialog: {
                pickFolder: async () => null,
                pickFile: async () => null,
            },
        };

        const setting = createMapStorageSetting({ bridge: null, platform: "linux" });
        setting.value.value = "/keep/me";
        const wrapper = mount(StorageSettingRow, {
            props: { setting, missing: false },
            global: { plugins: [vuetify, i18n] },
        });

        await browseButton(wrapper)?.trigger("click");

        expect(setting.value.value).toBe("/keep/me");

        wrapper.unmount();
    });
});
