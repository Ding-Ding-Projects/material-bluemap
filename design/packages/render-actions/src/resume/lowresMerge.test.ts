import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exists } from "../merge/files.js";
import { gridCellPath } from "../merge/gridPath.js";
import { LowresTile } from "../merge/lowresTile.js";
import { MergeError } from "../merge/mergeMap.js";
import { mergeLowresLayers } from "./lowresMerge.js";

const TILE_SIZE = 10;
const LOD_FACTOR = 5;
const LOD_COUNT = 3;

const SETTINGS = JSON.stringify({
    name: "world",
    hires: { tileSize: [32, 32], scale: [1, 1], translate: [2, 2] },
    lowres: { tileSize: [TILE_SIZE, TILE_SIZE], lodFactor: LOD_FACTOR, lodCount: LOD_COUNT },
});

const TEXTURES = '[{"resourcePath":"bluemap:missing"},{"resourcePath":"minecraft:block/stone"}]';

let root = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-lowres-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

async function write(path: string, contents: Buffer | string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
}

interface PartialSpec {
    /** lod-1 pixels this group rendered, in the single shared tile cell 0,0 */
    readonly rendered: readonly { readonly x: number; readonly z: number }[];
    /** lod-1 pixels this group erased, because another group owns those columns */
    readonly erased?: readonly { readonly x: number; readonly z: number }[];
    readonly textures?: string;
    /** how many hires tiles the group merge left behind, to prove they are not read */
    readonly hiresTiles?: number;
}

/** A merge-group partial: a map directory holding one group's share of the map. */
async function buildPartial(name: string, spec: PartialSpec): Promise<string> {
    const directory = join(root, name, "world");
    await write(join(directory, "settings.json"), SETTINGS);
    await write(join(directory, "textures.json.gz"), gzipSync(spec.textures ?? TEXTURES));

    for (let index = 0; index < (spec.hiresTiles ?? 0); index++)
        await write(
            join(directory, "tiles", "0", gridCellPath({ x: index, z: 0 }, ".prbm.gz")),
            gzipSync(Buffer.alloc(32)),
        );

    const tile = LowresTile.blank(TILE_SIZE);
    for (const pixel of spec.rendered)
        tile.set(pixel.x, pixel.z, { r: 20 + pixel.x, g: 40 + pixel.z, b: 60, a: 255 }, 64, 0);
    for (const pixel of spec.erased ?? [])
        tile.set(pixel.x, pixel.z, { r: 0, g: 0, b: 0, a: 0 }, 0, 0);
    await write(join(directory, "tiles", "1", gridCellPath({ x: 0, z: 0 }, ".png")), tile.encode());

    // The wrong lod 2 a partial really carries: averaged over pixels no shard in that
    // group rendered, and indistinguishable from a correct one by inspection.
    const wrong = LowresTile.blank(TILE_SIZE);
    wrong.set(0, 0, { r: 255, g: 0, b: 255, a: 255 }, 999, 15);
    await write(
        join(directory, "tiles", "2", gridCellPath({ x: 0, z: 0 }, ".png")),
        wrong.encode(),
    );

    return directory;
}

describe("merging only the lowres layers", () => {
    it("composites lod 1 across groups and rebuilds the coarse lods", async () => {
        const left = await buildPartial("group-0", {
            rendered: [
                { x: 1, z: 1 },
                { x: 2, z: 1 },
            ],
            erased: [{ x: 6, z: 1 }],
            hiresTiles: 3,
        });
        const right = await buildPartial("group-1", {
            rendered: [{ x: 6, z: 1 }],
            erased: [
                { x: 1, z: 1 },
                { x: 2, z: 1 },
            ],
            hiresTiles: 2,
        });

        const output = join(root, "merged", "world");
        const report = await mergeLowresLayers({
            partialMapDirectories: [left, right],
            outputDirectory: output,
            lowresTileSize: TILE_SIZE,
            lodFactor: LOD_FACTOR,
            lodCount: LOD_COUNT,
        });

        expect(report.partialCount).toBe(2);
        expect(report.lod1Tiles).toBe(1);
        expect(report.lod1TilesComposited).toBe(1);
        expect(report.conflictingPixels).toBe(0);
        // Three pixels where one group's erasure lost to the other's terrain.
        expect(report.overruledErasures).toBe(3);
        expect(report.rebuiltLods.map((entry) => entry.lod)).toEqual([2, 3]);
    });

    it("never opens the hires tiles, which is the whole point of the split", async () => {
        const left = await buildPartial("group-0", { rendered: [{ x: 1, z: 1 }], hiresTiles: 4 });
        const right = await buildPartial("group-1", { rendered: [{ x: 6, z: 1 }], hiresTiles: 4 });

        const output = join(root, "merged", "world");
        await mergeLowresLayers({
            partialMapDirectories: [left, right],
            outputDirectory: output,
            lowresTileSize: TILE_SIZE,
            lodFactor: LOD_FACTOR,
            lodCount: LOD_COUNT,
        });

        // The merged lowres output carries no hires layer at all. Each group's hires
        // output is already final and ships as its own artifact.
        expect(await exists(join(output, "tiles", "0"))).toBe(false);
        expect(await exists(join(output, "tiles", "1"))).toBe(true);
        expect(await exists(join(output, "settings.json"))).toBe(true);
        expect(await exists(join(output, "textures.json.gz"))).toBe(true);
    });

    it("discards the partials' lod 2 rather than carrying it through", async () => {
        const left = await buildPartial("group-0", { rendered: [{ x: 1, z: 1 }] });
        const right = await buildPartial("group-1", { rendered: [{ x: 6, z: 1 }] });

        const output = join(root, "merged", "world");
        await mergeLowresLayers({
            partialMapDirectories: [left, right],
            outputDirectory: output,
            lowresTileSize: TILE_SIZE,
            lodFactor: LOD_FACTOR,
            lodCount: LOD_COUNT,
        });

        // The partials' lod 2 held a magenta pixel at height 999 that no correct rebuild
        // could produce. If it survived, the merge carried a wrong tile through.
        const { readFile } = await import("node:fs/promises");
        const rebuilt = LowresTile.decode(
            await readFile(join(output, "tiles", "2", gridCellPath({ x: 0, z: 0 }, ".png"))),
            TILE_SIZE,
        );
        const colour = rebuilt.readColorInto(0, 0, { r: 0, g: 0, b: 0, a: 0 });
        expect(colour).not.toEqual({ r: 255, g: 0, b: 255, a: 255 });
        expect(rebuilt.getHeight(0, 0)).not.toBe(999);
    });

    it("writes no render state, leaving the rstate decision exactly as it was", async () => {
        const left = await buildPartial("group-0", { rendered: [{ x: 1, z: 1 }] });
        const output = join(root, "merged", "world");
        const report = await mergeLowresLayers({
            partialMapDirectories: [left],
            outputDirectory: output,
            lowresTileSize: TILE_SIZE,
            lodFactor: LOD_FACTOR,
            lodCount: LOD_COUNT,
        });

        expect(await exists(join(output, "rstate"))).toBe(false);
        expect(report.notes.join(" ")).toContain("No render state was read or written");
    });

    it("refuses to merge groups whose texture ordinals disagree", async () => {
        const left = await buildPartial("group-0", { rendered: [{ x: 1, z: 1 }] });
        const right = await buildPartial("group-1", {
            rendered: [{ x: 6, z: 1 }],
            textures:
                '[{"resourcePath":"bluemap:missing"},{"resourcePath":"minecraft:block/dirt"}]',
        });

        await expect(
            mergeLowresLayers({
                partialMapDirectories: [left, right],
                outputDirectory: join(root, "merged", "world"),
                lowresTileSize: TILE_SIZE,
                lodFactor: LOD_FACTOR,
                lodCount: LOD_COUNT,
            }),
        ).rejects.toBeInstanceOf(MergeError);
    });

    it("refuses when a merge group produced nothing", async () => {
        await expect(
            mergeLowresLayers({
                partialMapDirectories: [join(root, "group-9", "world")],
                outputDirectory: join(root, "merged", "world"),
                lowresTileSize: TILE_SIZE,
            }),
        ).rejects.toBeInstanceOf(MergeError);
    });
});
