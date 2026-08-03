// @vitest-environment jsdom

/**
 * The shell, mounted, from the outside.
 *
 * Every claim here is about a door rather than about a room. The options editor, the
 * notification corner and the surfaces behind them are all tested on their own next door;
 * what none of those tests can see is whether anything in the running application ever
 * reaches them. This project's recurring defect is a finished feature nobody can open, so
 * these assertions start where a user starts - at a button in the corner - and go through
 * the rendered DOM rather than through the component's internals.
 *
 * Two things are checked that only a mounted shell can answer: that Escape gives the focus
 * back to the button that opened the surface, and that exactly one notification corner is
 * on screen. Both are invisible to a test that pokes at state.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import App from "./App.vue";
import { ConfigScreen } from "./components/config/index.js";
import { dismissAll } from "./components/config/notifications.js";
import { notices, raiseNotice } from "./stores/notices.js";

beforeAll(() => {
    // jsdom has no layout engine, so none of these exist: Vuetify's overlays observe their
    // own size, `matchMedia` backs the theme bridge's prefers-color-scheme check, and
    // `scrollIntoView` is called by the settings surface. Without them the mount throws
    // before any assertion runs.
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

    // Focus lands back on a tooltip activator, which opens the tooltip, which positions
    // itself against `visualViewport` - implemented by every browser this ships in and by
    // no version of jsdom.
    Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: {
            width: 1024,
            height: 768,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
            addEventListener: () => {},
            removeEventListener: () => {},
        },
    });
});

/** Registered as `vuetify.ts` registers them; `createVuetify()` alone registers nothing. */
const vuetify = createVuetify({ components, directives });

/** The options `i18n.ts` ships: no messages, so every key falls back to its English string. */
function i18n() {
    return createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

let wrapper: VueWrapper | null = null;

/**
 * With no profile active the shell shows the world wizard, which is the state a fresh
 * install is in and the one the configuration button has to work from too. No bridge is
 * installed, so nothing here can touch a disk.
 */
function shell(): VueWrapper {
    wrapper = mount(App, { global: { plugins: [vuetify, i18n()] }, attachTo: document.body });
    return wrapper;
}

/** Several ticks: opening the surface focuses it on the next one, and it mounts on another. */
async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

function configFab(): HTMLButtonElement {
    const button = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Server configuration"]',
    );
    if (button === null) throw new Error("the shell renders no configuration button");
    return button;
}

/** The full-bleed host, identified the way a screen reader finds it. */
function configHost(): HTMLElement | null {
    return document.querySelector<HTMLElement>(
        '[role="region"][aria-label="Server configuration"]',
    );
}

beforeEach(() => {
    dismissAll(notices);
    notices.history.length = 0;
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

describe("the configuration button", () => {
    it("sits with the other shell controls and says it opens nothing yet", () => {
        shell();

        expect(configFab().getAttribute("aria-expanded")).toBe("false");
        expect(configHost()).toBeNull();
    });

    it("opens the editor into a full-bleed host rather than a floating card", async () => {
        const app = shell();

        configFab().click();
        await settle();

        const host = configHost();
        expect(host).not.toBeNull();
        expect(host?.classList.contains("mb-world-host")).toBe(true);
        expect(app.findComponent(ConfigScreen).exists()).toBe(true);
        expect(configFab().getAttribute("aria-expanded")).toBe("true");
    });

    it("leaves the wizard behind it mounted but inert, so four steps of work survive a look at the config", async () => {
        shell();
        const worldHost = document.querySelector(".mb-world-host");

        configFab().click();
        await settle();

        expect(worldHost?.isConnected).toBe(true);
        expect(worldHost?.hasAttribute("inert")).toBe(true);
    });

    it("closes on Escape and hands the focus back to itself", async () => {
        const app = shell();

        configFab().click();
        await settle();

        const host = configHost();
        expect(document.activeElement).toBe(host);

        await app.find('[role="region"][aria-label="Server configuration"]').trigger("keydown", {
            key: "Escape",
        });
        await settle();

        expect(configHost()).toBeNull();
        expect(document.activeElement).toBe(configFab());
    });
});

describe("the notification corner", () => {
    it("is mounted once by the shell, whether or not the editor is open", async () => {
        shell();

        expect(document.querySelectorAll(".mb-config-notices")).toHaveLength(1);

        configFab().click();
        await settle();

        // Two mounted corners would paint two fixed stacks and show every notice twice,
        // which is the whole reason the editor no longer carries one of its own.
        expect(document.querySelectorAll(".mb-config-notices")).toHaveLength(1);
    });

    it("shows a message raised while nothing is open", async () => {
        shell();

        raiseNotice("warning", "The render engine is not installed.");
        await settle();

        expect(document.querySelector(".mb-config-notices")?.textContent).toContain(
            "The render engine is not installed.",
        );
    });
});

describe("a saved config folder", () => {
    it("closes the surface and names the folder that was written", async () => {
        const app = shell();

        configFab().click();
        await settle();

        app.findComponent(ConfigScreen).vm.$emit("saved", "/srv/bluemap/config");
        await settle();

        expect(configHost()).toBeNull();
        expect(document.activeElement).toBe(configFab());
        expect(document.querySelector(".mb-config-notices")?.textContent).toContain(
            "Saved the BlueMap configuration in /srv/bluemap/config.",
        );
    });
});
