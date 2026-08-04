import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Color, Grid, Vector2i } from "@material-bluemap/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * HiresModelManager is mocked for the same reason `map/BmMap.test.ts` mocks it:
 * constructing a real one instantiates every registered render-pass. Nothing in this file
 * tests the mesher — what is under test is which tiles a task decides to touch, in what
 * order, and what it writes afterwards.
 */
const renderCalls: Vector2i[] = [];
const unrenderCalls: Vector2i[] = [];
let hiresTileGrid: Grid = new Grid(32, 2);

vi.mock("../hires/HiresModelManager.js", () => ({
    HiresModelManager: class {
        constructor(
            _world: unknown,
            _storage: unknown,
            _resourcePack: unknown,
            _textureGallery: unknown,
            _renderSettings: unknown,
            tileGrid: Grid,
        ) {
            hiresTileGrid = tileGrid;
        }
        getTileGrid(): Grid {
            return hiresTileGrid;
        }
        async render(
            tile: Vector2i,
            tileMetaConsumer: (
                x: number,
                z: number,
                color: Color,
                height: number,
                blockLight: number,
            ) => void,
        ): Promise<void> {
            renderCalls.push(tile);
            tileMetaConsumer(tile.getX(), tile.getY(), new Color(), 64, 3);
        }
        async unrender(tile: Vector2i): Promise<void> {
            unrenderCalls.push(tile);
        }
    },
}));

const { BmMap } = await import("../BmMap.js");
const { MapSettings } = await import("../MapSettings.js");
const { Tristate } = await import("../../util/Tristate.js");
const { Chunk } = await import("../../world/Chunk.js");
const { Region } = await import("../../world/Region.js");
const { Compression } = await import("../../storage/compression/Compression.js");
const { FileMapStorage } = await import("../../storage/file/FileMapStorage.js");
const { ResourcePack } = await import("../../resources/pack/resourcepack/ResourcePack.js");
const { PackVersion } = await import("../../resources/pack/PackVersion.js");
const { TileState } = await import("../renderstate/TileState.js");
const { TileInfo } = await import("../renderstate/TileInfoRegion.js");

const { RenderTask } = await import("./RenderTask.js");
const { CombinedRenderTask } = await import("./CombinedRenderTask.js");
const { MapSaveTask } = await import("./MapSaveTask.js");
const { MapPurgeTask } = await import("./MapPurgeTask.js");
const { StorageDeleteTask } = await import("./StorageDeleteTask.js");
const { MapUpdateTask } = await import("./MapUpdateTask.js");
const { MapUpdatePreparationTask } = await import("./MapUpdatePreparationTask.js");
const { TileUpdateStrategy } = await import("./TileUpdateStrategy.js");
const { WorldRegionUpdateTask } = await import("./WorldRegionUpdateTask.js");

type RenderTaskType = import("./RenderTask.js").RenderTask;
type WorldRegionUpdateTaskType = InstanceType<typeof WorldRegionUpdateTask>;
// `InstanceType<typeof MapUpdateTask>` does not work here: the class has a private
// constructor (see the note in MapUpdateTask.ts), so the type of the constructor value
// is not a public constructor signature
type MapUpdateTaskType = import("./MapUpdateTask.js").MapUpdateTask;
type MapType = import("../BmMap.js").BmMap;
type MapSettingsType = import("../MapSettings.js").MapSettings;
type MaskType = import("../mask/Mask.js").Mask;
type MapStorageType = import("../../storage/MapStorage.js").MapStorage;
type WorldType = import("../../world/World.js").World;
type ChunkType = import("../../world/Chunk.js").Chunk;
type ChunkConsumerType<T> = import("../../world/ChunkConsumer.js").ChunkConsumer<T>;

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const ALWAYS: MaskType = {
    test: (...args: number[]) => (args.length === 3 ? true : Tristate.TRUE),
    isEdge: () => false,
    submask: () => ALWAYS,
    inverted: () => ALWAYS,
} as unknown as MaskType;

const NEVER: MaskType = {
    test: (...args: number[]) => (args.length === 3 ? false : Tristate.FALSE),
    isEdge: () => false,
    submask: () => NEVER,
    inverted: () => NEVER,
} as unknown as MaskType;

function settings(overrides: Partial<MapSettingsType> = {}): MapSettingsType {
    const base: MapSettingsType = {
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
        // the light check is the first thing `checkTileRenderPreconditions` short-circuits
        // on; these tests are about scheduling, so the fake chunks are declared lit
        isIgnoreMissingLightData: () => true,
        getRenderMask: () => ALWAYS,
        isSaveHiresLayer: () => MapSettings.isSaveHiresLayer(base),
        isRenderTopOnly: () => MapSettings.isRenderTopOnly(base),
    };
    return Object.assign(base, overrides);
}

/** A generated, lit chunk — everything `checkTileRenderPreconditions` asks about. */
class FakeChunk extends Chunk {
    override isGenerated(): boolean {
        return true;
    }
    override hasLightData(): boolean {
        return true;
    }
}

class FakeRegion extends Region<ChunkType> {
    readonly #chunkMin: number;
    readonly #chunkMax: number;
    readonly #lastModified: number;
    readonly #exists: boolean;

    constructor(chunkMin: number, chunkMax: number, lastModified: number, exists: boolean) {
        super();
        this.#chunkMin = chunkMin;
        this.#chunkMax = chunkMax;
        this.#lastModified = lastModified;
        this.#exists = exists;
    }

    override async iterateAllChunks(consumer: ChunkConsumerType<ChunkType>): Promise<void> {
        for (let x = this.#chunkMin; x <= this.#chunkMax; x++)
            for (let z = this.#chunkMin; z <= this.#chunkMax; z++)
                consumer.filter?.(x, z, this.#lastModified);
    }

    override emptyChunk(): ChunkType {
        return Chunk.EMPTY_CHUNK;
    }

    override exists(): boolean {
        return this.#exists;
    }
}

interface FakeWorldOptions {
    regionGridSize?: number;
    chunkGridSize?: number;
    regions?: Vector2i[];
    lastModified?: number;
    regionExists?: boolean;
}

function fakeWorld(options: FakeWorldOptions = {}): WorldType {
    const regionSize = options.regionGridSize ?? 64;
    const chunkSize = options.chunkGridSize ?? 16;
    const regionGrid = new Grid(regionSize);
    const chunkGrid = new Grid(chunkSize);

    return {
        getId: () => "fake:overworld",
        getRegionGrid: () => regionGrid,
        getChunkGrid: () => chunkGrid,
        listRegions: () => options.regions ?? [new Vector2i(0, 0)],
        getRegion: () =>
            new FakeRegion(
                0,
                regionSize / chunkSize - 1,
                options.lastModified ?? 42,
                options.regionExists ?? true,
            ),
        getChunk: () => new FakeChunk(),
        preloadChunks: async () => {},
        preloadRegionChunks: async () => {},
        invalidateChunkCache: () => {},
    } as unknown as WorldType;
}

interface RecordingLowres {
    getTileGrid(): Grid;
    getLodCount(): number;
    getLodFactor(): number;
    set(): void;
    save(): void;
    discard(): void;
}

let root: string;
let events: string[];

function lowres(): () => RecordingLowres {
    const manager: RecordingLowres = {
        getTileGrid: () => new Grid(500),
        getLodCount: () => 3,
        getLodFactor: () => 5,
        set: () => {},
        save: () => {
            events.push("lowres.save");
        },
        discard: () => {
            events.push("lowres.discard");
        },
    };
    return () => manager;
}

async function createMap(
    id = "overworld",
    world: WorldType = fakeWorld(),
    overrides: Partial<MapSettingsType> = {},
): Promise<MapType> {
    const storage = new FileMapStorage(join(root, id), Compression.GZIP, false);
    return BmMap.create(
        id,
        id,
        world,
        storage,
        new ResourcePack(new PackVersion(34, 0)),
        settings(overrides),
        lowres() as never,
    );
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "bluemap-rendertask-"));
    renderCalls.length = 0;
    unrenderCalls.length = 0;
    events = [];
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/**
 * A minimal {@link RenderTaskType} reporting `work` units, recording every call into the
 * shared `events` list so ordering between sub-tasks is observable.
 */
class StubTask implements RenderTaskType {
    readonly name: string;
    readonly #total: number;
    #remaining: number;
    #cancelled = false;

    constructor(name: string, work = 1) {
        this.name = name;
        this.#total = work;
        this.#remaining = work;
    }

    async doWork(): Promise<void> {
        events.push(this.name);
        if (this.#remaining > 0) this.#remaining--;
    }

    hasMoreWork(): boolean {
        return this.#remaining > 0 && !this.#cancelled;
    }

    estimateProgress(): number {
        return this.#total === 0 ? 1 : (this.#total - this.#remaining) / this.#total;
    }

    cancel(): void {
        this.#cancelled = true;
        events.push(`${this.name}.cancel`);
    }

    contains(task: RenderTaskType): boolean {
        return RenderTask.contains(this, task);
    }

    getDescription(): string {
        return `stub ${this.name}`;
    }

    getDetail(): string | null {
        return RenderTask.getDetail();
    }
}

/** Drives a task the way a render manager would, with a hard cap so a bug cannot hang. */
async function drain(task: RenderTaskType, limit = 200): Promise<number> {
    let calls = 0;
    while (task.hasMoreWork()) {
        if (calls >= limit) throw new Error(`task did not finish within ${limit} doWork calls`);
        await task.doWork();
        calls++;
    }
    return calls;
}

function regionPositions(task: MapUpdateTaskType): string[] {
    return task
        .getTasks()
        .filter((t): t is WorldRegionUpdateTaskType => t instanceof WorldRegionUpdateTask)
        .map((t) => t.getRegionPos().toString());
}

/* -------------------------------------------------------------------------- */
/* RenderTask (the java interface-defaults)                                    */
/* -------------------------------------------------------------------------- */

describe("RenderTask defaults", () => {
    it("reports no progress and no detail, exactly as upstream's defaults do", () => {
        expect(RenderTask.estimateProgress()).toBe(0);
        expect(RenderTask.getDetail()).toBeNull();
    });

    it("falls back to identity when a task does not override equals", () => {
        const a = new StubTask("a");
        const b = new StubTask("b");
        expect(RenderTask.contains(a, a)).toBe(true);
        expect(RenderTask.contains(a, b)).toBe(false);
    });

    it("uses the task's own equals when it has one", () => {
        const a = new StubTask("a");
        const b = new StubTask("b");
        const overriding: RenderTaskType = Object.assign(new StubTask("c"), {
            equals: (other: unknown) => other === a || other === b,
        });
        expect(RenderTask.contains(overriding, b)).toBe(true);
        expect(RenderTask.contains(overriding, new StubTask("d"))).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/* CombinedRenderTask                                                          */
/* -------------------------------------------------------------------------- */

describe("CombinedRenderTask", () => {
    it("runs its sub-tasks strictly in sequence, never interleaved", async () => {
        const combined = new CombinedRenderTask("combined", [
            new StubTask("a", 2),
            new StubTask("b", 2),
        ]);

        const calls = await drain(combined);

        expect(events).toEqual(["a", "a", "b", "b"]);
        // four working calls plus one cursor-advance per sub-task: upstream spends a whole
        // doWork() on moving past a finished sub-task, and that call does no work at all
        expect(calls).toBe(6);
    });

    it("advances past an already-finished sub-task without doing work", async () => {
        const combined = new CombinedRenderTask("combined", [
            new StubTask("finished", 0),
            new StubTask("b", 1),
        ]);

        await combined.doWork();

        expect(events).toEqual([]);
        expect(combined.getCurrentTaskIndex()).toBe(1);
    });

    it("weights every sub-task equally, upstream's arithmetic", async () => {
        const combined = new CombinedRenderTask("combined", [
            new StubTask("a", 1),
            new StubTask("b", 2),
            new StubTask("c", 1),
        ]);

        expect(combined.estimateProgress()).toBe(0);

        await combined.doWork(); // a's only unit
        await combined.doWork(); // cursor moves to b
        await combined.doWork(); // b's first of two

        // (1 + 0.5) / 3 — one whole sub-task plus half of the current one, over three
        expect(combined.estimateProgress()).toBeCloseTo(0.5, 10);

        await drain(combined);
        expect(combined.estimateProgress()).toBe(1);
    });

    it("reports a finished empty combination as complete rather than dividing by zero", () => {
        const combined = new CombinedRenderTask("empty", []);
        expect(combined.hasMoreWork()).toBe(false);
        expect(combined.estimateProgress()).toBe(1);
        expect(combined.getDetail()).toBeNull();
    });

    it("names the current sub-task as its detail, and nothing once exhausted", async () => {
        const combined = new CombinedRenderTask("combined", [
            new StubTask("a", 1),
            new StubTask("b", 1),
        ]);

        expect(combined.getDetail()).toBe("stub a");
        await drain(combined);
        expect(combined.getDetail()).toBeNull();
    });

    it("cancels every sub-task, including ones it has already passed", async () => {
        const combined = new CombinedRenderTask("combined", [
            new StubTask("a", 1),
            new StubTask("b", 1),
        ]);

        combined.cancel();

        expect(events).toEqual(["a.cancel", "b.cancel"]);
        // upstream's hasMoreWork reads the cursor, not a cancelled flag — the sub-tasks
        // are what refuse to work, and the combination walks past them one call each
        expect(combined.hasMoreWork()).toBe(true);

        events.length = 0;
        expect(await drain(combined)).toBe(2);
        expect(events).toEqual([]);
    });

    it("contains its own sub-tasks, and reaches through nesting", () => {
        const leaf = new StubTask("leaf", 1);
        const inner = new CombinedRenderTask("inner", [leaf]);
        const outer = new CombinedRenderTask("outer", [inner, new StubTask("other", 1)]);

        expect(outer.contains(outer)).toBe(true);
        expect(outer.contains(inner)).toBe(true);
        expect(outer.contains(leaf)).toBe(true);
        expect(outer.contains(new StubTask("stranger", 1))).toBe(false);
    });

    it("contains another combination only when it holds every one of its parts", () => {
        const a = new StubTask("a", 1);
        const b = new StubTask("b", 1);
        const outer = new CombinedRenderTask("outer", [a, b]);

        expect(outer.contains(new CombinedRenderTask("subset", [a]))).toBe(true);
        expect(outer.contains(new CombinedRenderTask("stranger", [a, new StubTask("c", 1)]))).toBe(
            false,
        );
        // vacuously true, and upstream's behaviour
        expect(outer.contains(new CombinedRenderTask("empty", []))).toBe(true);
    });

    it("copies the task list, so a caller mutating theirs cannot change what runs", async () => {
        const mine = [new StubTask("a", 1)];
        const combined = new CombinedRenderTask("combined", mine);
        mine.push(new StubTask("b", 1));

        await drain(combined);

        expect(events).toEqual(["a"]);
    });
});

/* -------------------------------------------------------------------------- */
/* MapSaveTask                                                                 */
/* -------------------------------------------------------------------------- */

describe("MapSaveTask", () => {
    it("saves exactly once and then reports itself finished", async () => {
        const map = await createMap();
        const task = new MapSaveTask(map);

        expect(task.hasMoreWork()).toBe(true);
        const calls = await drain(task);

        expect(calls).toBe(1);
        expect(events.filter((e) => e === "lowres.save")).toHaveLength(1);
        expect(task.hasMoreWork()).toBe(false);
        expect(task.getDescription()).toBe("saving map 'overworld'");
        expect(task.getMap()).toBe(map);
    });

    it("saves once even when several callers enter before the first save finishes", async () => {
        const map = await createMap();
        const task = new MapSaveTask(map);

        // upstream's AtomicBoolean#compareAndSet; here the flag flips before the first
        // await, so the later two callers see it already set
        await Promise.all([task.doWork(), task.doWork(), task.doWork()]);

        expect(events.filter((e) => e === "lowres.save")).toHaveLength(1);
    });

    it("a cancelled task never saves", async () => {
        const map = await createMap();
        const task = new MapSaveTask(map);

        task.cancel();
        expect(task.hasMoreWork()).toBe(false);
        await task.doWork();

        expect(events).toEqual([]);
    });

    it("contains another save-task for the same map id", async () => {
        const overworld = await createMap("overworld");
        const otherId = await createMap("overworld-copy");
        const nether = await createMap("nether");

        const task = new MapSaveTask(overworld);
        expect(task.contains(task)).toBe(true);
        expect(task.contains(new MapSaveTask(overworld))).toBe(true);
        expect(task.contains(new MapSaveTask(nether))).toBe(false);
        expect(task.contains(new MapSaveTask(otherId))).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/* MapPurgeTask                                                                */
/* -------------------------------------------------------------------------- */

describe("MapPurgeTask", () => {
    it("discards queued lowres writes before it deletes anything", async () => {
        const map = await createMap();
        expect(await map.getStorage().exists()).toBe(true);

        const task = new MapPurgeTask(map);
        const calls = await drain(task);

        expect(calls).toBe(1);
        // the discard has to come first: a flush afterwards would re-create tiles the
        // delete had just removed
        expect(events[0]).toBe("lowres.discard");
        expect(await map.getStorage().exists()).toBe(false);
        expect(task.hasMoreWork()).toBe(false);
        expect(task.getDescription()).toBe("purging map 'overworld'");
    });

    it("resets the render state so the next update starts from nothing", async () => {
        const map = await createMap();
        await map.getMapTileState().set(1, 1, new TileInfo(123, TileState.RENDERED));
        await map.getMapChunkState().set(1, 1, 99);
        await map.getMapRegionState().set(0, 0, 555);

        await drain(new MapPurgeTask(map));

        expect((await map.getMapTileState().get(1, 1)).getState()).toBe(TileState.UNKNOWN);
        expect(await map.getMapChunkState().get(1, 1)).toBe(0);
        expect(await map.getMapRegionState().get(0, 0)).toBe(0);
    });

    it("reports the storage's own delete progress", async () => {
        const map = await createMap();
        const task = new MapPurgeTask(map);

        expect(task.estimateProgress()).toBe(0);
        await task.doWork();

        expect(task.estimateProgress()).toBeGreaterThan(0);
        expect(task.estimateProgress()).toBeLessThanOrEqual(1);
    });

    it("a task cancelled before its first call purges nothing", async () => {
        const map = await createMap();
        const task = new MapPurgeTask(map);

        task.cancel();
        expect(task.hasMoreWork()).toBe(false);
        await task.doWork();

        expect(events).toEqual([]);
        expect(await map.getStorage().exists()).toBe(true);
    });

    it("contains another purge of the same map, by map id", async () => {
        const overworld = await createMap("overworld");
        const nether = await createMap("nether");

        const task = new MapPurgeTask(overworld);
        expect(task.contains(task)).toBe(true);
        expect(task.contains(new MapPurgeTask(overworld))).toBe(true);
        expect(task.contains(new MapPurgeTask(nether))).toBe(false);
        expect(task.contains(new MapSaveTask(overworld))).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/* StorageDeleteTask                                                           */
/* -------------------------------------------------------------------------- */

/** A storage whose delete walks a fixed sequence of progress values. */
function fakeStorage(steps: number[]): { storage: MapStorageType; seen: number[] } {
    const seen: number[] = [];
    const storage = {
        async delete(onProgress?: (progress: number) => boolean): Promise<void> {
            for (const step of steps) {
                seen.push(step);
                if (onProgress !== undefined && !onProgress(step)) return;
            }
        },
    } as unknown as MapStorageType;
    return { storage, seen };
}

describe("StorageDeleteTask", () => {
    it("deletes once and reports the storage's progress", async () => {
        const { storage, seen } = fakeStorage([0.25, 0.5, 1]);
        const task = new StorageDeleteTask(storage, "removed-map");

        expect(task.estimateProgress()).toBe(0);
        const calls = await drain(task);

        expect(calls).toBe(1);
        expect(seen).toEqual([0.25, 0.5, 1]);
        expect(task.estimateProgress()).toBe(1);
        expect(task.getDescription()).toBe("deleting map 'removed-map'");
        expect(task.getMapId()).toBe("removed-map");
    });

    it("asks the storage to stop as soon as it is cancelled mid-delete", async () => {
        const steps = [0.25, 0.5, 0.75, 1];
        const seen: number[] = [];
        // the user cancels while the delete is running; the task is created below, so the
        // hook is late-bound rather than captured
        let onStep: (step: number) => void = () => {};
        const storage = {
            async delete(onProgress?: (progress: number) => boolean): Promise<void> {
                for (const step of steps) {
                    seen.push(step);
                    onStep(step);
                    if (onProgress !== undefined && !onProgress(step)) return;
                }
            },
        } as unknown as MapStorageType;
        const task = new StorageDeleteTask(storage, "removed-map");
        onStep = (step) => {
            if (step >= 0.5) task.cancel();
        };

        await task.doWork();

        // upstream's predicate is `!cancelled`, so the storage stops right after the step
        // that triggered the cancel; the remaining two are never attempted
        expect(seen).toEqual([0.25, 0.5]);
        expect(task.hasMoreWork()).toBe(false);
    });

    it("contains another delete only for the same storage AND map id", () => {
        const { storage } = fakeStorage([1]);
        const { storage: other } = fakeStorage([1]);

        const task = new StorageDeleteTask(storage, "a");
        expect(task.contains(task)).toBe(true);
        expect(task.contains(new StorageDeleteTask(storage, "a"))).toBe(true);
        expect(task.contains(new StorageDeleteTask(storage, "b"))).toBe(false);
        // the same map id on a different storage deletes different files
        expect(task.contains(new StorageDeleteTask(other, "a"))).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/* TileUpdateStrategy                                                          */
/* -------------------------------------------------------------------------- */

describe("TileUpdateStrategy", () => {
    it("fixed() hands back the shared singletons, which task equality depends on", () => {
        expect(TileUpdateStrategy.fixed(true)).toBe(TileUpdateStrategy.FORCE_ALL);
        expect(TileUpdateStrategy.fixed(false)).toBe(TileUpdateStrategy.FORCE_NONE);
    });

    it("FORCE_EDGE forces only the tiles last written as a render-boundary edge", () => {
        expect(TileUpdateStrategy.FORCE_EDGE.test(TileState.RENDERED_EDGE)).toBe(true);
        expect(TileUpdateStrategy.FORCE_EDGE.test(TileState.RENDERED)).toBe(false);
        expect(TileUpdateStrategy.FORCE_EDGE.test(TileState.UNKNOWN)).toBe(false);
    });

    it("registers all three under their bluemap keys", () => {
        expect(TileUpdateStrategy.FORCE_ALL.getKey().getFormatted()).toBe("bluemap:force_all");
        expect(TileUpdateStrategy.FORCE_EDGE.getKey().getFormatted()).toBe("bluemap:force_edge");
        expect(TileUpdateStrategy.FORCE_NONE.getKey().getFormatted()).toBe("bluemap:force_none");
        expect(TileUpdateStrategy.REGISTRY.values()).toHaveLength(3);
    });
});

/* -------------------------------------------------------------------------- */
/* WorldRegionUpdateTask — the sliced RenderTask surface                       */
/* -------------------------------------------------------------------------- */

/*
 * Fixture arithmetic, worked out from the java rather than from the port:
 *
 *   regionGrid = Grid(64), chunkGrid = Grid(16), tileGrid = Grid(32, offset 2)
 *
 *   chunkMin = chunkGrid.getCellX(regionGrid.getCellMinX(0)) = floor(  0 / 16)   =  0
 *   chunkMax = chunkGrid.getCellX(regionGrid.getCellMaxX(0)) = floor( 63 / 16)   =  3  -> 4x4 = 16
 *   tileMin  = tileGrid.getCellX(0)  = floor(( 0 - 2) / 32)                      = -1
 *   tileMax  = tileGrid.getCellX(63) = floor((63 - 2) / 32)                      =  1
 *   tileSize = 1 - (-1) + 1 = 3                                                  -> 3x3 =  9
 */
const REGION_TILE_COUNT = 9;
const REGION_CHUNK_COUNT = 16;

describe("WorldRegionUpdateTask as a RenderTask", () => {
    it("renders one tile per doWork call and finishes after exactly the tile count", async () => {
        const map = await createMap("overworld", fakeWorld());
        const task = new WorldRegionUpdateTask(map, new Vector2i(0, 0));

        expect(task.estimateProgress()).toBe(0);
        const calls = await drain(task);

        expect(calls).toBe(REGION_TILE_COUNT);
        expect(renderCalls).toHaveLength(REGION_TILE_COUNT);
        expect(task.hasMoreWork()).toBe(false);
        expect(task.estimateProgress()).toBe(1);
        expect(task.getDescription()).toBe("updating region (0, 0)");
        expect(task.getMap()).toBe(map);
    });

    it("advances progress by one tile at a time, upstream's fraction", async () => {
        const map = await createMap("overworld", fakeWorld());
        const task = new WorldRegionUpdateTask(map, new Vector2i(0, 0));

        await task.doWork();
        expect(task.estimateProgress()).toBeCloseTo(1 / REGION_TILE_COUNT, 10);
        await task.doWork();
        expect(task.estimateProgress()).toBeCloseTo(2 / REGION_TILE_COUNT, 10);
    });

    it("claims each tile once even when several workers call doWork concurrently", async () => {
        const map = await createMap("overworld", fakeWorld());
        const task = new WorldRegionUpdateTask(map, new Vector2i(0, 0));

        // upstream lets several threads into the same region task; the claim step is the
        // part that must not be re-entered, or tile (0,0) is rendered by all of them
        await Promise.all(Array.from({ length: 4 }, () => task.doWork()));

        expect(renderCalls).toHaveLength(4);
        expect(new Set(renderCalls.map((t) => t.toString())).size).toBe(4);
    });

    it("stops mid-region when cancelled, and writes no completion state", async () => {
        const map = await createMap("overworld", fakeWorld());
        const task = new WorldRegionUpdateTask(map, new Vector2i(0, 0));

        await task.doWork();
        await task.doWork();
        task.cancel();

        expect(task.hasMoreWork()).toBe(false);
        await task.doWork();
        expect(renderCalls).toHaveLength(2);

        // complete() never ran: neither the chunk hashes nor the region timestamp landed
        expect(await map.getMapChunkState().get(0, 0)).toBe(0);
        expect(await map.getMapRegionState().get(0, 0)).toBe(0);
    });

    it("records the chunk hashes and the region timestamp once it completes", async () => {
        const map = await createMap("overworld", fakeWorld({ lastModified: 4242 }));
        await drain(new WorldRegionUpdateTask(map, new Vector2i(0, 0)));

        let stored = 0;
        for (let x = 0; x < 4; x++)
            for (let z = 0; z < 4; z++)
                if ((await map.getMapChunkState().get(x, z)) === 4242) stored++;
        expect(stored).toBe(REGION_CHUNK_COUNT);

        expect(await map.getMapRegionState().get(0, 0)).toBeGreaterThan(0);
    });

    it("deletes the region timestamp when the region no longer exists on disk", async () => {
        const map = await createMap("overworld", fakeWorld({ regionExists: false }));
        await map.getMapRegionState().set(0, 0, 777);

        await drain(new WorldRegionUpdateTask(map, new Vector2i(0, 0)));

        expect(await map.getMapRegionState().get(0, 0)).toBe(0);
    });

    it("finishes without touching a tile when nothing changed since the last render", async () => {
        const map = await createMap("overworld", fakeWorld());
        await drain(new WorldRegionUpdateTask(map, new Vector2i(0, 0)));
        expect(renderCalls).toHaveLength(REGION_TILE_COUNT);

        // second pass: every tile is RENDERED and every chunk hash matches, so upstream's
        // `tileRenderCount + tileDeleteCount == 0` completes the task during init and it
        // never processes a tile
        const second = new WorldRegionUpdateTask(map, new Vector2i(0, 0));
        const calls = await drain(second);

        expect(calls).toBe(1);
        expect(renderCalls).toHaveLength(REGION_TILE_COUNT);
        expect(second.hasMoreWork()).toBe(false);
    });

    it("FORCE_ALL re-renders a region that would otherwise have nothing to do", async () => {
        const map = await createMap("overworld", fakeWorld());
        await drain(new WorldRegionUpdateTask(map, new Vector2i(0, 0)));

        renderCalls.length = 0;
        await drain(
            new WorldRegionUpdateTask(map, new Vector2i(0, 0), TileUpdateStrategy.FORCE_ALL),
        );

        expect(renderCalls).toHaveLength(REGION_TILE_COUNT);
    });

    it("unrenders every tile of a region that falls outside the render boundaries", async () => {
        const map = await createMap("overworld", fakeWorld(), { getRenderMask: () => NEVER });
        // pretend the tiles were rendered before the boundary moved
        for (let x = -1; x <= 1; x++)
            for (let z = -1; z <= 1; z++)
                await map.getMapTileState().set(x, z, new TileInfo(1, TileState.RENDERED));

        await drain(new WorldRegionUpdateTask(map, new Vector2i(0, 0)));

        expect(renderCalls).toHaveLength(0);
        expect(unrenderCalls).toHaveLength(REGION_TILE_COUNT);
        expect((await map.getMapTileState().get(0, 0)).getState()).toBe(TileState.OUT_OF_BOUNDS);
    });

    it("is equal by map id, region and strategy identity", async () => {
        const map = await createMap("overworld", fakeWorld());
        const a = new WorldRegionUpdateTask(map, new Vector2i(1, 2), TileUpdateStrategy.fixed(true));
        const b = new WorldRegionUpdateTask(map, new Vector2i(1, 2), TileUpdateStrategy.fixed(true));

        // this is the pair a per-call `fixed()` object would have broken, letting the
        // render manager queue the same region twice
        expect(a.equals(b)).toBe(true);
        expect(a.contains(b)).toBe(true);
        expect(a.equals(new WorldRegionUpdateTask(map, new Vector2i(1, 3)))).toBe(false);
        expect(
            a.equals(
                new WorldRegionUpdateTask(map, new Vector2i(1, 2), TileUpdateStrategy.FORCE_NONE),
            ),
        ).toBe(false);
    });

    it("orders regions stalest-first, then nearest-first on a tie", async () => {
        const map = await createMap("overworld", fakeWorld());
        await map.getMapRegionState().set(1, 0, 10);
        await map.getMapRegionState().set(2, 0, 5);

        const tasks = [
            new WorldRegionUpdateTask(map, new Vector2i(1, 0)),
            new WorldRegionUpdateTask(map, new Vector2i(2, 0)),
            new WorldRegionUpdateTask(map, new Vector2i(0, 0)),
        ];
        const lastUpdated = await WorldRegionUpdateTask.readRegionLastUpdated(tasks);
        tasks.sort(
            WorldRegionUpdateTask.regionLastUpdatedComparator(
                lastUpdated,
                WorldRegionUpdateTask.defaultComparator(Vector2i.ZERO),
            ),
        );

        // (0,0) has no stored time at all (0), then 5, then 10
        expect(tasks.map((t) => t.getRegionPos().getX())).toEqual([0, 2, 1]);
    });

    it("breaks a tie by squared distance from the centre", async () => {
        const map = await createMap("overworld", fakeWorld());
        const tasks = [
            new WorldRegionUpdateTask(map, new Vector2i(3, 4)), // 25
            new WorldRegionUpdateTask(map, new Vector2i(0, 1)), // 1
            new WorldRegionUpdateTask(map, new Vector2i(2, 2)), // 8
        ];
        const lastUpdated = await WorldRegionUpdateTask.readRegionLastUpdated(tasks);
        tasks.sort(
            WorldRegionUpdateTask.regionLastUpdatedComparator(
                lastUpdated,
                WorldRegionUpdateTask.defaultComparator(Vector2i.ZERO),
            ),
        );

        expect(tasks.map((t) => t.getRegionPos().toString())).toEqual([
            "(0, 1)",
            "(2, 2)",
            "(3, 4)",
        ]);
    });
});

/* -------------------------------------------------------------------------- */
/* MapUpdateTask                                                               */
/* -------------------------------------------------------------------------- */

describe("MapUpdateTask", () => {
    it("builds one region task per region and a single trailing save", async () => {
        const map = await createMap("overworld", fakeWorld());
        const task = MapUpdateTask.forRegions(map, [new Vector2i(0, 0), new Vector2i(1, 0)]);

        const tasks = task.getTasks();
        expect(tasks).toHaveLength(3);
        expect(tasks[0]).toBeInstanceOf(WorldRegionUpdateTask);
        expect(tasks[1]).toBeInstanceOf(WorldRegionUpdateTask);
        expect(tasks[2]).toBeInstanceOf(MapSaveTask);
        expect(task.getDescription()).toBe("updating map 'overworld'");
        expect(task.getMap()).toBe(map);
    });

    it("passes the strategy through to every region task", async () => {
        const map = await createMap("overworld", fakeWorld());
        const task = MapUpdateTask.forRegions(
            map,
            [new Vector2i(0, 0)],
            TileUpdateStrategy.FORCE_ALL,
        );

        const region = task.getTasks()[0] as WorldRegionUpdateTaskType;
        expect(region.getForce()).toBe(TileUpdateStrategy.FORCE_ALL);
    });

    it("defaults to forcing nothing", async () => {
        const map = await createMap("overworld", fakeWorld());
        const task = MapUpdateTask.forRegions(map, [new Vector2i(0, 0)]);
        expect((task.getTasks()[0] as WorldRegionUpdateTaskType).getForce()).toBe(
            TileUpdateStrategy.FORCE_NONE,
        );
    });

    it("resumes from a given task index instead of re-running earlier tasks", async () => {
        const map = await createMap("overworld", fakeWorld());
        const task = MapUpdateTask.fromTasks(
            map,
            [new StubTask("first", 1), new StubTask("second", 1)],
            1,
        );

        await drain(task);

        expect(events).toEqual(["second"]);
    });

    it("runs its region task, then its save", async () => {
        const map = await createMap("overworld", fakeWorld());
        const task = MapUpdateTask.forRegions(map, [new Vector2i(0, 0)]);

        await drain(task);

        expect(renderCalls).toHaveLength(REGION_TILE_COUNT);
        expect(events.filter((e) => e === "lowres.save")).toHaveLength(1);
        expect(task.estimateProgress()).toBe(1);
    });
});

/* -------------------------------------------------------------------------- */
/* MapUpdatePreparationTask                                                    */
/* -------------------------------------------------------------------------- */

describe("MapUpdatePreparationTask", () => {
    function prepare(
        map: MapType,
        extra: { center?: Vector2i | null; radius?: number | null } = {},
    ): {
        task: InstanceType<typeof MapUpdatePreparationTask>;
        scheduled: MapUpdateTaskType[];
    } {
        const scheduled: MapUpdateTaskType[] = [];
        const task = new MapUpdatePreparationTask({
            map,
            center: extra.center ?? null,
            radius: extra.radius ?? null,
            taskConsumer: (t) => scheduled.push(t),
        });
        return { task, scheduled };
    }

    it("brackets the region tasks with a save at each end", async () => {
        const map = await createMap(
            "overworld",
            fakeWorld({ regions: [new Vector2i(0, 0), new Vector2i(1, 0)] }),
        );
        const { task, scheduled } = prepare(map);

        await drain(task);

        expect(scheduled).toHaveLength(1);
        const tasks = scheduled[0]!.getTasks();
        expect(tasks).toHaveLength(4);
        expect(tasks[0]).toBeInstanceOf(MapSaveTask);
        expect(tasks[1]).toBeInstanceOf(WorldRegionUpdateTask);
        expect(tasks[2]).toBeInstanceOf(WorldRegionUpdateTask);
        expect(tasks[3]).toBeInstanceOf(MapSaveTask);
        expect(task.getDescription()).toBe("preparing map 'overworld' update");
        expect(task.getMap()).toBe(map);
    });

    it("creates NO update at all for a world that lists no regions", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const map = await createMap("overworld", fakeWorld({ regions: [] }));
        const { task, scheduled } = prepare(map);

        await drain(task);

        // the guard that stops a misconfigured world path from deleting the whole map
        expect(scheduled).toHaveLength(0);
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it("does its work exactly once, however many times it is called", async () => {
        const map = await createMap("overworld", fakeWorld());
        const { task, scheduled } = prepare(map);

        await task.doWork();
        await task.doWork();
        await task.doWork();

        expect(scheduled).toHaveLength(1);
        expect(task.hasMoreWork()).toBe(false);
    });

    it("schedules nothing when cancelled before it runs", async () => {
        const map = await createMap("overworld", fakeWorld());
        const { task, scheduled } = prepare(map);

        task.cancel();
        expect(task.hasMoreWork()).toBe(false);
        await task.doWork();

        expect(scheduled).toHaveLength(0);
    });

    it("schedules nothing when cancelled while it is still listing regions", async () => {
        const world = fakeWorld({ regions: [new Vector2i(0, 0)] });
        const map = await createMap("overworld", world);
        const { task, scheduled } = prepare(map);

        vi.spyOn(world, "listRegions").mockImplementation(() => {
            task.cancel();
            return [new Vector2i(0, 0)];
        });

        await task.doWork();

        // the final cancel-check, after the tasks are built, is what stops a whole map
        // update from starting behind the user's back
        expect(scheduled).toHaveLength(0);
    });

    it("keeps only the regions whose centre is within the radius, upstream's arithmetic", async () => {
        /*
         * Worked out from `MapUpdatePreparationTask.findRegions` in java, 512-block regions:
         *   halfCell          = (512,512).div(2)            = (256,256)
         *   halfCell.length() = (float) sqrt(256^2 + 256^2) = 362.03867
         *   ceil                                            = 363
         *   increasedRadiusSq = (long) (100 + 363)^2        = 214369
         *
         *   ( 0, 0) centre (  256, 256) ->  131072 <= 214369  kept
         *   (-1, 0) centre ( -256, 256) ->  131072 <= 214369  kept
         *   ( 1, 0) centre (  768, 256) ->  655360 >  214369  dropped
         *   ( 1, 1) centre (  768, 768) -> 1179648 >  214369  dropped
         */
        const map = await createMap(
            "overworld",
            fakeWorld({
                regionGridSize: 512,
                regions: [
                    new Vector2i(0, 0),
                    new Vector2i(-1, 0),
                    new Vector2i(1, 0),
                    new Vector2i(1, 1),
                ],
            }),
        );
        const { task, scheduled } = prepare(map, { center: new Vector2i(0, 0), radius: 100 });

        await drain(task);

        expect(new Set(regionPositions(scheduled[0]!))).toEqual(new Set(["(0, 0)", "(-1, 0)"]));
    });

    it("treats a negative radius as no radius at all", async () => {
        const map = await createMap(
            "overworld",
            fakeWorld({
                regionGridSize: 512,
                regions: [new Vector2i(0, 0), new Vector2i(50, 50)],
            }),
        );
        const { task, scheduled } = prepare(map, { center: new Vector2i(0, 0), radius: -1 });

        await drain(task);

        expect(regionPositions(scheduled[0]!)).toHaveLength(2);
    });

    it("drops regions the render boundaries exclude", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const map = await createMap(
            "overworld",
            fakeWorld({ regions: [new Vector2i(0, 0), new Vector2i(1, 0)] }),
            { getRenderMask: () => NEVER },
        );
        const { task, scheduled } = prepare(map);

        await drain(task);

        // every region filtered out is indistinguishable from an empty world, and gets the
        // same refusal
        expect(scheduled).toHaveLength(0);
        warn.mockRestore();
    });

    it("adds previously-rendered regions that are no longer on disk, unfiltered", async () => {
        const map = await createMap(
            "overworld",
            fakeWorld({ regionGridSize: 512, regions: [new Vector2i(0, 0)] }),
            { isCheckForRemovedRegions: () => true },
        );
        // rendered once, and far outside the radius used below. The save is what makes it
        // visible to `forEach`, which streams the stored cells rather than the cache.
        await map.getMapRegionState().set(40, 40, 1234);
        await map.getMapRegionState().save();

        const { task, scheduled } = prepare(map, { center: new Vector2i(0, 0), radius: 100 });
        await drain(task);

        // it has to be visited even though the radius excludes it, or its orphaned tiles
        // stay on disk forever
        expect(regionPositions(scheduled[0]!)).toContain("(40, 40)");
    });

    it("leaves removed regions out when the setting is off", async () => {
        const map = await createMap("overworld", fakeWorld({ regions: [new Vector2i(0, 0)] }), {
            isCheckForRemovedRegions: () => false,
        });
        await map.getMapRegionState().set(40, 40, 1234);
        await map.getMapRegionState().save();

        const { task, scheduled } = prepare(map);
        await drain(task);

        expect(regionPositions(scheduled[0]!)).toEqual(["(0, 0)"]);
    });

    it("de-duplicates a region listed on disk that is also in the stored state", async () => {
        const map = await createMap("overworld", fakeWorld({ regions: [new Vector2i(0, 0)] }), {
            isCheckForRemovedRegions: () => true,
        });
        await map.getMapRegionState().set(0, 0, 999);
        await map.getMapRegionState().save();

        const { task, scheduled } = prepare(map);
        await drain(task);

        // java's HashSet de-duplicates by value; a javascript Set keyed by identity would
        // have queued this region twice
        expect(regionPositions(scheduled[0]!)).toEqual(["(0, 0)"]);
    });

    it("orders the region tasks stalest-first", async () => {
        const map = await createMap(
            "overworld",
            fakeWorld({
                regions: [new Vector2i(0, 0), new Vector2i(1, 0), new Vector2i(2, 0)],
            }),
        );
        await map.getMapRegionState().set(0, 0, 30);
        await map.getMapRegionState().set(1, 0, 10);
        await map.getMapRegionState().set(2, 0, 20);

        const { task, scheduled } = prepare(map);
        await drain(task);

        expect(regionPositions(scheduled[0]!)).toEqual(["(1, 0)", "(2, 0)", "(0, 0)"]);
    });

    it("updateMap wires the built task straight into a scheduler", async () => {
        const map = await createMap("overworld", fakeWorld());
        const scheduled: RenderTaskType[] = [];
        const task = MapUpdatePreparationTask.updateMap(map, {
            scheduleRenderTask: (t) => scheduled.push(t),
        });

        await drain(task);

        expect(scheduled).toHaveLength(1);
        expect(scheduled[0]).toBeInstanceOf(MapUpdateTask);
    });

    it("updateMap passes a strategy on to every region task", async () => {
        const map = await createMap("overworld", fakeWorld());
        const scheduled: RenderTaskType[] = [];
        const task = MapUpdatePreparationTask.updateMap(map, TileUpdateStrategy.FORCE_ALL, {
            scheduleRenderTask: (t) => scheduled.push(t),
        });

        await drain(task);

        const region = (scheduled[0] as MapUpdateTaskType)
            .getTasks()
            .find((t): t is WorldRegionUpdateTaskType => t instanceof WorldRegionUpdateTask);
        expect(region?.getForce()).toBe(TileUpdateStrategy.FORCE_ALL);
    });
});
