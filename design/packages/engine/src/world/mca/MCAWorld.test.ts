import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { NBTWriter } from "@material-bluemap/nbt";
import { Key } from "@material-bluemap/shared";
import type { DataPack } from "../../resources/pack/datapack/DataPack.js";
import { Compression } from "../../storage/compression/Compression.js";
import { BlockState } from "../BlockState.js";
import { Chunk } from "../Chunk.js";
import { DimensionType } from "../DimensionType.js";
import { Region } from "../Region.js";
import { WorldLoaderType } from "../WorldLoaderType.js";
import { Chunk_1_12 } from "./chunk/Chunk_1_12.js";
import { ANVIL, MCAWorld } from "./MCAWorld.js";

const OVERWORLD = new Key("minecraft", "overworld");
const THE_NETHER = new Key("minecraft", "the_nether");
const THE_END = new Key("minecraft", "the_end");

/** minimal DataPack stand-in until the resources datapack-port lands */
function dataPackStub(
    getDimensionType: (key: Key) => DimensionType | null = () => null,
): DataPack {
    return { getDimensionType } as DataPack;
}

const tempDirs: string[] = [];

function tempWorldFolder(): string {
    const dir = mkdtempSync(join(tmpdir(), "bluemap-mcaworld-"));
    tempDirs.push(dir);
    return dir;
}

afterAll(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("MCAWorld.resolveDimensionFolder", () => {
    it("prefers the modern dimensions/<namespace>/<value> folder", () => {
        const worldFolder = tempWorldFolder();
        mkdirSync(join(worldFolder, "dimensions", "minecraft", "overworld"), { recursive: true });
        mkdirSync(join(worldFolder, "region"));

        expect(MCAWorld.resolveDimensionFolder(worldFolder, OVERWORLD)).toBe(
            join(worldFolder, "dimensions", "minecraft", "overworld"),
        );
    });

    it("falls back to the legacy overworld layout (the world-folder itself)", () => {
        const worldFolder = tempWorldFolder();
        mkdirSync(join(worldFolder, "region"));

        expect(MCAWorld.resolveDimensionFolder(worldFolder, OVERWORLD)).toBe(worldFolder);
    });

    it("falls back to the legacy DIM-1 / DIM1 layouts for nether and end", () => {
        const worldFolder = tempWorldFolder();
        mkdirSync(join(worldFolder, "DIM-1", "region"), { recursive: true });
        mkdirSync(join(worldFolder, "DIM1", "region"), { recursive: true });

        expect(MCAWorld.resolveDimensionFolder(worldFolder, THE_NETHER)).toBe(
            join(worldFolder, "DIM-1"),
        );
        expect(MCAWorld.resolveDimensionFolder(worldFolder, THE_END)).toBe(
            join(worldFolder, "DIM1"),
        );
    });

    it("legacy layout only counts with a region-subfolder", () => {
        const worldFolder = tempWorldFolder();
        mkdirSync(join(worldFolder, "DIM-1")); // no region folder inside

        expect(MCAWorld.resolveDimensionFolder(worldFolder, THE_NETHER)).toBe(
            join(worldFolder, "dimensions", "minecraft", "the_nether"),
        );
    });

    it("returns the (might exist later) modern folder when nothing exists", () => {
        const worldFolder = tempWorldFolder();

        expect(MCAWorld.resolveDimensionFolder(worldFolder, OVERWORLD)).toBe(
            join(worldFolder, "dimensions", "minecraft", "overworld"),
        );
        expect(MCAWorld.resolveDimensionFolder(worldFolder, new Key("myns", "mydim"))).toBe(
            join(worldFolder, "dimensions", "myns", "mydim"),
        );
    });
});

/** writes a gzipped level.dat where the dimension's "type" is written by writeType */
async function writeLevelDat(
    worldFolder: string,
    dimension: Key,
    writeType: (writer: NBTWriter) => void,
): Promise<void> {
    const writer = new NBTWriter();
    writer.name("").beginCompound();
    writer.name("Data").beginCompound();
    writer.name("LevelName").valueString("test-level");
    writer.name("WorldGenSettings").beginCompound();
    writer.name("dimensions").beginCompound();
    writer.name(dimension.getFormatted()).beginCompound();
    writer.name("type");
    writeType(writer);
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();

    writeFileSync(
        join(worldFolder, "level.dat"),
        await Compression.GZIP.compress(writer.toUint8Array()),
    );
}

describe("MCAWorld.loadDimensionType", () => {
    it("uses the builtin dimension-types when no world-data exists", async () => {
        const worldFolder = tempWorldFolder();
        const dataPack = dataPackStub();

        expect(await MCAWorld.loadDimensionType(worldFolder, OVERWORLD, dataPack)).toBe(
            DimensionType.OVERWORLD,
        );
        expect(await MCAWorld.loadDimensionType(worldFolder, THE_NETHER, dataPack)).toBe(
            DimensionType.NETHER,
        );
        expect(await MCAWorld.loadDimensionType(worldFolder, THE_END, dataPack)).toBe(
            DimensionType.END,
        );
        // unknown dimension -> warning + overworld fallback
        expect(
            await MCAWorld.loadDimensionType(worldFolder, new Key("myns", "mydim"), dataPack),
        ).toBe(DimensionType.OVERWORLD);
    });

    it("reads an inline dimension-type compound from the level.dat", async () => {
        const worldFolder = tempWorldFolder();
        await writeLevelDat(worldFolder, OVERWORLD, (writer) => {
            writer.beginCompound();
            writer.name("natural").valueByte(1);
            writer.name("has_skylight").valueByte(1);
            writer.name("has_ceiling").valueByte(0);
            writer.name("ambient_light").valueFloat(0);
            writer.name("min_y").valueInt(-64);
            writer.name("height").valueInt(384);
            writer.name("coordinate_scale").valueDouble(1);
            writer.endCompound();
        });

        const dimensionType = await MCAWorld.loadDimensionType(
            worldFolder,
            OVERWORLD,
            dataPackStub(),
        );

        expect(dimensionType.getMinY()).toBe(-64);
        expect(dimensionType.getHeight()).toBe(384);
        expect(dimensionType.hasSkylight()).toBe(true);
        expect(dimensionType.hasCeiling()).toBe(false);
    });

    it("resolves a dimension-type reference through the data-pack", async () => {
        const worldFolder = tempWorldFolder();
        await writeLevelDat(worldFolder, OVERWORLD, (writer) => {
            writer.valueString("custom:dim_type");
        });

        const requested: Key[] = [];
        const dimensionType = await MCAWorld.loadDimensionType(
            worldFolder,
            OVERWORLD,
            dataPackStub((key) => {
                requested.push(key);
                return DimensionType.NETHER;
            }),
        );

        expect(dimensionType).toBe(DimensionType.NETHER);
        expect(requested.map((key) => key.getFormatted())).toEqual(["custom:dim_type"]);
    });
});

describe("MCAWorld.load", () => {
    it("constructs the world with id, folders and grids", async () => {
        const worldFolder = tempWorldFolder();
        mkdirSync(join(worldFolder, "region"));

        const world = await MCAWorld.load(worldFolder, OVERWORLD, null, dataPackStub());

        expect(world.getId()).toBe(worldFolder + "#minecraft:overworld");
        expect(world.getWorldFolder()).toBe(worldFolder);
        expect(world.getDimension()).toBe(OVERWORLD);
        expect(world.getDimensionType()).toBe(DimensionType.OVERWORLD);
        expect(world.getDimensionFolder()).toBe(worldFolder);
        expect(world.getChunkGrid().getGridSize().getX()).toBe(16);
        expect(world.getRegionGrid().getGridSize().getX()).toBe(512);
        expect(world.listRegions()).toEqual([]);
        // no chunk-data on disk: the sync accessor serves the empty chunk
        expect(world.getChunk(0, 0)).toBe(Chunk.EMPTY_CHUNK);
        expect(world.getChunkAtBlock(100, -100)).toBe(Chunk.EMPTY_CHUNK);
    });

    it("uses the data-pack when a dimension-type key is given", async () => {
        const worldFolder = tempWorldFolder();
        const custom = DimensionType.OVERWORLD_CAVES;

        const world = await MCAWorld.load(
            worldFolder,
            OVERWORLD,
            new Key("minecraft", "overworld_caves"),
            dataPackStub(() => custom),
        );

        expect(world.getDimensionType()).toBe(custom);
    });
});

/*
 * Port-only API (see World#preloadChunks): the synchronous accessors answer a cache-miss
 * with the empty chunk, so a reader has to make its chunk-window present first. The
 * region-granular preloadRegionChunks can not do that job — a read-window can straddle
 * several regions — which is what the second test here pins.
 */
describe("MCAWorld.preloadChunks", () => {
    /**
     * A region whose chunks resolve on a later turn of the event-loop, the way a real
     * region-file's do. That delay is the whole point: the synchronous accessors can not
     * wait for it, so only an awaited preload can make the chunks visible to them.
     */
    class FakeRegion extends Region<Chunk> {
        constructor(private readonly chunks: ReadonlyMap<string, Chunk>) {
            super();
        }

        override async loadChunk(chunkX: number, chunkZ: number): Promise<Chunk> {
            await Promise.resolve();
            return this.chunks.get(chunkX + "," + chunkZ) ?? this.emptyChunk();
        }

        override iterateAllChunks(): Promise<void> {
            throw new Error("preloadChunks loads chunk-by-chunk, not region-by-region");
        }

        override emptyChunk(): Chunk {
            return Chunk.EMPTY_CHUNK;
        }

        override exists(): boolean {
            return true;
        }
    }

    /** a chunk with its own identity, so a test can tell which one it got */
    function distinctChunk(): Chunk {
        return new (class extends Chunk {})();
    }

    function installBlockRegion(world: MCAWorld, regionX: number, regionZ: number, region: FakeRegion): void {
        world.getBlockChunkGrid()["regionCache"].set(regionX + "," + regionZ, region);
    }

    it("makes every chunk of the range available to the synchronous accessors", async () => {
        const world = await MCAWorld.load(tempWorldFolder(), OVERWORLD, null, dataPackStub());

        const chunks = new Map<string, Chunk>();
        for (let x = 0; x <= 2; x++) {
            for (let z = 0; z <= 2; z++) chunks.set(x + "," + z, distinctChunk());
        }
        // on disk, but outside the range that gets preloaded
        chunks.set("3,0", distinctChunk());
        installBlockRegion(world, 0, 0, new FakeRegion(chunks));

        await world.preloadChunks(0, 0, 2, 2);

        for (let x = 0; x <= 2; x++) {
            for (let z = 0; z <= 2; z++) {
                expect(world.getChunk(x, z)).toBe(chunks.get(x + "," + z));
            }
        }
        // and through the block-position accessor the render-passes actually use
        expect(world.getChunkAtBlock(2 * 16 + 15, 15)).toBe(chunks.get("2,0"));

        // outside the range nothing was loaded, so the miss still answers with air
        expect(world.getChunk(3, 0)).toBe(Chunk.EMPTY_CHUNK);
    });

    it("loads a range that straddles four regions", async () => {
        const world = await MCAWorld.load(tempWorldFolder(), OVERWORLD, null, dataPackStub());

        // chunk (x, z) lives in region (x >> 5, z >> 5), so the four chunks around the
        // origin sit in four different region-files
        const corners = new Map<string, Chunk>([
            ["-1,-1", distinctChunk()],
            ["-1,0", distinctChunk()],
            ["0,-1", distinctChunk()],
            ["0,0", distinctChunk()],
        ]);
        for (const [key, chunk] of corners) {
            const [x, z] = key.split(",").map(Number) as [number, number];
            installBlockRegion(world, x >> 5, z >> 5, new FakeRegion(new Map([[key, chunk]])));
        }

        await world.preloadChunks(-1, -1, 0, 0);

        for (const [key, chunk] of corners) {
            const [x, z] = key.split(",").map(Number) as [number, number];
            expect(world.getChunk(x, z)).toBe(chunk);
        }
    });

    it("warms the entity chunk-cache alongside the block one", async () => {
        const world = await MCAWorld.load(tempWorldFolder(), OVERWORLD, null, dataPackStub());

        await world.preloadChunks(0, 0, 1, 1);

        const entityCache = world.getEntityChunkGrid()["chunkCache"];
        // no entities-folder on disk: the loads resolve to the empty entity-chunk, which
        // is still a *loaded* answer and is what iterateEntities then finds cached
        expect([...entityCache.keys()].sort()).toEqual(["0,0", "0,1", "1,0", "1,1"]);
        expect(entityCache.has("2,0")).toBe(false);
    });

    it("loads nothing for an empty range", async () => {
        const world = await MCAWorld.load(tempWorldFolder(), OVERWORLD, null, dataPackStub());

        await world.preloadChunks(1, 1, 0, 0);

        expect(world.getBlockChunkGrid()["chunkCache"].size).toBe(0);
        expect(world.getEntityChunkGrid()["chunkCache"].size).toBe(0);
    });
});

describe("MCAWorld legacy block-state extensions (1.12 chunks)", () => {
    /** a stand-in Chunk_1_12 (instanceof-compatible) serving fixed raw block-states */
    function legacyChunkOf(states: ReadonlyMap<string, BlockState>): Chunk_1_12 {
        const chunk = Object.create(Chunk_1_12.prototype) as Chunk_1_12;
        Object.defineProperty(chunk, "getBlockState", {
            value: (x: number, y: number, z: number): BlockState =>
                states.get(x + "," + y + "," + z) ?? BlockState.AIR,
        });
        return chunk;
    }

    async function worldWithChunks(chunks: ReadonlyMap<string, Chunk>): Promise<MCAWorld> {
        const world = await MCAWorld.load(tempWorldFolder(), OVERWORLD, null, dataPackStub());
        for (const [pos, chunk] of chunks) {
            world.getBlockChunkGrid()["chunkCache"].set(pos, chunk);
        }
        return world;
    }

    const grass = BlockState.fromString("minecraft:grass");
    const snow = BlockState.fromString("minecraft:snow");
    const stone = BlockState.fromString("minecraft:stone");

    it("applies extensions on block-state access through getChunk", async () => {
        const legacyChunk = legacyChunkOf(
            new Map([
                ["0,0,0", grass],
                ["0,1,0", snow],
                ["2,0,2", grass],
            ]),
        );
        const world = await worldWithChunks(new Map([["0,0", legacyChunk]]));

        const chunk = world.getChunk(0, 0);
        // wrapped in the extension-view (and the view is cached)
        expect(chunk).not.toBe(legacyChunk);
        expect(world.getChunk(0, 0)).toBe(chunk);

        // snow above -> snowy=true; no snow above -> snowy=false
        expect(chunk.getBlockState(0, 0, 0).getProperties().get("snowy")).toBe("true");
        expect(chunk.getBlockState(2, 0, 2).getProperties().get("snowy")).toBe("false");
        // ids without extensions pass through untouched
        expect(chunk.getBlockState(0, 1, 0)).toBe(snow);

        // the raw chunk stays unextended (extensions read raw neighbor-states)
        expect(legacyChunk.getBlockState(0, 0, 0)).toBe(grass);
    });

    it("getExtendedBlockState extends only Chunk_1_12 chunks", async () => {
        const legacyChunk = legacyChunkOf(new Map([["0,0,0", grass]]));
        const world = await worldWithChunks(new Map([["0,0", legacyChunk]]));

        expect(
            world.getExtendedBlockState(legacyChunk, 0, 0, 0).getProperties().get("snowy"),
        ).toBe("false");

        // a modern chunk with the same states is not extended
        const modernChunk = new (class extends Chunk {
            override getBlockState(): BlockState {
                return grass;
            }
        })();
        expect(world.getExtendedBlockState(modernChunk, 0, 0, 0)).toBe(grass);
    });

    it("does not wrap modern chunks", async () => {
        const modernChunk = new (class extends Chunk {})();
        const world = await worldWithChunks(new Map([["0,0", modernChunk]]));

        expect(world.getChunk(0, 0)).toBe(modernChunk);
    });

    it("resolves neighbor block-states across chunk-borders (raw)", async () => {
        const world = await worldWithChunks(
            new Map<string, Chunk>([
                ["0,0", legacyChunkOf(new Map([["15,0,0", grass]]))],
                ["1,0", legacyChunkOf(new Map([["17,0,0", stone]]))],
            ]),
        );

        // the neighbor-receiver the extensions get resolves through the chunk-grid
        expect(world["rawBlockStateAccess"](15, 0, 0)).toBe(grass);
        expect(world["rawBlockStateAccess"](17, 0, 0)).toBe(stone);
        expect(world["rawBlockStateAccess"](33, 0, 0)).toBe(BlockState.AIR); // unloaded -> empty chunk
    });
});

describe("ANVIL world-loader registration", () => {
    it("registers the anvil loader-type in the WorldLoaderType registry", () => {
        expect(ANVIL.getKey().getFormatted()).toBe("bluemap:anvil");
        expect(WorldLoaderType.REGISTRY.get(ANVIL.getKey())).toBe(ANVIL);
    });

    it("loads worlds through the WorldLoader interface", async () => {
        const worldFolder = tempWorldFolder();
        const world = await ANVIL.loadWorld(worldFolder, OVERWORLD, null, dataPackStub());

        expect(world).toBeInstanceOf(MCAWorld);
        expect(world.getDimensionType()).toBe(DimensionType.OVERWORLD);
    });
});
