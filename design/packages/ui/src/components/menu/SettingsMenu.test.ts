// @vitest-environment jsdom

/**
 * Settling the visual audit's Priority 3 finding for `menu-search.png`
 * (`docs/visual-audit-2026-08-05.md`): does typing into the viewer's in-map Settings menu
 * search genuinely filter the rendered list, or does it show a match count while leaving
 * content unfiltered underneath it?
 *
 * It was a real, confirmed defect for one specific shape of group. `show()` correctly
 * narrows a switch- or slider-based group down to the member whose own label matches -
 * searching "sunlight" genuinely hides the Ambient-Light slider beside it, and always did.
 * But every group built on `MenuOptionList` (View/Controls, Resolution, Theme, Language)
 * used to hand it the *entire* unfiltered options array regardless of the query:
 * `MenuOptionList` itself has no filtering of its own, so once the group's outer
 * `v-if="show(...)"` passed because *any one* member matched, every sibling option
 * rendered whether or not it individually matched. Searching "Perspective" - a name that
 * is not a substring of "Flat" or "Free-Flight" - used to show all three, which is exactly
 * the "9 of 60, but the panel looks unfiltered" shape the audit flagged, reproducing on a
 * specific, deliberately chosen query rather than only on the audit's short "re" (which
 * spuriously matches several group *titles* too, a separate and milder effect the second
 * describe block below is about).
 *
 * Fixed in `SettingsMenu.vue` by filtering what actually reaches each `MenuOptionList`
 * down to the options `show()` itself would keep - the group's own title, plus that one
 * option's own name - the same two-candidate rule every switch- and slider-based group
 * already applies per member, so a category-name search still reveals the whole category
 * (`visibleQualityOptions` etc.) while an option-specific search now narrows to it.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { VApp } from "vuetify/components";
import type { BlueMapApp } from "@material-bluemap/viewer";
import SettingsMenu from "./SettingsMenu.vue";

const storageCells = new Map<string, string>();

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

    // `menuPrefs.ts`'s `openFlags` is a module singleton wired to a real `watch()` at
    // import time - see `menuPrefs.test.ts`'s own doc comment for why a stand-in
    // `localStorage` has to be installed on `globalThis` before any mutation runs rather
    // than injected.
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => storageCells.get(key) ?? null,
            setItem: (key: string, value: string) => void storageCells.set(key, value),
            removeItem: (key: string) => void storageCells.delete(key),
            clear: () => storageCells.clear(),
            key: (index: number) => [...storageCells.keys()][index] ?? null,
            get length() {
                return storageCells.size;
            },
        } as unknown as Storage,
    });
});

afterEach(() => {
    storageCells.clear();
});

const vuetify = createVuetify({ components, directives });

function i18n() {
    return createI18n({
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

/**
 * A running app with three view modes, real lighting/resolution/theme/language state, and
 * every mutator `SettingsMenu.vue` might call - built so every group in the menu renders,
 * not just the ones a narrower fake would happen to show.
 */
function fakeApp(): BlueMapApp {
    return {
        appState: {
            menu: { isOpen: true, pageStack: [], currentPage: () => null, openPage: () => undefined, closePage: () => undefined, closeAll: () => undefined },
            theme: null,
            controls: {
                state: "perspective",
                pauseTileLoading: false,
                showZoomButtons: false,
                mouseSensitivity: 1,
                invertMouse: false,
            },
            screenshot: { clipboard: false },
            debug: false,
        },
        mapViewer: {
            data: {
                map: {
                    perspectiveView: true,
                    flatView: true,
                    freeFlightView: true,
                    views: [{}, {}, {}],
                },
                uniforms: {
                    sunlightStrength: { value: 1 },
                    ambientLight: { value: 1 },
                    chunkBorders: { value: false },
                },
                superSampling: 1,
                loadedHiresViewDistance: 100,
                loadedLowresViewDistance: 1000,
            },
            redraw: () => undefined,
            updateLoadedMapArea: () => undefined,
        },
        settings: {
            hiresSliderMin: 50,
            hiresSliderMax: 500,
            lowresSliderMin: 500,
            lowresSliderMax: 10000,
        },
        saveUserSettings: () => undefined,
        saveUserSetting: () => undefined,
        setPerspectiveView: () => undefined,
        setFlatView: () => undefined,
        setFreeFlight: () => undefined,
        setTheme: () => undefined,
        setChunkBorders: () => undefined,
        setDebug: () => undefined,
        resetSettings: () => undefined,
        updateControlsSettings: () => undefined,
        updatePageAddress: () => undefined,
        events: new EventTarget(),
    } as unknown as BlueMapApp;
}

const Host = defineComponent({
    setup() {
        return () => h(VApp, null, { default: () => [h(SettingsMenu, { bluemap: fakeApp() })] });
    },
});

function render() {
    return mount(Host, {
        global: { plugins: [vuetify, i18n()] },
        attachTo: document.body,
    });
}

/**
 * Opens the search bar and types into it, the same two steps the capture harness does.
 *
 * `useMenuSearch`'s open/closed disclosure is a module-level singleton persisted across
 * every mount (see `menuPrefs.ts`), so a later test in this file can start already open
 * from an earlier one's click - clicking the toggle unconditionally would close it again
 * instead. Checking first, and only clicking when the field is not already on screen,
 * keeps this helper correct regardless of what ran before it.
 */
async function search(wrapper: ReturnType<typeof render>, query: string): Promise<void> {
    if (!wrapper.find(".mb-menu-search input").exists()) {
        await wrapper.find(".mb-menu-searchbar__head button").trigger("click");
        await wrapper.vm.$nextTick();
    }
    const input = wrapper.find(".mb-menu-search input");
    await input.setValue(query);
    await wrapper.vm.$nextTick();
}

describe("MenuOptionList-based groups now filter their own members", () => {
    it("hides a sibling view option whose own name does not match, once a specific option is searched for", async () => {
        const wrapper = render();
        await search(wrapper, "Perspective");

        const text = wrapper.text();
        // "Perspective" is what was searched for and is expected on screen.
        expect(text).toContain("Perspective");
        // Neither "Flat" nor "Free-Flight" contains "Perspective" as a substring, and
        // "View / Controls" (the group's own title) does not either, so a genuinely
        // filtered list drops them - the defect this test used to pin was that it did not.
        expect(text).not.toContain("Flat");
        expect(text).not.toContain("Free-Flight");
    });

    it("hides sibling resolution options whose own names do not match a specific query", async () => {
        const wrapper = render();
        await search(wrapper, "High");

        const text = wrapper.text();
        expect(text).toContain("High (SSAA x2)");
        // Neither "Normal (Native x1)" nor "Low (Upscaling x0.5)" contains "High", and
        // "Resolution" (the group's own title) does not either.
        expect(text).not.toContain("Normal (Native x1)");
        expect(text).not.toContain("Low (Upscaling x0.5)");
    });

    it("still reveals every option in the category when the category's own name is searched for", async () => {
        // The deliberate behaviour every switch- and slider-based group already has -
        // searching the group's own title reveals the whole group - is preserved here too:
        // "Resolution" itself matches the group title, so all three options stay, exactly
        // as searching "Render Distance" still shows every render-distance slider.
        const wrapper = render();
        await search(wrapper, "Resolution");

        const text = wrapper.text();
        expect(text).toContain("High (SSAA x2)");
        expect(text).toContain("Normal (Native x1)");
        expect(text).toContain("Low (Upscaling x0.5)");
    });
});

describe("switch- and slider-based groups do filter their own members", () => {
    it("hides a sibling slider whose own label does not match, once the group title itself does not either", async () => {
        const wrapper = render();
        await search(wrapper, "Sunlight");

        const text = wrapper.text();
        expect(text).toContain("Sunlight");
        // "Ambient-Light" does not contain "Sunlight", and "Lighting" (the group's own
        // title) does not either, so the per-child `show()` check genuinely narrows here.
        expect(text).not.toContain("Ambient-Light");
    });

    it("reports an honest empty state when nothing on the page matches", async () => {
        const wrapper = render();
        await search(wrapper, "xyz-nothing-matches-this-zzz");

        expect(wrapper.text()).toContain("Nothing matches that search");
        expect(wrapper.text()).not.toContain("Sunlight");
        expect(wrapper.text()).not.toContain("Perspective");
    });
});
