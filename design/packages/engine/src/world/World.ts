import { isAbsolute, relative, resolve } from "node:path";
import type { Grid, Key, Vector2i } from "@material-bluemap/shared";
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
