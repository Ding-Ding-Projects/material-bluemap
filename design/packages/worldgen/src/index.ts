// terrain
export { TerrainGenerator } from "./TerrainGenerator.js";
export { ChunkData, blockIndex, columnIndex } from "./chunk.js";
export { ValueNoise2D, clamp, smoothStep } from "./noise.js";
export { Random, hash3, hash32, mix32, seedLane, seedLanes } from "./random.js";

// biomes and blocks
export {
    ALL_BIOMES,
    BEACH,
    DESERT,
    FOREST,
    OCEAN,
    PLAINS,
    SNOWY_PEAKS,
    SNOWY_PLAINS,
    STONY_PEAKS,
    TAIGA,
    type BiomeDefinition,
} from "./biomes.js";
export { BlockRegistry, parseBlockState, type ParsedBlockState } from "./blocks.js";

// anvil output
export { ChunkNbtWriter } from "./chunkNbt.js";
export { buildLevelDatNbt, type LevelDatOptions } from "./levelDat.js";
export {
    blockStateBitWidth,
    ceilLog2,
    isDerivableBitWidth,
    packPadded,
} from "./packing.js";
export { RegionFileWriter, regionFileName, regionOf } from "./region.js";
export { ZipWriter, crc32, type ZipEntryOptions } from "./zip.js";

// world assembly
export {
    defaultWorldName,
    defaultZipName,
    generateWorld,
    zipWorld,
    type GenerateWorldOptions,
    type GeneratedWorld,
} from "./generateWorld.js";

// format constants
export {
    BIOMES_PER_SECTION,
    BLOCKS_PER_SECTION,
    DATA_VERSION,
    LEVEL_FORMAT_VERSION,
    MAX_SECTION,
    MAX_Y,
    MIN_SECTION,
    MIN_Y,
    SEA_LEVEL,
    VALUES_PER_HEIGHTMAP,
    VERSION_NAME,
    WORLD_HEIGHT,
} from "./version.js";
