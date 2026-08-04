/**
 * The pre-flattening Minecraft version this generator can also write for.
 *
 * DataVersion 1343 is release 1.12.2, the last version before "the flattening" replaced
 * numeric block ids with namespaced block-states. It is the exact threshold this
 * project's reader dispatches on: `MCAChunkLoader` selects `Chunk_1_12` for every chunk
 * whose DataVersion is <= 1343, so 1343 is both the newest legacy world and the only
 * value that proves the legacy branch was taken rather than the modern one.
 *
 * Everything in here differs from `version.ts` for one reason: 1.12.2 worlds are 256
 * blocks tall and start at y=0. There is no negative y, no `min_y` in a dimension-type
 * (the level.dat of that era carries no `WorldGenSettings` at all), and therefore no
 * chunk section below 0. The generator's terrain already lives inside 0..255 — see
 * `TerrainGenerator`'s MIN_TERRAIN_Y/MAX_TERRAIN_Y and the decoration bound above it —
 * so the same generated chunk can be written in either format without moving a block.
 * What the legacy writer drops are the four all-rock sections below y=0 that only the
 * 1.18+ world box has room for; see {@link LegacyChunkNbtWriter} for that projection.
 */

/** DataVersion of Minecraft 1.12.2, and the highest one `Chunk_1_12` claims */
export const LEGACY_DATA_VERSION = 1343;

/** the human-readable version name written into the legacy `level.dat` */
export const LEGACY_VERSION_NAME = "1.12.2";

/** lowest block-y of a 1.12.2 overworld, and the y of its bedrock floor */
export const LEGACY_MIN_Y = 0;

/** number of blocks between the world floor and the 1.12.2 build limit */
export const LEGACY_WORLD_HEIGHT = 256;

/** highest block-y of a 1.12.2 overworld */
export const LEGACY_MAX_Y = LEGACY_MIN_Y + LEGACY_WORLD_HEIGHT - 1;

/** lowest section-y of a 1.12.2 chunk */
export const LEGACY_MIN_SECTION = LEGACY_MIN_Y >> 4;

/** highest section-y of a 1.12.2 chunk */
export const LEGACY_MAX_SECTION = LEGACY_MAX_Y >> 4;

/**
 * Bytes in one of a legacy section's nibble-arrays (`Data`, `Add`, `BlockLight`,
 * `SkyLight`): two 4-bit values share every byte, so 4096 blocks need 2048 bytes.
 */
export const NIBBLES_PER_SECTION = 2048;
