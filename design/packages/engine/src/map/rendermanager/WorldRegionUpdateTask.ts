/**
 * upstream: `common/.../rendermanager/WorldRegionUpdateTask.java`
 *
 * One region's worth of map update: decide what each tile in the region needs, then do
 * exactly that and record the result.
 *
 * **This is the part that decides a tile should NOT be rendered**, and leaving it out is
 * not a missing optimisation. `BmMap.renderTile` renders whatever it is handed, so a
 * driver that walks the region's tile box and calls it for every cell produces tiles for
 * ungenerated terrain, keeps tiles upstream deletes, never blanks the lowres meta of a
 * rejected tile, and writes no render state at all - which is precisely what the Phase D
 * oracle measured before this existed: 253 tiles the java render did not write, six
 * render-state files it did, and lowres pixels that were terrain here and erasure there.
 *
 * ## What it is, and is not
 *
 * Upstream's class is a `RenderTask`: `doWork()` renders one tile per call so a thread
 * pool can interleave regions and a progress bar can advance. The port keeps the
 * *decisions* exactly and drops the scheduling: {@link WorldRegionUpdateTask.run} walks
 * the same tiles in the same order and awaits each one, because the port's `renderTile`
 * is async and a faithful `doWork()` would be a synchronous method that cannot await it.
 * Nothing about which tiles are rendered, deleted or left alone changes; only who calls
 * it and when.
 *
 * The comparators (`regionLastUpdatedComparator`, `defaultComparator`) and the
 * `Serialized` form belong to upstream's scheduler, which the port does not have yet, so
 * they are not here. They are ordering and resumption, not correctness, and inventing a
 * scheduler to hold them would be porting a shape rather than a behaviour.
 */

import { Vector2i } from "@material-bluemap/shared";
import type { Grid } from "@material-bluemap/shared";
import type { BmMap } from "../BmMap.js";
import { Chunk } from "../../world/Chunk.js";
import { ChunkConsumer } from "../../world/ChunkConsumer.js";
import { RenderSettings } from "../hires/RenderSettings.js";
import { Action, BoundsSituation } from "../renderstate/TileActionResolver.js";
import type { ActionAndNextState } from "../renderstate/TileActionResolver.js";
import { TileState } from "../renderstate/TileState.js";
import { TileInfo } from "../renderstate/TileInfoRegion.js";

/**
 * upstream: `TileUpdateStrategy` - reduced to what the port uses.
 *
 * Upstream's is an interface with `FORCE_ALL`, `FORCE_NONE` and a time-based strategy
 * that re-renders tiles older than a cutoff. The fixed forms are the two the render path
 * actually asks for today; the time-based one belongs with the scheduler that has a clock
 * to compare against.
 */
export interface TileUpdateStrategy {
    test(state: TileState): boolean;
}

export const TileUpdateStrategy = {
    /** upstream: `TileUpdateStrategy.fixed(boolean)` */
    fixed(force: boolean): TileUpdateStrategy {
        return { test: () => force };
    },
    FORCE_NONE: { test: () => false } as TileUpdateStrategy,
    FORCE_ALL: { test: () => true } as TileUpdateStrategy,
};

/** What one region's update did, so a caller can report it without re-deriving it. */
export interface WorldRegionUpdateResult {
    readonly rendered: number;
    readonly deleted: number;
    readonly unchanged: number;
}

export class WorldRegionUpdateTask {
    readonly #map: BmMap;
    readonly #regionPos: Vector2i;
    readonly #force: TileUpdateStrategy;

    #chunkGrid!: Grid;
    #tileGrid!: Grid;
    #chunkMin!: Vector2i;
    #chunkMax!: Vector2i;
    #chunksSize!: Vector2i;
    #tileMin!: Vector2i;
    #tileSize!: Vector2i;

    #chunkHashes: Int32Array | null = null;
    #tileActions: (ActionAndNextState | undefined)[] = [];

    constructor(map: BmMap, regionPos: Vector2i, force: TileUpdateStrategy = TileUpdateStrategy.FORCE_NONE) {
        this.#map = map;
        this.#regionPos = regionPos;
        this.#force = force;
    }

    getMap(): BmMap {
        return this.#map;
    }

    getRegionPos(): Vector2i {
        return this.#regionPos;
    }

    /**
     * upstream: `init()`, `doWork()` over every tile, then `complete()`.
     *
     * The three are one method here because the port has no scheduler slicing the work
     * across calls; the order within it is upstream's, x fastest, so a partially applied
     * run leaves the same prefix done as upstream's would.
     */
    async run(): Promise<WorldRegionUpdateResult> {
        await this.#init();

        let rendered = 0;
        let deleted = 0;
        let unchanged = 0;

        for (let z = 0; z < this.#tileSize.getY(); z++) {
            for (let x = 0; x < this.#tileSize.getX(); x++) {
                const action = this.#tileActions[this.#tileIndex(x, z)]?.action();
                await this.#processTile(x, z);
                if (action === Action.RENDER) rendered++;
                else if (action === Action.DELETE) deleted++;
                else unchanged++;
            }
        }

        await this.#complete();
        return { rendered, deleted, unchanged };
    }

    async #init(): Promise<void> {
        const world = this.#map.getWorld();
        const regionGrid = world.getRegionGrid();
        this.#chunkGrid = world.getChunkGrid();
        this.#tileGrid = this.#map.getHiresModelManager().getTileGrid();

        this.#chunkMin = regionGrid.getCellMin(this.#regionPos, this.#chunkGrid);
        this.#chunkMax = regionGrid.getCellMax(this.#regionPos, this.#chunkGrid);
        this.#chunksSize = this.#chunkMax.sub(this.#chunkMin).add(new Vector2i(1, 1));
        this.#tileMin = regionGrid.getCellMin(this.#regionPos, this.#tileGrid);
        const tileMax = regionGrid.getCellMax(this.#regionPos, this.#tileGrid);
        this.#tileSize = tileMax.sub(this.#tileMin).add(new Vector2i(1, 1));

        // The chunk hashes are the region's own modification timestamps, read once. The
        // cache invalidation beside it is upstream's and is load-bearing: a chunk read
        // before this region was re-scanned is a chunk from the previous state of the
        // world, and comparing it against the fresh hash would render stale terrain.
        this.#chunkHashes = new Int32Array(this.#chunksSize.getX() * this.#chunksSize.getY());
        const hashes = this.#chunkHashes;
        try {
            await world
                .getRegion(this.#regionPos.getX(), this.#regionPos.getY())
                .iterateAllChunks(
                    ChunkConsumer.listOnly((x, z, lastModified) => {
                        hashes[
                            this.#chunkIndex(x - this.#chunkMin.getX(), z - this.#chunkMin.getY())
                        ] = lastModified;
                        world.invalidateChunkCache(x, z);
                    }),
                );
        } catch (error) {
            // Upstream logs and cancels the task. Cancelling here would silently skip a
            // region and leave its tiles at whatever state they last had, which reads as
            // a successful update that rendered nothing, so the failure is raised.
            throw new Error(
                `failed to load chunks for region ${this.#regionPos.getX()},${this.#regionPos.getY()}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }

        const tileCount = this.#tileSize.getX() * this.#tileSize.getY();
        this.#tileActions = new Array<ActionAndNextState | undefined>(tileCount);
        let renderCount = 0;

        for (let x = 0; x < this.#tileSize.getX(); x++) {
            for (let z = 0; z < this.#tileSize.getY(); z++) {
                const tile = new Vector2i(this.#tileMin.getX() + x, this.#tileMin.getY() + z);
                const tileState = (
                    await this.#map.getMapTileState().get(tile.getX(), tile.getY())
                ).getState();

                // The `||` short-circuit is upstream's and is worth keeping literally: a
                // forced tile must not pay for the hash comparison.
                const changed =
                    this.#force.test(tileState) || (await this.#checkChunksHaveChanges(tile));
                const action = tileState.findActionAndNextState(changed, this.#checkTileBounds(tile));
                this.#tileActions[this.#tileIndex(x, z)] = action;
                if (action.action() === Action.RENDER) renderCount++;
            }
        }

        // Upstream's threshold, kept exactly: warming a whole region costs a region read,
        // which is worth it only when most of the region is about to be read anyway.
        if (renderCount >= tileCount * 0.75)
            await world.preloadRegionChunks(this.#regionPos.getX(), this.#regionPos.getY());
    }

    /**
     * upstream: `processTile(int, int)`.
     *
     * Every path ends in a state write, including the failure path, because a tile whose
     * render threw and whose state was left alone is a tile the next run will believe is
     * fine. `RENDER_ERROR` is the initial value for exactly that reason.
     */
    async #processTile(x: number, z: number): Promise<void> {
        const tile = new Vector2i(this.#tileMin.getX() + x, this.#tileMin.getY() + z);
        const action = this.#tileActions[this.#tileIndex(x, z)];
        let resultState = TileState.RENDER_ERROR;

        try {
            if (action === undefined) {
                resultState = TileState.RENDER_ERROR;
            } else if (action.action() === Action.NONE) {
                resultState = action.state();
            } else if (action.action() === Action.RENDER) {
                await this.#preloadTileChunks(tile);
                const failedState = this.#checkTileRenderPreconditions(tile);
                if (failedState !== null) {
                    await this.#map.unrenderTile(tile);
                    resultState = failedState;
                } else {
                    await this.#map.renderTile(tile);
                    resultState = action.state();
                }
            } else {
                await this.#map.unrenderTile(tile);
                resultState = action.state();
            }
        } catch {
            // Upstream logs and carries on to the next tile: one unrenderable tile must
            // not abandon the rest of the region. The state written below records it.
            resultState = TileState.RENDER_ERROR;
        } finally {
            await this.#map
                .getMapTileState()
                .set(tile.getX(), tile.getY(), new TileInfo(Math.floor(Date.now() / 1000), resultState));
        }
    }

    /** upstream: `complete()` - the chunk hashes and the region timestamp are saved here. */
    async #complete(): Promise<void> {
        if (this.#chunkHashes !== null) {
            for (let x = 0; x < this.#chunksSize.getX(); x++) {
                for (let z = 0; z < this.#chunksSize.getY(); z++) {
                    const hash = this.#chunkHashes[this.#chunkIndex(x, z)] ?? 0;
                    await this.#map
                        .getMapChunkState()
                        .set(this.#chunkMin.getX() + x, this.#chunkMin.getY() + z, hash);
                }
            }
            this.#chunkHashes = null;
        }

        const region = this.#map.getWorld().getRegion(this.#regionPos.getX(), this.#regionPos.getY());
        if (region.exists()) {
            await this.#map
                .getMapRegionState()
                .set(this.#regionPos.getX(), this.#regionPos.getY(), Math.floor(Date.now() / 1000));
        } else {
            await this.#map
                .getMapRegionState()
                .delete(this.#regionPos.getX(), this.#regionPos.getY());
        }

        this.#tileActions = [];
    }

    #chunkIndex(x: number, z: number): number {
        return z * this.#chunksSize.getX() + x;
    }

    #tileIndex(x: number, z: number): number {
        return z * this.#tileSize.getX() + x;
    }

    /**
     * upstream: `checkChunksHaveChanges(Vector2i)`.
     *
     * Only chunks inside this region are consulted. A tile straddling a region boundary
     * has neighbours whose hashes belong to another region's task, and reading them from
     * this region's array would compare against a zero that means "not in this region"
     * rather than "never rendered".
     */
    async #checkChunksHaveChanges(tile: Vector2i): Promise<boolean> {
        const minX = this.#tileGrid.getCellMinX(tile.getX(), this.#chunkGrid);
        const maxX = this.#tileGrid.getCellMaxX(tile.getX(), this.#chunkGrid);
        const minZ = this.#tileGrid.getCellMinY(tile.getY(), this.#chunkGrid);
        const maxZ = this.#tileGrid.getCellMaxY(tile.getY(), this.#chunkGrid);

        for (let chunkX = minX; chunkX <= maxX; chunkX++) {
            for (let chunkZ = minZ; chunkZ <= maxZ; chunkZ++) {
                if (
                    chunkX >= this.#chunkMin.getX() &&
                    chunkX <= this.#chunkMax.getX() &&
                    chunkZ >= this.#chunkMin.getY() &&
                    chunkZ <= this.#chunkMax.getY()
                ) {
                    const hash =
                        this.#chunkHashes?.[
                            this.#chunkIndex(chunkX - this.#chunkMin.getX(), chunkZ - this.#chunkMin.getY())
                        ] ?? 0;
                    if ((await this.#map.getMapChunkState().get(chunkX, chunkZ)) !== hash)
                        return true;
                }
            }
        }

        return false;
    }

    /**
     * Makes sure every chunk this tile reads is in the cache before anything reads one.
     *
     * Upstream has no counterpart because it does not need one: its `World#getChunk`
     * loads on demand, so a precondition check that asks about an unloaded chunk gets the
     * chunk. The port's is synchronous and answers a cache miss with an *empty* chunk,
     * which reports itself as not generated - so a tile whose chunks happened not to be
     * warm was rejected as ungenerated terrain and unrendered.
     *
     * The tiles that suffer are the ones on a region boundary, and only once a world is
     * big enough to have one. A tile at the far edge of a region reads a chunk belonging
     * to the *next* region, which this region's task never loaded: at 1000x1000 that was
     * the whole of tile column 15, 23 tiles the reference rendered and the port erased.
     * Loading by chunk range rather than by region is what makes that work, because the
     * range crosses the boundary and a region does not.
     *
     * `preloadChunks` resolves from the cache when it can and dedups a load already in
     * flight, so on the warm interior of a region this is a walk over resolved promises.
     */
    async #preloadTileChunks(tile: Vector2i): Promise<void> {
        await this.#map
            .getWorld()
            .preloadChunks(
                this.#tileGrid.getCellMinX(tile.getX(), this.#chunkGrid),
                this.#tileGrid.getCellMinY(tile.getY(), this.#chunkGrid),
                this.#tileGrid.getCellMaxX(tile.getX(), this.#chunkGrid),
                this.#tileGrid.getCellMaxY(tile.getY(), this.#chunkGrid),
            );
    }

    /** upstream: `checkTileBounds(Vector2i)` */
    #checkTileBounds(tile: Vector2i): BoundsSituation {
        const settings = this.#map.getMapSettings();
        if (!RenderSettings.isInsideRenderBoundariesOfCell(settings, tile, this.#tileGrid, true))
            return BoundsSituation.OUTSIDE;
        return RenderSettings.isInsideRenderBoundariesOfCell(settings, tile, this.#tileGrid, false)
            ? BoundsSituation.INSIDE
            : BoundsSituation.EDGE;
    }

    /**
     * upstream: `checkTileRenderPreconditions(Vector2i)` - null means "render it".
     *
     * The order of the checks is upstream's and is observable: an errored chunk beats a
     * missing one, and the light check runs before the generated-flag is remembered, so a
     * generated-but-unlit chunk reports `MISSING_LIGHT` rather than being rendered dark.
     */
    #checkTileRenderPreconditions(tile: Vector2i): TileState | null {
        const settings = this.#map.getMapSettings();
        const world = this.#map.getWorld();

        let chunksAreGenerated = false;
        let chunksAreInhabited = false;

        const minInhabitedTime = settings.getMinInhabitedTime();
        const minInhabitedTimeRadius = settings.getMinInhabitedTimeRadius();
        const requireLight = !settings.isIgnoreMissingLightData();

        const minX = this.#tileGrid.getCellMinX(tile.getX(), this.#chunkGrid);
        const maxX = this.#tileGrid.getCellMaxX(tile.getX(), this.#chunkGrid);
        const minZ = this.#tileGrid.getCellMinY(tile.getY(), this.#chunkGrid);
        const maxZ = this.#tileGrid.getCellMaxY(tile.getY(), this.#chunkGrid);

        for (let chunkX = minX; chunkX <= maxX; chunkX++) {
            for (let chunkZ = minZ; chunkZ <= maxZ; chunkZ++) {
                const chunk = world.getChunk(chunkX, chunkZ);
                if (chunk === Chunk.ERRORED_CHUNK) return TileState.CHUNK_ERROR;
                if (requireLight) {
                    if (!chunk.isGenerated()) return TileState.NOT_GENERATED;
                    if (!chunk.hasLightData()) return TileState.MISSING_LIGHT;
                }
                if (chunk.isGenerated()) chunksAreGenerated = true;
                if (chunk.getInhabitedTime() >= minInhabitedTime) chunksAreInhabited = true;
            }
        }

        if (!chunksAreGenerated) return TileState.NOT_GENERATED;

        if (!chunksAreInhabited && minInhabitedTimeRadius > 0) {
            for (
                let chunkX = minX - minInhabitedTimeRadius;
                chunkX <= maxX + minInhabitedTimeRadius && !chunksAreInhabited;
                chunkX++
            ) {
                for (
                    let chunkZ = minZ - minInhabitedTimeRadius;
                    chunkZ <= maxZ + minInhabitedTimeRadius;
                    chunkZ++
                ) {
                    if (world.getChunk(chunkX, chunkZ).getInhabitedTime() >= minInhabitedTime) {
                        chunksAreInhabited = true;
                        break;
                    }
                }
            }
        }

        return chunksAreInhabited ? null : TileState.LOW_INHABITED_TIME;
    }
}
