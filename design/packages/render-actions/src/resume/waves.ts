import { GITHUB_MATRIX_JOB_LIMIT, RENDER_WAVE_SLOTS } from "../bluemap.js";

/**
 * Batching shards into sequential waves.
 *
 * A GitHub Actions matrix expands to at most 256 entries. A world large enough to need
 * more shards than that therefore cannot be one matrix, and the honest options are two:
 * give each shard a larger area, or run more than one matrix in sequence.
 *
 * This is the second. The first is what the planner used to do on its own, and it has a
 * hard ceiling: enlarging shards raises the per-shard time, and a shard that exceeds the
 * six hour job limit does not finish at all. A worked example from figures measured on
 * this project's own reference machine rather than guessed at: a 20 GB world is roughly
 * 4,000 region files and 4.1 million chunks, and at the measured 49.6 chunks per second
 * (3,969 chunks in 80 seconds) that is about 23 hours of rendering. Against a six hour
 * ceiling it has to be split, and at roughly sixteen regions per shard it wants about 256
 * shards. A world twice that size wants about 512, and no amount of enlarging will make
 * 512 shards' worth of work fit into 256 jobs that each finish in time.
 *
 * So: shards are batched into waves of at most 256, and wave N+1 `needs:` wave N. Nothing
 * is dropped and nothing is silently made bigger.
 *
 * ## What a wave costs, and what it does not
 *
 * Waves do not make the render slower than the account's concurrency already makes it.
 * Actions concurrency is metered per account, and a free account runs 20 jobs at once, so
 * a 256-job matrix is already 13 sequential batches of 20 as far as the runner fleet is
 * concerned. Splitting 512 shards into two waves of 256 changes the ordering of those
 * batches and not their number. What waves *do* cost is a synchronisation point: a wave
 * does not start until every shard in the one before it has ended.
 *
 * That synchronisation is also what makes the failure cheap. Each shard's state is cached
 * and each finished shard writes a completion marker, so a re-dispatched run skips every
 * shard whose marker is present. A workflow that dies in wave 7 loses wave 7, not the six
 * waves before it.
 */

/** One matrix of shards. Waves run in order; wave N+1 waits for wave N. */
export interface RenderWave {
    /** 1-based, matching the workflow's `wave1`, `wave2`, ... job names. */
    readonly index: number;
    readonly shardIds: readonly number[];
}

/** The most shards one matrix can hold. GitHub itself refuses a larger one. */
export const MATRIX_JOB_LIMIT = GITHUB_MATRIX_JOB_LIMIT;

/** How many wave jobs the workflow declares. See `RENDER_WAVE_SLOTS`. */
export const WAVE_SLOTS = RENDER_WAVE_SLOTS;

/**
 * Splits shard ids into waves of at most `waveSize`, preserving their order.
 *
 * Order is preserved rather than optimised. Shard ids run along the grid, so consecutive
 * ids are neighbouring rectangles of the world, and a wave is therefore a contiguous band
 * of it. That makes a partially rendered world look like a partially rendered world in
 * the viewer rather than like a chessboard, which matters when somebody looks at the map
 * between waves.
 */
export function planWaves(
    shardIds: readonly number[],
    waveSize: number = MATRIX_JOB_LIMIT,
): RenderWave[] {
    const size = Math.max(1, Math.min(Math.floor(waveSize), MATRIX_JOB_LIMIT));
    const waves: RenderWave[] = [];
    for (let start = 0; start < shardIds.length; start += size) {
        waves.push({ index: waves.length + 1, shardIds: shardIds.slice(start, start + size) });
    }
    // A plan with no shards at all is not a plan with no waves: there is nothing to
    // render, and saying "0 waves" would read as a truncation rather than as an empty
    // world. The caller gets an empty list and has to decide what that means.
    return waves;
}

/** Which wave a shard belongs to, or null when no wave claims it. */
export function waveOf(shardId: number, waves: readonly RenderWave[]): number | null {
    for (const wave of waves) if (wave.shardIds.includes(shardId)) return wave.index;
    return null;
}

/**
 * True when the plan needs more waves than the workflow has jobs to run them with.
 *
 * This is reported rather than worked around. Quietly rendering the first six waves and
 * calling the map finished would produce a map with a missing corner and nothing anywhere
 * saying so, which is the single worst outcome available here.
 */
export function wavesExceedWorkflow(
    waves: readonly RenderWave[],
    slots: number = WAVE_SLOTS,
): boolean {
    return waves.length > slots;
}

export interface WaveSummaryOptions {
    readonly budgetSeconds: number;
    /** Total estimated rendering seconds across every shard, for the wall-clock note. */
    readonly estimatedSeconds?: number | undefined;
    readonly slots?: number | undefined;
}

/**
 * The wave arithmetic, in the words the run summary prints.
 *
 * A person watching thirteen waves go past should be able to see why there are thirteen
 * without reading the source, so the numbers that produced them are stated rather than
 * implied.
 */
export function describeWaves(
    waves: readonly RenderWave[],
    options: WaveSummaryOptions,
): string[] {
    const slots = options.slots ?? WAVE_SLOTS;
    const shardCount = waves.reduce((total, wave) => total + wave.shardIds.length, 0);
    const lines: string[] = [];

    if (waves.length <= 1) {
        lines.push(
            "All " +
                shardCount +
                " shard" +
                (shardCount === 1 ? "" : "s") +
                " fit in one matrix, so there is one wave.",
        );
        return lines;
    }

    lines.push(
        shardCount +
            " shards is more than the " +
            MATRIX_JOB_LIMIT +
            " a single Actions matrix can hold, so they are rendered in " +
            waves.length +
            " sequential waves of at most " +
            MATRIX_JOB_LIMIT +
            ". Nothing is dropped and no shard is enlarged to fit; wave " +
            waves.length +
            " renders the last " +
            (waves[waves.length - 1]?.shardIds.length ?? 0) +
            ".",
    );

    lines.push(
        "Each wave waits for the one before it. That is the only cost: Actions concurrency" +
            " is metered per account, so a large matrix is already run in batches, and" +
            " splitting it into waves changes when those batches happen rather than how many" +
            " there are.",
    );

    lines.push(
        "Every shard caches its own render state and writes a completion marker when it" +
            " finishes, so re-dispatching this workflow skips the shards that are already" +
            " done and renders only the rest. A run that dies in wave " +
            Math.min(waves.length, 7) +
            " costs that wave, not the ones before it.",
    );

    if (wavesExceedWorkflow(waves, slots)) {
        lines.push(
            "This plan needs " +
                waves.length +
                " waves and the workflow declares " +
                slots +
                ". Nothing has been truncated: the plan is honest and the workflow cannot run" +
                " all of it. Raise budget-minutes so each shard does more work, render one" +
                " dimension at a time, or add wave jobs to render-world.yml to match.",
        );
    }

    return lines;
}
