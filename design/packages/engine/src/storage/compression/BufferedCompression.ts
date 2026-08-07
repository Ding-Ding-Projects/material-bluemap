import type { Readable, Writable } from "node:stream";
import type { Key } from "@worldlens/shared";
import type { Compression } from "./Compression.js";

/** Port of upstream's {@code BufferedCompression.StreamTransformer} functional interface. */
export interface StreamTransformer<T> {
    (original: T): T;
}

/** Compresses or decompresses one complete buffer of data. */
export interface BufferCodec {
    (data: Uint8Array): Promise<Buffer>;
}

/**
 * Where upstream passes a single {@code StreamTransformer<OutputStream>} constructor-ref,
 * the port pairs the node-stream transformer with a whole-buffer codec.
 */
export interface Compressor {
    stream: StreamTransformer<Writable>;
    buffer: BufferCodec;
}

export interface Decompressor {
    stream: StreamTransformer<Readable>;
    buffer: BufferCodec;
}

export class BufferedCompression implements Compression {
    private readonly key: Key;
    private readonly id: string;
    private readonly fileSuffix: string;
    private readonly compressor: Compressor;
    private readonly decompressor: Decompressor;

    constructor(
        key: Key,
        id: string,
        fileSuffix: string,
        compressor: Compressor,
        decompressor: Decompressor,
    ) {
        this.key = key;
        this.id = id;
        this.fileSuffix = fileSuffix;
        this.compressor = compressor;
        this.decompressor = decompressor;
    }

    getKey(): Key {
        return this.key;
    }

    getId(): string {
        return this.id;
    }

    getFileSuffix(): string {
        return this.fileSuffix;
    }

    compress(out: Writable): Writable;
    compress(data: Uint8Array): Promise<Buffer>;
    compress(out: Writable | Uint8Array): Writable | Promise<Buffer> {
        if (out instanceof Uint8Array) return this.compressor.buffer(out);
        // upstream wraps the result in a BufferedOutputStream; node streams buffer
        // internally, so no extra wrapper is needed
        return this.compressor.stream(out);
    }

    decompress(input: Readable): Readable;
    decompress(data: Uint8Array): Promise<Buffer>;
    decompress(input: Readable | Uint8Array): Readable | Promise<Buffer> {
        if (input instanceof Uint8Array) return this.decompressor.buffer(input);
        // upstream wraps the result in a BufferedInputStream; node streams buffer
        // internally, so no extra wrapper is needed
        return this.decompressor.stream(input);
    }
}
