import { describe, expect, it } from "vitest";
import { Readable, Writable } from "node:stream";
import xxhash from "xxhash-wasm";
import {
    CHECKSUM_MASK,
    COMPRESSION_LEVEL_BASE,
    COMPRESSION_METHOD_LZ4,
    COMPRESSION_METHOD_RAW,
    DEFAULT_BLOCK_SIZE,
    DEFAULT_SEED,
    HEADER_LENGTH,
    MAGIC,
    MAGIC_LENGTH,
    MAX_BLOCK_SIZE,
    MIN_BLOCK_SIZE,
    compressionLevel,
    createLz4BlockCompressStream,
    createLz4BlockDecompressStream,
    lz4BlockCompress,
    lz4BlockDecompress,
} from "./Lz4Block.js";

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randomBytes(length: number, seed = 1337): Buffer {
    const random = mulberry32(seed);
    const out = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; i++) out[i] = (random() * 256) | 0;
    return out;
}

function compressibleBytes(length: number): Buffer {
    const phrase = Buffer.from("chunk section block state palette entry ");
    const out = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; i += phrase.length) {
        phrase.copy(out, i, 0, Math.min(phrase.length, length - i));
    }
    return out;
}

interface ParsedBlock {
    token: number;
    compressedLen: number;
    originalLen: number;
    check: number;
    payload: Buffer;
}

/** splits a framed stream into its blocks, asserting per-block structure */
function parseBlocks(framed: Buffer): ParsedBlock[] {
    const blocks: ParsedBlock[] = [];
    let offset = 0;
    while (offset < framed.length) {
        expect(framed.subarray(offset, offset + MAGIC_LENGTH).toString("ascii")).toBe("LZ4Block");
        const token = framed[offset + MAGIC_LENGTH] as number;
        const compressedLen = framed.readInt32LE(offset + MAGIC_LENGTH + 1);
        const originalLen = framed.readInt32LE(offset + MAGIC_LENGTH + 5);
        const check = framed.readInt32LE(offset + MAGIC_LENGTH + 9);
        const payload = framed.subarray(
            offset + HEADER_LENGTH,
            offset + HEADER_LENGTH + compressedLen,
        );
        expect(payload.length).toBe(compressedLen);
        blocks.push({ token, compressedLen, originalLen, check, payload });
        offset += HEADER_LENGTH + compressedLen;
    }
    expect(offset).toBe(framed.length);
    return blocks;
}

describe("Lz4Block framing constants", () => {
    it("match lz4-java", () => {
        expect(MAGIC.toString("ascii")).toBe("LZ4Block");
        expect([...MAGIC]).toEqual([0x4c, 0x5a, 0x34, 0x42, 0x6c, 0x6f, 0x63, 0x6b]);
        expect(MAGIC_LENGTH).toBe(8);
        expect(HEADER_LENGTH).toBe(21);
        expect(COMPRESSION_LEVEL_BASE).toBe(10);
        expect(MIN_BLOCK_SIZE).toBe(64);
        expect(MAX_BLOCK_SIZE).toBe(32 * 1024 * 1024);
        expect(COMPRESSION_METHOD_RAW).toBe(0x10);
        expect(COMPRESSION_METHOD_LZ4).toBe(0x20);
        expect(DEFAULT_SEED).toBe(0x9747b28c);
        expect(CHECKSUM_MASK).toBe(0x0fffffff);
        expect(DEFAULT_BLOCK_SIZE).toBe(65536);
    });

    it("computes the token compression level like LZ4BlockOutputStream#compressionLevel", () => {
        expect(compressionLevel(64)).toBe(0);
        expect(compressionLevel(1024)).toBe(0);
        expect(compressionLevel(1025)).toBe(1);
        expect(compressionLevel(65535)).toBe(6);
        expect(compressionLevel(1 << 16)).toBe(6);
        expect(compressionLevel((1 << 16) + 1)).toBe(7);
        expect(compressionLevel(MAX_BLOCK_SIZE)).toBe(15);
        expect(() => compressionLevel(MIN_BLOCK_SIZE - 1)).toThrow("blockSize must be >= 64");
        expect(() => compressionLevel(MAX_BLOCK_SIZE + 1)).toThrow("blockSize must be <= 33554432");
    });
});

describe("lz4BlockCompress framing", () => {
    it("supports concurrent first use (lazy xxhash init)", async () => {
        const inputs = Array.from({ length: 8 }, (_, i) => randomBytes(1000, i + 1));
        const framed = await Promise.all(inputs.map((data) => lz4BlockCompress(data)));
        const restored = await Promise.all(framed.map((data) => lz4BlockDecompress(data)));
        restored.forEach((data, i) => expect(data.equals(inputs[i] as Buffer)).toBe(true));
    });

    it("compresses empty input to just the terminating empty block", async () => {
        const framed = await lz4BlockCompress(Buffer.alloc(0));
        expect(framed.length).toBe(HEADER_LENGTH);
        const [marker] = parseBlocks(framed);
        expect(marker?.token).toBe(COMPRESSION_METHOD_RAW | 6); // 0x16
        expect(marker?.compressedLen).toBe(0);
        expect(marker?.originalLen).toBe(0);
        expect(marker?.check).toBe(0);
        expect((await lz4BlockDecompress(framed)).length).toBe(0);
    });

    it("writes an LZ4 block with the masked xxhash32 of the decompressed bytes", async () => {
        const data = compressibleBytes(5000);
        const framed = await lz4BlockCompress(data);
        const blocks = parseBlocks(framed);
        expect(blocks).toHaveLength(2); // one data block + terminating empty block

        const block = blocks[0] as ParsedBlock;
        expect(block.token).toBe(COMPRESSION_METHOD_LZ4 | 6); // 0x26
        expect(block.originalLen).toBe(data.length);
        expect(block.compressedLen).toBeLessThan(data.length);

        const { h32Raw } = await xxhash();
        expect(block.check).toBe(h32Raw(data, DEFAULT_SEED) & CHECKSUM_MASK);
        // the mask keeps the top 4 bits clear on the wire
        expect(block.check & ~CHECKSUM_MASK).toBe(0);
    });

    it("stores incompressible blocks RAW with payload == input", async () => {
        const data = randomBytes(100);
        const framed = await lz4BlockCompress(data);
        const blocks = parseBlocks(framed);
        expect(blocks).toHaveLength(2);

        const block = blocks[0] as ParsedBlock;
        expect(block.token).toBe(COMPRESSION_METHOD_RAW | 6); // 0x16
        expect(block.compressedLen).toBe(data.length);
        expect(block.originalLen).toBe(data.length);
        expect(block.payload.equals(data)).toBe(true);
        expect((await lz4BlockDecompress(framed)).equals(data)).toBe(true);
    });

    it("splits input larger than the block size into 64KiB blocks", async () => {
        const data = compressibleBytes(200_000);
        const framed = await lz4BlockCompress(data);
        const blocks = parseBlocks(framed);
        // ceil(200000 / 65536) = 4 data blocks + terminating empty block
        expect(blocks.map((block) => block.originalLen)).toEqual([
            65536,
            65536,
            65536,
            200_000 - 3 * 65536,
            0,
        ]);
        expect((await lz4BlockDecompress(framed)).equals(data)).toBe(true);
    });

    it("round-trips 1MiB of random data (all blocks RAW)", async () => {
        const data = randomBytes(1 << 20);
        const framed = await lz4BlockCompress(data);
        const blocks = parseBlocks(framed);
        expect(blocks).toHaveLength((1 << 20) / DEFAULT_BLOCK_SIZE + 1);
        for (const block of blocks.slice(0, -1)) {
            expect(block.token & 0xf0).toBe(COMPRESSION_METHOD_RAW);
        }
        expect((await lz4BlockDecompress(framed)).equals(data)).toBe(true);
    });

    it("honors a custom block size (token level changes accordingly)", async () => {
        const data = compressibleBytes(1000);
        const framed = await lz4BlockCompress(data, 128);
        const blocks = parseBlocks(framed);
        expect(blocks).toHaveLength(Math.ceil(1000 / 128) + 1);
        // ceilLog2(128) = 7 -> max(0, 7 - 10) = 0
        for (const block of blocks) expect(block.token & 0x0f).toBe(0);
        expect((await lz4BlockDecompress(framed)).equals(data)).toBe(true);
    });
});

describe("lz4BlockDecompress rejection", () => {
    it("rejects a stream missing the terminating empty block", async () => {
        const framed = await lz4BlockCompress(compressibleBytes(5000));
        const truncated = framed.subarray(0, framed.length - HEADER_LENGTH);
        await expect(lz4BlockDecompress(truncated)).rejects.toThrow("Stream ended prematurely");
        await expect(lz4BlockDecompress(Buffer.alloc(0))).rejects.toThrow(
            "Stream ended prematurely",
        );
    });

    it("rejects streams truncated mid-header or mid-payload", async () => {
        const framed = await lz4BlockCompress(compressibleBytes(5000));
        await expect(lz4BlockDecompress(framed.subarray(0, 10))).rejects.toThrow(
            "Stream ended prematurely",
        );
        await expect(lz4BlockDecompress(framed.subarray(0, HEADER_LENGTH + 5))).rejects.toThrow(
            "Stream ended prematurely",
        );
    });

    it("rejects a corrupted magic", async () => {
        const framed = Buffer.from(await lz4BlockCompress(compressibleBytes(5000)));
        framed[0] = (framed[0] as number) ^ 0xff;
        await expect(lz4BlockDecompress(framed)).rejects.toThrow("Stream is corrupted");
    });

    it("rejects an unknown compression method in the token", async () => {
        const framed = Buffer.from(await lz4BlockCompress(compressibleBytes(5000)));
        framed[MAGIC_LENGTH] = 0x40 | 6;
        await expect(lz4BlockDecompress(framed)).rejects.toThrow("Stream is corrupted");
    });

    it("rejects an originalLength above the token's block-size bound", async () => {
        const framed = Buffer.from(await lz4BlockCompress(compressibleBytes(5000)));
        framed.writeInt32LE((1 << (COMPRESSION_LEVEL_BASE + 6)) + 1, MAGIC_LENGTH + 5);
        await expect(lz4BlockDecompress(framed)).rejects.toThrow("Stream is corrupted");
    });

    it("rejects corrupted payload bytes via the checksum", async () => {
        const framed = Buffer.from(await lz4BlockCompress(randomBytes(1000)));
        framed[HEADER_LENGTH + 500] = (framed[HEADER_LENGTH + 500] as number) ^ 0x01; // flip one bit inside a RAW payload
        await expect(lz4BlockDecompress(framed)).rejects.toThrow("Stream is corrupted");
    });

    it("rejects a checksum with the masked-out top bits set", async () => {
        const framed = Buffer.from(await lz4BlockCompress(compressibleBytes(5000)));
        framed[MAGIC_LENGTH + 12] = (framed[MAGIC_LENGTH + 12] as number) | 0xf0;
        await expect(lz4BlockDecompress(framed)).rejects.toThrow("Stream is corrupted");
    });

    it("rejects a non-zero checksum on the terminating empty block", async () => {
        const framed = Buffer.from(await lz4BlockCompress(Buffer.alloc(0)));
        framed[MAGIC_LENGTH + 9] = 1;
        await expect(lz4BlockDecompress(framed)).rejects.toThrow("Stream is corrupted");
    });

    it("decodes an externally-crafted, LZ4-spec-legal block payload", async () => {
        // simulates a stream produced by a different encoder (e.g. lz4-java itself):
        // decompressed = "aaaaaaaa" + "hello!!" via two hand-assembled LZ4 sequences
        const decompressed = Buffer.from("aaaaaaaahello!!", "ascii"); // 15 bytes
        const payload = Buffer.from([
            0x13, // seq 1 token: 1 literal | matchLength 3 (+4 = 7)
            0x61, // literal "a"
            0x01,
            0x00, // match offset 1 (LE) -> copies "a" 7 times
            0x70, // seq 2 token: 7 literals, no match (spec-legal literal-only final sequence)
            0x68,
            0x65,
            0x6c,
            0x6c,
            0x6f,
            0x21,
            0x21, // "hello!!"
        ]);
        const { h32Raw } = await xxhash();
        const header = Buffer.alloc(HEADER_LENGTH);
        MAGIC.copy(header, 0);
        header[MAGIC_LENGTH] = COMPRESSION_METHOD_LZ4 | 6;
        header.writeInt32LE(payload.length, MAGIC_LENGTH + 1);
        header.writeInt32LE(decompressed.length, MAGIC_LENGTH + 5);
        header.writeInt32LE(h32Raw(decompressed, DEFAULT_SEED) & CHECKSUM_MASK, MAGIC_LENGTH + 9);
        const finish = Buffer.alloc(HEADER_LENGTH);
        MAGIC.copy(finish, 0);
        finish[MAGIC_LENGTH] = COMPRESSION_METHOD_RAW | 6;
        const framed = Buffer.concat([header, payload, finish]);
        expect((await lz4BlockDecompress(framed)).equals(decompressed)).toBe(true);
    });

    it("ignores trailing bytes after the terminating empty block (stopOnEmptyBlock)", async () => {
        const data = compressibleBytes(5000);
        const framed = await lz4BlockCompress(data);
        const withTrailer = Buffer.concat([framed, Buffer.from("trailing garbage")]);
        expect((await lz4BlockDecompress(withTrailer)).equals(data)).toBe(true);
    });
});

function collect(readable: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        readable.on("data", (chunk: Buffer) => chunks.push(chunk));
        readable.on("end", () => resolve(Buffer.concat(chunks)));
        readable.on("error", reject);
    });
}

function chunked(data: Buffer, chunkSize: number): Readable {
    return Readable.from(
        (function* () {
            for (let offset = 0; offset < data.length; offset += chunkSize) {
                yield data.subarray(offset, Math.min(offset + chunkSize, data.length));
            }
        })(),
    );
}

describe("lz4 block streams", () => {
    it("stream compression is byte-identical to buffer compression", async () => {
        const data = compressibleBytes(200_000);
        const buffered = await lz4BlockCompress(data);

        const stream = createLz4BlockCompressStream();
        const result = collect(stream);
        chunked(data, 1000).pipe(stream as unknown as Writable);
        expect((await result).equals(buffered)).toBe(true);
    });

    it("compressing an empty stream produces only the terminating empty block", async () => {
        const stream = createLz4BlockCompressStream();
        const result = collect(stream);
        stream.end();
        expect((await result).length).toBe(HEADER_LENGTH);
    });

    it("decompresses data fed one byte at a time", async () => {
        const data = randomBytes(500);
        const framed = await lz4BlockCompress(data);
        const stream = createLz4BlockDecompressStream();
        const result = collect(stream);
        chunked(framed, 1).pipe(stream);
        expect((await result).equals(data)).toBe(true);
    });

    it("decompresses multi-block data fed in odd chunk sizes", async () => {
        const data = compressibleBytes(200_000);
        const framed = await lz4BlockCompress(data);
        const stream = createLz4BlockDecompressStream();
        const result = collect(stream);
        chunked(framed, 4097).pipe(stream);
        expect((await result).equals(data)).toBe(true);
    });

    it("errors on a truncated stream", async () => {
        const framed = await lz4BlockCompress(compressibleBytes(5000));
        const stream = createLz4BlockDecompressStream();
        const result = collect(stream);
        chunked(framed.subarray(0, framed.length - HEADER_LENGTH), 1000).pipe(stream);
        await expect(result).rejects.toThrow("Stream ended prematurely");
    });

    it("errors on corrupted stream data", async () => {
        const framed = Buffer.from(await lz4BlockCompress(randomBytes(1000)));
        framed[HEADER_LENGTH + 500] = (framed[HEADER_LENGTH + 500] as number) ^ 0x01;
        const stream = createLz4BlockDecompressStream();
        const result = collect(stream);
        chunked(framed, 100).pipe(stream);
        await expect(result).rejects.toThrow("Stream is corrupted");
    });
});
