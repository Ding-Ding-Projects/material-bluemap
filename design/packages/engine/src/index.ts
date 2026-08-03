// world
export { BlockState } from "./world/BlockState.js";
export { BlockProperties, BlockPropertiesBuilder } from "./world/BlockProperties.js";
export { Chunk } from "./world/Chunk.js";
export { ChunkConsumer } from "./world/ChunkConsumer.js";
export { Region } from "./world/Region.js";
export { World } from "./world/World.js";
export { DimensionType } from "./world/DimensionType.js";
export { LightData } from "./world/LightData.js";
export type { BlockEntity } from "./world/BlockEntity.js";
export type { Entity } from "./world/Entity.js";
export { worldDataPacks, type WorldLoader } from "./world/WorldLoader.js";
export { WorldLoaderType } from "./world/WorldLoaderType.js";

// util
export { WatchService } from "./util/WatchService.js";

// world/block
export type { BlockAccess } from "./world/block/BlockAccess.js";
export { Block } from "./world/block/Block.js";
export { ExtendedBlock, MaskArea } from "./world/block/ExtendedBlock.js";
export { BlockNeighborhood } from "./world/block/BlockNeighborhood.js";

// world/biome
export { Biome } from "./world/biome/Biome.js";
export type { ColorModifier } from "./world/biome/ColorModifier.js";
export { GrassColorModifier } from "./world/biome/GrassColorModifier.js";

// world/mca/chunk (legacy 1.12 chunk-format)
export {
    Chunk_1_12,
    type Chunk_1_12Data,
    type Chunk_1_12Level,
    type Chunk_1_12SectionData,
    type ForgeBlockIdMappings,
    CHUNK_1_12_DATA_TOKEN,
    CHUNK_1_12_LEVEL_TOKEN,
    CHUNK_1_12_SECTION_TOKEN,
    CHUNK_1_12_DATA_SCHEMA,
    CHUNK_1_12_LEVEL_SCHEMA,
    CHUNK_1_12_SECTION_SCHEMA,
    registerChunk_1_12Schemas,
} from "./world/mca/chunk/Chunk_1_12.js";

// world/mca/legacy (pre-1.13 id/biome/block-properties mappings)
export { engineAssetPath, readLegacyJsonAsset } from "./world/mca/legacy/assets.js";
export { BlockIdConfig, type BlockIdMapper } from "./world/mca/legacy/BlockIdMapper.js";
export {
    LegacyBiomes,
    readColorInt,
    type LegacyBiomeData,
} from "./world/mca/legacy/LegacyBiomes.js";
export {
    BlockPropertiesConfig,
    LegacyBlockProperties,
    getLegacyBlockPropertiesMapper,
    setLegacyBlockPropertiesMapper,
    type BlockPropertiesMapper,
    type LegacyBlockPropertiesData,
} from "./world/mca/legacy/BlockPropertiesMapper.js";

// world/mca/legacy/extensions (neighbor-derived block-state properties for 1.12 chunks)
export {
    withProperty,
    type BlockStateAccess,
    type BlockStateExtension,
} from "./world/mca/legacy/extensions/BlockStateExtension.js";
export {
    applyLegacyExtensions,
    registerBlockStateExtension,
} from "./world/mca/legacy/extensions/BlockStateExtensions.js";

// world/mca
export {
    MCAUtil,
    addCommonNbtSettings,
    ceilLog2,
    getByteHalf,
    getValueFromLongStream,
    javaParseInt,
    longArrayHalves,
    NumberFormatError,
} from "./world/mca/MCAUtil.js";
export { PackedIntArrayAccess } from "./world/mca/PackedIntArrayAccess.js";
export type { ChunkLoader } from "./world/mca/ChunkLoader.js";
export { MCARegion } from "./world/mca/region/MCARegion.js";
export { LinearRegion } from "./world/mca/region/LinearRegion.js";
export {
    RegionType,
    type RegionFactory,
    type RegionFileNameFunction,
} from "./world/mca/region/RegionType.js";
export { MCAChunk, MCAChunkData, MCA_CHUNK_DATA_TOKEN } from "./world/mca/chunk/MCAChunk.js";
export {
    Chunk_1_13,
    Chunk_1_13_Data,
    CHUNK_1_13_DATA_TOKEN,
} from "./world/mca/chunk/Chunk_1_13.js";
export { Chunk_1_15 } from "./world/mca/chunk/Chunk_1_15.js";
export {
    Chunk_1_16,
    Chunk_1_16_Data,
    CHUNK_1_16_DATA_TOKEN,
} from "./world/mca/chunk/Chunk_1_16.js";
export {
    Chunk_1_18,
    Chunk_1_18_Data,
    CHUNK_1_18_DATA_TOKEN,
} from "./world/mca/chunk/Chunk_1_18.js";
// (chunk/LegacyBiomes — the upstream datapack-backed legacy-biome table — is aliased
// here because the port-specific world/mca/legacy/LegacyBiomes is already exported above)
export { LegacyBiomes as DataPackLegacyBiomes } from "./world/mca/chunk/LegacyBiomes.js";
export { MCAChunkLoader } from "./world/mca/chunk/MCAChunkLoader.js";
export { BlockEntityType } from "./world/mca/blockentity/BlockEntityType.js";
export { MCABlockEntity, MCA_BLOCK_ENTITY_TOKEN } from "./world/mca/blockentity/MCABlockEntity.js";
export {
    SignBlockEntity,
    LegacySignBlockEntity,
    SIGN_BLOCK_ENTITY_TOKEN,
    LEGACY_SIGN_BLOCK_ENTITY_TOKEN,
} from "./world/mca/blockentity/SignBlockEntity.js";
export {
    SkullBlockEntity,
    SKULL_BLOCK_ENTITY_TOKEN,
} from "./world/mca/blockentity/SkullBlockEntity.js";
export {
    BannerBlockEntity,
    BANNER_BLOCK_ENTITY_TOKEN,
} from "./world/mca/blockentity/BannerBlockEntity.js";
export { EntityType } from "./world/mca/entity/EntityType.js";
export { MCAEntity, MCA_ENTITY_TOKEN } from "./world/mca/entity/MCAEntity.js";
export { MCAEntityChunk, MCA_ENTITY_CHUNK_TOKEN } from "./world/mca/entity/chunk/MCAEntityChunk.js";
export { MCAEntityChunkLoader } from "./world/mca/entity/chunk/MCAEntityChunkLoader.js";
export { MCAWorld, ANVIL } from "./world/mca/MCAWorld.js";
export { ChunkGrid } from "./world/mca/ChunkGrid.js";
export { MCAWorldRegionWatchService } from "./world/mca/MCAWorldRegionWatchService.js";
export {
    BlockStateDeserializer,
    BLOCK_STATE_TOKEN,
} from "./world/mca/data/BlockStateDeserializer.js";
export { KeyDeserializer, KEY_TOKEN } from "./world/mca/data/KeyDeserializer.js";
export {
    UUIDDeserializer,
    UUID_TOKEN,
    uuidFromString,
    uuidToString,
} from "./world/mca/data/UUIDDeserializer.js";
export { Vector3dDeserializer, VECTOR3D_TOKEN } from "./world/mca/data/Vector3dDeserializer.js";
export { Vector3iDeserializer, VECTOR3I_TOKEN } from "./world/mca/data/Vector3iDeserializer.js";
export { Vector2iDeserializer, VECTOR2I_TOKEN } from "./world/mca/data/Vector2iDeserializer.js";
export { Vector2fDeserializer, VECTOR2F_TOKEN } from "./world/mca/data/Vector2fDeserializer.js";
export {
    BlockEntityTypeResolver,
    BLOCK_ENTITY_TOKEN,
} from "./world/mca/data/BlockEntityTypeResolver.js";
export { EntityTypeResolver, ENTITY_TOKEN } from "./world/mca/data/EntityTypeResolver.js";
export { SignBlockEntityTypeResolver } from "./world/mca/data/SignBlockEntityTypeResolver.js";
export { LenientBlockEntityArrayDeserializer } from "./world/mca/data/LenientBlockEntityArrayDeserializer.js";
export { LevelData, LEVEL_DATA_TOKEN } from "./world/mca/data/LevelData.js";
export { WorldGenSettings, WORLD_GEN_SETTINGS_TOKEN } from "./world/mca/data/WorldGenSettings.js";
export { DimensionSettings, DIMENSION_SETTINGS_TOKEN } from "./world/mca/data/DimensionSettings.js";
export {
    DimensionTypeDeserializer,
    DimensionTypeData,
    DIMENSION_TYPE_TOKEN,
    DIMENSION_TYPE_DATA_TOKEN,
} from "./world/mca/data/DimensionTypeDeserializer.js";

// storage/compression
export { Compression } from "./storage/compression/Compression.js";
export {
    BufferedCompression,
    type BufferCodec,
    type Compressor,
    type Decompressor,
    type StreamTransformer,
} from "./storage/compression/BufferedCompression.js";
export { NoCompression } from "./storage/compression/NoCompression.js";
export { CompressedInputStream } from "./storage/compression/CompressedInputStream.js";
export {
    CHECKSUM_MASK,
    COMPRESSION_LEVEL_BASE,
    COMPRESSION_METHOD_LZ4,
    COMPRESSION_METHOD_RAW,
    DEFAULT_BLOCK_SIZE,
    DEFAULT_SEED,
    HEADER_LENGTH,
    MAGIC,
    MAGIC_LENGTH,
    MAX_BLOCK_SIZE,
    MIN_BLOCK_SIZE,
    compressionLevel,
    createLz4BlockCompressStream,
    createLz4BlockDecompressStream,
    lz4BlockCompress,
    lz4BlockDecompress,
} from "./storage/compression/Lz4Block.js";
