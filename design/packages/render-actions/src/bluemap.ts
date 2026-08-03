/**
 * The BlueMap layout constants and grid arithmetic this package shards against.
 *
 * Every number here is read out of the BlueMap sources vendored at `vendor/BlueMap`
 * (version 5.22-27) and confirmed against a real render of a generated world. The
 * confirming artefact is the `settings.json` BlueMap writes beside the tiles:
 *
 *     {"hires":{"tileSize":[32,32],"scale":[1,1],"translate":[2,2]},
 *      "lowres":{"tileSize":[500,500],"lodFactor":5,"lodCount":3}, ...}
 *
 * The `translate` of 2 is the one that matters most and is the easiest to miss:
 * the hires tile grid is NOT anchored at block 0. `BmMap` builds it as
 * `new Grid(settings.getHiresTileSize(), 2)`, so hires tile column `cx` covers
 * blocks `32*cx + 2` through `32*cx + 33`. Shard boundaries that ignore that
 * offset cut tiles in half, and two shards then write different halves of the
 * same tile file. See docs/render-in-actions.md.
 */

/** upstream: `MapConfig.hiresTileSize` */
export const HIRES_TILE_SIZE = 32;

/** upstream: `new Grid(settings.getHiresTileSize(), 2)` in `BmMap` */
export const HIRES_TILE_OFFSET = 2;

/** upstream: `MapConfig.lowresTileSize` */
export const LOWRES_TILE_SIZE = 500;

/** upstream: `MapConfig.lodFactor` */
export const LOD_FACTOR = 5;

/** upstream: `MapConfig.lodCount` */
export const LOD_COUNT = 3;

/** blocks along one axis of a chunk */
export const CHUNK_BLOCKS = 16;

/** chunks along one axis of an anvil region file */
export const CHUNKS_PER_REGION_AXIS = 32;

/** blocks along one axis of an anvil region file */
export const REGION_BLOCKS = CHUNK_BLOCKS * CHUNKS_PER_REGION_AXIS;

/** chunk slots in one anvil region file */
export const CHUNKS_PER_REGION = CHUNKS_PER_REGION_AXIS * CHUNKS_PER_REGION_AXIS;

/** GitHub refuses a workflow run whose matrix expands past this many jobs. */
export const GITHUB_MATRIX_JOB_LIMIT = 256;

/** An inclusive range of blocks along one axis, open at either end. */
export interface BlockRange {
    /** inclusive lower bound, or null for unbounded */
    min: number | null;
    /** inclusive upper bound, or null for unbounded */
    max: number | null;
}

/** An inclusive integer range that is definitely bounded at both ends. */
export interface ClosedRange {
    min: number;
    max: number;
}

/**
 * upstream: `Grid#getCellX` — `Math.floorDiv(posX - offset, gridSize)`.
 * The hires tile column a block x-coordinate falls in.
 */
export function hiresTileOfBlock(block: number): number {
    return Math.floor((block - HIRES_TILE_OFFSET) / HIRES_TILE_SIZE);
}

/** upstream: `Grid#getCellMinX` — the lowest block coordinate inside a hires tile column. */
export function hiresTileMinBlock(tile: number): number {
    return tile * HIRES_TILE_SIZE + HIRES_TILE_OFFSET;
}

/** The highest block coordinate inside a hires tile column. */
export function hiresTileMaxBlock(tile: number): number {
    return hiresTileMinBlock(tile) + HIRES_TILE_SIZE - 1;
}

/** Whether a block coordinate is the first block of a hires tile column. */
export function isHiresTileBoundary(block: number): boolean {
    return hiresTileMinBlock(hiresTileOfBlock(block)) === block;
}

/**
 * The lowest hires tile boundary at or above `block`.
 *
 * A shard cut placed here is guaranteed to fall between two hires tiles rather than
 * through one, which is what makes the hires half of the merge a plain disjoint union.
 */
export function alignBoundaryUp(block: number): number {
    return hiresTileMinBlock(Math.ceil((block - HIRES_TILE_OFFSET) / HIRES_TILE_SIZE));
}

/**
 * upstream: `Grid#getCellX` for the lowres grid, which has offset 0.
 * The lod-1 lowres tile a block coordinate falls in.
 */
export function lowresTileOfBlock(block: number): number {
    return Math.floor(block / LOWRES_TILE_SIZE);
}

/** The block extent of one anvil region along one axis. */
export function regionBlockRange(region: number): ClosedRange {
    return { min: region * REGION_BLOCKS, max: region * REGION_BLOCKS + REGION_BLOCKS - 1 };
}

/**
 * The number of blocks a range covers, or null when the range is unbounded.
 * An unbounded shard has no finite area, which is exactly why work estimates are
 * derived from the world's regions rather than from the shard's mask.
 */
export function rangeLength(range: BlockRange): number | null {
    if (range.min === null || range.max === null) return null;
    return range.max - range.min + 1;
}
