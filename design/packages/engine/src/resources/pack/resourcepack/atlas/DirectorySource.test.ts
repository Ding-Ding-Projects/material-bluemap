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
import type { Texture } from "../texture/Texture.js";
import { DirectorySource } from "./DirectorySource.js";

const workDir = mkdtempSync(join(tmpdir(), "bluemap-atlas-directory-"));
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

function makePng(width: number, height: number): Buffer {
    const image = new PNG({ width, height });
    image.data.fill(255);
    return PNG.sync.write(image);
}

const PIXEL = makePng(1, 1);

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

async function loadedKeys(
    root: PackPath,
    source: DirectorySource,
    textureFilter: (key: Key) => boolean = () => true,
): Promise<string[]> {
    const textures = new ResourcePool<Texture>();
    await source.load(root, textures, textureFilter);
    return textures.keySet().map((key) => key.getFormatted());
}

describe("DirectorySource#load", () => {
    it("walks the source-directory of every namespace", async () => {
        const root = tree({
            "assets/minecraft/textures/block/stone.png": PIXEL,
            "assets/minecraft/textures/block/oak/planks.png": PIXEL,
            "assets/mymod/textures/block/magic.png": PIXEL,
        });

        expect((await loadedKeys(root, new DirectorySource("block"))).sort()).toEqual([
            "minecraft:oak/planks",
            "minecraft:stone",
            "mymod:magic",
        ]);
    });

    it("separates nested paths with '/' and prepends the prefix", async () => {
        const root = tree({ "assets/minecraft/textures/block/oak/planks.png": PIXEL });

        expect(await loadedKeys(root, new DirectorySource("block", "block/"))).toEqual([
            "minecraft:block/oak/planks",
        ]);
    });

    it("ignores everything that is not a .png", async () => {
        const root = tree({
            "assets/minecraft/textures/block/stone.png": PIXEL,
            "assets/minecraft/textures/block/stone.png.mcmeta": "{}",
            "assets/minecraft/textures/block/notes.txt": "hello",
        });

        expect(await loadedKeys(root, new DirectorySource("block"))).toEqual(["minecraft:stone"]);
    });

    it("applies the texture-filter before loading the file", async () => {
        const root = tree({
            "assets/minecraft/textures/block/stone.png": PIXEL,
            // not a png at all — reading it would fail and be logged
            "assets/minecraft/textures/block/broken.png": "definitely not a png",
        });

        expect(
            await loadedKeys(
                root,
                new DirectorySource("block"),
                (key) => key.getValue() !== "broken",
            ),
        ).toEqual(["minecraft:stone"]);
        expect(debugMessages()).toEqual([]);
    });

    it("logs (and skips) a texture that fails to load once the filter let it through", async () => {
        const root = tree({
            "assets/minecraft/textures/block/broken.png": "definitely not a png",
        });

        expect(await loadedKeys(root, new DirectorySource("block"))).toEqual([]);
        expect(debugMessages()).toHaveLength(1);
        expect(debugMessages()[0]).toContain("Failed to load resource 'minecraft:broken'");
    });

    it("does nothing for a missing source-directory or a missing assets-directory", async () => {
        expect(await loadedKeys(tree({}), new DirectorySource("block"))).toEqual([]);
        expect(
            await loadedKeys(
                tree({ "assets/minecraft/textures/item/stick.png": PIXEL }),
                new DirectorySource("block"),
            ),
        ).toEqual([]);
    });

    it("does nothing without a source", async () => {
        const root = tree({ "assets/minecraft/textures/block/stone.png": PIXEL });
        expect(await loadedKeys(root, new DirectorySource())).toEqual([]);
    });

    it("keeps an already-pooled texture", async () => {
        const root = tree({ "assets/minecraft/textures/block/stone.png": makePng(4, 4) });
        const textures = new ResourcePool<Texture>();
        const present = { marker: true } as unknown as Texture;
        textures.put(new Key("minecraft:stone"), present);

        await new DirectorySource("block").load(root, textures, () => true);

        expect(textures.get(new Key("minecraft:stone"))).toBe(present);
    });
});

describe("DirectorySource.Adapter", () => {
    it("reads type, source and prefix", () => {
        const source = DirectorySource.Adapter.read(
            parse('{"type": "minecraft:directory", "source": "block", "prefix": "block/"}'),
        );

        expect(source.getType()?.getFormatted()).toBe("minecraft:directory");
        expect(source.getSource()).toBe("block");
        expect(source.getPrefix()).toBe("block/");
    });

    it("defaults the prefix to the empty string", () => {
        const source = DirectorySource.Adapter.read(
            parse('{"type": "minecraft:directory", "source": "block"}'),
        );
        expect(source.getPrefix()).toBe("");
    });
});
