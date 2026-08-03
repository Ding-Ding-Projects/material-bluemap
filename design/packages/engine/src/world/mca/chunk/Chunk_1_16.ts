import {
    BYTE_ARRAY_ADAPTER,
    INT,
    INT_ARRAY_ADAPTER,
    LONG_ARRAY_ADAPTER,
    LONG_AS_NUMBER,
    TypeToken,
    listOf,
    type BlueNBT,
    type ObjectSchema,
} from "@material-bluemap/nbt";
import { Key } from "@material-bluemap/shared";
import { BlockState } from "../../BlockState.js";
import type { DimensionType } from "../../DimensionType.js";
import type { LightData } from "../../LightData.js";
import { Biome } from "../../biome/Biome.js";
import type { BlockEntity } from "../../BlockEntity.js";
import { ceilLog2, getByteHalf, noFloodWarning } from "../MCAUtil.js";
import type { MCAWorld } from "../MCAWorld.js";
import { PackedIntArrayAccess } from "../PackedIntArrayAccess.js";
import { BLOCK_STATE_TOKEN } from "../data/BlockStateDeserializer.js";
import { KEY_TOKEN } from "../data/KeyDeserializer.js";
import { LenientBlockEntityArrayDeserializer } from "../data/LenientBlockEntityArrayDeserializer.js";
import {
    BLOCKS_PER_SECTION,
    EMPTY_BLOCKSTATE_ARRAY,
    EMPTY_BLOCK_ENTITIES_ARRAY,
    EMPTY_BYTE_ARRAY,
    EMPTY_INT_ARRAY,
    EMPTY_LONG_ARRAY,
    MCAChunk,
    MCAChunkData,
    MCA_CHUNK_DATA_FIELDS,
    VALUES_PER_HEIGHTMAP,
} from "./MCAChunk.js";

const STATUS_EMPTY = new Key("minecraft", "empty");
const STATUS_FULL = new Key("minecraft", "full");

export const CHUNK_1_16_DATA_TOKEN: TypeToken<Chunk_1_16_Data> = TypeToken.of("Chunk_1_16.Data");
const LEVEL_TOKEN: TypeToken<Level> = TypeToken.of("Chunk_1_16.Level");
const HEIGHTMAPS_TOKEN: TypeToken<HeightmapsData> = TypeToken.of("Chunk_1_16.HeightmapsData");
const SECTION_TOKEN: TypeToken<SectionData> = TypeToken.of("Chunk_1_16.SectionData");

export class Chunk_1_16 extends MCAChunk {
    private readonly generated: boolean;
    private readonly lightData: boolean;
    private readonly inhabitedTime: number;

    private readonly skyLight: number;

    // note: upstream fields hasWorldSurfaceHeights/hasOceanFloorHeights are renamed
    // (…Present) since JS can not have a field and a method of the same name on one class
    private readonly worldSurfaceHeightsPresent: boolean;
    private readonly worldSurfaceHeights: PackedIntArrayAccess;
    private readonly oceanFloorHeightsPresent: boolean;
    private readonly oceanFloorHeights: PackedIntArrayAccess;

    private readonly sections: (Section | undefined)[];
    private readonly sectionMin: number;
    private readonly sectionMax: number;

    private readonly biomes: Int32Array;
    private readonly blockEntities: Map<number, BlockEntity>;

    constructor(world: MCAWorld, data: Chunk_1_16_Data) {
        super(world, data);

        const level = data.level;

        this.generated = !STATUS_EMPTY.equals(level.status);
        this.lightData = STATUS_FULL.equals(level.status);
        this.inhabitedTime = level.inhabitedTime;

        const dimensionType: DimensionType = this.getWorld().getDimensionType();
        this.skyLight = dimensionType.hasSkylight() ? 15 : 0;

        const worldHeight = dimensionType.getHeight();
        const bitsPerHeightmapElement = ceilLog2(worldHeight + 1);

        this.worldSurfaceHeights = new PackedIntArrayAccess(
            bitsPerHeightmapElement,
            level.heightmaps.worldSurface,
        );
        this.oceanFloorHeights = new PackedIntArrayAccess(
            bitsPerHeightmapElement,
            level.heightmaps.oceanFloor,
        );

        this.worldSurfaceHeightsPresent =
            this.worldSurfaceHeights.isCorrectSize(VALUES_PER_HEIGHTMAP);
        this.oceanFloorHeightsPresent = this.oceanFloorHeights.isCorrectSize(VALUES_PER_HEIGHTMAP);

        this.biomes = level.biomes;

        const sectionsData = level.sections;
        if (sectionsData != null && sectionsData.length > 0) {
            let min = 2147483647;
            let max = -2147483648;

            // find section min/max y
            for (const sectionData of sectionsData) {
                const y = sectionData.getY();
                if (min > y) min = y;
                if (max < y) max = y;
            }

            // load sections into ordered array
            this.sections = new Array<Section | undefined>(1 + max - min);
            for (const sectionData of sectionsData) {
                const section = new Section(sectionData);
                const y = section.getSectionY();

                if (min > y) min = y;
                if (max < y) max = y;

                this.sections[y - min] = section;
            }

            this.sectionMin = min;
            this.sectionMax = max;
        } else {
            this.sections = [];
            this.sectionMin = 0;
            this.sectionMax = 0;
        }

        // load block-entities
        this.blockEntities = new Map();
        for (let i = 0; i < level.blockEntities.length; i++) {
            const be = level.blockEntities[i];
            if (be == null) continue;

            const hash = be.getY() * 256 + (((be.getX() & 0xf) << 4) | (be.getZ() & 0xf));
            this.blockEntities.set(hash, be);
        }
    }

    override isGenerated(): boolean {
        return this.generated;
    }

    override hasLightData(): boolean {
        return this.lightData;
    }

    override getInhabitedTime(): number {
        return this.inhabitedTime;
    }

    override getBlockState(x: number, y: number, z: number): BlockState {
        const section = this.getSection(y >> 4);
        if (section == null) return BlockState.AIR;

        return section.getBlockState(x, y, z);
    }

    override getBiome(x: number, y: number, z: number): Biome {
        if (this.biomes.length < 16) return Biome.DEFAULT;

        let biomeIntIndex = ((y & 0b1100) << 2) | (z & 0b1100) | ((x & 0b1100) >> 2);

        // shift y up/down if not in range
        if (biomeIntIndex >= this.biomes.length)
            biomeIntIndex -= (((biomeIntIndex - this.biomes.length) >> 4) + 1) * 16;
        if (biomeIntIndex < 0) biomeIntIndex -= (biomeIntIndex >> 4) * 16;

        const biome = this.getWorld().getDataPack().getBiome(this.biomes[biomeIntIndex]!);
        return biome != null ? biome : Biome.DEFAULT;
    }

    override getLightData(x: number, y: number, z: number, target: LightData): LightData {
        if (!this.lightData) return target.set(this.skyLight, 0);

        const sectionY = y >> 4;
        const section = this.getSection(sectionY);
        if (section == null)
            return sectionY < this.sectionMin ? target.set(0, 0) : target.set(this.skyLight, 0);

        return section.getLightData(x, y, z, target);
    }

    override getMinY(_x: number, _z: number): number {
        return this.sectionMin * 16;
    }

    override getMaxY(_x: number, _z: number): number {
        return this.sectionMax * 16 + 15;
    }

    override hasWorldSurfaceHeights(): boolean {
        return this.worldSurfaceHeightsPresent;
    }

    override getWorldSurfaceY(x: number, z: number): number {
        return this.worldSurfaceHeights.get(((z & 0xf) << 4) | (x & 0xf));
    }

    override hasOceanFloorHeights(): boolean {
        return this.oceanFloorHeightsPresent;
    }

    override getOceanFloorY(x: number, z: number): number {
        return this.oceanFloorHeights.get(((z & 0xf) << 4) | (x & 0xf));
    }

    override getBlockEntity(x: number, y: number, z: number): BlockEntity | null {
        return this.blockEntities.get(y * 256 + (((x & 0xf) << 4) | (z & 0xf))) ?? null;
    }

    override iterateBlockEntities(consumer: (blockEntity: BlockEntity) => void): void {
        this.blockEntities.forEach(consumer);
    }

    private getSection(y: number): Section | null {
        y -= this.sectionMin;
        if (y < 0 || y >= this.sections.length) return null;
        return this.sections[y] ?? null;
    }
}

/** upstream: Chunk_1_16.Section */
class Section {
    private readonly sectionY: number;
    private readonly blockPalette: BlockState[];
    private readonly blocks: PackedIntArrayAccess;
    private readonly blockLight: Int8Array;
    private readonly skyLight: Int8Array;

    constructor(sectionData: SectionData) {
        this.sectionY = sectionData.y;

        this.blockPalette = sectionData.palette;
        this.blocks = new PackedIntArrayAccess(sectionData.blockStates, BLOCKS_PER_SECTION);

        this.blockLight = sectionData.getBlockLight();
        this.skyLight = sectionData.getSkyLight();
    }

    getBlockState(x: number, y: number, z: number): BlockState {
        if (this.blockPalette.length === 1) return this.blockPalette[0]!;
        if (this.blockPalette.length === 0) return BlockState.AIR;

        const id = this.blocks.get(((y & 0xf) << 8) | ((z & 0xf) << 4) | (x & 0xf));
        if (id >= this.blockPalette.length) {
            noFloodWarning(
                "palette-warning",
                "Got block-palette id " +
                    id +
                    " but palette has size of " +
                    this.blockPalette.length +
                    "! (Future occasions of this error will not be logged)",
            );
            return BlockState.MISSING;
        }

        return this.blockPalette[id]!;
    }

    getLightData(x: number, y: number, z: number, target: LightData): LightData {
        if (this.blockLight.length === 0 && this.skyLight.length === 0) return target.set(0, 0);

        const blockByteIndex = ((y & 0xf) << 8) | ((z & 0xf) << 4) | (x & 0xf);
        const blockHalfByteIndex = blockByteIndex >> 1; // blockByteIndex / 2
        const largeHalf = (blockByteIndex & 0x1) !== 0; // (blockByteIndex % 2) == 0

        return target.set(
            this.skyLight.length > blockHalfByteIndex
                ? getByteHalf(this.skyLight[blockHalfByteIndex]!, largeHalf)
                : 0,
            this.blockLight.length > blockHalfByteIndex
                ? getByteHalf(this.blockLight[blockHalfByteIndex]!, largeHalf)
                : 0,
        );
    }

    getSectionY(): number {
        return this.sectionY;
    }
}

/** upstream: Chunk_1_16.Data */
export class Chunk_1_16_Data extends MCAChunkData {
    level: Level = new Level(); // @NBTName("Level")

    getLevel(): Level {
        return this.level;
    }
}

/** upstream: Chunk_1_16.Level */
class Level {
    status: Key = STATUS_EMPTY; // @NBTName("Status")
    inhabitedTime = 0; // @NBTName("InhabitedTime")
    heightmaps: HeightmapsData = new HeightmapsData(); // @NBTName("Heightmaps")
    sections: SectionData[] | null = null; // @NBTName("Sections")
    biomes: Int32Array = EMPTY_INT_ARRAY; // @NBTName("Biomes")
    blockEntities: (BlockEntity | null)[] = EMPTY_BLOCK_ENTITIES_ARRAY; // @NBTName("TileEntities") @NBTDeserializer(LenientBlockEntityArrayDeserializer)
}

/** upstream: Chunk_1_16.HeightmapsData */
class HeightmapsData {
    worldSurface: BigInt64Array = EMPTY_LONG_ARRAY; // @NBTName("WORLD_SURFACE")
    oceanFloor: BigInt64Array = EMPTY_LONG_ARRAY; // @NBTName("OCEAN_FLOOR")
}

/** upstream: Chunk_1_16.SectionData */
class SectionData {
    y = 0; // @NBTName("Y")
    blockLight: Int8Array = EMPTY_BYTE_ARRAY; // @NBTName("BlockLight")
    skyLight: Int8Array = EMPTY_BYTE_ARRAY; // @NBTName("SkyLight")
    palette: BlockState[] = EMPTY_BLOCKSTATE_ARRAY; // @NBTName("Palette")
    blockStates: BigInt64Array = EMPTY_LONG_ARRAY; // @NBTName("BlockStates")

    getY(): number {
        return this.y;
    }

    getBlockLight(): Int8Array {
        return this.blockLight;
    }

    getSkyLight(): Int8Array {
        return this.skyLight;
    }
}

const HEIGHTMAPS_SCHEMA: ObjectSchema<HeightmapsData> = {
    create: () => new HeightmapsData(),
    fields: {
        worldSurface: { names: ["WORLD_SURFACE"], type: LONG_ARRAY_ADAPTER },
        oceanFloor: { names: ["OCEAN_FLOOR"], type: LONG_ARRAY_ADAPTER },
    },
};

const SECTION_SCHEMA: ObjectSchema<SectionData> = {
    create: () => new SectionData(),
    fields: {
        y: { names: ["Y"], type: INT },
        blockLight: { names: ["BlockLight"], type: BYTE_ARRAY_ADAPTER },
        skyLight: { names: ["SkyLight"], type: BYTE_ARRAY_ADAPTER },
        palette: { names: ["Palette"], type: listOf(BLOCK_STATE_TOKEN) },
        blockStates: { names: ["BlockStates"], type: LONG_ARRAY_ADAPTER },
    },
};

const LEVEL_SCHEMA: ObjectSchema<Level> = {
    create: () => new Level(),
    fields: {
        status: { names: ["Status"], type: KEY_TOKEN },
        inhabitedTime: { names: ["InhabitedTime"], type: LONG_AS_NUMBER },
        heightmaps: { names: ["Heightmaps"], type: HEIGHTMAPS_TOKEN },
        sections: { names: ["Sections"], type: listOf(SECTION_TOKEN) },
        biomes: { names: ["Biomes"], type: INT_ARRAY_ADAPTER },
        blockEntities: {
            names: ["TileEntities"],
            type: (nbt: BlueNBT) => new LenientBlockEntityArrayDeserializer(nbt),
        },
    },
};

const DATA_SCHEMA: ObjectSchema<Chunk_1_16_Data> = {
    create: () => new Chunk_1_16_Data(),
    fields: {
        ...MCA_CHUNK_DATA_FIELDS,
        level: { names: ["Level"], type: LEVEL_TOKEN },
    },
};

export function registerChunk_1_16Schemas(nbt: BlueNBT): void {
    nbt.register(HEIGHTMAPS_TOKEN, HEIGHTMAPS_SCHEMA);
    nbt.register(SECTION_TOKEN, SECTION_SCHEMA);
    nbt.register(LEVEL_TOKEN, LEVEL_SCHEMA);
    nbt.register(CHUNK_1_16_DATA_TOKEN, DATA_SCHEMA);
}
