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
export { Tristate } from "./util/Tristate.js";
export { WatchService } from "./util/WatchService.js";

// map (Phase C/D placeholders — replaced by the full ports)
export { Mask } from "./map/mask/Mask.js";
export type { RenderSettings } from "./map/hires/RenderSettings.js";
export { TextureGallery } from "./map/TextureGallery.js";

// resources
export { BlockColorsConfig } from "./resources/BlockColorsConfig.js";
export { BlockStateMapping } from "./resources/BlockStateMapping.js";
export { MinecraftVersion } from "./resources/MinecraftVersion.js";
export { MissingResourcesError } from "./resources/MissingResourcesError.js";
export { ResourcePath } from "./resources/ResourcePath.js";
export {
    CONNECTION_TIMEOUT,
    Download,
    Downloads,
    Latest,
    Version,
    VersionDetail,
    VersionManifest,
    type FetchFunction,
    type HttpResponse,
} from "./resources/VersionManifest.js";
// (resources/BlockPropertiesConfig — the modern `resources/BlockPropertiesConfig.java` —
// is aliased here because world/mca/legacy/BlockPropertiesMapper already exports a
// same-named class above: the port of the LEGACY (v0.10.3-mc1.12) block-properties
// config, which is a different upstream file with a different shape. The legacy one
// keeps the plain name it was exported under before this wave.)
export { BlockPropertiesConfig as ResourcesBlockPropertiesConfig } from "./resources/BlockPropertiesConfig.js";

// resources/pack
export { Pack, type Loader as PackLoader } from "./resources/pack/Pack.js";
export { PackExtension } from "./resources/pack/PackExtension.js";
export {
    Features,
    Overlay,
    Overlays,
    PackMeta,
    PackMetaPack,
    VersionRange,
    VersionRangeAdapter,
} from "./resources/pack/PackMeta.js";
export {
    PackVersion,
    PackVersionAdapter,
    PackVersionMaxAdapter,
    PackVersionMinAdapter,
} from "./resources/pack/PackVersion.js";
export {
    ResourcePool,
    type BinaryOperator,
    type Loader as ResourcePoolLoader,
} from "./resources/pack/ResourcePool.js";

// resources/pack/vfs
export {
    normalizePath,
    PackPath,
    type PackFileStats,
    type PackFileSystem,
} from "./resources/pack/vfs/PackFileSystem.js";
export { DirFileSystem } from "./resources/pack/vfs/DirFileSystem.js";
export { ZipFileSystem } from "./resources/pack/vfs/ZipFileSystem.js";

// resources/pack/datapack
export { DataPack } from "./resources/pack/datapack/DataPack.js";
// (Data/Effects are nested classes of DatapackBiome upstream; they are prefixed here
// because a barrel cannot carry names that generic)
export {
    DatapackBiome,
    Data as DatapackBiomeData,
    Effects as DatapackBiomeEffects,
} from "./resources/pack/datapack/biome/DatapackBiome.js";
// (the datapack DimensionTypeData is aliased because world/mca/data/DimensionTypeDeserializer
// already exports a same-named class above — the NBT-side copy of the same upstream
// @Data class, see docs/deviations.md)
export { DimensionTypeData as DatapackDimensionTypeData } from "./resources/pack/datapack/dimension/DimensionTypeData.js";

// resources/pack/resourcepack
// Value export, not `export type`: this was a placeholder interface until wave C3
// replaced it with the real class, and a type-only export would leave every
// consumer able to name a ResourcePack but unable to construct one.
export { ResourcePack } from "./resources/pack/resourcepack/ResourcePack.js";
// (the resourcepack BlockState — `blockstate/BlockState.java`, a blockstate-FILE — is
// aliased because world/BlockState, the in-world block state, already owns the plain
// name above; upstream keeps them apart by package)
export { BlockState as ResourcePackBlockState } from "./resources/pack/resourcepack/blockstate/BlockState.js";
export { BlockStateCondition } from "./resources/pack/resourcepack/blockstate/BlockStateCondition.js";
export { Multipart } from "./resources/pack/resourcepack/blockstate/Multipart.js";
export { MISSING_BLOCK_MODEL, Variant } from "./resources/pack/resourcepack/blockstate/Variant.js";
export { hashToFloat, VariantSet } from "./resources/pack/resourcepack/blockstate/VariantSet.js";
export { Variants } from "./resources/pack/resourcepack/blockstate/Variants.js";
export { Element } from "./resources/pack/resourcepack/model/Element.js";
export { Face } from "./resources/pack/resourcepack/model/Face.js";
// (Model.ts declares its own minimal `ResourcePool` interface for the model-pool it
// resolves against; the real resources/pack/ResourcePool is exported above, so only the
// Model class itself is re-exported here)
export { Model } from "./resources/pack/resourcepack/model/Model.js";
export { Rotation } from "./resources/pack/resourcepack/model/Rotation.js";
export { TextureVariable } from "./resources/pack/resourcepack/model/TextureVariable.js";
export { AnimationMeta, FrameMeta } from "./resources/pack/resourcepack/texture/AnimationMeta.js";
export { ColorMap } from "./resources/pack/resourcepack/texture/ColorMap.js";
export { Texture } from "./resources/pack/resourcepack/texture/Texture.js";
export { EntityState } from "./resources/pack/resourcepack/entitystate/EntityState.js";
export { Part } from "./resources/pack/resourcepack/entitystate/Part.js";

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

/**
 * Legacy 1.12 resource compatibility.
 *
 * The extension self-registers on `ResourcePack.Extension.REGISTRY` as an import side
 * effect, so importing this module is the whole wiring. Without this line it is dead code
 * and every 1.12 pack silently resolves to nothing, which is exactly the kind of failure
 * that looks like a rendering bug three phases later.
 */
export {
    registerLegacyResourcePackExtension,
    LegacyResourcePackExtension,
} from "./resources/pack/resourcepack/legacy/LegacyResourcePackExtension.js";
