import { describe, expect, it } from "vitest";
import { ChunkConsumer } from "./ChunkConsumer.js";
import { Region } from "./Region.js";

interface TestChunk {
    x: number;
    z: number;
    lastModified: number;
}

class TestRegion extends Region<TestChunk | null> {
    loadedChunks: [number, number][] = [];

    constructor(private readonly chunks: TestChunk[]) {
        super();
    }

    override async iterateAllChunks(consumer: ChunkConsumer<TestChunk | null>): Promise<void> {
        for (const chunk of this.chunks) {
            // upstream interface-default of ChunkConsumer#filter is `true`
            if (consumer.filter === undefined || consumer.filter(chunk.x, chunk.z, chunk.lastModified)) {
                this.loadedChunks.push([chunk.x, chunk.z]);
                consumer.accept(chunk.x, chunk.z, chunk);
            }
        }
    }

    override emptyChunk(): TestChunk | null {
        return null;
    }

    override exists(): boolean {
        return true;
    }
}

describe("Region default loadChunk", () => {
    const chunks: TestChunk[] = [
        { x: 0, z: 0, lastModified: 100 },
        { x: 1, z: 0, lastModified: 200 },
        { x: 5, z: -3, lastModified: 300 },
    ];

    it("loads only the requested chunk", async () => {
        const region = new TestRegion(chunks);
        const chunk = await region.loadChunk(5, -3);
        expect(chunk).toEqual({ x: 5, z: -3, lastModified: 300 });
        expect(region.loadedChunks).toEqual([[5, -3]]);
    });

    it("returns the empty chunk when the chunk is not present", async () => {
        const region = new TestRegion(chunks);
        expect(await region.loadChunk(9, 9)).toBeNull();
        expect(region.loadedChunks).toEqual([]);
    });
});

describe("ChunkConsumer.listOnly", () => {
    it("lists chunk positions without ever loading chunks", async () => {
        const region = new TestRegion([
            { x: 0, z: 0, lastModified: 100 },
            { x: 1, z: 2, lastModified: 200 },
        ]);

        const listed: [number, number, number][] = [];
        await region.iterateAllChunks(
            ChunkConsumer.listOnly((chunkX, chunkZ, lastModified) =>
                listed.push([chunkX, chunkZ, lastModified]),
            ),
        );

        expect(listed).toEqual([
            [0, 0, 100],
            [1, 2, 200],
        ]);
        expect(region.loadedChunks).toEqual([]);
    });

    it("throws if accept is called anyway", () => {
        const consumer = ChunkConsumer.listOnly(() => {});
        expect(() => consumer.accept(0, 0, null)).toThrowError("Should never be called.");
    });
});
