import type { BmMap, LowresTileManagerLike } from "../BmMap.js";
import type { MapRenderTask } from "./MapRenderTask.js";
import { RenderTask } from "./RenderTask.js";

/**
 * upstream: `LowresTileManager#discard()`.
 *
 * `LowresTileManagerLike` — the structural stand-in `BmMap` declares while the lowres
 * package was landing in a parallel wave — does not name `discard`, though the concrete
 * `LowresTileManager` has it. Skipping the call would be the worst of the options: the
 * queued lowres writes would still be sitting in the manager when the purge finished and
 * would be flushed afterwards, re-creating a handful of the tiles the purge just deleted.
 * So it is looked up, and its absence is reported rather than swallowed — the purge then
 * fails before deleting anything, which is a state a user can act on.
 */
async function discardLowres(lowres: LowresTileManagerLike): Promise<void> {
    const candidate = lowres as Partial<{ discard(): void | Promise<void> }>;
    if (typeof candidate.discard !== "function")
        throw new Error(
            "lowres tile-manager has no discard() — purging would leave queued lowres " +
                "writes to be flushed after the delete",
        );
    await candidate.discard();
}

/**
 * upstream: `common/.../rendermanager/MapPurgeTask.java`
 *
 * Deletes everything a map has in storage and resets the render state that remembers what
 * was rendered, so the next update starts from nothing.
 *
 * The order matters and is upstream's: pending lowres writes are discarded *first* (see
 * {@link discardLowres}), the storage is deleted, and only then are the in-memory caches
 * reset. Resetting the render state before the delete would leave a window in which a
 * concurrent update believes nothing is rendered while the tiles are still on disk.
 */
export class MapPurgeTask implements MapRenderTask {
    readonly #map: BmMap;

    #progress: number;
    #hasMoreWork: boolean;
    #cancelled: boolean;

    constructor(map: BmMap) {
        // upstream: Objects.requireNonNull(map)
        if (map === null || map === undefined) throw new Error("map must not be null");

        this.#map = map;
        this.#progress = 0;
        this.#hasMoreWork = true;
        this.#cancelled = false;
    }

    getMap(): BmMap {
        return this.#map;
    }

    /**
     * upstream: the `synchronized` block claims the single unit of work by clearing
     * `hasMoreWork` before anything happens, so a second caller returns immediately
     * instead of purging twice. Both statements run before the first `await` here, which
     * gives the same guarantee (see the note on {@link MapSaveTask}).
     *
     * The cancel check sits *after* the claim, exactly as upstream: a task cancelled
     * between the claim and the check does nothing, and still reports no more work.
     */
    async doWork(): Promise<void> {
        if (!this.#hasMoreWork) return;
        this.#hasMoreWork = false;
        if (this.#cancelled) return;

        // discard any pending lowres changes
        await discardLowres(this.#map.getLowresTileManager());

        // purge the map
        await this.#map.getStorage().delete((progress) => {
            this.#progress = progress;
            // returning false asks the storage to stop; upstream's own javadoc warns that
            // a storage is allowed to ignore it, so cancellation is a request, not a
            // guarantee that nothing further was deleted
            return !this.#cancelled;
        });

        this.#map.resetTextureGallery();
        this.#map.getMapTileState().reset();
        this.#map.getMapChunkState().reset();
        this.#map.getMapRegionState().reset();
    }

    hasMoreWork(): boolean {
        return this.#hasMoreWork && !this.#cancelled;
    }

    estimateProgress(): number {
        return this.#progress;
    }

    cancel(): void {
        this.#cancelled = true;
    }

    /**
     * upstream: identity, else `task instanceof MapPurgeTask && map.equals(other.map)`.
     *
     * `BmMap#equals` is by id, so purging "overworld" contains any other queued purge of
     * "overworld" even when the two hold different `BmMap` instances.
     */
    contains(task: RenderTask): boolean {
        if (task === (this as RenderTask)) return true;
        if (task instanceof MapPurgeTask) return this.#map.equals(task.#map);
        return false;
    }

    getDescription(): string {
        return `purging map '${this.#map.getId()}'`;
    }

    getDetail(): string | null {
        return RenderTask.getDetail();
    }
}
