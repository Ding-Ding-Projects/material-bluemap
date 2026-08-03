// @vitest-environment jsdom

/**
 * The render panel, mounted.
 *
 * Its most load-bearing sentences live in the template rather than in a function,
 * so nothing next door reaches them: where the tiles ended up, how long is left,
 * and how much output the engine produced. Each carries a value through vue-i18n's
 * fallback path, which is where a value goes missing without anything looking
 * broken — "Finished in . The tiles are in ." still reads like a sentence, and a
 * person who wants to open their map is told nothing about where it is.
 *
 * So the i18n here is the real one, built the way `i18n.ts` builds it: no messages
 * loaded, every key falling back. That is the state a build without translations
 * stays in, and the state this panel is nearly always rendered in.
 */

import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import RenderRunPanel from "./RenderRunPanel.vue";
import { createRenderRun } from "./renderRun.js";
import type { EngineDescription, RenderEvent, RenderResult, WorldBridge } from "./worldBridge.js";

const ENGINE: EngineDescription = {
    id: "upstream-java",
    label: "BlueMap engine (Java) 5.22-27 on Java 25.0.3",
    version: "5.22-27",
    javaVersion: "25.0.3",
};

const PENDING: RenderResult = {
    ok: true,
    renderId: "world-abc",
    dataRoot: "/var/maps/world-abc",
    mapIds: ["survival"],
    engine: ENGINE,
    durationMs: 254_000,
};

/** A bridge that never resolves its render, so the run stays where the test puts it. */
function fakeBridge() {
    const listeners: ((event: RenderEvent) => void)[] = [];
    const bridge: WorldBridge = {
        startRender: () => new Promise<RenderResult>(() => undefined),
        cancelRender: async () => true,
        listRenders: async () => [],
        renderEngine: async () => null,
        interruptedRenders: async () => [],
        resumeRender: async () => ({
            started: false,
            refusal: { ok: false, renderId: "world-abc", code: "no-session", message: "" },
        }),
        dismissResume: async () => true,
        onRenderEvent: (listener) => {
            listeners.push(listener);
            return () => listeners.splice(listeners.indexOf(listener), 1);
        },
        readConsent: async () => ({ accepted: true }),
    };
    return {
        bridge,
        emit(event: RenderEvent): void {
            for (const listener of [...listeners]) listener(event);
        },
    };
}

const vuetify = createVuetify();

/** The options `i18n.ts` ships: no messages, so every key falls back. */
function i18n() {
    return createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

/** A started run, plus the handle that feeds it engine events. */
function startedRun() {
    const fake = fakeBridge();
    const run = createRenderRun(fake.bridge);
    void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
    fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });
    return { fake, run };
}

function render(run: ReturnType<typeof createRenderRun>) {
    return mount(RenderRunPanel, { props: { run }, global: { plugins: [vuetify, i18n()] } });
}

describe("what the panel says, rendered", () => {
    it("names the duration and the folder the tiles went into", () => {
        const { fake, run } = startedRun();
        fake.emit({
            type: "finished",
            renderId: "world-abc",
            dataRoot: "/var/maps/world-abc",
            mapIds: ["survival"],
            engine: ENGINE,
            durationMs: PENDING.durationMs,
            at: "t9",
        });

        const wrapper = render(run);

        expect(wrapper.text()).toContain("Finished in 4 minutes. The tiles are in /var/maps/world-abc.");
        wrapper.unmount();
        run.dispose();
    });

    it("shows the engine's own estimate rather than 'about left'", () => {
        const { fake, run } = startedRun();
        fake.emit({
            type: "progress",
            renderId: "world-abc",
            phase: "rendering",
            task: { kind: "map", mapId: "survival", description: "survival", percent: 8.5, etaSeconds: 240, etaText: "4m 12s" },
            at: "t1",
        });

        const wrapper = render(run);

        expect(wrapper.text()).toContain("about 4m 12s left");
        wrapper.unmount();
        run.dispose();
    });

    it("puts a bare number of seconds into words when the engine sends only a number", () => {
        const { fake, run } = startedRun();
        fake.emit({
            type: "progress",
            renderId: "world-abc",
            phase: "rendering",
            task: { kind: "map", mapId: "survival", description: "survival", percent: 8.5, etaSeconds: 254, etaText: null },
            at: "t1",
        });

        const wrapper = render(run);

        expect(wrapper.text()).toContain("about 4 minutes left");
        wrapper.unmount();
        run.dispose();
    });

    it("counts the engine's output lines on the button that reveals them", () => {
        const { fake, run } = startedRun();
        for (const line of ["one", "two", "three"]) {
            fake.emit({ type: "log", renderId: "world-abc", level: "info", message: line, at: "t" });
        }

        const wrapper = render(run);

        expect(wrapper.text()).toContain("Show the engine's output (3 lines)");
        wrapper.unmount();
        run.dispose();
    });
});
