import { Key } from "@material-bluemap/shared";
import { PNG } from "pngjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlockPropertiesBuilder } from "../../../world/BlockProperties.js";
import { BlockState as WorldBlockState } from "../../../world/BlockState.js";
import { PackVersion } from "../PackVersion.js";
import type { PackPath } from "../vfs/PackFileSystem.js";
import { ZipFileSystem } from "../vfs/ZipFileSystem.js";
import { buildZip } from "../vfs/zipTestUtil.js";
import { Extension, ResourcePack } from "./ResourcePack.js";
import type { ResourcePackExtension } from "./ResourcePackExtension.js";
import { Atlas } from "./atlas/Atlas.js";
import { Model } from "./model/Model.js";

// #region fixture

/** a solid single-colour png, written with the same pngjs codec the port decodes with */
function solidPng(width: number, height: number, r: number, g: number, b: number, a = 255): Buffer {
    const png = new PNG({ width, height });
    for (let i = 0; i < width * height; i++) {
        png.data[i * 4] = r;
        png.data[i * 4 + 1] = g;
        png.data[i * 4 + 2] = b;
        png.data[i * 4 + 3] = a;
    }
    return PNG.sync.write(png);
}

const BLOCKS_ATLAS_JSON = JSON.stringify({
    sources: [{ type: "minecraft:directory", source: "block", prefix: "block/" }],
});

/** one default variant (the "" condition), so forEach(state, 0, 0, 0, …) selects it */
const STONE_BLOCKSTATE_JSON = JSON.stringify({
    variants: { "": { model: "minecraft:block/stone" } },
});

/** the parent that supplies the (full-cube, six-faced) element */
const CUBE_ALL_MODEL_JSON = JSON.stringify({
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
});

/** carries no elements of its own — it only names the parent and resolves "#all" */
const STONE_MODEL_JSON = JSON.stringify({
    parent: "minecraft:block/cube_all",
    textures: { all: "minecraft:block/stone" },
});

const CHEST_ENTITYSTATE_JSON = JSON.stringify({ parts: [] });

const BLOCK_COLORS_JSON = JSON.stringify({
    "minecraft:grass_block": "minecraft:colormap/grass",
});

const BLOCK_PROPERTIES_JSON = JSON.stringify({
    "minecraft:stone": { randomOffset: true },
});

function resourcePackZip(): Buffer {
    return buildZip([
        { name: "pack.mcmeta", data: JSON.stringify({ pack: { pack_format: 34 } }) },
        { name: "assets/minecraft/atlases/blocks.json", data: BLOCKS_ATLAS_JSON },
        { name: "assets/minecraft/blockstates/stone.json", data: STONE_BLOCKSTATE_JSON },
        { name: "assets/minecraft/blockstates/readme.txt", data: "not a resource" },
        { name: "assets/minecraft/entitystates/chest.json", data: CHEST_ENTITYSTATE_JSON },
        { name: "assets/minecraft/models/block/cube_all.json", data: CUBE_ALL_MODEL_JSON },
        { name: "assets/minecraft/models/block/stone.json", data: STONE_MODEL_JSON },
        { name: "assets/minecraft/textures/block/stone.png", data: solidPng(16, 16, 120, 120, 120) },
        { name: "assets/minecraft/textures/block/unused.png", data: solidPng(16, 16, 10, 20, 30) },
        {
            name: "assets/minecraft/textures/block/extension_only.png",
            data: solidPng(16, 16, 200, 0, 0),
        },
        {
            name: "assets/minecraft/textures/colormap/grass.png",
            data: solidPng(256, 256, 0, 200, 0),
        },
        { name: "assets/minecraft/blockColors.json", data: BLOCK_COLORS_JSON },
        { name: "assets/minecraft/blockProperties.json", data: BLOCK_PROPERTIES_JSON },
    ]);
}

async function packRoots(): Promise<PackPath[]> {
    const fileSystem = await ZipFileSystem.fromBuffer(resourcePackZip(), "resourcepack.zip");
    return fileSystem.getRootDirectories();
}

async function loadedPack(): Promise<ResourcePack> {
    const pack = new ResourcePack(new PackVersion(34, 0));
    await pack.loadResources(await packRoots());
    return pack;
}

const STONE_MODEL = new Key("minecraft", "block/stone");
const CUBE_ALL_MODEL = new Key("minecraft", "block/cube_all");
const STONE_TEXTURE = new Key("minecraft", "block/stone");
const UNUSED_TEXTURE = new Key("minecraft", "block/unused");
const EXTENSION_ONLY_TEXTURE = new Key("minecraft", "block/extension_only");
const GRASS_COLORMAP = new Key("minecraft", "colormap/grass");

// #endregion
// #region the test-extension registered on the (global, singleton) registry

/**
 * The hooks the registered test-extension delegates to. It is null for every test that
 * does not install one, which makes the extension behave exactly like an implementation
 * that overrides nothing — so the other tests are unaffected by its registration.
 */
interface Hooks {
    loadResources?: (roots: Iterable<PackPath>) => void | Promise<void>;
    bake?: () => void | Promise<void>;
    collectUsedTextureKeys?: () => ReadonlySet<Key>;
    getBlockStateKey?: (key: Key) => Key;
    getBlockProperties?: (
        blockState: WorldBlockState,
        propertiesBuilder: BlockPropertiesBuilder,
    ) => void;
}

let hooks: Hooks | null = null;

class TestExtension implements ResourcePackExtension {
    constructor(readonly pack: ResourcePack) {}

    async loadResources(roots: Iterable<PackPath>): Promise<void> {
        await hooks?.loadResources?.(roots);
    }

    async bake(): Promise<void> {
        await hooks?.bake?.();
    }

    collectUsedTextureKeys(): ReadonlySet<Key> {
        return hooks?.collectUsedTextureKeys?.() ?? new Set<Key>();
    }

    getBlockStateKey(key: Key): Key {
        return hooks?.getBlockStateKey?.(key) ?? key;
    }

    getBlockProperties(
        blockState: WorldBlockState,
        propertiesBuilder: BlockPropertiesBuilder,
    ): void {
        hooks?.getBlockProperties?.(blockState, propertiesBuilder);
    }
}

const TEST_EXTENSION_TYPE: Extension<TestExtension> = {
    getKey: () => Key.bluemap("test-extension"),
    create: (pack) => new TestExtension(pack),
};

ResourcePack.Extension.REGISTRY.register(TEST_EXTENSION_TYPE);

// #endregion

beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    hooks = null;
    vi.restoreAllMocks();
});

describe("ResourcePack missing-resource constants", () => {
    it("are the upstream bluemap-namespace paths", () => {
        expect(ResourcePack.MISSING_BLOCK_STATE.getFormatted()).toBe("bluemap:missing");
        expect(ResourcePack.MISSING_ENTITY_STATE.getFormatted()).toBe("bluemap:missing");
        expect(ResourcePack.MISSING_BLOCK_MODEL.getFormatted()).toBe("bluemap:block/missing");
        expect(ResourcePack.MISSING_ENTITY_MODEL.getFormatted()).toBe("bluemap:entity/missing");
        expect(ResourcePack.MISSING_TEXTURE.getFormatted()).toBe("bluemap:block/missing");
    });
});

describe("ResourcePack.loadResources", () => {
    it("populates all six resource-pools from a zipped resourcepack", async () => {
        const pack = await loadedPack();

        expect(pack.getAtlases().get(Key.minecraft("blocks"))).not.toBeNull();
        expect(pack.getBlockStates().get(Key.minecraft("stone"))).not.toBeNull();
        expect(pack.getEntityStates().get(Key.minecraft("chest"))).not.toBeNull();
        expect(pack.getModels().get(STONE_MODEL)).not.toBeNull();
        expect(pack.getModels().get(CUBE_ALL_MODEL)).not.toBeNull();
        expect(pack.getColormaps().get(GRASS_COLORMAP)).not.toBeNull();
        expect(pack.getTextures().get(STONE_TEXTURE)).not.toBeNull();

        // non-json files are not resources
        expect(pack.getBlockStates().get(Key.minecraft("readme"))).toBeNull();
    });

    it("only decodes textures a non-reference texture-variable actually names", async () => {
        const pack = await loadedPack();

        // block/stone is named by the stone model's "all" variable …
        expect(pack.getTextures().get(STONE_TEXTURE)).not.toBeNull();
        // … block/unused sits in the same texture-directory and is never referenced
        expect(pack.getTextures().get(UNUSED_TEXTURE)).toBeNull();
        expect(pack.getTextures().get(EXTENSION_ONLY_TEXTURE)).toBeNull();
    });

    it("bakes atlas -> optimize -> applyParent -> calculateProperties, in that order", async () => {
        const atlasBake = vi.spyOn(Atlas.prototype, "bake");
        const optimize = vi.spyOn(Model.prototype, "optimize");
        const applyParent = vi.spyOn(Model.prototype, "applyParent");
        const calculateProperties = vi.spyOn(Model.prototype, "calculateProperties");

        await loadedPack();

        const first = (calls: number[]): number => Math.min(...calls);
        const last = (calls: number[]): number => Math.max(...calls);

        expect(atlasBake.mock.invocationCallOrder.length).toBeGreaterThan(0);
        expect(optimize.mock.invocationCallOrder.length).toBeGreaterThan(0);

        // the atlas is fully baked before the first model is touched …
        expect(last(atlasBake.mock.invocationCallOrder)).toBeLessThan(
            first(optimize.mock.invocationCallOrder),
        );
        // … and each model-loop completes before the next one starts
        expect(last(optimize.mock.invocationCallOrder)).toBeLessThan(
            first(applyParent.mock.invocationCallOrder),
        );
        expect(last(applyParent.mock.invocationCallOrder)).toBeLessThan(
            first(calculateProperties.mock.invocationCallOrder),
        );
    });

    it("gives the child model its parent's element, and derives culling from it", async () => {
        const pack = await loadedPack();

        const stone = pack.getModels().get(STONE_MODEL);
        expect(stone).not.toBeNull();

        // applyParent ran before calculateProperties: the element came from cube_all …
        expect(stone!.getElements()).not.toBeNull();
        expect(stone!.getElements()!.length).toBe(1);
        // … and calculateProperties then found six faces with an opaque texture
        expect(stone!.isOccluding()).toBe(true);
        expect(stone!.isCulling()).toBe(true);
    });
});

describe("ResourcePack.getBlockState / getBlockProperties", () => {
    it("caches the resourcepack-blockstate on the world-blockstate value", async () => {
        const pack = await loadedPack();

        const stone = new WorldBlockState(Key.minecraft("stone"));
        const equalStone = new WorldBlockState(Key.minecraft("stone"));

        const blockState = pack.getBlockState(stone);
        expect(blockState).not.toBeNull();

        // a distinct-but-equal world-blockstate hits the same cache entry
        expect(pack.getBlockState(equalStone)).toBe(blockState);

        // and the entry really is cached: dropping it from the pool changes nothing
        pack.getBlockStates().remove(Key.minecraft("stone"));
        expect(pack.getBlockState(equalStone)).toBe(blockState);
    });

    it("returns null for a blockstate the pack has no resources for", async () => {
        const pack = await loadedPack();

        expect(pack.getBlockState(new WorldBlockState(Key.minecraft("nothing_here")))).toBeNull();
    });

    it("caches the block-properties instance", async () => {
        const pack = await loadedPack();

        const stone = new WorldBlockState(Key.minecraft("stone"));
        const equalStone = new WorldBlockState(Key.minecraft("stone"));

        const properties = pack.getBlockProperties(stone);
        // loadBlockProperties builds a fresh instance per call, so identity is the cache
        expect(pack.getBlockProperties(equalStone)).toBe(properties);
    });

    it("takes configured properties from blockProperties.json and the rest from the model", async () => {
        const pack = await loadedPack();

        const properties = pack.getBlockProperties(new WorldBlockState(Key.minecraft("stone")));

        // explicitly configured
        expect(properties.isRandomOffset()).toBe(true);
        // undefined -> resolved through the variant selected at the origin coordinate
        expect(properties.isOccluding()).toBe(true);
        expect(properties.isCulling()).toBe(true);
    });

    it("leaves culling/occluding at their defaults for an unknown blockstate", async () => {
        const pack = await loadedPack();

        const properties = pack.getBlockProperties(new WorldBlockState(Key.minecraft("unknown")));
        expect(properties.isOccluding()).toBe(false);
        expect(properties.isCulling()).toBe(false);
    });
});

describe("ResourcePack.createBlockColorCalculator", () => {
    it("builds a calculator from the loaded blockColors.json and colormaps", async () => {
        const pack = await loadedPack();

        expect(pack.createBlockColorCalculator()).toBeDefined();
    });
});

describe("ResourcePack extensions", () => {
    it("creates one instance per registered extension-type, reachable by its type", async () => {
        const pack = new ResourcePack(new PackVersion(34, 0));

        const extension = pack.getExtension(TEST_EXTENSION_TYPE);
        expect(extension).toBeInstanceOf(TestExtension);
        expect(extension!.pack).toBe(pack);
    });

    it("returns null for an extension-type that is not registered", async () => {
        const pack = new ResourcePack(new PackVersion(34, 0));

        const unregistered: Extension<ResourcePackExtension> = {
            getKey: () => Key.bluemap("not-registered"),
            create: () => ({}),
        };
        expect(pack.getExtension(unregistered)).toBeNull();
    });

    it("invokes the extension hooks at each of the five loading phases", async () => {
        const pack = new ResourcePack(new PackVersion(34, 0));
        const order: string[] = [];

        let modelsLoadedAtExtensionLoad: boolean | null = null;
        let texturesLoadedAtExtensionLoad: boolean | null = null;
        let texturesLoadedAtExtensionBake: boolean | null = null;
        let parentAppliedAtExtensionBake: boolean | null = null;

        hooks = {
            // phase 2 — after the non-texture resources of every root are loaded
            loadResources: () => {
                order.push("loadResources");
                modelsLoadedAtExtensionLoad = pack.getModels().get(STONE_MODEL) !== null;
                texturesLoadedAtExtensionLoad = pack.getTextures().get(STONE_TEXTURE) !== null;
            },
            // phase 3 — the texture-key collection that feeds the phase-4 filter
            collectUsedTextureKeys: () => {
                order.push("collectUsedTextureKeys");
                return new Set([EXTENSION_ONLY_TEXTURE]);
            },
            // phase 5 — after ResourcePack#bake
            bake: () => {
                order.push("bake");
                texturesLoadedAtExtensionBake = pack.getTextures().get(STONE_TEXTURE) !== null;
                parentAppliedAtExtensionBake = pack.getModels().get(STONE_MODEL)!.getElements() !== null;
            },
            getBlockStateKey: (key) => {
                order.push("getBlockStateKey");
                return key;
            },
            getBlockProperties: (_blockState, propertiesBuilder) => {
                order.push("getBlockProperties");
                propertiesBuilder.alwaysWaterlogged(true);
            },
        };

        await pack.loadResources(await packRoots());

        expect(order).toEqual(["loadResources", "collectUsedTextureKeys", "bake"]);

        // phase 1 finished before the extension loaded, phase 4 had not started yet
        expect(modelsLoadedAtExtensionLoad).toBe(true);
        expect(texturesLoadedAtExtensionLoad).toBe(false);

        // phase 4 loaded the extension-declared key even though nothing references it …
        expect(pack.getTextures().get(EXTENSION_ONLY_TEXTURE)).not.toBeNull();
        // … while the still-unreferenced texture stayed out
        expect(pack.getTextures().get(UNUSED_TEXTURE)).toBeNull();

        // the extension bakes after the resourcepack has baked
        expect(texturesLoadedAtExtensionBake).toBe(true);
        expect(parentAppliedAtExtensionBake).toBe(true);

        // the two lookup-hooks run on the block-properties path
        order.length = 0;
        const properties = pack.getBlockProperties(new WorldBlockState(Key.minecraft("stone")));
        expect(order).toContain("getBlockProperties");
        expect(order).toContain("getBlockStateKey");
        expect(properties.isAlwaysWaterlogged()).toBe(true);
    });
});
