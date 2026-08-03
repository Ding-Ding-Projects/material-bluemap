/**
 * The Minecraft version this generator writes for.
 *
 * DataVersion 3700 is release 1.20.4. It matters in three places: the chunk-format
 * dispatch (>= 2844 selects the 1.18+ `sections`/`block_states` layout), the world
 * geometry below, and the block ids used in blocks.ts (1.20.3 renamed
 * `minecraft:grass` to `minecraft:short_grass`, for example).
 */
export const DATA_VERSION = 3700;

/** the human-readable version name written into `level.dat`'s Version block */
export const VERSION_NAME = "1.20.4";

/** the `version` field of an anvil `level.dat` */
export const LEVEL_FORMAT_VERSION = 19133;

/** lowest block-y of the overworld, and the y of the bedrock floor */
export const MIN_Y = -64;

/** number of blocks between the world floor and the build limit */
export const WORLD_HEIGHT = 384;

/** highest block-y of the overworld */
export const MAX_Y = MIN_Y + WORLD_HEIGHT - 1;

/** y of the water surface: every column generated below this is flooded */
export const SEA_LEVEL = 63;

/** lowest section-y (`MIN_Y >> 4`) */
export const MIN_SECTION = MIN_Y >> 4;

/** highest section-y (`MAX_Y >> 4`) */
export const MAX_SECTION = MAX_Y >> 4;

/** blocks in one 16x16x16 section */
export const BLOCKS_PER_SECTION = 4096;

/** 4x4x4 biome cells in one section */
export const BIOMES_PER_SECTION = 64;

/** values in one heightmap */
export const VALUES_PER_HEIGHTMAP = 256;
