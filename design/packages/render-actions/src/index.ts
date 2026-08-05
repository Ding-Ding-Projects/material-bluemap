// layout constants and grid arithmetic
export {
    alignBoundaryUp,
    CHUNK_BLOCKS,
    CHUNKS_PER_REGION,
    CHUNKS_PER_REGION_AXIS,
    GITHUB_MATRIX_JOB_LIMIT,
    HIRES_TILE_OFFSET,
    HIRES_TILE_SIZE,
    hiresTileMaxBlock,
    hiresTileMinBlock,
    hiresTileOfBlock,
    isHiresTileBoundary,
    LOD_COUNT,
    LOD_FACTOR,
    LOWRES_TILE_SIZE,
    MAX_PLANNED_SHARDS,
    RENDER_WAVE_SLOTS,
    lowresTileOfBlock,
    rangeLength,
    REGION_BLOCKS,
    regionBlockRange,
    type BlockRange,
    type ClosedRange,
} from "./bluemap.js";

// world measurement and validation
export {
    chunksInRegionRectangle,
    countChunksInRegionFile,
    maxChunksPerRegion,
    measureWorld,
    regionDirectoryCandidates,
    type RegionMeasurement,
    type WorldMeasurement,
} from "./world/measure.js";
export {
    findWorldDirectories,
    locateWorld,
    WorldValidationError,
    type WorldLocation,
} from "./world/validate.js";
export {
    fingerprintWorld,
    isUnchanged,
    FingerprintError,
    WORLD_FINGERPRINT_VERSION,
    type WorldFingerprint,
} from "./world/fingerprint.js";

// scheduled re-rendering: a small honest cadence set, and cheap change detection per
// world-source, shared between the scheduled-render workflow and (for its app-side
// configuration surface) the desktop app
export {
    CI_SCHEDULE_CADENCES,
    cadenceIntervalMs,
    describeCadenceCost,
    isCadenceDue,
    isCiScheduleCadence,
    nextCheckAt,
    type CiScheduleCadence,
    type ScheduleDue,
} from "./schedule/cadence.js";
export {
    evaluateScheduleChange,
    type CiScheduleCheckResult,
    type CiScheduleSourceKind,
} from "./schedule/changeCheck.js";

// planning
export {
    complexityFactor,
    estimateRenderSeconds,
    formatDuration,
    REFERENCE_BYTES_PER_CHUNK,
    REFERENCE_CHUNKS,
    REFERENCE_CHUNKS_PER_SECOND,
    REFERENCE_SECONDS,
    RUNNER_SLOWDOWN,
    SAFETY_FACTOR,
    type Estimate,
    type EstimateInputs,
} from "./plan/estimate.js";
export {
    DISK_SAFETY_FACTOR,
    estimateDiskBytes,
    FETCH_PEAK_MULTIPLIER,
    formatBytes,
    RENDER_DATA_MARGIN_BYTES,
    TILE_OUTPUT_RATIO,
    type DiskEstimate,
    type DiskEstimateInputs,
} from "./plan/disk.js";
export {
    alignedCuts,
    chooseGrid,
    planShards,
    splitAxis,
    validatePlanAlignment,
    type PlanOptions,
    type Shard,
    type ShardPlan,
} from "./plan/plan.js";

// shard configuration
export {
    quoteConfigString,
    renderMaskEntry,
    writeShardConfig,
    type ShardConfigOptions,
    type WrittenShardConfig,
} from "./config/renderConfig.js";

// merging
export { blankImage, decodePng, encodePng, type RgbaImage } from "./merge/png.js";
export {
    cellKey,
    gridCellPath,
    parseCellKey,
    parseGridCellPath,
    type GridCell,
} from "./merge/gridPath.js";
export {
    compositeLowresTile,
    deriveNextLod,
    halfImageSize,
    LowresTile,
    PremultipliedAccumulator,
    setOnLayer,
    type CompositeResult,
    type Rgba,
} from "./merge/lowresTile.js";
export {
    assertIdenticalTextures,
    MergeError,
    mergeShardMaps,
    type MergeOptions,
    type MergeReport,
} from "./merge/mergeMap.js";
export {
    selectBoundaryTiles,
    verifyMerge,
    type VerifyCheck,
    type VerifyOptions,
    type VerifyReport,
} from "./merge/verify.js";

// resuming an interrupted run, and rendering a world too large for one matrix
export * from "./resume/index.js";

// preparing a rendered map for a host that only serves files
export {
    NOJEKYLL_FILE,
    PAGES_MAX_FILE_BYTES,
    PAGES_SOFT_SITE_LIMIT_BYTES,
    prepareStaticHost,
    StaticHostError,
    type PrepareStaticHostOptions,
    type StaticHostMap,
    type StaticHostReport,
} from "./pages/staticHost.js";
