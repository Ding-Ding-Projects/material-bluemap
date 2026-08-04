import { describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import {
    LOG_LIMIT,
    adviseOnFailure,
    classifyFailure,
    createRenderRun,
    formatDuration,
    phaseLabel,
} from "./renderRun.js";
import type {
    EngineDescription,
    RenderEvent,
    RenderFailure,
    RenderResult,
    RenderSummary,
    WorldBridge,
} from "./worldBridge.js";
import type { Translate } from "./worldFolder.js";

/**
 * The fallback-returning translator, which is what a build with no locale uses.
 *
 * It interpolates the named values rather than dropping them, because vue-i18n
 * does: a stub that ignored argument two would report a duration correctly here
 * while the panel rendered "seconds" with no number in front of it.
 */
const t: Translate = (_key: string, second: string | Readonly<Record<string, unknown>>, third?: string): string =>
    typeof second === "string"
        ? second
        : Object.entries(second).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), third ?? "");

const ENGINE: EngineDescription = {
    id: "upstream-java",
    label: "BlueMap engine (Java) 5.22-27 on Java 25.0.3",
    version: "5.22-27",
    javaVersion: "25.0.3",
};

function failure(code: string, extra: Partial<RenderFailure> = {}): RenderFailure {
    return {
        code,
        message: `the engine said ${code}`,
        settings: null,
        detail: null,
        exitCode: null,
        ...extra,
    };
}

/** What `render.json` says about a render, once it has ended. */
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

/** A bridge whose render can be driven event by event from the test. */
function fakeBridge(
    outcome: RenderResult,
    options: { readonly resolveNow?: boolean; readonly record?: RenderSummary | null } = {},
) {
    const listeners: ((event: RenderEvent) => void)[] = [];
    let release: (() => void) | null = null;

    const bridge: WorldBridge = {
        startRender: async () => {
            if (options.resolveNow !== true) {
                await new Promise<void>((resolve) => {
                    release = resolve;
                });
            }
            return outcome;
        },
        cancelRender: vi.fn(async () => true),
        listRenders: async () => [],
        renderEngine: async () => options.record ?? null,
        activeRenders: async () => [],
        interruptedRenders: async () => [],
        resumeRender: async () => ({ started: false, refusal: { ok: false, renderId: "x", code: "no-session", message: "" } }),
        dismissResume: async () => true,
        onRenderEvent: (listener) => {
            listeners.push(listener);
            return () => {
                const at = listeners.indexOf(listener);
                if (at >= 0) listeners.splice(at, 1);
            };
        },
        readConsent: async () => ({ accepted: true }),
    };

    return {
        bridge,
        emit(event: RenderEvent): void {
            for (const listener of [...listeners]) listener(event);
        },
        finish(): void {
            release?.();
            release = null;
        },
        listenerCount: (): number => listeners.length,
    };
}

const OK: RenderResult = {
    ok: true,
    renderId: "world-abc",
    dataRoot: "/var/maps/world-abc",
    mapIds: ["survival"],
    engine: ENGINE,
    durationMs: 254_000,
};

describe("watching a render", () => {
    it("adopts the id the engine chose, because the app never picks one", () => {
        // The engine derives a stable id from the world folder, which is what makes
        // a second render of the same world carry on rather than start again. So the
        // id is not known until it says, and events arrive before the call resolves.
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);

        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        expect(run.state.value).toBe("starting");

        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });

        expect(run.renderId.value).toBe("world-abc");
        expect(run.state.value).toBe("running");
        expect(run.engine.value?.label).toContain("5.22-27");
        run.dispose();
    });

    it("ignores events belonging to another render", () => {
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);

        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });
        fake.emit({
            type: "progress",
            renderId: "someone-else",
            phase: "rendering",
            task: { kind: "map", mapId: "other", description: "other", percent: 99, etaSeconds: 1, etaText: null },
            at: "t1",
        });

        expect(run.percent.value).toBe(0);
        run.dispose();
    });

    it("keeps the latest phase, percentage and estimate", () => {
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);

        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });
        expect(run.indeterminate.value).toBe(true);

        fake.emit({
            type: "progress",
            renderId: "world-abc",
            phase: "rendering",
            task: { kind: "map", mapId: "survival", description: "survival", percent: 8.535, etaSeconds: 240, etaText: "4m" },
            at: "t1",
        });

        expect(run.phase.value).toBe("rendering");
        expect(run.percent.value).toBeCloseTo(8.535);
        expect(run.indeterminate.value).toBe(false);
        run.dispose();
    });

    it("keeps the log bounded and in order, and counts what the cap took", () => {
        // The two status lines the run writes for itself are part of the same stream, so
        // the arithmetic below includes them: 58 engine lines past the cap plus those two
        // is 60 lines off the front.
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);

        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });
        for (let line = 0; line < LOG_LIMIT + 58; line++) {
            fake.emit({ type: "log", renderId: "world-abc", level: "info", message: `line ${line}`, at: "t" });
        }

        expect(run.log.value).toHaveLength(LOG_LIMIT);
        // Counted rather than silently forgotten: the console prints this number, because
        // a ring that quietly loses its own beginning looks exactly like a complete log.
        expect(run.logDropped.value).toBe(60);
        expect(run.log.value[0]?.message).toBe("line 58");
        expect(run.log.value[LOG_LIMIT - 1]?.message).toBe(`line ${LOG_LIMIT + 57}`);
        run.dispose();
    });

    it("keeps far more than a panel-sized window, because the reason is printed first", () => {
        // The setup warning that explains a failed render is printed in the first seconds.
        // A 200-line ring had thrown it away long before the render ended.
        expect(LOG_LIMIT).toBeGreaterThanOrEqual(10_000);
    });

    it("reports a finish with where the tiles went", async () => {
        const fake = fakeBridge(OK, { resolveNow: true });
        const run = createRenderRun(fake.bridge);

        await run.start({ maps: [{ id: "survival", world: "/srv/world" }] });

        expect(run.state.value).toBe("finished");
        expect(run.dataRoot.value).toBe("/var/maps/world-abc");
        expect(run.active.value).toBe(false);
        run.dispose();
    });

    it("shows a cancellation as a cancellation rather than as a failure", async () => {
        const cancelled: RenderResult = { ok: false, renderId: "world-abc", failure: failure("cancelled") };
        const fake = fakeBridge(cancelled, { resolveNow: true });
        const run = createRenderRun(fake.bridge);

        await run.start({ maps: [{ id: "survival", world: "/srv/world" }] });

        expect(run.state.value).toBe("cancelled");
        expect(run.failure.value).toBeNull();
        run.dispose();
    });

    it("takes the reason from the resolved result when no event carried one", async () => {
        // A missing consent record or a missing JDK is refused before anything is
        // spawned, so no events are emitted at all and the result is the only place
        // the reason exists.
        const refused: RenderResult = {
            ok: false,
            renderId: "world-abc",
            failure: failure("consent-required", {
                settings: { surface: "settings", anchor: "mojang-download-consent", missing: true },
            }),
        };
        const fake = fakeBridge(refused, { resolveNow: true });
        const run = createRenderRun(fake.bridge);

        await run.start({ maps: [{ id: "survival", world: "/srv/world" }] });

        expect(run.state.value).toBe("failed");
        expect(run.failure.value?.code).toBe("consent-required");
        run.dispose();
    });

    it("cancels the render it is actually watching", async () => {
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);

        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        expect(await run.cancel()).toBe(false);

        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });
        expect(await run.cancel()).toBe(true);
        expect(fake.bridge.cancelRender).toHaveBeenCalledWith("world-abc");
        expect(run.cancelling.value).toBe(true);
        run.dispose();
    });

    it("watches a render it did not start, for a resume", () => {
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);

        run.expect("world-abc");
        fake.emit({
            type: "progress",
            renderId: "world-abc",
            phase: "rendering",
            task: { kind: "map", mapId: "survival", description: "survival", percent: 42, etaSeconds: null, etaText: null },
            at: "t1",
        });

        expect(run.percent.value).toBe(42);
        run.dispose();
    });

    it("stops listening when it is disposed of", () => {
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);

        expect(fake.listenerCount()).toBe(1);
        run.dispose();
        expect(fake.listenerCount()).toBe(0);
    });

    it("does nothing at all without a bridge, and says it is unavailable", async () => {
        const run = createRenderRun(null);

        expect(run.available).toBe(false);
        expect(await run.start({ maps: [] })).toBeNull();
        expect(run.state.value).toBe("idle");
        run.dispose();
    });

    /**
     * The record is what makes "this app never switches renderer silently" checkable.
     * The events say which engine this process *started*; `render.json` is written by
     * the render itself and says which one actually ran.
     */
    it("reads back the engine record once the render has ended", async () => {
        const fake = fakeBridge(OK, { record: RECORD });
        const run = createRenderRun(fake.bridge);

        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });
        expect(run.provenance.value).toBeNull();

        fake.emit({
            type: "finished",
            renderId: "world-abc",
            dataRoot: "/var/maps/world-abc",
            mapIds: ["survival"],
            engine: ENGINE,
            durationMs: 254_000,
            at: "t9",
        });

        await vi.waitFor(() => expect(run.provenance.value?.engine).toBe(RECORD.engine));
        run.dispose();
    });

    it("reads it for a render that failed too, because that one also ran on something", async () => {
        const failed: RenderResult = { ok: false, renderId: "world-abc", failure: failure("cli-failed") };
        const fake = fakeBridge(failed, { resolveNow: true, record: { ...RECORD, outcome: "failed" } });
        const run = createRenderRun(fake.bridge);

        await run.start({ maps: [{ id: "survival", world: "/srv/world" }] });

        await vi.waitFor(() => expect(run.provenance.value?.outcome).toBe("failed"));
        run.dispose();
    });

    it("stays silent when there is no record to read rather than naming an engine anyway", async () => {
        // What `resolveWorldBridge` hands a build whose preload has no `renderEngine`.
        const fake = fakeBridge(OK, { resolveNow: true });
        const run = createRenderRun(fake.bridge);

        await run.start({ maps: [{ id: "survival", world: "/srv/world" }] });

        expect(run.state.value).toBe("finished");
        expect(run.provenance.value).toBeNull();
        run.dispose();
    });

    it("forgets the record when the run is reset, so it cannot be shown against another render", async () => {
        const fake = fakeBridge(OK, { resolveNow: true, record: RECORD });
        const run = createRenderRun(fake.bridge);

        await run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        await vi.waitFor(() => expect(run.provenance.value).not.toBeNull());

        run.reset();
        expect(run.provenance.value).toBeNull();
        run.dispose();
    });

    it("refuses to reset a render that is still going", () => {
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);

        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });

        run.reset();
        expect(run.state.value).toBe("running");
        run.dispose();
    });
});

/**
 * The run narrating itself into the same stream as the engine.
 *
 * The value of these lines is entirely in their position. "Stopping." between the last
 * progress tick and the engine's own farewell is what turns a wall of output into an
 * account of what happened, and a status shown anywhere other than in the log cannot do
 * that however prominently it is drawn.
 */
describe("the run's own status lines", () => {
    /** The keys of the app's own lines, in the order they were written. */
    function narrative(run: ReturnType<typeof createRenderRun>): string[] {
        return run.log.value.filter((line) => line.origin === "app").map((line) => line.text?.key ?? "");
    }

    it("brackets the engine's output with starting, running and stopped", async () => {
        const fake = fakeBridge(OK, { resolveNow: true });
        const run = createRenderRun(fake.bridge);

        const started = run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });
        fake.emit({ type: "log", renderId: "world-abc", level: "INFO", message: "Loading resources...", at: "t1" });
        await started;

        expect(narrative(run)).toEqual([
            "world.console.signal.starting",
            "world.console.signal.running",
            "world.console.signal.stoppedCode",
        ]);
        run.dispose();
    });

    it("says which code the engine exited with, rather than only that it failed", async () => {
        const failed: RenderResult = {
            ok: false,
            renderId: "world-abc",
            failure: failure("cli-failed", { exitCode: 1 }),
        };
        const fake = fakeBridge(failed, { resolveNow: true });
        const run = createRenderRun(fake.bridge);

        await run.start({ maps: [{ id: "survival", world: "/srv/world" }] });

        const last = run.log.value.at(-1);
        expect(last?.text?.key).toBe("world.console.signal.stoppedCode");
        expect(last?.text?.values.code).toBe(1);
        run.dispose();
    });

    it("writes one closing line even though the end arrives as an event and as a result", async () => {
        // Both paths are needed: a render refused before anything was spawned emits no
        // events at all. Without the guard the ordinary path says "Stopped." twice.
        const fake = fakeBridge(OK, { resolveNow: true });
        const run = createRenderRun(fake.bridge);

        const started = run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });
        fake.emit({
            type: "finished",
            renderId: "world-abc",
            dataRoot: "/var/maps/world-abc",
            mapIds: ["survival"],
            engine: ENGINE,
            durationMs: 254_000,
            at: "t9",
        });
        await started;

        const closings = narrative(run).filter((key) => key.startsWith("world.console.signal.stopped"));
        expect(closings).toHaveLength(1);
        run.dispose();
    });

    it("names a cancellation as one, and says the tiles are kept", async () => {
        const cancelled: RenderResult = { ok: false, renderId: "world-abc", failure: failure("cancelled") };
        const fake = fakeBridge(cancelled, { resolveNow: true });
        const run = createRenderRun(fake.bridge);

        await run.start({ maps: [{ id: "survival", world: "/srv/world" }] });

        expect(narrative(run)).toContain("world.console.signal.stoppedCancelled");
        run.dispose();
    });

    it("carries no annotations on its own lines, only on the engine's", () => {
        // Running the advice table over this app's own sentences would let a status line
        // trigger advice about output the engine never printed.
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);

        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });

        for (const line of run.log.value) expect(line.annotations).toEqual([]);
        run.dispose();
    });
});

describe("advice beside the engine's line", () => {
    function startedRun() {
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);
        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });
        return { fake, run };
    }

    function log(fake: ReturnType<typeof fakeBridge>, message: string, level = "INFO"): void {
        fake.emit({ type: "log", renderId: "world-abc", level, message, at: "t" });
    }

    it("annotates the line as it arrives, never rewriting it", () => {
        const { fake, run } = startedRun();
        log(fake, "Address already in use", "ERROR");

        const line = run.log.value.at(-1);
        expect(line?.message).toBe("Address already in use");
        expect(line?.level).toBe("error");
        expect(line?.annotations.map((advice) => advice.kind)).toEqual(["port-conflict"]);
        run.dispose();
    });

    it("offers the estimate tip once for a render that prints a hundred estimates", () => {
        const { fake, run } = startedRun();
        for (let tick = 0; tick < 100; tick++) {
            log(fake, `updating map 'overworld': ${tick}.0% (ETA: 47 seconds)`);
        }

        const tips = run.log.value.flatMap((line) => line.annotations).filter((a) => a.kind === "render-threads");
        expect(tips).toHaveLength(1);
        run.dispose();
    });

    it("re-arms the one-shot tips when the run is set up again", async () => {
        const fake = fakeBridge(OK, { resolveNow: true });
        const run = createRenderRun(fake.bridge);

        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });
        log(fake, "updating map 'overworld': 5.0% (ETA: 47 seconds)");
        fake.finish();
        await Promise.resolve();

        run.reset();
        expect(run.log.value).toEqual([]);
        expect(run.logDropped.value).toBe(0);

        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });
        log(fake, "updating map 'overworld': 5.0% (ETA: 47 seconds)");

        expect(run.log.value.at(-1)?.annotations.map((advice) => advice.kind)).toEqual(["render-threads"]);
        run.dispose();
    });

    it("leaves the great majority of the engine's output alone", () => {
        const { fake, run } = startedRun();
        for (const message of ["Loading resources...", "Loading map 'overworld'...", "Stopped."]) {
            log(fake, message);
        }

        const engineLines = run.log.value.filter((line) => line.origin === "engine");
        expect(engineLines.flatMap((line) => line.annotations)).toEqual([]);
        run.dispose();
    });
});

describe("what a failure means", () => {
    it("sorts each code into the one answer it has", () => {
        expect(classifyFailure(failure("consent-required"))).toBe("consent");
        expect(classifyFailure(failure("java-unavailable"))).toBe("java");
        expect(classifyFailure(failure("cli-jar-missing"))).toBe("engine-missing");
        expect(classifyFailure(failure("world-not-found"))).toBe("world");
        expect(classifyFailure(failure("workspace-unwritable"))).toBe("storage");
        expect(classifyFailure(failure("no-maps-rendered"))).toBe("nothing-rendered");
        expect(classifyFailure(failure("cancelled"))).toBe("cancelled");
        expect(classifyFailure(failure("cli-failed"))).toBe("engine-failed");
        expect(classifyFailure(failure("something-new"))).toBe("engine-failed");
    });

    it("points a missing consent at the setting rather than asking again", () => {
        const advice = adviseOnFailure(failure("consent-required"), t);

        expect(advice.kind).toBe("consent");
        expect(advice.remedy.settings?.anchor).toBe("mojang-download-consent");
        expect(advice.explanation).toContain("accepted once, in Settings");
        // The licence itself is never put in front of somebody mid-task.
        expect(advice.explanation).not.toContain("EULA");
    });

    it("offers the provisioning path for a missing runtime instead of a stack trace", () => {
        const advice = adviseOnFailure(failure("java-unavailable", { detail: "searched 4 locations" }), t);

        expect(advice.kind).toBe("java");
        expect(advice.remedy.settings?.anchor).toBe("java-runtime");
        expect(advice.detail).toBe("searched 4 locations");
    });

    it("keeps the engine's own sentence rather than replacing it", () => {
        const advice = adviseOnFailure(failure("cli-failed", { message: "The BlueMap engine exited with code 1.", exitCode: 1 }), t);

        expect(advice.message).toBe("The BlueMap engine exited with code 1.");
    });

    it("explains a render that rendered nothing, which the engine calls a success", () => {
        const advice = adviseOnFailure(failure("no-maps-rendered"), t);

        expect(advice.kind).toBe("nothing-rendered");
        expect(advice.explanation).toContain("no region files");
    });
});

describe("wording", () => {
    it("names every phase the engine goes through", () => {
        expect(phaseLabel("rendering", t)).toBe("Rendering tiles");
        expect(phaseLabel("downloading-resources", t)).toBe("Downloading the Minecraft client files");
        expect(phaseLabel(null, t)).toBe("");
        // An unknown phase is shown as it arrives rather than hidden.
        expect(phaseLabel("something-new", t)).toBe("something-new");
    });

    it("says durations in units a person uses", () => {
        expect(formatDuration(42, t)).toBe("42 seconds");
        expect(formatDuration(254, t)).toBe("4 minutes");
        expect(formatDuration(7_500, t)).toBe("2 hours 5 minutes");
        expect(formatDuration(Number.NaN, t)).toBe("");
    });

    /**
     * The same durations through the real vue-i18n with no locale loaded, which is
     * the state the app starts in.
     *
     * vue-i18n compiles the English fallback as a message format, so a `{n}` left in
     * one is consumed before anything else can substitute it: the panel showed
     * "about left" beside a progress bar that had stopped moving. The stub above
     * cannot catch that, because it never compiles anything.
     */
    it("keeps the number in a duration when vue-i18n is the one rendering it", () => {
        const i18n = createI18n({
            legacy: false,
            locale: "none",
            fallbackLocale: "none",
            silentFallbackWarn: true,
            messages: {},
        });
        const real: Translate = i18n.global.t;

        expect(formatDuration(42, real)).toBe("42 seconds");
        expect(formatDuration(254, real)).toBe("4 minutes");
        expect(formatDuration(7_500, real)).toBe("2 hours 5 minutes");
        // A phase name carries no value, so it is the same either way. Asserted so a
        // failure above is read as a lost value rather than a broken translator.
        expect(phaseLabel("rendering", real)).toBe("Rendering tiles");
    });
});
