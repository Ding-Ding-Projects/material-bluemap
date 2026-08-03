import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync, gzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { IOException } from "@material-bluemap/nbt";
import { Compression } from "../../../storage/compression/Compression.js";
import { lz4BlockCompress } from "../../../storage/compression/Lz4Block.js";
import { ChunkConsumer } from "../../ChunkConsumer.js";
import type { ChunkLoader } from "../ChunkLoader.js";
import { MCARegion } from "./MCARegion.js";

/** returns the (trailing-zero-trimmed) decompressed payload as a string */
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
        // compression "none" passes the sector-padding through; the nbt-reader would
        // simply stop at the end of the root-tag — the stub trims instead
        return Buffer.from(decompressed).toString("utf8").replace(/\0+$/, "");
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
    /** already-compressed chunk-data */
    data: Buffer;
    compressionId: number;
}

/** builds a synthetic .mca region-file (header + sector-aligned chunk-data) */
function buildRegionFile(chunks: TestChunk[]): Buffer {
    const header = Buffer.alloc(1024 * 8);
    const sectors: Buffer[] = [];
    let nextSector = 2;

    for (const chunk of chunks) {
        const payload = Buffer.alloc(5 + chunk.data.length);
        payload.writeInt32BE(chunk.data.length + 1, 0); // length-prefix (unused by the reader)
        payload.writeUInt8(chunk.compressionId, 4);
        chunk.data.copy(payload, 5);

        const sectorCount = Math.ceil(payload.length / 4096);
        const sector = Buffer.alloc(sectorCount * 4096);
        payload.copy(sector, 0);
        sectors.push(sector);

        const xzChunk = ((chunk.z & 0b11111) << 5) | (chunk.x & 0b11111);
        header.writeUIntBE(nextSector, xzChunk * 4, 3);
        header.writeUInt8(sectorCount, xzChunk * 4 + 3);
        header.writeInt32BE(chunk.timestamp, 4096 + xzChunk * 4);

        nextSector += sectorCount;
    }

    return Buffer.concat([header, ...sectors]);
}

const dir = mkdtempSync(join(tmpdir(), "mca-region-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function writeTestRegion(): Promise<string> {
    const chunks: TestChunk[] = [
        {
            x: 0,
            z: 0,
            timestamp: 100,
            data: deflateSync(Buffer.from("chunk-0-0")),
            compressionId: 2,
        },
        {
            x: 1,
            z: 0,
            timestamp: 2000,
            data: await lz4BlockCompress(Buffer.from("chunk-1-0")),
            compressionId: 4,
        },
        { x: 2, z: 3, timestamp: 300, data: Buffer.from("chunk-2-3"), compressionId: 3 },
        { x: 5, z: 5, timestamp: 4000, data: gzipSync(Buffer.from("chunk-5-5")), compressionId: 1 },
        { x: 8, z: 8, timestamp: 500, data: Buffer.from("bogus"), compressionId: 15 },
        // oversized chunk: the payload lives in c.9.1.mcc, compression-id has bit 0x80 set
        { x: 9, z: 1, timestamp: 600, data: Buffer.alloc(0), compressionId: 128 + 2 },
    ];
    const file = join(dir, "r.0.0.mca");
    writeFileSync(file, buildRegionFile(chunks));
    writeFileSync(join(dir, "c.9.1.mcc"), deflateSync(Buffer.from("chunk-9-1-oversized")));
    return file;
}

describe("MCARegion", () => {
    it("parses the region-position from the file-name", () => {
        const region = new MCARegion(new StubChunkLoader(), join(dir, "r.-2.7.mca"));
        expect(region.getRegionPos().getX()).toBe(-2);
        expect(region.getRegionPos().getY()).toBe(7);
        expect(region.exists()).toBe(false);
    });

    it("rejects invalid file-names", () => {
        expect(() => new MCARegion(new StubChunkLoader(), join(dir, "nope.mca"))).toThrow();
    });

    it("returns the empty chunk for missing region-files and missing chunks", async () => {
        const missing = new MCARegion(new StubChunkLoader(), join(dir, "r.9.9.mca"));
        await expect(missing.loadChunk(0, 0)).resolves.toBe("<empty>");

        const file = await writeTestRegion();
        const region = new MCARegion(new StubChunkLoader(), file);
        await expect(region.loadChunk(30, 30)).resolves.toBe("<empty>");
    });

    it("loads single chunks through the chunk compression-id map", async () => {
        const file = await writeTestRegion();
        const loader = new StubChunkLoader();
        const region = new MCARegion(loader, file);

        await expect(region.loadChunk(0, 0)).resolves.toBe("chunk-0-0"); // 2: deflate
        await expect(region.loadChunk(1, 0)).resolves.toBe("chunk-1-0"); // 4: lz4
        await expect(region.loadChunk(2, 3)).resolves.toBe("chunk-2-3"); // 3: none
        await expect(region.loadChunk(5, 5)).resolves.toBe("chunk-5-5"); // 1: gzip
        expect(loader.compressions).toEqual(["deflate", "lz4", "none", "gzip"]);
    });

    it("loads oversized chunks from their .mcc file", async () => {
        const file = await writeTestRegion();
        const region = new MCARegion(new StubChunkLoader(), file);
        await expect(region.loadChunk(9, 1)).resolves.toBe("chunk-9-1-oversized");
    });

    it("fails on unknown compression-ids", async () => {
        const file = await writeTestRegion();
        const region = new MCARegion(new StubChunkLoader(), file);
        await expect(region.loadChunk(8, 8)).rejects.toThrow(
            /Exception trying to read chunk \(8,8\).*Unknown chunk compression-id: 15/,
        );
    });

    it("iterates all chunks with timestamps and filtering", async () => {
        const file = await writeTestRegion();
        const region = new MCARegion(new StubChunkLoader(), file);

        // list-only: sees every chunk (with its timestamp) without loading any
        const listed: [number, number, number][] = [];
        await region.iterateAllChunks(
            ChunkConsumer.listOnly((x, z, lastModified) => listed.push([x, z, lastModified])),
        );
        // iteration-order is x-major
        expect(listed).toEqual([
            [0, 0, 100],
            [1, 0, 2000],
            [2, 3, 300],
            [5, 5, 4000],
            [8, 8, 500],
            [9, 1, 600],
        ]);

        // filtered loading + fail-callback for the broken chunk
        const accepted: [number, number, string][] = [];
        const failed: [number, number, string][] = [];
        await region.iterateAllChunks({
            filter: (_x, _z, lastModified) => lastModified < 1000,
            accept: (x, z, chunk) => accepted.push([x, z, chunk]),
            fail: (x, z, ex) => failed.push([x, z, ex.message]),
        });
        expect(accepted).toEqual([
            [0, 0, "chunk-0-0"],
            [2, 3, "chunk-2-3"],
            [9, 1, "chunk-9-1-oversized"],
        ]);
        expect(failed).toHaveLength(1);
        expect(failed[0]![0]).toBe(8);
        expect(failed[0]![2]).toContain("Unknown chunk compression-id: 15");
    });

    it("wraps failures without a fail-callback into the outer IOException", async () => {
        const file = await writeTestRegion();
        const region = new MCARegion(new StubChunkLoader(), file);
        await expect(region.iterateAllChunks({ accept: () => undefined })).rejects.toThrow(
            IOException,
        );
    });

    it("offsets chunk-coordinates by the region-position", async () => {
        const chunks: TestChunk[] = [
            {
                x: 3,
                z: 4,
                timestamp: 7,
                data: deflateSync(Buffer.from("offset-chunk")),
                compressionId: 2,
            },
        ];
        const file = join(dir, "r.-1.2.mca");
        writeFileSync(file, buildRegionFile(chunks));

        const region = new MCARegion(new StubChunkLoader(), file);
        const listed: [number, number][] = [];
        await region.iterateAllChunks(ChunkConsumer.listOnly((x, z) => listed.push([x, z])));
        expect(listed).toEqual([[-32 + 3, 64 + 4]]);

        // loadChunk masks the chunk-position into the region (chunkX & 0b11111)
        await expect(region.loadChunk(-32 + 3, 64 + 4)).resolves.toBe("offset-chunk");
    });
});
