import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Key } from "@material-bluemap/shared";
import { PNG } from "pngjs";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "../../../adapter/JsonMapper.js";
import { ResourcePool } from "../../ResourcePool.js";
import { DirFileSystem } from "../../vfs/DirFileSystem.js";
import type { PackPath } from "../../vfs/PackFileSystem.js";
import { AnimationMeta } from "../texture/AnimationMeta.js";
import { Texture } from "../texture/Texture.js";
import { Region, UnstitchSource } from "./UnstitchSource.js";

const workDir = mkdtempSync(join(tmpdir(), "bluemap-atlas-unstitch-"));
let caseCount = 0;

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

function tree(files: Record<string, string | Buffer>): PackPath {
    const root = join(workDir, "case-" + caseCount++);
    mkdirSync(root, { recursive: true });
    for (const [relative, content] of Object.entries(files)) {
        const file = join(root, ...relative.split("/"));
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content);
    }
    return new DirFileSystem(root).getRoot();
}

/** every pixel encodes its own coordinates: (x, y) -> [x * 10, y * 10, 0, 255] */
function coordinateSheet(width: number, height: number): PNG {
    const image = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (width * y + x) << 2;
            image.data[i] = x * 10;
            image.data[i + 1] = y * 10;
            image.data[i + 2] = 0;
            image.data[i + 3] = 255;
        }
    }
    return image;
}

function pixel(image: PNG, x: number, y: number): [number, number, number, number] {
    const i = (image.width * y + x) << 2;
    return [image.data[i] as number, image.data[i + 1] as number, image.data[i + 2] as number, image.data[i + 3] as number];
}

let debugSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
});

afterEach(() => {
    debugSpy.mockRestore();
});

function debugMessages(): string[] {
    return debugSpy.mock.calls.map((call) => String(call[0]));
}

const SHEET = new Key("minecraft:block/sheet");

/** a pool holding just the sheet, as UnstitchSource#load would have left it */
function poolWith(sheet: PNG, animation: AnimationMeta | null = null): ResourcePool<Texture> {
    const textures = new ResourcePool<Texture>();
    textures.put(SHEET, Texture.from(SHEET, sheet, animation));
    return textures;
}

describe("UnstitchSource#load", () => {
    it("pulls the sheet into the pool", async () => {
        const root = tree({
            "assets/minecraft/textures/block/sheet.png": PNG.sync.write(coordinateSheet(4, 4)),
        });
        const textures = new ResourcePool<Texture>();

        await new UnstitchSource(SHEET, 0, 0, [
            new Region(new Key("minecraft:block/a"), 0, 0, 1, 1),
        ]).load(root, textures, () => true);

        expect(textures.keySet().map((key) => key.getFormatted())).toEqual([
            "minecraft:block/sheet",
        ]);
    });

    it("does nothing without a resource or without regions", async () => {
        const root = tree({
            "assets/minecraft/textures/block/sheet.png": PNG.sync.write(coordinateSheet(4, 4)),
        });

        const noResource = new ResourcePool<Texture>();
        await new UnstitchSource().load(root, noResource, () => true);
        expect(noResource.keySet()).toEqual([]);

        const noRegions = new ResourcePool<Texture>();
        await new UnstitchSource(SHEET, 0, 0, []).load(root, noRegions, () => true);
        expect(noRegions.keySet()).toEqual([]);
    });
});

describe("UnstitchSource#bake", () => {
    it("defaults a non-positive divisor to the image dimensions", async () => {
        const textures = poolWith(coordinateSheet(8, 4));
        const source = new UnstitchSource(SHEET, 0, -1, [
            new Region(new Key("minecraft:block/a"), 2, 1, 3, 2),
        ]);

        await source.bake(textures, () => true);

        expect(source.getDivisorX()).toBe(8);
        expect(source.getDivisorY()).toBe(4);

        const region = textures.get(new Key("minecraft:block/a"))?.getTextureImage() as PNG;
        expect([region.width, region.height]).toEqual([3, 2]);
        expect(pixel(region, 0, 0)).toEqual([20, 10, 0, 255]);
        expect(pixel(region, 2, 1)).toEqual([40, 20, 0, 255]);
    });

    it("truncates the scaled region-bounds instead of rounding them", async () => {
        // 10 / 4 = 2.5, so a region at (1,1) sized 1x1 starts at (2,2) and is 2x2 —
        // rounding would have started it at (3,3) and made it 3x3
        const textures = poolWith(coordinateSheet(10, 10));
        const source = new UnstitchSource(SHEET, 4, 4, [
            new Region(new Key("minecraft:block/a"), 1, 1, 1, 1),
        ]);

        await source.bake(textures, () => true);

        const region = textures.get(new Key("minecraft:block/a"))?.getTextureImage() as PNG;
        expect([region.width, region.height]).toEqual([2, 2]);
        expect(pixel(region, 0, 0)).toEqual([20, 20, 0, 255]);
        expect(pixel(region, 1, 1)).toEqual([30, 30, 0, 255]);
    });

    it("logs and skips a region that reaches out of the image", async () => {
        const textures = poolWith(coordinateSheet(10, 10));
        const source = new UnstitchSource(SHEET, 4, 4, [
            // x = 7, width = 5 -> 12 > 10
            new Region(new Key("minecraft:block/out"), 3, 0, 2, 1),
            new Region(new Key("minecraft:block/in"), 0, 0, 1, 1),
        ]);

        await source.bake(textures, () => true);

        expect(textures.containsKey(new Key("minecraft:block/out"))).toBe(false);
        expect(textures.containsKey(new Key("minecraft:block/in"))).toBe(true);
        expect(debugMessages()).toHaveLength(1);
        expect(debugMessages()[0]).toContain(
            "Failed to unstitch minecraft:block/sheet into minecraft:block/out",
        );
        expect(debugMessages()[0]).toContain("out of image-bounds");
    });

    it("logs and skips a region of zero size", async () => {
        const textures = poolWith(coordinateSheet(8, 8));
        await new UnstitchSource(SHEET, 8, 8, [
            new Region(new Key("minecraft:block/empty"), 0, 0, 0, 1),
        ]).bake(textures, () => true);

        expect(textures.containsKey(new Key("minecraft:block/empty"))).toBe(false);
        expect(debugMessages()).toHaveLength(1);
    });

    it("gives every region the sheet's animation", async () => {
        const animation = new AnimationMeta(true, 1, 1, 7, null);
        const textures = poolWith(coordinateSheet(4, 4), animation);

        await new UnstitchSource(SHEET, 0, 0, [
            new Region(new Key("minecraft:block/a"), 0, 0, 2, 2),
            new Region(new Key("minecraft:block/b"), 2, 2, 2, 2),
        ]).bake(textures, () => true);

        expect(textures.get(new Key("minecraft:block/a"))?.getAnimation()).toBe(animation);
        expect(textures.get(new Key("minecraft:block/b"))?.getAnimation()).toBe(animation);
    });

    it("skips a sprite that is already pooled and one the filter rejects", async () => {
        const textures = poolWith(coordinateSheet(4, 4));
        const present = Texture.missing(new Key("minecraft:block/a"));
        textures.put(new Key("minecraft:block/a"), present);

        await new UnstitchSource(SHEET, 0, 0, [
            new Region(new Key("minecraft:block/a"), 0, 0, 2, 2),
            new Region(new Key("minecraft:block/b"), 2, 2, 2, 2),
        ]).bake(textures, (key) => key.getValue() !== "block/b");

        expect(textures.get(new Key("minecraft:block/a"))).toBe(present);
        expect(textures.containsKey(new Key("minecraft:block/b"))).toBe(false);
    });

    it("does nothing when the sheet was never loaded", async () => {
        const textures = new ResourcePool<Texture>();
        await new UnstitchSource(SHEET, 0, 0, [
            new Region(new Key("minecraft:block/a"), 0, 0, 1, 1),
        ]).bake(textures, () => true);
        expect(textures.keySet()).toEqual([]);
    });
});

describe("UnstitchSource.Adapter", () => {
    it("reads the snake_case divisors and the regions", () => {
        const source = UnstitchSource.Adapter.read(
            parse(`{
                "type": "minecraft:unstitch",
                "resource": "minecraft:block/sheet",
                "divisor_x": 16,
                "divisor_y": 8,
                "regions": [
                    {"sprite": "minecraft:block/a", "x": 0, "y": 0, "width": 2, "height": 3}
                ]
            }`),
        );

        expect(source.getType()?.getFormatted()).toBe("minecraft:unstitch");
        expect(source.getResource()?.getFormatted()).toBe("minecraft:block/sheet");
        expect(source.getDivisorX()).toBe(16);
        expect(source.getDivisorY()).toBe(8);

        const region = source.getRegions()?.[0] as Region;
        expect(region.getSprite()?.getFormatted()).toBe("minecraft:block/a");
        expect([region.getX(), region.getY(), region.getWidth(), region.getHeight()]).toEqual([
            0, 0, 2, 3,
        ]);
    });

    it("defaults the divisors to 0 and the regions to null", () => {
        const source = UnstitchSource.Adapter.read(
            parse('{"type": "minecraft:unstitch", "resource": "minecraft:block/sheet"}'),
        );
        expect(source.getDivisorX()).toBe(0);
        expect(source.getDivisorY()).toBe(0);
        expect(source.getRegions()).toBeNull();
    });

    it("de-duplicates structurally equal regions, keeping the first", () => {
        const source = UnstitchSource.Adapter.read(
            parse(`{
                "type": "minecraft:unstitch",
                "resource": "minecraft:block/sheet",
                "regions": [
                    {"sprite": "minecraft:block/a", "x": 0, "y": 0, "width": 1, "height": 1},
                    {"sprite": "minecraft:block/a", "x": 0, "y": 0, "width": 1, "height": 1},
                    {"sprite": "minecraft:block/a", "x": 1, "y": 0, "width": 1, "height": 1}
                ]
            }`),
        );

        expect(source.getRegions()).toHaveLength(2);
        expect(source.getRegions()?.map((region) => region.getX())).toEqual([0, 1]);
    });
});
