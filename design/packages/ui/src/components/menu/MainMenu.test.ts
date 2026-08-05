// @vitest-environment jsdom

/**
 * "Go Fullscreen" used to go dim with no explanation.
 *
 * `document.fullscreenEnabled` is false when the browser itself refuses the Fullscreen
 * API here - most often because the page is embedded in a frame nobody granted the
 * permission to - and `MenuOption`'s `disabled` prop on its own tells nobody that: a
 * screen reader hears "Go Fullscreen, dimmed" and a sighted person sees a greyed-out row,
 * neither any wiser than a click would have left them. This pins the fix: the row now
 * carries a tooltip naming the reason whenever fullscreen is unavailable, and carries none
 * when it is available, matching the `:disabled`/`v-tooltip` pairing `ConfigScreen.vue`
 * already uses for its own "no bridge" rows.
 *
 * `MainMenu` needs a running app before it renders anything (`v-if="app"` guards the whole
 * side sheet), so this builds the smallest object that satisfies what the component
 * actually reads: a menu already open on the root page, and nothing else. Nothing here
 * imports `@material-bluemap/viewer`'s internal `MainMenu` class - the fake only has to
 * look like one from the outside.
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
import MainMenu from "./MainMenu.vue";
import MenuOption from "./MenuOption.vue";

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

const vuetify = createVuetify({ components, directives });

function i18n() {
    return createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

/** The root page, already open, which is all `pageId === 'root'` needs to show the list. */
function fakeApp(): BlueMapApp {
    return {
        appState: {
            menu: {
                isOpen: true,
                pageStack: [{ id: "root", title: "Menu" }],
                currentPage: () => ({ id: "root", title: "Menu" }),
                openPage: () => undefined,
                closePage: () => undefined,
                closeAll: () => undefined,
            },
            theme: null,
        },
        events: new EventTarget(),
    } as unknown as BlueMapApp;
}

/** `VApp` provides the layout injection `v-navigation-drawer` (the side sheet) needs. */
const Host = defineComponent({
    setup() {
        return () => h(VApp, null, { default: () => [h(MainMenu, { bluemap: fakeApp() })] });
    },
});

function render() {
    return mount(Host, {
        global: { plugins: [vuetify, i18n()] },
        attachTo: document.body,
    });
}

/** Real fullscreen support varies by test runner; each test states its own case. */
function setFullscreenEnabled(value: boolean): void {
    Object.defineProperty(document, "fullscreenEnabled", {
        configurable: true,
        value,
    });
}

afterEach(() => {
    setFullscreenEnabled(true);
});

describe("the fullscreen row's disabled reason", () => {
    it("carries no tooltip while fullscreen is available", () => {
        setFullscreenEnabled(true);
        const wrapper = render();

        const option = wrapper
            .findAllComponents(MenuOption)
            .find((candidate) => candidate.text().includes("Go Fullscreen"));
        expect(option).toBeDefined();
        expect(option?.props("disabled")).toBe(false);
        expect(option?.props("tooltip")).toBe("");

        wrapper.unmount();
    });

    it("names the reason when the browser refuses fullscreen here", () => {
        setFullscreenEnabled(false);
        const wrapper = render();

        const option = wrapper
            .findAllComponents(MenuOption)
            .find((candidate) => candidate.text().includes("Go Fullscreen"));
        expect(option).toBeDefined();
        expect(option?.props("disabled")).toBe(true);
        expect(option?.props("tooltip")).toBeTruthy();
        expect(option?.props("tooltip")).toContain("Fullscreen");

        wrapper.unmount();
    });
});
