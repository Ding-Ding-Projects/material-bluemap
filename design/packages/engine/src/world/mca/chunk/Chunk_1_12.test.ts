import { describe, expect, it } from "vitest";
import { BlueNBT, NBTWriter } from "@material-bluemap/nbt";
import { BlockState } from "../../BlockState.js";
import { Biome } from "../../biome/Biome.js";
import { DimensionType } from "../../DimensionType.js";
import { LightData } from "../../LightData.js";
import type { MCAWorld } from "../MCAWorld.js";
import type { BlockIdMapper } from "../legacy/BlockIdMapper.js";
import {
    CHUNK_1_12_DATA_TOKEN,
    Chunk_1_12,
    registerChunk_1_12Schemas,
    type Chunk_1_12Data,
    type Chunk_1_12SectionData,
} from "./Chunk_1_12.js";

const WORLD = { getDimensionType: () => DimensionType.OVERWORLD } as unknown as MCAWorld;

function makeSectionData(y: number): Chunk_1_12SectionData {
    return {
        y,
        blocks: new Int8Array(4096),
        add: new Int8Array(0),
        data: new Int8Array(2048),
        blockLight: new Int8Array(2048),
        skyLight: new Int8Array(2048),
    };
}

function blockIndex(x: number, y: number, z: number): number {
    return (y & 0xf) * 256 + (z & 0xf) * 16 + (x & 0xf);
}

/** odd indices use the high ("large") nibble, even indices the low nibble */
function nibbleSet(array: Int8Array, index: number, value: number): void {
    const half = index >> 1;
    if ((index & 1) !== 0) array[half] = (array[half]! & 0x0f) | ((value & 0xf) << 4);
    else array[half] = (array[half]! & 0xf0) | (value & 0xf);
}

function setBlock(
    section: Chunk_1_12SectionData,
    x: number,
    y: number,
    z: number,
    id: number,
    meta: number,
): void {
    const i = blockIndex(x, y, z);
    section.blocks[i] = id & 0xff;
    if (id > 0xff) {
        if (section.add.length === 0) section.add = new Int8Array(2048);
        nibbleSet(section.add, i, (id >> 8) & 0xf);
    }
    nibbleSet(section.data, i, meta);
}

function makeData(
    sections: Chunk_1_12SectionData[] | null,
    options: {
        lightPopulated?: boolean;
        terrainPopulated?: boolean;
        biomes?: Int8Array;
        heightMap?: Int32Array;
    } = {},
): Chunk_1_12Data {
    return {
        dataVersion: 1343,
        level: {
            lightPopulated: options.lightPopulated ?? true,
            terrainPopulated: options.terrainPopulated ?? true,
            inhabitedTime: 0,
            sections,
            biomes: options.biomes ?? new Int8Array(256),
            heightMap: options.heightMap ?? new Int32Array(0),
        },
    };
}

/** records every mapper-call and returns a distinct state per (id, meta) */
function capturingMapper(): { mapper: BlockIdMapper; calls: string[] } {
    const calls: string[] = [];
    const mapper: BlockIdMapper = {
        get(id: number | string, numeralIdOrMeta: number, maybeMeta?: number): BlockState {
            calls.push(
                maybeMeta === undefined
                    ? id + ":" + numeralIdOrMeta
                    : id + "/" + numeralIdOrMeta + ":" + maybeMeta,
            );
            return BlockState.fromString("test:mapped");
        },
    };
    return { mapper, calls };
}

describe("Chunk_1_12", () => {
    it("decodes 8-bit block-ids and 4-bit meta nibbles at the right coordinates", () => {
        const section = makeSectionData(1);
        // indices 338 (even, low nibble) and 339 (odd, high nibble) share data-byte 169
        setBlock(section, 2, 17, 5, 5, 9);
        setBlock(section, 3, 17, 5, 7, 3);

        expect(blockIndex(2, 17, 5)).toBe(338);
        expect(blockIndex(3, 17, 5)).toBe(339);
        expect(section.data[169]! & 0xff).toBe(0x39); // high nibble 3, low nibble 9

        const { mapper, calls } = capturingMapper();
        const chunk = new Chunk_1_12(WORLD, makeData([section]), mapper);

        chunk.getBlockState(2, 17, 5);
        chunk.getBlockState(3, 17, 5);
        // also reachable through chunk-external coordinates (& 0xF wrapping)
        chunk.getBlockState(16 + 2, 17, -16 + 5);

        expect(calls).toEqual(["5:9", "7:3", "5:9"]);
    });

    it("extends block-ids above 255 with the Add nibble-array", () => {
        const section = makeSectionData(0);
        setBlock(section, 0, 0, 0, 0x123, 7); // 291
        setBlock(section, 1, 0, 0, 0xfff, 15); // 4095, odd index -> large half

        expect(section.blocks[0]! & 0xff).toBe(0x23); // low byte only
        expect(section.add[0]! & 0xff).toBe(0xf1); // high nibble f (index 1), low nibble 1 (index 0)

        const { mapper, calls } = capturingMapper();
        const chunk = new Chunk_1_12(WORLD, makeData([section]), mapper);

        chunk.getBlockState(0, 0, 0);
        chunk.getBlockState(1, 0, 0);

        expect(calls).toEqual(["291:7", "4095:15"]);
    });

    it("maps ids through the default legacy blockIds.json", () => {
        const section = makeSectionData(0);
        setBlock(section, 0, 0, 0, 1, 0); // stone
        setBlock(section, 1, 0, 0, 8, 3); // flowing water, level 3
        setBlock(section, 2, 0, 0, 0xfff, 0); // unmapped

        const chunk = new Chunk_1_12(WORLD, makeData([section]));

        expect(chunk.getBlockState(0, 0, 0).getId().getFormatted()).toBe("minecraft:stone");
        const water = chunk.getBlockState(1, 0, 0);
        expect(water.getId().getFormatted()).toBe("minecraft:water");
        expect(water.getProperties().get("level")).toBe("3");
        expect(chunk.getBlockState(2, 0, 0)).toBe(BlockState.MISSING);
        // id 0 -> the static AIR instance
        expect(chunk.getBlockState(3, 0, 0)).toBe(BlockState.AIR);
        // missing section -> AIR
        expect(chunk.getBlockState(0, 200, 0)).toBe(BlockState.AIR);

        expect(chunk.getBlockIdMeta(1, 0, 0)).toBe("8:3 null");
        expect(chunk.getBlockIdMeta(0, 200, 0)).toBe("0:0");
    });

    it("consults forge block-id mappings offered by the world", () => {
        const section = makeSectionData(0);
        setBlock(section, 0, 0, 0, 291, 7);
        setBlock(section, 1, 0, 0, 1, 0);

        const world = {
            getDimensionType: () => DimensionType.OVERWORLD,
            getForgeBlockIdMapping: (id: number) => (id === 291 ? "mod:custom_block" : null),
        } as unknown as MCAWorld;

        const { mapper, calls } = capturingMapper();
        const chunk = new Chunk_1_12(world, makeData([section]), mapper);

        chunk.getBlockState(0, 0, 0);
        chunk.getBlockState(1, 0, 0);

        expect(calls).toEqual(["mod:custom_block/291:7", "1:0"]);
        expect(chunk.getBlockIdMeta(0, 0, 0)).toBe("291:7 mod:custom_block");
    });

    it("maps the byte[256] Biomes through the legacy biome-table", () => {
        const biomes = new Int8Array(256);
        biomes[5 * 16 + 2] = 6; // swamp at x=2 z=5
        biomes[0 * 16 + 3] = -1; // 0xFF unsigned -> unknown id 255

        const chunk = new Chunk_1_12(WORLD, makeData([], { biomes }));

        expect(chunk.getBiome(2, 64, 5).getKey().getFormatted()).toBe("minecraft:swamp");
        expect(chunk.getBiome(3, 64, 0)).toBe(Biome.DEFAULT);
        // everything else is id 0 -> ocean
        expect(chunk.getBiome(0, 64, 0).getKey().getFormatted()).toBe("minecraft:ocean");
    });

    it("pads a short or missing Biomes-array (legacy Arrays.copyOf behavior)", () => {
        const chunk = new Chunk_1_12(WORLD, makeData([], { biomes: new Int8Array(0) }));
        expect(chunk.getBiome(15, 64, 15).getKey().getFormatted()).toBe("minecraft:ocean");

        const short = new Int8Array(2);
        short[0] = 6;
        const chunk2 = new Chunk_1_12(WORLD, makeData([], { biomes: short }));
        expect(chunk2.getBiome(0, 64, 0).getKey().getFormatted()).toBe("minecraft:swamp");
        expect(chunk2.getBiome(15, 64, 15).getKey().getFormatted()).toBe("minecraft:ocean");
    });

    it("decodes block- and sky-light nibbles", () => {
        const section = makeSectionData(0);
        const i = blockIndex(1, 2, 3);
        nibbleSet(section.skyLight, i, 12);
        nibbleSet(section.blockLight, i, 5);

        const chunk = new Chunk_1_12(WORLD, makeData([section]));
        const target = new LightData(-1, -1);

        expect(chunk.getLightData(1, 2, 3, target)).toBe(target);
        expect(target.getSkyLight()).toBe(12);
        expect(target.getBlockLight()).toBe(5);

        // missing section above -> full skylight
        chunk.getLightData(1, 200, 3, target);
        expect(target.getSkyLight()).toBe(15);
        expect(target.getBlockLight()).toBe(0);

        // below the lowest section -> no light
        chunk.getLightData(1, -5, 3, target);
        expect(target.getSkyLight()).toBe(0);
        expect(target.getBlockLight()).toBe(0);
    });

    it("keeps the legacy LightPopulated/TerrainPopulated semantics", () => {
        const lit = new Chunk_1_12(
            WORLD,
            makeData([], { lightPopulated: true, terrainPopulated: true }),
        );
        expect(lit.isGenerated()).toBe(true);
        expect(lit.hasLightData()).toBe(true);

        const unlit = new Chunk_1_12(
            WORLD,
            makeData([makeSectionData(0)], { lightPopulated: false }),
        );
        expect(unlit.isGenerated()).toBe(true);
        expect(unlit.hasLightData()).toBe(false);
        // legacy: no light-data -> LightData.SKY, even where sections exist
        const target = new LightData(-1, -1);
        unlit.getLightData(0, 0, 0, target);
        expect(target.getSkyLight()).toBe(15);
        expect(target.getBlockLight()).toBe(0);

        const ungenerated = new Chunk_1_12(WORLD, makeData([], { terrainPopulated: false }));
        expect(ungenerated.isGenerated()).toBe(false);
    });

    it("exposes the Level.HeightMap as world-surface heights (z*16+x order)", () => {
        const heightMap = new Int32Array(256);
        heightMap[(5 << 4) | 2] = 64;

        const chunk = new Chunk_1_12(WORLD, makeData([], { heightMap }));
        expect(chunk.hasWorldSurfaceHeights()).toBe(true);
        expect(chunk.getWorldSurfaceY(2, 5)).toBe(64);
        expect(chunk.getWorldSurfaceY(2 + 16, 5 - 16)).toBe(64);
        // 1.12 chunks have no ocean-floor heightmap
        expect(chunk.hasOceanFloorHeights()).toBe(false);

        const noHeights = new Chunk_1_12(WORLD, makeData([]));
        expect(noHeights.hasWorldSurfaceHeights()).toBe(false);
    });

    it("derives min/max y from the present sections (Chunk_1_13 layout)", () => {
        const chunk = new Chunk_1_12(WORLD, makeData([makeSectionData(1), makeSectionData(3)]));
        expect(chunk.getMinY(0, 0)).toBe(16);
        expect(chunk.getMaxY(0, 0)).toBe(63);

        const empty = new Chunk_1_12(WORLD, makeData(null));
        expect(empty.getMinY(0, 0)).toBe(0);
        expect(empty.getMaxY(0, 0)).toBe(15);
        expect(empty.getBlockState(0, 0, 0)).toBe(BlockState.AIR);
    });

    it("reads pre-flattening chunk-nbt through the BlueNBT schemas", () => {
        const section = makeSectionData(2);
        setBlock(section, 4, 33, 9, 1, 0); // stone in section y=2
        const biomes = new Int8Array(256);
        biomes[9 * 16 + 4] = 6;
        const heightMap = new Int32Array(256);
        heightMap[(9 << 4) | 4] = 34;

        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("DataVersion").valueInt(1343);
        writer.name("Level");
        writer.beginCompound();
        writer.name("LightPopulated").valueByte(1);
        writer.name("TerrainPopulated").valueByte(1);
        writer.name("InhabitedTime").valueLong(123n);
        writer.name("HeightMap").valueIntArray(heightMap);
        writer.name("Biomes").valueByteArray(biomes);
        writer.name("Sections").beginList(1);
        writer.beginCompound();
        writer.name("Y").valueByte(2);
        writer.name("Blocks").valueByteArray(section.blocks);
        writer.name("Data").valueByteArray(section.data);
        writer.name("BlockLight").valueByteArray(section.blockLight);
        writer.name("SkyLight").valueByteArray(section.skyLight);
        writer.endCompound();
        writer.endList();
        writer.endCompound();
        writer.endCompound();
        writer.close();

        const nbt = new BlueNBT();
        registerChunk_1_12Schemas(nbt);
        const data = nbt.read(writer.toUint8Array(), CHUNK_1_12_DATA_TOKEN);

        expect(data.dataVersion).toBe(1343);
        expect(data.level.lightPopulated).toBe(true);
        expect(data.level.terrainPopulated).toBe(true);
        expect(data.level.inhabitedTime).toBe(123);
        expect(data.level.sections).toHaveLength(1);

        const chunk = new Chunk_1_12(WORLD, data);
        expect(chunk.getDataVersion()).toBe(1343);
        expect(chunk.getInhabitedTime()).toBe(123);
        expect(chunk.getBlockState(4, 33, 9).getId().getFormatted()).toBe("minecraft:stone");
        expect(chunk.getBlockState(4, 32, 9)).toBe(BlockState.AIR);
        expect(chunk.getBiome(4, 64, 9).getKey().getFormatted()).toBe("minecraft:swamp");
        expect(chunk.getWorldSurfaceY(4, 9)).toBe(34);
        expect(chunk.getMinY(0, 0)).toBe(32);
        expect(chunk.getMaxY(0, 0)).toBe(47);
    });
});
