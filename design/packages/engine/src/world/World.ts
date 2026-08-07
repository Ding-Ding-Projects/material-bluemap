import { isAbsolute, relative, resolve } from "node:path";
import type { Grid, Key, Vector2i } from "@worldlens/shared";
import type { WatchService } from "../util/WatchService.js";
import type { Chunk } from "./Chunk.js";
import type { DimensionType } from "./DimensionType.js";
import type { Entity } from "./Entity.js";
import type { Region } from "./Region.js";

/**
 * Represents a World on the Server.<br>
 * This is usually one of the dimensions of a level.<br>
 * <br>
 * <i>The implementation of this class has to be thread-save!</i><br>
 */
export interface World {
    getId(): string;

    getDimensionType(): DimensionType;

    getChunkGrid(): Grid;

    getRegionGrid(): Grid;

    /**
     * Returns the {@link Chunk} on the specified block-position
     */
    getChunkAtBlock(x: number, z: number): Chunk;

    /**
     * Returns the {@link Chunk} on the specified chunk-position
     */
    getChunk(x: number, z: number): Chunk;

    /**
     * Returns the {@link Region} on the specified region-position
     */
    getRegion(x: number, z: number): Region<Chunk>;

    /**
     * Returns a collection of all regions in this world.
     * <i>(Be aware that the collection is not cached and recollected each time from the world-files!)</i>
     */
    listRegions(): Vector2i[];

    /**
     * Creates and returns a new {@link WatchService} which watches for any changes in this worlds regions.
     * @throws Error if an IOException occurred while creating the watch-service,
     * or an UnsupportedOperationException-like Error if watching this world is not
     * supported (the upstream interface-default)
     */
    createRegionWatchService(): WatchService<Vector2i>;

    /**
     * Loads the filtered chunks from the specified region into the chunk cache (if there is a cache).<br>
     * Omitting the filter loads all chunks (upstream's no-filter default overload).
     */
    preloadRegionChunks(x: number, z: number, chunkFilter?: (pos: Vector2i) => boolean): Promise<void>;

    /**
     * Loads every chunk of the given (inclusive) chunk-range into the chunk cache (if
     * there is a cache), so that {@link World#getChunk} and
     * {@link World#getChunkAtBlock} can serve all of them afterwards.
     *
     * Port-only — upstream has no counterpart, and needs none: its chunk-cache is a
     * caffeine {@code LoadingCache}, so upstream's {@code getChunkAtBlock} simply blocks
     * and loads the chunk on a miss. Javascript can not block, so the synchronous
     * accessors of this interface answer a miss with an *empty* chunk and merely schedule
     * the load (the chunk-io deviation, see docs/deviations.md) — and a synchronous
     * render-pass never yields, so that scheduled load can not resolve before the pass
     * has already read air where the chunk should have been. Whoever is about to read
     * blocks through the synchronous accessors therefore has to declare the chunk-window
     * it will touch and await it first; the caller owns chunk availability, it is not
     * something to be inherited from whatever an earlier caller happened to warm.
     *
     * The range is per-chunk rather than per-region on purpose:
     * {@link World#preloadRegionChunks} warms one whole 32x32-chunk region, which is both
     * far more than a reader needs and — because a read-window as small as a single hires
     * tile can straddle up to four regions — not actually a superset of it.
     *
     * A range whose max is smaller than its min loads nothing; chunks that do not exist
     * on disk resolve to the empty chunk, which is a loaded answer rather than a miss.
     */
    preloadChunks(
        minChunkX: number,
        minChunkZ: number,
        maxChunkX: number,
        maxChunkZ: number,
    ): Promise<void>;

    /**
     * Invalidates the complete chunk cache (if there is a cache), so that every chunk has to be reloaded from disk
     */
    invalidateChunkCache(): void;

    /**
     * Invalidates the chunk from the chunk-cache (if there is a cache), so that the chunk has to be reloaded from disk
     */
    invalidateChunkCache(x: number, z: number): void;

    iterateEntities(
        minX: number,
        minZ: number,
        maxX: number,
        maxZ: number,
        entityConsumer: (entity: Entity) => void,
    ): Promise<void>;
}

export const World = {
    /**
     * Generates a unique world-id based on a path and a dimension
     */
    id(path: string, dimension: Key): string {
        let normalized = resolve(path);

        const workingDir = resolve("");
        const relativized = relative(workingDir, normalized);
        // Path#startsWith(workingDir) -> workingDir.relativize(path)
        if (!relativized.startsWith("..") && !isAbsolute(relativized)) normalized = relativized;

        return normalized + "#" + dimension.getFormatted();
    },
};
