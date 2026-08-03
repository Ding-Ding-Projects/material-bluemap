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
import { PalettedPermutationsSource } from "./PalettedPermutationsSource.js";

const workDir = mkdtempSync(join(tmpdir(), "bluemap-atlas-paletted-"));
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

function makePng(pixels: [number, number, number, number][][]): PNG {
    const height = pixels.length;
    const width = (pixels[0] as [number, number, number, number][]).length;
    const image = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (width * y + x) << 2;
            const [r, g, b, a] = (pixels[y] as [number, number, number, number][])[x] as [
                number,
                number,
                number,
                number,
            ];
            image.data[i] = r;
            image.data[i + 1] = g;
            image.data[i + 2] = b;
            image.data[i + 3] = a;
        }
    }
    return image;
}

function pixel(image: PNG, x: number, y: number): [number, number, number, number] {
    const i = (image.width * y + x) << 2;
    return [
        image.data[i] as number,
        image.data[i + 1] as number,
        image.data[i + 2] as number,
        image.data[i + 3] as number,
    ];
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

const BASE = new Key("minecraft:block/base");
const PALETTE_KEY = new Key("minecraft:colormap/key");
const OXIDIZED = new Key("minecraft:colormap/oxidized");

function pool(entries: [Key, PNG, AnimationMeta | null][]): ResourcePool<Texture> {
    const textures = new ResourcePool<Texture>();
    for (const [key, image, animation] of entries)
        textures.put(key, Texture.from(key, image, animation));
    return textures;
}

describe("PalettedPermutationsSource#bake", () => {
    it("multiplies the source alpha with the palette alpha", async () => {
        // pixel 0 is in the key-palette, pixel 1 is not
        const base = makePng([
            [
                [10, 20, 30, 128],
                [99, 99, 99, 128],
            ],
        ]);
        const keyPalette = makePng([[[10, 20, 30, 255]]]);
        const oxidizedPalette = makePng([[[200, 100, 50, 64]]]);

        const textures = pool([
            [BASE, base, null],
            [PALETTE_KEY, keyPalette, null],
            [OXIDIZED, oxidizedPalette, null],
        ]);

        await new PalettedPermutationsSource(
            [BASE],
            "_",
            PALETTE_KEY,
            new Map([["oxidized", OXIDIZED]]),
        ).bake(textures, () => true);

        const result = textures
            .get(new Key("minecraft:block/base_oxidized"))
            ?.getTextureImage() as PNG;

        // 128/255 * 64/255 = 0.12599..., * 255 = 32.127... -> 32 (truncated)
        expect(pixel(result, 0, 0)).toEqual([200, 100, 50, 32]);
        // an unmapped colour keeps its own rgb, and its alpha is multiplied by the
        // forced-opaque lookup-result, i.e. left alone
        expect(pixel(result, 1, 0)).toEqual([99, 99, 99, 128]);
    });

    it("matches a palette-key entry regardless of the source pixel's alpha", async () => {
        const base = makePng([
            [
                [10, 20, 30, 255],
                [10, 20, 30, 51],
            ],
        ]);
        const textures = pool([
            [BASE, base, null],
            [PALETTE_KEY, makePng([[[10, 20, 30, 17]]]), null],
            [OXIDIZED, makePng([[[1, 2, 3, 255]]]), null],
        ]);

        await new PalettedPermutationsSource(
            [BASE],
            "_",
            PALETTE_KEY,
            new Map([["oxidized", OXIDIZED]]),
        ).bake(textures, () => true);

        const result = textures
            .get(new Key("minecraft:block/base_oxidized"))
            ?.getTextureImage() as PNG;

        // the key-palette's own alpha (17) is forced to 0xFF on both sides, so both
        // pixels map; the source alpha survives untouched because the palette is opaque
        expect(pixel(result, 0, 0)).toEqual([1, 2, 3, 255]);
        expect(pixel(result, 1, 0)).toEqual([1, 2, 3, 51]);
    });

    it("emits one sprite per permutation, named <resource><separator><suffix>", async () => {
        const textures = pool([
            [BASE, makePng([[[10, 20, 30, 255]]]), null],
            [PALETTE_KEY, makePng([[[10, 20, 30, 255]]]), null],
            [OXIDIZED, makePng([[[1, 1, 1, 255]]]), null],
            [new Key("minecraft:colormap/weathered"), makePng([[[2, 2, 2, 255]]]), null],
        ]);

        await new PalettedPermutationsSource(
            [BASE],
            "-",
            PALETTE_KEY,
            new Map([
                ["oxidized", OXIDIZED],
                ["weathered", new Key("minecraft:colormap/weathered")],
            ]),
        ).bake(textures, () => true);

        expect(textures.containsKey(new Key("minecraft:block/base-oxidized"))).toBe(true);
        expect(textures.containsKey(new Key("minecraft:block/base-weathered"))).toBe(true);
    });

    it("skips a sprite that is already pooled and one the filter rejects", async () => {
        const textures = pool([
            [BASE, makePng([[[10, 20, 30, 255]]]), null],
            [PALETTE_KEY, makePng([[[10, 20, 30, 255]]]), null],
            [OXIDIZED, makePng([[[1, 1, 1, 255]]]), null],
            [new Key("minecraft:colormap/weathered"), makePng([[[2, 2, 2, 255]]]), null],
        ]);
        const present = Texture.missing(new Key("minecraft:block/base_oxidized"));
        textures.put(new Key("minecraft:block/base_oxidized"), present);

        await new PalettedPermutationsSource(
            [BASE],
            "_",
            PALETTE_KEY,
            new Map([
                ["oxidized", OXIDIZED],
                ["weathered", new Key("minecraft:colormap/weathered")],
            ]),
        ).bake(textures, (key) => !key.getValue().endsWith("weathered"));

        expect(textures.get(new Key("minecraft:block/base_oxidized"))).toBe(present);
        expect(textures.containsKey(new Key("minecraft:block/base_weathered"))).toBe(false);
    });

    it("logs and skips a permutation palette smaller than the key palette", async () => {
        const textures = pool([
            [BASE, makePng([[[10, 20, 30, 255]]]), null],
            [
                PALETTE_KEY,
                makePng([
                    [
                        [10, 20, 30, 255],
                        [40, 50, 60, 255],
                    ],
                ]),
                null,
            ],
            [OXIDIZED, makePng([[[1, 1, 1, 255]]]), null],
        ]);

        await new PalettedPermutationsSource(
            [BASE],
            "_",
            PALETTE_KEY,
            new Map([["oxidized", OXIDIZED]]),
        ).bake(textures, () => true);

        expect(textures.containsKey(new Key("minecraft:block/base_oxidized"))).toBe(false);
        expect(debugMessages()).toEqual([
            "Failed to load paletted_permutation: Permutation palette minecraft:colormap/oxidized" +
                " does not match key palette minecraft:colormap/key.",
        ]);
    });

    it("keeps the base texture's animation", async () => {
        const animation = new AnimationMeta(false, 1, 1, 5, null);
        const textures = pool([
            [BASE, makePng([[[10, 20, 30, 255]]]), animation],
            [PALETTE_KEY, makePng([[[10, 20, 30, 255]]]), null],
            [OXIDIZED, makePng([[[1, 1, 1, 255]]]), null],
        ]);

        await new PalettedPermutationsSource(
            [BASE],
            "_",
            PALETTE_KEY,
            new Map([["oxidized", OXIDIZED]]),
        ).bake(textures, () => true);

        expect(
            textures.get(new Key("minecraft:block/base_oxidized"))?.getAnimation(),
        ).toBe(animation);
    });

    it("does nothing when a required member is missing or the key palette was not loaded", async () => {
        const empty = new ResourcePool<Texture>();
        await new PalettedPermutationsSource().bake(empty, () => true);
        expect(empty.keySet()).toEqual([]);

        await new PalettedPermutationsSource([BASE], "_", PALETTE_KEY, new Map()).bake(
            empty,
            () => true,
        );
        expect(empty.keySet()).toEqual([]);

        // permutations present, but nothing loaded
        await new PalettedPermutationsSource(
            [BASE],
            "_",
            PALETTE_KEY,
            new Map([["oxidized", OXIDIZED]]),
        ).bake(empty, () => true);
        expect(empty.keySet()).toEqual([]);
    });
});

describe("PalettedPermutationsSource#load", () => {
    it("loads the textures, the palette key and every permutation palette", async () => {
        const png = PNG.sync.write(makePng([[[1, 2, 3, 255]]]));
        const root = tree({
            "assets/minecraft/textures/block/base.png": png,
            "assets/minecraft/textures/colormap/key.png": png,
            "assets/minecraft/textures/colormap/oxidized.png": png,
        });
        const textures = new ResourcePool<Texture>();

        await new PalettedPermutationsSource(
            [BASE],
            "_",
            PALETTE_KEY,
            new Map([["oxidized", OXIDIZED]]),
        ).load(root, textures, () => true);

        expect(textures.keySet().map((key) => key.getFormatted()).sort()).toEqual([
            "minecraft:block/base",
            "minecraft:colormap/key",
            "minecraft:colormap/oxidized",
        ]);
    });

    it("ignores the texture-filter (upstream loads the palettes unconditionally)", async () => {
        const png = PNG.sync.write(makePng([[[1, 2, 3, 255]]]));
        const root = tree({
            "assets/minecraft/textures/block/base.png": png,
            "assets/minecraft/textures/colormap/key.png": png,
            "assets/minecraft/textures/colormap/oxidized.png": png,
        });
        const textures = new ResourcePool<Texture>();

        await new PalettedPermutationsSource(
            [BASE],
            "_",
            PALETTE_KEY,
            new Map([["oxidized", OXIDIZED]]),
        ).load(root, textures, () => false);

        expect(textures.keySet()).toHaveLength(3);
    });

    it("does nothing without permutations", async () => {
        const textures = new ResourcePool<Texture>();
        await new PalettedPermutationsSource([BASE], "_", PALETTE_KEY, new Map()).load(
            tree({}),
            textures,
            () => true,
        );
        expect(textures.keySet()).toEqual([]);
    });
});

describe("PalettedPermutationsSource.Adapter", () => {
    it("reads textures, separator, palette_key and permutations", () => {
        const source = PalettedPermutationsSource.Adapter.read(
            parse(`{
                "type": "minecraft:paletted_permutations",
                "textures": ["minecraft:block/base", "minecraft:block/other"],
                "separator": "-",
                "palette_key": "minecraft:colormap/key",
                "permutations": {
                    "oxidized": "minecraft:colormap/oxidized",
                    "weathered": "minecraft:colormap/weathered"
                }
            }`),
        );

        expect(source.getType()?.getFormatted()).toBe("minecraft:paletted_permutations");
        expect(source.getTextures()?.map((key) => key.getFormatted())).toEqual([
            "minecraft:block/base",
            "minecraft:block/other",
        ]);
        expect(source.getSeparator()).toBe("-");
        expect(source.getPaletteKey()?.getFormatted()).toBe("minecraft:colormap/key");
        expect([...(source.getPermutations() ?? new Map())].map(([suffix, key]) => [suffix, key.getFormatted()])).toEqual([
            ["oxidized", "minecraft:colormap/oxidized"],
            ["weathered", "minecraft:colormap/weathered"],
        ]);
    });

    it("defaults the separator to '_'", () => {
        expect(
            PalettedPermutationsSource.Adapter.read(
                parse('{"type": "minecraft:paletted_permutations"}'),
            ).getSeparator(),
        ).toBe("_");
    });

    it("de-duplicates the texture list, keeping the order", () => {
        const source = PalettedPermutationsSource.Adapter.read(
            parse(
                '{"textures": ["minecraft:a", "minecraft:b", "minecraft:a"], "type": "minecraft:paletted_permutations"}',
            ),
        );
        expect(source.getTextures()?.map((key) => key.getFormatted())).toEqual([
            "minecraft:a",
            "minecraft:b",
        ]);
    });
});
