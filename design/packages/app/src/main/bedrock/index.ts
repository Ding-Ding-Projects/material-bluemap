/**
 * Bedrock Edition worlds: recognising them, and converting them so they can be rendered.
 *
 * BlueMap renders Java Edition. A Bedrock world is a LevelDB database and a different
 * `level.dat` dialect, so it cannot be rendered directly - but it can be converted, and
 * this directory does both halves of that:
 *
 * 1. **Say what it is.** `detect.ts` turns a folder listing into "this is a Bedrock world,
 *    which has to be converted first" instead of the app's previous, technically-correct
 *    and useless "not a world". This half stands on its own and works with nothing
 *    installed - no Chunker, no JVM, no network.
 * 2. **Convert it, on request.** `chunker.ts` finds or fetches Hive Games' Chunker CLI
 *    (MIT, not bundled - see `docs/bedrock-worlds.md`), `convert.ts` runs it and refuses to
 *    leave anything resembling a world unless one was verifiably produced, and
 *    `provenance.ts` records in the converted world that it is a conversion, by what, and
 *    what was documented as lost on the way.
 *
 * Nothing here imports an Electron value. `ipc.ts` names `IpcMain` as a type and takes it
 * as a parameter, so the whole directory runs and is tested without an Electron runtime,
 * without Chunker, without a JVM and without a Bedrock world on disk.
 *
 * ```ts
 * import { app, ipcMain } from "electron";
 * import { registerBedrockHandlers } from "./bedrock/index.js";
 *
 * const bedrock = registerBedrockHandlers(ipcMain, {
 *     dataDir: app.getPath("userData"),
 *     resolveJava: async () => {
 *         // Reuses main/java/ - the same provisioned, probed Temurin the renderer runs on.
 *         const java = await ensureJava({ dataDir: app.getPath("userData") });
 *         return { ok: true, executable: java.installation.executable,
 *                  version: java.installation.version.version };
 *     },
 * });
 * ```
 */

export {
    LEVELDB_DIRECTORY,
    LEVEL_NAME_FILE,
    MAX_LEVEL_NAME_BYTES,
    detectBedrockWorld,
    readBedrockLevelName,
    type BedrockConfidence,
    type BedrockWorldDetection,
} from "./detect.js";

export {
    CHUNKER_JAR_ENV,
    CHUNKER_DIRECTORY,
    PINNED_CHUNKER,
    REQUIRED_CHUNKER_JAVA_FEATURE,
    chunkerJarPath,
    fetchChunker,
    findChunker,
    pinnedRelease,
    versionFromJarName,
    type ChunkerLocation,
    type ChunkerLookup,
    type ChunkerMissing,
    type ChunkerRelease,
    type ChunkerSource,
    type DigestTrust,
    type FetchChunkerOptions,
    type FetchChunkerResult,
    type FileProbe,
    type FindChunkerOptions,
} from "./chunker.js";

export {
    CANCEL_GRACE_MS,
    ChunkerConversion,
    DEFAULT_JAVA_TARGET,
    EXIT_OUT_OF_MEMORY,
    EXIT_USAGE,
    RECOMMENDED_JVM_ARGS,
    STAGING_SUFFIX,
    convertBedrockWorld,
    convertedWorldPath,
    estimateConvertedSize,
    verifyConvertedWorld,
    type ChunkerRunOptions,
    type ChunkerRunResult,
    type ConversionEvent,
    type ConversionFailure,
    type ConversionFailureCode,
    type ConversionOutcome,
    type ConversionPhase,
    type ConversionSuccess,
    type ConvertWorldOptions,
    type ConvertedWorldCheck,
    type SpawnChunker,
} from "./convert.js";

export {
    GLOBAL_WORLD_ENTRIES,
    MARGIN_CHUNKS,
    MAX_REGIONS_PER_BATCH,
    REGION_CHUNKS,
    REGION_DIRECTORIES,
    TARGET_BATCH_BYTES,
    dimensionDirectory,
    ownedRegionFiles,
    parseSettingsRegions,
    planBatches,
    pruningConfigFor,
    regionsPerBatch,
    type ConversionBatch,
    type DimensionRegions,
    type PruningBox,
    type PruningConfigFile,
    type RegionCoord,
} from "./batch.js";

export {
    LEDGER_FILE,
    MERGED_DIRECTORY,
    SETTINGS_FORMAT,
    convertBedrockWorldInBatches,
    mergeBatchOutput,
    planKeyFor,
    readLedger,
    writeLedger,
    type BatchLedger,
    type BatchProgress,
    type BatchedConversionOptions,
} from "./batchConvert.js";

export {
    MEMORY_RISK_APPROACHING_FRACTION,
    MEMORY_RISK_THRESHOLD_BYTES,
    assessMemoryRisk,
    type MemoryRisk,
    type MemoryRiskLevel,
} from "./memory.js";

export {
    CHUNKER_README_URL,
    FIDELITY_NOTES,
    FIDELITY_NOTES_READ_FROM,
    fidelityNotesFor,
    type FidelityBriefing,
    type FidelityNote,
    type FidelitySource,
} from "./fidelity.js";

export {
    CONVERSION_RECORD_FILE,
    CONVERSION_RECORD_VERSION,
    buildConversionRecord,
    conversionProvenance,
    conversionRecordPath,
    describeConversion,
    readConversionRecord,
    writeConversionRecord,
    type BuildConversionRecordOptions,
    type ConversionProvenance,
    type ConversionRecord,
} from "./provenance.js";

export {
    BEDROCK_CHANNELS,
    BEDROCK_EVENT_CHANNEL,
    registerBedrockHandlers,
    type BedrockDetectResult,
    type BedrockIpc,
    type BedrockIpcOptions,
    type ChunkerStatus,
    type ConversionProgressEvent,
} from "./ipc.js";
