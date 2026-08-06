/**
 * The aggregator's own tests, and the regression test for the reported defect.
 *
 * "Navigate away and the render is lost" was two candidate bugs, and reading
 * `main/render/orchestrator.ts` and `main/render/ipc.ts` settled which one it actually is
 * before any of this was written (see the top of `activeRenders.ts` for the full account):
 * the render itself lives entirely in the main process, keyed in a `Map` that belongs to
 * `RenderOrchestrator` and not to any window or component, and `WorldScreen.vue`'s
 * `onBeforeUnmount` only unsubscribes from events - it never cancels. So the render was
 * never the thing that stopped; the *view* of it was, because `createRenderRun()`'s state
 * lived in refs private to whichever component built them.
 *
 * "written first and watched it fail if the defect is real" - it would have: an aggregator
 * that only listened for *future* events, with no `activeRenders()`/`renderEngine()` seed on
 * construction, shows nothing for a render a previous instance was watching, which is
 * exactly the reported symptom. The tests below construct a second, independent
 * `createActiveRenders()` against a bridge that already has a render in flight - simulating
 * a fresh page mount after navigating away and back - and assert it finds and displays that
 * render without ever having seen it start.
 */

import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { createCiRenders } from "../cirender/ciRenders.js";
import type { CiRenderBridge, CiSyncEvent, CiSyncResult } from "../cirender/ciRenderBridge.js";
import type {
    ContainerOffer,
    ContainerOffersBridge,
    ReattachResult,
} from "../world/containerOffers.js";
import type {
    RenderEvent,
    RenderResult,
    RenderSummary,
    WorldBridge,
} from "../world/worldBridge.js";
import {
    bucketOfRoute,
    createActiveRenders,
    searchTextOf,
    sortRows,
    type ActiveRenderRow,
} from "./activeRenders.js";

/* -------------------------------------------------------------------------- */
/* A fake world bridge whose "main process" state outlives any one subscriber */
/* -------------------------------------------------------------------------- */

function fakeWorldBridge(): WorldBridge & {
    setActive(ids: readonly string[]): void;
    setRecord(renderId: string, summary: RenderSummary): void;
    emit(event: RenderEvent): void;
    cancelled: string[];
} {
    let active: readonly string[] = [];
    const records = new Map<string, RenderSummary>();
    const listeners = new Set<(event: RenderEvent) => void>();
    const cancelled: string[] = [];

    return {
        setActive: (ids) => {
            active = ids;
        },
        setRecord: (renderId, summary) => {
            records.set(renderId, summary);
        },
        emit: (event) => {
            for (const listener of listeners) listener(event);
        },
        cancelled,
        startRender: async (): Promise<RenderResult> => {
            throw new Error("not used by this test");
        },
        cancelRender: async (renderId: string) => {
            cancelled.push(renderId);
            active = active.filter((id) => id !== renderId);
            return true;
        },
        adjustRenderSpeed: async (renderId) => ({
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
        listRenders: async () => [...records.values()],
        renderEngine: async (renderId: string) => records.get(renderId) ?? null,
        activeRenders: async () => active,
        interruptedRenders: async () => [],
        resumeRender: async (renderId: string) => ({
            started: false,
            refusal: { ok: false, renderId, code: "no-session", message: "not used" },
        }),
        dismissResume: async () => false,
        onRenderEvent: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        readConsent: async () => ({ accepted: true }),
    };
}

function summaryFor(renderId: string, worldName: string, mapName: string): RenderSummary {
    return {
        renderId,
        outcome: "running",
        engine: "BlueMap engine (Java) 5.22-27",
        engineId: "upstream-java",
        maps: [
            {
                id: "overworld",
                name: mapName,
                world: `C:/worlds/${worldName}`,
                dimension: "minecraft:overworld",
            },
        ],
        startedAt: new Date().toISOString(),
        finishedAt: null,
        durationMs: null,
        dataRoot: null,
    };
}

function fakeContainerOffersBridge(
    initial: readonly ContainerOffer[] = [],
): ContainerOffersBridge & {
    setOffers(offers: readonly ContainerOffer[]): void;
    reattachAnswer: ReattachResult | null;
} {
    let offers = initial;
    const state = {
        setOffers: (next: readonly ContainerOffer[]) => {
            offers = next;
        },
        reattachAnswer: null as ReattachResult | null,
        containerOffers: async () => ({ offers, strays: [] }),
        reattachContainer: async (renderId: string): Promise<ReattachResult> =>
            state.reattachAnswer ?? {
                ok: false,
                renderId,
                code: "no-record",
                message: "no fake answer configured",
            },
        cancelContainer: async (renderId: string) => {
            offers = offers.filter((offer) => offer.renderId !== renderId);
            return true;
        },
        dismissContainer: async (renderId: string) => {
            offers = offers.filter((offer) => offer.renderId !== renderId);
            return true;
        },
    };
    return state;
}

function containerOffer(renderId: string): ContainerOffer {
    return {
        renderId,
        containerName: `material-bluemap-${renderId}`,
        mode: "docker",
        where: "this computer",
        mapIds: ["overworld"],
        startedAt: new Date().toISOString(),
        state: "running",
        action: "attach",
        canResume: true,
        suggestRestart: false,
        message: "Found running in a container from an earlier session.",
    };
}

function fakeCiBridge(): CiRenderBridge & { emit(event: CiSyncEvent): void } {
    const listeners = new Set<(event: CiSyncEvent) => void>();
    return {
        emit: (event) => {
            for (const listener of listeners) listener(event);
        },
        ciRenderPreflight: async () => ({ ok: false, message: "not used" }),
        startCiRender: async (): Promise<CiSyncResult> => {
            throw new Error("not used by this test");
        },
        checkCiRender: async (syncId: string): Promise<CiSyncResult> => ({
            ok: false,
            syncId,
            failure: {
                code: "unsupported",
                message: "not used",
                detail: null,
                status: null,
                needsSignIn: false,
                needsEula: false,
                route: null,
                run: null,
                failingJob: null,
                logExcerpt: null,
            },
        }),
        listCiRenders: async () => ({ ok: true, value: [] }),
        cancelCiRender: async () => true,
        activeCiRenders: async () => [],
        onCiRenderEvent: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        canCancel: true,
        canList: true,
        canCheck: true,
        canSeeActive: true,
    };
}

/* -------------------------------------------------------------------------- */
/* bucketOfRoute / sortRows / searchTextOf                                    */
/* -------------------------------------------------------------------------- */

describe("bucketOfRoute", () => {
    it("groups the four progress routes into the three this page shows", () => {
        expect(bucketOfRoute("local")).toBe("local");
        expect(bucketOfRoute("docker")).toBe("docker");
        expect(bucketOfRoute("remote")).toBe("docker");
        expect(bucketOfRoute("actions")).toBe("ci");
        expect(bucketOfRoute(null)).toBeNull();
    });
});

function row(overrides: Partial<ActiveRenderRow>): ActiveRenderRow {
    return {
        key: "local:a",
        renderId: "a",
        route: "local",
        routeDetail: null,
        worldLabel: "world",
        projectLabel: "overworld",
        state: "running",
        facts: {
            route: "local",
            active: true,
            startedAtMs: null,
            lastEventAtMs: null,
            lastProgressAtMs: null,
            levels: [],
            estimate: { source: "none", seconds: null, text: null },
            transfers: [],
            shards: [],
            notes: [],
        },
        percent: null,
        errorText: null,
        startedAtMs: 1_000,
        canCancel: true,
        canOpenConsole: true,
        needsReattach: false,
        reattachMessage: null,
        busy: false,
        ...overrides,
    };
}

describe("sortRows", () => {
    it("puts running/offer rows before endings, newest first within a rank", () => {
        const finished = row({ key: "a", state: "finished", startedAtMs: 3_000 });
        const runningOld = row({ key: "b", state: "running", startedAtMs: 1_000 });
        const runningNew = row({ key: "c", state: "running", startedAtMs: 2_000 });
        const failed = row({ key: "d", state: "failed", startedAtMs: 4_000 });
        const ordered = sortRows([finished, runningOld, runningNew, failed]).map(
            (entry) => entry.key,
        );
        expect(ordered).toEqual(["c", "b", "d", "a"]);
    });
});

describe("searchTextOf", () => {
    it("composes every field a search should be able to find a render by", () => {
        const text = searchTextOf(
            row({
                worldLabel: "Frostpeak",
                projectLabel: "Overworld",
                routeDetail: "renderer@host:22",
                errorText: "boom",
            }),
        );
        expect(text).toContain("frostpeak");
        expect(text).toContain("overworld");
        expect(text).toContain("renderer@host:22");
        expect(text).toContain("boom");
    });
});

/* -------------------------------------------------------------------------- */
/* The regression test: a fresh page mount finds a render it never started    */
/* -------------------------------------------------------------------------- */

describe("a fresh page finds a render already going, exactly as navigating back must", () => {
    it("lists it, names its world and project, and keeps reporting live progress", async () => {
        const bridge = fakeWorldBridge();
        bridge.setActive(["render-1"]);
        bridge.setRecord("render-1", summaryFor("render-1", "Frostpeak", "Overworld"));

        // This models the render having been started, watched a while, and the window that
        // was watching it having gone away - the main process (this fake bridge) is all that
        // is left, exactly as `RenderOrchestrator.running` is in the real app.
        const aggregator = createActiveRenders({
            worldBridge: bridge,
            containerOffersBridge: null,
            ciRenders: null,
        });
        await aggregator.reconcile();
        await nextTick();

        expect(aggregator.emptyState.value).toBe("has-rows");
        const found = aggregator.rows.value.find((entry) => entry.renderId === "render-1");
        expect(found).toBeDefined();
        expect(found?.route).toBe("local");
        expect(found?.worldLabel).toBe("Frostpeak");
        expect(found?.projectLabel).toBe("Overworld");
        expect(found?.state === "starting" || found?.state === "running").toBe(true);

        // The render keeps going - a progress event the fake bridge fires now, the same
        // shape `render/ipc.ts` broadcasts to every window, whether or not one was open when
        // it started.
        bridge.emit({
            type: "progress",
            renderId: "render-1",
            phase: "rendering",
            task: {
                kind: "updating-map",
                mapId: "overworld",
                description: "updating map 'overworld'",
                percent: 42,
                etaSeconds: 90,
                etaText: null,
            },
            at: new Date().toISOString(),
        });
        await nextTick();

        const live = aggregator.rows.value.find((entry) => entry.renderId === "render-1");
        expect(live?.percent).toBeCloseTo(42, 0);
        expect(live?.state).toBe("running");

        aggregator.dispose();
    });

    it("distinguishes still-checking from genuinely nothing running", async () => {
        const bridge = fakeWorldBridge();
        const aggregator = createActiveRenders({
            worldBridge: bridge,
            containerOffersBridge: null,
            ciRenders: null,
        });
        expect(aggregator.emptyState.value).toBe("checking");
        await aggregator.reconcile();
        expect(aggregator.emptyState.value).toBe("empty");
        aggregator.dispose();
    });
});

/* -------------------------------------------------------------------------- */
/* Container reattach: an offer the app did not start this session            */
/* -------------------------------------------------------------------------- */

describe("a container render found on restart", () => {
    it("appears as an offer needing reattach, then promotes to a tracked row once accepted", async () => {
        const worldBridge = fakeWorldBridge();
        const offer = containerOffer("container-1");
        const containers = fakeContainerOffersBridge([offer]);

        const aggregator = createActiveRenders({
            worldBridge,
            containerOffersBridge: containers,
            ciRenders: null,
        });
        await aggregator.reconcile();

        const found = aggregator.rows.value.find((entry) => entry.renderId === "container-1");
        expect(found?.needsReattach).toBe(true);
        expect(found?.canOpenConsole).toBe(false);
        expect(found?.route).toBe("docker");

        containers.reattachAnswer = {
            ok: true,
            renderId: "container-1",
            action: "attached",
            dataRoot: "C:/renders/container-1/web",
            message: "Reattached.",
        };
        const accepted = await aggregator.reattach(found?.key ?? "");
        expect(accepted).toBe(true);

        // The reattacher reports on the render channel like any other render - see
        // `runtime/reattach.ts`'s own doc comment - so a `started` event follows the accept.
        worldBridge.emit({
            type: "started",
            renderId: "container-1",
            mapIds: ["overworld"],
            engine: {
                id: "upstream-java",
                label: "BlueMap engine",
                version: "5.22-27",
                javaVersion: null,
            },
            at: new Date().toISOString(),
        });
        await nextTick();

        const promoted = aggregator.rows.value.find((entry) => entry.renderId === "container-1");
        expect(promoted?.needsReattach).toBe(false);
        expect(promoted?.canOpenConsole).toBe(true);

        aggregator.dispose();
    });
});

/* -------------------------------------------------------------------------- */
/* GitHub's runners: independent of this app entirely                        */
/* -------------------------------------------------------------------------- */

describe("a render on GitHub's runners", () => {
    it("appears with its real polled status, reusing the existing CI composable", async () => {
        const ciBridge = fakeCiBridge();
        const ciRenders = createCiRenders(ciBridge);
        ciBridge.emit({
            type: "started",
            syncId: "sync-1",
            repository: "octo/world",
            mapId: "overworld",
            worldFolder: "C:/worlds/Frostpeak",
            at: new Date().toISOString(),
        });
        ciBridge.emit({
            type: "run",
            syncId: "sync-1",
            run: {
                runId: 1,
                runNumber: 1,
                htmlUrl: "https://github.com/octo/world/actions/runs/1",
                status: "in_progress",
                conclusion: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                headSha: "abc123",
                jobs: [],
            },
            at: new Date().toISOString(),
        });

        const aggregator = createActiveRenders({
            worldBridge: null,
            containerOffersBridge: null,
            ciRenders,
        });
        await aggregator.reconcile();
        await nextTick();

        const found = aggregator.rows.value.find((entry) => entry.renderId === "sync-1");
        expect(found).toBeDefined();
        expect(found?.route).toBe("ci");
        expect(found?.routeDetail).toBe("octo/world");
        expect(found?.state).toBe("running");
        expect(found?.canOpenConsole).toBe(true);

        aggregator.dispose();
    });
});

/* -------------------------------------------------------------------------- */
/* Cancellation, dispatched to the right route                                */
/* -------------------------------------------------------------------------- */

describe("cancel", () => {
    it("cancels a local render through the world bridge", async () => {
        const bridge = fakeWorldBridge();
        bridge.setActive(["render-1"]);
        bridge.setRecord("render-1", summaryFor("render-1", "Frostpeak", "Overworld"));
        const aggregator = createActiveRenders({
            worldBridge: bridge,
            containerOffersBridge: null,
            ciRenders: null,
        });
        await aggregator.reconcile();

        const ok = await aggregator.cancel("local:render-1");
        expect(ok).toBe(true);
        expect(bridge.cancelled).toContain("render-1");
        aggregator.dispose();
    });

    it("reports the real error text of a failed render rather than a generic message", async () => {
        const bridge = fakeWorldBridge();
        bridge.setActive(["render-2"]);
        bridge.setRecord("render-2", summaryFor("render-2", "Frostpeak", "Overworld"));
        const aggregator = createActiveRenders({
            worldBridge: bridge,
            containerOffersBridge: null,
            ciRenders: null,
        });
        await aggregator.reconcile();

        bridge.emit({
            type: "failed",
            renderId: "render-2",
            failure: {
                code: "cli-failed",
                message: "The engine exited with code 1.",
                settings: null,
                detail: "OutOfMemoryError: Java heap space",
                exitCode: 1,
            },
            at: new Date().toISOString(),
        });
        await nextTick();

        const found = aggregator.rows.value.find((entry) => entry.renderId === "render-2");
        expect(found?.state).toBe("failed");
        expect(found?.errorText).toContain("The engine exited with code 1.");
        expect(found?.errorText).toContain("OutOfMemoryError");
        aggregator.dispose();
    });
});

describe("consoleTargetFor", () => {
    it("routes a local/docker row at the World tab, focused on its render id", async () => {
        const bridge = fakeWorldBridge();
        bridge.setActive(["render-1"]);
        bridge.setRecord("render-1", summaryFor("render-1", "Frostpeak", "Overworld"));
        const aggregator = createActiveRenders({
            worldBridge: bridge,
            containerOffersBridge: null,
            ciRenders: null,
        });
        await aggregator.reconcile();

        const target = aggregator.consoleTargetFor("local:render-1");
        expect(target).toEqual({ page: "world", focusRenderId: "render-1" });
        aggregator.dispose();
    });

    it("routes a CI row at the GitHub runners tab, with no per-window focus id", async () => {
        const ciBridge = fakeCiBridge();
        const ciRenders = createCiRenders(ciBridge);
        ciBridge.emit({
            type: "started",
            syncId: "sync-1",
            repository: "octo/world",
            mapId: "overworld",
            worldFolder: "C:/worlds/Frostpeak",
            at: new Date().toISOString(),
        });
        const aggregator = createActiveRenders({
            worldBridge: null,
            containerOffersBridge: null,
            ciRenders,
        });
        await aggregator.reconcile();

        const target = aggregator.consoleTargetFor("ci:sync-1");
        expect(target).toEqual({ page: "cirender", focusRenderId: null });
        aggregator.dispose();
    });

    it("refuses to route an offer that has not been reattached yet", async () => {
        const worldBridge = fakeWorldBridge();
        const containers = fakeContainerOffersBridge([containerOffer("container-1")]);
        const aggregator = createActiveRenders({
            worldBridge,
            containerOffersBridge: containers,
            ciRenders: null,
        });
        await aggregator.reconcile();

        expect(aggregator.consoleTargetFor("docker:container-1")).toBeNull();
        aggregator.dispose();
    });
});
