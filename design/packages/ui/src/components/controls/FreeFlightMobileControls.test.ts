// @vitest-environment jsdom

/**
 * The mobile free-flight cluster, mounted.
 *
 * The cluster only reveals itself after a touch (so a mouse-only desktop never sees it), but a
 * touch-capable device can still have a mouse or trackpad -- a 2-in-1 laptop, a touchscreen
 * all-in-one. Once revealed, the buttons must still respond to a plain mouse click and not only
 * to another touch or to Tab+Enter/Space. This is exactly the part a logic-only test cannot
 * vouch for, because the bug was a missing template binding, not a wrong function.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { VApp } from "vuetify/components";
import { h } from "vue";
import type { BlueMapApp } from "@worldlens/viewer";
import FreeFlightMobileControls from "./FreeFlightMobileControls.vue";
import { setBlueMapApp } from "../../stores/bluemap.js";

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

// `createVuetify()` alone registers nothing; `<v-btn>` needs the real components so the test
// exercises the actual rendered button, not Vue's unresolved-tag fallback.
const vuetify = createVuetify({ components, directives });

const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

/** Just enough of the running viewer for `onFrame` to have somewhere to write. */
function fakeApp(): { app: BlueMapApp; events: EventTarget; position: { x: number; y: number; z: number } } {
    const events = document.createElement("div");
    const position = { x: 0, y: 0, z: 0 };
    const app = {
        events,
        mapViewer: {
            controlsManager: {
                position,
                rotation: 0,
            },
        },
    };
    return { app: app as unknown as BlueMapApp, events, position };
}

/** Dispatches the render-frame event the component listens for, driving `onFrame` once. */
function tickFrame(events: EventTarget, delta = 100): void {
    events.dispatchEvent(new CustomEvent("bluemapRenderFrame", { detail: { delta } }));
}

let wrapper: VueWrapper | null = null;

function render(): VueWrapper {
    const mounted = mount(
        {
            render: () => h(VApp, null, { default: () => [h(FreeFlightMobileControls)] }),
        },
        { attachTo: document.body, global: { plugins: [vuetify, i18n] } },
    );
    wrapper = mounted;
    return mounted;
}

/** The cluster stays hidden (`v-show`) until a touch reveals it, exactly like a real device. */
function revealCluster(): void {
    window.dispatchEvent(new Event("touchstart"));
}

beforeEach(() => {
    setBlueMapApp(null);
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    setBlueMapApp(null);
    document.body.innerHTML = "";
});

describe("FreeFlightMobileControls", () => {
    it("stays hidden until the first touch, and reveals on one", async () => {
        const mounted = render();
        const cluster = mounted.find(".mb-ff-controls");
        expect(cluster.isVisible()).toBe(false);

        revealCluster();
        await mounted.vm.$nextTick();
        expect(cluster.isVisible()).toBe(true);
    });

    it("drives forward movement from a mouse click, not only a touch or keyboard", async () => {
        const { app, events, position } = fakeApp();
        setBlueMapApp(app);
        const mounted = render();
        revealCluster();
        await mounted.vm.$nextTick();

        const forwardButton = mounted.find(".mb-ff-controls__cluster--move .mb-ff-controls__btn");
        expect(forwardButton.exists()).toBe(true);

        // Held with a mouse: mousedown starts the move, a render frame integrates it.
        await forwardButton.trigger("mousedown");
        tickFrame(events);
        expect(position.z).not.toBe(0);

        // Releasing the mouse must stop it again, exactly like lifting a touch or a key.
        const movedTo = position.z;
        await forwardButton.trigger("mouseup");
        tickFrame(events);
        expect(position.z).toBe(movedTo);
    });

    it("stops the move if the mouse leaves the button while held, like releasing it", async () => {
        const { app, events, position } = fakeApp();
        setBlueMapApp(app);
        const mounted = render();
        revealCluster();
        await mounted.vm.$nextTick();

        const upButton = mounted.find(".mb-ff-controls__cluster--height .mb-ff-controls__btn");
        await upButton.trigger("mousedown");
        tickFrame(events);
        expect(position.y).not.toBe(0);

        const movedTo = position.y;
        await upButton.trigger("mouseleave");
        tickFrame(events);
        expect(position.y).toBe(movedTo);
    });

    it("still drives height with keyboard hold, unaffected by the mouse path", async () => {
        const { app, events, position } = fakeApp();
        setBlueMapApp(app);
        const mounted = render();
        revealCluster();
        await mounted.vm.$nextTick();

        const upButton = mounted.find(".mb-ff-controls__cluster--height .mb-ff-controls__btn");
        await upButton.trigger("keydown.enter");
        tickFrame(events);
        expect(position.y).not.toBe(0);

        await upButton.trigger("keyup");
        tickFrame(events);
        const movedTo = position.y;
        tickFrame(events);
        expect(position.y).toBe(movedTo);
    });
});
