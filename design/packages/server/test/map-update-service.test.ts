import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    BmMap,
    Compression,
    DataPack,
    DimensionType,
    FileMapStorage,
    MCAWorld,
    MCAWorldRegionWatchService,
    MapSettings,
    Mask,
    PackVersion,
    RegionType,
    RenderManager,
    ResourcePack,
    Tristate,
    WatchService,
    WorldRegionUpdateTask,
    type World,
} from "@worldlens/engine";
import { Grid, Key, Vector2i } from "@worldlens/shared";
import { generateWorld } from "@worldlens/worldgen";
import { MapUpdateService } from "../src/plugin/MapUpdateService.js";

/*
 * Two fixture tiers, mirroring `test/render-driver.test.ts`:
 *
 * - `buildMapOverRegionFolder` is the light one: a real chokidar-backed
 *   `MCAWorldRegionWatchService` over a real temp folder, with a structural fake `World`
 *   for everything else (issue #40 is about the bridge between a watch-event and a
 *   scheduled task, not about re-proving MCAWorld can load a real anvil file — that is
 *   already covered by packages/engine's own tests and by render-driver.test.ts). Region
 *   files here hold arbitrary bytes, exactly like MCAWorldRegionWatchService.test.ts's own
 *   fixtures — nothing here ever calls WorldRegionUpdateTask.doWork()/run(), which is the
 *   only path that would need real chunk data.
 * - `buildRealWorldMap` is the heavy one, used once, for the "worldgen can generate a
 *   world; touching a region file must schedule exactly the right region" requirement
 *   verbatim: a real packages/worldgen-generated world, loaded through the real
 *   `MCAWorld.load` anvil reader.
 */

const ALWAYS: Mask = {
    test: (...args: number[]) => (args.length === 3 ? true : Tristate.TRUE),
    isEdge: () => false,
    submask: () => ALWAYS,
    inverted: () => ALWAYS,
} as unknown as Mask;

function settings(): MapSettings {
    const base: MapSettings = {
        getSorting: () => 0,
        getStartPos: () => new Vector2i(0, 0),
        getSkyColor: () => "#7dabff",
        getVoidColor: () => "#000000",
        getMinInhabitedTime: () => 0,
        getMinInhabitedTimeRadius: () => 0,
        getHiresTileSize: () => 32,
        getLowresTileSize: () => 500,
        getLodCount: () => 3,
        getLodFactor: () => 5,
        getAmbientLight: () => 0,
        getSkyLight: () => 1,
        isEnablePerspectiveView: () => true,
        isEnableFlatView: () => true,
        isEnableFreeFlightView: () => true,
        isEnableHires: () => true,
        isCheckForRemovedRegions: () => false,
        getRemoveCavesBelowY: () => 55,
        getCaveDetectionOceanFloor: () => -5,
        isCaveDetectionUsesBlockLight: () => false,
        isRenderEdges: () => true,
        getEdgeLightStrength: () => 8,
        isIgnoreMissingLightData: () => true,
        getRenderMask: () => ALWAYS,
        isSaveHiresLayer: () => MapSettings.isSaveHiresLayer(base),
        isRenderTopOnly: () => MapSettings.isRenderTopOnly(base),
    };
    return base;
}

class FakeChunk {
    isGenerated(): boolean {
        return true;
    }
    hasLightData(): boolean {
        return true;
    }
}

function fakeWorldOverRegionFolder(regionFolder: string, watchServiceOverride?: () => WatchService<Vector2i>): World {
    const regionGrid = new Grid(64);
    const chunkGrid = new Grid(16);

    return {
        getId: () => "fake:overworld",
        getDimensionType: () => DimensionType.OVERWORLD,
        getRegionGrid: () => regionGrid,
        getChunkGrid: () => chunkGrid,
        listRegions: () => [],
        getRegion: () => {
            throw new Error("not needed: this fixture never runs WorldRegionUpdateTask.doWork()/run()");
        },
        getChunk: () => new FakeChunk(),
        getChunkAtBlock: () => new FakeChunk(),
        iterateEntities: async () => {},
        preloadChunks: async () => {},
        preloadRegionChunks: async () => {},
        invalidateChunkCache: () => {},
        createRegionWatchService:
            watchServiceOverride ?? ((): WatchService<Vector2i> => new MCAWorldRegionWatchService(regionFolder)),
    } as unknown as World;
}

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "bluemap-map-update-service-"));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

async function buildMapOverRegionFolder(
    regionFolder: string,
    watchServiceOverride?: () => WatchService<Vector2i>,
): Promise<BmMap> {
    mkdirSync(regionFolder, { recursive: true });
    const storage = new FileMapStorage(join(root, "map-storage"), Compression.GZIP, false);
    return BmMap.create(
        "overworld",
        "overworld",
        fakeWorldOverRegionFolder(regionFolder, watchServiceOverride),
        storage,
        new ResourcePack(new PackVersion(34, 0)),
        settings(),
    );
}

/** waits until chokidar finished its initial scan, matching MCAWorldRegionWatchService.test.ts's own helper. */
async function watcherReady(service: MapUpdateService): Promise<void> {
    const watchService = service.getWatchService();
    expect(watchService).toBeInstanceOf(MCAWorldRegionWatchService);
    await (watchService as MCAWorldRegionWatchService).whenReady();
}

describe("MapUpdateService: bridges watch events to scheduled render tasks (issue #40)", () => {
    it("schedules exactly the right region on a real region-file change", { timeout: 15000 }, async () => {
        const regionFolder = join(root, "region");
        const map = await buildMapOverRegionFolder(regionFolder);
        const manager = new RenderManager();
        const service = new MapUpdateService(manager, map, { regionUpdateCooldownMs: 40, minUpdateDelayMs: 40 });

        service.start();
        await watcherReady(service);

        writeFileSync(join(regionFolder, "r.3.-2.mca"), "data");

        // let the fs event arrive and the (short, test-configured) debounce fire
        await new Promise((resolve) => setTimeout(resolve, 500));

        expect(manager.getScheduledRenderTaskCount()).toBe(1);
        const scheduled = manager.getScheduledRenderTasks()[0];
        expect(scheduled).toBeInstanceOf(WorldRegionUpdateTask);
        const task = scheduled as WorldRegionUpdateTask;
        expect(task.getRegionPos().equals(new Vector2i(3, -2))).toBe(true);
        expect(task.getMap()).toBe(map);

        await service.close();
    });

    // A real, generous cooldown rather than a fake-timer rewrite: the fixture is a genuine
    // chokidar-backed watcher over a real temp folder (see this file's own top comment),
    // and faking timers would have to fake or bypass chokidar's own internal debouncing
    // too - which stops proving the actual bridge between an fs-event and a scheduled task
    // that issue #40 is about. A 60ms cooldown against three writes 25ms apart leaves no
    // margin once the process is starved of CPU: a scheduling delay of a few tens of
    // milliseconds (documented elsewhere in this repo - see 1074ea33's commit message on
    // "sustained 80-100% CPU contention from other agents") is enough for the first write's
    // cooldown to fire and schedule a task before the second write's fs-event has even
    // arrived, coalescing that pair separately from the third and producing two scheduled
    // tasks instead of one - confirmed on a hosted run (31029389328): "expected 2 to be 1".
    // Widening the cooldown to 500ms (matching the margin the "stretches the delay" test
    // below already uses) and the settle wait to 1500ms does not change what is asserted,
    // only how much contention it can absorb before a real debounce race like that one.
    it("coalesces a burst of events for one region into a single scheduled task (dedup)", { timeout: 15000 }, async () => {
        const regionFolder = join(root, "region");
        const map = await buildMapOverRegionFolder(regionFolder);
        const manager = new RenderManager();
        const service = new MapUpdateService(manager, map, { regionUpdateCooldownMs: 500, minUpdateDelayMs: 500 });

        service.start();
        await watcherReady(service);

        const regionFile = join(regionFolder, "r.0.0.mca");
        writeFileSync(regionFile, "a");
        await new Promise((resolve) => setTimeout(resolve, 25));
        writeFileSync(regionFile, "ab");
        await new Promise((resolve) => setTimeout(resolve, 25));
        writeFileSync(regionFile, "abc");

        // give every event time to arrive, and the (last-reset) debounce time to fire
        await new Promise((resolve) => setTimeout(resolve, 1500));

        expect(manager.getScheduledRenderTaskCount()).toBe(1);
        const task = manager.getScheduledRenderTasks()[0] as WorldRegionUpdateTask;
        expect(task.getRegionPos().equals(new Vector2i(0, 0))).toBe(true);

        await service.close();
    });

    it("queues behind, never races or drops, a new event for a region already at the head of the queue", { timeout: 15000 }, async () => {
        // upstream's own point (see the issue's "two hard parts"): a region can get a new
        // fs-event while its previous task is already being worked on. RenderManager's own
        // containsRenderTask deliberately exempts index 0 (the head, "already being
        // processed" — see RenderManager.ts's own doc comment on containsRenderTask), so a
        // second equal task for that region is *not* refused as a duplicate: it queues
        // behind the running one instead of being dropped or racing it. This bridge does not
        // special-case that: it is a direct, unmodified consequence of reusing
        // RenderManager.scheduleRenderTask exactly as RenderDriver already does, verified
        // here rather than assumed.
        const regionFolder = join(root, "region");
        const map = await buildMapOverRegionFolder(regionFolder);
        const manager = new RenderManager();
        const service = new MapUpdateService(manager, map, { regionUpdateCooldownMs: 40, minUpdateDelayMs: 40 });

        // simulate "a render for this region is already running": put an equal
        // WorldRegionUpdateTask directly at the head of the queue, the same way the real
        // render manager would once a worker claims it — RenderManager's containment check
        // only reads the queue, it never distinguishes "running" from "merely queued at 0".
        const headTask = new WorldRegionUpdateTask(map, new Vector2i(2, 2));
        expect(manager.scheduleRenderTask(headTask)).toBe(true);
        expect(manager.getScheduledRenderTaskCount()).toBe(1);

        service.start();
        await watcherReady(service);

        writeFileSync(join(regionFolder, "r.2.2.mca"), "data");
        await new Promise((resolve) => setTimeout(resolve, 400));

        // the running/head task is untouched, and the new one queued behind it rather than
        // being refused as a duplicate or clobbering the head.
        expect(manager.getScheduledRenderTaskCount()).toBe(2);
        const [first, second] = manager.getScheduledRenderTasks();
        expect(first).toBe(headTask);
        expect(second).toBeInstanceOf(WorldRegionUpdateTask);
        expect((second as WorldRegionUpdateTask).getRegionPos().equals(new Vector2i(2, 2))).toBe(true);
        expect(second).not.toBe(headTask);

        await service.close();
    });

    it("stretches the delay by the cooldown so two real schedules of one region stay cooldownMs apart", { timeout: 15000 }, async () => {
        const regionFolder = join(root, "region");
        const map = await buildMapOverRegionFolder(regionFolder);
        const manager = new RenderManager();
        // cooldown well above the floor, so the second schedule must wait for the cooldown
        // rather than for the (much shorter) floor.
        const service = new MapUpdateService(manager, map, { regionUpdateCooldownMs: 600, minUpdateDelayMs: 30 });

        service.start();
        await watcherReady(service);

        const regionFile = join(regionFolder, "r.7.7.mca");
        writeFileSync(regionFile, "a");

        // wait for the first schedule to fire (floor is 30ms)
        await new Promise((resolve) => setTimeout(resolve, 250));
        expect(manager.getScheduledRenderTaskCount()).toBe(1);

        // touch again shortly after the first fired: timeSinceLastUpdate is small, so the
        // cooldown (600ms) should dominate the max(...) rather than the 30ms floor.
        writeFileSync(regionFile, "ab");
        await new Promise((resolve) => setTimeout(resolve, 250));
        // still only one task: the second schedule has not fired yet, because it is waiting
        // out the cooldown rather than the floor.
        expect(manager.getScheduledRenderTaskCount()).toBe(1);

        await new Promise((resolve) => setTimeout(resolve, 600));
        expect(manager.getScheduledRenderTaskCount()).toBe(2);

        await service.close();
    });

    it("stops scheduling and leaks no timers once closed", { timeout: 15000 }, async () => {
        const regionFolder = join(root, "region");
        const map = await buildMapOverRegionFolder(regionFolder);
        const manager = new RenderManager();
        // a delay long enough that it is still pending when close() runs
        const service = new MapUpdateService(manager, map, { regionUpdateCooldownMs: 5000, minUpdateDelayMs: 5000 });

        service.start();
        await watcherReady(service);

        writeFileSync(join(regionFolder, "r.1.1.mca"), "data");
        await new Promise((resolve) => setTimeout(resolve, 300));

        // the debounce timer is pending, nothing scheduled yet
        expect(manager.getScheduledRenderTaskCount()).toBe(0);
        expect((service as unknown as { scheduledUpdates: Map<string, unknown> }).scheduledUpdates.size).toBe(1);

        await service.close();

        expect(service.isClosed()).toBe(true);
        expect((service as unknown as { scheduledUpdates: Map<string, unknown> }).scheduledUpdates.size).toBe(0);

        // wait past what would have been the original 5s fire time (using a much shorter
        // stand-in wait — the pending timer was cleared, so nothing can fire regardless)
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(manager.getScheduledRenderTaskCount()).toBe(0);

        // closing twice is safe
        await expect(service.close()).resolves.toBeUndefined();

        // the underlying watch-service is genuinely closed
        await expect(service.getWatchService().take()).rejects.toBeInstanceOf(WatchService.ClosedException);
    });

    it("surfaces a watch-service failure through onError, never an unhandled rejection", async () => {
        const errors: Array<{ message: string; error: unknown }> = [];
        let unhandled: unknown = "not seen";
        const onUnhandledRejection = (reason: unknown): void => {
            unhandled = reason;
        };
        process.on("unhandledRejection", onUnhandledRejection);

        const failingWatchService: WatchService<Vector2i> = {
            poll: (() => null) as unknown as WatchService<Vector2i>["poll"],
            take: vi.fn().mockRejectedValue(new Error("fs exploded")),
            close: async () => {},
        };

        const map = await buildMapOverRegionFolder(join(root, "region"), () => failingWatchService);
        const manager = new RenderManager();
        const service = new MapUpdateService(manager, map, {
            onError: (message, error) => errors.push({ message, error }),
        });

        service.start();
        // let the loop's microtasks/macrotasks settle
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(errors.some((e) => e.message.includes("Exception trying to watch map"))).toBe(true);
        expect(unhandled).toBe("not seen");

        process.off("unhandledRejection", onUnhandledRejection);
        await service.close();
    });

    it("surfaces a scheduling failure through onError without killing the watch loop", { timeout: 15000 }, async () => {
        const regionFolder = join(root, "region");
        const map = await buildMapOverRegionFolder(regionFolder);
        const errors: Array<{ message: string; error: unknown }> = [];

        const throwingManager = {
            scheduleRenderTask: vi.fn(() => {
                throw new Error("scheduling boom");
            }),
        } as unknown as RenderManager;

        const service = new MapUpdateService(throwingManager, map, {
            regionUpdateCooldownMs: 40,
            minUpdateDelayMs: 40,
            onError: (message, error) => errors.push({ message, error }),
        });

        service.start();
        await watcherReady(service);

        writeFileSync(join(regionFolder, "r.9.9.mca"), "data");
        await new Promise((resolve) => setTimeout(resolve, 400));

        expect(errors.some((e) => e.message.includes("Exception scheduling render task"))).toBe(true);
        // the run-loop is still alive after the throw — proven by closing it cleanly rather
        // than the close() call hanging on a run-loop that already died some other way
        await expect(service.close()).resolves.toBeUndefined();
    });
});

describe("MapUpdateService: over a real worldgen-generated world (issue #40's own wording)", () => {
    it("touching a real generated region-file schedules exactly the region it belongs to", { timeout: 20000 }, async () => {
        const generated = await generateWorld({
            seed: 20260805,
            size: 16,
            outDir: join(root, "world-src"),
        });
        expect(generated.chunkCount).toBe(1);

        const dataPack = new DataPack(new PackVersion(48, 0));
        await dataPack.loadResources([]);

        const world = await MCAWorld.load(generated.worldFolder, Key.minecraft("overworld"), null, dataPack);
        expect(world).toBeInstanceOf(MCAWorld);

        const storage = new FileMapStorage(join(root, "real-world-map"), Compression.GZIP, false);
        const map = await BmMap.create("overworld", "Overworld", world, storage, new ResourcePack(new PackVersion(34, 0)), settings());

        const regionFolder = join(generated.worldFolder, "region");
        const regionFiles = readdirSync(regionFolder);
        expect(regionFiles.length).toBeGreaterThan(0);
        const expectedPos = RegionType.regionForFileName(regionFiles[0]!);
        expect(expectedPos).not.toBeNull();

        const manager = new RenderManager();
        const service = new MapUpdateService(manager, map, { regionUpdateCooldownMs: 50, minUpdateDelayMs: 50 });

        service.start();
        await watcherReady(service);

        // touch (rewrite) the real, worldgen-produced region file
        writeFileSync(join(regionFolder, regionFiles[0]!), "touched");

        await new Promise((resolve) => setTimeout(resolve, 600));

        expect(manager.getScheduledRenderTaskCount()).toBe(1);
        const task = manager.getScheduledRenderTasks()[0] as WorldRegionUpdateTask;
        expect(task.getRegionPos().equals(expectedPos!)).toBe(true);
        expect(task.getMap()).toBe(map);

        await service.close();
    });
});
