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
        missingWarn: false,
        fallbackWarn: false,
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

function render(run: ReturnType<typeof createRenderRun>, now: number | null = null) {
    return mount(RenderRunPanel, { props: { run, now }, global: { plugins: [vuetify, i18n()] } });
}

/** A fixed moment, so the elapsed and gone-quiet clocks are decided by the test. */
const T0 = Date.parse("2026-08-03T09:14:00.000Z");

/**
 * A started run on a stopped clock.
 *
 * The events in this file carry `at: "t1"`, which is not a timestamp, so the run falls back
 * to its own clock - and that fallback is what these tests pin down. Both halves matter: a
 * render whose events carry no usable time must still be able to say how long it has been
 * going, because that is the fact the panel exists for.
 */
function timedRun(mapIds: string[] = ["survival"]) {
    const fake = fakeBridge();
    const run = createRenderRun(fake.bridge, { now: () => T0 });
    void run.start({ maps: mapIds.map((id) => ({ id, world: "/srv/world" })) });
    fake.emit({ type: "started", renderId: "world-abc", mapIds, engine: ENGINE, at: "t0" });
    return { fake, run };
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

    it("shows the engine's own estimate rather than 'about left', and says whose it is", () => {
        const { fake, run } = startedRun();
        fake.emit({
            type: "progress",
            renderId: "world-abc",
            phase: "rendering",
            task: { kind: "map", mapId: "survival", description: "survival", percent: 8.5, etaSeconds: 240, etaText: "4m 12s" },
            at: "t1",
        });

        const wrapper = render(run);

        // Whose estimate it is matters: a figure this application worked out must never be
        // mistaken for one the engine stood behind.
        expect(wrapper.text()).toContain("About 4m 12s left, the engine's own estimate");
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

        expect(wrapper.text()).toContain("About 4 minutes left");
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

    /**
     * Both disclosure toggles set `aria-expanded`, which by itself only tells a screen
     * reader that *something* changed. Without `aria-controls` naming the revealed
     * region's id, there is no programmatic way to jump there - the same gap this
     * project already closes for its other disclosures (ChangelogViewer's dates panel,
     * HistoryPanel's filters).
     */
    it("points each disclosure's aria-controls at the id of the region it reveals", async () => {
        const fake = fakeBridge();
        const run = createRenderRun(fake.bridge);
        run.settle({
            ok: false,
            renderId: "world-abc",
            failure: {
                code: "engine-crash",
                message: "The engine exited unexpectedly.",
                settings: null,
                detail: "Stack trace: something, somewhere, exploded.",
                exitCode: 1,
            },
        });
        fake.emit({ type: "log", renderId: "world-abc", level: "info", message: "one", at: "t" });

        const wrapper = render(run);

        const detailToggle = wrapper.findAll("button").find((candidate) => candidate.text().includes("Show what the engine reported"));
        const logToggle = wrapper.findAll("button").find((candidate) => candidate.text().includes("Show the console"));
        expect(detailToggle).toBeDefined();
        expect(logToggle).toBeDefined();

        const detailControls = detailToggle?.attributes("aria-controls");
        const logControls = logToggle?.attributes("aria-controls");
        expect(detailControls).toBeTruthy();
        expect(logControls).toBeTruthy();
        // Two different disclosures must not be wired to the same region.
        expect(detailControls).not.toBe(logControls);

        // Neither region exists yet - both start collapsed - so there is nothing for
        // aria-controls to point at, which is fine as long as the ids appear the
        // moment the regions do.
        expect(wrapper.find(`#${detailControls}`).exists()).toBe(false);
        expect(wrapper.find(`#${logControls}`).exists()).toBe(false);

        await detailToggle?.trigger("click");
        await logToggle?.trigger("click");

        const detailRegion = wrapper.find(`#${detailControls}`);
        const logRegion = wrapper.find(`#${logControls}`);
        expect(detailRegion.exists()).toBe(true);
        expect(logRegion.exists()).toBe(true);
        expect(detailRegion.text()).toContain("Stack trace: something, somewhere, exploded.");
        expect(logRegion.classes()).toContain("mb-console");

        wrapper.unmount();
        run.dispose();
    });
});

/**
 * The breakdown, which is the difference between a bar somebody trusts and one they don't.
 *
 * One percentage says nothing about whether ten minutes or ten hours remain, and it cannot
 * say the thing a person four minutes into a silent render actually wants to know. These
 * are the four claims the panel now makes and the four ways it could lie about them.
 */
describe("the breakdown", () => {
    it("shows overall, the phase, and the unit being worked, with the real map count", () => {
        const { fake, run } = timedRun(["survival", "nether"]);
        for (const mapId of ["survival", "nether"]) {
            fake.emit({
                type: "progress",
                renderId: "world-abc",
                phase: "rendering",
                task: {
                    kind: "updating-map",
                    mapId,
                    description: `updating map '${mapId}'`,
                    percent: 50,
                    etaSeconds: null,
                    etaText: null,
                },
                at: "t1",
            });
        }

        const wrapper = render(run, T0);

        expect(wrapper.text()).toContain("Overall");
        // A real count, not only a percentage: one of the two maps is behind it.
        expect(wrapper.text()).toContain("1 of 2 maps done");
        expect(wrapper.text()).toContain("Rendering tiles");
        // The engine's own words for the unit it is on, verbatim.
        expect(wrapper.text()).toContain("updating map 'nether'");
        wrapper.unmount();
        run.dispose();
    });

    it("says a phase of unknown size is of unknown size rather than moving its bar", () => {
        const { fake, run } = timedRun();
        // Loading textures and models reports no percentage at all, for minutes. This is
        // exactly where a bar that creeps upward to look busy would be invented.
        fake.emit({ type: "phase", renderId: "world-abc", phase: "loading-resources", at: "t1" });

        const wrapper = render(run, T0);

        expect(wrapper.text()).toContain("Loading textures and models");
        expect(wrapper.text()).toContain("size unknown");
        const indeterminate = wrapper
            .findAll('[role="progressbar"]')
            .filter((bar) => bar.attributes("aria-busy") === "true");
        expect(indeterminate.length).toBeGreaterThan(0);
        // An indeterminate bar carries no value to read out, and says so in words instead.
        expect(indeterminate[0]?.attributes("aria-valuetext")).toContain("size unknown");
        wrapper.unmount();
        run.dispose();
    });

    it("says how long it has been quiet, which is the fact a percentage cannot express", () => {
        const { fake, run } = timedRun();
        fake.emit({
            type: "progress",
            renderId: "world-abc",
            phase: "rendering",
            task: {
                kind: "updating-map",
                mapId: "survival",
                description: "updating map 'survival'",
                percent: 41.2,
                etaSeconds: null,
                etaText: null,
            },
            at: "t1",
        });

        const wrapper = render(run, T0 + 240_000);

        expect(wrapper.text()).toContain("Running for");
        expect(wrapper.text()).toContain("4:00");
        expect(wrapper.text()).toContain("Nothing has arrived for 4:00");
        wrapper.unmount();
        run.dispose();
    });

    it("offers no estimate at all when one progress report is all there is", () => {
        const { fake, run } = timedRun();
        fake.emit({
            type: "progress",
            renderId: "world-abc",
            phase: "rendering",
            task: {
                kind: "updating-map",
                mapId: "survival",
                description: "updating map 'survival'",
                percent: 3,
                etaSeconds: null,
                etaText: null,
            },
            at: "t1",
        });

        const wrapper = render(run, T0);

        // A window with one sample in it can extrapolate to a figure that is confident and
        // hours wrong. Nothing is the honest answer, and it is the one a person believes.
        expect(wrapper.text()).not.toContain("left,");
        wrapper.unmount();
        run.dispose();
    });
});
