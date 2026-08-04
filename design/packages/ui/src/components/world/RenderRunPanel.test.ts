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

import { beforeAll, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import RenderRunPanel from "./RenderRunPanel.vue";
import { createRenderRun } from "./renderRun.js";
import type {
    EngineDescription,
    RenderEvent,
    RenderResult,
    RenderSummary,
    WorldBridge,
} from "./worldBridge.js";

beforeAll(() => {
    // jsdom has no layout engine. The console's level filter is a Vuetify chip group,
    // which observes its own size, and opening the disclosure throws without this.
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

const ENGINE: EngineDescription = {
    id: "upstream-java",
    label: "BlueMap engine (Java) 5.22-27 on Java 25.0.3",
    version: "5.22-27",
    javaVersion: "25.0.3",
};

/** What the render wrote about itself, which is what the panel prefers to quote. */
const RECORD: RenderSummary = {
    renderId: "world-abc",
    outcome: "finished",
    engine: "BlueMap engine (Java) 5.22-27 on Java 25.0.3",
    engineId: "upstream-java",
    maps: [{ id: "survival", name: "Survival", world: "/srv/world", dimension: "minecraft:overworld" }],
    startedAt: "2026-08-03T09:14:00.000Z",
    finishedAt: "2026-08-03T09:18:14.000Z",
    durationMs: 254_000,
    dataRoot: "/var/maps/world-abc",
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
function fakeBridge(record: RenderSummary | null = null) {
    const listeners: ((event: RenderEvent) => void)[] = [];
    const bridge: WorldBridge = {
        startRender: () => new Promise<RenderResult>(() => undefined),
        cancelRender: async () => true,
        listRenders: async () => [],
        renderEngine: async () => record,
        activeRenders: async () => [],
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
function startedRun(record: RenderSummary | null = null) {
    const fake = fakeBridge(record);
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

    it("names the engine that produced it, from the record the render wrote", async () => {
        const { fake, run } = startedRun(RECORD);
        fake.emit({
            type: "finished",
            renderId: "world-abc",
            dataRoot: "/var/maps/world-abc",
            mapIds: ["survival"],
            engine: ENGINE,
            durationMs: PENDING.durationMs,
            at: "t9",
        });
        await vi.waitFor(() => expect(run.provenance.value).not.toBeNull());

        const wrapper = render(run);

        expect(wrapper.text()).toContain("Rendered by: BlueMap engine (Java) 5.22-27 on Java 25.0.3");
        wrapper.unmount();
        run.dispose();
    });

    it("names it from the events when there is no record to read, rather than nothing", () => {
        const { fake, run } = startedRun();
        fake.emit({ type: "cancelled", renderId: "world-abc", at: "t9" });

        const wrapper = render(run);

        expect(wrapper.text()).toContain("The engine that ran: BlueMap engine (Java) 5.22-27 on Java 25.0.3");
        wrapper.unmount();
        run.dispose();
    });

    it("names no engine at all for a render that was refused before one ran", () => {
        const fake = fakeBridge();
        const run = createRenderRun(fake.bridge);
        run.settle({
            ok: false,
            renderId: "world-abc",
            failure: {
                code: "consent-required",
                message: "The Mojang download has not been accepted.",
                settings: { surface: "settings", anchor: "mojang-download-consent", missing: true },
                detail: null,
                exitCode: null,
            },
        });

        const wrapper = render(run);

        expect(wrapper.text()).toContain("The Mojang download has not been accepted.");
        expect(wrapper.text()).not.toContain("The engine that ran");
        wrapper.unmount();
        run.dispose();
    });

    it("counts the console's lines on the button that reveals it", () => {
        // Five, not three: the run writes "Starting the render." and "Running." into the
        // same stream, which is what makes the log read as an account of what happened
        // rather than as an undated wall of engine output.
        const { fake, run } = startedRun();
        for (const line of ["one", "two", "three"]) {
            fake.emit({ type: "log", renderId: "world-abc", level: "info", message: line, at: "t" });
        }

        const wrapper = render(run);

        expect(wrapper.text()).toContain("Show the console (5 lines)");
        wrapper.unmount();
        run.dispose();
    });

    /**
     * The console is a disclosure because this panel also renders inside the wizard,
     * where a four-hundred-pixel log between the progress bar and the Stop button pushes
     * the control somebody is reaching for off the screen.
     */
    it("keeps the console behind the disclosure until it is asked for", async () => {
        const { fake, run } = startedRun();
        fake.emit({
            type: "log",
            renderId: "world-abc",
            level: "ERROR",
            message: "Address already in use",
            at: "t",
        });

        const wrapper = render(run);
        expect(wrapper.find(".mb-console").exists()).toBe(false);

        const toggle = wrapper.findAll("button").find((candidate) => candidate.text().includes("Show the console"));
        await toggle?.trigger("click");

        expect(wrapper.find(".mb-console").exists()).toBe(true);
        // And the advice arrives with it, beside the engine's own sentence rather than
        // in place of it.
        expect(wrapper.text()).toContain("Address already in use");
        expect(wrapper.text()).toContain("mod on the Minecraft server");
        wrapper.unmount();
        run.dispose();
    });
});
