import type { ChunkConsumer } from "./ChunkConsumer.js";

/**
 * upstream: an interface with a default loadChunk implementation; ported as an
 * abstract class. Chunk-io is async in this port (region loading decompresses
 * through the async Compression codecs).
 */
export abstract class Region<T> {
    /**
     * Directly loads and returns the specified chunk.<br>
     * (implementations should consider overriding this method for a faster implementation)
     */
    async loadChunk(chunkX: number, chunkZ: number): Promise<T> {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the upstream inner class captures the outer Region
        const region = this;
        class SingleChunkConsumer implements ChunkConsumer<T> {
            foundChunk: T = region.emptyChunk();

            filter(x: number, z: number, _lastModified: number): boolean {
                return x === chunkX && z === chunkZ;
            }

            accept(_chunkX: number, _chunkZ: number, chunk: T): void {
                this.foundChunk = chunk;
            }
        }

        const singleChunkConsumer = new SingleChunkConsumer();
        await this.iterateAllChunks(singleChunkConsumer);
        return singleChunkConsumer.foundChunk;
    }

    /**
     * Iterates over all chunks in this region and first calls {@link ChunkConsumer#filter}.<br>
     * And if (any only if) that method returned <code>true</code>, the chunk will be loaded and {@link ChunkConsumer#accept}
     * will be called with the loaded chunk.
     * @param consumer the consumer choosing which chunks to load and accepting them
     * @throws Error if an IOException occurred trying to read the region
     */
    abstract iterateAllChunks(consumer: ChunkConsumer<T>): Promise<void>;

    abstract emptyChunk(): T;

    abstract exists(): boolean;
}
