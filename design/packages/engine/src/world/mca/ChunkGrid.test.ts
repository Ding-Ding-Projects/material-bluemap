import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Vector2i } from "@worldlens/shared";
import type { ChunkConsumer } from "../ChunkConsumer.js";
import { Region } from "../Region.js";
import { ChunkGrid } from "./ChunkGrid.js";
import type { ChunkLoader } from "./ChunkLoader.js";
import { RegionType } from "./region/RegionType.js";

class TestChunk {
    constructor(readonly name: string) {}
}

const EMPTY = new TestChunk("empty");
const ERRORED = new TestChunk("errored");

const loader: ChunkLoader<TestChunk> = {
    load: () => Promise.reject(new Error("not used")),
    emptyChunk: () => EMPTY,
    erroredChunk: () => ERRORED,
};

class StubRegion extends Region<TestChunk> {
    loads = 0;
    failing = false;

    override async loadChunk(chunkX: number, chunkZ: number): Promise<TestChunk> {
        this.loads++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (this.failing) throw new Error("io failure");
        return new TestChunk(chunkX + ":" + chunkZ);
    }

    override async iterateAllChunks(consumer: ChunkConsumer<TestChunk>): Promise<void> {
        const positions: [number, number][] = [
            [1, 2],
            [3, 4],
        ];
        for (const [chunkX, chunkZ] of positions) {
            if (consumer.filter === undefined || consumer.filter(chunkX, chunkZ, 0)) {
                consumer.accept(chunkX, chunkZ, new TestChunk("pre:" + chunkX + ":" + chunkZ));
            }
        }
    }

    override emptyChunk(): TestChunk {
        return EMPTY;
    }

    override exists(): boolean {
        return true;
    }
}

class StubbedChunkGrid extends ChunkGrid<TestChunk> {
    constructor(private readonly region: StubRegion) {
        super(loader, "/does/not/exist");
    }

    override getRegion(_x: number, _z: number): Region<TestChunk> {
        return this.region;
    }
}

describe("ChunkGrid", () => {
    it("exposes the 16x16 chunk-grid and the 512x512 region-grid", () => {
        const grid = new StubbedChunkGrid(new StubRegion());
        expect(grid.getChunkGrid().getGridSize().getX()).toBe(16);
        expect(grid.getChunkGrid().getGridSize().getY()).toBe(16);
        expect(grid.getRegionGrid().getGridSize().getX()).toBe(512);
        expect(grid.getRegionGrid().getGridSize().getY()).toBe(512);
    });

    it("dedups concurrent getChunk calls into one load", async () => {
        const region = new StubRegion();
        const grid = new StubbedChunkGrid(region);

        const [a, b] = await Promise.all([grid.getChunk(0, 0), grid.getChunk(0, 0)]);

        expect(a).toBe(b);
        expect(a.name).toBe("0:0");
        expect(region.loads).toBe(1);

        // now cached: no further load
        expect(await grid.getChunk(0, 0)).toBe(a);
        expect(region.loads).toBe(1);
    });

    it("loads (and caches) per chunk-position", async () => {
        const region = new StubRegion();
        const grid = new StubbedChunkGrid(region);

        const a = await grid.getChunk(0, 0);
        const b = await grid.getChunk(1, 0);

        expect(a.name).toBe("0:0");
        expect(b.name).toBe("1:0");
        expect(region.loads).toBe(2);
    });

    it("getCachedChunk returns the empty chunk on a miss and schedules the load", async () => {
        const region = new StubRegion();
        const grid = new StubbedChunkGrid(region);

        expect(grid.getCachedChunk(0, 0)).toBe(EMPTY);

        // the scheduled load is shared with a direct getChunk
        const chunk = await grid.getChunk(0, 0);
        expect(region.loads).toBe(1);
        expect(grid.getCachedChunk(0, 0)).toBe(chunk);
    });

    it("invalidateChunkCache(x, z) forces a reload", async () => {
        const region = new StubRegion();
        const grid = new StubbedChunkGrid(region);

        const a = await grid.getChunk(0, 0);
        grid.invalidateChunkCache(0, 0);
        const b = await grid.getChunk(0, 0);

        expect(region.loads).toBe(2);
        expect(a).not.toBe(b);
    });

    it("invalidation while a load is in flight discards its result", async () => {
        const region = new StubRegion();
        const grid = new StubbedChunkGrid(region);

        const inFlight = grid.getChunk(0, 0);
        grid.invalidateChunkCache();
        await inFlight;

        // the invalidated load was not published to the cache
        await grid.getChunk(0, 0);
        expect(region.loads).toBe(2);
    });

    it("falls back to the errored chunk after 3 failed tries", { timeout: 10000 }, async () => {
        const region = new StubRegion();
        region.failing = true;
        const grid = new StubbedChunkGrid(region);

        const chunk = await grid.getChunk(0, 0);

        expect(chunk).toBe(ERRORED);
        expect(region.loads).toBe(3);
    });

    it("preloadRegionChunks caches accepted chunks and respects the filter", async () => {
        const region = new StubRegion();
        const grid = new StubbedChunkGrid(region);

        await grid.preloadRegionChunks(0, 0, (pos: Vector2i) => pos.getX() === 1);

        expect(grid.getCachedChunk(1, 2).name).toBe("pre:1:2");
        // filtered out -> never loaded into the cache
        expect(grid.getCachedChunk(3, 4)).toBe(EMPTY);
    });
});

describe("region-file names", () => {
    it("format/parse round-trips", () => {
        for (const [x, z] of [
            [0, 0],
            [12, -34],
            [-1, -1],
            [100000, -100000],
        ] as const) {
            const fileName = RegionType.MCA.getRegionFileName(x, z);
            const pos = RegionType.regionForFileName(fileName);
            expect(pos).not.toBeNull();
            expect(pos!.getX()).toBe(x);
            expect(pos!.getY()).toBe(z);
        }

        expect(RegionType.MCA.getRegionFileName(12, -34)).toBe("r.12.-34.mca");
    });

    it("rejects malformed and out-of-bounds names", () => {
        expect(RegionType.regionForFileName("foo.txt")).toBeNull();
        expect(RegionType.regionForFileName("r.a.b.mca")).toBeNull();
        expect(RegionType.regionForFileName("r.1.2.mca.bak")).toBeNull();
        expect(RegionType.regionForFileName("r.100001.0.mca")).toBeNull();
    });
});

describe("ChunkGrid.listRegions", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bluemap-chunkgrid-"));

    afterAll(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    it("lists non-empty region-files, skipping empty and foreign files", () => {
        writeFileSync(join(tempDir, "r.0.0.mca"), "data");
        writeFileSync(join(tempDir, "r.-3.7.mca"), "data");
        writeFileSync(join(tempDir, "r.9.9.mca"), ""); // empty -> skipped
        writeFileSync(join(tempDir, "foo.txt"), "data"); // no region-file -> skipped

        const grid = new ChunkGrid(loader, tempDir);
        const regions = grid
            .listRegions()
            .map((pos) => pos.getX() + "," + pos.getY())
            .sort();

        expect(regions).toEqual(["-3,7", "0,0"]);
    });

    it("returns an empty list for a missing region-folder", () => {
        const grid = new ChunkGrid(loader, join(tempDir, "missing"));
        expect(grid.listRegions()).toEqual([]);
    });
});
