/**
 * Rendering in Actions, without losing what a killed job had already done.
 *
 * Four ideas, each in its own file:
 *
 * - `state.ts` - what is cached between runs, under what key, and why the key has the
 *   plan's fingerprint in it. Also the reconciliation of caching `rstate` with the merge's
 *   refusal to merge it.
 * - `marker.ts` - how a shard that finished is told apart from one that was cut off
 *   mid-write, which is the thing a resume gets catastrophically wrong if it guesses.
 * - `waves.ts` - batching more shards than one matrix can hold into sequential waves,
 *   because a world can genuinely need more than 256 and truncating the plan to fit would
 *   publish a map with a corner missing.
 * - `mergeTree.ts` and `lowresMerge.ts` - merging a map too large for one runner to hold,
 *   by finishing hires at the group level and taking only the lowres layers to the end.
 */

export {
    CACHE_FORMAT_VERSION,
    describeShardCache,
    planFingerprint,
    shardCacheKey,
    shardCachePaths,
    shardCacheRestorePrefix,
    type ShardCacheDescription,
    type ShardCacheKeyOptions,
} from "./state.js";

export {
    SHARD_MARKER_VERSION,
    countHiresTiles,
    inspectShard,
    markerDigest,
    newShardMarker,
    readShardMarker,
    shardMarkerPath,
    verifyShardMarker,
    writeShardMarker,
    type NewMarkerInput,
    type ShardCompletionMarker,
    type ShardTrustReport,
    type VerifyShardOptions,
} from "./marker.js";

export {
    MATRIX_JOB_LIMIT,
    WAVE_SLOTS,
    describeWaves,
    planWaves,
    waveOf,
    wavesExceedWorkflow,
    type RenderWave,
    type WaveSummaryOptions,
} from "./waves.js";

export {
    DEFAULT_MERGE_GROUP_SIZE,
    describeMergeTree,
    groupOf,
    planMergeTree,
    type MergeGroup,
    type MergeTree,
    type MergeTreeSummaryOptions,
} from "./mergeTree.js";

export {
    mergeLowresLayers,
    type LowresMergeOptions,
    type LowresMergeReport,
} from "./lowresMerge.js";
