// @vitest-environment jsdom

/**
 * The banner, mounted.
 *
 * Every claim here is one only the rendered component can answer: that Restart really is
 * unreachable while a render runs, that the exact version really appears in the text at the
 * silliest funny level, that bilingual mode really renders a second line with its own `lang`
 * so a screen reader switches voice, and that "Later" really emits rather than installing.
 * The rules underneath are unit-tested next door in `updateModel.test.ts`; this is the
 * wiring, which is the part a green logic test cannot vouch for.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import { h } from "vue";
import UpdateBanner from "./UpdateBanner.vue";
import { bannerFor, unknownUpdateState } from "./updateModel.js";
import { memoryStorage, setSetupStorage } from "../setup/setupPrefs.js";
import { reloadSetupLanguage, resetSetupLanguage, setFunnyLevel, setLanguageMode } from "../setup/setupI18n.js";
import type { UpdateState } from "./updateBridge.js";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's components observe their own size.
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

beforeEach(() => {
    setSetupStorage(memoryStorage());
    reloadSetupLanguage();
});

const mounted: VueWrapper[] = [];

afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    resetSetupLanguage();
});

function ready(overrides: Partial<UpdateState> = {}): UpdateState {
    return { ...unknownUpdateState("0.1.0"), status: "ready", readyVersion: "0.2.0", ...overrides };
}

function render(state: UpdateState): VueWrapper {
    const vuetify = createVuetify();
    const model = bannerFor(state);
    const wrapper = mount(
        {
            render: () => h(VApp, null, { default: () => [h(UpdateBanner, { model })] }),
        },
        { global: { plugins: [vuetify] } },
    );
    mounted.push(wrapper);
    return wrapper;
}

describe("UpdateBanner", () => {
    it("renders nothing at all when there is no update staged", () => {
        const wrapper = render(unknownUpdateState("0.1.0"));
        expect(wrapper.find(".mb-update-banner").exists()).toBe(false);
    });

    it("names the exact version, and does not block anything", () => {
        const wrapper = render(ready());
        const banner = wrapper.find(".mb-update-banner");
        expect(banner.exists()).toBe(true);
        expect(banner.text()).toContain("0.2.0");
        // Announced, never modal: a status region, not a dialog.
        expect(banner.attributes("role")).toBe("status");
        expect(banner.attributes("aria-live")).toBe("polite");
    });

    it("keeps the version exact at the silliest funny level", () => {
        setFunnyLevel("en", 5);
        const wrapper = render(ready({ readyVersion: "0.2.0-rc.1" }));
        expect(wrapper.find(".mb-update-banner").text()).toContain("0.2.0-rc.1");
    });

    it("offers Restart, and emits rather than installing anything itself", async () => {
        const wrapper = render(ready());
        const restart = wrapper.findComponent(UpdateBanner);
        await wrapper.find(".mb-update-banner__restart").trigger("click");
        expect(restart.emitted("restart")).toHaveLength(1);
    });

    it("holds Restart while a render runs, and says so in the body", async () => {
        const wrapper = render(ready({ renderInProgress: true }));
        const button = wrapper.find(".mb-update-banner__restart");
        expect(button.attributes("disabled")).toBeDefined();

        await button.trigger("click");
        expect(wrapper.findComponent(UpdateBanner).emitted("restart")).toBeUndefined();
        // The body changes too. A disabled button with unchanged copy leaves the user
        // guessing whether the app is broken or busy.
        expect(wrapper.find(".mb-update-banner").text().toLowerCase()).toContain("render");
    });

    it("dismisses without installing", async () => {
        const wrapper = render(ready());
        await wrapper.find(".mb-update-banner__later").trigger("click");
        const banner = wrapper.findComponent(UpdateBanner);
        expect(banner.emitted("dismiss")).toHaveLength(1);
        expect(banner.emitted("restart")).toBeUndefined();
    });

    it("offers the release notes only when the feed gave a link, and emits the url", async () => {
        expect(render(ready()).find(".mb-update-banner__notes").exists()).toBe(false);

        const wrapper = render(ready({ releaseNotesUrl: "https://example.test/r" }));
        await wrapper.find(".mb-update-banner__notes").trigger("click");
        expect(wrapper.findComponent(UpdateBanner).emitted("open-notes")).toEqual([
            ["https://example.test/r"],
        ]);
    });

    it("renders both languages in bilingual mode, and marks the Cantonese run", () => {
        setLanguageMode("bilingual");
        const wrapper = render(ready());
        const secondary = wrapper.findAll(".mb-update-banner__secondary");
        expect(secondary.length).toBeGreaterThan(0);
        // Without this a screen reader reads Cantonese through an English synthesiser.
        expect(secondary[0]?.attributes("lang")).toBe("zh-HK");
    });

    it("renders one language only in Cantonese mode, and still names the version", () => {
        setLanguageMode("yue");
        const wrapper = render(ready());
        expect(wrapper.findAll(".mb-update-banner__secondary").length).toBe(0);
        expect(wrapper.find(".mb-update-banner").text()).toContain("0.2.0");
    });
});
