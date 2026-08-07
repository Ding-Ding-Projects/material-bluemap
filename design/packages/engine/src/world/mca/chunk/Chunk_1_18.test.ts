import { describe, expect, it } from "vitest";
import { NBTWriter } from "@worldlens/nbt";
import { Color, Key } from "@worldlens/shared";
import { BlockState } from "../../BlockState.js";
import { DimensionType } from "../../DimensionType.js";
import { LightData } from "../../LightData.js";
import { Biome } from "../../biome/Biome.js";
import { GrassColorModifier } from "../../biome/GrassColorModifier.js";
import { MCAUtil } from "../MCAUtil.js";
import type { MCAWorld } from "../MCAWorld.js";
import { MCABlockEntity } from "../blockentity/MCABlockEntity.js";
import { LegacySignBlockEntity, SignBlockEntity } from "../blockentity/SignBlockEntity.js";
import { SkullBlockEntity } from "../blockentity/SkullBlockEntity.js";
import { Chunk_1_18, CHUNK_1_18_DATA_TOKEN } from "./Chunk_1_18.js";

function testBiome(key: Key): Biome {
    return {
        getKey: () => key,
        getDownfall: () => 0,
        getTemperature: () => 2,
        getWaterColor: () => new Color(),
        getOverlayFoliageColor: () => new Color(),
        getOverlayDryFoliageColor: () => new Color(),
        getOverlayGrassColor: () => new Color(),
        getGrassColorModifier: () => GrassColorModifier.NONE,
    };
}

const PLAINS = testBiome(Key.minecraft("plains"));
const DESERT = testBiome(Key.minecraft("desert"));
const BIOMES = new Map<string, Biome>([
    ["minecraft:plains", PLAINS],
    ["minecraft:desert", DESERT],
]);

const WORLD = {
    getDimensionType: () => DimensionType.OVERWORLD,
    getDataPack: () => ({
        getBiome: (key: Key) => BIOMES.get(key.getFormatted()) ?? null,
    }),
} as unknown as MCAWorld;

/** packs values in the 1.16+ "padded" layout (elements never span longs) */
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

function blockIndex(x: number, y: number, z: number): number {
    return ((y & 0xf) << 8) | ((z & 0xf) << 4) | (x & 0xf);
}

/** odd indices use the high ("large") nibble, even indices the low nibble */
function nibbleSet(array: Int8Array, index: number, value: number): void {
    const half = index >> 1;
    if ((index & 1) !== 0) array[half] = (array[half]! & 0x0f) | ((value & 0xf) << 4);
    else array[half] = (array[half]! & 0xf0) | (value & 0xf);
}

function buildChunkNbt(): Uint8Array {
    // blocks: 4 bits per block (palette: air, stone, oak_log[axis=x])
    const blocks = new Array<number>(4096).fill(0);
    blocks[blockIndex(1, 2, 3)] = 1; // stone
    blocks[blockIndex(5, 0, 0)] = 2; // oak_log
    blocks[blockIndex(15, 15, 15)] = 3; // out-of-palette -> MISSING
    const blockData = packPadded(blocks, 4);

    // biomes: 1 bit per 4x4x4 cell (palette: plains, desert)
    const biomes = new Array<number>(64).fill(0);
    biomes[3] = 1; // the cell of (12..15, 0..3, 0..3)
    const biomeData = packPadded(biomes, 1);

    // heightmaps: 9 bits per value (ceilLog2(384 + 1))
    const heights = new Array<number>(256).fill(100);
    heights[(2 << 4) | 3] = 150; // x=3 z=2
    const worldSurface = packPadded(heights, 9);
    const oceanFloor = packPadded(new Array<number>(256).fill(70), 9);

    // light nibble-arrays
    const blockLight = new Int8Array(2048);
    const skyLight = new Int8Array(2048);
    nibbleSet(blockLight, blockIndex(1, 2, 3), 11);
    nibbleSet(skyLight, blockIndex(1, 2, 3), 7);
    nibbleSet(skyLight, blockIndex(0, 0, 0), 15);

    const writer = new NBTWriter();
    writer.beginCompound();
    writer.name("DataVersion");
    writer.valueInt(2860);
    writer.name("Status");
    writer.valueString("minecraft:full");
    writer.name("InhabitedTime");
    writer.valueLong(123n);

    writer.name("Heightmaps");
    writer.beginCompound();
    writer.name("WORLD_SURFACE");
    writer.valueLongArray(worldSurface);
    writer.name("OCEAN_FLOOR");
    writer.valueLongArray(oceanFloor);
    writer.endCompound();

    writer.name("sections");
    writer.beginList(1);
    writer.beginCompound();
    writer.name("Y");
    writer.valueByte(0);
    writer.name("block_states");
    writer.beginCompound();
    writer.name("palette");
    writer.beginList(3);
    writer.beginCompound();
    writer.name("Name");
    writer.valueString("minecraft:air");
    writer.endCompound();
    writer.beginCompound();
    writer.name("Name");
    writer.valueString("minecraft:stone");
    writer.endCompound();
    writer.beginCompound();
    writer.name("Name");
    writer.valueString("minecraft:oak_log");
    writer.name("Properties");
    writer.beginCompound();
    writer.name("axis");
    writer.valueString("x");
    writer.endCompound();
    writer.endCompound();
    writer.endList();
    writer.name("data");
    writer.valueLongArray(blockData);
    writer.endCompound();
    writer.name("biomes");
    writer.beginCompound();
    writer.name("palette");
    writer.beginList(2);
    writer.valueString("minecraft:plains");
    writer.valueString("minecraft:desert");
    writer.endList();
    writer.name("data");
    writer.valueLongArray(biomeData);
    writer.endCompound();
    writer.name("BlockLight");
    writer.valueByteArray(blockLight);
    writer.name("SkyLight");
    writer.valueByteArray(skyLight);
    writer.endCompound();
    writer.endList();

    writer.name("block_entities");
    writer.beginList(4);
    // modern sign
    writer.beginCompound();
    writer.name("id");
    writer.valueString("minecraft:sign");
    writer.name("x");
    writer.valueInt(5);
    writer.name("y");
    writer.valueInt(2);
    writer.name("z");
    writer.valueInt(3);
    writer.name("keepPacked");
    writer.valueByte(0);
    writer.name("front_text");
    writer.beginCompound();
    writer.name("has_glowing_text");
    writer.valueByte(1);
    writer.name("color");
    writer.valueString("lime");
    writer.name("messages");
    writer.beginList(4);
    writer.valueString('"one"');
    writer.valueString('"two"');
    writer.valueString('"three"');
    writer.valueString('"four"');
    writer.endList();
    writer.endCompound();
    writer.endCompound();
    // legacy sign (no front_text)
    writer.beginCompound();
    writer.name("id");
    writer.valueString("minecraft:sign");
    writer.name("x");
    writer.valueInt(6);
    writer.name("y");
    writer.valueInt(2);
    writer.name("z");
    writer.valueInt(3);
    writer.name("Color");
    writer.valueString("red");
    writer.name("Text1");
    writer.valueString("t1");
    writer.name("Text2");
    writer.valueString("t2");
    writer.name("Text3");
    writer.valueString("t3");
    writer.name("Text4");
    writer.valueString("t4");
    writer.endCompound();
    // skull
    writer.beginCompound();
    writer.name("id");
    writer.valueString("minecraft:skull");
    writer.name("x");
    writer.valueInt(7);
    writer.name("y");
    writer.valueInt(2);
    writer.name("z");
    writer.valueInt(3);
    writer.name("profile");
    writer.beginCompound();
    writer.name("id");
    writer.valueIntArray([1, 2, 3, 4]);
    writer.name("name");
    writer.valueString("Steve");
    writer.endCompound();
    writer.endCompound();
    // unregistered block-entity type
    writer.beginCompound();
    writer.name("id");
    writer.valueString("minecraft:chest");
    writer.name("x");
    writer.valueInt(8);
    writer.name("y");
    writer.valueInt(2);
    writer.name("z");
    writer.valueInt(3);
    writer.endCompound();
    writer.endList();

    writer.endCompound();
    writer.close();
    return writer.toUint8Array();
}

function loadTestChunk(): Chunk_1_18 {
    const data = MCAUtil.BLUENBT.read(buildChunkNbt(), CHUNK_1_18_DATA_TOKEN);
    return new Chunk_1_18(WORLD, data);
}

describe("Chunk_1_18", () => {
    it("reads chunk-status, times and data-version", () => {
        const chunk = loadTestChunk();
        expect(chunk.getDataVersion()).toBe(2860);
        expect(chunk.isGenerated()).toBe(true);
        expect(chunk.hasLightData()).toBe(true);
        expect(chunk.getInhabitedTime()).toBe(123);
        expect(chunk.getMinY(0, 0)).toBe(0);
        expect(chunk.getMaxY(0, 0)).toBe(15);
    });

    it("decodes block-states from the section palette", () => {
        const chunk = loadTestChunk();

        expect(chunk.getBlockState(1, 2, 3).getId().getFormatted()).toBe("minecraft:stone");

        const log = chunk.getBlockState(5, 0, 0);
        expect(log.getId().getFormatted()).toBe("minecraft:oak_log");
        expect(log.getProperties().get("axis")).toBe("x");

        const air = chunk.getBlockState(0, 0, 0);
        expect(air.getId().getFormatted()).toBe("minecraft:air");
        expect(air.isAir()).toBe(true);

        // outside any section
        expect(chunk.getBlockState(0, 100, 0)).toBe(BlockState.AIR);

        // palette-id out of range
        expect(chunk.getBlockState(15, 15, 15)).toBe(BlockState.MISSING);
    });

    it("decodes biomes from the section biome-palette (4x4x4 cells)", () => {
        const chunk = loadTestChunk();
        expect(chunk.getBiome(0, 0, 0)).toBe(PLAINS);
        expect(chunk.getBiome(12, 0, 0)).toBe(DESERT);
        expect(chunk.getBiome(15, 3, 3)).toBe(DESERT);
        expect(chunk.getBiome(0, 200, 0)).toBe(Biome.DEFAULT);
    });

    it("decodes block- and sky-light nibbles", () => {
        const chunk = loadTestChunk();
        const target = new LightData(-1, -1);

        chunk.getLightData(1, 2, 3, target);
        expect(target.getSkyLight()).toBe(7);
        expect(target.getBlockLight()).toBe(11);

        chunk.getLightData(0, 0, 0, target);
        expect(target.getSkyLight()).toBe(15);
        expect(target.getBlockLight()).toBe(0);

        // above the topmost section: full sky-light
        chunk.getLightData(0, 100, 0, target);
        expect(target.getSkyLight()).toBe(15);
        expect(target.getBlockLight()).toBe(0);

        // below the lowest section: darkness
        chunk.getLightData(0, -20, 0, target);
        expect(target.getSkyLight()).toBe(0);
        expect(target.getBlockLight()).toBe(0);
    });

    it("reads the packed heightmaps relative to the world min-y", () => {
        const chunk = loadTestChunk();
        expect(chunk.hasWorldSurfaceHeights()).toBe(true);
        expect(chunk.hasOceanFloorHeights()).toBe(true);
        // world min-y of the overworld dimension-type is -64
        expect(chunk.getWorldSurfaceY(0, 0)).toBe(100 - 64);
        expect(chunk.getWorldSurfaceY(3, 2)).toBe(150 - 64);
        expect(chunk.getOceanFloorY(0, 0)).toBe(70 - 64);
    });

    it("reports missing heightmaps", () => {
        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("DataVersion");
        writer.valueInt(2860);
        writer.endCompound();
        writer.close();

        const data = MCAUtil.BLUENBT.read(writer.toUint8Array(), CHUNK_1_18_DATA_TOKEN);
        const chunk = new Chunk_1_18(WORLD, data);
        expect(chunk.hasWorldSurfaceHeights()).toBe(false);
        expect(chunk.hasOceanFloorHeights()).toBe(false);
        expect(chunk.isGenerated()).toBe(false);
        expect(chunk.hasLightData()).toBe(false);
    });

    it("resolves block-entities through the type-registry", () => {
        const chunk = loadTestChunk();

        const sign = chunk.getBlockEntity(5, 2, 3);
        expect(sign).toBeInstanceOf(SignBlockEntity);
        expect(sign).not.toBeInstanceOf(LegacySignBlockEntity);
        const frontText = (sign as SignBlockEntity).getFrontText();
        expect(frontText?.isHasGlowingText()).toBe(true);
        expect(frontText?.getColor()).toBe("lime");
        expect(frontText?.getMessages()).toEqual(['"one"', '"two"', '"three"', '"four"']);

        const legacySign = chunk.getBlockEntity(6, 2, 3);
        expect(legacySign).toBeInstanceOf(LegacySignBlockEntity);
        const legacyText = (legacySign as LegacySignBlockEntity).getFrontText();
        expect(legacyText?.getColor()).toBe("red");
        expect(legacyText?.getMessages()).toEqual(["t1", "t2", "t3", "t4"]);

        const skull = chunk.getBlockEntity(7, 2, 3);
        expect(skull).toBeInstanceOf(SkullBlockEntity);
        const profile = (skull as SkullBlockEntity).getProfile();
        expect(profile?.getName()).toBe("Steve");
        expect(profile?.getId()).toBe("00000001-0000-0002-0000-000300000004");

        // unregistered types fall back to the base MCABlockEntity
        const chest = chunk.getBlockEntity(8, 2, 3);
        expect(chest).toBeInstanceOf(MCABlockEntity);
        expect(chest).not.toBeInstanceOf(SignBlockEntity);
        expect(chest).not.toBeInstanceOf(SkullBlockEntity);
        expect(chest?.getId().getFormatted()).toBe("minecraft:chest");

        expect(chunk.getBlockEntity(0, 0, 0)).toBeNull();

        const all: string[] = [];
        chunk.iterateBlockEntities((blockEntity) => all.push(blockEntity.getId().getFormatted()));
        expect(all).toHaveLength(4);
    });
});
