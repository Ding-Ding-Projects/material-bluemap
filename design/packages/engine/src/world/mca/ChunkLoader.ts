import type { Compression } from "../../storage/compression/Compression.js";

export interface ChunkLoader<T> {
    /** (chunk-io is async in this port: decompression runs through the async Compression codecs) */
    load(data: Uint8Array, offset: number, length: number, compression: Compression): Promise<T>;

    emptyChunk(): T;

    erroredChunk(): T;
}
