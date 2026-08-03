import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { Compression } from "../../../storage/compression/Compression.js";
import { ChunkConsumer } from "../../ChunkConsumer.js";
import type { ChunkLoader } from "../ChunkLoader.js";
import { LinearRegion } from "./LinearRegion.js";

const MAGIC = 0xc3ff13183cca9d9an;

class StubChunkLoader implements ChunkLoader<string> {
    readonly compressions: string[] = [];

    async load(
        data: Uint8Array,
        offset: number,
        length: number,
        compression: Compression,
    ): Promise<string> {
        this.compressions.push(compression.getId());
        const decompressed = await compression.decompress(data.subarray(offset, offset + length));
        return Buffer.from(decompressed).toString("utf8");
    }

    emptyChunk(): string {
        return "<empty>";
    }

    erroredChunk(): string {
        return "<errored>";
    }
}

interface TestChunk {
    x: number;
    z: number;
    timestamp: number;
    payload: Buffer;
}

/** builds a synthetic .linear region-file */
async function buildLinearFile(
    chunks: TestChunk[],
    options?: { version?: number; newestTimestamp?: bigint; corruptFooter?: boolean },
): Promise<Buffer> {
    const version = options?.version ?? 2;
    const newestTimestamp = options?.newestTimestamp ?? 0n;

    const innerHeader = Buffer.alloc(32 * 32 * 8);
    const payloads: Buffer[] = [];
    for (const chunk of chunks) {
        const index = (chunk.z & 0b11111) * 32 + (chunk.x & 0b11111);
        innerHeader.writeInt32BE(chunk.payload.length, index * 8);
        innerHeader.writeInt32BE(chunk.timestamp, index * 8 + 4);
    }
    // payload-order follows the z-major header-order
    for (const chunk of [...chunks].sort(
        (a, b) => (a.z & 0b11111) * 32 + (a.x & 0b11111) - ((b.z & 0b11111) * 32 + (b.x & 0b11111)),
    )) {
        payloads.push(chunk.payload);
    }

    const data = await Compression.ZSTD.compress(Buffer.concat([innerHeader, ...payloads]));

    const file = Buffer.alloc(32 + data.length + 8);
    file.writeBigUInt64BE(MAGIC, 0);
    file.writeInt8(version, 8);
    file.writeBigInt64BE(newestTimestamp, 9);
    file.writeInt8(3, 17); // compression level
    file.writeInt16BE(chunks.length, 18); // chunk count
    file.writeInt32BE(data.length, 20); // data-length
    file.writeBigInt64BE(0n, 24); // data-hash
    data.copy(file, 32);
    file.writeBigUInt64BE(options?.corruptFooter === true ? 0n : MAGIC, 32 + data.length);
    return file;
}

const dir = mkdtempSync(join(tmpdir(), "linear-region-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const TEST_CHUNKS: TestChunk[] = [
    { x: 0, z: 0, timestamp: 100, payload: Buffer.from("linear-0-0") },
    { x: 1, z: 0, timestamp: 2000, payload: Buffer.from("linear-1-0") },
    { x: 0, z: 2, timestamp: 300, payload: Buffer.from("linear-0-2") },
];

describe("LinearRegion", () => {
    it("parses the region-position from the file-name", () => {
        const region = new LinearRegion(new StubChunkLoader(), join(dir, "r.4.-9.linear"));
        expect(region.getRegionPos().getX()).toBe(4);
        expect(region.getRegionPos().getY()).toBe(-9);
        expect(region.exists()).toBe(false);
    });

    it("iterates all chunks (v2: per-chunk timestamps) in z-major order", async () => {
        const file = join(dir, "r.0.0.linear");
        writeFileSync(file, await buildLinearFile(TEST_CHUNKS));

        const loader = new StubChunkLoader();
        const region = new LinearRegion(loader, file);

        const listed: [number, number, number][] = [];
        await region.iterateAllChunks(
            ChunkConsumer.listOnly((x, z, lastModified) => listed.push([x, z, lastModified])),
        );
        expect(listed).toEqual([
            [0, 0, 100],
            [1, 0, 2000],
            [0, 2, 300],
        ]);

        const accepted: [number, number, string][] = [];
        await region.iterateAllChunks({
            accept: (x, z, chunk) => accepted.push([x, z, chunk]),
        });
        expect(accepted).toEqual([
            [0, 0, "linear-0-0"],
            [1, 0, "linear-1-0"],
            [0, 2, "linear-0-2"],
        ]);
        // the chunk-data inside the zstd-compressed body is stored uncompressed
        expect(new Set(loader.compressions)).toEqual(new Set(["none"]));

        expect(region.getVersion()).toBe(2);
        expect(region.getChunkCount()).toBe(3);
    });

    it("skips filtered chunk-data (position-bookkeeping stays intact)", async () => {
        const file = join(dir, "r.0.0.skip.linear"); // note: still r.0.0 by index 1/2
        writeFileSync(join(dir, "r.0.0.skip.linear"), await buildLinearFile(TEST_CHUNKS));

        const region = new LinearRegion(new StubChunkLoader(), file);
        const accepted: [number, number, string][] = [];
        await region.iterateAllChunks({
            filter: (_x, z) => z === 2, // skips the first two payloads
            accept: (x, z, chunk) => accepted.push([x, z, chunk]),
        });
        expect(accepted).toEqual([[0, 2, "linear-0-2"]]);
    });

    it("falls back to the region-timestamp for v1 files", async () => {
        const file = join(dir, "r.0.0.v1.linear");
        writeFileSync(
            file,
            await buildLinearFile(TEST_CHUNKS, { version: 1, newestTimestamp: 1234567890n }),
        );

        const region = new LinearRegion(new StubChunkLoader(), file);
        const listed: number[] = [];
        await region.iterateAllChunks(
            ChunkConsumer.listOnly((_x, _z, lastModified) => listed.push(lastModified)),
        );
        expect(listed).toEqual([1234567890, 1234567890, 1234567890]);
    });

    it("supports the default loadChunk through iterateAllChunks", async () => {
        const file = join(dir, "r.0.0.load.linear");
        writeFileSync(file, await buildLinearFile(TEST_CHUNKS));

        const region = new LinearRegion(new StubChunkLoader(), file);
        await expect(region.loadChunk(1, 0)).resolves.toBe("linear-1-0");
        await expect(region.loadChunk(30, 30)).resolves.toBe("<empty>");
    });

    it("rejects an invalid header magic", async () => {
        const file = join(dir, "r.0.0.badmagic.linear");
        const bytes = await buildLinearFile(TEST_CHUNKS);
        bytes.writeBigUInt64BE(0n, 0);
        writeFileSync(file, bytes);

        const region = new LinearRegion(new StubChunkLoader(), file);
        await expect(region.iterateAllChunks({ accept: () => undefined })).rejects.toThrow(
            "invalid header magic",
        );
    });

    it("rejects an invalid footer magic", async () => {
        const file = join(dir, "r.0.0.badfooter.linear");
        writeFileSync(file, await buildLinearFile(TEST_CHUNKS, { corruptFooter: true }));

        const region = new LinearRegion(new StubChunkLoader(), file);
        await expect(region.iterateAllChunks({ accept: () => undefined })).rejects.toThrow(
            "invalid footer magic",
        );
    });

    it("rejects an unsupported version", async () => {
        const file = join(dir, "r.0.0.badversion.linear");
        writeFileSync(file, await buildLinearFile(TEST_CHUNKS, { version: 3 }));

        const region = new LinearRegion(new StubChunkLoader(), file);
        await expect(region.iterateAllChunks({ accept: () => undefined })).rejects.toThrow(
            "Unsupported version: 3",
        );
    });

    it("rejects a file-length mismatch", async () => {
        const file = join(dir, "r.0.0.badlength.linear");
        const bytes = await buildLinearFile(TEST_CHUNKS);
        writeFileSync(file, Buffer.concat([bytes, Buffer.alloc(1)]));

        const region = new LinearRegion(new StubChunkLoader(), file);
        await expect(region.iterateAllChunks({ accept: () => undefined })).rejects.toThrow(
            "Invalid file length",
        );
    });
});
