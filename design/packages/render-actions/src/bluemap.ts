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

/**
 * How many sequential wave jobs the render workflow provides.
 *
 * A matrix caps at 256 entries, so a world needing more shards than that is rendered in
 * waves: each wave is one matrix of at most 256, and wave N+1 `needs:` wave N. The
 * workflow has to declare its wave jobs statically, because Actions has no way to
 * generate a variable number of jobs, so this is how many it declares.
 *
 * This used to be six - one doubling ago, `render-world.yml` really did hardcode
 * `wave1`..`wave6` with nothing tying that number to this constant, so a plan needing a
 * seventh wave failed with no route past it. `.github/workflows/render-world.yml` now
 * declares `wave1`..`wave{RENDER_WAVE_SLOTS}` to match this value, and
 * `design/packages/render-actions/src/resume/resume.test.ts` reads the workflow file and
 * fails if the two ever drift apart again - so raising this constant is genuinely how you
 * raise the ceiling, rather than a number the workflow quietly ignored.
 *
 * Nothing here silently truncates a plan to fit: a plan that needs more waves than the
 * workflow has is reported as exactly that, with the number it needs.
 */
export const RENDER_WAVE_SLOTS = 12;

/** The most shards a plan may lay out: every wave slot filled to the matrix limit. */
export const MAX_PLANNED_SHARDS = GITHUB_MATRIX_JOB_LIMIT * RENDER_WAVE_SLOTS;

/**
 * upstream: `BlueMapConfigManager.sanitiseMapId` —
 * `common/src/main/java/de/bluecolored/bluemap/common/config/BlueMapConfigManager.java:387-388`:
 *
 * ```java
 * private String sanitiseMapId(String id) {
 *     return id.replaceAll("\\W", "_");
 * }
 * ```
 *
 * BlueMap does not use a `maps/<mapId>.conf` file's name as the map's storage id verbatim.
 * Loading that file (`BlueMapConfigManager.java:307-321`, exactly the file
 * `config/renderConfig.ts` writes) runs the file name through this sanitiser first:
 * `String id = sanitiseMapId(configManager.getConfigName(configFile));`. That `id` is what
 * gets handed to `storage.map(id)` (`BlueMapService.java:230`), and `FileStorage` resolves
 * a map's on-disk directory as `root.resolve(id)`
 * (`core/src/main/java/.../storage/file/FileStorage.java:45`) — the literal tile directory
 * this whole package has to agree with. A map id of `test-issue44-staging` therefore lands
 * on disk as `test_issue44_staging`, confirmed against a real render's `settings.json`
 * (`"maps":["test_issue44_staging"]`) and its 187 MB shard artifact in issue #47.
 *
 * `\W` here is Java's *default*, ASCII-only word class — nothing on this call path sets
 * `Pattern.UNICODE_CHARACTER_CLASS` — so `\w` means exactly `[A-Za-z0-9_]` and `\W` is
 * everything outside that set. This reaches well past the hyphen that surfaced the bug:
 * spaces, dots, parentheses, commas, slashes, apostrophes, accented and non-Latin letters,
 * emoji — anything that is not an ASCII letter, digit or underscore — all fold to `_`.
 * ASCII letters, digits and underscores pass through unchanged, case is untouched (no
 * `.toLowerCase()` on this path — that only happens for auto-discovered worlds, a
 * different code path this project never uses), and the transform is idempotent: an
 * already-sanitized id sanitizes to itself.
 *
 * Every place in this package that predicts or looks for BlueMap's own map-storage
 * directory calls this — `config/renderConfig.ts`, `resume/marker.ts`, and `cli.ts`'s
 * shard/partial directory resolution — so there is exactly one copy of this rule.
 */
export function sanitizeMapId(id: string): string {
    return id.replace(/[^A-Za-z0-9_]/g, "_");
}

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
