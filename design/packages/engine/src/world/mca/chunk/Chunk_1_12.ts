import {
    BOOLEAN,
    BYTE,
    BYTE_ARRAY_ADAPTER,
    CollectionAdapter,
    INT,
    INT_ARRAY_ADAPTER,
    LONG_AS_NUMBER,
    TypeToken,
    type BlueNBT,
    type ObjectSchema,
} from "@worldlens/nbt";
import { BlockState } from "../../BlockState.js";
import { Chunk } from "../../Chunk.js";
import { Biome } from "../../biome/Biome.js";
import type { LightData } from "../../LightData.js";
import type { MCAWorld } from "../MCAWorld.js";
import { BlockIdConfig, type BlockIdMapper } from "../legacy/BlockIdMapper.js";
import { LegacyBiomes } from "../legacy/LegacyBiomes.js";

const BLOCKS_PER_SECTION = 16 * 16 * 16;
const NIBBLES_PER_SECTION = BLOCKS_PER_SECTION / 2;
const VALUES_PER_HEIGHTMAP = 16 * 16;

const EMPTY_BYTE_ARRAY = new Int8Array(0);
const EMPTY_INT_ARRAY = new Int32Array(0);

/**
 * The legacy forge block-id mappings read from level.dat ("FML"/"Registries"/
 * "minecraft:blocks"/"ids" — legacy MCAWorld#getForgeBlockIdMapping). The modern
 * MCAWorld does not carry these; if the world instance offers this method (duck-typed)
 * Chunk_1_12 consults it, otherwise only numeral-id mapping is used.
 */
export interface ForgeBlockIdMappings {
    getForgeBlockIdMapping(numeralId: number): string | null;
}

/** Java Arrays.copyOf for byte-arrays (zero-padded) */
function copyOf(array: Int8Array, length: number): Int8Array {
    const copy = new Int8Array(length);
    copy.set(array.subarray(0, Math.min(array.length, length)));
    return copy;
}

/**
 * Extracts the 4 bits of the left (largeHalf = <code>true</code>) or the right (largeHalf = <code>false</code>) side of the byte stored in <code>value</code>.<br>
 * The value is treated as an unsigned byte.
 */
function getByteHalf(value: number, largeHalf: boolean): number {
    value = value & 0xff;
    if (largeHalf) {
        value = value >> 4;
    }
    value = value & 0xf;
    return value;
}

/**
 * Pre-flattening (anvil, MC 1.12.2 and older, DataVersion <= 1343) chunk-format:
 * combined back from the legacy ChunkAnvil112 (v0.10.3-mc1.12) into the modern
 * chunk-architecture — same interface and internal layout as Chunk_1_13 / MCAChunk.
 *
 * Block-states are stored as Level.Sections[].Blocks (one byte per block) plus the
 * optional "Add" nibble-array (bits 8-11 of the block-id, for ids > 255) and the "Data"
 * nibble-array (4-bit meta), mapped to modern BlockStates through the legacy
 * {@link BlockIdConfig}; biomes as byte[256] Level.Biomes through the legacy
 * {@link LegacyBiomes} table.
 *
 * Legacy semantics kept: LightPopulated -> hasLightData (with the sky-light fallback
 * the modern getLightData provides, replacing the legacy LightData.SKY constant and the
 * legacy "ignoreMissingLightData" switch), TerrainPopulated -> isGenerated,
 * Level.HeightMap (int[256], z*16+x) -> world-surface heights; ocean-floor heights do
 * not exist pre-1.13 (inherited defaults).
 *
 * Wiring: the chunk-loader should select this format for dataVersion <= 1343 (the
 * legacy mca/Chunk.create threshold; in MCAChunkLoader's sorted loader-list terms:
 * an entry with minimum dataVersion 0 below a Chunk_1_13 entry raised to 1444).
 * Block-states read from this chunk-format additionally need the neighbor-derived
 * property-extensions, see legacy/extensions/BlockStateExtensions.applyLegacyExtensions.
 */
export class Chunk_1_12 extends Chunk {
    private readonly world: MCAWorld;
    private readonly dataVersion: number;

    private readonly blockIdMapper: BlockIdMapper;
    private readonly biomeIdMapper: LegacyBiomes;

    private readonly generated: boolean;
    private readonly hasLight: boolean;
    private readonly inhabitedTime: number;

    private readonly skyLight: number;

    // note: upstream-style field-names hasWorldSurfaceHeights would collide with the
    // method of the same name (JS can not have both on one class) -> hasWorldSurface
    private readonly hasWorldSurface: boolean;
    private readonly worldSurfaceHeights: Int32Array;

    private readonly sections: (Section | null)[];
    private readonly sectionMin: number;
    private readonly sectionMax: number;

    private readonly biomes: Int8Array;

    constructor(
        world: MCAWorld,
        data: Chunk_1_12Data,
        blockIdMapper?: BlockIdMapper,
        biomeIdMapper?: LegacyBiomes,
    ) {
        super();

        this.world = world;
        this.dataVersion = data.dataVersion;

        this.blockIdMapper = blockIdMapper ?? BlockIdConfig.loadDefault();
        this.biomeIdMapper = biomeIdMapper ?? LegacyBiomes.loadDefault();

        const forgeBlockIdMappings = hasForgeBlockIdMappings(world) ? world : null;

        const level = data.level;

        this.hasLight = level.lightPopulated;
        this.generated = level.terrainPopulated;
        this.inhabitedTime = level.inhabitedTime;

        const dimensionType = this.getWorld().getDimensionType();
        this.skyLight = dimensionType.hasSkylight() ? 15 : 0;

        this.worldSurfaceHeights = level.heightMap;
        this.hasWorldSurface = this.worldSurfaceHeights.length >= VALUES_PER_HEIGHTMAP;

        // load sections into a sectionMin-offset ordered array (Chunk_1_13 layout,
        // replacing the legacy fixed Section[32] array)
        const sectionsData = level.sections;
        if (sectionsData !== null && sectionsData.length > 0) {
            let min = 2147483647;
            let max = -2147483648;

            // find section min/max y
            for (const sectionData of sectionsData) {
                const y = sectionData.y;
                if (min > y) min = y;
                if (max < y) max = y;
            }

            // load sections into ordered array
            this.sections = new Array<Section | null>(1 + max - min).fill(null);
            for (const sectionData of sectionsData) {
                const section = new Section(sectionData, this.blockIdMapper, forgeBlockIdMappings);
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

        let biomes = level.biomes;

        if (biomes.length === 0) {
            biomes = new Int8Array(256);
        }

        if (biomes.length < 256) {
            biomes = copyOf(biomes, 256);
        }

        this.biomes = biomes;
    }

    getWorld(): MCAWorld {
        return this.world;
    }

    getDataVersion(): number {
        return this.dataVersion;
    }

    override isGenerated(): boolean {
        return this.generated;
    }

    override isLegacy(): boolean {
        return true;
    }

    override hasLightData(): boolean {
        return this.hasLight;
    }

    override getInhabitedTime(): number {
        return this.inhabitedTime;
    }

    override getBlockState(x: number, y: number, z: number): BlockState {
        const section = this.getSection(y >> 4);
        if (section === null) return BlockState.AIR;

        return section.getBlockState(x, y, z);
    }

    /** legacy debug-helper: the raw "blockId:meta forgeIdMapping" at the given position */
    getBlockIdMeta(x: number, y: number, z: number): string {
        const section = this.getSection(y >> 4);
        if (section === null) return "0:0";

        return section.getBlockIdMeta(x, y, z);
    }

    override getLightData(x: number, y: number, z: number, target: LightData): LightData {
        // legacy: if (!hasLight) return LightData.SKY
        if (!this.hasLight) return target.set(this.skyLight, 0);

        const sectionY = y >> 4;
        const section = this.getSection(sectionY);
        if (section === null)
            return sectionY < this.sectionMin ? target.set(0, 0) : target.set(this.skyLight, 0);

        return section.getLightData(x, y, z, target);
    }

    override getBiome(x: number, _y: number, z: number): Biome {
        const bx = x & 0xf; // Math.floorMod(pos.getX(), 16)
        const bz = z & 0xf;
        const biomeByteIndex = bz * 16 + bx;

        const biome = this.biomeIdMapper.forId(this.biomes[biomeByteIndex]! & 0xff);
        return biome !== null ? biome : Biome.DEFAULT;
    }

    override getMinY(_x: number, _z: number): number {
        return this.sectionMin * 16;
    }

    override getMaxY(_x: number, _z: number): number {
        return this.sectionMax * 16 + 15;
    }

    override hasWorldSurfaceHeights(): boolean {
        return this.hasWorldSurface;
    }

    override getWorldSurfaceY(x: number, z: number): number {
        return this.worldSurfaceHeights[((z & 0xf) << 4) | (x & 0xf)]!;
    }

    // hasOceanFloorHeights/getOceanFloorY: pre-1.13 chunks store no ocean-floor
    // heightmap -> inherited Chunk defaults (false / 0)

    private getSection(y: number): Section | null {
        y -= this.sectionMin;
        if (y < 0 || y >= this.sections.length) return null;
        return this.sections[y]!;
    }
}

function hasForgeBlockIdMappings(world: unknown): world is ForgeBlockIdMappings {
    return (
        typeof world === "object" &&
        world !== null &&
        typeof (world as ForgeBlockIdMappings).getForgeBlockIdMapping === "function"
    );
}

/** upstream: legacy ChunkAnvil112.Section */
class Section {
    private readonly sectionY: number;
    private blocks: Int8Array;
    private readonly add: Int8Array;
    private blockLight: Int8Array;
    private skyLight: Int8Array;
    private data: Int8Array;

    private readonly blockIdMapper: BlockIdMapper;
    private readonly forgeBlockIdMappings: ForgeBlockIdMappings | null;

    constructor(
        sectionData: Chunk_1_12SectionData,
        blockIdMapper: BlockIdMapper,
        forgeBlockIdMappings: ForgeBlockIdMappings | null,
    ) {
        this.sectionY = sectionData.y;
        this.blocks = sectionData.blocks;
        this.add = sectionData.add;
        this.blockLight = sectionData.blockLight;
        this.skyLight = sectionData.skyLight;
        this.data = sectionData.data;

        if (this.blocks.length < BLOCKS_PER_SECTION)
            this.blocks = copyOf(this.blocks, BLOCKS_PER_SECTION);
        if (this.blockLight.length < NIBBLES_PER_SECTION)
            this.blockLight = copyOf(this.blockLight, NIBBLES_PER_SECTION);
        if (this.skyLight.length < NIBBLES_PER_SECTION)
            this.skyLight = copyOf(this.skyLight, NIBBLES_PER_SECTION);
        if (this.data.length < NIBBLES_PER_SECTION)
            this.data = copyOf(this.data, NIBBLES_PER_SECTION);

        this.blockIdMapper = blockIdMapper;
        this.forgeBlockIdMappings = forgeBlockIdMappings;
    }

    getSectionY(): number {
        return this.sectionY;
    }

    getBlockState(x: number, y: number, z: number): BlockState {
        x = x & 0xf; // Math.floorMod(pos.getX(), 16)
        y = y & 0xf;
        z = z & 0xf;
        const blockByteIndex = y * 256 + z * 16 + x;
        const blockHalfByteIndex = blockByteIndex >> 1; // blockByteIndex / 2
        const largeHalf = (blockByteIndex & 0x1) !== 0; // (blockByteIndex % 2) == 0

        let blockId = this.blocks[blockByteIndex]! & 0xff;

        if (this.add.length > blockHalfByteIndex) {
            blockId = blockId | (getByteHalf(this.add[blockHalfByteIndex]!, largeHalf) << 8);
        }

        const blockData = getByteHalf(this.data[blockHalfByteIndex]!, largeHalf);

        const forgeIdMapping = this.forgeBlockIdMappings?.getForgeBlockIdMapping(blockId) ?? null;
        if (forgeIdMapping !== null) {
            return this.blockIdMapper.get(forgeIdMapping, blockId, blockData);
        } else {
            return this.blockIdMapper.get(blockId, blockData);
        }
    }

    getBlockIdMeta(x: number, y: number, z: number): string {
        x = x & 0xf; // Math.floorMod(pos.getX(), 16)
        y = y & 0xf;
        z = z & 0xf;
        const blockByteIndex = y * 256 + z * 16 + x;
        const blockHalfByteIndex = blockByteIndex >> 1; // blockByteIndex / 2
        const largeHalf = (blockByteIndex & 0x1) !== 0; // (blockByteIndex % 2) == 0

        let blockId = this.blocks[blockByteIndex]! & 0xff;

        if (this.add.length > blockHalfByteIndex) {
            blockId = blockId | (getByteHalf(this.add[blockHalfByteIndex]!, largeHalf) << 8);
        }

        const blockData = getByteHalf(this.data[blockHalfByteIndex]!, largeHalf);
        const forgeIdMapping = this.forgeBlockIdMappings?.getForgeBlockIdMapping(blockId) ?? null;

        return blockId + ":" + blockData + " " + forgeIdMapping;
    }

    getLightData(x: number, y: number, z: number, target: LightData): LightData {
        x = x & 0xf; // Math.floorMod(pos.getX(), 16)
        y = y & 0xf;
        z = z & 0xf;
        const blockByteIndex = y * 256 + z * 16 + x;
        const blockHalfByteIndex = blockByteIndex >> 1; // blockByteIndex / 2
        const largeHalf = (blockByteIndex & 0x1) !== 0; // (blockByteIndex % 2) == 0

        const blockLight = getByteHalf(this.blockLight[blockHalfByteIndex]!, largeHalf);
        const skyLight = getByteHalf(this.skyLight[blockHalfByteIndex]!, largeHalf);

        return target.set(skyLight, blockLight);
    }
}

// -- nbt-data schema (replaces the legacy CompoundTag lookups / the modern
// -- @NBTName-annotated Data classes) --

/** upstream-analog: Chunk_1_12.SectionData (legacy: the "Sections" list-entries) */
export interface Chunk_1_12SectionData {
    y: number;
    blocks: Int8Array;
    add: Int8Array;
    data: Int8Array;
    blockLight: Int8Array;
    skyLight: Int8Array;
}

/** upstream-analog: Chunk_1_12.Level (legacy: the chunk-tag's "Level" compound) */
export interface Chunk_1_12Level {
    lightPopulated: boolean;
    terrainPopulated: boolean;
    inhabitedTime: number;
    sections: Chunk_1_12SectionData[] | null;
    biomes: Int8Array;
    heightMap: Int32Array;
}

/** upstream-analog: Chunk_1_12.Data (MCAChunk.Data + the "Level" compound) */
export interface Chunk_1_12Data {
    dataVersion: number;
    level: Chunk_1_12Level;
}

export const CHUNK_1_12_SECTION_TOKEN = TypeToken.of<Chunk_1_12SectionData>(
    "bluemap:world/mca/chunk/Chunk_1_12.SectionData",
);
export const CHUNK_1_12_LEVEL_TOKEN = TypeToken.of<Chunk_1_12Level>(
    "bluemap:world/mca/chunk/Chunk_1_12.Level",
);
export const CHUNK_1_12_DATA_TOKEN = TypeToken.of<Chunk_1_12Data>(
    "bluemap:world/mca/chunk/Chunk_1_12.Data",
);

export const CHUNK_1_12_SECTION_SCHEMA: ObjectSchema<Chunk_1_12SectionData> = {
    create: () => ({
        y: 0,
        blocks: EMPTY_BYTE_ARRAY,
        add: EMPTY_BYTE_ARRAY,
        data: EMPTY_BYTE_ARRAY,
        blockLight: EMPTY_BYTE_ARRAY,
        skyLight: EMPTY_BYTE_ARRAY,
    }),
    fields: {
        y: { names: ["Y"], type: BYTE },
        blocks: { names: ["Blocks"], type: BYTE_ARRAY_ADAPTER },
        add: { names: ["Add"], type: BYTE_ARRAY_ADAPTER },
        data: { names: ["Data"], type: BYTE_ARRAY_ADAPTER },
        blockLight: { names: ["BlockLight"], type: BYTE_ARRAY_ADAPTER },
        skyLight: { names: ["SkyLight"], type: BYTE_ARRAY_ADAPTER },
    },
};

export const CHUNK_1_12_LEVEL_SCHEMA: ObjectSchema<Chunk_1_12Level> = {
    create: () => ({
        lightPopulated: false,
        terrainPopulated: false,
        inhabitedTime: 0,
        sections: null,
        biomes: EMPTY_BYTE_ARRAY,
        heightMap: EMPTY_INT_ARRAY,
    }),
    fields: {
        lightPopulated: { names: ["LightPopulated"], type: BOOLEAN },
        terrainPopulated: { names: ["TerrainPopulated"], type: BOOLEAN },
        inhabitedTime: { names: ["InhabitedTime"], type: LONG_AS_NUMBER },
        sections: {
            names: ["Sections"],
            type: (nbt: BlueNBT) => new CollectionAdapter(nbt, CHUNK_1_12_SECTION_TOKEN),
        },
        biomes: { names: ["Biomes"], type: BYTE_ARRAY_ADAPTER },
        heightMap: { names: ["HeightMap"], type: INT_ARRAY_ADAPTER },
    },
};

export const CHUNK_1_12_DATA_SCHEMA: ObjectSchema<Chunk_1_12Data> = {
    create: () => ({
        dataVersion: 0,
        level: CHUNK_1_12_LEVEL_SCHEMA.create(),
    }),
    fields: {
        dataVersion: { names: ["DataVersion"], type: INT },
        level: { names: ["Level"], type: CHUNK_1_12_LEVEL_TOKEN },
    },
};

/**
 * Registers the Chunk_1_12 nbt-schemas on the given BlueNBT instance; afterwards
 * chunk-data can be read with {@code nbt.read(data, CHUNK_1_12_DATA_TOKEN)}.
 */
export function registerChunk_1_12Schemas(nbt: BlueNBT): void {
    nbt.register(CHUNK_1_12_SECTION_TOKEN, CHUNK_1_12_SECTION_SCHEMA);
    nbt.register(CHUNK_1_12_LEVEL_TOKEN, CHUNK_1_12_LEVEL_SCHEMA);
    nbt.register(CHUNK_1_12_DATA_TOKEN, CHUNK_1_12_DATA_SCHEMA);
}
