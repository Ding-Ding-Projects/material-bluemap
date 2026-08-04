/**
 * Converting a large world in pieces, one JVM at a time, without producing seams.
 *
 * Chunker's memory use grows without bound on larger worlds (see `memory.ts`), so a world
 * past the threshold is unlikely to convert in one pass. Batching bounds the problem from
 * both directions at once, and it does so whichever account of the memory behaviour is
 * correct: if it is a leak, a fresh JVM per batch reclaims everything on exit; if the world
 * is simply too large for the available RAM, a smaller slice needs less. Either way the
 * failure is bounded by the batch rather than by the whole world, and a batch that fails can
 * be retried without losing the batches that succeeded.
 *
 * Everything below was established by reading Chunker's source rather than by guessing, and
 * the four facts that make this possible at all are worth stating plainly.
 *
 * ## 1. The CLI really can convert a subset
 *
 * `-p` / `--pruning` takes `{"configs": {"<dimension>": {"include": true, "regions": [...]}}}`
 * where each region is a chunk bounding box - `minChunkX`, `minChunkZ`, `maxChunkX`,
 * `maxChunkZ` (`com.hivemc.chunker.pruning.PruningRegion`). `include: true` keeps what is
 * inside the boxes and discards everything else, and several boxes union together.
 *
 * ## 2. Pruning skips reading, so it genuinely bounds memory
 *
 * This is the part that would have made the whole idea pointless if it were the other way
 * round. In `BedrockWorldReader`, `shouldProcessRegion` gates a whole region before any task
 * is scheduled for it, and `shouldProcessColumn` is checked *before* `createColumnReader`:
 *
 * ```java
 * for (ChunkCoordPair chunkCoordPair : region.getValue()) {
 *     if (!converter.shouldProcessColumn(dimension, chunkCoordPair)) continue;
 *     Task.async("Creating Column Reader", ..., () -> createColumnReader(chunkCoordPair))
 * ```
 *
 * An excluded chunk is never read, never decoded and never held. Pruning is not a filter
 * applied to a fully converted world.
 *
 * ## 3. A naive batcher WOULD produce subtly broken worlds - this is the trap
 *
 * Chunker infers block states from neighbouring columns after reading
 * (`ColumnPreTransformConversionHandler`): fences, walls, panes, bars, tripwire, redstone,
 * stems, double chests, doors and stair shapes all have their connection state decided by
 * what is in the adjacent column. When a required neighbour never arrives, the final
 * `flushColumns()` transforms the column anyway, and `handlePreTransform` drops the
 * unresolved edges:
 *
 * ```java
 * // Remove null values and map them back to column, null values are just unresolved edges
 * requiredColumns.forEach(((edge, columnData) -> { if (columnData == null) return; ... }));
 * ```
 *
 * So a column at the edge of a pruned area is converted **as though the neighbouring chunk
 * were empty**. Nothing hangs and nothing is dropped - the world converts cleanly and is
 * quietly wrong along every batch boundary, which is exactly the failure that is worse than
 * refusing, because a fence that renders unconnected looks like a fence somebody built that
 * way.
 *
 * ## 4. The fix: convert with a margin, keep only what the margin protected
 *
 * Each batch is a set of whole 32x32 **regions**, and its pruning boxes are those regions
 * grown by {@link MARGIN_CHUNKS} chunk on every side. Every chunk of every region the batch
 * *owns* therefore has all of its neighbours loaded, so its connection states are decided
 * with complete information. The extra margin chunks spill into neighbouring regions, whose
 * output files are consequently partial - so after the batch runs, only the region files it
 * owns are kept and the partial ones are discarded.
 *
 * One chunk is enough, and that is a property of the handlers rather than an assumption: a
 * pre-transform reads its *immediate* neighbour columns' blocks. The transitive clustering
 * in `trySolve` decides when columns can be processed together, not how far a block's
 * connection query reaches.
 *
 * Because the unit is a whole region file and every region is produced by exactly one batch,
 * merging is a file copy. Nothing here ever has to splice chunks inside an Anvil file, which
 * is the one operation that would put the format's sector allocation at risk.
 *
 * ## What this deliberately does not do
 *
 * It does not slice the *input*. A Bedrock world is one LevelDB database whose keys interleave
 * every dimension and chunk; cutting it up outside Chunker would mean writing a LevelDB
 * editor and would risk corrupting the original, which is the one thing this feature promises
 * never to touch. All slicing is expressed to Chunker as pruning, and the original is only
 * ever opened for reading.
 */

/** A region's side, in chunks. Anvil has always been 32x32 and this is not configurable. */
export const REGION_CHUNKS = 32;

/**
 * How far each batch reads beyond the regions it keeps, in chunks.
 *
 * One is sufficient and one is necessary. Necessary because a block on the very edge of an
 * owned region asks its immediate neighbour - one chunk away, in the next region - what it
 * is. Sufficient because no pre-transform handler reads further than an immediate
 * neighbouring column; see the note at the top of the file.
 */
export const MARGIN_CHUNKS = 1;

/** A 32x32-chunk region, in region coordinates - the unit of an Anvil file. */
export interface RegionCoord {
    readonly x: number;
    readonly z: number;
}

/** One dimension's populated regions, as Chunker's settings pass reports them. */
export interface DimensionRegions {
    /** Chunker's own dimension identifier, e.g. `minecraft:overworld`. */
    readonly dimension: string;
    readonly regions: readonly RegionCoord[];
}

export interface ConversionBatch {
    /** Position in the sequence, from 0. Also the batch's identity in the resume ledger. */
    readonly index: number;
    readonly dimension: string;
    /** The regions this batch owns and whose files will be kept. */
    readonly regions: readonly RegionCoord[];
}

/** Chunker's pruning region: an inclusive chunk bounding box. */
export interface PruningBox {
    readonly minChunkX: number;
    readonly minChunkZ: number;
    readonly maxChunkX: number;
    readonly maxChunkZ: number;
}

/** The `-p` payload, shaped exactly as `DimensionPruningList` deserialises it. */
export interface PruningConfigFile {
    readonly configs: Readonly<Record<string, { readonly include: true; readonly regions: readonly PruningBox[] }>>;
}

/**
 * Reads the `data.json` Chunker's `SETTINGS` writer produces.
 *
 * That pass exists to report a world without converting it, and its output is exactly what a
 * batch plan needs. `SettingsLevelWriter.flushLevel` writes:
 *
 * ```json
 * { "maps": [...], "settings": {...},
 *   "dimensions": { "minecraft:overworld": [[regionX, regionZ], ...] } }
 * ```
 *
 * The region set comes from `chunkerWorld.getRegions()` - the world's own index of which
 * regions exist - so this is a cheap enumeration rather than a second full read.
 *
 * Returns null rather than a partial answer for anything malformed. A plan built from a
 * half-read world would convert part of it and report success, which is precisely the silent
 * data loss this whole design exists to avoid. Every caller is expected to treat null as
 * "cannot batch this world" and fall back to refusing, never to a guessed grid.
 */
export function parseSettingsRegions(raw: string): DimensionRegions[] | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null) return null;

    const dimensions = (parsed as { dimensions?: unknown }).dimensions;
    if (typeof dimensions !== "object" || dimensions === null) return null;

    const result: DimensionRegions[] = [];
    for (const [dimension, value] of Object.entries(dimensions as Record<string, unknown>)) {
        if (!Array.isArray(value)) return null;
        const regions: RegionCoord[] = [];
        for (const entry of value) {
            // Each region is a two-element [x, z] array. Anything else means this file is
            // not the shape this code was written against - a Chunker whose output format
            // moved - and guessing at it would silently plan the wrong batches.
            if (!Array.isArray(entry) || entry.length < 2) return null;
            const [x, z] = entry as unknown[];
            if (!Number.isInteger(x) || !Number.isInteger(z)) return null;
            regions.push({ x: x as number, z: z as number });
        }
        result.push({ dimension, regions });
    }
    return result;
}

/**
 * How many regions to put in one batch, from the world's measured size.
 *
 * The aim is a batch whose share of the world is comfortably inside the size at which
 * conversions start failing, so the per-batch heap stays bounded. Size per region is the only
 * honest estimator available - the app knows the world's total bytes and now knows its region
 * count, and nothing else about the distribution.
 *
 * Both bounds matter. At least one region, because a batch has to make progress. At most
 * {@link MAX_REGIONS_PER_BATCH}, because the margin overhead per batch is fixed and a plan of
 * thousands of one-region batches spends most of its time starting JVMs.
 */
export const MAX_REGIONS_PER_BATCH = 64;

/** The size a batch aims to stay under, well inside the observed failure threshold. */
export const TARGET_BATCH_BYTES = 100 * 1024 * 1024;

export function regionsPerBatch(totalBytes: number | null, totalRegions: number): number {
    if (totalRegions <= 0) return 1;
    if (totalBytes === null || totalBytes <= 0) return Math.min(MAX_REGIONS_PER_BATCH, totalRegions);
    const bytesPerRegion = totalBytes / totalRegions;
    if (bytesPerRegion <= 0) return Math.min(MAX_REGIONS_PER_BATCH, totalRegions);
    const fit = Math.floor(TARGET_BATCH_BYTES / bytesPerRegion);
    return Math.max(1, Math.min(MAX_REGIONS_PER_BATCH, fit));
}

/**
 * Groups regions into batches.
 *
 * Sorted row-major (by z, then x) before grouping, which is not cosmetic: neighbouring
 * regions in the same batch share their margins, so a spatially coherent batch reads less
 * redundant data than a scattered one. Correctness does not depend on it - a batch may be any
 * set of regions, because ownership is per region file - but cost does.
 *
 * Batches never span dimensions. Pruning is keyed by dimension identifier, and a batch
 * covering two would have to exclude the whole of each other dimension explicitly; keeping
 * them separate means each batch's config names exactly one.
 */
export function planBatches(
    dimensions: readonly DimensionRegions[],
    regionsPerBatchCount: number,
): ConversionBatch[] {
    const size = Math.max(1, Math.floor(regionsPerBatchCount));
    const batches: ConversionBatch[] = [];

    for (const { dimension, regions } of dimensions) {
        const sorted = [...regions].sort((a, b) => (a.z === b.z ? a.x - b.x : a.z - b.z));
        for (let start = 0; start < sorted.length; start += size) {
            batches.push({
                index: batches.length,
                dimension,
                regions: sorted.slice(start, start + size),
            });
        }
    }
    return batches;
}

/**
 * The `-p` payload for one batch: its regions, grown by the margin.
 *
 * Only this batch's own dimension appears. A dimension absent from the config is not pruned
 * at all (`shouldProcessColumn` returns true when there is no config for it), so every other
 * dimension is named with an empty-but-present config would be wrong - instead the batch
 * plan simply never mixes dimensions, and the caller runs one batch per dimension slice.
 *
 * The boxes deliberately overlap where regions are adjacent. `include` semantics are a union,
 * so overlap costs nothing and expressing each region separately keeps this readable and keeps
 * a non-rectangular batch expressible.
 */
export function pruningConfigFor(
    batch: ConversionBatch,
    margin: number = MARGIN_CHUNKS,
): PruningConfigFile {
    const boxes: PruningBox[] = batch.regions.map((region) => ({
        minChunkX: region.x * REGION_CHUNKS - margin,
        minChunkZ: region.z * REGION_CHUNKS - margin,
        maxChunkX: region.x * REGION_CHUNKS + REGION_CHUNKS - 1 + margin,
        maxChunkZ: region.z * REGION_CHUNKS + REGION_CHUNKS - 1 + margin,
    }));

    return { configs: { [batch.dimension]: { include: true, regions: boxes } } };
}

/**
 * The Anvil file names a batch owns, and therefore the only ones worth keeping from it.
 *
 * Everything else the batch wrote is margin: real chunks, correctly converted, but only a
 * one-chunk sliver of the region they belong to. Keeping a partial file would overwrite the
 * complete one another batch produces, which would turn the margin from a correctness
 * mechanism into the very data loss it exists to prevent.
 */
export function ownedRegionFiles(batch: ConversionBatch): string[] {
    return batch.regions.map((region) => `r.${String(region.x)}.${String(region.z)}.mca`);
}

/**
 * Where a dimension's region files live inside a Java world, relative to its root.
 *
 * Java splits a chunk's data across three parallel directories since 1.17 - terrain,
 * entities and points of interest - all keyed by the same region coordinates. All three have
 * to travel together: keeping `region/` while dropping `entities/` would produce a world
 * whose files disagree about what exists.
 */
export const REGION_DIRECTORIES = ["region", "entities", "poi"] as const;

/** The dimension subdirectory Java uses, or `""` for the overworld which has none. */
export function dimensionDirectory(dimension: string): string {
    switch (dimension) {
        case "minecraft:overworld":
            return "";
        case "minecraft:the_nether":
            return "DIM-1";
        case "minecraft:the_end":
            return "DIM1";
        default: {
            // A datapack or Bedrock custom dimension. Java puts these under
            // `dimensions/<namespace>/<name>/`, which is the layout `world/inspect.ts`
            // already reads, so a converted custom dimension stays discoverable.
            const [namespace, name] = dimension.includes(":")
                ? dimension.split(":", 2)
                : ["minecraft", dimension];
            return `dimensions/${namespace ?? "minecraft"}/${name ?? "custom"}`;
        }
    }
}

/**
 * Files and directories that describe the world rather than a piece of it.
 *
 * Every batch writes a complete Java world, so every batch writes these - and they are
 * derived from the source world's own level data rather than from the chunks a batch
 * happened to read, so each batch's copy says the same thing. Taking them from one batch is
 * therefore a choice of which identical copy to keep, not a merge.
 *
 * Which batch is not arbitrary: the **first successful** one is used, so the result does not
 * depend on which batches later failed or were retried.
 */
export const GLOBAL_WORLD_ENTRIES = [
    "level.dat",
    "level.dat_old",
    "session.lock",
    "data",
    "datapacks",
    "playerdata",
    "stats",
    "advancements",
] as const;
