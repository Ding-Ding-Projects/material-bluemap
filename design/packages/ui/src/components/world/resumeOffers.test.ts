import { describe, expect, it, vi } from "vitest";
import {
    createResumeOffers,
    describeInterruption,
    describeProgress,
    describeRefusal,
} from "./resumeOffers.js";
import type {
    InterruptedRenderSummary,
    RenderEvent,
    ResumeResult,
    WorldBridge,
} from "./worldBridge.js";

const t = (_key: string, fallback: string): string => fallback;

function summary(overrides: Partial<InterruptedRenderSummary> = {}): InterruptedRenderSummary {
    return {
        renderId: "world-abc",
        reason: "process-gone",
        maps: [{ id: "survival", world: "/srv/world", dimension: "minecraft:overworld", name: "Survival" }],
        startedAt: "2026-08-02T21:14:00-04:00",
        interruptedAt: "2026-08-02T23:02:11-04:00",
        percent: 88.601,
        description: "survival",
        engine: "BlueMap engine (Java) 5.22-27",
        message: "This render stopped at 88.6% and can be carried on.",
        ...overrides,
    };
}

function fakeBridge(overrides: Partial<WorldBridge> = {}): WorldBridge {
    return {
        startRender: async () => ({ ok: false, renderId: "x", failure: { code: "invalid-request", message: "", settings: null, detail: null, exitCode: null } }),
        cancelRender: async () => false,
        listRenders: async () => [],
        renderEngine: async () => null,
        interruptedRenders: async () => [summary()],
        resumeRender: async () => ({ started: false, refusal: { ok: false, renderId: "world-abc", code: "no-session", message: "" } }),
        dismissResume: async () => true,
        onRenderEvent: (_listener: (event: RenderEvent) => void) => () => undefined,
        readConsent: async () => ({ accepted: true }),
        ...overrides,
    };
}

describe("loading the offers", () => {
    it("lists what was left unfinished", async () => {
        const offers = createResumeOffers(fakeBridge());
        await offers.load();

        expect(offers.offers.value).toHaveLength(1);
        expect(offers.offers.value[0]?.renderId).toBe("world-abc");
        expect(offers.failure.value).toBeNull();
    });

    it("states a load that did not happen rather than showing an empty list", async () => {
        const offers = createResumeOffers(
            fakeBridge({
                interruptedRenders: async () => {
                    throw new Error("the session store could not be read");
                },
            }),
        );
        await offers.load();

        expect(offers.offers.value).toEqual([]);
        expect(offers.failure.value).toBe("the session store could not be read");
    });

    it("does nothing without a bridge, and says it is unavailable", async () => {
        const offers = createResumeOffers(null);
        await offers.load();

        expect(offers.available).toBe(false);
        expect(offers.offers.value).toEqual([]);
    });
});

describe("carrying one on", () => {
    it("takes a started render off the list, because it is no longer interrupted", async () => {
        const started: ResumeResult = {
            started: true,
            result: {
                ok: true,
                renderId: "world-abc",
                dataRoot: "/var/maps/world-abc",
                mapIds: ["survival"],
                engine: { id: "upstream-java", label: "BlueMap", version: "5.22", javaVersion: "25" },
                durationMs: 1000,
            },
        };
        const offers = createResumeOffers(fakeBridge({ resumeRender: async () => started }));
        await offers.load();

        const result = await offers.resume("world-abc");

        expect(result?.started).toBe(true);
        expect(offers.offers.value).toEqual([]);
    });

    it("keeps a refused render on the list, with the refusal beside it", async () => {
        const refused: ResumeResult = {
            started: false,
            refusal: {
                ok: false,
                renderId: "world-abc",
                code: "config-changed",
                message: "The settings changed since this render stopped.",
            },
        };
        const offers = createResumeOffers(fakeBridge({ resumeRender: async () => refused }));
        await offers.load();

        await offers.resume("world-abc");

        expect(offers.offers.value).toHaveLength(1);
        expect(offers.refusals.value["world-abc"]?.code).toBe("config-changed");
    });

    it("passes the interface's own map settings through when it has some", async () => {
        const resumeRender = vi.fn(async () => ({
            started: false as const,
            refusal: { ok: false as const, renderId: "world-abc", code: "config-changed" as const, message: "" },
        }));
        const offers = createResumeOffers(fakeBridge({ resumeRender }));

        await offers.resume("world-abc", [{ id: "survival", world: "/srv/world" }]);

        expect(resumeRender).toHaveBeenCalledWith("world-abc", [{ id: "survival", world: "/srv/world" }]);
    });

    it("resumes with the render's own settings when it is given none", async () => {
        const resumeRender = vi.fn(async () => ({
            started: false as const,
            refusal: { ok: false as const, renderId: "world-abc", code: "no-session" as const, message: "" },
        }));
        const offers = createResumeOffers(fakeBridge({ resumeRender }));

        await offers.resume("world-abc");

        expect(resumeRender).toHaveBeenCalledWith("world-abc");
    });

    it("runs one resume at a time", async () => {
        let releases = 0;
        const offers = createResumeOffers(
            fakeBridge({
                resumeRender: async () => {
                    releases++;
                    return { started: false, refusal: { ok: false, renderId: "world-abc", code: "no-session", message: "" } };
                },
            }),
        );

        const first = offers.resume("world-abc");
        const second = await offers.resume("world-def");
        await first;

        expect(second).toBeNull();
        expect(releases).toBe(1);
    });

    it("stops offering a render that was declined", async () => {
        const offers = createResumeOffers(fakeBridge());
        await offers.load();

        expect(await offers.dismiss("world-abc")).toBe(true);
        expect(offers.offers.value).toEqual([]);
    });

    it("keeps offering one the main process would not dismiss", async () => {
        const offers = createResumeOffers(fakeBridge({ dismissResume: async () => false }));
        await offers.load();

        expect(await offers.dismiss("world-abc")).toBe(false);
        expect(offers.offers.value).toHaveLength(1);
    });
});

describe("wording", () => {
    it("keeps a cancellation apart from a crash", () => {
        // Somebody who pressed Cancel got what they asked for; telling them
        // something went wrong would be untrue.
        expect(describeInterruption(summary({ reason: "cancelled" }), t)).toContain("You stopped");
        expect(describeInterruption(summary({ reason: "failed" }), t)).toContain("error");
        expect(describeInterruption(summary({ reason: "process-gone" }), t)).toContain("never got to write an ending");
    });

    it("says how far it got, and admits when it does not know", () => {
        expect(describeProgress(summary(), t)).toContain("88.6%");
        expect(describeProgress(summary(), t)).toContain("survival");
        expect(describeProgress(summary({ percent: null, description: null }), t)).toContain("nothing is known");
    });

    it("explains a changed config as a reasonable answer rather than a fault", () => {
        const text = describeRefusal(
            { ok: false, renderId: "world-abc", code: "config-changed", message: "Settings changed." },
            t,
        );

        expect(text.title).toBe("Settings changed.");
        expect(text.explanation).toContain("half the map drawn with the old settings");
    });

    it("has an explanation for every refusal the main process can give", () => {
        for (const code of ["no-session", "not-interrupted", "already-running", "config-changed"] as const) {
            const text = describeRefusal({ ok: false, renderId: "world-abc", code, message: "m" }, t);
            expect(text.explanation.length).toBeGreaterThan(20);
        }
    });
});
