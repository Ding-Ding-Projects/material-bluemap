import { statSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BlueNBT, type TypeToken } from "@material-bluemap/nbt";
import { Key, type Grid, type Vector2i } from "@material-bluemap/shared";
import type { DataPack } from "../../resources/pack/datapack/DataPack.js";
import { Compression } from "../../storage/compression/Compression.js";
import type { WatchService } from "../../util/WatchService.js";
import type { Biome } from "../biome/Biome.js";
import type { BlockEntity } from "../BlockEntity.js";
import type { BlockState } from "../BlockState.js";
import { Chunk } from "../Chunk.js";
import { DimensionType } from "../DimensionType.js";
import type { Entity } from "../Entity.js";
import type { LightData } from "../LightData.js";
import type { Region } from "../Region.js";
import { World } from "../World.js";
import { WorldLoaderType } from "../WorldLoaderType.js";
import { ChunkGrid } from "./ChunkGrid.js";
import { Chunk_1_12 } from "./chunk/Chunk_1_12.js";
import { MCAChunkLoader } from "./chunk/MCAChunkLoader.js";
import type { DimensionSettings } from "./data/DimensionSettings.js";
import {
    DimensionTypeDeserializer,
    DIMENSION_TYPE_TOKEN,
} from "./data/DimensionTypeDeserializer.js";
import { LEVEL_DATA_TOKEN } from "./data/LevelData.js";
import { WORLD_GEN_SETTINGS_TOKEN } from "./data/WorldGenSettings.js";
import type { MCAEntityChunk } from "./entity/chunk/MCAEntityChunk.js";
import { MCAEntityChunkLoader } from "./entity/chunk/MCAEntityChunkLoader.js";
import { applyLegacyExtensions } from "./legacy/extensions/BlockStateExtensions.js";
import type { BlockStateAccess } from "./legacy/extensions/BlockStateExtension.js";
import { addCommonNbtSettings, logWarning } from "./MCAUtil.js";

// upstream: DataPack.DIMENSION_OVERWORLD / DIMENSION_THE_NETHER / DIMENSION_THE_END —
// defined here until the resources datapack-port lands (see also data/LevelData.ts)
const DIMENSION_OVERWORLD: Key = new Key("minecraft", "overworld");
const DIMENSION_THE_NETHER: Key = new Key("minecraft", "the_nether");
const DIMENSION_THE_END: Key = new Key("minecraft", "the_end");

/** Files.isDirectory(path) */
function isDirectory(path: string): boolean {
    try {
        return statSync(path).isDirectory();
    } catch {
        return false;
    }
}

export class MCAWorld implements World {
    private readonly id: string;
    private readonly worldFolder: string;
    private readonly dimension: Key;
    private readonly dataPack: DataPack;

    private readonly dimensionType: DimensionType;
    private readonly dimensionFolder: string;

    private readonly blockChunkGrid: ChunkGrid<Chunk>;
    private readonly entityChunkGrid: ChunkGrid<MCAEntityChunk>;

    /**
     * Cached legacy-extension views of pre-1.13 chunks handed out by
     * {@link MCAWorld#getChunk} (see {@link MCAWorld#getExtendedBlockState})
     */
    private readonly legacyExtendedChunks = new WeakMap<Chunk_1_12, Chunk>();

    /**
     * Resolves raw (unextended) block-states through the world across chunk-borders:
     * the neighbor-receiver for the legacy block-state extensions. (The legacy
     * World#getBlockState read the plain chunk block-state, so neighbor-lookups never
     * recurse into the extensions.)
     */
    private readonly rawBlockStateAccess: BlockStateAccess = (x, y, z) =>
        this.blockChunkGrid.getCachedChunk(x >> 4, z >> 4).getBlockState(x, y, z);

    private constructor(
        worldFolder: string,
        dimension: Key,
        dimensionType: DimensionType,
        dimensionFolder: string,
        dataPack: DataPack,
    ) {
        this.id = World.id(worldFolder, dimension);
        this.worldFolder = worldFolder;
        this.dimension = dimension;
        this.dimensionType = dimensionType;
        this.dimensionFolder = dimensionFolder;
        this.dataPack = dataPack;

        this.blockChunkGrid = new ChunkGrid<Chunk>(
            new MCAChunkLoader(this),
            join(dimensionFolder, "region"),
        );
        this.entityChunkGrid = new ChunkGrid<MCAEntityChunk>(
            new MCAEntityChunkLoader(),
            join(dimensionFolder, "entities"),
        );
    }

    getId(): string {
        return this.id;
    }

    getWorldFolder(): string {
        return this.worldFolder;
    }

    getDimension(): Key {
        return this.dimension;
    }

    getDataPack(): DataPack {
        return this.dataPack;
    }

    getDimensionType(): DimensionType {
        return this.dimensionType;
    }

    getDimensionFolder(): string {
        return this.dimensionFolder;
    }

    getBlockChunkGrid(): ChunkGrid<Chunk> {
        return this.blockChunkGrid;
    }

    getEntityChunkGrid(): ChunkGrid<MCAEntityChunk> {
        return this.entityChunkGrid;
    }

    getChunkGrid(): Grid {
        return this.blockChunkGrid.getChunkGrid();
    }

    getRegionGrid(): Grid {
        return this.blockChunkGrid.getRegionGrid();
    }

    getChunkAtBlock(x: number, z: number): Chunk {
        return this.getChunk(x >> 4, z >> 4);
    }

    getChunk(x: number, z: number): Chunk {
        return this.extendChunk(this.blockChunkGrid.getCachedChunk(x, z));
    }

    getRegion(x: number, z: number): Region<Chunk> {
        return this.blockChunkGrid.getRegion(x, z);
    }

    listRegions(): Vector2i[] {
        return this.blockChunkGrid.listRegions();
    }

    createRegionWatchService(): WatchService<Vector2i> {
        return this.blockChunkGrid.createRegionWatchService();
    }

    async preloadRegionChunks(
        x: number,
        z: number,
        chunkFilter: (pos: Vector2i) => boolean = () => true,
    ): Promise<void> {
        await this.blockChunkGrid.preloadRegionChunks(x, z, chunkFilter);
        await this.entityChunkGrid.preloadRegionChunks(x, z, chunkFilter);
    }

    invalidateChunkCache(): void;
    invalidateChunkCache(x: number, z: number): void;
    invalidateChunkCache(x?: number, z?: number): void {
        if (x === undefined || z === undefined) {
            this.blockChunkGrid.invalidateChunkCache();
            this.entityChunkGrid.invalidateChunkCache();
        } else {
            this.blockChunkGrid.invalidateChunkCache(x, z);
            this.entityChunkGrid.invalidateChunkCache(x, z);
        }
    }

    async iterateEntities(
        minX: number,
        minZ: number,
        maxX: number,
        maxZ: number,
        entityConsumer: (entity: Entity) => void,
    ): Promise<void> {
        const minChunkX = minX >> 4,
            minChunkZ = minZ >> 4;
        const maxChunkX = maxX >> 4,
            maxChunkZ = maxZ >> 4;

        for (let x = minChunkX; x <= maxChunkX; x++) {
            for (let z = minChunkZ; z <= maxChunkZ; z++) {
                const entities = (await this.entityChunkGrid.getChunk(x, z)).getEntities();
                for (let i = 0; i < entities.length; i++) {
                    const entity = entities[i]!;
                    const pos = entity.getPos();
                    const pX = pos.getFloorX();
                    const pZ = pos.getFloorZ();

                    if (pX >= minX && pX <= maxX && pZ >= minZ && pZ <= maxZ) {
                        entityConsumer(entities[i]!);
                    }
                }
            }
        }
    }

    /**
     * upstream (legacy v0.10.3-mc1.12): MCAWorld#getExtendedBlockState — resurrected for
     * the pre-1.13 chunk-format, applied on every block-state access through
     * {@link MCAWorld#getChunk} (the wrapping happens in {@link MCAWorld#extendChunk})
     */
    getExtendedBlockState(chunk: Chunk, x: number, y: number, z: number): BlockState {
        let blockState = chunk.getBlockState(x, y, z);

        if (chunk instanceof Chunk_1_12) {
            // only use extensions if old format chunk (1.12) in the new format block-states are saved with extensions
            blockState = applyLegacyExtensions(blockState, x, y, z, this.rawBlockStateAccess);
        }

        return blockState;
    }

    /**
     * Wraps pre-1.13 chunks in a view applying the legacy block-state extensions;
     * every other chunk is returned unchanged (keeping the EMPTY_CHUNK/ERRORED_CHUNK
     * identities intact).
     */
    private extendChunk(chunk: Chunk): Chunk {
        if (!(chunk instanceof Chunk_1_12)) return chunk;

        let extended = this.legacyExtendedChunks.get(chunk);
        if (extended === undefined) {
            extended = new LegacyExtendedChunk(this, chunk);
            this.legacyExtendedChunks.set(chunk, extended);
        }
        return extended;
    }

    /** lombok: @ToString */
    toString(): string {
        return (
            `MCAWorld(id=${this.id}, worldFolder=${this.worldFolder}, ` +
            `dimension=${String(this.dimension)}, dataPack=${String(this.dataPack)}, ` +
            `dimensionType=${String(this.dimensionType)}, dimensionFolder=${this.dimensionFolder}, ` +
            `blockChunkGrid=${String(this.blockChunkGrid)}, entityChunkGrid=${String(this.entityChunkGrid)})`
        );
    }

    static async load(
        worldFolder: string,
        dimension: Key,
        dimensionTypeKey: Key | null,
        dataPack: DataPack,
    ): Promise<MCAWorld> {
        const dimensionType: DimensionType =
            dimensionTypeKey == null
                ? await MCAWorld.loadDimensionType(worldFolder, dimension, dataPack)
                : // upstream: DataPack#getDimensionType is @Nullable and a possible null
                  // is stored unchecked — kept bug-for-bug (hence the assertion)
                  dataPack.getDimensionType(dimensionTypeKey)!;
        const dimensionFolder = MCAWorld.resolveDimensionFolder(worldFolder, dimension);
        return new MCAWorld(worldFolder, dimension, dimensionType, dimensionFolder, dataPack);
    }

    static resolveDimensionFolder(worldFolder: string, dimension: Key): string {
        const dimensionFolder = join(
            worldFolder,
            "dimensions",
            dimension.getNamespace(),
            dimension.getValue(),
        );
        if (isDirectory(dimensionFolder)) return dimensionFolder;

        // try legacy format
        const legacyDimensionFolder = MCAWorld.legacyDimensionFolder(worldFolder, dimension);
        if (isDirectory(join(legacyDimensionFolder, "region"))) return legacyDimensionFolder;

        // might exist later
        return dimensionFolder;
    }

    private static legacyDimensionFolder(worldFolder: string, dimension: Key): string {
        if (DIMENSION_OVERWORLD.equals(dimension)) return worldFolder;
        if (DIMENSION_THE_NETHER.equals(dimension)) return join(worldFolder, "DIM-1");
        if (DIMENSION_THE_END.equals(dimension)) return join(worldFolder, "DIM1");
        return join(worldFolder, "dimensions", dimension.getNamespace(), dimension.getValue());
    }

    static async loadDimensionType(
        worldFolder: string,
        dimension: Key,
        dataPack: DataPack,
    ): Promise<DimensionType> {
        const dimensionFolder = MCAWorld.resolveDimensionFolder(worldFolder, dimension);
        const blueNBT = MCAWorld.createBlueNBTForDataPack(dataPack);
        let dimensionSettings: DimensionSettings | null = null;

        let worldGenSettings = await MCAWorld.loadNbt(
            WORLD_GEN_SETTINGS_TOKEN,
            join(dimensionFolder, "data/minecraft/world_gen_settings.dat"),
            blueNBT,
        );
        if (worldGenSettings == null) {
            worldGenSettings = await MCAWorld.loadNbt(
                WORLD_GEN_SETTINGS_TOKEN,
                join(worldFolder, "data/minecraft/world_gen_settings.dat"),
                blueNBT,
            );
        }

        if (worldGenSettings != null) {
            dimensionSettings =
                worldGenSettings.getData().getDimensions().get(dimension.getFormatted()) ?? null;
        }

        if (dimensionSettings == null) {
            // try loading from the level.dat instead (old world format)
            const levelData = await MCAWorld.loadNbt(
                LEVEL_DATA_TOKEN,
                join(worldFolder, "level.dat"),
                blueNBT,
            );
            if (levelData != null) {
                dimensionSettings =
                    levelData
                        .getData()
                        .getWorldGenSettings()
                        .getDimensions()
                        .get(dimension.getFormatted()) ?? null;
            }
        }

        if (dimensionSettings != null) return dimensionSettings.getType();

        if (DIMENSION_OVERWORLD.equals(dimension)) return DimensionType.OVERWORLD;
        else if (DIMENSION_THE_NETHER.equals(dimension)) return DimensionType.NETHER;
        else if (DIMENSION_THE_END.equals(dimension)) return DimensionType.END;

        logWarning(
            "The world-data does not contain any info about a dimension with the id '" +
                dimension.getFormatted() +
                "', using fallback.",
        );
        return DimensionType.OVERWORLD;
    }

    private static createBlueNBTForDataPack(dataPack: DataPack): BlueNBT {
        const blueNBT = addCommonNbtSettings(new BlueNBT());
        blueNBT.register(DIMENSION_TYPE_TOKEN, new DimensionTypeDeserializer(blueNBT, dataPack));
        return blueNBT;
    }

    /** upstream: the private static {@code <T> T load(Class<T>, Path, BlueNBT)} overload */
    private static async loadNbt<T>(
        type: TypeToken<T>,
        path: string,
        blueNBT: BlueNBT,
    ): Promise<T | null> {
        if (!existsSync(path)) return null;
        const fileData = await readFile(path);
        const decompressed = await Compression.GZIP.decompress(fileData);
        return blueNBT.read(decompressed, type);
    }
}

/**
 * Chunk-view over a pre-1.13 chunk that applies the legacy block-state extensions on
 * block-state access; everything else delegates to the wrapped chunk.
 */
class LegacyExtendedChunk extends Chunk {
    constructor(
        private readonly world: MCAWorld,
        private readonly delegate: Chunk_1_12,
    ) {
        super();
    }

    override isGenerated(): boolean {
        return this.delegate.isGenerated();
    }

    override hasLightData(): boolean {
        return this.delegate.hasLightData();
    }

    override getInhabitedTime(): number {
        return this.delegate.getInhabitedTime();
    }

    override getBlockState(x: number, y: number, z: number): BlockState {
        return this.world.getExtendedBlockState(this.delegate, x, y, z);
    }

    override getLightData(x: number, y: number, z: number, target: LightData): LightData {
        return this.delegate.getLightData(x, y, z, target);
    }

    override getBiome(x: number, y: number, z: number): Biome {
        return this.delegate.getBiome(x, y, z);
    }

    override getMaxY(x: number, z: number): number {
        return this.delegate.getMaxY(x, z);
    }

    override getMinY(x: number, z: number): number {
        return this.delegate.getMinY(x, z);
    }

    override hasWorldSurfaceHeights(): boolean {
        return this.delegate.hasWorldSurfaceHeights();
    }

    override getWorldSurfaceY(x: number, z: number): number {
        return this.delegate.getWorldSurfaceY(x, z);
    }

    override hasOceanFloorHeights(): boolean {
        return this.delegate.hasOceanFloorHeights();
    }

    override getOceanFloorY(x: number, z: number): number {
        return this.delegate.getOceanFloorY(x, z);
    }

    override getBlockEntity(x: number, y: number, z: number): BlockEntity | null {
        return this.delegate.getBlockEntity(x, y, z);
    }

    override iterateBlockEntities(consumer: (blockEntity: BlockEntity) => void): void {
        this.delegate.iterateBlockEntities(consumer);
    }
}

/**
 * upstream: WorldLoaderType.ANVIL — defined here (in the mca-package) and
 * self-registered into WorldLoaderType.REGISTRY, so the world-package stays free of a
 * runtime-dependency on the mca-package (see the note in WorldLoaderType.ts)
 */
export const ANVIL: WorldLoaderType = new WorldLoaderType.Impl(Key.bluemap("anvil"), {
    loadWorld: (path, dimension, dimensionType, dataPack) =>
        MCAWorld.load(path, dimension, dimensionType, dataPack),
});
WorldLoaderType.REGISTRY.register(ANVIL);
