/**
 * Test-support only — not part of the upstream port.
 *
 * A tiny, real, self-authored vanilla-shaped resource pack: one modelled block
 * (`minecraft:bedrock`, chosen because `packages/worldgen`'s `TerrainGenerator` writes it
 * at the world floor unconditionally, for every seed — see `packages/server`'s
 * `render-driver.test.ts` for the same reasoning) plus the real parent-model chain a
 * vanilla pack uses (`block` -> `cube_all` -> `bedrock`). Every byte is authored here, at
 * test time, the same way `packages/engine`'s own `test/fixtures/vanillaShapedPack.ts`
 * builds its fixture — nothing here came from Mojang or a real BlueMap
 * `resourceExtensions.zip` (see the licensing note in `packages/engine/README.md`).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";

async function write(dir: string, relativePath: string, data: string | Buffer): Promise<void> {
    const full = join(dir, ...relativePath.split("/"));
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
}

function solidPng(width: number, height: number, [r, g, b, a]: [number, number, number, number]): Buffer {
    const png = new PNG({ width, height });
    for (let i = 0; i < width * height; i++) {
        png.data[i * 4] = r;
        png.data[i * 4 + 1] = g;
        png.data[i * 4 + 2] = b;
        png.data[i * 4 + 3] = a;
    }
    return PNG.sync.write(png);
}

/** Writes the fixture pack (including a `version.json` `resolveResources` can read) into `dir`. */
export async function writeFixtureResourcePack(dir: string): Promise<void> {
    await write(
        dir,
        "version.json",
        JSON.stringify({ pack_version: { resource_major: 34, resource_minor: 0, data_major: 48, data_minor: 0 } }),
    );
    await write(dir, "pack.mcmeta", JSON.stringify({ pack: { pack_format: 34, description: "cli test fixture" } }));
    await write(
        dir,
        "assets/minecraft/atlases/blocks.json",
        JSON.stringify({ sources: [{ type: "minecraft:directory", source: "block", prefix: "block/" }] }),
    );
    await write(dir, "assets/minecraft/blockstates/bedrock.json", JSON.stringify({ variants: { "": { model: "minecraft:block/bedrock" } } }));
    await write(dir, "assets/minecraft/models/block/block.json", JSON.stringify({ ambientocclusion: false }));
    await write(
        dir,
        "assets/minecraft/models/block/cube_all.json",
        JSON.stringify({
            parent: "minecraft:block/block",
            textures: { particle: "#all" },
            elements: [
                {
                    from: [0, 0, 0],
                    to: [16, 16, 16],
                    faces: {
                        down: { texture: "#all", cullface: "down" },
                        up: { texture: "#all", cullface: "up" },
                        north: { texture: "#all", cullface: "north" },
                        south: { texture: "#all", cullface: "south" },
                        west: { texture: "#all", cullface: "west" },
                        east: { texture: "#all", cullface: "east" },
                    },
                },
            ],
        }),
    );
    await write(dir, "assets/minecraft/models/block/bedrock.json", JSON.stringify({ parent: "minecraft:block/cube_all", textures: { all: "minecraft:block/bedrock" } }));
    await write(dir, "assets/minecraft/textures/block/bedrock.png", solidPng(16, 16, [60, 60, 60, 255]));
}
