import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
    CHUNKS_PER_REGION,
    CHUNKS_PER_REGION_AXIS,
    REGION_BLOCKS,
    type ClosedRange,
} from "../bluemap.js";

/** `r.<x>.<z>.mca` — the only region-file naming anvil uses. */
const REGION_FILE_PATTERN = /^r\.(-?\d+)\.(-?\d+)\.mca$/;

/** The anvil location table is the first 4 KiB of a region file: 1024 4-byte entries. */
const LOCATION_TABLE_BYTES = 4096;

/** One measured anvil region file. */
export interface RegionMeasurement {
    fileName: string;
    /** region coordinates, so the block extent is `x * 512 .. x * 512 + 511` */
    x: number;
    z: number;
    /** how many of the region's 1024 chunk slots actually hold a chunk */
    chunkCount: number;
    /** size of the region file on disk, in bytes */
    bytes: number;
}

/** What a world actually contains, measured rather than declared. */
export interface WorldMeasurement {
    /** absolute path of the directory the region files were read from */
    regionDirectory: string;
    /** the dimension the region directory belongs to */
    dimension: string;
    regions: RegionMeasurement[];
    /** inclusive region-coordinate extent */
    regionBounds: { x: ClosedRange; z: ClosedRange };
    /**
     * Inclusive block extent, derived from the regions that actually exist.
     *
     * This is a whole number of regions and so is generous: a region holding a single
     * chunk still contributes its full 512 blocks. It is the extent the shard planner
     * partitions, and it never claims to cover a region that is not on disk.
     */
    blockBounds: { x: ClosedRange; z: ClosedRange };
    /** total chunks present across every region file */
    chunkCount: number;
    /** total bytes of every region file */
    bytes: number;
    /** `bytes / chunkCount`, the calibration signal for the work estimate */
    bytesPerChunk: number;
    /** how full the region grid is; a sparse world renders far less than its extent suggests */
    regionGridFillRatio: number;
}

/**
 * Resolves the directory holding the region files for a dimension.
 *
 * A save folder keeps the overworld at its root and the two vanilla extra dimensions in
 * `DIM-1` and `DIM1`; anything a datapack or mod adds lives under `dimensions/<namespace>/<path>`.
 */
export function regionDirectoryCandidates(worldDirectory: string, dimension: string): string[] {
    const normalized = dimension.includes(":") ? dimension : "minecraft:" + dimension;
    const [namespace = "minecraft", path = "overworld"] = normalized.split(":", 2);

    // The overworld gets the `dimensions/` fallback too, which it did not until a real
    // 6.6 GB save was planned in CI and reported "no region files for dimension
    // minecraft:overworld" over a world holding 1,461 of them.
    //
    // The nether and the end already had this fallback and the overworld did not, so the
    // asymmetry was invisible on any world that keeps the overworld at the root - which is
    // most of them. A save that keeps every dimension under `dimensions/` planned as empty
    // while BlueMap itself rendered it perfectly well: upstream's own
    // `MCAWorld.resolveDimensionFolder` tries `dimensions/<namespace>/<value>` first. The
    // renderer knew about this layout and only the planner did not.
    if (normalized === "minecraft:overworld")
        return [
            join(worldDirectory, "region"),
            join(worldDirectory, "dimensions", namespace, path, "region"),
        ];
    if (normalized === "minecraft:the_nether")
        return [
            join(worldDirectory, "DIM-1", "region"),
            join(worldDirectory, "dimensions", namespace, path, "region"),
        ];
    if (normalized === "minecraft:the_end")
        return [
            join(worldDirectory, "DIM1", "region"),
            join(worldDirectory, "dimensions", namespace, path, "region"),
        ];

    return [join(worldDirectory, "dimensions", namespace, path, "region")];
}

/** Reads the anvil location table and counts the chunk slots that are occupied. */
export async function countChunksInRegionFile(filePath: string): Promise<number> {
    const handle = await open(filePath, "r");
    try {
        const table = Buffer.alloc(LOCATION_TABLE_BYTES);
        const { bytesRead } = await handle.read(table, 0, LOCATION_TABLE_BYTES, 0);
        if (bytesRead < LOCATION_TABLE_BYTES) return 0;

        let chunks = 0;
        for (let slot = 0; slot < CHUNKS_PER_REGION; slot++) {
            // 3-byte sector offset then a 1-byte sector count; an all-zero entry is "absent"
            const entry = table.readUInt32BE(slot * 4);
            if (entry !== 0) chunks++;
        }
        return chunks;
    } finally {
        await handle.close();
    }
}

/**
 * Measures a world by reading its region files.
 *
 * Nothing here trusts a caller-supplied extent: the bounding box comes from the region
 * files that are on disk and the chunk count comes from their location tables, so a
 * world that claims to be enormous but holds four regions is planned as four regions.
 */
export async function measureWorld(
    regionDirectory: string,
    dimension: string,
): Promise<WorldMeasurement> {
    const entries = await readdir(regionDirectory, { withFileTypes: true });

    const regions: RegionMeasurement[] = [];
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const match = REGION_FILE_PATTERN.exec(entry.name);
        if (match === null) continue;

        const filePath = join(regionDirectory, entry.name);
        const [, rawX = "0", rawZ = "0"] = match;
        const info = await stat(filePath);
        const chunkCount = info.size >= LOCATION_TABLE_BYTES
            ? await countChunksInRegionFile(filePath)
            : 0;

        regions.push({
            fileName: entry.name,
            x: Number.parseInt(rawX, 10),
            z: Number.parseInt(rawZ, 10),
            chunkCount,
            bytes: info.size,
        });
    }

    if (regions.length === 0)
        throw new Error(
            "No region files (r.<x>.<z>.mca) were found in " +
                regionDirectory +
                ". That directory does not hold a renderable dimension.",
        );

    regions.sort((a, b) => (a.z - b.z) || (a.x - b.x));

    const xs = regions.map((region) => region.x);
    const zs = regions.map((region) => region.z);
    const regionBounds = {
        x: { min: Math.min(...xs), max: Math.max(...xs) },
        z: { min: Math.min(...zs), max: Math.max(...zs) },
    };

    const blockBounds = {
        x: {
            min: regionBounds.x.min * REGION_BLOCKS,
            max: regionBounds.x.max * REGION_BLOCKS + REGION_BLOCKS - 1,
        },
        z: {
            min: regionBounds.z.min * REGION_BLOCKS,
            max: regionBounds.z.max * REGION_BLOCKS + REGION_BLOCKS - 1,
        },
    };

    const chunkCount = regions.reduce((sum, region) => sum + region.chunkCount, 0);
    const bytes = regions.reduce((sum, region) => sum + region.bytes, 0);

    const gridWidth = regionBounds.x.max - regionBounds.x.min + 1;
    const gridHeight = regionBounds.z.max - regionBounds.z.min + 1;

    return {
        regionDirectory,
        dimension,
        regions,
        regionBounds,
        blockBounds,
        chunkCount,
        bytes,
        bytesPerChunk: chunkCount === 0 ? 0 : bytes / chunkCount,
        regionGridFillRatio: regions.length / (gridWidth * gridHeight),
    };
}

/** The number of chunk columns a region grid rectangle holds, from the measurement. */
export function chunksInRegionRectangle(
    measurement: WorldMeasurement,
    x: ClosedRange,
    z: ClosedRange,
): number {
    let chunks = 0;
    for (const region of measurement.regions) {
        if (region.x < x.min || region.x > x.max) continue;
        if (region.z < z.min || region.z > z.max) continue;
        chunks += region.chunkCount;
    }
    return chunks;
}

/** The theoretical maximum, used only to report how sparse a world is. */
export function maxChunksPerRegion(): number {
    return CHUNKS_PER_REGION_AXIS * CHUNKS_PER_REGION_AXIS;
}
