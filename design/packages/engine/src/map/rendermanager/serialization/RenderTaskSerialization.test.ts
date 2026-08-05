import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BlueNBT, IOException, NBTWriter, TagType, TypeToken } from "@material-bluemap/nbt";
import { Color, Grid, Key, Vector2i } from "@material-bluemap/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

/*
 * upstream: none — this is a port-test fixture. HiresModelManager is mocked for the same
 * reason `rendertasks.test.ts` mocks it: constructing a real one instantiates every
 * registered render-pass, and nothing here tests the mesher. What round-tripping a
 * render-task queue needs is a `WorldRegionUpdateTask` that can actually be *driven*, so
 * "kill mid-render, restore, resume" is a genuine end-to-end scenario and not just an
 * object-graph comparison.
 */
const renderCalls: Vector2i[] = [];

vi.mock("../../hires/HiresModelManager.js", () => ({
    HiresModelManager: class {
        constructor(
            _world: unknown,
            _storage: unknown,
            _resourcePack: unknown,
            _textureGallery: unknown,
            _renderSettings: unknown,
            private readonly tileGrid: Grid,
        ) {}
        getTileGrid(): Grid {
            return this.tileGrid;
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
        async unrender(): Promise<void> {}
    },
}));

const { BmMap } = await import("../../BmMap.js");
const { MapSettings } = await import("../../MapSettings.js");
const { Tristate } = await import("../../../util/Tristate.js");
const { Chunk } = await import("../../../world/Chunk.js");
const { Region } = await import("../../../world/Region.js");
const { Compression } = await import("../../../storage/compression/Compression.js");
const { FileMapStorage } = await import("../../../storage/file/FileMapStorage.js");
const { ResourcePack } = await import("../../../resources/pack/resourcepack/ResourcePack.js");
const { PackVersion } = await import("../../../resources/pack/PackVersion.js");

const { MapPurgeTask } = await import("../MapPurgeTask.js");
const { MapSaveTask } = await import("../MapSaveTask.js");
const { MapUpdateTask } = await import("../MapUpdateTask.js");
const { StorageDeleteTask } = await import("../StorageDeleteTask.js");
const { TileUpdateStrategy } = await import("../TileUpdateStrategy.js");
const { WorldRegionUpdateTask } = await import("../WorldRegionUpdateTask.js");

const { BmMapAdapter } = await import("./BmMapAdapter.js");
const { Vector2iAdapter } = await import("./Vector2iAdapter.js");
const { RENDER_TASK_TOKEN, TILE_UPDATE_STRATEGY_TOKEN } = await import("./tokens.js");
const {
    createRenderTaskBlueNBT,
    loadRenderTaskQueue,
    RENDER_TASK_QUEUE_FORMAT_VERSION,
    saveRenderTaskQueue,
    TasksData,
    TASKS_DATA_TOKEN,
} = await import("./RenderTaskQueueStorage.js");
const { RegistryAdapter } = await import("@material-bluemap/nbt");

type BmMapType = import("../../BmMap.js").BmMap;
type MapSettingsType = import("../../MapSettings.js").MapSettings;
type MaskType = import("../../mask/Mask.js").Mask;
type WorldType = import("../../../world/World.js").World;
type ChunkType = import("../../../world/Chunk.js").Chunk;
type ChunkConsumerType<T> = import("../../../world/ChunkConsumer.js").ChunkConsumer<T>;
type RenderTaskType = import("../RenderTask.js").RenderTask;
// `InstanceType<typeof MapUpdateTask>` does not work: the class has a private constructor
// (see the note in MapUpdateTask.ts), so the type of the constructor value is not a public
// constructor signature — matching how rendertasks.test.ts works around the same thing.
type MapUpdateTaskType = import("../MapUpdateTask.js").MapUpdateTask;
type WorldRegionUpdateTaskType = InstanceType<typeof WorldRegionUpdateTask>;

/* -------------------------------------------------------------------------- */
/* Fixtures — trimmed from rendertasks.test.ts's proven setup                  */
/* -------------------------------------------------------------------------- */

const ALWAYS: MaskType = {
    test: (...args: number[]) => (args.length === 3 ? true : Tristate.TRUE),
    isEdge: () => false,
    submask: () => ALWAYS,
    inverted: () => ALWAYS,
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
        isIgnoreMissingLightData: () => true,
        getRenderMask: () => ALWAYS,
        isSaveHiresLayer: () => MapSettings.isSaveHiresLayer(base),
        isRenderTopOnly: () => MapSettings.isRenderTopOnly(base),
    };
    return Object.assign(base, overrides);
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
    override async iterateAllChunks(consumer: ChunkConsumerType<ChunkType>): Promise<void> {
        for (let x = 0; x <= 3; x++)
            for (let z = 0; z <= 3; z++) consumer.filter?.(x, z, 42);
    }
    override emptyChunk(): ChunkType {
        return Chunk.EMPTY_CHUNK;
    }
    override exists(): boolean {
        return true;
    }
}

function fakeWorld(): WorldType {
    const regionGrid = new Grid(64);
    const chunkGrid = new Grid(16);
    return {
        getId: () => "fake:overworld",
        getRegionGrid: () => regionGrid,
        getChunkGrid: () => chunkGrid,
        listRegions: () => [new Vector2i(0, 0)],
        getRegion: () => new FakeRegion(),
        getChunk: () => new FakeChunk(),
        preloadChunks: async () => {},
        preloadRegionChunks: async () => {},
        invalidateChunkCache: () => {},
    } as unknown as WorldType;
}

let root: string;

async function createMap(id = "overworld"): Promise<BmMapType> {
    const storage = new FileMapStorage(join(root, id), Compression.NONE, false);
    return BmMap.create(
        id,
        id,
        fakeWorld(),
        storage,
        new ResourcePack(new PackVersion(34, 0)),
        settings(),
        (() => ({
            getTileGrid: () => new Grid(500),
            getLodCount: () => 3,
            getLodFactor: () => 5,
            set: () => {},
            save: () => {},
            discard: () => {},
        })) as never,
    );
}

/** Drives a task the way a render manager would, with a hard cap so a bug cannot hang. */
async function drain(task: RenderTaskType, limit = 500): Promise<number> {
    let calls = 0;
    while (task.hasMoreWork()) {
        if (calls >= limit) throw new Error(`task did not finish within ${limit} doWork calls`);
        await task.doWork();
        calls++;
    }
    return calls;
}

/*
 * Fixture arithmetic (worked out the same way as rendertasks.test.ts's own comment):
 *
 *   regionGrid = Grid(64), chunkGrid = Grid(16), tileGrid = Grid(32, offset 2)
 *   region (0,0): tile x/y range [-1, 1]  -> 3x3 = 9 tiles
 *   region (10,0): block range [640, 703]
 *     tileMin.x = floor((640-2)/32) = 19, tileMax.x = floor((703-2)/32) = 21 -> tile x [19,21]
 *
 * (10,0) is chosen, rather than an adjacent region, specifically so its tile range shares
 * no coordinate with (0,0)'s: adjacent regions under this offset-2 tile grid actually
 * overlap by one tile column, which would make "no render call touched the finished
 * region's tiles after resume" ambiguous to assert.
 */
const REGION_TILE_COUNT = 9;
const REGION_A = new Vector2i(0, 0);
const REGION_B = new Vector2i(10, 0);

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "bluemap-rendertask-serialization-"));
    renderCalls.length = 0;
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* Leaf adapters                                                              */
/* -------------------------------------------------------------------------- */

describe("Vector2iAdapter", () => {
    it("round-trips as a two-element int list", () => {
        const blueNBT = new BlueNBT();
        const token: TypeToken<Vector2i> = TypeToken.of("test.Vector2i");
        blueNBT.register(token, new Vector2iAdapter());

        const bytes = blueNBT.writeToBytes(new Vector2i(-3, 42), token);
        expect(blueNBT.read(bytes, token)).toEqual(new Vector2i(-3, 42));
    });
});

describe("BmMapAdapter", () => {
    it("writes a map as its id and reads it back from the live map set", async () => {
        const map = await createMap("overworld");
        const blueNBT = new BlueNBT();
        const token: TypeToken<BmMapType> = TypeToken.of("test.BmMap");
        blueNBT.register(token, new BmMapAdapter(new Map([[map.getId(), map]])));

        const bytes = blueNBT.writeToBytes(map, token);
        expect(blueNBT.read(bytes, token)).toBe(map);
    });

    it("refuses a map id that is not currently loaded, with a readable message", async () => {
        const map = await createMap("overworld");
        const blueNBT = new BlueNBT();
        const token: TypeToken<BmMapType> = TypeToken.of("test.BmMap");
        blueNBT.register(token, new BmMapAdapter(new Map())); // nothing loaded

        const bytes = blueNBT.writeToBytes(map, token);
        expect(() => blueNBT.read(bytes, token)).toThrow(IOException);
        expect(() => blueNBT.read(bytes, token)).toThrow(/No map with id 'overworld' loaded/);
    });
});

describe("TileUpdateStrategy identity through the registry adapter", () => {
    it("round-trips every registered strategy to the exact shared singleton", () => {
        const blueNBT = new BlueNBT();
        blueNBT.register(
            TILE_UPDATE_STRATEGY_TOKEN,
            new RegistryAdapter(
                TileUpdateStrategy.REGISTRY,
                (formatted, defaultNamespace) => Key.parse(formatted, defaultNamespace),
                Key.BLUEMAP_NAMESPACE,
                TileUpdateStrategy.FORCE_NONE,
            ),
        );

        for (const strategy of [
            TileUpdateStrategy.FORCE_ALL,
            TileUpdateStrategy.FORCE_EDGE,
            TileUpdateStrategy.FORCE_NONE,
            TileUpdateStrategy.fixed(true),
            TileUpdateStrategy.fixed(false),
        ]) {
            const bytes = blueNBT.writeToBytes(strategy, TILE_UPDATE_STRATEGY_TOKEN);
            // `.toBe` — identity, not just `.equals` — is the whole point: a deserialized
            // `fixed(true)` that came back as a *fresh* object would compare unequal to
            // every other `FORCE_ALL` reference and silently break equals-based dedup.
            expect(blueNBT.read(bytes, TILE_UPDATE_STRATEGY_TOKEN)).toBe(strategy);
        }
    });

    it("falls back to FORCE_NONE for an unknown key instead of failing", () => {
        const blueNBT = new BlueNBT();
        blueNBT.register(
            TILE_UPDATE_STRATEGY_TOKEN,
            new RegistryAdapter(
                TileUpdateStrategy.REGISTRY,
                (formatted, defaultNamespace) => Key.parse(formatted, defaultNamespace),
                Key.BLUEMAP_NAMESPACE,
                TileUpdateStrategy.FORCE_NONE,
            ),
        );

        const writer = new NBTWriter();
        writer.valueString("bluemap:force_from_the_future");
        const bytes = writer.toUint8Array();

        expect(blueNBT.read(bytes, TILE_UPDATE_STRATEGY_TOKEN)).toBe(TileUpdateStrategy.FORCE_NONE);
    });
});

/* -------------------------------------------------------------------------- */
/* Per-task round trips, through the full polymorphic RenderTaskAdapter        */
/* -------------------------------------------------------------------------- */

describe("RenderTaskAdapter round trips", () => {
    it("round-trips a MapPurgeTask, preserving map identity", async () => {
        const map = await createMap("overworld");
        const maps = new Map([[map.getId(), map]]);
        const blueNBT = createRenderTaskBlueNBT(maps);

        const task = new MapPurgeTask(map);
        const bytes = blueNBT.writeToBytes(task, RENDER_TASK_TOKEN);
        const restored = blueNBT.read(bytes, RENDER_TASK_TOKEN);

        expect(restored).toBeInstanceOf(MapPurgeTask);
        expect((restored as InstanceType<typeof MapPurgeTask>).getMap()).toBe(map);
        expect(restored.getDescription()).toBe(task.getDescription());
    });

    it("round-trips a MapSaveTask, preserving map identity", async () => {
        const map = await createMap("overworld");
        const maps = new Map([[map.getId(), map]]);
        const blueNBT = createRenderTaskBlueNBT(maps);

        const task = new MapSaveTask(map);
        const bytes = blueNBT.writeToBytes(task, RENDER_TASK_TOKEN);
        const restored = blueNBT.read(bytes, RENDER_TASK_TOKEN);

        expect(restored).toBeInstanceOf(MapSaveTask);
        expect((restored as InstanceType<typeof MapSaveTask>).getMap()).toBe(map);
    });

    it("round-trips a WorldRegionUpdateTask: region, map and shared-singleton strategy all dedup correctly", async () => {
        const map = await createMap("overworld");
        const maps = new Map([[map.getId(), map]]);
        const blueNBT = createRenderTaskBlueNBT(maps);

        const task = new WorldRegionUpdateTask(map, new Vector2i(3, -4), TileUpdateStrategy.fixed(true));
        const bytes = blueNBT.writeToBytes(task, RENDER_TASK_TOKEN);
        const restored = blueNBT.read(bytes, RENDER_TASK_TOKEN) as InstanceType<
            typeof WorldRegionUpdateTask
        >;

        expect(restored).toBeInstanceOf(WorldRegionUpdateTask);
        expect(restored.getMap()).toBe(map);
        expect(restored.getRegionPos().equals(new Vector2i(3, -4))).toBe(true);
        // identity, not equality — see the TileUpdateStrategy identity test above
        expect(restored.getForce()).toBe(TileUpdateStrategy.FORCE_ALL);

        // and the whole point of that identity: a restored task dedups against a freshly
        // scheduled equivalent one exactly as upstream's equals-based containment needs.
        const freshlyScheduled = new WorldRegionUpdateTask(
            map,
            new Vector2i(3, -4),
            TileUpdateStrategy.fixed(true),
        );
        expect(restored.equals(freshlyScheduled)).toBe(true);
    });

    it("round-trips a MapUpdateTask's full sub-task graph and cursor before any work runs", async () => {
        const map = await createMap("overworld");
        const maps = new Map([[map.getId(), map]]);
        const blueNBT = createRenderTaskBlueNBT(maps);

        const task = MapUpdateTask.forRegions(
            map,
            [new Vector2i(0, 0), new Vector2i(1, 0)],
            TileUpdateStrategy.FORCE_EDGE,
        );

        const bytes = blueNBT.writeToBytes(task, RENDER_TASK_TOKEN);
        const restored = blueNBT.read(bytes, RENDER_TASK_TOKEN) as MapUpdateTaskType;

        expect(restored).toBeInstanceOf(MapUpdateTask);
        expect(restored.getMap()).toBe(map);
        expect(restored.getCurrentTaskIndex()).toBe(0);
        expect(restored.getTasks()).toHaveLength(3);

        const regions = restored
            .getTasks()
            .filter((t): t is WorldRegionUpdateTaskType => t instanceof WorldRegionUpdateTask)
            .map((t) => [t.getRegionPos().toString(), t.getForce()] as const);
        expect(regions).toEqual([
            ["(0, 0)", TileUpdateStrategy.FORCE_EDGE],
            ["(1, 0)", TileUpdateStrategy.FORCE_EDGE],
        ]);
        expect(restored.getTasks()[2]).toBeInstanceOf(MapSaveTask);
    });

    it("silently drops a non-serializable task on write, matching upstream's default case", async () => {
        const map = await createMap("overworld");
        const maps = new Map([[map.getId(), map]]);
        const blueNBT = createRenderTaskBlueNBT(maps);

        const task = new StorageDeleteTask(map.getStorage(), "some-removed-map");
        const writer = new NBTWriter();
        blueNBT.resolveSerializer(RENDER_TASK_TOKEN).write(task, writer);
        writer.close();

        // nothing was written at all for it — not even an empty compound
        expect(writer.toUint8Array()).toHaveLength(0);
    });

    it("refuses an unknown render-task type with a readable error", async () => {
        const map = await createMap("overworld");
        const maps = new Map([[map.getId(), map]]);
        const blueNBT = createRenderTaskBlueNBT(maps);

        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("type");
        writer.valueString("bluemap:from-a-future-version");
        writer.name("data");
        writer.beginCompound();
        writer.endCompound();
        writer.endCompound();
        writer.close();

        expect(() => blueNBT.read(writer.toUint8Array(), RENDER_TASK_TOKEN)).toThrow(IOException);
        expect(() => blueNBT.read(writer.toUint8Array(), RENDER_TASK_TOKEN)).toThrow(
            /Unknown render-task type: bluemap:from-a-future-version/,
        );
    });
});

/* -------------------------------------------------------------------------- */
/* The whole-queue file: save, load, corruption and version handling          */
/* -------------------------------------------------------------------------- */

describe("saveRenderTaskQueue / loadRenderTaskQueue", () => {
    it("round-trips a populated queue of every serializable task type, dropping the one that is not", async () => {
        const map = await createMap("overworld");
        const maps = new Map([[map.getId(), map]]);

        const queue: RenderTaskType[] = [
            new MapPurgeTask(map),
            new MapSaveTask(map),
            new WorldRegionUpdateTask(map, new Vector2i(5, 6), TileUpdateStrategy.FORCE_ALL),
            MapUpdateTask.forRegions(map, [new Vector2i(0, 0)], TileUpdateStrategy.FORCE_NONE),
            // not serializable upstream either — must simply be absent from the reload,
            // not cause the save or the load to fail
            new StorageDeleteTask(map.getStorage(), "long-gone-map"),
        ];

        const file = join(root, "tasks.dat");
        await saveRenderTaskQueue(file, queue, maps);

        // the atomic-write temp file must not linger after a successful save
        await expect(readFile(file + ".filepart")).rejects.toThrow();

        const errors: Array<[string, unknown]> = [];
        const restored = await loadRenderTaskQueue(file, maps, (message, error) =>
            errors.push([message, error]),
        );

        expect(errors).toEqual([]);
        expect(restored).toHaveLength(4);
        expect(restored[0]).toBeInstanceOf(MapPurgeTask);
        expect(restored[1]).toBeInstanceOf(MapSaveTask);
        expect(restored[2]).toBeInstanceOf(WorldRegionUpdateTask);
        expect(restored[3]).toBeInstanceOf(MapUpdateTask);
    });

    it("returns an empty queue, without error, when no file was ever saved", async () => {
        const map = await createMap("overworld");
        const maps = new Map([[map.getId(), map]]);
        const errors: Array<[string, unknown]> = [];

        const restored = await loadRenderTaskQueue(
            join(root, "never-written.dat"),
            maps,
            (message, error) => errors.push([message, error]),
        );

        expect(restored).toEqual([]);
        expect(errors).toEqual([]);
    });

    it("refuses a truncated/corrupt file wholesale rather than half-applying it, and deletes it", async () => {
        const file = join(root, "tasks.dat");
        // a handful of bytes that are not a valid nbt-compound at all — standing in for a
        // write that died halfway through
        await writeFile(file, Uint8Array.from([TagType.COMPOUND, 0, 1, 65, 9, 9, 9]));

        const errors: Array<[string, unknown]> = [];
        const restored = await loadRenderTaskQueue(file, new Map(), (message, error) =>
            errors.push([message, error]),
        );

        expect(restored).toEqual([]);
        expect(errors).toHaveLength(1);
        await expect(readFile(file)).rejects.toThrow();
    });

    it("refuses a file whose format version does not match, and deletes it", async () => {
        const map = await createMap("overworld");
        const maps = new Map([[map.getId(), map]]);
        const blueNBT = createRenderTaskBlueNBT(maps);

        const data = new TasksData();
        data.version = RENDER_TASK_QUEUE_FORMAT_VERSION + 1;
        data.renderTasks = [new MapSaveTask(map)];

        const file = join(root, "tasks.dat");
        await writeFile(file, blueNBT.writeToBytes(data, TASKS_DATA_TOKEN));

        const errors: Array<[string, unknown]> = [];
        const restored = await loadRenderTaskQueue(file, maps, (message, error) =>
            errors.push([message, error]),
        );

        expect(restored).toEqual([]);
        expect(errors).toHaveLength(1);
        expect(String(errors[0]![0])).toMatch(/format version/);
        await expect(readFile(file)).rejects.toThrow();
    });

    it("drops one bad render-task entry and keeps the rest of the queue, reporting the error", async () => {
        const map = await createMap("overworld");
        const maps = new Map([[map.getId(), map]]); // note: "gone" is deliberately absent
        const goneMap = await createMap("gone");
        const savingBlueNBT = createRenderTaskBlueNBT(new Map([[goneMap.getId(), goneMap], [map.getId(), map]]));

        const data = new TasksData();
        data.version = RENDER_TASK_QUEUE_FORMAT_VERSION;
        data.renderTasks = [new MapSaveTask(map), new MapPurgeTask(goneMap), new MapSaveTask(map)];

        const file = join(root, "tasks.dat");
        await writeFile(file, savingBlueNBT.writeToBytes(data, TASKS_DATA_TOKEN));

        const errors: Array<[string, unknown]> = [];
        const restored = await loadRenderTaskQueue(file, maps, (message, error) =>
            errors.push([message, error]),
        );

        // the queue itself was well-formed; only the one entry naming an unloaded map
        // failed, and it was dropped rather than failing the whole load
        expect(restored).toHaveLength(2);
        expect(restored.every((task) => task instanceof MapSaveTask)).toBe(true);
        expect(errors).toHaveLength(1);
        expect(String(errors[0]![1])).toMatch(/No map with id 'gone' loaded/);
    });
});

/* -------------------------------------------------------------------------- */
/* Resume-after-crash: the actual point of all of this                        */
/* -------------------------------------------------------------------------- */

describe("resume after a simulated crash", () => {
    it("never re-renders a finished region, and fully re-renders the one that was interrupted", async () => {
        const map = await createMap("overworld");
        const maps = new Map([[map.getId(), map]]);

        const task = MapUpdateTask.forRegions(map, [REGION_A, REGION_B], TileUpdateStrategy.FORCE_ALL);

        // Drive region A (9 tiles) to completion, then partway (4 of 9 tiles) into region B.
        // This is "kill mid-render": doWork() is simply never called again after this point.
        for (let i = 0; i < REGION_TILE_COUNT; i++) await task.doWork(); // finishes region A
        await task.doWork(); // the empty call that retires region A and advances the cursor
        for (let i = 0; i < 4; i++) await task.doWork(); // 4 of region B's 9 tiles

        expect(task.getCurrentTaskIndex()).toBe(1); // still "on" region B
        expect(renderCalls).toHaveLength(REGION_TILE_COUNT + 4);
        const renderedBeforeCrash = renderCalls.length;

        // "restart": serialize the in-flight task, then rebuild the whole object graph
        // from scratch against a *freshly constructed* BmMap over the same on-disk
        // storage, exactly as a real process restart would hand the queue a newly loaded
        // set of maps rather than reusing the old in-memory ones.
        const savingBlueNBT = createRenderTaskBlueNBT(maps);
        const bytes = savingBlueNBT.writeToBytes(task, RENDER_TASK_TOKEN);

        const map2 = await createMap("overworld");
        const maps2 = new Map([[map2.getId(), map2]]);
        const loadingBlueNBT = createRenderTaskBlueNBT(maps2);
        const restored = loadingBlueNBT.read(bytes, RENDER_TASK_TOKEN) as MapUpdateTaskType;

        expect(restored.getMap()).toBe(map2);
        expect(restored.getCurrentTaskIndex()).toBe(1);
        expect(restored.getTasks()).toHaveLength(3);

        await drain(restored);

        const callsSinceRestore = renderCalls.slice(renderedBeforeCrash);

        // region A's tiles (tile-x in [-1, 1]) must never appear again — it was already
        // finished, and CombinedRenderTask never calls doWork() on anything before its
        // cursor, so the restored (brand-new) region-A task-object is never touched at all.
        expect(callsSinceRestore.some((tile) => tile.getX() >= -1 && tile.getX() <= 1)).toBe(false);

        // region B (tile-x in [19, 21]) was only *partially* rendered pre-crash — its
        // Serialized form carries no tile cursor (see the doc comment on
        // WorldRegionUpdateTaskSerialized), so the restored task restarts it from tile
        // (0,0): every one of its 9 tiles is rendered again, the 4 pre-crash ones included.
        expect(callsSinceRestore).toHaveLength(REGION_TILE_COUNT);
        expect(new Set(callsSinceRestore.map((t) => t.toString())).size).toBe(REGION_TILE_COUNT);
        expect(callsSinceRestore.every((tile) => tile.getX() >= 19 && tile.getX() <= 21)).toBe(true);

        // the whole update completed, save included
        expect(restored.hasMoreWork()).toBe(false);
        expect(restored.estimateProgress()).toBe(1);
    });
});
