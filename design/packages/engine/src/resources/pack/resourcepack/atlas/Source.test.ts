import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Key } from "@material-bluemap/shared";
import { PNG } from "pngjs";
import { afterAll, describe, expect, it } from "vitest";
import { parse } from "../../../adapter/JsonMapper.js";
import { ResourcePool } from "../../ResourcePool.js";
import { DirFileSystem } from "../../vfs/DirFileSystem.js";
import type { PackPath } from "../../vfs/PackFileSystem.js";
import type { Texture } from "../texture/Texture.js";
import { Source } from "./Source.js";

const workDir = mkdtempSync(join(tmpdir(), "bluemap-atlas-source-"));
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

function makePng(
    width: number,
    height: number,
    pixel: (x: number, y: number) => [number, number, number, number],
): PNG {
    const image = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (width * y + x) << 2;
            const [r, g, b, a] = pixel(x, y);
            image.data[i] = r;
            image.data[i + 1] = g;
            image.data[i + 2] = b;
            image.data[i + 3] = a;
        }
    }
    return image;
}

function pngBytes(image: PNG): Buffer {
    return PNG.sync.write(image);
}

/** exposes the protected helpers upstream's subclasses call */
class TestSource extends Source {
    file(root: PackPath, key: Key): PackPath {
        return this.getFile(root, key);
    }

    texture(key: Key, file: PackPath): Promise<Texture | null> {
        return this.loadTexture(key, file);
    }

    image(file: PackPath): Promise<PNG | null> {
        return this.loadImage(file);
    }
}

describe("Source", () => {
    describe("load / bake", () => {
        it("are no-ops on the bare source", async () => {
            const source = new Source();
            const textures = new ResourcePool<Texture>();

            await source.load(tree({}), textures, () => true);
            await source.bake(textures, () => true);

            expect(textures.keySet()).toEqual([]);
        });
    });

    describe("getFile", () => {
        it("resolves assets/<namespace>/textures/<value>.png", () => {
            const root = tree({});
            const file = new TestSource().file(root, new Key("mymod", "block/foo/bar"));
            expect(file.path).toBe("assets/mymod/textures/block/foo/bar.png");
        });
    });

    describe("loadTexture", () => {
        it("reads the png", async () => {
            const image = makePng(2, 1, (x) => [x === 0 ? 255 : 0, 0, x === 0 ? 0 : 255, 255]);
            const root = tree({ "assets/minecraft/textures/block/x.png": pngBytes(image) });

            const texture = await new TestSource().texture(
                new Key("minecraft:block/x"),
                root.resolve("assets/minecraft/textures/block/x.png"),
            );

            expect(texture).not.toBeNull();
            expect(texture?.getKey().getFormatted()).toBe("minecraft:block/x");
            expect(texture?.getTextureImage().width).toBe(2);
            expect(texture?.getAnimation()).toBeNull();
        });

        it("reads the sibling <name>.png.mcmeta animation", async () => {
            const root = tree({
                "assets/minecraft/textures/block/fire.png": pngBytes(
                    makePng(1, 2, () => [0, 0, 0, 255]),
                ),
                "assets/minecraft/textures/block/fire.png.mcmeta": JSON.stringify({
                    animation: { frametime: 4, interpolate: true },
                }),
            });

            const texture = await new TestSource().texture(
                new Key("minecraft:block/fire"),
                root.resolve("assets/minecraft/textures/block/fire.png"),
            );

            expect(texture?.getAnimation()?.getFrametime()).toBe(4);
            expect(texture?.getAnimation()?.isInterpolate()).toBe(true);
        });

        it("returns null for a missing file", async () => {
            const root = tree({});
            expect(
                await new TestSource().texture(
                    new Key("minecraft:block/nope"),
                    root.resolve("assets/minecraft/textures/block/nope.png"),
                ),
            ).toBeNull();
            expect(
                await new TestSource().image(
                    root.resolve("assets/minecraft/textures/block/nope.png"),
                ),
            ).toBeNull();
        });
    });

    describe("DelegateAdapter", () => {
        it("reads the type", () => {
            const source = Source.DelegateAdapter.read(parse('{"type": "minecraft:filter"}'));
            expect(source.getType()?.getFormatted()).toBe("minecraft:filter");
        });

        it("defaults an absent type to null and ignores unknown members", () => {
            const source = Source.DelegateAdapter.read(parse('{"pattern": {"namespace": "x"}}'));
            expect(source.getType()).toBeNull();
        });

        it("applies the minecraft default-namespace of a bare type-value", () => {
            expect(Source.DelegateAdapter.read(parse('{"type": "single"}')).getType()?.getFormatted()).toBe(
                "minecraft:single",
            );
        });
    });

    describe("equalityKey", () => {
        it("makes two bare sources of the same type equal", () => {
            const a = Source.DelegateAdapter.read(parse('{"type": "minecraft:filter"}'));
            const b = Source.DelegateAdapter.read(parse('{"type": "minecraft:filter"}'));
            expect(a.equalityKey()).toBe(b.equalityKey());
        });

        it("keeps bare sources of different types apart", () => {
            const a = Source.DelegateAdapter.read(parse('{"type": "minecraft:filter"}'));
            const b = Source.DelegateAdapter.read(parse('{"type": "minecraft:nope"}'));
            expect(a.equalityKey()).not.toBe(b.equalityKey());
        });

        it("handles a type-less source", () => {
            expect(new Source().equalityKey()).toBe(new Source().equalityKey());
        });
    });
});
