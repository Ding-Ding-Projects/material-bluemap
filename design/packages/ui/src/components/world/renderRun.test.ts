import { describe, expect, it, vi } from "vitest";
import {
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
    WorldBridge,
} from "./worldBridge.js";

const t = (_key: string, fallback: string): string => fallback;

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

/** A bridge whose render can be driven event by event from the test. */
function fakeBridge(outcome: RenderResult, options: { readonly resolveNow?: boolean } = {}) {
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
        renderEngine: async () => null,
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

    it("keeps the log bounded and in order", () => {
        const fake = fakeBridge(OK);
        const run = createRenderRun(fake.bridge);

        void run.start({ maps: [{ id: "survival", world: "/srv/world" }] });
        fake.emit({ type: "started", renderId: "world-abc", mapIds: ["survival"], engine: ENGINE, at: "t0" });
        for (let line = 0; line < 260; line++) {
            fake.emit({ type: "log", renderId: "world-abc", level: "info", message: `line ${line}`, at: "t" });
        }

        expect(run.log.value).toHaveLength(200);
        expect(run.log.value[0]?.message).toBe("line 60");
        expect(run.log.value[199]?.message).toBe("line 259");
        run.dispose();
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
});
