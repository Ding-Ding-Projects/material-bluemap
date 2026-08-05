import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    BmMap,
    Chunk,
    Compression,
    DimensionType,
    FileMapStorage,
    MapSettings,
    PackVersion,
    Region,
    RenderManager,
    ResourcePack,
    Tristate,
    type Chunk as ChunkType,
    type ChunkConsumer,
    type Mask,
    type World,
} from "@material-bluemap/engine";
import { Grid, Vector2i } from "@material-bluemap/shared";
import { HttpServer } from "../src/http/HttpServer.js";
import { RenderDriver } from "../src/render/RenderDriver.js";
import { RenderUpdateHandler } from "../src/http/RenderUpdateHandler.js";

/*
 * This is the first out-of-engine consumer of the ported RenderManager (issue #29): a
 * server-triggered map update constructs a real MapUpdatePreparationTask/MapUpdateTask
 * through a real RenderManager, exactly as a plugin command upstream would. Nothing here is
 * mocked — not RenderManager, not MapUpdatePreparationTask, not WorldRegionUpdateTask, and
 * deliberately not HiresModelManager either, unlike packages/engine's own
 * rendertasks.test.ts, which mocks it to avoid the cost of registering every render pass.
 * The point of *this* test is exactly the thing that mock would hide: that the pieces work
 * together against a real render manager and real storage, not only in isolation. A bare
 * ResourcePack (no block-state/model data) keeps the real mesher's work trivial — every
 * lookup in BlockStateModelRenderer#renderModel returns null and it renders nothing — while
 * still exercising the genuine, unmocked pipeline end to end. It is fast for the same
 * reason it is honest: nothing is faked to make it fast.
 *
 * The fake World/Region/Chunk below matches packages/engine's own
 * map/rendermanager/rendertasks.test.ts fixture (same grid sizes, same tile count math),
 * built from the public engine barrel instead of engine's internal relative paths, since
 * that is all a package outside packages/engine can reach.
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

class FakeChunk extends Chunk {
    override isGenerated(): boolean {
        return true;
    }
    override hasLightData(): boolean {
        return true;
    }
}

class FakeRegion extends Region<ChunkType> {
    constructor(
        private readonly chunkMin: number,
        private readonly chunkMax: number,
        private readonly lastModified: number,
    ) {
        super();
    }

    override async iterateAllChunks(consumer: ChunkConsumer<ChunkType>): Promise<void> {
        for (let x = this.chunkMin; x <= this.chunkMax; x++)
            for (let z = this.chunkMin; z <= this.chunkMax; z++) consumer.filter?.(x, z, this.lastModified);
    }

    override emptyChunk(): ChunkType {
        return Chunk.EMPTY_CHUNK;
    }

    override exists(): boolean {
        return true;
    }
}

/** upstream-equivalent fixture arithmetic worked out in rendertasks.test.ts: 9 hires tiles. */
const REGION_TILE_COUNT = 9;

function fakeWorld(): World {
    const regionGrid = new Grid(64);
    const chunkGrid = new Grid(16);

    return {
        getId: () => "fake:overworld",
        getDimensionType: () => DimensionType.OVERWORLD,
        getRegionGrid: () => regionGrid,
        getChunkGrid: () => chunkGrid,
        listRegions: () => [new Vector2i(0, 0)],
        getRegion: () => new FakeRegion(0, 3, 42),
        getChunk: () => new FakeChunk(),
        // The real (unmocked) HiresModelManager's block and entity render passes read
        // these two directly, unlike engine's own rendertasks.test.ts fixture — which
        // mocks HiresModelManager away and so never needs them.
        getChunkAtBlock: () => new FakeChunk(),
        iterateEntities: async () => {},
        preloadChunks: async () => {},
        preloadRegionChunks: async () => {},
        invalidateChunkCache: () => {},
    } as unknown as World;
}

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "bluemap-render-driver-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

async function buildMap(id = "overworld"): Promise<BmMap> {
    const storage = new FileMapStorage(join(root, id), Compression.GZIP, false);
    return BmMap.create(id, id, fakeWorld(), storage, new ResourcePack(new PackVersion(34, 0)), settings());
}

describe("RenderDriver: drives the real RenderManager end to end", () => {
    it("constructs a real MapUpdateTask through a real RenderManager and writes real tiles", async () => {
        const map = await buildMap();
        const manager = new RenderManager({ progressUpdateIntervalMs: 1_000_000 });
        const driver = new RenderDriver(manager);

        manager.start(2);
        try {
            const result = driver.triggerUpdate(map);
            expect(result.scheduled).toBe(true);

            await manager.awaitIdle();
        } finally {
            manager.stop();
            await manager.awaitShutdown();
        }

        // Every tile of the fake world's one region was really rendered and really written
        // to a real FileMapStorage — not asserted against a mock's call log.
        let written = 0;
        for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) {
                if ((await map.getStorage().hiresTiles().read(x, z)) !== null) written++;
            }
        }
        expect(written).toBe(REGION_TILE_COUNT);
    });

    it("queues a fresh preparation pass on every trigger, exactly as scheduleRenderTask reports it", async () => {
        // Verified against the real RenderManager, not assumed: neither MapUpdatePreparationTask
        // nor MapUpdateTask overrides `equals` (only WorldRegionUpdateTask does, by map id,
        // region and strategy), so RenderManager's queue-containment check — which compares
        // by that identity/equality, and explicitly exempts the head of the queue regardless
        // — never recognises two independently-built preparation tasks for the same map as
        // the same work. Two triggers really do queue two passes; UpdateRequestResult.scheduled
        // is `scheduleRenderTask`'s real return value, relayed honestly rather than a
        // dedup guarantee this driver does not actually have.
        const map = await buildMap();
        const manager = new RenderManager({ progressUpdateIntervalMs: 1_000_000 });
        const driver = new RenderDriver(manager);

        const first = driver.triggerUpdate(map);
        const second = driver.triggerUpdate(map);

        expect(first.scheduled).toBe(true);
        expect(second.scheduled).toBe(true);
        expect(manager.getScheduledRenderTaskCount()).toBe(2);
    });

    it("reports status from the real RenderManager, not invented data", async () => {
        const map = await buildMap();
        const manager = new RenderManager({ progressUpdateIntervalMs: 1_000_000 });
        const driver = new RenderDriver(manager);

        expect(driver.getStatus()).toEqual({
            running: false,
            queuedTaskCount: 0,
            currentTaskDescription: null,
            currentTaskDetail: null,
            currentTaskProgress: null,
            estimatedTimeRemainingMs: null,
        });

        manager.start(1);
        driver.triggerUpdate(map);
        try {
            await manager.awaitIdle();
        } finally {
            manager.stop();
            await manager.awaitShutdown();
        }

        const finished = driver.getStatus();
        expect(finished.running).toBe(false);
        expect(finished.queuedTaskCount).toBe(0);
    });
});

describe("RenderUpdateHandler: the HTTP surface over RenderDriver", () => {
    const cleanups: Array<() => Promise<void> | void> = [];
    afterEach(async () => {
        while (cleanups.length) await cleanups.pop()!();
    });

    it("POSTs a trigger, then GETs a real status, over real HTTP", async () => {
        const map = await buildMap();
        const manager = new RenderManager({ progressUpdateIntervalMs: 1_000_000 });
        const driver = new RenderDriver(manager);
        const handler = new RenderUpdateHandler(driver);
        handler.setMap("overworld", map);

        const server = new HttpServer();
        server.addHandler(handler);
        const addr = await server.listen();
        cleanups.push(() => server.close());
        const base = `http://127.0.0.1:${String(addr.port)}`;

        manager.start(2);
        cleanups.push(async () => {
            manager.stop();
            await manager.awaitShutdown();
        });

        const post = await fetch(`${base}/maps/overworld/update`, { method: "POST" });
        expect(post.status).toBe(202);
        expect(await post.json()).toEqual({ scheduled: true });

        await manager.awaitIdle();

        const get = await fetch(`${base}/maps/overworld/update`);
        expect(get.status).toBe(200);
        const status = (await get.json()) as { running: boolean; queuedTaskCount: number };
        expect(status.running).toBe(true); // still running: awaitIdle only drains the queue
        expect(status.queuedTaskCount).toBe(0);

        let written = 0;
        for (let x = -1; x <= 1; x++)
            for (let z = -1; z <= 1; z++)
                if ((await map.getStorage().hiresTiles().read(x, z)) !== null) written++;
        expect(written).toBe(REGION_TILE_COUNT);
    });

    it("404s an update request for a map that was never registered", async () => {
        const manager = new RenderManager();
        const driver = new RenderDriver(manager);
        const handler = new RenderUpdateHandler(driver);
        const server = new HttpServer();
        server.addHandler(handler);
        const addr = await server.listen();
        cleanups.push(() => server.close());
        const base = `http://127.0.0.1:${String(addr.port)}`;

        expect((await fetch(`${base}/maps/nether/update`, { method: "POST" })).status).toBe(404);
    });

    it("400s an unknown force strategy and 405s an unsupported method", async () => {
        const map = await buildMap();
        const manager = new RenderManager();
        const driver = new RenderDriver(manager);
        const handler = new RenderUpdateHandler(driver);
        handler.setMap("overworld", map);
        const server = new HttpServer();
        server.addHandler(handler);
        const addr = await server.listen();
        cleanups.push(() => server.close());
        const base = `http://127.0.0.1:${String(addr.port)}`;

        expect(
            (await fetch(`${base}/maps/overworld/update?force=not-a-strategy`, { method: "POST" })).status,
        ).toBe(400);
        expect((await fetch(`${base}/maps/overworld/update`, { method: "DELETE" })).status).toBe(405);
    });
});
