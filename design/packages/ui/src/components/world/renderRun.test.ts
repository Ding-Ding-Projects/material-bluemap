import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
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
    RenderRequest,
    RenderResult,
    RenderSummary,
    SpeedAdjustmentResult,
    SpeedLevelNumber,
    WorldBridge,
} from "./worldBridge.js";
import type { Translate } from "./worldFolder.js";
import type { ProgressRoute } from "../progress/progressModel.js";

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
        startRender: vi.fn(async (_request: RenderRequest) => {
            if (options.resolveNow !== true) {
                await new Promise<void>((resolve) => {
                    release = resolve;
                });
            }
            return outcome;
        }),
        cancelRender: vi.fn(async () => true),
        adjustRenderSpeed: vi.fn(
            async (renderId: string, level: SpeedLevelNumber): Promise<SpeedAdjustmentResult> => ({
                ok: true,
                renderId,
                level,
                route: "local",
                appliedNow: true,
                needsRestart: true,
                reason: "applied",
                message: "applied",
                detail: null,
            }),
        ),
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
            missingWarn: false,
            fallbackWarn: false,
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

/**
 * Issue #38's remaining gaps: the panel's own route, and the truth about the numbers a
 * remote render can and cannot count.
 */
describe("which route the panel reports", () => {
    it("reports no route when the surface that built this run said nothing", () => {
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);

        expect(run.progress.value.route).toBeNull();
        run.dispose();
    });

    it("reports a plain route exactly as given", () => {
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge, { route: "docker" });

        expect(run.progress.value.route).toBe("docker");
        run.dispose();
    });

    it("reads a function route fresh on every access, not once at construction", () => {
        // `WorldScreen.vue`'s picker can change after `createRenderRun` was called, and a
        // plain value captured once would go on reporting whichever route was chosen
        // first no matter how many times the picker changed afterwards. A `ref`, exactly
        // as `WorldScreen.vue`'s own `runLocation` is one, so `progress` - itself a
        // `computed` - has a real reactive dependency to invalidate on.
        const fake = fakeBridge(OK);
        const chosen = ref<ProgressRoute>("local");
        const run = createRenderRun(fake.bridge, { route: () => chosen.value });

        expect(run.progress.value.route).toBe("local");
        chosen.value = "remote";
        expect(run.progress.value.route).toBe("remote");
        run.dispose();
    });
});

describe("the tile-count gap, said out loud rather than left silent", () => {
    it("says nothing about tile counts before a render task has been seen", () => {
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);

        expect(run.progress.value.notes.some((note) => note.key === "progress.note.noTileCounts")).toBe(false);
        run.dispose();
    });

    it("has no count for a per-map render task, and says precisely why", () => {
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);
        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });

        fake.emit({
            type: "progress",
            renderId: "world-abc",
            phase: "rendering",
            task: {
                kind: "updating-map",
                mapId: "survival",
                description: "updating map 'survival'",
                percent: 25.663,
                etaSeconds: 47,
                etaText: "47 seconds",
            },
            at: "t1",
        });

        const task = run.progress.value.levels.find((level) => level.id === "task");
        expect(task?.count ?? null).toBeNull();
        expect(run.progress.value.notes.some((note) => note.key === "progress.note.noTileCounts")).toBe(true);
        run.dispose();
    });

    it("says the same for a region task, which also names no map", () => {
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);
        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });

        fake.emit({
            type: "progress",
            renderId: "world-abc",
            phase: "rendering",
            task: {
                kind: "updating-region",
                mapId: null,
                description: "updating region (3, -1)",
                percent: 60,
                etaSeconds: null,
                etaText: null,
            },
            at: "t1",
        });

        expect(run.progress.value.notes.some((note) => note.key === "progress.note.noTileCounts")).toBe(true);
        run.dispose();
    });
});

describe("real bytes for what went up, an honest gap for what comes back", () => {
    it("builds a transfer stat from the remote route's byte events", () => {
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);
        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "2026-01-01T00:00:00.000Z" });

        fake.emit({
            type: "transfer",
            renderId: "world-abc",
            direction: "up",
            bytesDone: 0,
            bytesTotal: 1000,
            at: "2026-01-01T00:00:00.000Z",
        });
        expect(run.progress.value.transfers).toHaveLength(1);
        expect(run.progress.value.transfers[0]?.bytesTotal).toBe(1000);
        expect(run.progress.value.transfers[0]?.bytesDone).toBe(0);
        // One sample says a transfer has begun, not how fast - never extrapolated.
        expect(run.progress.value.transfers[0]?.bytesPerSecond).toBeNull();

        fake.emit({
            type: "transfer",
            renderId: "world-abc",
            direction: "up",
            bytesDone: 500,
            bytesTotal: 1000,
            at: "2026-01-01T00:00:01.000Z",
        });
        expect(run.progress.value.transfers[0]?.bytesDone).toBe(500);
        expect(run.progress.value.transfers[0]?.bytesPerSecond).toBe(500);

        // The upload leg now has real bytes, so it earns no "unknown" note.
        expect(run.progress.value.notes.some((note) => note.key === "progress.note.stagedNotBytes")).toBe(false);
        run.dispose();
    });

    it("never claims the upload's own item-count progress needs the download's note", () => {
        // Regression: this used to set the same generic note for the "starting" phase
        // item-count progress the remote route also reports, even though that phase now
        // carries its own real bytes through the "transfer" event instead.
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);
        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });

        fake.emit({
            type: "progress",
            renderId: "world-abc",
            phase: "starting",
            task: {
                kind: "unknown",
                mapId: null,
                description: "Sending the engine",
                percent: 0,
                etaSeconds: null,
                etaText: null,
            },
            at: "t1",
        });

        expect(run.progress.value.transfers).toEqual([]);
        expect(run.progress.value.notes.some((note) => note.key === "progress.note.stagedNotBytes")).toBe(false);
        run.dispose();
    });

    it("still says the fetch-back leg is unsized, because it genuinely is", () => {
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);
        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });

        fake.emit({
            type: "progress",
            renderId: "world-abc",
            phase: "stopping",
            task: {
                kind: "unknown",
                mapId: null,
                description: "Fetching the rendered map",
                percent: 0,
                etaSeconds: null,
                etaText: null,
            },
            at: "t1",
        });

        expect(run.progress.value.transfers).toEqual([]);
        expect(run.progress.value.notes.some((note) => note.key === "progress.note.stagedNotBytes")).toBe(true);
        run.dispose();
    });
});

describe("renderThreads: the one raw fact a live control can name honestly", () => {
    it("records exactly what the request named, before any event arrives", () => {
        const fake = fakeBridge(OK, { resolveNow: false });
        const run = createRenderRun(fake.bridge);
        void run.start({ maps: [{ id: "survival", world: "/srv/world" }], renderThreads: -1 });
        expect(run.renderThreads.value).toBe(-1);
        run.dispose();
    });

    it("is null when the request never named one, rather than a guessed-at number", () => {
        const fake = fakeBridge(OK, { resolveNow: false });
        const run = createRenderRun(fake.bridge);
        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        expect(run.renderThreads.value).toBeNull();
        run.dispose();
    });

    it("clears back to null on reset, once the run has ended", async () => {
        const fake = fakeBridge(OK, { resolveNow: true });
        const run = createRenderRun(fake.bridge);
        await run.start({ maps: [{ id: "survival", world: "/srv/world" }], renderThreads: 2 });
        expect(run.renderThreads.value).toBe(2);
        run.reset();
        expect(run.renderThreads.value).toBeNull();
        run.dispose();
    });
});

describe("adjustSpeed: reaching the main process about a live render", () => {
    it("does nothing and reports null when no render has an id yet", async () => {
        const fake = fakeBridge(OK, { resolveNow: false });
        const run = createRenderRun(fake.bridge);
        const result = await run.adjustSpeed(4);
        expect(result).toBeNull();
        expect(fake.bridge.adjustRenderSpeed).not.toHaveBeenCalled();
        run.dispose();
    });

    it("calls the bridge with this render's own id, once it has one", async () => {
        const fake = fakeBridge(OK, { resolveNow: false });
        const run = createRenderRun(fake.bridge);
        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });

        const result = await run.adjustSpeed(2);
        expect(fake.bridge.adjustRenderSpeed).toHaveBeenCalledWith("world-abc", 2);
        expect(result?.ok).toBe(true);
        run.dispose();
    });

    it("reports the exact outcome the bridge returned, applied or blocked, unedited", async () => {
        const fake = fakeBridge(OK, { resolveNow: false });
        const blocked: SpeedAdjustmentResult = {
            ok: true,
            renderId: "world-abc",
            level: 5,
            route: "docker",
            appliedNow: false,
            needsRestart: true,
            reason: "not-running",
            message: "Docker cannot boost a container above its ordinary share.",
            detail: null,
        };
        fake.bridge.adjustRenderSpeed = vi.fn(async () => blocked);
        const run = createRenderRun(fake.bridge);
        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });

        const result = await run.adjustSpeed(5);
        expect(result).toEqual(blocked);
        run.dispose();
    });

    it("turns a broken bridge promise into a refusal rather than an unhandled rejection", async () => {
        const fake = fakeBridge(OK, { resolveNow: false });
        fake.bridge.adjustRenderSpeed = vi.fn(async () => {
            throw new Error("ipc broke");
        });
        const run = createRenderRun(fake.bridge);
        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });

        const result = await run.adjustSpeed(3);
        expect(result?.ok).toBe(false);
        expect(result?.message).toContain("ipc broke");
        run.dispose();
    });
});

describe("restartWithLevel: the explicit choice that changes the next JVM's thread settings", () => {
    it("starts a fresh render with the level's own thread count and priority when nothing is running", async () => {
        const fake = fakeBridge(OK, { resolveNow: true });
        const run = createRenderRun(fake.bridge);
        await run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        run.reset();

        await run.restartWithLevel(5);
        // Level 5's own documented threadCount, from speedLevels.ts.
        expect(run.renderThreads.value).toBe(4);
        expect(run.renderThreadPriority.value).toBe(10);
        expect(fake.bridge.startRender).toHaveBeenLastCalledWith(
            expect.objectContaining({ renderThreads: 4, renderThreadPriority: 10 }),
        );
    });

    it("cancels the running render first, waits for it to actually end, then restarts", async () => {
        const fake = fakeBridge(OK, { resolveNow: false });
        const run = createRenderRun(fake.bridge);
        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });
        expect(run.active.value).toBe(true);

        const restarted = run.restartWithLevel(1);

        // The restart must not proceed until the render has genuinely ended - it only asked
        // to be cancelled so far, and the underlying process has not confirmed anything yet.
        await Promise.resolve();
        expect(run.state.value).toBe("running");
        expect(fake.bridge.cancelRender).toHaveBeenCalledWith("world-abc");

        fake.emit({ type: "cancelled", renderId: "world-abc", at: "t1" });

        // Draining several microtask ticks rather than guessing exactly one: `await cancel()`
        // and `await stopped` are each their own promise chain, and the restart's own second
        // `startRender()` call only happens once both have genuinely unwound. `fake.finish()`
        // must land on *that* call, not on the abandoned first one whose own promise nobody
        // is waiting on any more.
        for (let tick = 0; tick < 20 && run.state.value !== "starting"; tick++) {
            await Promise.resolve();
        }
        expect(run.state.value).toBe("starting");
        fake.finish();

        await restarted;
        // Level 1's own documented threadCount, from speedLevels.ts.
        expect(run.renderThreads.value).toBe(-2);
        expect(run.renderThreadPriority.value).toBe(1);
    });

    it("does nothing and reports null when no render has ever been started", async () => {
        const fake = fakeBridge(OK, { resolveNow: false });
        const run = createRenderRun(fake.bridge);
        const result = await run.restartWithLevel(3);
        expect(result).toBeNull();
        run.dispose();
    });
});
