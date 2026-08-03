/**
 * How long a render is going to take, and therefore whether one job is enough.
 *
 * There is no honest way to know this exactly before rendering: terrain complexity
 * dominates, and two worlds with the same chunk count can differ by an order of
 * magnitude. What follows is a calibrated estimate with its assumptions written down
 * and printed, so a user who disagrees with it can override the rate rather than
 * having to guess why their render was split into eleven jobs.
 */

/**
 * The measured reference point: 3969 chunks of a generated 1000x1000 world rendered
 * to 961 hires tiles in 80 seconds, using the vendored BlueMap 5.22-27 CLI on a
 * developer workstation.
 *
 * A real measurement rather than a guess, with two caveats worth stating: it is one
 * machine rendering one very uniform world, and the render-thread count that run used
 * was not recorded. Both push in the direction of the estimate being optimistic, which
 * is part of why {@link SAFETY_FACTOR} exists and why `--rate` is offered to anyone who
 * has measured their own.
 */
export const REFERENCE_CHUNKS = 3969;
export const REFERENCE_SECONDS = 80;
export const REFERENCE_CHUNKS_PER_SECOND = REFERENCE_CHUNKS / REFERENCE_SECONDS;

/**
 * That same world's region files came to 16290354 bytes, so 4104 bytes per chunk.
 * A chunk's compressed size tracks how much distinct block and entity data it holds,
 * which is the same thing that makes it slow to render, so it is used below as a
 * cheap complexity signal that costs one stat call per region file.
 */
export const REFERENCE_BYTES_PER_CHUNK = 16290354 / REFERENCE_CHUNKS;

/**
 * A GitHub-hosted standard runner has 4 vCPU and is slower per core than the machine
 * the reference was taken on. Assume it renders at half the reference rate unless the
 * caller measured otherwise.
 */
export const RUNNER_SLOWDOWN = 2;

/** Applied to the final estimate, so a shard that runs long still fits its job. */
export const SAFETY_FACTOR = 1.5;

/** The complexity scaling is deliberately sub-linear; bytes are a proxy, not a measurement. */
const COMPLEXITY_EXPONENT = 0.5;

/** A world simpler than the reference is never assumed to render faster than it. */
const COMPLEXITY_CEILING = 1;

/** Nor is any world assumed to be more than this many times slower. */
const COMPLEXITY_FLOOR = 0.1;

export interface EstimateInputs {
    chunkCount: number;
    bytesPerChunk: number;
    /**
     * Chunks per second on the runner, if the caller has actually measured it.
     * Supplying this skips every assumption below except the safety factor.
     */
    measuredChunksPerSecond?: number | undefined;
}

export interface Estimate {
    chunkCount: number;
    /** the rate the estimate used, after calibration */
    chunksPerSecond: number;
    /** how much the world's chunk density moved the rate; 1 means "same as the reference" */
    complexityFactor: number;
    /** seconds before the safety factor */
    rawSeconds: number;
    /** seconds after the safety factor; this is what the planner budgets against */
    seconds: number;
    /** true when the caller supplied a measured rate and the assumptions were skipped */
    calibrated: boolean;
}

/** Clamps the complexity factor into the documented band. */
export function complexityFactor(bytesPerChunk: number): number {
    if (!Number.isFinite(bytesPerChunk) || bytesPerChunk <= 0) return COMPLEXITY_CEILING;
    const ratio = (REFERENCE_BYTES_PER_CHUNK / bytesPerChunk) ** COMPLEXITY_EXPONENT;
    return Math.min(COMPLEXITY_CEILING, Math.max(COMPLEXITY_FLOOR, ratio));
}

export function estimateRenderSeconds(inputs: EstimateInputs): Estimate {
    const calibrated = typeof inputs.measuredChunksPerSecond === "number";
    const factor = calibrated ? 1 : complexityFactor(inputs.bytesPerChunk);

    const chunksPerSecond = calibrated
        ? inputs.measuredChunksPerSecond!
        : (REFERENCE_CHUNKS_PER_SECOND / RUNNER_SLOWDOWN) * factor;

    const rawSeconds = chunksPerSecond > 0 ? inputs.chunkCount / chunksPerSecond : 0;

    return {
        chunkCount: inputs.chunkCount,
        chunksPerSecond,
        complexityFactor: factor,
        rawSeconds,
        seconds: rawSeconds * SAFETY_FACTOR,
        calibrated,
    };
}

/** A human-readable duration, for the run summary. */
export function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "unknown";
    const rounded = Math.round(seconds);
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const remainder = rounded % 60;
    if (hours > 0) return hours + "h " + minutes + "m";
    if (minutes > 0) return minutes + "m " + remainder + "s";
    return remainder + "s";
}
