import { Key } from "@material-bluemap/shared";
import { PNG } from "pngjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlockState as WorldBlockState } from "../../../../world/BlockState.js";
import { parse } from "../../../adapter/JsonMapper.js";
import { PackVersion } from "../../PackVersion.js";
import type { PackPath } from "../../vfs/PackFileSystem.js";
import { ZipFileSystem } from "../../vfs/ZipFileSystem.js";
import { buildZip } from "../../vfs/zipTestUtil.js";
import { ResourcePack } from "../ResourcePack.js";
import { BlockState } from "../blockstate/BlockState.js";
import type { Variant } from "../blockstate/Variant.js";
import type { Model } from "../model/Model.js";
import {
    LEGACY_RESOURCES_EXTENSION,
    registerLegacyResourcePackExtension,
} from "./LegacyResourcePackExtension.js";

// #region fixtures

/** a solid single-colour png, written with the same pngjs codec the port decodes with */
function solidPng(r: number, g: number, b: number, a = 255): Buffer {
    const png = new PNG({ width: 16, height: 16 });
    for (let i = 0; i < 16 * 16; i++) {
        png.data[i * 4] = r;
        png.data[i * 4 + 1] = g;
        png.data[i * 4 + 2] = b;
        png.data[i * 4 + 3] = a;
    }
    return PNG.sync.write(png);
}

/**
 * The full-cube parent. Its own texture-variables are all references ("#all"), so the only
 * texture-key either pack contributes is the child model's.
 */
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

/*
 * A 1.12-shaped pack. Every era-difference this wave exists for is present:
 *  - pack_format 3 (1.11 - 1.12.2)
 *  - no assets/minecraft/atlases/blocks.json at all
 *  - the "normal" variant-key
 *  - a bare model reference ("stone", not "minecraft:block/stone")
 *  - textures under textures/blocks/, referenced as "blocks/stone"
 *  - BlueMap's own missing-texture at its legacy path, textures/blocks/missing.png
 * The model *parent* deliberately keeps its "block/" — the legacy loader resolved parents
 * against models/ (not models/block), so 1.12 parents already carry it.
 */
const LEGACY_STONE_BLOCKSTATE_JSON = JSON.stringify({
    variants: { normal: { model: "stone" } },
});

const LEGACY_STONE_MODEL_JSON = JSON.stringify({
    parent: "block/cube_all",
    textures: { all: "blocks/stone" },
});

/**
 * @param withTextures false builds the same pack with its {@code textures/blocks/}
 *        directory left out entirely — used to prove that a legacy model's
 *        {@code blocks/}-named reference can be satisfied by a modern pack's
 *        {@code textures/block/}
 */
function legacyPackZip(withTextures = true): Buffer {
    return buildZip([
        { name: "pack.mcmeta", data: JSON.stringify({ pack: { pack_format: 3 } }) },
        { name: "assets/minecraft/blockstates/stone.json", data: LEGACY_STONE_BLOCKSTATE_JSON },
        { name: "assets/minecraft/models/block/cube_all.json", data: CUBE_ALL_MODEL_JSON },
        { name: "assets/minecraft/models/block/stone.json", data: LEGACY_STONE_MODEL_JSON },
        ...(withTextures
            ? [
                  {
                      name: "assets/minecraft/textures/blocks/stone.png",
                      data: solidPng(120, 120, 120),
                  },
                  {
                      name: "assets/minecraft/textures/blocks/unused.png",
                      data: solidPng(10, 20, 30),
                  },
                  // the legacy path of BlueMap's own missing-texture (see the legacy tag's
                  // resourceExtensions), which this port names bluemap:block/missing
                  {
                      name: "assets/bluemap/textures/blocks/missing.png",
                      data: solidPng(255, 0, 255),
                  },
              ]
            : []),
    ]);
}

/*
 * A modern pack of the same shape, plus one blockstate carrying a *bare* model reference —
 * the compat layer must leave that unresolved here, since this pack is not legacy.
 */
const MODERN_STONE_BLOCKSTATE_JSON = JSON.stringify({
    variants: { "": { model: "minecraft:block/stone" } },
});

const MODERN_BARE_BLOCKSTATE_JSON = JSON.stringify({
    variants: { "": { model: "stone" } },
});

const MODERN_STONE_MODEL_JSON = JSON.stringify({
    parent: "minecraft:block/cube_all",
    textures: { all: "minecraft:block/stone" },
});

const MODERN_BLOCKS_ATLAS_JSON = JSON.stringify({
    sources: [{ type: "minecraft:directory", source: "block", prefix: "block/" }],
});

function modernPackZip(): Buffer {
    return buildZip([
        { name: "pack.mcmeta", data: JSON.stringify({ pack: { pack_format: 34 } }) },
        { name: "assets/minecraft/atlases/blocks.json", data: MODERN_BLOCKS_ATLAS_JSON },
        { name: "assets/minecraft/blockstates/stone.json", data: MODERN_STONE_BLOCKSTATE_JSON },
        { name: "assets/minecraft/blockstates/bare.json", data: MODERN_BARE_BLOCKSTATE_JSON },
        { name: "assets/minecraft/models/block/cube_all.json", data: CUBE_ALL_MODEL_JSON },
        { name: "assets/minecraft/models/block/stone.json", data: MODERN_STONE_MODEL_JSON },
        { name: "assets/minecraft/textures/block/stone.png", data: solidPng(120, 120, 120) },
        { name: "assets/minecraft/textures/block/unused.png", data: solidPng(10, 20, 30) },
    ]);
}

async function rootsOf(zip: Buffer, name: string): Promise<PackPath[]> {
    return (await ZipFileSystem.fromBuffer(zip, name)).getRootDirectories();
}

async function loadedPack(...roots: PackPath[]): Promise<ResourcePack> {
    const pack = new ResourcePack(new PackVersion(34, 0));
    await pack.loadResources(roots);
    return pack;
}

async function loadedLegacyPack(): Promise<ResourcePack> {
    return loadedPack(...(await rootsOf(legacyPackZip(), "legacy.zip")));
}

async function loadedModernPack(): Promise<ResourcePack> {
    return loadedPack(...(await rootsOf(modernPackZip(), "modern.zip")));
}

/** the single variant a blockstate resolves to at the origin */
function variantAt(pack: ResourcePack, id: string): Variant {
    const blockState = pack.getBlockStates().get(new Key(id));
    expect(blockState).not.toBeNull();

    const variants: Variant[] = [];
    blockState!.forEach(new WorldBlockState(new Key(id)), 0, 0, 0, (v) => variants.push(v));
    expect(variants.length).toBe(1);
    return variants[0]!;
}

/** the model that variant actually resolves to, through the path every consumer uses */
function modelOf(pack: ResourcePack, variant: Variant): Model | null {
    return variant.getModel().getResource((key) => pack.getModels().get(key));
}

const STONE = "minecraft:stone";
const LEGACY_STONE_TEXTURE = new Key("minecraft:blocks/stone");
const LEGACY_UNUSED_TEXTURE = new Key("minecraft:blocks/unused");
const FLATTENED_STONE_TEXTURE = new Key("minecraft:block/stone");
const BLOCK_MODEL_STONE = new Key("minecraft:block/stone");

// #endregion

// the extension registers itself on import; this pins that the import is the whole wiring
// and that a second registration is a no-op
registerLegacyResourcePackExtension();

beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("registerLegacyResourcePackExtension", () => {
    it("is idempotent, and every ResourcePack gets an instance", () => {
        // Registry#register returns true when an entry with the key was already there
        expect(registerLegacyResourcePackExtension()).toBe(true);

        const pack = new ResourcePack(new PackVersion(34, 0));
        const extension = pack.getExtension(LEGACY_RESOURCES_EXTENSION);

        expect(extension).not.toBeNull();
        expect(extension!.getPack()).toBe(pack);
        // nothing has been loaded yet, so nothing has been detected yet
        expect(extension!.isLegacy()).toBe(false);
    });
});

// requirement 1 — already handled upstream-side; verified rather than assumed
describe('the "normal" variant-key', () => {
    /** the keys that upstream's parseConditionString maps onto the all() condition */
    const unconditionalKeys = ["", "default", "normal"];

    it.each(unconditionalKeys)("makes %o the blockstate's default variant", (key) => {
        const blockState = BlockState.Adapter.read(
            parse(JSON.stringify({ variants: { [key]: { model: "stone" } } })),
        );

        const variants = blockState.getVariants();
        expect(variants).not.toBeNull();

        // it became the default, not a conditional variant
        expect(variants!.getDefaultVariant()).not.toBeNull();
        expect(variants!.getVariants().length).toBe(0);
        expect(
            variants!.getDefaultVariant()!.getVariants()[0]!.getModel().getFormatted(),
        ).toBe(STONE);
    });

    it("selects that variant for any world-blockstate", () => {
        const blockState = BlockState.Adapter.read(
            parse(JSON.stringify({ variants: { normal: { model: "stone" } } })),
        );

        const seen: string[] = [];
        blockState.forEach(new WorldBlockState(new Key(STONE)), 0, 0, 0, (variant) =>
            seen.push(variant.getModel().getFormatted()),
        );
        expect(seen).toEqual([STONE]);
    });

    it('still drops the 1.12 "all" and "map" keys upstream deliberately ignored', () => {
        // upstream (legacy BlockStateResource.Builder#build):
        //   "some exceptions in 1.12 resource packs that we ignore"
        //   if (conditionString.equals("all") || conditionString.equals("map")) continue;
        // the modern adapter reaches the same result: neither parses as a property, so both
        // become the none() condition and are dropped
        const blockState = BlockState.Adapter.read(
            parse(
                JSON.stringify({
                    variants: {
                        all: { model: "stone" },
                        map: { model: "stone" },
                        normal: { model: "stone" },
                    },
                }),
            ),
        );

        const variants = blockState.getVariants()!;
        expect(variants.getVariants().length).toBe(0);
        expect(variants.getDefaultVariant()).not.toBeNull();
    });
});

describe("a pre-flattening (1.12) resourcepack", () => {
    it("is detected from pack.mcmeta's pack_format", async () => {
        const pack = await loadedLegacyPack();

        expect(pack.getExtension(LEGACY_RESOURCES_EXTENSION)!.isLegacy()).toBe(true);
    });

    // requirement 2 — pre-atlas texture discovery
    it("gets a synthetic minecraft:blocks atlas even though it ships no atlas file", async () => {
        const pack = await loadedLegacyPack();

        const atlas = pack.getAtlases().get(new Key("minecraft:blocks"));
        expect(atlas).not.toBeNull();
        expect(atlas!.getSources().length).toBe(8);
    });

    it("loads the textures the models name, from the pre-flattening directory", async () => {
        const pack = await loadedLegacyPack();

        // the whole point: without the synthetic atlas this pack yields zero textures
        expect(pack.getTextures().get(LEGACY_STONE_TEXTURE)).not.toBeNull();
    });

    it("still decodes only the textures a model actually references", async () => {
        const pack = await loadedLegacyPack();

        // textures/blocks/unused.png sits beside the referenced one and is never named,
        // so the key-filter drops it exactly as it does for a modern pack
        expect(pack.getTextures().get(LEGACY_UNUSED_TEXTURE)).toBeNull();
    });

    // requirement 3 — pre-flattening names, in the blocks/ -> block/ direction
    it("finds a flattened-name texture in a pre-flattening directory", async () => {
        const pack = await loadedLegacyPack();

        // ResourcePack.MISSING_TEXTURE is bluemap:block/missing and is always in the
        // key-filter; this pack ships it where 1.12 put it, at textures/blocks/missing.png
        expect(pack.getTextures().get(ResourcePack.MISSING_TEXTURE)).not.toBeNull();
    });

    // requirement 3 — pre-flattening names, for the blockstate's model reference
    it("resolves a bare model reference against the block/-prefixed model", async () => {
        const pack = await loadedLegacyPack();
        const variant = variantAt(pack, STONE);

        // the reference itself is untouched — it is an immutable Key
        expect(variant.getModel().getFormatted()).toBe(STONE);
        // … but it now resolves to the model registered under minecraft:block/stone
        expect(modelOf(pack, variant)).toBe(pack.getModels().get(BLOCK_MODEL_STONE));
        expect(modelOf(pack, variant)).not.toBeNull();
    });

    it("does not resolve a bare reference the pack has no model for", async () => {
        const pack = await loadedLegacyPack();

        expect(pack.getModels().get(new Key("minecraft:block/nothing_here"))).toBeNull();
        expect(pack.getBlockStates().get(new Key("minecraft:nothing_here"))).toBeNull();
    });

    it("never caches a resource onto the shared MISSING_BLOCK_MODEL path", async () => {
        await loadedLegacyPack();

        // a poisoned singleton would give every model-less variant in the process the
        // same wrong model
        expect(ResourcePack.MISSING_BLOCK_MODEL.getResource()).toBeNull();
    });

    // the whole chain, end to end
    it("resolves a blockstate all the way to a decoded texture", async () => {
        const pack = await loadedLegacyPack();

        const model = modelOf(pack, variantAt(pack, STONE))!;
        expect(model).not.toBeNull();

        // the parent supplied the element (models/ parents already carry "block/" in 1.12)
        expect(model.getElements()!.length).toBe(1);

        // the "all" variable resolved to the pre-flattening texture-key …
        const texturePath = model.getTextures().get("all")!.getTexturePath();
        expect(texturePath!.getFormatted()).toBe(LEGACY_STONE_TEXTURE.getFormatted());
        // … and that key carries a decoded, opaque texture
        expect(texturePath!.getResource()).not.toBeNull();
        expect(texturePath!.getResource()!.getColorStraight().a).toBe(1);

        // which is what calculateProperties needs to see to derive culling
        expect(model.isOccluding()).toBe(true);
        expect(model.isCulling()).toBe(true);
    });

    it("reaches the renderer's block-properties through that same chain", async () => {
        const pack = await loadedLegacyPack();

        const properties = pack.getBlockProperties(new WorldBlockState(new Key(STONE)));
        expect(properties.isOccluding()).toBe(true);
        expect(properties.isCulling()).toBe(true);
    });
});

describe("a modern resourcepack is unaffected by the compat layer", () => {
    it("is not detected as legacy", async () => {
        const pack = await loadedModernPack();

        expect(pack.getExtension(LEGACY_RESOURCES_EXTENSION)!.isLegacy()).toBe(false);
    });

    it("keeps its own atlas exactly as it declared it", async () => {
        const pack = await loadedModernPack();

        const atlas = pack.getAtlases().get(new Key("minecraft:blocks"));
        expect(atlas).not.toBeNull();
        // its one declared source, with none of the eight synthetic ones merged in
        expect(atlas!.getSources().length).toBe(1);
    });

    it("loads its textures from the flattened directory, and no legacy-named alias", async () => {
        const pack = await loadedModernPack();

        expect(pack.getTextures().get(FLATTENED_STONE_TEXTURE)).not.toBeNull();
        expect(pack.getTextures().get(LEGACY_STONE_TEXTURE)).toBeNull();
    });

    it("leaves a bare model reference unresolved", async () => {
        const pack = await loadedModernPack();
        const variant = variantAt(pack, "minecraft:bare");

        // minecraft:block/stone exists, but this pack is not legacy, so nothing maps onto it
        expect(pack.getModels().get(BLOCK_MODEL_STONE)).not.toBeNull();
        expect(variant.getModel().getFormatted()).toBe(STONE);
        expect(variant.getModel().getResource()).toBeNull();
        expect(modelOf(pack, variant)).toBeNull();
    });

    it("still bakes its own models normally", async () => {
        const pack = await loadedModernPack();

        const properties = pack.getBlockProperties(new WorldBlockState(new Key(STONE)));
        expect(properties.isOccluding()).toBe(true);
        expect(properties.isCulling()).toBe(true);
    });
});

describe("a stack of a legacy and a modern pack", () => {
    /*
     * ResourcePool#load keeps the resource already present, so the pack listed *first*
     * wins every key it defines. Which era's names then have to resolve depends entirely
     * on which pack won, so both orders are exercised.
     */

    it("merges the synthetic sources into the modern pack's own atlas", async () => {
        const pack = await loadedPack(
            ...(await rootsOf(modernPackZip(), "modern.zip")),
            ...(await rootsOf(legacyPackZip(), "legacy.zip")),
        );

        expect(pack.getExtension(LEGACY_RESOURCES_EXTENSION)!.isLegacy()).toBe(true);

        // the modern pack's one declared source plus the eight synthetic ones — merged
        // with Atlas#add, not replaced
        expect(pack.getAtlases().get(new Key("minecraft:blocks"))!.getSources().length).toBe(9);
    });

    it("leaves the winning modern resources on their own names", async () => {
        const pack = await loadedPack(
            ...(await rootsOf(modernPackZip(), "modern.zip")),
            ...(await rootsOf(legacyPackZip(), "legacy.zip")),
        );

        // the modern blockstate and model won, so the modern reference is what resolves
        const variant = variantAt(pack, STONE);
        expect(variant.getModel().getFormatted()).toBe(BLOCK_MODEL_STONE.getFormatted());
        expect(modelOf(pack, variant)).not.toBeNull();

        // and the texture it names is the flattened one; nothing references the legacy
        // name, so the key-filter never lets it through
        expect(pack.getTextures().get(FLATTENED_STONE_TEXTURE)).not.toBeNull();
        expect(pack.getTextures().get(LEGACY_STONE_TEXTURE)).toBeNull();
    });

    it("resolves the winning legacy resources when the legacy pack is listed first", async () => {
        const pack = await loadedPack(
            ...(await rootsOf(legacyPackZip(), "legacy.zip")),
            ...(await rootsOf(modernPackZip(), "modern.zip")),
        );

        const variant = variantAt(pack, STONE);
        expect(variant.getModel().getFormatted()).toBe(STONE);
        expect(modelOf(pack, variant)).not.toBeNull();
        expect(pack.getTextures().get(LEGACY_STONE_TEXTURE)).not.toBeNull();
    });

    // the cross-direction of requirement 3: a 1.12 reference against a flattened file
    it("satisfies a legacy blocks/ reference from a modern pack's textures/block/", async () => {
        const pack = await loadedPack(
            // this legacy pack ships the blockstate and models but no textures at all …
            ...(await rootsOf(legacyPackZip(false), "legacy.zip")),
            // … so the only stone.png in the stack is the modern pack's, at
            // assets/minecraft/textures/block/stone.png
            ...(await rootsOf(modernPackZip(), "modern.zip")),
        );

        // the legacy model won, so the needed key is the pre-flattening one …
        const model = modelOf(pack, variantAt(pack, STONE))!;
        expect(model.getTextures().get("all")!.getTexturePath()!.getFormatted()).toBe(
            LEGACY_STONE_TEXTURE.getFormatted(),
        );

        // … and the "block -> blocks/" synthetic source found the flattened file under it
        expect(pack.getTextures().get(LEGACY_STONE_TEXTURE)).not.toBeNull();
        expect(model.isCulling()).toBe(true);
    });
});
