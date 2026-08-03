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
