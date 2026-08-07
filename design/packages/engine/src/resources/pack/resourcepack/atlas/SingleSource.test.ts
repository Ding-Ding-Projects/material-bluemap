import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Key } from "@worldlens/shared";
import { PNG } from "pngjs";
import { afterAll, describe, expect, it } from "vitest";
import { parse } from "../../../adapter/JsonMapper.js";
import { ResourcePool } from "../../ResourcePool.js";
import { DirFileSystem } from "../../vfs/DirFileSystem.js";
import type { PackPath } from "../../vfs/PackFileSystem.js";
import { ZipFileSystem } from "../../vfs/ZipFileSystem.js";
import { buildZip } from "../../vfs/zipTestUtil.js";
import { Texture } from "../texture/Texture.js";
import { SingleSource } from "./SingleSource.js";

const workDir = mkdtempSync(join(tmpdir(), "bluemap-atlas-single-"));
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
): Buffer {
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
    return PNG.sync.write(image);
}

const STONE = makePng(2, 2, () => [128, 128, 128, 255]);

describe("SingleSource#load", () => {
    it("loads the resource under its own key", async () => {
        const root = tree({ "assets/minecraft/textures/block/stone.png": STONE });
        const textures = new ResourcePool<Texture>();

        await new SingleSource(new Key("minecraft:block/stone")).load(root, textures, () => true);

        expect(textures.keySet().map((key) => key.getFormatted())).toEqual([
            "minecraft:block/stone",
        ]);
        expect(textures.get(new Key("minecraft:block/stone"))?.getTextureImage().width).toBe(2);
    });

    it("loads the resource under the sprite key when one is given", async () => {
        const root = tree({ "assets/minecraft/textures/block/stone.png": STONE });
        const textures = new ResourcePool<Texture>();

        await new SingleSource(new Key("minecraft:block/stone"), new Key("mymod:rock")).load(
            root,
            textures,
            () => true,
        );

        expect(textures.keySet().map((key) => key.getFormatted())).toEqual(["mymod:rock"]);
        expect(textures.get(new Key("mymod:rock"))?.getKey().getFormatted()).toBe("mymod:rock");
    });

    it("does nothing without a resource", async () => {
        const textures = new ResourcePool<Texture>();
        await new SingleSource().load(tree({}), textures, () => true);
        expect(textures.keySet()).toEqual([]);
    });

    it("skips a sprite that is already pooled", async () => {
        const root = tree({ "assets/minecraft/textures/block/stone.png": STONE });
        const textures = new ResourcePool<Texture>();
        const present = Texture.missing(new Key("minecraft:block/stone"));
        textures.put(new Key("minecraft:block/stone"), present);

        await new SingleSource(new Key("minecraft:block/stone")).load(root, textures, () => true);

        expect(textures.get(new Key("minecraft:block/stone"))).toBe(present);
    });

    it("skips a sprite the texture-filter rejects", async () => {
        const root = tree({ "assets/minecraft/textures/block/stone.png": STONE });
        const textures = new ResourcePool<Texture>();

        await new SingleSource(new Key("minecraft:block/stone")).load(root, textures, () => false);

        expect(textures.keySet()).toEqual([]);
    });

    it("filters on the sprite, not on the resource", async () => {
        const root = tree({ "assets/minecraft/textures/block/stone.png": STONE });
        const textures = new ResourcePool<Texture>();
        const seen: string[] = [];

        await new SingleSource(new Key("minecraft:block/stone"), new Key("mymod:rock")).load(
            root,
            textures,
            (key) => {
                seen.push(key.getFormatted());
                return true;
            },
        );

        expect(seen).toEqual(["mymod:rock"]);
    });

    it("returns silently when the file is absent", async () => {
        const textures = new ResourcePool<Texture>();
        await new SingleSource(new Key("minecraft:block/nope")).load(tree({}), textures, () => true);
        expect(textures.keySet()).toEqual([]);
    });

    it("picks up the sibling animation-meta", async () => {
        const root = tree({
            "assets/minecraft/textures/block/fire.png": STONE,
            "assets/minecraft/textures/block/fire.png.mcmeta": JSON.stringify({
                animation: { frametime: 3 },
            }),
        });
        const textures = new ResourcePool<Texture>();

        await new SingleSource(new Key("minecraft:block/fire")).load(root, textures, () => true);

        expect(
            textures.get(new Key("minecraft:block/fire"))?.getAnimation()?.getFrametime(),
        ).toBe(3);
    });

    it("reads out of a zip file-system too", async () => {
        const zip = await ZipFileSystem.fromBuffer(
            buildZip([
                { name: "assets/", data: "" },
                { name: "assets/minecraft/textures/block/stone.png", data: STONE, deflate: true },
            ]),
            "pack.zip",
        );
        try {
            const textures = new ResourcePool<Texture>();
            const root = zip.getRootDirectories()[0] as PackPath;

            await new SingleSource(new Key("minecraft:block/stone")).load(
                root,
                textures,
                () => true,
            );

            expect(textures.get(new Key("minecraft:block/stone"))?.getTextureImage().width).toBe(2);
        } finally {
            await zip.close();
        }
    });
});

describe("SingleSource#getSprite", () => {
    it("falls back to the resource", () => {
        expect(new SingleSource(new Key("minecraft:block/stone")).getSprite()?.getFormatted()).toBe(
            "minecraft:block/stone",
        );
    });

    it("prefers the sprite", () => {
        expect(
            new SingleSource(new Key("minecraft:block/stone"), new Key("mymod:rock"))
                .getSprite()
                ?.getFormatted(),
        ).toBe("mymod:rock");
    });

    it("is null on an empty source", () => {
        expect(new SingleSource().getSprite()).toBeNull();
    });
});

describe("SingleSource.Adapter", () => {
    it("reads type, resource and sprite", () => {
        const source = SingleSource.Adapter.read(
            parse(
                '{"type": "minecraft:single", "resource": "minecraft:block/stone", "sprite": "mymod:rock"}',
            ),
        );

        expect(source.getType()?.getFormatted()).toBe("minecraft:single");
        expect(source.getResource()?.getFormatted()).toBe("minecraft:block/stone");
        expect(source.getSprite()?.getFormatted()).toBe("mymod:rock");
    });

    it("leaves an absent sprite null", () => {
        const source = SingleSource.Adapter.read(
            parse('{"type": "minecraft:single", "resource": "minecraft:block/stone"}'),
        );
        expect(source.getSprite()?.getFormatted()).toBe("minecraft:block/stone");
    });

    it("gives every parsed source its own identity (upstream equals)", () => {
        const json = '{"type": "minecraft:single", "resource": "minecraft:block/stone"}';
        expect(SingleSource.Adapter.read(parse(json)).equalityKey()).not.toBe(
            SingleSource.Adapter.read(parse(json)).equalityKey(),
        );
    });
});
