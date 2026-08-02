import { pipeline, Transform, type Readable, type Writable } from "node:stream";
import { promisify } from "node:util";
import {
    createDeflate,
    createGunzip,
    createGzip,
    createInflate,
    deflate as zlibDeflate,
    gunzip as zlibGunzip,
    gzip as zlibGzip,
    inflate as zlibInflate,
} from "node:zlib";
import {
    init as zstdInit,
    compress as zstdCompress,
    decompress as zstdDecompress,
} from "@bokuweb/zstd-wasm";
import { Key, Registry, type Keyed } from "@material-bluemap/shared";
import { BufferedCompression, type BufferCodec } from "./BufferedCompression.js";
import { NoCompression } from "./NoCompression.js";
import {
    createLz4BlockCompressStream,
    createLz4BlockDecompressStream,
    lz4BlockCompress,
    lz4BlockDecompress,
} from "./Lz4Block.js";

export interface Compression extends Keyed {
    getId(): string;

    getFileSuffix(): string;

    /**
     * Wraps a sink so that everything written to the returned stream is compressed into
     * `out` (upstream: {@code OutputStream compress(OutputStream out)}); or compresses a
     * complete buffer of data.
     */
    compress(out: Writable): Writable;
    compress(data: Uint8Array): Promise<Buffer>;

    /**
     * Wraps a source of compressed data so that the returned stream yields the
     * decompressed bytes (upstream: {@code InputStream decompress(InputStream in)}); or
     * decompresses a complete buffer of data.
     */
    decompress(input: Readable): Readable;
    decompress(data: Uint8Array): Promise<Buffer>;
}

/** Wires `stream` to compress into `out`, propagating errors/teardown, and returns the writable end. */
function writeThrough(stream: Transform, out: Writable): Writable {
    pipeline(stream, out, () => {});
    return stream;
}

/** Wires `input` to be read through `stream`, propagating errors/teardown, and returns the readable end. */
function readThrough(input: Readable, stream: Transform): Readable {
    pipeline(input, stream, () => {});
    return stream;
}

/**
 * A Transform that collects the whole input and codes it in one shot on end-of-stream;
 * used for the wasm-backed codecs which (unlike upstream's java streams) have no
 * incremental mode.
 */
function bufferingTransform(codec: BufferCodec): Transform {
    const chunks: Uint8Array[] = [];
    return new Transform({
        transform(chunk: Uint8Array, _encoding, callback) {
            chunks.push(chunk);
            callback(null);
        },
        flush(callback) {
            codec(Buffer.concat(chunks)).then(
                (result) => callback(null, result),
                (error: unknown) =>
                    callback(error instanceof Error ? error : new Error(String(error))),
            );
        },
    });
}

const gzipBuffer = promisify(zlibGzip);
const gunzipBuffer = promisify(zlibGunzip);
const deflateBuffer = promisify(zlibDeflate);
const inflateBuffer = promisify(zlibInflate);

let zstdInitialized: Promise<void> | null = null;

/** Lazily initializes the zstd wasm-module exactly once; safe under concurrent callers. */
function initZstd(): Promise<void> {
    if (zstdInitialized === null) {
        zstdInitialized = zstdInit().catch((error: unknown) => {
            zstdInitialized = null; // allow retrying after a failed init
            throw error;
        });
    }
    return zstdInitialized;
}

/** upstream's io.airlift ZstdOutputStream compresses at zstd's default level 3 */
const ZSTD_COMPRESSION_LEVEL = 3;

async function zstdCompressBuffer(data: Uint8Array): Promise<Buffer> {
    await initZstd();
    // copy: the returned view may be backed by the wasm heap
    return Buffer.from(zstdCompress(data, ZSTD_COMPRESSION_LEVEL));
}

async function zstdDecompressBuffer(data: Uint8Array): Promise<Buffer> {
    await initZstd();
    return Buffer.from(zstdDecompress(data));
}

const NONE: Compression = new NoCompression(Key.bluemap("none"), "none", "");
const GZIP: Compression = new BufferedCompression(
    Key.bluemap("gzip"),
    "gzip",
    ".gz",
    { stream: (out) => writeThrough(createGzip(), out), buffer: (data) => gzipBuffer(data) },
    { stream: (input) => readThrough(input, createGunzip()), buffer: (data) => gunzipBuffer(data) },
);
const DEFLATE: Compression = new BufferedCompression(
    Key.bluemap("deflate"),
    "deflate",
    ".deflate",
    { stream: (out) => writeThrough(createDeflate(), out), buffer: (data) => deflateBuffer(data) },
    {
        stream: (input) => readThrough(input, createInflate()),
        buffer: (data) => inflateBuffer(data),
    },
);
const ZSTD: Compression = new BufferedCompression(
    Key.bluemap("zstd"),
    "zstd",
    ".zst",
    {
        stream: (out) => writeThrough(bufferingTransform(zstdCompressBuffer), out),
        buffer: zstdCompressBuffer,
    },
    {
        stream: (input) => readThrough(input, bufferingTransform(zstdDecompressBuffer)),
        buffer: zstdDecompressBuffer,
    },
);
const LZ4: Compression = new BufferedCompression(
    Key.bluemap("lz4"),
    "lz4",
    ".lz4",
    {
        stream: (out) => writeThrough(createLz4BlockCompressStream(), out),
        buffer: (data) => lz4BlockCompress(data),
    },
    {
        stream: (input) => readThrough(input, createLz4BlockDecompressStream()),
        buffer: (data) => lz4BlockDecompress(data),
    },
);

const REGISTRY: Registry<Compression> = new Registry<Compression>(NONE, GZIP, DEFLATE, ZSTD, LZ4);

/** The static side of the upstream {@code Compression} interface. */
export const Compression = {
    NONE,
    GZIP,
    DEFLATE,
    ZSTD,
    LZ4,
    REGISTRY,
} as const;
