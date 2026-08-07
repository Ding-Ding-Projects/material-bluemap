import { describe, expect, it } from "vitest";
import { NBTWriter } from "@worldlens/nbt";
import { gzipSync } from "node:zlib";
import { Compression } from "../../../storage/compression/Compression.js";
import { Chunk } from "../../Chunk.js";
import { DimensionType } from "../../DimensionType.js";
import type { MCAWorld } from "../MCAWorld.js";
import { Chunk_1_12 } from "./Chunk_1_12.js";
import { Chunk_1_13 } from "./Chunk_1_13.js";
import { Chunk_1_15 } from "./Chunk_1_15.js";
import { Chunk_1_16 } from "./Chunk_1_16.js";
import { Chunk_1_18 } from "./Chunk_1_18.js";
import { MCAChunkLoader } from "./MCAChunkLoader.js";

const WORLD = {
    getDimensionType: () => DimensionType.OVERWORLD,
    getDataPack: () => ({ getBiome: () => null }),
} as unknown as MCAWorld;

function chunkNbt(dataVersion?: number): Uint8Array {
    const writer = new NBTWriter();
    writer.beginCompound();
    if (dataVersion !== undefined) {
        writer.name("DataVersion");
        writer.valueInt(dataVersion);
    }
    writer.endCompound();
    writer.close();
    return writer.toUint8Array();
}

async function loadVersion(loader: MCAChunkLoader, dataVersion?: number): Promise<Chunk> {
    const data = chunkNbt(dataVersion);
    return loader.load(data, 0, data.length, Compression.NONE);
}

describe("MCAChunkLoader", () => {
    it("dispatches DataVersions to their chunk-format", async () => {
        const loader = new MCAChunkLoader(WORLD);

        expect(await loadVersion(loader, 2860)).toBeInstanceOf(Chunk_1_18);
        expect(await loadVersion(loader, 2844)).toBeInstanceOf(Chunk_1_18);

        expect(await loadVersion(loader, 2843)).toBeInstanceOf(Chunk_1_16);
        expect(await loadVersion(loader, 2586)).toBeInstanceOf(Chunk_1_16);
        expect(await loadVersion(loader, 2500)).toBeInstanceOf(Chunk_1_16);

        expect(await loadVersion(loader, 2499)).toBeInstanceOf(Chunk_1_15);
        expect(await loadVersion(loader, 2230)).toBeInstanceOf(Chunk_1_15);
        expect(await loadVersion(loader, 2200)).toBeInstanceOf(Chunk_1_15);

        const chunk1_13 = await loadVersion(loader, 1519);
        expect(chunk1_13).toBeInstanceOf(Chunk_1_13);
        expect(chunk1_13).not.toBeInstanceOf(Chunk_1_15);
        expect(await loadVersion(loader, 2199)).toBeInstanceOf(Chunk_1_13);
        expect(await loadVersion(loader, 1344)).toBeInstanceOf(Chunk_1_13);

        // <= 1343 (or absent) dispatches to the legacy 1.12 chunk-format
        expect(await loadVersion(loader, 1343)).toBeInstanceOf(Chunk_1_12);
        expect(await loadVersion(loader, 100)).toBeInstanceOf(Chunk_1_12);
        expect(await loadVersion(loader)).toBeInstanceOf(Chunk_1_12);
    });

    it("re-reads with the correct loader after a wrong guess (lastUsedLoader)", async () => {
        // a fresh loader starts with the 1.18-loader; an old chunk must still resolve
        const freshLoader = new MCAChunkLoader(WORLD);
        expect(await loadVersion(freshLoader, 1519)).toBeInstanceOf(Chunk_1_13);
        // ...and sticks to the last used loader for the next chunk
        expect(await loadVersion(freshLoader, 1519)).toBeInstanceOf(Chunk_1_13);
        // ...and switches back up for newer chunks
        expect(await loadVersion(freshLoader, 2860)).toBeInstanceOf(Chunk_1_18);
    });

    it("decompresses the chunk-data with the given compression", async () => {
        const loader = new MCAChunkLoader(WORLD);
        const compressed = gzipSync(chunkNbt(2860));
        const chunk = await loader.load(compressed, 0, compressed.length, Compression.GZIP);
        expect(chunk).toBeInstanceOf(Chunk_1_18);
    });

    it("fails with an IOException-wrapped parse-error", async () => {
        const loader = new MCAChunkLoader(WORLD);
        const bogus = new Uint8Array([1, 2, 3]);
        await expect(loader.load(bogus, 0, bogus.length, Compression.NONE)).rejects.toThrow(
            /Failed to parse chunk-data/,
        );
    });

    it("provides the empty- and errored-chunk singletons", () => {
        const loader = new MCAChunkLoader(WORLD);
        expect(loader.emptyChunk()).toBe(Chunk.EMPTY_CHUNK);
        expect(loader.erroredChunk()).toBe(Chunk.ERRORED_CHUNK);
    });
});
