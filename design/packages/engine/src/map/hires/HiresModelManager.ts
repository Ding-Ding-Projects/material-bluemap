import { Color, Grid, Vector2i, Vector3i } from "@worldlens/shared";
import type { ResourcePack } from "../../resources/pack/resourcepack/ResourcePack.js";
import type { GridStorage } from "../../storage/GridStorage.js";
import type { World } from "../../world/World.js";
import type { TextureGallery } from "../TextureGallery.js";
import type { TileMetaConsumer } from "../TileMetaConsumer.js";
import { ArrayTileModel } from "./ArrayTileModel.js";
import { MaxCapacityReachedException } from "./MaxCapacityReachedException.js";
import { writeTileModelToPRBM } from "./PRBMWriter.js";
import type { RenderPass } from "./RenderPass.js";
import { RenderPassType } from "./RenderPassType.js";
import type { RenderSettings } from "./RenderSettings.js";
import { TileModelView } from "./TileModelView.js";
import { VoidTileModel } from "./VoidTileModel.js";

/*
 * upstream: Logger.global — the logger-package is not part of this port (yet), see the
 * equivalent note in world/mca/MCAUtil.ts
 */
const noFloodKeys = new Set<string>();

/** upstream: Logger.global.noFloodWarning(key, message) — logs only once per key */
function noFloodWarning(key: string, message: string): void {
    if (noFloodKeys.has(key)) return;
    noFloodKeys.add(key);
    console.warn(message);
}

/** upstream: Logger.global.logError(message, throwable) */
function logError(message: string, ex: unknown): void {
    console.error(message, ex);
}

/** upstream: `Integer.MIN_VALUE` / `Integer.MAX_VALUE` */
const INTEGER_MIN_VALUE = -2147483648;
const INTEGER_MAX_VALUE = 2147483647;

/**
 * How far outside its own bounds a tile's render-passes reach when they read blocks.
 *
 * A pass meshes only the blocks between modelMin and modelMax, but meshing a block
 * consults its neighborhood, so a block sitting on the tile's edge reads across that
 * edge: face-culling and the ambient-occlusion samples look at the directly adjacent
 * blocks (±1), and the blended block-color calculators average the biome color over a
 * horizontal radius of 2 — `BlendedBlockColorCalculator`'s default `horizontalBlend`,
 * which every blended calculator type in the registry uses. Two blocks is therefore the
 * widest horizontal reach any pass has, and the chunks holding those blocks have to be
 * loaded as well or the edge columns mesh (and take their color) against phantom air.
 *
 * This is a margin on the *preload*, not on what gets meshed: loading a chunk the passes
 * end up not reading costs a cache-entry and nothing else.
 */
const NEIGHBOR_BLOCK_MARGIN = 2;

/**
 * upstream: map/hires/HiresModelManager.java
 *
 * Owns the hires render passes and turns "render tile (x,z)" into a .prbm item in the
 * map's hires {@link GridStorage}.
 *
 * Port notes:
 * - Upstream keeps the render-passes in a `ThreadLocal` because it renders tiles on a
 *   pool of threads and a pass instance is documented as single-threaded. A javascript
 *   engine instance has one thread, so the passes are plain instance state; running
 *   tiles in parallel means separate workers, each with their own manager.
 * - Saving is async, because the ported storage layer is: upstream's
 *   `try (OutputStream out = storage.write(x, z); ...)` becomes "serialize to bytes,
 *   then await the storage write". The bytes are identical either way.
 */
export class HiresModelManager {
    private readonly world: World;
    private readonly storage: GridStorage;
    private readonly renderPasses: readonly RenderPass[];
    private readonly tileUpdateListeners: ((tile: Vector2i) => void)[] = [];

    private readonly tileGrid: Grid;

    constructor(
        world: World,
        storage: GridStorage,
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
        tileGrid: Grid,
    ) {
        this.world = world;
        this.storage = storage;
        this.tileGrid = tileGrid;

        this.renderPasses = RenderPassType.REGISTRY.values().map((type) =>
            type.create(resourcePack, textureGallery, renderSettings),
        );
    }

    /** upstream: `Grid getTileGrid()` (lombok @Getter) */
    getTileGrid(): Grid {
        return this.tileGrid;
    }

    /**
     * Renders the given world tile with the provided render-settings
     *
     * upstream: `void render(Vector2i tile, TileMetaConsumer tileMetaConsumer, boolean save)`
     */
    async render(tile: Vector2i, tileMetaConsumer: TileMetaConsumer, save: boolean): Promise<void> {
        const modelMin = new Vector3i(
            this.tileGrid.getCellMinX(tile.getX()),
            INTEGER_MIN_VALUE,
            this.tileGrid.getCellMinY(tile.getY()),
        );
        const modelMax = new Vector3i(
            this.tileGrid.getCellMaxX(tile.getX()),
            INTEGER_MAX_VALUE,
            this.tileGrid.getCellMaxY(tile.getY()),
        );
        const modelAnchor = new Vector3i(modelMin.getX(), 0, modelMin.getZ());

        /*
         * Port-only: make every chunk this tile can read present before any pass starts.
         *
         * Upstream renders straight into a blocking LoadingCache, so a chunk that is not
         * cached yet is loaded on the spot and the pass never sees a hole. The ported
         * synchronous World accessors can not block — on a miss they schedule the load
         * and hand out an empty chunk (the chunk-io deviation, docs/deviations.md) — and
         * a synchronous pass never yields, so that load resolves long after the pass has
         * finished reading air. Without this await a tile is meshed against whatever
         * chunks *earlier tiles* happened to fault in: every column inside a chunk no
         * neighbouring tile had already touched comes out empty, and the columns beside
         * it grow faces against that phantom air. Which chunks those are depends on the
         * tile order, which is exactly the kind of result a render must not have.
         *
         * Awaiting the whole window here — rather than per pass, per column, or not at
         * all — is what makes a cold-cache render identical to a warm-cache one. It only
         * guarantees presence: a chunk that was already loaded is meshed exactly as
         * before, because nothing about the passes themselves changes.
         *
         * The window is derived from the tile bounds through the world's own chunk-grid,
         * so it stays correct for any tile size, grid offset, or chunk size rather than
         * assuming the 3x3 chunk block that the default 32x32 hires grid happens to give.
         */
        const chunkGrid = this.world.getChunkGrid();
        await this.world.preloadChunks(
            chunkGrid.getCellX(modelMin.getX() - NEIGHBOR_BLOCK_MARGIN),
            chunkGrid.getCellY(modelMin.getZ() - NEIGHBOR_BLOCK_MARGIN),
            chunkGrid.getCellX(modelMax.getX() + NEIGHBOR_BLOCK_MARGIN),
            chunkGrid.getCellY(modelMax.getZ() + NEIGHBOR_BLOCK_MARGIN),
        );

        if (save) {
            const model = ArrayTileModel.instancePool().claimInstance();
            const modelView = new TileModelView(model);

            try {
                for (const renderPass of this.renderPasses) {
                    // awaited because `EntityRenderPass` reads the entity chunks from
                    // disk, so its `render` returns a promise (see RenderPass)
                    await renderPass.render(
                        this.world,
                        modelMin,
                        modelMax,
                        modelAnchor,
                        modelView.initialize(),
                        tileMetaConsumer,
                    );
                }
            } catch (ex) {
                if (!(ex instanceof MaxCapacityReachedException)) throw ex;
                noFloodWarning(
                    "max-capacity-reached",
                    `One or more map-tiles are too complex to be completed (@~ ${String(modelMin)} to ${String(modelMax)}): ${String(ex)}`,
                );
            }

            model.sort();
            await this.save(model, tile);

            ArrayTileModel.instancePool().recycleInstance(model);
        } else {
            const modelView = new TileModelView(VoidTileModel.INSTANCE);
            for (const renderPass of this.renderPasses) {
                await renderPass.render(
                    this.world,
                    modelMin,
                    modelMax,
                    modelAnchor,
                    modelView.initialize(),
                    tileMetaConsumer,
                );
            }
        }
    }

    /**
     * Un-renders a tile.
     * The hires tile is deleted and the tileMetaConsumer (lowres) is updated with default
     * values in the tiles area.
     *
     * upstream: `void unrender(Vector2i tile, TileMetaConsumer tileMetaConsumer)`
     */
    async unrender(tile: Vector2i, tileMetaConsumer: TileMetaConsumer): Promise<void> {
        try {
            await this.storage.delete(tile.getX(), tile.getY());
        } catch (ex) {
            logError("Failed to delete hires model: " + String(tile), ex);
        }

        const color = new Color();
        this.tileGrid.forEachIntersecting(tile, Grid.UNIT, (x, z) => {
            tileMetaConsumer(x, z, color, 0, 0);
        });
    }

    /** upstream: `void addTileUpdateListener(Consumer<Vector2i> listener)` */
    addTileUpdateListener(listener: (tile: Vector2i) => void): void {
        this.tileUpdateListeners.push(listener);
    }

    /** upstream: `void removeTileUpdateListener(Consumer<Vector2i> listener)` */
    removeTileUpdateListener(listener: (tile: Vector2i) => void): void {
        const index = this.tileUpdateListeners.indexOf(listener);
        if (index >= 0) this.tileUpdateListeners.splice(index, 1);
    }

    /** upstream: `private void save(final ArrayTileModel model, Vector2i tile)` */
    private async save(model: ArrayTileModel, tile: Vector2i): Promise<void> {
        try {
            await this.storage.write(tile.getX(), tile.getY(), writeTileModelToPRBM(model));
        } catch (e) {
            logError("Failed to save hires model: " + String(tile), e);
            return;
        }

        // notify listeners that the tile changed
        for (const listener of [...this.tileUpdateListeners]) {
            listener(tile);
        }
    }
}
