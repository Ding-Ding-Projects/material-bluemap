import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ShardPlan } from "../plan/plan.js";
import { gridCellPath } from "./gridPath.js";
import { LowresTile } from "./lowresTile.js";
import { assertIdenticalTextures, MergeError, mergeShardMaps } from "./mergeMap.js";
import { verifyMerge } from "./verify.js";

const TILE_SIZE = 10;
const LOD_FACTOR = 5;
const LOD_COUNT = 3;

const SETTINGS = JSON.stringify({
    name: "world",
    hires: { tileSize: [32, 32], scale: [1, 1], translate: [2, 2] },
    lowres: { tileSize: [TILE_SIZE, TILE_SIZE], lodFactor: LOD_FACTOR, lodCount: LOD_COUNT },
});

/** A believable PRBM body: version 1, the header bits BlueMap writes, then some payload. */
function prbmTile(seed: number): Buffer {
    const body = Buffer.alloc(64);
    body[0] = 1;
    body[1] = 0b0_0_0_00111;
    for (let index = 8; index < body.length; index++) body[index] = (seed * index) & 0xff;
    return gzipSync(body);
}

async function write(path: string, contents: Buffer | string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
}

interface ShardSpec {
    /** hires tile cells this shard owns */
    hires: { x: number; z: number }[];
    /** lod-1 pixels this shard rendered, per tile cell */
    rendered: { cell: { x: number; z: number }; pixels: { x: number; z: number }[] }[];
    /** lod-1 pixels this shard erased because they belong to another shard */
    erased?: { cell: { x: number; z: number }; pixels: { x: number; z: number }[] }[];
    textures?: string;
}

async function buildShard(root: string, spec: ShardSpec): Promise<string> {
    await write(join(root, "settings.json"), SETTINGS);
    await write(
        join(root, "textures.json.gz"),
        gzipSync(spec.textures ?? '[{"resourcePath":"bluemap:missing"},{"resourcePath":"minecraft:block/stone"}]'),
    );

    for (const cell of spec.hires)
        await write(join(root, "tiles", "0", gridCellPath(cell, ".prbm.gz")), prbmTile(cell.x + 1));

    const tiles = new Map<string, LowresTile>();
    const tileFor = (cell: { x: number; z: number }): LowresTile => {
        const key = cell.x + "," + cell.z;
        let tile = tiles.get(key);
        if (tile === undefined) {
            tile = LowresTile.blank(TILE_SIZE);
            tiles.set(key, tile);
        }
        return tile;
    };

    for (const entry of spec.rendered)
        for (const pixel of entry.pixels)
            tileFor(entry.cell).set(
                pixel.x,
                pixel.z,
                { r: 20 + pixel.x, g: 40 + pixel.z, b: 60, a: 255 },
                64 + pixel.x,
                0,
            );

    for (const entry of spec.erased ?? [])
        for (const pixel of entry.pixels)
            tileFor(entry.cell).set(pixel.x, pixel.z, { r: 0, g: 0, b: 0, a: 0 }, 0, 0);

    for (const [key, tile] of tiles) {
        const [x = "0", z = "0"] = key.split(",");
        const cell = { x: Number(x), z: Number(z) };
        await write(join(root, "tiles", "1", gridCellPath(cell, ".png")), tile.encode());

        // a deliberately wrong lod 2, of the kind a shard really produces: derived from a
        // half-filled lod 1 and therefore averaged against pixels it never rendered
        const wrong = LowresTile.blank(TILE_SIZE);
        wrong.set(0, 0, { r: 255, g: 0, b: 255, a: 255 }, 999, 15);
        await write(join(root, "tiles", "2", gridCellPath(cell, ".png")), wrong.encode());
    }

    await write(join(root, "live", "markers.json"), "{}");
    await write(join(root, "live", "players.json"), "{}");
    await write(join(root, "rstate", "x0", "z0.tiles.dat"), gzipSync(Buffer.alloc(16)));

    return root;
}

function planFor(shardCount: number): ShardPlan {
    const shards = [];
    for (let id = 0; id < shardCount; id++)
        shards.push({
            id,
            gridX: id,
            gridZ: 0,
            regions: { x: { min: id, max: id }, z: { min: 0, max: 0 } },
            bounds: {
                x: { min: id === 0 ? null : id * 512 + 2, max: id === shardCount - 1 ? null : (id + 1) * 512 + 1 },
                z: { min: null, max: null },
            },
            chunkCount: 1024,
            estimatedSeconds: 100,
        });

    return {
        mapId: "world",
        dimension: "minecraft:overworld",
        world: {
            regions: { x: { min: 0, max: shardCount - 1 }, z: { min: 0, max: 0 } },
            blocks: { x: { min: 0, max: shardCount * 512 - 1 }, z: { min: 0, max: 511 } },
            regionFileCount: shardCount,
            chunkCount: 1024 * shardCount,
            bytes: 1,
            bytesPerChunk: 4104,
        },
        estimate: {
            chunkCount: 1024 * shardCount,
            chunksPerSecond: 25,
            complexityFactor: 1,
            rawSeconds: 100,
            seconds: 150,
            calibrated: false,
        },
        budgetSeconds: 3600,
        requestedShards: shardCount,
        grid: { x: shardCount, z: 1 },
        shards,
        layout: {
            hiresTileSize: 32,
            hiresTileOffset: 2,
            lowresTileSize: TILE_SIZE,
            lodFactor: LOD_FACTOR,
            lodCount: LOD_COUNT,
        },
        decision: [],
    };
}

describe("merging shard maps", () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), "render-actions-merge-"));
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    async function twoShards(): Promise<string[]> {
        const cell = { x: 0, z: 0 };
        const a = await buildShard(join(root, "shard-0", "world"), {
            hires: [
                { x: 0, z: 0 },
                { x: 1, z: 0 },
            ],
            rendered: [{ cell, pixels: [{ x: 1, z: 1 }, { x: 2, z: 1 }] }],
            // shard 0 erases the columns shard 1 owns, exactly as BlueMap does
            erased: [{ cell, pixels: [{ x: 7, z: 1 }, { x: 8, z: 1 }] }],
        });
        const b = await buildShard(join(root, "shard-1", "world"), {
            hires: [
                { x: 2, z: 0 },
                { x: 3, z: 0 },
            ],
            rendered: [{ cell, pixels: [{ x: 7, z: 1 }, { x: 8, z: 1 }] }],
            erased: [{ cell, pixels: [{ x: 1, z: 1 }, { x: 2, z: 1 }] }],
        });
        return [a, b];
    }

    it("unions the hires tiles and proves nothing was written twice", async () => {
        const shards = await twoShards();
        const out = join(root, "merged");
        const report = await mergeShardMaps({
            shardMapDirectories: shards,
            outputDirectory: out,
            lowresTileSize: TILE_SIZE,
            lodFactor: LOD_FACTOR,
            lodCount: LOD_COUNT,
        });

        expect(report.hires.perShard).toEqual([2, 2]);
        expect(report.hires.merged).toBe(4);
        expect(report.hires.collisions).toEqual([]);

        const original = await readFile(join(shards[0]!, "tiles", "0", gridCellPath({ x: 0, z: 0 }, ".prbm.gz")));
        const merged = await readFile(join(out, "tiles", "0", gridCellPath({ x: 0, z: 0 }, ".prbm.gz")));
        expect(merged.equals(original)).toBe(true);
    });

    it("lets each shard's terrain overrule the other's erasure", async () => {
        const shards = await twoShards();
        const out = join(root, "merged");
        const report = await mergeShardMaps({
            shardMapDirectories: shards,
            outputDirectory: out,
            lowresTileSize: TILE_SIZE,
            lodFactor: LOD_FACTOR,
            lodCount: LOD_COUNT,
        });

        expect(report.lowres.conflictingPixels).toBe(0);
        expect(report.lowres.overruledErasures).toBe(4);

        const tile = LowresTile.decode(
            await readFile(join(out, "tiles", "1", gridCellPath({ x: 0, z: 0 }, ".png"))),
            TILE_SIZE,
        );
        // shard 0's terrain survived shard 1's erasure, and vice versa
        expect(tile.hasContent(1, 1)).toBe(true);
        expect(tile.hasContent(8, 1)).toBe(true);
        expect(tile.getHeight(1, 1)).toBe(65);
        expect(tile.getHeight(8, 1)).toBe(72);
    });

    it("throws away the shards' coarse lods and rebuilds them from the merged lod 1", async () => {
        const shards = await twoShards();
        const out = join(root, "merged");
        const report = await mergeShardMaps({
            shardMapDirectories: shards,
            outputDirectory: out,
            lowresTileSize: TILE_SIZE,
            lodFactor: LOD_FACTOR,
            lodCount: LOD_COUNT,
        });

        expect(report.lowres.discardedShardLodTiles).toBeGreaterThan(0);
        expect(report.lowres.rebuiltLods.map((entry) => entry.lod)).toEqual([2, 3]);

        const lod2 = LowresTile.decode(
            await readFile(join(out, "tiles", "2", gridCellPath({ x: 0, z: 0 }, ".png"))),
            TILE_SIZE,
        );
        // the shards' lod 2 had the sentinel magenta at height 999; the rebuilt one must not
        expect(lod2.getHeight(0, 0)).not.toBe(999);
        expect(lod2.getColor(0, 0)).not.toEqual({ r: 255, g: 0, b: 255, a: 255 });
    });

    it("leaves the render state out, and says how much it left out", async () => {
        const shards = await twoShards();
        const report = await mergeShardMaps({
            shardMapDirectories: shards,
            outputDirectory: join(root, "merged"),
            lowresTileSize: TILE_SIZE,
            lodFactor: LOD_FACTOR,
            lodCount: LOD_COUNT,
        });
        expect(report.renderStateSkipped).toBe(2);
        expect(report.notes.join("\n")).toContain("render-state files");
    });

    it("verifies the merged map lost and duplicated nothing", async () => {
        const shards = await twoShards();
        const out = join(root, "merged");
        await mergeShardMaps({
            shardMapDirectories: shards,
            outputDirectory: out,
            lowresTileSize: TILE_SIZE,
            lodFactor: LOD_FACTOR,
            lodCount: LOD_COUNT,
        });

        const report = await verifyMerge({
            plan: planFor(2),
            shardMapDirectories: shards,
            mergedDirectory: out,
        });

        expect(report.checks.filter((check) => !check.ok)).toEqual([]);
        expect(report.ok).toBe(true);
    });

    it("fails verification when a merged tile has gone missing", async () => {
        const shards = await twoShards();
        const out = join(root, "merged");
        await mergeShardMaps({
            shardMapDirectories: shards,
            outputDirectory: out,
            lowresTileSize: TILE_SIZE,
            lodFactor: LOD_FACTOR,
            lodCount: LOD_COUNT,
        });

        await rm(join(out, "tiles", "0", gridCellPath({ x: 3, z: 0 }, ".prbm.gz")));

        const report = await verifyMerge({
            plan: planFor(2),
            shardMapDirectories: shards,
            mergedDirectory: out,
        });
        expect(report.ok).toBe(false);
        expect(report.checks.find((check) => check.name === "hires tile count")?.ok).toBe(false);
    });
});

describe("the texture ordinal guard", () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), "render-actions-textures-"));
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it("passes identical galleries through and returns their hash", () => {
        const bytes = Buffer.from('[{"resourcePath":"bluemap:missing"}]');
        const hash = assertIdenticalTextures([
            { directory: "a", bytes },
            { directory: "b", bytes: Buffer.from(bytes) },
        ]);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("refuses to merge shards whose texture ordinals differ", async () => {
        const a = await buildShard(join(root, "shard-0", "world"), {
            hires: [{ x: 0, z: 0 }],
            rendered: [{ cell: { x: 0, z: 0 }, pixels: [{ x: 1, z: 1 }] }],
        });
        const b = await buildShard(join(root, "shard-1", "world"), {
            hires: [{ x: 2, z: 0 }],
            rendered: [{ cell: { x: 0, z: 0 }, pixels: [{ x: 7, z: 1 }] }],
            // the same two textures, in the other order: every tile ordinal now means
            // something different, and merging would render blocks with swapped textures
            textures: '[{"resourcePath":"minecraft:block/stone"},{"resourcePath":"bluemap:missing"}]',
        });

        const attempt = mergeShardMaps({
            shardMapDirectories: [a, b],
            outputDirectory: join(root, "merged"),
            lowresTileSize: TILE_SIZE,
            lodFactor: LOD_FACTOR,
            lodCount: LOD_COUNT,
        });

        await expect(attempt).rejects.toBeInstanceOf(MergeError);
        await expect(attempt).rejects.toThrow(/disagree about texture ordinals/);
        await expect(attempt).rejects.toThrow(/wrong textures/);
    });

    it("refuses to merge shards whose map settings differ", async () => {
        const a = await buildShard(join(root, "shard-0", "world"), {
            hires: [{ x: 0, z: 0 }],
            rendered: [{ cell: { x: 0, z: 0 }, pixels: [{ x: 1, z: 1 }] }],
        });
        const b = await buildShard(join(root, "shard-1", "world"), {
            hires: [{ x: 2, z: 0 }],
            rendered: [{ cell: { x: 0, z: 0 }, pixels: [{ x: 7, z: 1 }] }],
        });
        await writeFile(join(b, "settings.json"), JSON.stringify({ name: "somethingelse" }));

        await expect(
            mergeShardMaps({
                shardMapDirectories: [a, b],
                outputDirectory: join(root, "merged"),
                lowresTileSize: TILE_SIZE,
                lodFactor: LOD_FACTOR,
                lodCount: LOD_COUNT,
            }),
        ).rejects.toThrow(/disagree about the map settings/);
    });

    it("refuses to merge when two shards produced the same hires tile", async () => {
        const a = await buildShard(join(root, "shard-0", "world"), {
            hires: [{ x: 5, z: 0 }],
            rendered: [{ cell: { x: 0, z: 0 }, pixels: [{ x: 1, z: 1 }] }],
        });
        const b = await buildShard(join(root, "shard-1", "world"), {
            hires: [{ x: 5, z: 0 }],
            rendered: [{ cell: { x: 0, z: 0 }, pixels: [{ x: 7, z: 1 }] }],
        });

        await expect(
            mergeShardMaps({
                shardMapDirectories: [a, b],
                outputDirectory: join(root, "merged"),
                lowresTileSize: TILE_SIZE,
                lodFactor: LOD_FACTOR,
                lodCount: LOD_COUNT,
            }),
        ).rejects.toThrow(/did not land on hires tile boundaries/);
    });
});
