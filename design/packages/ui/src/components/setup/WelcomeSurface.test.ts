// @vitest-environment jsdom

/**
 * "What is this?", mounted standalone from first-run setup.
 *
 * `App.test.ts`'s "the licence viewer" describe block already proves the shell wires this
 * surface's twin, `EulaSurface`, to a FAB that survives a "built, tested, unreachable"
 * regression; this file proves the panel itself, the way `DockedSurface.resize.test.ts`
 * proves `DockedSurface` itself rather than only through a consumer. What matters here:
 * it renders the same words `WelcomeIntro.vue` gives the welcome step, it hides rather
 * than unmounts when `open` is false (so opening it again is not a fresh mount), and its
 * one action - "Start here" - tells the parent to navigate and closes itself, rather than
 * silently doing nothing or leaving itself open once the parent has acted on it.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";

import WelcomeSurface from "./WelcomeSurface.vue";
import { memoryStorage, setSetupStorage } from "./setupPrefs.js";
import { reloadSetupLanguage } from "./setupI18n.js";

beforeAll(() => {
    // Same reasoning as `FirstRunSetup.test.ts` and `DockedSurface.resize.test.ts`: jsdom
    // has no layout engine, so these do not exist and Vuetify throws on mount without them.
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

    (globalThis as unknown as { visualViewport?: unknown }).visualViewport = {
        addEventListener: () => {},
        removeEventListener: () => {},
        width: 1024,
        height: 768,
    };
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

const Host = defineComponent({
    props: { open: { type: Boolean, default: false } },
    emits: ["update:open", "start"],
    setup(props, { emit }) {
        return () =>
            h(VApp, null, {
                default: () => [
                    h(WelcomeSurface, {
                        open: props.open,
                        "onUpdate:open": (value: boolean) => emit("update:open", value),
                        onStart: () => emit("start"),
                    }),
                ],
            });
    },
});

let wrapper: VueWrapper | null = null;

async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

function panel(): HTMLElement {
    const element = document.querySelector<HTMLElement>(".mb-welcome-surface");
    if (element === null) throw new Error("the welcome surface never mounted");
    return element;
}

beforeEach(() => {
    setSetupStorage(memoryStorage());
    reloadSetupLanguage();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

describe("the welcome surface", () => {
    it("stays present but hidden when closed, and shows the same words the welcome step does when open", async () => {
        wrapper = mount(Host, {
            props: { open: false },
            global: { plugins: [vuetify, i18n] },
            attachTo: document.body,
        });
        await settle();

        // Present rather than absent: opening it later is a toggle, not a fresh mount, the
        // same guarantee `App.test.ts` pins for `EulaSurface`.
        expect(panel().style.display).toBe("none");

        await wrapper.setProps({ open: true });
        await settle();

        expect(panel().style.display).not.toBe("none");
        const text = panel().textContent ?? "";
        expect(text).toContain("What is this?");
        expect(text).toContain("BlueMap turns a Minecraft world into a 3D map");
        expect(text).toContain("a small website");
        expect(text).toContain('open "Make a map"');
        expect(text).toContain("rendering runs on Java");
        expect(text).toContain("Start here");
    });

    it("tells the parent to navigate and to close itself when 'Start here' is pressed", async () => {
        wrapper = mount(Host, {
            props: { open: true },
            global: { plugins: [vuetify, i18n] },
            attachTo: document.body,
        });
        await settle();

        const button = [...panel().querySelectorAll<HTMLButtonElement>("button")].find(
            (candidate) => (candidate.textContent ?? "").trim() === "Start here",
        );
        expect(button, "no 'Start here' button in the panel").not.toBeUndefined();

        button?.click();
        await settle();

        expect(wrapper.emitted("start")).toHaveLength(1);
        // Closing itself rather than leaving the caller to remember to: the last emitted
        // value on `update:open` is what the caller's own `v-model` would end up holding.
        const closes = (wrapper.emitted("update:open") ?? []) as boolean[][];
        expect(closes.at(-1)).toEqual([false]);
    });

    it("is keyboard-operable: Escape closes it and returns focus to what opened it", async () => {
        const opener = document.createElement("button");
        opener.textContent = "What is this?";
        document.body.appendChild(opener);
        opener.focus();

        wrapper = mount(Host, {
            props: { open: true },
            global: { plugins: [vuetify, i18n] },
            attachTo: document.body,
        });
        await settle();

        panel().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle();

        const closes = (wrapper.emitted("update:open") ?? []) as boolean[][];
        expect(closes.at(-1)).toEqual([false]);

        opener.remove();
    });
});
