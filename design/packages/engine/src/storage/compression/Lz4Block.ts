import { Transform, type TransformCallback } from "node:stream";
import { compressBlock, decompressBlock } from "lz4js";
import xxhash from "xxhash-wasm";
import { EOFException, IOException, IllegalArgumentException } from "@material-bluemap/nbt";

/**
 * lz4-java block-stream framing ({@code net.jpountz.lz4.LZ4BlockOutputStream} /
 * {@code LZ4BlockInputStream}) — the format used by BlueMap's "bluemap:lz4" storage
 * compression and by Minecraft 1.20.5+ for lz4-compressed region chunks.
 *
 * This is NOT the standard LZ4 Frame format; it is lz4-java's own container. Each block:
 *
 * <pre>
 *   8 bytes  magic: the ASCII characters "LZ4Block" (4C 5A 34 42 6C 6F 63 6B)
 *   1 byte   token: compressionMethod | compressionLevel
 *              compressionMethod: 0x10 = RAW (payload stored uncompressed)
 *                                 0x20 = LZ4 (payload is one raw lz4 block)
 *              compressionLevel:  max(0, ceilLog2(blockSize) - 10), so the reader can
 *                                 bound the decompressed block size by 1 << (10 + level)
 *   4 bytes  compressedLength (little-endian int32): byte-length of the payload
 *   4 bytes  originalLength (little-endian int32): decompressed length of the payload
 *              (RAW blocks have originalLength == compressedLength)
 *   4 bytes  checksum (little-endian int32): xxhash32 of the DECOMPRESSED payload bytes,
 *              seeded with 0x9747b28c and masked to the low 28 bits (see CHECKSUM_MASK)
 *   n bytes  payload (compressedLength bytes)
 * </pre>
 *
 * The stream is terminated by an "empty block": a 21-byte header with
 * token = RAW | compressionLevel, both lengths and the checksum 0, and no payload.
 * The default lz4-java reader (stopOnEmptyBlock = true) treats that block as EOF and
 * leaves any following bytes unread; a stream that ends without it is rejected with
 * "Stream ended prematurely".
 *
 * All framing constants below were verified against lz4-java master
 * (src/java/net/jpountz/lz4/LZ4BlockOutputStream.java / LZ4BlockInputStream.java).
 */

export const MAGIC: Buffer = Buffer.from("LZ4Block", "ascii");
export const MAGIC_LENGTH: number = MAGIC.length; // 8

// prettier-ignore
export const HEADER_LENGTH: number =
    MAGIC_LENGTH // magic bytes
    + 1          // token
    + 4          // compressed length
    + 4          // decompressed length
    + 4; // checksum

/** compressionLevel 0 corresponds to a max decompressed block size of 1 << 10 */
export const COMPRESSION_LEVEL_BASE = 10;
export const MIN_BLOCK_SIZE = 64;
export const MAX_BLOCK_SIZE: number = 1 << (COMPRESSION_LEVEL_BASE + 0x0f); // 32 MiB

export const COMPRESSION_METHOD_RAW = 0x10;
export const COMPRESSION_METHOD_LZ4 = 0x20;

/** xxhash32 seed used for the per-block checksum (LZ4BlockOutputStream.DEFAULT_SEED) */
export const DEFAULT_SEED = 0x9747b28c;

/**
 * lz4-java computes the stored checksum through {@code StreamingXXHash32#asChecksum()},
 * whose {@code getValue()} returns {@code xxhash32 & 0xFFFFFFFL} — a 28-bit mask
 * (7 F's; presumably a typo for 0xFFFFFFFFL that is kept for format compatibility).
 * Verified against lz4-java master src/java/net/jpountz/xxhash/StreamingXXHash32.java:106.
 * As a consequence the upper 4 bits of the checksum field are always zero on the wire,
 * and readers must apply the same mask before comparing.
 */
export const CHECKSUM_MASK = 0x0fffffff;

/** block size used by the default {@code new LZ4BlockOutputStream(out)} constructor */
export const DEFAULT_BLOCK_SIZE: number = 1 << 16;

/** size of the lz4 match hash table (lz4js `hashSize`, 16-bit crushed hashes) */
const HASH_TABLE_SIZE = 1 << 16;

/**
 * Computes the token compression-level for a block size
 * (port of LZ4BlockOutputStream#compressionLevel).
 */
export function compressionLevel(blockSize: number): number {
    if (blockSize < MIN_BLOCK_SIZE) {
        throw new IllegalArgumentException(
            `blockSize must be >= ${MIN_BLOCK_SIZE}, got ${blockSize}`,
        );
    }
    if (blockSize > MAX_BLOCK_SIZE) {
        throw new IllegalArgumentException(
            `blockSize must be <= ${MAX_BLOCK_SIZE}, got ${blockSize}`,
        );
    }
    let compressionLevel = 32 - Math.clz32(blockSize - 1); // ceil of log2
    compressionLevel = Math.max(0, compressionLevel - COMPRESSION_LEVEL_BASE);
    return compressionLevel;
}

type XXHashApi = Awaited<ReturnType<typeof xxhash>>;

let xxhashInit: Promise<XXHashApi> | null = null;

/** Lazily initializes the xxhash-wasm module exactly once; safe under concurrent callers. */
function xxhash32(): Promise<XXHashApi> {
    if (xxhashInit === null) {
        xxhashInit = xxhash().catch((error: unknown) => {
            xxhashInit = null; // allow retrying after a failed init
            throw error;
        });
    }
    return xxhashInit;
}

function asBuffer(data: Uint8Array): Buffer {
    return Buffer.isBuffer(data)
        ? data
        : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Frames one non-empty block of data (port of LZ4BlockOutputStream#flushBufferedData).
 * `hashTable` is scratch space; it is cleared here so output is deterministic.
 */
function compressDataBlock(
    block: Uint8Array,
    level: number,
    hash: XXHashApi,
    hashTable: Uint32Array,
): Buffer {
    // checksum is computed over the DECOMPRESSED bytes
    const check = hash.h32Raw(block, DEFAULT_SEED) & CHECKSUM_MASK;

    // worst-case raw-lz4-block size, same formula as lz4js#compressBound
    const bound = (block.length + block.length / 255 + 16) | 0;
    const compressed = Buffer.allocUnsafe(bound);
    hashTable.fill(0);
    let compressedLength = compressBlock(block, compressed, 0, block.length, hashTable);

    // like lz4-java, store the block RAW when compression does not make it smaller
    // (lz4js signals "nothing encoded" with a 0 return value)
    let compressionMethod: number;
    if (compressedLength === 0 || compressedLength >= block.length) {
        compressionMethod = COMPRESSION_METHOD_RAW;
        compressedLength = block.length;
    } else {
        compressionMethod = COMPRESSION_METHOD_LZ4;
    }

    const out = Buffer.allocUnsafe(HEADER_LENGTH + compressedLength);
    MAGIC.copy(out, 0);
    out[MAGIC_LENGTH] = compressionMethod | level;
    out.writeInt32LE(compressedLength, MAGIC_LENGTH + 1);
    out.writeInt32LE(block.length, MAGIC_LENGTH + 5);
    out.writeInt32LE(check, MAGIC_LENGTH + 9);
    if (compressionMethod === COMPRESSION_METHOD_RAW) {
        out.set(block, HEADER_LENGTH);
    } else {
        compressed.copy(out, HEADER_LENGTH, 0, compressedLength);
    }
    return out;
}

/** The stream-terminating "empty block" (port of LZ4BlockOutputStream#finish). */
function finishBlock(level: number): Buffer {
    const out = Buffer.allocUnsafe(HEADER_LENGTH);
    MAGIC.copy(out, 0);
    out[MAGIC_LENGTH] = COMPRESSION_METHOD_RAW | level;
    out.writeInt32LE(0, MAGIC_LENGTH + 1);
    out.writeInt32LE(0, MAGIC_LENGTH + 5);
    out.writeInt32LE(0, MAGIC_LENGTH + 9);
    return out;
}

type BlockReadResult =
    /** not enough bytes buffered for the next header or payload */
    | { readonly type: "incomplete" }
    /** the terminating empty block was read */
    | { readonly type: "finished"; readonly end: number }
    /** one decompressed block */
    | { readonly type: "block"; readonly block: Buffer; readonly end: number };

/**
 * Reads and verifies one framed block starting at `offset`
 * (port of LZ4BlockInputStream#refill; error messages match upstream).
 */
function readBlock(data: Buffer, offset: number, hash: XXHashApi): BlockReadResult {
    if (data.length - offset < HEADER_LENGTH) return { type: "incomplete" };
    for (let i = 0; i < MAGIC_LENGTH; i++) {
        if (data[offset + i] !== MAGIC[i]) throw new IOException("Stream is corrupted");
    }
    const token = data[offset + MAGIC_LENGTH] as number;
    const compressionMethod = token & 0xf0;
    const compressionLevel = COMPRESSION_LEVEL_BASE + (token & 0x0f);
    if (
        compressionMethod !== COMPRESSION_METHOD_RAW &&
        compressionMethod !== COMPRESSION_METHOD_LZ4
    ) {
        throw new IOException("Stream is corrupted");
    }
    const compressedLen = data.readInt32LE(offset + MAGIC_LENGTH + 1);
    const originalLen = data.readInt32LE(offset + MAGIC_LENGTH + 5);
    const check = data.readInt32LE(offset + MAGIC_LENGTH + 9);
    if (
        originalLen > 1 << compressionLevel ||
        originalLen < 0 ||
        compressedLen < 0 ||
        (originalLen === 0 && compressedLen !== 0) ||
        (originalLen !== 0 && compressedLen === 0) ||
        (compressionMethod === COMPRESSION_METHOD_RAW && originalLen !== compressedLen)
    ) {
        throw new IOException("Stream is corrupted");
    }
    if (originalLen === 0 && compressedLen === 0) {
        if (check !== 0) throw new IOException("Stream is corrupted");
        return { type: "finished", end: offset + HEADER_LENGTH };
    }

    const payloadStart = offset + HEADER_LENGTH;
    if (data.length - payloadStart < compressedLen) return { type: "incomplete" };

    let block: Buffer;
    if (compressionMethod === COMPRESSION_METHOD_RAW) {
        block = Buffer.from(data.subarray(payloadStart, payloadStart + compressedLen));
    } else {
        block = Buffer.alloc(originalLen);
        let produced: number;
        try {
            produced = decompressBlock(data, block, payloadStart, compressedLen, 0);
        } catch {
            throw new IOException("Stream is corrupted");
        }
        // lz4-java verifies "compressed bytes consumed == compressedLen"; lz4js instead
        // consumes exactly compressedLen and reports the produced size, so verify that
        if (produced !== originalLen) throw new IOException("Stream is corrupted");
    }

    if ((hash.h32Raw(block, DEFAULT_SEED) & CHECKSUM_MASK) !== check) {
        throw new IOException("Stream is corrupted");
    }
    return { type: "block", block, end: payloadStart + compressedLen };
}

/**
 * Compresses `data` into an lz4-java block stream
 * (what {@code new LZ4BlockOutputStream(out, blockSize)} + write-all + close produces).
 */
export async function lz4BlockCompress(
    data: Uint8Array,
    blockSize: number = DEFAULT_BLOCK_SIZE,
): Promise<Buffer> {
    const level = compressionLevel(blockSize);
    const hash = await xxhash32();
    const hashTable = new Uint32Array(HASH_TABLE_SIZE);
    const blocks: Buffer[] = [];
    for (let offset = 0; offset < data.length; offset += blockSize) {
        blocks.push(
            compressDataBlock(
                data.subarray(offset, Math.min(offset + blockSize, data.length)),
                level,
                hash,
                hashTable,
            ),
        );
    }
    blocks.push(finishBlock(level));
    return Buffer.concat(blocks);
}

/**
 * Decompresses an lz4-java block stream, mirroring the default
 * {@code new LZ4BlockInputStream(in)} (stopOnEmptyBlock = true): reading stops at the
 * terminating empty block and any trailing bytes are ignored; a stream that ends without
 * it throws {@link EOFException}, corrupt data throws {@link IOException}.
 */
export async function lz4BlockDecompress(data: Uint8Array): Promise<Buffer> {
    const hash = await xxhash32();
    const buffer = asBuffer(data);
    const blocks: Buffer[] = [];
    let offset = 0;
    for (;;) {
        const result = readBlock(buffer, offset, hash);
        if (result.type === "incomplete") throw new EOFException("Stream ended prematurely");
        if (result.type === "finished") break;
        blocks.push(result.block);
        offset = result.end;
    }
    return Buffer.concat(blocks);
}

/** Runs async work and reports the outcome through a Node stream callback. */
function callbackify(work: () => Promise<void>, callback: TransformCallback): void {
    work().then(
        () => callback(null),
        (error: unknown) => callback(error instanceof Error ? error : new Error(String(error))),
    );
}

/**
 * A {@link Transform} stream producing the lz4-java block stream format, equivalent to
 * {@code LZ4BlockOutputStream}: input is buffered into `blockSize` chunks, each flushed
 * as one framed block; ending the stream writes the terminating empty block.
 * Output is byte-identical to {@link lz4BlockCompress} of the same data.
 */
export function createLz4BlockCompressStream(blockSize: number = DEFAULT_BLOCK_SIZE): Transform {
    const level = compressionLevel(blockSize);
    const hashTable = new Uint32Array(HASH_TABLE_SIZE);
    const buffer = Buffer.allocUnsafe(blockSize);
    let o = 0; // number of buffered, not yet framed bytes (mirrors LZ4BlockOutputStream.o)

    return new Transform({
        transform(chunk: Uint8Array, _encoding, callback) {
            callbackify(async () => {
                const hash = await xxhash32();
                const b = asBuffer(chunk);
                // mirrors LZ4BlockOutputStream#write(byte[], int, int)
                let off = 0;
                let len = b.length;
                while (o + len > blockSize) {
                    const l = blockSize - o;
                    b.copy(buffer, o, off, off + l);
                    o = blockSize;
                    this.push(compressDataBlock(buffer, level, hash, hashTable));
                    o = 0;
                    off += l;
                    len -= l;
                }
                b.copy(buffer, o, off, off + len);
                o += len;
            }, callback);
        },
        flush(callback) {
            callbackify(async () => {
                const hash = await xxhash32();
                // flushBufferedData + finish
                if (o > 0) {
                    this.push(compressDataBlock(buffer.subarray(0, o), level, hash, hashTable));
                    o = 0;
                }
                this.push(finishBlock(level));
            }, callback);
        },
    });
}

/**
 * A {@link Transform} stream decoding the lz4-java block stream format, equivalent to the
 * default {@code LZ4BlockInputStream} (stopOnEmptyBlock = true): data after the
 * terminating empty block is ignored, and a stream that ends without one errors with
 * {@link EOFException}.
 */
export function createLz4BlockDecompressStream(): Transform {
    let pending: Buffer = Buffer.alloc(0);
    let finished = false;

    return new Transform({
        transform(chunk: Uint8Array, _encoding, callback) {
            callbackify(async () => {
                if (finished) return; // stopOnEmptyBlock: ignore trailing data
                const hash = await xxhash32();
                pending = pending.length === 0 ? asBuffer(chunk) : Buffer.concat([pending, chunk]);
                let offset = 0;
                for (;;) {
                    const result = readBlock(pending, offset, hash);
                    if (result.type === "incomplete") break;
                    if (result.type === "finished") {
                        finished = true;
                        offset = result.end;
                        break;
                    }
                    this.push(result.block);
                    offset = result.end;
                }
                pending = pending.subarray(offset);
            }, callback);
        },
        flush(callback) {
            if (!finished) callback(new EOFException("Stream ended prematurely"));
            else callback(null);
        },
    });
}
