/**
 * @vitest-environment jsdom
 *
 * The page mounted, for the things only a mounted page can answer: the two empty states, and
 * the actual regression the user reported - unmounting this page (navigating away) and
 * mounting a fresh one (navigating back) must still show a render that is still going, with
 * live progress, rather than nothing. `activeRenders.test.ts` proves the same thing at the
 * model layer; this proves the page built on top of it does not lose it again on the way to
 * the DOM.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import RendersScreen from "./RendersScreen.vue";
import type {
    RenderEvent,
    RenderResult,
    RenderSummary,
    WorldBridge,
} from "../world/worldBridge.js";

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
 * A bridge whose "main process" state - what is active, what each render's record says -
 * lives outside any one subscriber, exactly like the real orchestrator. Listeners come and
 * go as components mount and unmount; `active`/`records` do not.
 */
function fakeWorldBridge(): WorldBridge & {
    setActive(ids: readonly string[]): void;
    setRecord(renderId: string, summary: RenderSummary): void;
    emit(event: RenderEvent): void;
    cancelledIds: string[];
} {
    let active: readonly string[] = [];
    const records = new Map<string, RenderSummary>();
    const listeners = new Set<(event: RenderEvent) => void>();
    const cancelledIds: string[] = [];

    return {
        setActive: (ids) => {
            active = ids;
        },
        setRecord: (renderId, summary) => records.set(renderId, summary),
        emit: (event) => {
            for (const listener of listeners) listener(event);
        },
        cancelledIds,
        startRender: (): Promise<RenderResult> => Promise.reject(new Error("not used")),
        cancelRender: (renderId: string) => {
            cancelledIds.push(renderId);
            return Promise.resolve(true);
        },
        adjustRenderSpeed: (renderId) =>
            Promise.resolve({
                ok: false,
                renderId,
                level: 3,
                route: "unsupported",
                appliedNow: false,
                needsRestart: false,
                reason: "not-running",
                message: "not used by this test",
                detail: null,
            }),
        listRenders: () => Promise.resolve([...records.values()]),
        renderEngine: (renderId: string) => Promise.resolve(records.get(renderId) ?? null),
        activeRenders: () => Promise.resolve(active),
        interruptedRenders: () => Promise.resolve([]),
        resumeRender: (renderId: string) =>
            Promise.resolve({
                started: false,
                refusal: { ok: false, renderId, code: "no-session", message: "not used" },
            }),
        dismissResume: () => Promise.resolve(false),
        onRenderEvent: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        readConsent: () => Promise.resolve({ accepted: true }),
    };
}

function summary(renderId: string): RenderSummary {
    return {
        renderId,
        outcome: "running",
        engine: "BlueMap engine (Java) 5.22-27",
        engineId: "upstream-java",
        maps: [
            {
                id: "overworld",
                name: "Overworld",
                world: "C:/worlds/Frostpeak",
                dimension: "minecraft:overworld",
            },
        ],
        startedAt: new Date().toISOString(),
        finishedAt: null,
        durationMs: null,
        dataRoot: null,
    };
}

describe("RendersScreen", () => {
    it("shows the checking state, then the honest empty state when nothing is running", async () => {
        const bridge = fakeWorldBridge();
        const screen = mount(RendersScreen, {
            props: { worldBridge: bridge, containerOffersBridge: null, ciRenderBridge: null },
            global: { plugins: [vuetify, i18n()] },
        });

        expect(screen.find('[data-test="empty-checking"]').exists()).toBe(true);
        expect(screen.find('[data-test="empty-none"]').exists()).toBe(false);

        await flushPromises();

        expect(screen.find('[data-test="empty-checking"]').exists()).toBe(false);
        expect(screen.find('[data-test="empty-none"]').exists()).toBe(true);
        screen.unmount();
    });

    it("keeps a render visible with live progress across a navigate-away-and-back cycle", async () => {
        const bridge = fakeWorldBridge();
        bridge.setActive(["render-1"]);
        bridge.setRecord("render-1", summary("render-1"));

        // First mount: the surface a person would have watched this from.
        const first = mount(RendersScreen, {
            props: { worldBridge: bridge, containerOffersBridge: null, ciRenderBridge: null },
            global: { plugins: [vuetify, i18n()] },
        });
        await flushPromises();
        expect(first.text()).toContain("Frostpeak");
        expect(first.text()).toContain("Overworld");

        // Navigating away: the page - and everything it privately held about this render -
        // is torn down. Nothing here touches `bridge`, exactly as `WorldScreen.vue`'s own
        // `onBeforeUnmount` never calls `cancelRender`.
        first.unmount();

        // The render keeps going while nobody is watching, the same way a container render
        // keeps going after the app that started it closes.
        bridge.emit({
            type: "progress",
            renderId: "render-1",
            phase: "rendering",
            task: {
                kind: "updating-map",
                mapId: "overworld",
                description: "updating map 'overworld'",
                percent: 61,
                etaSeconds: 45,
                etaText: null,
            },
            at: new Date().toISOString(),
        });

        // Navigating back: a brand-new page, built with no memory of the first one.
        const second = mount(RendersScreen, {
            props: { worldBridge: bridge, containerOffersBridge: null, ciRenderBridge: null },
            global: { plugins: [vuetify, i18n()] },
        });
        await flushPromises();

        expect(second.find('[data-test="empty-none"]').exists()).toBe(false);
        expect(second.text()).toContain("Frostpeak");
        expect(second.text()).toContain("Overworld");

        second.unmount();
    });

    it("emits an open-console target when a row's Open console is pressed", async () => {
        const bridge = fakeWorldBridge();
        bridge.setActive(["render-1"]);
        bridge.setRecord("render-1", summary("render-1"));

        const screen = mount(RendersScreen, {
            props: { worldBridge: bridge, containerOffersBridge: null, ciRenderBridge: null },
            global: { plugins: [vuetify, i18n()] },
        });
        await flushPromises();

        const button = screen
            .findAll("button")
            .find((candidate) => candidate.text().includes("Open console"));
        expect(button).toBeDefined();
        await button?.trigger("click");

        const emitted = screen.emitted("openConsole");
        expect(emitted).toBeDefined();
        expect(emitted?.[0]?.[0]).toEqual({ page: "world", focusRenderId: "render-1" });
        screen.unmount();
    });

    it("never cancels from a bare click on the bulk Stop button - it only opens the gate", async () => {
        const bridge = fakeWorldBridge();
        bridge.setActive(["render-1"]);
        bridge.setRecord("render-1", summary("render-1"));

        const screen = mount(RendersScreen, {
            props: { worldBridge: bridge, containerOffersBridge: null, ciRenderBridge: null },
            global: { plugins: [vuetify, i18n()] },
        });
        await flushPromises();

        // Select the one row, then reveal the bulk bar's cancel gate.
        const checkbox = screen.find('input[type="checkbox"]');
        await checkbox.setValue(true);
        await flushPromises();

        const stopButton = screen
            .findAll("button")
            .find((candidate) => candidate.text().includes("Stop 1 selected"));
        expect(stopButton).toBeDefined();
        await stopButton?.trigger("click");
        await flushPromises();

        // The click only opens `ConfigSuperConfirm`'s own menu; nothing is cancelled until
        // both keys are set and the slider travels its full range, neither of which happened.
        expect(bridge.cancelledIds).toEqual([]);
        screen.unmount();
    });
});
