import { PassThrough, pipeline, type Readable, type Writable } from "node:stream";
import type { Key } from "@material-bluemap/shared";
import type { Compression } from "./Compression.js";

function asBuffer(data: Uint8Array): Buffer {
    return Buffer.isBuffer(data)
        ? data
        : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

export class NoCompression implements Compression {
    private readonly key: Key;
    private readonly id: string;
    private readonly fileSuffix: string;

    constructor(key: Key, id: string, fileSuffix: string) {
        this.key = key;
        this.id = id;
        this.fileSuffix = fileSuffix;
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
        if (out instanceof Uint8Array) return Promise.resolve(asBuffer(out));
        // upstream returns a BufferedOutputStream around `out`, which only buffers;
        // a PassThrough is the node equivalent
        const stream = new PassThrough();
        pipeline(stream, out, () => {});
        return stream;
    }

    decompress(input: Readable): Readable;
    decompress(data: Uint8Array): Promise<Buffer>;
    decompress(input: Readable | Uint8Array): Readable | Promise<Buffer> {
        if (input instanceof Uint8Array) return Promise.resolve(asBuffer(input));
        // upstream returns a BufferedInputStream around `input`, which only buffers
        const stream = new PassThrough();
        pipeline(input, stream, () => {});
        return stream;
    }
}
