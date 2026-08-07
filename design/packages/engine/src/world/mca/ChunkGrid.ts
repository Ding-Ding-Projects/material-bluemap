import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { LRUCache } from "lru-cache";
import { Grid, Vector2i } from "@worldlens/shared";
import type { WatchService } from "../../util/WatchService.js";
import type { ChunkConsumer } from "../ChunkConsumer.js";
import type { Region } from "../Region.js";
import type { ChunkLoader } from "./ChunkLoader.js";
import { logDebug } from "./MCAUtil.js";
import { MCAWorldRegionWatchService } from "./MCAWorldRegionWatchService.js";
import { RegionType } from "./region/RegionType.js";

const CHUNK_GRID = new Grid(16);
const REGION_GRID = new Grid(32).multiply(CHUNK_GRID);

/**
 * upstream: Logger.global.logError — the logger-package is not part of this port (yet),
 * see the equivalent note in MCAUtil.ts
 */
function logError(message: string, ex: unknown): void {
    console.error(message, ex);
}

/**
 * upstream: VECTOR_2_I_CACHE.get(x, z) — upstream interns Vector2i instances
 * (Vector2iCache) so they can key the caffeine-caches by equals/hashCode; the js caches
 * key by SameValueZero, so a packed string replaces the interned vector.
 */
function cacheKey(x: number, z: number): string {
    return x + "," + z;
}

/**
 * Cache-deviation (see docs/deviations.md): upstream uses caffeine LoadingCaches with
 * softValues + expireAfterWrite(10min) + expireAfterAccess(1min); lru-cache can express
 * a size-bound plus one write-anchored ttl, so the caches below keep the maximum-size
 * and approximate the expiry with ttl = 10 minutes (expired entries are dropped lazily
 * on access). Soft-references have no js equivalent — the size-bound alone limits memory.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;

// (T extends object: lru-cache only stores non-nullish values — chunks are always objects)
export class ChunkGrid<T extends object> {
    private readonly chunkLoader: ChunkLoader<T>;
    private readonly regionFolder: string;

    private readonly regionCache = new LRUCache<string, Region<T>>({
        max: 32,
        ttl: CACHE_TTL_MS,
    });
    private readonly chunkCache = new LRUCache<string, T>({
        max: 10240, // 10 regions worth of chunks
        ttl: CACHE_TTL_MS,
    });

    /**
     * Loads currently in flight, so concurrent {@link ChunkGrid#getChunk} calls for the
     * same chunk share one load (upstream: caffeine's LoadingCache guarantees this
     * per-key; the async port has to dedup explicitly).
     */
    private readonly inFlightChunks = new Map<string, Promise<T>>();

    constructor(chunkLoader: ChunkLoader<T>, regionFolder: string) {
        this.chunkLoader = chunkLoader;
        this.regionFolder = regionFolder;
    }

    getChunkGrid(): Grid {
        return CHUNK_GRID;
    }

    getRegionGrid(): Grid {
        return REGION_GRID;
    }

    getChunk(x: number, z: number): Promise<T> {
        const key = cacheKey(x, z);

        const cached = this.chunkCache.get(key);
        if (cached !== undefined) return Promise.resolve(cached);

        let inFlight = this.inFlightChunks.get(key);
        if (inFlight === undefined) {
            const load: Promise<T> = this.loadChunk(x, z).then((chunk) => {
                // publish only if this load is still the current one — invalidation
                // drops in-flight entries, mirroring caffeine discarding in-flight
                // computations on invalidate
                if (this.inFlightChunks.get(key) === load) {
                    this.inFlightChunks.delete(key);
                    this.chunkCache.set(key, chunk);
                }
                return chunk;
            });
            this.inFlightChunks.set(key, load);
            inFlight = load;
        }
        return inFlight;
    }

    /**
     * Synchronous chunk access for the synchronous {@link World} interface: returns the
     * cached chunk — where upstream's LoadingCache would block and load on a cache-miss
     * (which js cannot), the async load is only scheduled (so a later access finds the
     * chunk) and the loader's empty chunk is returned for now.
     * (chunk-io deviation, see docs/deviations.md)
     */
    getCachedChunk(x: number, z: number): T {
        const cached = this.chunkCache.get(cacheKey(x, z));
        if (cached !== undefined) return cached;

        void this.getChunk(x, z); // never rejects, failed loads resolve to the errored-chunk
        return this.chunkLoader.emptyChunk();
    }

    getRegion(x: number, z: number): Region<T> {
        const key = cacheKey(x, z);
        let region = this.regionCache.get(key);
        if (region === undefined) {
            region = this.loadRegion(x, z);
            this.regionCache.set(key, region);
        }
        return region;
    }

    async preloadRegionChunks(
        x: number,
        z: number,
        chunkFilter: (pos: Vector2i) => boolean,
    ): Promise<void> {
        try {
            const consumer: ChunkConsumer<T> = {
                filter: (chunkX: number, chunkZ: number, _lastModified: number): boolean => {
                    const chunkPos = new Vector2i(chunkX, chunkZ);
                    return chunkFilter(chunkPos);
                },
                accept: (chunkX: number, chunkZ: number, chunk: T): void => {
                    this.chunkCache.set(cacheKey(chunkX, chunkZ), chunk);
                },
                fail: (chunkX: number, chunkZ: number, ex: Error): void => {
                    logDebug(
                        `Failed to preload chunk (${chunkX}, ${chunkZ}) from region ('${this.regionFolder}' -> x:${x}, z:${z}): ${String(ex)}`,
                    );
                },
            };
            await this.getRegion(x, z).iterateAllChunks(consumer);
        } catch (ex) {
            logDebug(
                `Unexpected exception trying to preload region ('${this.regionFolder}' -> x:${x}, z:${z}): ${String(ex)}`,
            );
        }
    }

    listRegions(): Vector2i[] {
        if (!existsSync(this.regionFolder)) return [];
        try {
            return readdirSync(this.regionFolder)
                .map((fileName) => {
                    const file = join(this.regionFolder, fileName);
                    try {
                        if (statSync(file).size <= 0) return null;
                        return RegionType.regionForFileName(fileName);
                    } catch (ex) {
                        logError("Failed to read region-file: " + file, ex);
                        return null;
                    }
                })
                .filter((pos): pos is Vector2i => pos !== null);
        } catch (ex) {
            logError(`Failed to list regions from: '${this.regionFolder}'`, ex);
            return [];
        }
    }

    createRegionWatchService(): WatchService<Vector2i> {
        return new MCAWorldRegionWatchService(this.regionFolder);
    }

    invalidateChunkCache(): void;
    invalidateChunkCache(x: number, z: number): void;
    invalidateChunkCache(x?: number, z?: number): void {
        if (x === undefined || z === undefined) {
            this.regionCache.clear();
            this.chunkCache.clear();
            this.inFlightChunks.clear();
        } else {
            this.regionCache.delete(cacheKey(x >> 5, z >> 5));
            this.chunkCache.delete(cacheKey(x, z));
            this.inFlightChunks.delete(cacheKey(x, z));
        }
    }

    private loadRegion(x: number, z: number): Region<T> {
        return RegionType.loadRegion(this.chunkLoader, this.regionFolder, x, z);
    }

    private async loadChunk(x: number, z: number): Promise<T> {
        const tries = 3;
        const tryInterval = 1000;

        let loadException: unknown = null;
        for (let i = 0; i < tries; i++) {
            try {
                return await this.getRegion(x >> 5, z >> 5).loadChunk(x, z);
            } catch (e) {
                // (upstream chains earlier attempts' exceptions via addSuppressed —
                // js errors have no suppressed-list, only the last one is reported)
                loadException = e;

                if (i + 1 < tries) {
                    await new Promise((resolve) => setTimeout(resolve, tryInterval));
                }
            }
        }

        logDebug(
            `Unexpected exception trying to load chunk ('${this.regionFolder}' -> x:${x}, z:${z}): ${String(loadException)}`,
        );
        return this.chunkLoader.erroredChunk();
    }
}
