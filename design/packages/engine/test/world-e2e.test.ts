import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync, gzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { NBTWriter } from "@material-bluemap/nbt";
import { Color, Key } from "@material-bluemap/shared";
import type { DataPack } from "../src/resources/pack/datapack/DataPack.js";
import { BlockState } from "../src/world/BlockState.js";
import { DimensionType } from "../src/world/DimensionType.js";
import { LightData } from "../src/world/LightData.js";
import { WorldLoaderType } from "../src/world/WorldLoaderType.js";
import { Biome } from "../src/world/biome/Biome.js";
import { GrassColorModifier } from "../src/world/biome/GrassColorModifier.js";
import { ANVIL, MCAWorld } from "../src/world/mca/MCAWorld.js";
import { Chunk_1_12 } from "../src/world/mca/chunk/Chunk_1_12.js";
import { Chunk_1_18 } from "../src/world/mca/chunk/Chunk_1_18.js";

const OVERWORLD = new Key("minecraft", "overworld");

// -- test fixtures: two tiny hand-built anvil worlds --

const tempDirs: string[] = [];
afterAll(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempWorldFolder(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

function testBiome(key: Key): Biome {
    return {
        getKey: () => key,
        getDownfall: () => 0.4,
        getTemperature: () => 0.8,
        getWaterColor: () => new Color(),
        getOverlayFoliageColor: () => new Color(),
        getOverlayDryFoliageColor: () => new Color(),
        getOverlayGrassColor: () => new Color(),
        getGrassColorModifier: () => GrassColorModifier.NONE,
    };
}

const PLAINS = testBiome(Key.minecraft("plains"));

/** minimal DataPack stand-in until the resources datapack-port lands (Phase C) */
function dataPackStub(): DataPack {
    return {
        getDimensionType: () => null,
        getBiome: (key: Key | number) =>
            typeof key !== "number" && key.getFormatted() === "minecraft:plains" ? PLAINS : null,
    };
}

/** builds a synthetic .mca region-file: 8KiB header + sector-aligned zlib chunk-data */
function buildRegionFile(chunks: { x: number; z: number; nbt: Uint8Array }[]): Buffer {
    const header = Buffer.alloc(1024 * 8);
    const sectors: Buffer[] = [];
    let nextSector = 2;

    for (const chunk of chunks) {
        const compressed = deflateSync(chunk.nbt); // compression-id 2: zlib

        const payload = Buffer.alloc(5 + compressed.length);
        payload.writeInt32BE(compressed.length + 1, 0); // length-prefix
        payload.writeUInt8(2, 4); // compression-id
        compressed.copy(payload, 5);

        const sectorCount = Math.ceil(payload.length / 4096);
        const sector = Buffer.alloc(sectorCount * 4096);
        payload.copy(sector, 0);
        sectors.push(sector);

        const xzChunk = ((chunk.z & 0b11111) << 5) | (chunk.x & 0b11111);
        header.writeUIntBE(nextSector, xzChunk * 4, 3);
        header.writeUInt8(sectorCount, xzChunk * 4 + 3);
        header.writeInt32BE(1, 4096 + xzChunk * 4); // timestamp

        nextSector += sectorCount;
    }

    return Buffer.concat([header, ...sectors]);
}

/** packs values in the 1.16+ "padded" long-array layout (elements never span longs) */
function packPadded(values: readonly number[], bitsPerElement: number): BigInt64Array {
    const elementsPerLong = Math.trunc(64 / bitsPerElement);
    const data = new BigInt64Array(Math.ceil(values.length / elementsPerLong));
    for (let i = 0; i < values.length; i++) {
        const longIndex = Math.trunc(i / elementsPerLong);
        const bitOffset = BigInt((i % elementsPerLong) * bitsPerElement);
        const value = BigInt(values[i]!) & ((1n << BigInt(bitsPerElement)) - 1n);
        data[longIndex] = BigInt.asIntN(
            64,
            BigInt.asUintN(64, data[longIndex]!) | (value << bitOffset),
        );
    }
    return data;
}

/** block-index inside a section (y-major, then z, then x) */
function blockIndex(x: number, y: number, z: number): number {
    return ((y & 0xf) << 8) | ((z & 0xf) << 4) | (x & 0xf);
}

// -- modern (1.18.2, DataVersion 2975) world --

function writeModernLevelDat(worldFolder: string): void {
    const writer = new NBTWriter();
    writer.beginCompound();
    writer.name("Data");
    writer.beginCompound();
    writer.name("LevelName").valueString("e2e-modern");
    writer.name("DataVersion").valueInt(2975);
    writer.name("WorldGenSettings");
    writer.beginCompound();
    writer.name("dimensions");
    writer.beginCompound();
    writer.name(OVERWORLD.getFormatted());
    writer.beginCompound();
    writer.name("type");
    writer.beginCompound(); // inline dimension-type
    writer.name("natural").valueByte(1);
    writer.name("has_skylight").valueByte(1);
    writer.name("has_ceiling").valueByte(0);
    writer.name("ambient_light").valueFloat(0);
    writer.name("min_y").valueInt(-64);
    writer.name("height").valueInt(384);
    writer.name("coordinate_scale").valueDouble(1);
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();
    writer.close();

    writeFileSync(join(worldFolder, "level.dat"), gzipSync(writer.toUint8Array()));
}

/**
 * One populated section (Y=4, blocks at y 64..79) with the known pattern:
 * stone (0,64,0), grass_block[snowy=false] (1,64,0), water[level=0] (2,64,0);
 * biome-palette single-valued minecraft:plains; full sky-light, no block-light.
 */
function buildModernChunkNbt(): Uint8Array {
    // palette: air, stone, grass_block, water -> 4 entries, 1.16+ padded 4-bit layout
    const blocks = new Array<number>(4096).fill(0);
    blocks[blockIndex(0, 64, 0)] = 1;
    blocks[blockIndex(1, 64, 0)] = 2;
    blocks[blockIndex(2, 64, 0)] = 3;
    const blockData = packPadded(blocks, 4);

    const skyLight = new Int8Array(2048).fill(-1); // all nibbles 15

    const writer = new NBTWriter();
    writer.beginCompound();
    writer.name("DataVersion").valueInt(2975);
    writer.name("xPos").valueInt(0);
    writer.name("zPos").valueInt(0);
    writer.name("yPos").valueInt(-4);
    writer.name("Status").valueString("minecraft:full");
    writer.name("InhabitedTime").valueLong(0n);

    writer.name("sections");
    writer.beginList(1);
    writer.beginCompound();
    writer.name("Y").valueByte(4);
    writer.name("block_states");
    writer.beginCompound();
    writer.name("palette");
    writer.beginList(4);
    writer.beginCompound();
    writer.name("Name").valueString("minecraft:air");
    writer.endCompound();
    writer.beginCompound();
    writer.name("Name").valueString("minecraft:stone");
    writer.endCompound();
    writer.beginCompound();
    writer.name("Name").valueString("minecraft:grass_block");
    writer.name("Properties");
    writer.beginCompound();
    writer.name("snowy").valueString("false");
    writer.endCompound();
    writer.endCompound();
    writer.beginCompound();
    writer.name("Name").valueString("minecraft:water");
    writer.name("Properties");
    writer.beginCompound();
    writer.name("level").valueString("0");
    writer.endCompound();
    writer.endCompound();
    writer.endList();
    writer.name("data").valueLongArray(blockData);
    writer.endCompound();
    writer.name("biomes");
    writer.beginCompound();
    writer.name("palette");
    writer.beginList(1);
    writer.valueString("minecraft:plains");
    writer.endList();
    writer.endCompound();
    writer.name("SkyLight").valueByteArray(skyLight);
    writer.endCompound();
    writer.endList();

    writer.endCompound();
    writer.close();
    return writer.toUint8Array();
}

function writeModernWorld(): string {
    const worldFolder = tempWorldFolder("bluemap-e2e-modern-");
    writeModernLevelDat(worldFolder);
    mkdirSync(join(worldFolder, "region"));
    writeFileSync(
        join(worldFolder, "region", "r.0.0.mca"),
        buildRegionFile([{ x: 0, z: 0, nbt: buildModernChunkNbt() }]),
    );
    return worldFolder;
}

// -- legacy (1.12.2, DataVersion 1343) world --

function writeLegacyLevelDat(worldFolder: string): void {
    const writer = new NBTWriter();
    writer.beginCompound();
    writer.name("Data");
    writer.beginCompound();
    writer.name("LevelName").valueString("e2e-legacy");
    writer.name("DataVersion").valueInt(1343);
    writer.endCompound();
    writer.endCompound();
    writer.close();

    writeFileSync(join(worldFolder, "level.dat"), gzipSync(writer.toUint8Array()));
}

/**
 * One populated ChunkAnvil112-layout section (Y=4) with the known pattern:
 * stone 1:0 (0,64,0), grass 2:0 (1,64,0), oak fence 85:0 (3,64,0) and stone 1:0
 * (4,64,0) adjacent so the wooden-fence-connect extension fires east; biomes
 * byte[256] all 1 (plains); full sky-light, no block-light.
 */
function buildLegacyChunkNbt(): Uint8Array {
    const blocks = new Int8Array(4096);
    blocks[blockIndex(0, 64, 0)] = 1; // stone
    blocks[blockIndex(1, 64, 0)] = 2; // grass
    blocks[blockIndex(3, 64, 0)] = 85; // oak fence
    blocks[blockIndex(4, 64, 0)] = 1; // stone (east of the fence)

    const data = new Int8Array(2048); // meta all 0
    const blockLight = new Int8Array(2048);
    const skyLight = new Int8Array(2048).fill(-1); // all nibbles 15

    const biomes = new Int8Array(256).fill(1); // plains
    const heightMap = new Int32Array(256).fill(65);

    const writer = new NBTWriter();
    writer.beginCompound();
    writer.name("DataVersion").valueInt(1343);
    writer.name("Level");
    writer.beginCompound();
    writer.name("xPos").valueInt(0);
    writer.name("zPos").valueInt(0);
    writer.name("LightPopulated").valueByte(1);
    writer.name("TerrainPopulated").valueByte(1);
    writer.name("InhabitedTime").valueLong(0n);
    writer.name("HeightMap").valueIntArray(heightMap);
    writer.name("Biomes").valueByteArray(biomes);
    writer.name("Sections");
    writer.beginList(1);
    writer.beginCompound();
    writer.name("Y").valueByte(4);
    writer.name("Blocks").valueByteArray(blocks);
    writer.name("Data").valueByteArray(data);
    writer.name("BlockLight").valueByteArray(blockLight);
    writer.name("SkyLight").valueByteArray(skyLight);
    writer.endCompound();
    writer.endList();
    writer.endCompound();
    writer.endCompound();
    writer.close();
    return writer.toUint8Array();
}

function writeLegacyWorld(): string {
    const worldFolder = tempWorldFolder("bluemap-e2e-legacy-");
    writeLegacyLevelDat(worldFolder);
    mkdirSync(join(worldFolder, "region"));
    writeFileSync(
        join(worldFolder, "region", "r.0.0.mca"),
        buildRegionFile([{ x: 0, z: 0, nbt: buildLegacyChunkNbt() }]),
    );
    return worldFolder;
}

/** opens a world through the registered anvil WorldLoaderType */
async function openWorld(worldFolder: string): Promise<MCAWorld> {
    const anvil = WorldLoaderType.REGISTRY.get(Key.bluemap("anvil"));
    expect(anvil).toBe(ANVIL);

    const world = await anvil!.loadWorld(worldFolder, OVERWORLD, null, dataPackStub());
    expect(world).toBeInstanceOf(MCAWorld);
    return world as MCAWorld;
}

// -- the vertical slice --

describe("world e2e: modern 1.18 world through the anvil loader", () => {
    it("loads level.dat, region and chunk and serves block/biome/light data", async () => {
        const world = await openWorld(writeModernWorld());

        // dimension-type comes from the level.dat's inline compound
        expect(world.getDimensionType().getMinY()).toBe(-64);
        expect(world.getDimensionType().getHeight()).toBe(384);
        expect(world.getDimensionType().hasSkylight()).toBe(true);

        const regions = world.listRegions();
        expect(regions).toHaveLength(1);
        expect(regions[0]!.getX()).toBe(0);
        expect(regions[0]!.getY()).toBe(0);

        await world.preloadRegionChunks(0, 0);
        const chunk = world.getChunk(0, 0);
        expect(chunk).toBeInstanceOf(Chunk_1_18);
        expect(chunk.isGenerated()).toBe(true);
        expect(chunk.hasLightData()).toBe(true);

        // block-states, exactly as placed
        expect(chunk.getBlockState(0, 64, 0).equals(BlockState.fromString("minecraft:stone"))).toBe(
            true,
        );

        const grass = chunk.getBlockState(1, 64, 0);
        expect(grass.getId().getFormatted()).toBe("minecraft:grass_block");
        expect(grass.getProperties().get("snowy")).toBe("false");

        const water = chunk.getBlockState(2, 64, 0);
        expect(water.getId().getFormatted()).toBe("minecraft:water");
        expect(water.isWater()).toBe(true);
        expect(water.getLiquidLevel()).toBe(0);

        // everything else in the section is air (palette-id 0)
        const air = chunk.getBlockState(3, 64, 0);
        expect(air.isAir()).toBe(true);
        // outside any section
        expect(chunk.getBlockState(0, 200, 0)).toBe(BlockState.AIR);

        // biomes resolve through the data-pack (single-valued palette)
        expect(chunk.getBiome(0, 64, 0)).toBe(PLAINS);
        expect(chunk.getBiome(2, 64, 2)).toBe(PLAINS);

        // light: full sky-light, no block-light
        const light = chunk.getLightData(0, 64, 0, new LightData(-1, -1));
        expect(light.getSkyLight()).toBe(15);
        expect(light.getBlockLight()).toBe(0);

        // no heightmaps were written
        expect(chunk.hasWorldSurfaceHeights()).toBe(false);
        expect(chunk.hasOceanFloorHeights()).toBe(false);
    });
});

describe("world e2e: legacy 1.12.2 world through the anvil loader", () => {
    it("dispatches DataVersion 1343 to Chunk_1_12 and applies the legacy extensions", async () => {
        const world = await openWorld(writeLegacyWorld());

        // no world-gen settings in the level.dat -> builtin overworld dimension-type
        expect(world.getDimensionType()).toBe(DimensionType.OVERWORLD);
        // legacy layout: the world-folder itself is the overworld dimension-folder
        expect(world.getDimensionFolder()).toBe(world.getWorldFolder());

        await world.preloadRegionChunks(0, 0);

        // the raw cached chunk is a Chunk_1_12 (DataVersion <= 1343 dispatch) ...
        const rawChunk = world.getBlockChunkGrid().getCachedChunk(0, 0);
        expect(rawChunk).toBeInstanceOf(Chunk_1_12);
        // ... and getChunk wraps it in the legacy-extension view
        const chunk = world.getChunk(0, 0);
        expect(chunk).not.toBe(rawChunk);
        expect(chunk.isGenerated()).toBe(true);
        expect(chunk.hasLightData()).toBe(true);

        // 1:0 -> minecraft:stone (no extensions)
        const stone = chunk.getBlockState(0, 64, 0);
        expect(stone.equals(BlockState.fromString("minecraft:stone"))).toBe(true);

        // 2:0 -> minecraft:grass, snowy-extension adds snowy=false (no snow above)
        const grass = chunk.getBlockState(1, 64, 0);
        expect(grass.getId().getFormatted()).toBe("minecraft:grass");
        expect(grass.getProperties().get("snowy")).toBe("false");

        // 85:0 -> minecraft:fence, fence-connect extension: east neighbor is culling
        // stone -> east=true, all other sides face air -> false
        const fence = chunk.getBlockState(3, 64, 0);
        expect(fence.getId().getFormatted()).toBe("minecraft:fence");
        expect(fence.getProperties().get("east")).toBe("true");
        expect(fence.getProperties().get("north")).toBe("false");
        expect(fence.getProperties().get("south")).toBe("false");
        expect(fence.getProperties().get("west")).toBe("false");

        // the raw (unextended) chunk serves the plain mapped block-state
        expect(rawChunk.getBlockState(3, 64, 0).getProperties().size).toBe(0);

        // biome byte 1 -> minecraft:plains through the bundled legacy biome-table
        expect(chunk.getBiome(0, 64, 0).getKey().getFormatted()).toBe("minecraft:plains");

        // light: full sky-light, no block-light
        const light = chunk.getLightData(3, 64, 0, new LightData(-1, -1));
        expect(light.getSkyLight()).toBe(15);
        expect(light.getBlockLight()).toBe(0);

        // legacy HeightMap (int[256]) -> world-surface heights
        expect(chunk.hasWorldSurfaceHeights()).toBe(true);
        expect(chunk.getWorldSurfaceY(0, 0)).toBe(65);
        // pre-1.13 chunks have no ocean-floor heightmap
        expect(chunk.hasOceanFloorHeights()).toBe(false);
    });
});
