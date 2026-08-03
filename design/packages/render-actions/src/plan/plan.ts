import {
    alignBoundaryUp,
    GITHUB_MATRIX_JOB_LIMIT,
    HIRES_TILE_OFFSET,
    HIRES_TILE_SIZE,
    MAX_PLANNED_SHARDS,
    REGION_BLOCKS,
    type BlockRange,
    type ClosedRange,
} from "../bluemap.js";
import { chunksInRegionRectangle, type WorldMeasurement } from "../world/measure.js";
import { estimateRenderSeconds, formatDuration, type Estimate } from "./estimate.js";

/** One unit of parallel work: a rectangle of the world, rendered by one Actions job. */
export interface Shard {
    /** 0-based; also the matrix entry and the artifact name suffix */
    id: number;
    /** position in the shard grid, for the run summary */
    gridX: number;
    gridZ: number;
    /** the region-coordinate rectangle this shard is responsible for */
    regions: { x: ClosedRange; z: ClosedRange };
    /**
     * The render-mask this shard renders with.
     *
     * Interior edges sit on a hires tile boundary; the outermost shard on each side is
     * left unbounded so the shards' masks partition the whole plane and nothing can fall
     * between two of them.
     */
    bounds: { x: BlockRange; z: BlockRange };
    /** chunks present in this shard's regions, from the measurement */
    chunkCount: number;
    estimatedSeconds: number;
}

export interface ShardPlan {
    mapId: string;
    dimension: string;
    /** the whole world, as measured */
    world: {
        regions: { x: ClosedRange; z: ClosedRange };
        blocks: { x: ClosedRange; z: ClosedRange };
        regionFileCount: number;
        chunkCount: number;
        bytes: number;
        bytesPerChunk: number;
    };
    estimate: Estimate;
    /** seconds one job is allowed to spend rendering */
    budgetSeconds: number;
    /** how many shards the estimate asked for, before any cap was applied */
    requestedShards: number;
    /** the shard grid that was actually laid out */
    grid: { x: number; z: number };
    shards: Shard[];
    /** the layout constants the shard configs and the merge both depend on */
    layout: {
        hiresTileSize: number;
        hiresTileOffset: number;
        lowresTileSize: number;
        lodFactor: number;
        lodCount: number;
    };
    /** why the plan looks the way it does, in the words the run summary prints */
    decision: string[];
}

export interface PlanOptions {
    mapId: string;
    /** seconds of rendering one job may do; the caller derives this from the job timeout */
    budgetSeconds: number;
    /** never expand the matrix beyond this; GitHub itself refuses more than 256 */
    maxJobs?: number | undefined;
    /** chunks per second, if the caller measured the runner instead of assuming */
    measuredChunksPerSecond?: number | undefined;
    /** forces a shard count, skipping the estimate; still capped and still aligned */
    forceShards?: number | undefined;
    lowresTileSize: number;
    lodFactor: number;
    lodCount: number;
}

/**
 * Splits a region-coordinate axis into `parts` contiguous ranges as evenly as possible.
 * The leftovers go to the leading ranges, so no range is ever empty.
 */
export function splitAxis(range: ClosedRange, parts: number): ClosedRange[] {
    const length = range.max - range.min + 1;
    const count = Math.max(1, Math.min(parts, length));
    const base = Math.floor(length / count);
    const remainder = length % count;

    const ranges: ClosedRange[] = [];
    let cursor = range.min;
    for (let index = 0; index < count; index++) {
        const size = base + (index < remainder ? 1 : 0);
        ranges.push({ min: cursor, max: cursor + size - 1 });
        cursor += size;
    }
    return ranges;
}

/**
 * Chooses a shard grid that reaches `wanted` jobs without exceeding `maxJobs`, keeping
 * the shards as close to square in region terms as the world's shape allows.
 */
export function chooseGrid(
    wanted: number,
    regionsX: number,
    regionsZ: number,
    maxJobs: number,
): { x: number; z: number } {
    if (wanted <= 1) return { x: 1, z: 1 };

    const target = Math.min(wanted, maxJobs);
    let x = Math.round(Math.sqrt((target * regionsX) / regionsZ));
    x = Math.max(1, Math.min(regionsX, x));
    let z = Math.max(1, Math.min(regionsZ, Math.ceil(target / x)));

    // the clamps above can leave the grid short; widen whichever axis still has room
    while (x * z < target && (x < regionsX || z < regionsZ)) {
        if (x < regionsX && (x <= z || z >= regionsZ)) x++;
        else if (z < regionsZ) z++;
        else break;
    }

    // and shrink if the grid overshot the hard job cap
    while (x * z > maxJobs) {
        if (x >= z && x > 1) x--;
        else if (z > 1) z--;
        else break;
    }

    return { x, z };
}

/**
 * Turns per-axis region splits into block ranges whose interior edges land on the hires
 * tile grid.
 *
 * A region boundary is at a multiple of 512, and 512 is a multiple of 32, but the hires
 * grid is offset by 2 — so the aligned cut is two blocks further along than the region
 * edge. Those two block columns are rendered by the preceding shard, which is harmless
 * and is the whole price of never cutting a tile in half.
 */
export function alignedCuts(splits: readonly ClosedRange[]): BlockRange[] {
    const cuts: number[] = [];
    for (let index = 1; index < splits.length; index++)
        cuts.push(alignBoundaryUp(splits[index]!.min * REGION_BLOCKS));

    return splits.map((_, index) => ({
        min: index === 0 ? null : cuts[index - 1]!,
        max: index === splits.length - 1 ? null : cuts[index]! - 1,
    }));
}

/**
 * Works out how many jobs this world needs and what each of them renders.
 *
 * The decision is recorded as prose in `decision` rather than left implicit, because a
 * user watching a workflow fan out into thirty jobs deserves to see the arithmetic.
 */
export function planShards(measurement: WorldMeasurement, options: PlanOptions): ShardPlan {
    // The ceiling is the number of shards the *workflow* can run, not the number one
    // matrix can hold. A matrix caps at 256; a plan needing more than that is rendered in
    // sequential waves of 256, so the plan is allowed to ask for them. See
    // `resume/waves.ts` for the batching and `MAX_PLANNED_SHARDS` for where the real
    // ceiling comes from.
    const maxJobs = Math.max(1, Math.min(options.maxJobs ?? GITHUB_MATRIX_JOB_LIMIT, MAX_PLANNED_SHARDS));
    const budgetSeconds = Math.max(1, options.budgetSeconds);

    const estimate = estimateRenderSeconds({
        chunkCount: measurement.chunkCount,
        bytesPerChunk: measurement.bytesPerChunk,
        measuredChunksPerSecond: options.measuredChunksPerSecond,
    });

    const decision: string[] = [];
    decision.push(
        "Measured " +
            measurement.regions.length +
            " region files holding " +
            measurement.chunkCount +
            " chunks, spanning blocks x " +
            measurement.blockBounds.x.min +
            ".." +
            measurement.blockBounds.x.max +
            " and z " +
            measurement.blockBounds.z.min +
            ".." +
            measurement.blockBounds.z.max +
            ".",
    );

    if (estimate.calibrated) {
        decision.push(
            "Using the caller-supplied rate of " +
                estimate.chunksPerSecond.toFixed(1) +
                " chunks/second.",
        );
    } else {
        decision.push(
            "Assuming " +
                estimate.chunksPerSecond.toFixed(1) +
                " chunks/second: the measured reference of 49.6 chunks/second, halved for a" +
                " GitHub-hosted runner, then scaled by " +
                estimate.complexityFactor.toFixed(2) +
                " for this world's " +
                Math.round(measurement.bytesPerChunk) +
                " bytes per chunk.",
        );
    }

    decision.push(
        "Estimated " +
            formatDuration(estimate.rawSeconds) +
            " of rendering, " +
            formatDuration(estimate.seconds) +
            " with the safety margin, against a per-job budget of " +
            formatDuration(budgetSeconds) +
            ".",
    );

    const requestedShards =
        options.forceShards !== undefined
            ? Math.max(1, options.forceShards)
            : Math.max(1, Math.ceil(estimate.seconds / budgetSeconds));

    if (options.forceShards !== undefined)
        decision.push("Shard count was forced to " + requestedShards + ", skipping the estimate.");

    const regionsX = measurement.regionBounds.x.max - measurement.regionBounds.x.min + 1;
    const regionsZ = measurement.regionBounds.z.max - measurement.regionBounds.z.min + 1;
    const grid = chooseGrid(requestedShards, regionsX, regionsZ, maxJobs);

    if (requestedShards <= 1) {
        decision.push("One job is enough, so the world is rendered whole and no merge is needed.");
    } else if (grid.x * grid.z < requestedShards) {
        const perShard = estimate.seconds / (grid.x * grid.z);
        decision.push(
            "The estimate asked for " +
                requestedShards +
                " jobs but only " +
                grid.x * grid.z +
                " fit inside the " +
                maxJobs +
                "-job limit" +
                (regionsX * regionsZ < requestedShards
                    ? " and the world is only " + regionsX + "x" + regionsZ + " regions"
                    : "") +
                ", so each shard covers a larger area and is expected to take about " +
                formatDuration(perShard) +
                " rather than the " +
                formatDuration(budgetSeconds) +
                " budget. Nothing is being skipped; the jobs are simply longer.",
        );
    } else {
        decision.push(
            "Splitting into a " +
                grid.x +
                " by " +
                grid.z +
                " shard grid, " +
                grid.x * grid.z +
                " parallel jobs.",
        );
    }

    const splitsX = splitAxis(measurement.regionBounds.x, grid.x);
    const splitsZ = splitAxis(measurement.regionBounds.z, grid.z);
    const boundsX = alignedCuts(splitsX);
    const boundsZ = alignedCuts(splitsZ);

    const shards: Shard[] = [];
    for (let gz = 0; gz < splitsZ.length; gz++) {
        for (let gx = 0; gx < splitsX.length; gx++) {
            const regions = { x: splitsX[gx]!, z: splitsZ[gz]! };
            const chunkCount = chunksInRegionRectangle(measurement, regions.x, regions.z);

            // a shard grid laid over a sparse world can produce rectangles with no region
            // files in them at all; those would start a job only to render nothing
            if (chunkCount === 0) continue;

            const shardEstimate = estimateRenderSeconds({
                chunkCount,
                bytesPerChunk: measurement.bytesPerChunk,
                measuredChunksPerSecond: options.measuredChunksPerSecond,
            });

            shards.push({
                id: shards.length,
                gridX: gx,
                gridZ: gz,
                regions,
                bounds: { x: boundsX[gx]!, z: boundsZ[gz]! },
                chunkCount,
                estimatedSeconds: shardEstimate.seconds,
            });
        }
    }

    const emptyShards = splitsX.length * splitsZ.length - shards.length;
    if (emptyShards > 0)
        decision.push(
            "Dropped " +
                emptyShards +
                " shard" +
                (emptyShards === 1 ? "" : "s") +
                " that covered no region files, leaving " +
                shards.length +
                " job" +
                (shards.length === 1 ? "" : "s") +
                ".",
        );

    return {
        mapId: options.mapId,
        dimension: measurement.dimension,
        world: {
            regions: measurement.regionBounds,
            blocks: measurement.blockBounds,
            regionFileCount: measurement.regions.length,
            chunkCount: measurement.chunkCount,
            bytes: measurement.bytes,
            bytesPerChunk: measurement.bytesPerChunk,
        },
        estimate,
        budgetSeconds,
        requestedShards,
        grid,
        shards,
        layout: {
            hiresTileSize: HIRES_TILE_SIZE,
            hiresTileOffset: HIRES_TILE_OFFSET,
            lowresTileSize: options.lowresTileSize,
            lodFactor: options.lodFactor,
            lodCount: options.lodCount,
        },
        decision,
    };
}

/**
 * Checks the property the merge depends on: the shards' masks must partition the plane,
 * and every interior edge must sit between two hires tiles rather than inside one.
 *
 * This is cheap and is run before any rendering starts, because the failure it catches
 * is silent. A misaligned cut produces a map that renders, uploads and looks fine until
 * someone notices a 32-block stripe of missing terrain.
 */
export function validatePlanAlignment(plan: ShardPlan): string[] {
    const problems: string[] = [];

    for (const shard of plan.shards) {
        for (const axis of ["x", "z"] as const) {
            const range = shard.bounds[axis];
            if (range.min !== null && !onHiresBoundary(range.min))
                problems.push(
                    "Shard " +
                        shard.id +
                        " starts at " +
                        axis +
                        "=" +
                        range.min +
                        ", which is inside a hires tile rather than at its edge.",
                );
            if (range.max !== null && !onHiresBoundary(range.max + 1))
                problems.push(
                    "Shard " +
                        shard.id +
                        " ends at " +
                        axis +
                        "=" +
                        range.max +
                        ", which is inside a hires tile rather than at its edge.",
                );
        }
    }

    for (const axis of ["x", "z"] as const) {
        const edges = new Map<string, BlockRange>();
        for (const shard of plan.shards) edges.set(rangeKey(shard.bounds[axis]), shard.bounds[axis]);

        const ordered = [...edges.values()].sort((a, b) => (a.min ?? -Infinity) - (b.min ?? -Infinity));
        for (let index = 1; index < ordered.length; index++) {
            const previous = ordered[index - 1]!;
            const current = ordered[index]!;
            if (previous.max === null || current.min === null) continue;
            if (previous.max + 1 !== current.min)
                problems.push(
                    "The " +
                        axis +
                        " shard edges leave a gap or an overlap between " +
                        previous.max +
                        " and " +
                        current.min +
                        ".",
                );
        }
    }

    return problems;
}

function onHiresBoundary(block: number): boolean {
    return (((block - HIRES_TILE_OFFSET) % HIRES_TILE_SIZE) + HIRES_TILE_SIZE) % HIRES_TILE_SIZE === 0;
}

function rangeKey(range: BlockRange): string {
    return (range.min ?? "-") + ":" + (range.max ?? "-");
}
