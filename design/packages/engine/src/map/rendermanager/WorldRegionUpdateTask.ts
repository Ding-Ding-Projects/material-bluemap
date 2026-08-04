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
 * pool can interleave regions and a progress bar can advance.
 *
 * Both driving styles are here, over the same decisions:
 * - {@link WorldRegionUpdateTask.run} walks every tile of the region in one call and
 *   reports what it did. It is what the oracle harness and any "render this region now"
 *   caller wants, and it predates the render manager.
 * - {@link WorldRegionUpdateTask.doWork} is upstream's slice: one tile per call, with the
 *   same cursor, the same completion rule and the same cancellation semantics, so a
 *   scheduler can interleave regions and report progress. It landed with the rest of the
 *   task hierarchy, since `MapUpdateTask` is a list of these.
 *
 * The comparators (`regionLastUpdatedComparator`, `defaultComparator`) are here too — they
 * decide which region a `MapUpdateTask` renders first, which is behaviour, not decoration.
 * The `Serialized` form is still absent: it is resumption across process restarts, and it
 * needs a serialization registry this port does not have.
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
import type { MapRenderTask } from "./MapRenderTask.js";
import { RenderTask } from "./RenderTask.js";
import { TileUpdateStrategy } from "./TileUpdateStrategy.js";

/*
 * upstream: Logger.global — the logger-package is not part of this port (yet), see the
 * equivalent note in map/BmMap.ts
 */
function logError(message: string, ex: unknown): void {
    console.error(message, ex);
}

/**
 * `TileUpdateStrategy` used to be declared here, as `{ test }` with a `fixed()` that built
 * a fresh object per call. It now lives in its own module with upstream's shape — a
 * `Keyed` interface, three registered singletons including the `FORCE_EDGE` this file's
 * copy was missing, and a `fixed()` that returns those singletons. The singleton part is
 * not cosmetic: {@link WorldRegionUpdateTask.equals} compares strategies by identity,
 * exactly as upstream does, so a per-call object made two identical region tasks unequal
 * and let the same region be scheduled twice.
 *
 * Re-exported from here so existing importers keep working.
 */
export { TileUpdateStrategy } from "./TileUpdateStrategy.js";

/** What one region's update did, so a caller can report it without re-deriving it. */
export interface WorldRegionUpdateResult {
    readonly rendered: number;
    readonly deleted: number;
    readonly unchanged: number;
}

export class WorldRegionUpdateTask implements MapRenderTask {
    readonly #map: BmMap;
    readonly #regionPos: Vector2i;
    readonly #force: TileUpdateStrategy;

    /* upstream's `volatile` scheduling state — see the doWork block near the bottom */
    #nextTileX = 0;
    #nextTileZ = 0;
    #atWork = 0;
    #completed = false;
    #cancelled = false;
    #initialised = false;
    #nothingToDo = false;
    /** Serialises the claim-a-tile step; upstream's `synchronized (this)`, see {@link claimTile} */
    #claimChain: Promise<Vector2i | null> = Promise.resolve(null);

    #chunkGrid!: Grid;
    #tileGrid!: Grid;
    #chunkMin!: Vector2i;
    #chunkMax!: Vector2i;
    #chunksSize!: Vector2i;
    #tileMin!: Vector2i;
    #tileSize!: Vector2i;

    #chunkHashes: Int32Array | null = null;
    #tileActions: (ActionAndNextState | undefined)[] = [];

    constructor(
        map: BmMap,
        regionPos: Vector2i,
        force: TileUpdateStrategy = TileUpdateStrategy.FORCE_NONE,
    ) {
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

    getForce(): TileUpdateStrategy {
        return this.#force;
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
            await world.getRegion(this.#regionPos.getX(), this.#regionPos.getY()).iterateAllChunks(
                ChunkConsumer.listOnly((x, z, lastModified) => {
                    hashes[this.#chunkIndex(x - this.#chunkMin.getX(), z - this.#chunkMin.getY())] =
                        lastModified;
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
        let deleteCount = 0;

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
                const action = tileState.findActionAndNextState(
                    changed,
                    this.#checkTileBounds(tile),
                );
                this.#tileActions[this.#tileIndex(x, z)] = action;
                if (action.action() === Action.RENDER) renderCount++;
                if (action.action() === Action.DELETE) deleteCount++;
            }
        }

        // Upstream's threshold, kept exactly: warming a whole region costs a region read,
        // which is worth it only when most of the region is about to be read anyway.
        if (renderCount >= tileCount * 0.75)
            await world.preloadRegionChunks(this.#regionPos.getX(), this.#regionPos.getY());

        // upstream: `if (tileRenderCount + tileDeleteCount == 0) completed = true;`
        //
        // A region with nothing to render and nothing to delete finishes here, and note
        // what that skips: `doWork` returns before processing a single tile, so
        // `complete()` never runs and neither the chunk hashes nor the region timestamp
        // are written. That is upstream's behaviour and it is consistent — nothing
        // changed, so there is nothing new to record. Only the sliced `doWork` path
        // observes this; `run` predates it and still walks and completes unconditionally.
        this.#nothingToDo = renderCount + deleteCount === 0;
        this.#initialised = true;
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
                .set(
                    tile.getX(),
                    tile.getY(),
                    new TileInfo(Math.floor(Date.now() / 1000), resultState),
                );
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

        const region = this.#map
            .getWorld()
            .getRegion(this.#regionPos.getX(), this.#regionPos.getY());
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
        // upstream: `map.save(TimeUnit.MINUTES.toMillis(1))` — keep a long render's
        // work durable without turning every region into a disk write.
        await this.#map.saveIfDue(60_000);
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
                            this.#chunkIndex(
                                chunkX - this.#chunkMin.getX(),
                                chunkZ - this.#chunkMin.getY(),
                            )
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

    /* ---------------------------------------------------------------------------------
     * RenderTask - upstream's sliced driver, one tile per doWork() call.
     *
     * Everything below drives the same #init / #processTile / #complete above; nothing
     * here decides anything about a tile that `run` does not decide identically.
     * ------------------------------------------------------------------------------- */

    /**
     * upstream: `doWork()`.
     *
     * Upstream's body is two `synchronized` blocks around one `processTile` call. The
     * first claims a tile and advances the cursor; the second decrements the in-flight
     * count and completes the region when the last worker leaves. Between them the lock is
     * released, which is what lets several threads render tiles of the same region at once.
     *
     * Javascript has no preemption, but it does interleave at every `await` — and both
     * `#init` and `#processTile` await. So the claim cannot simply be a synchronous prefix
     * the way it can in {@link CombinedRenderTask}: two callers would both see the cursor
     * at (0,0), both await `#init`, and both render tile (0,0). {@link claimTile}
     * serialises the whole claim through a promise chain instead, which is this port's
     * established stand-in for `synchronized` around an await (see `BmMap.save`).
     */
    async doWork(): Promise<void> {
        if (this.#cancelled || this.#completed) return;

        const claimed = await this.#claimTile();
        if (claimed === null) return;

        try {
            await this.#processTile(claimed.getX(), claimed.getY());
        } finally {
            // upstream has no try/finally here because its `processTile` swallows every
            // exception itself. The ported one can still reject from the state-write in
            // its own `finally`, and an undecremented in-flight count would wedge the
            // region forever - it would report `completed` and never run `#complete`.
            this.#atWork--;

            if (this.#atWork <= 0 && this.#completed && !this.#cancelled) await this.#complete();
        }
    }

    /** upstream: the first `synchronized` block of `doWork` - see the note there */
    #claimTile(): Promise<Vector2i | null> {
        this.#claimChain = this.#claimChain.then(
            () => this.#claimTileNow(),
            () => this.#claimTileNow(),
        );
        return this.#claimChain;
    }

    async #claimTileNow(): Promise<Vector2i | null> {
        if (this.#cancelled || this.#completed) return null;

        const tileX = this.#nextTileX;
        const tileZ = this.#nextTileZ;

        // upstream inits lazily on the first claim, inside the lock, so the cursor and the
        // tile-actions can never be read before they exist
        if (tileX === 0 && tileZ === 0) {
            await this.#initForWork();
            if (this.#cancelled || this.#completed) return null;
        }

        this.#nextTileX = tileX + 1;
        if (this.#nextTileX >= this.#tileSize.getX()) {
            this.#nextTileZ = tileZ + 1;
            this.#nextTileX = 0;
        }
        if (this.#nextTileZ >= this.#tileSize.getY()) this.#completed = true;

        this.#atWork++;
        return new Vector2i(tileX, tileZ);
    }

    async #initForWork(): Promise<void> {
        try {
            await this.#init();
        } catch (ex) {
            // upstream logs and cancels rather than failing the whole render - one
            // unreadable region must not take the other thousand with it. `run` raises
            // instead, because a single-region caller has nobody else to report to.
            //
            // One knowing difference: upstream's catch wraps only the chunk-hash load, so
            // it still runs the tile-action scan afterwards. Here `#init` raises out of the
            // load and the scan is skipped. Nothing observes it - the task is cancelled, so
            // no tile is ever processed and the actions would have been discarded.
            logError(`Failed to load chunks for region ${this.#regionPos.toString()}`, ex);
            this.#cancelled = true;
            return;
        }

        if (this.#nothingToDo) this.#completed = true;
    }

    /**
     * upstream: `!completed && !cancelled`.
     *
     * False means "stop calling doWork", not "succeeded" - a cancelled region and a
     * finished one are indistinguishable here, exactly as in {@link RenderTask}.
     */
    hasMoreWork(): boolean {
        return !this.#completed && !this.#cancelled;
    }

    /**
     * upstream: `min((nextTileZ * tileSize.x + nextTileX) / (tileSize.x * tileSize.y), 1)`.
     *
     * The `min` is load-bearing: the cursor is advanced *before* the tile is processed, so
     * the last claim leaves it one past the end and the raw fraction exceeds 1.
     *
     * Upstream guards with `if (tileSize == null) return 0`; the flag is the equivalent,
     * since the ported fields are declared definitely-assigned and would read `undefined`.
     */
    estimateProgress(): number {
        if (!this.#initialised) return 0;
        const width = this.#tileSize.getX();
        const height = this.#tileSize.getY();
        return Math.min((this.#nextTileZ * width + this.#nextTileX) / (width * height), 1);
    }

    cancel(): void {
        this.#cancelled = true;
    }

    getDescription(): string {
        // upstream: "updating region %s".formatted(regionPos), and flow-math's Vector2i
        // prints as "(x, y)" exactly as the ported one does
        return `updating region ${this.#regionPos.toString()}`;
    }

    getDetail(): string | null {
        return RenderTask.getDetail();
    }

    /** upstream: no override, so `RenderTask`'s default - `equals(task)` */
    contains(task: RenderTask): boolean {
        return RenderTask.contains(this, task);
    }

    /**
     * upstream: `force == that.force && map.getId().equals(...) && regionPos.equals(...)`.
     *
     * `force ==` is reference identity in java, and it is kept as `===` here. That is why
     * {@link TileUpdateStrategy.fixed} has to return singletons: with a fresh object per
     * call, two tasks for the same region and the same strategy would compare unequal and
     * a render manager would happily queue the region twice.
     *
     * `hashCode` is deliberately absent. Upstream needs it because tasks land in hash-based
     * collections; nothing in this port keys a collection by a task, and a wrong hash that
     * nobody reads is worse than no hash at all.
     */
    equals(o: unknown): boolean {
        if ((this as unknown) === o) return true;
        if (!(o instanceof WorldRegionUpdateTask)) return false;
        return (
            this.#force === o.#force &&
            this.#map.getId() === o.#map.getId() &&
            this.#regionPos.equals(o.#regionPos)
        );
    }

    /**
     * upstream: `regionLastUpdatedComparator(Comparator<WorldRegionUpdateTask> fallback)`.
     *
     * Renders the regions that were updated longest ago first, falling back to the given
     * comparator when two regions were last updated at the same second - which on a first
     * render is *every* pair, since nothing has a stored timestamp yet.
     *
     * The extra `lastUpdated` parameter is the one departure. Upstream reads the stored
     * timestamp inside the comparator, on every single comparison; the ported region-state
     * read returns a promise and a comparator cannot await. {@link readRegionLastUpdated}
     * reads each task's value once beforehand and this closes over the result. The
     * ordering is identical because upstream's reads are identical too: the sort is
     * single-threaded and nothing writes region state during it, so re-reading a value
     * O(log n) times can only ever return what one read already returned.
     */
    static regionLastUpdatedComparator(
        lastUpdated: (task: WorldRegionUpdateTask) => number,
        fallbackComparator: (a: WorldRegionUpdateTask, b: WorldRegionUpdateTask) => number,
    ): (a: WorldRegionUpdateTask, b: WorldRegionUpdateTask) => number {
        return (task1, task2) => {
            const task1Modified = lastUpdated(task1);
            const task2Modified = lastUpdated(task2);
            // upstream: Long.signum(task1Modified - task2Modified); both values are the
            // int32 seconds a region-state cell holds, so the difference cannot overflow
            return task1Modified !== task2Modified
                ? Math.sign(task1Modified - task2Modified)
                : fallbackComparator(task1, task2);
        };
    }

    /** upstream: `private static long regionLastUpdated(WorldRegionUpdateTask)`, read once per task */
    static async readRegionLastUpdated(
        tasks: Iterable<WorldRegionUpdateTask>,
    ): Promise<(task: WorldRegionUpdateTask) => number> {
        const values = new Map<WorldRegionUpdateTask, number>();
        for (const task of tasks) {
            const regionPos = task.getRegionPos();
            values.set(
                task,
                await task.#map.getMapRegionState().get(regionPos.getX(), regionPos.getY()),
            );
        }
        // a task the caller did not include reads as never-updated, which is what an
        // absent region-state cell holds anyway
        return (task) => values.get(task) ?? 0;
    }

    /**
     * upstream: `defaultComparator(Vector2i centerRegion)` - nearest region first.
     *
     * Upstream widens to `Vector2l` before squaring and comments that it is to avoid
     * overflow: two int region coordinates differ by up to 2^32, and the square of that
     * does not fit an int. Javascript numbers are exact integers up to 2^53, which covers
     * every squared distance for `|dx|, |dy| <= 2^26` - and Minecraft's own coordinate
     * limit puts the furthest possible region at well under 2^17, so the whole
     * representable range is exact here.
     */
    static defaultComparator(
        centerRegion: Vector2i,
    ): (a: WorldRegionUpdateTask, b: WorldRegionUpdateTask) => number {
        return (task1, task2) => {
            const t1x = task1.#regionPos.getX() - centerRegion.getX();
            const t1z = task1.#regionPos.getY() - centerRegion.getY();
            const t2x = task2.#regionPos.getX() - centerRegion.getX();
            const t2z = task2.#regionPos.getY() - centerRegion.getY();
            // upstream: Long.signum(v1.lengthSquared() - v2.lengthSquared())
            return Math.sign(t1x * t1x + t1z * t1z - (t2x * t2x + t2z * t2z));
        };
    }
}
