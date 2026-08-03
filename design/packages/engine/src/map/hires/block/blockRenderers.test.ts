import { Color, Key, Vector3i } from "@material-bluemap/shared";
import { describe, expect, it } from "vitest";
import { ResourcePath } from "../../../resources/ResourcePath.js";
import { Variant } from "../../../resources/pack/resourcepack/blockstate/Variant.js";
import { Element } from "../../../resources/pack/resourcepack/model/Element.js";
import { Face } from "../../../resources/pack/resourcepack/model/Face.js";
import { Model } from "../../../resources/pack/resourcepack/model/Model.js";
import { Rotation } from "../../../resources/pack/resourcepack/model/Rotation.js";
import { TextureVariable } from "../../../resources/pack/resourcepack/model/TextureVariable.js";
import { Texture } from "../../../resources/pack/resourcepack/texture/Texture.js";
import { Direction } from "../../../util/Direction.js";
import { BlockState } from "../../../world/BlockState.js";
import { ArrayTileModel } from "../ArrayTileModel.js";
import { TileModelView } from "../TileModelView.js";
import { BlockRenderPass } from "./BlockRenderPass.js";
import { BlockRendererType } from "./BlockRendererType.js";
import { BlockStateModelRenderer } from "./BlockStateModelRenderer.js";
import { LiquidModelRenderer } from "./LiquidModelRenderer.js";
import { MissingModelRenderer } from "./MissingModelRenderer.js";
import { ResourceModelRenderer } from "./ResourceModelRenderer.js";
import { Vector3f } from "@material-bluemap/shared";
import {
    cubeModel,
    cullingProperties,
    faceAos,
    faceColor,
    facePositions,
    faceUvs,
    harness,
    occludingOnlyProperties,
    singleVariantState,
    TEST_TINT,
    testWorld,
    TestWorldData,
} from "./testHarness.js";
import type { BlockProperties } from "../../../world/BlockProperties.js";
import type { TileMetaConsumer } from "../../TileMetaConsumer.js";

const STONE = new BlockState(Key.minecraft("stone"));
const GLASS = new BlockState(Key.minecraft("glass"));
const WATER = BlockState.WATER;

function waterWithLevel(level: number): BlockState {
    return new BlockState(Key.minecraft("water"), new Map([["level", String(level)]]));
}

const CUBE_MODEL_PATH = "test:block/cube";
const CUBE_TEXTURE = "test:block/cube";

function stoneModels(options: Parameters<typeof cubeModel>[1] = {}): Map<string, Model> {
    return new Map([[CUBE_MODEL_PATH, cubeModel(CUBE_TEXTURE, options)]]);
}

function stoneTextures(): Map<string, Texture> {
    return new Map([[CUBE_TEXTURE, Texture.missing(new Key("test", "block/cube"))]]);
}

function stoneVariant(): Variant {
    return new Variant(new ResourcePath<Model>(CUBE_MODEL_PATH));
}

/** the number of triangles the model holds */
function faceCount(model: ArrayTileModel): number {
    return model.size();
}

describe("ResourceModelRenderer", () => {
    function renderStone(
        opts: {
            world?: TestWorldData;
            model?: Parameters<typeof cubeModel>[1];
            properties?: Map<string, BlockProperties>;
            renderTopOnly?: boolean;
            ambientLight?: number;
            variant?: Variant;
        } = {},
    ): { model: ArrayTileModel; color: Color } {
        const world = opts.world ?? new TestWorldData().set(0, 0, 0, { state: STONE });
        const options: Parameters<typeof harness>[1] = {
            models: stoneModels(opts.model),
            textures: stoneTextures(),
        };
        if (opts.properties !== undefined) options.properties = opts.properties;

        const h = harness(world, options, {
            renderTopOnly: opts.renderTopOnly ?? false,
            ambientLight: opts.ambientLight ?? 0,
        });
        const renderer = new ResourceModelRenderer(h.resourcePack, h.gallery, h.renderSettings);
        h.block.set(0, 0, 0);

        const color = new Color().set(0, 0, 0, 0, true);
        renderer.render(h.block, opts.variant ?? stoneVariant(), h.view.initialize(), color);
        return { model: h.tileModel, color };
    }

    it("emits two triangles per face of a full cube, scaled into the unit cube", () => {
        const { model } = renderStone();
        expect(faceCount(model)).toBe(12);

        // face 0/1 are the DOWN face: c[0], c[2], c[3] and c[0], c[3-as-c2], c[1]
        expect(facePositions(model, 0)).toEqual([0, 0, 0, 1, 0, 0, 1, 0, 1]);
        expect(facePositions(model, 1)).toEqual([0, 0, 0, 1, 0, 1, 0, 0, 1]);
        // face 2/3 are the UP face
        expect(facePositions(model, 2)).toEqual([0, 1, 1, 1, 1, 1, 1, 1, 0]);
        expect(facePositions(model, 3)).toEqual([0, 1, 1, 1, 1, 0, 0, 1, 0]);
    });

    it("lays the DOWN face's default uvs out in rawUv order", () => {
        const { model } = renderStone();
        // Element#calculateDefaultUV(DOWN) = (from.x, 16-to.z, to.x, 16-from.z) = (0,0,16,16)
        expect(faceUvs(model, 0)).toEqual([0, 1, 1, 1, 1, 0]);
        expect(faceUvs(model, 1)).toEqual([0, 1, 1, 0, 0, 0]);
    });

    it("rotates the uvs by the face's rotation in 90-degree steps", () => {
        const { model } = renderStone({ model: { rotation: 90 } });
        // one step: uvs = [rawUvs[1], rawUvs[2], rawUvs[3], rawUvs[0]]
        expect(faceUvs(model, 0)).toEqual([1, 1, 1, 0, 0, 0]);
        expect(faceUvs(model, 1)).toEqual([1, 1, 0, 0, 0, 1]);
    });

    it("culls a face whose cullface neighbour is culling", () => {
        const world = new TestWorldData()
            .set(0, 0, 0, { state: STONE })
            .set(0, 1, 0, { state: GLASS });
        const properties = new Map([["minecraft:glass", cullingProperties()]]);

        const { model } = renderStone({ world, properties });
        // the UP face is gone
        expect(faceCount(model)).toBe(10);
        // face 2/3 are now NORTH, whose first vertex is c[2] = (16, 0, 0) -> (1, 0, 0)
        expect(facePositions(model, 2).slice(0, 3)).toEqual([1, 0, 0]);
    });

    it("culls against an identical neighbour when cullingIdentical is set", () => {
        const world = new TestWorldData()
            .set(0, 0, 0, { state: STONE })
            .set(0, 1, 0, { state: STONE });
        const identical = cullingProperties().toBuilder().culling(false).cullingIdentical(true).build();
        const properties = new Map([["minecraft:stone", identical]]);

        const { model } = renderStone({ world, properties });
        expect(faceCount(model)).toBe(10);
    });

    it("keeps only up-facing faces when renderTopOnly is set", () => {
        const { model } = renderStone({ renderTopOnly: true });
        expect(faceCount(model)).toBe(2);
        expect(facePositions(model, 0)).toEqual([0, 1, 1, 1, 1, 1, 1, 1, 0]);
    });

    it("writes white into a face with no tintindex and the calculated tint otherwise", () => {
        expect(faceColor(renderStone().model, 0)).toEqual([1, 1, 1]);

        const tinted = renderStone({ model: { tintindex: 0 } });
        expect(faceColor(tinted.model, 0)).toEqual([TEST_TINT.r, TEST_TINT.g, TEST_TINT.b]);
    });

    it("takes ambient occlusion from the occluding neighbours of each vertex", () => {
        const noOcclusion = renderStone();
        expect(faceAos(noOcclusion.model, 0)).toEqual([1, 1, 1]);

        // one occluding block diagonally below-north of the DOWN face's shared corner
        const world = new TestWorldData()
            .set(0, 0, 0, { state: STONE })
            .set(0, -1, -1, { state: GLASS });
        const properties = new Map([["minecraft:glass", occludingOnlyProperties()]]);
        const occluded = renderStone({ world, properties });

        // the DOWN face's c0 = (0,0,0) -> x=-1, y=-1, z=-1; the (0, y, z) probe is
        // (0,-1,-1) and occludes, so exactly one of the four probes counts
        expect(faceAos(occluded.model, 0)[0]).toBe(0.75);
        expect(faceAos(noOcclusion.model, 0)[0]).toBe(1);
    });

    it("skips ambient occlusion entirely when the model disables it", () => {
        const world = new TestWorldData()
            .set(0, 0, 0, { state: STONE })
            .set(0, -1, -1, { state: GLASS });
        const properties = new Map([["minecraft:glass", occludingOnlyProperties()]]);
        const { model } = renderStone({ world, properties, model: { ambientocclusion: false } });
        expect(faceAos(model, 0)).toEqual([1, 1, 1]);
    });

    it("takes the max light of the block and the faced neighbour, and the element emission", () => {
        const world = new TestWorldData()
            .set(0, 0, 0, { state: STONE, skyLight: 4, blockLight: 2 })
            .set(0, 1, 0, { state: BlockState.AIR, skyLight: 11, blockLight: 7 });
        const { model } = renderStone({ world });

        // faces 2/3 are UP, whose faced neighbour is (0,1,0)
        expect(model.sunlight[2]).toBe(11);
        expect(model.blocklight[2]).toBe(7);
        // faces 0/1 are DOWN, whose faced neighbour (0,-1,0) is default-lit air
        expect(model.sunlight[0]).toBe(15);
    });

    it("produces the block colour from the up-facing texture, scaled by the combined light", () => {
        const { color } = renderStone();
        // Texture.MISSING is (0.5, 0, 0.5, 1); full sunlight and ambientLight 0 leave it be
        expect([color.r, color.g, color.b, color.a]).toEqual([0.5, 0, 0.5, 1]);
        expect(color.isPremultiplied).toBe(false);
    });

    it("darkens the block colour with the light level and the ambient-light setting", () => {
        // the light of a face is the max of the block's and the *faced neighbour's*, so
        // the air above has to be dark too
        const world = new TestWorldData()
            .set(0, 0, 0, { state: STONE, skyLight: 0, blockLight: 0 })
            .set(0, 1, 0, { state: BlockState.AIR, skyLight: 0, blockLight: 0 });
        const dark = renderStone({ world, ambientLight: 0.25 });
        // combinedLight = (1 - 0.25) * 0 + 0.25 = 0.25
        expect(dark.color.r).toBe(Math.fround(0.5 * 0.25));
        expect(dark.color.b).toBe(Math.fround(0.5 * 0.25));
    });

    it("offsets the model by the coordinate hash when randomOffset is set", () => {
        const properties = new Map([
            ["minecraft:stone", cullingProperties().toBuilder().culling(false).randomOffset(true).build()],
        ]);
        const { model } = renderStone({ properties });

        // the DOWN face's first vertex was (0,0,0); x and z move, y does not
        const [x, y, z] = facePositions(model, 0);
        expect(y).toBe(0);
        expect(x).not.toBe(0);
        expect(z).not.toBe(0);
        expect(Math.abs(x!)).toBeLessThanOrEqual(0.375);
        expect(Math.abs(z!)).toBeLessThanOrEqual(0.375);
    });

    it("emits nothing when the variant's model can not be resolved", () => {
        const h = harness(new TestWorldData().set(0, 0, 0, { state: STONE }), {});
        const renderer = new ResourceModelRenderer(h.resourcePack, h.gallery, h.renderSettings);
        h.block.set(0, 0, 0);
        const color = new Color().set(0, 0, 0, 0, true);
        renderer.render(h.block, stoneVariant(), h.view.initialize(), color);
        expect(faceCount(h.tileModel)).toBe(0);
        expect(color.a).toBe(0);
    });
});

describe("LiquidModelRenderer", () => {
    const LIQUID_MODEL_PATH = "test:block/water";
    const STILL = "test:block/water_still";
    const FLOW = "test:block/water_flow";

    function liquidModel(): Model {
        const textures = new Map<string, TextureVariable>([
            ["still", new TextureVariable(new ResourcePath<Texture>(STILL))],
            ["flow", new TextureVariable(new ResourcePath<Texture>(FLOW))],
        ]);
        // a liquid model carries no elements — the renderer builds its own cube
        return new Model(textures, null);
    }

    function renderLiquid(world: TestWorldData, at: [number, number, number] = [0, 0, 0]) {
        const h = harness(world, {
            models: new Map([[LIQUID_MODEL_PATH, liquidModel()]]),
            textures: new Map([
                [STILL, Texture.missing(new Key("test", "block/water_still"))],
                [FLOW, Texture.missing(new Key("test", "block/water_flow"))],
            ]),
        });
        // give the two textures distinct gallery ids
        h.gallery.put(new Key("test", "block/water_still"), null);
        h.gallery.put(new Key("test", "block/water_flow"), null);
        const stillId = h.gallery.get(new Key("test", "block/water_still"));
        const flowId = h.gallery.get(new Key("test", "block/water_flow"));

        const renderer = new LiquidModelRenderer(h.resourcePack, h.gallery, h.renderSettings);
        h.block.set(at[0], at[1], at[2]);
        const color = new Color().set(0, 0, 0, 0, true);
        renderer.render(h.block, new Variant(new ResourcePath<Model>(LIQUID_MODEL_PATH)), h.view.initialize(), color);
        return { model: h.tileModel, color, stillId, flowId };
    }

    it("gives an isolated source block corner heights of 14/16", () => {
        const { model } = renderLiquid(new TestWorldData().set(0, 0, 0, { state: WATER }));
        expect(faceCount(model)).toBe(12);

        // faces 2/3 are UP; every top corner sits at 14/16
        const up = facePositions(model, 2);
        expect(up[1]).toBe(Math.fround(14 / 16));
        expect(up[4]).toBe(Math.fround(14 / 16));
        expect(up[7]).toBe(Math.fround(14 / 16));
    });

    it("raises the corners to a full block when the same liquid sits above", () => {
        const world = new TestWorldData()
            .set(0, 0, 0, { state: WATER })
            .set(0, 1, 0, { state: WATER });
        const { model } = renderLiquid(world);

        // the UP face is culled against the liquid above, so face 2/3 is now NORTH —
        // whose c2/c3 corners are the raised top ones
        expect(faceCount(model)).toBe(10);
        const north = facePositions(model, 2);
        expect(north[7]).toBe(1); // c2.y
    });

    it("averages the corner height down towards a lower-level neighbour", () => {
        const world = new TestWorldData()
            .set(0, 0, 0, { state: waterWithLevel(1) })
            .set(-1, 0, -1, { state: waterWithLevel(5) });
        const { model } = renderLiquid(world);

        // corner (-1,-1) averages level-1 (12.1) and level-5 (4.5) over a count of 4:
        // the two air neighbours are non-blocking and count too
        const expected = Math.fround(
            Math.fround(Math.fround(14 - Math.fround(1 * 1.9)) + Math.fround(14 - Math.fround(5 * 1.9))) / 4,
        );
        const up = facePositions(model, 2);
        // face 2 is UP: c0 = corners[5] (0,?,16) -> the (-1, 0) corner
        expect(up.length).toBe(9);
        // corners[4] is the (-1,-1) corner and is the third vertex of the second UP triangle
        expect(facePositions(model, 3)[7]).toBe(Math.fround(expected / 16));
    });

    it("culls every face against the same liquid, and side faces against culling blocks", () => {
        const world = new TestWorldData()
            .set(0, 0, 0, { state: WATER })
            .set(1, 0, 0, { state: WATER }) // same liquid -> EAST culled
            .set(0, 0, 1, { state: GLASS }); // culling -> SOUTH culled
        const h = harness(world, {
            models: new Map([[LIQUID_MODEL_PATH, liquidModel()]]),
            textures: new Map([[STILL, Texture.missing(new Key("test", "block/water_still"))]]),
            properties: new Map([["minecraft:glass", cullingProperties()]]),
        });
        const renderer = new LiquidModelRenderer(h.resourcePack, h.gallery, h.renderSettings);
        h.block.set(0, 0, 0);
        renderer.render(
            h.block,
            new Variant(new ResourcePath<Model>(LIQUID_MODEL_PATH)),
            h.view.initialize(),
            new Color().set(0, 0, 0, 0, true),
        );
        expect(faceCount(h.tileModel)).toBe(8);
    });

    it("uses the still texture on the flat top and down faces, and the flow texture on the sides", () => {
        const { model, stillId, flowId } = renderLiquid(
            new TestWorldData().set(0, 0, 0, { state: WATER }),
        );
        expect(stillId).not.toBe(flowId);
        expect(model.materialIndex[0]).toBe(stillId); // DOWN
        expect(model.materialIndex[2]).toBe(stillId); // UP, not flowing (own height > 0.8)
        expect(model.materialIndex[4]).toBe(flowId); // NORTH
        expect(model.materialIndex[6]).toBe(flowId); // SOUTH
    });

    it("switches the top face to the flow texture once the liquid is actually flowing", () => {
        const world = new TestWorldData()
            .set(0, 0, 0, { state: waterWithLevel(1) })
            .set(-1, 0, 0, { state: WATER });
        const { model, stillId, flowId } = renderLiquid(world);
        expect(stillId).not.toBe(flowId);
        expect(model.materialIndex[2]).toBe(flowId);
    });

    it("renders a waterlogged non-liquid block as water", () => {
        const waterlogged = new BlockState(
            Key.minecraft("oak_fence"),
            new Map([["waterlogged", "true"]]),
        );
        const { model } = renderLiquid(new TestWorldData().set(0, 0, 0, { state: waterlogged }));
        expect(faceCount(model)).toBe(12);
    });

    it("emits a zero colour when the up face is culled", () => {
        const world = new TestWorldData()
            .set(0, 0, 0, { state: WATER })
            .set(0, 1, 0, { state: WATER });
        const { color } = renderLiquid(world);
        expect([color.r, color.g, color.b, color.a]).toEqual([0, 0, 0, 0]);
    });
});

describe("BlockStateModelRenderer", () => {
    it("returns immediately for air, leaving the model untouched", () => {
        const h = harness(new TestWorldData(), {});
        const renderer = new BlockStateModelRenderer(h.resourcePack, h.gallery, h.renderSettings);
        h.block.set(0, 0, 0);
        const color = new Color().set(1, 1, 1, 1, false);
        renderer.render(h.block, h.view, color);

        expect(faceCount(h.tileModel)).toBe(0);
        expect([color.r, color.g, color.b, color.a]).toEqual([0, 0, 0, 0]);
        expect(color.isPremultiplied).toBe(true);
    });

    it("renders a block through its blockstate's variant", () => {
        const world = new TestWorldData().set(0, 0, 0, { state: STONE });
        const h = harness(world, {
            models: stoneModels(),
            textures: stoneTextures(),
            blockStates: new Map([["minecraft:stone", singleVariantState(stoneVariant())]]),
        });
        const renderer = new BlockStateModelRenderer(h.resourcePack, h.gallery, h.renderSettings);
        h.block.set(0, 0, 0);

        const color = new Color();
        renderer.render(h.block, h.view, color);
        expect(faceCount(h.tileModel)).toBe(12);
        expect([color.r, color.g, color.b, color.a]).toEqual([0.5, 0, 0.5, 1]);
    });

    it("overlays a water model on a waterlogged block", () => {
        const waterlogged = new BlockState(
            Key.minecraft("oak_fence"),
            new Map([["waterlogged", "true"]]),
        );
        const world = new TestWorldData().set(0, 0, 0, { state: waterlogged });

        const h = harness(world, {
            models: stoneModels(),
            textures: stoneTextures(),
            blockStates: new Map([
                ["minecraft:oak_fence", singleVariantState(stoneVariant())],
                ["minecraft:water", singleVariantState(stoneVariant())],
            ]),
        });
        const renderer = new BlockStateModelRenderer(h.resourcePack, h.gallery, h.renderSettings);
        h.block.set(0, 0, 0);

        renderer.render(h.block, h.view, new Color());
        // both the block's own model and the water model landed in the tile
        expect(faceCount(h.tileModel)).toBe(24);
    });

    it("does nothing when the resource-pack has no blockstate for the block", () => {
        const world = new TestWorldData().set(0, 0, 0, { state: STONE });
        const h = harness(world, { models: stoneModels(), textures: stoneTextures() });
        const renderer = new BlockStateModelRenderer(h.resourcePack, h.gallery, h.renderSettings);
        h.block.set(0, 0, 0);

        const color = new Color();
        renderer.render(h.block, h.view, color);
        expect(faceCount(h.tileModel)).toBe(0);
        expect(color.a).toBe(0);
    });
});

describe("MissingModelRenderer", () => {
    it("delegates to the default renderer when no type claims the block-state", () => {
        const world = new TestWorldData().set(0, 0, 0, { state: STONE });
        const h = harness(world, { models: stoneModels(), textures: stoneTextures() });
        const renderer = new MissingModelRenderer(h.resourcePack, h.gallery, h.renderSettings);
        h.block.set(0, 0, 0);

        renderer.render(
            h.block,
            stoneVariant(),
            h.view.initialize(),
            new Color().set(0, 0, 0, 0, true),
        );
        // the same 12 triangles ResourceModelRenderer would have produced
        expect(faceCount(h.tileModel)).toBe(12);
    });
});

describe("BlockRendererType", () => {
    it("creates the real renderers for each registered key", () => {
        const h = harness(new TestWorldData(), {});
        expect(
            BlockRendererType.DEFAULT.create(h.resourcePack, h.gallery, h.renderSettings),
        ).toBeInstanceOf(ResourceModelRenderer);
        expect(
            BlockRendererType.LIQUID.create(h.resourcePack, h.gallery, h.renderSettings),
        ).toBeInstanceOf(LiquidModelRenderer);
        expect(
            BlockRendererType.MISSING.create(h.resourcePack, h.gallery, h.renderSettings),
        ).toBeInstanceOf(MissingModelRenderer);
    });

    it("keeps the registry keys and the default isFallbackFor", () => {
        expect(BlockRendererType.REGISTRY.values().map((t) => t.getKey().getFormatted())).toEqual([
            "bluemap:default",
            "bluemap:liquid",
            "bluemap:missing",
        ]);
        expect(BlockRendererType.DEFAULT.isFallbackFor(STONE)).toBe(false);
    });
});

describe("BlockRenderPass", () => {
    it("meshes each column top-down and reports its colour, height and top block-light", () => {
        const world = new TestWorldData()
            .set(0, 0, 0, { state: STONE })
            .set(1, 0, 0, { state: STONE, blockLight: 9 });

        const h = harness(world, {
            models: stoneModels(),
            textures: stoneTextures(),
            blockStates: new Map([["minecraft:stone", singleVariantState(stoneVariant())]]),
        });

        const pass = new BlockRenderPass(h.resourcePack, h.gallery, h.renderSettings);
        const tileModel = new ArrayTileModel(64);
        const view = new TileModelView(tileModel);

        const meta: { x: number; z: number; rgba: number[]; height: number; light: number }[] = [];
        const consumer: TileMetaConsumer = (x, z, color, height, blockLight) => {
            meta.push({ x, z, rgba: [color.r, color.g, color.b, color.a], height, light: blockLight });
        };

        pass.render(
            testWorld(world, 0, 0),
            new Vector3i(0, 0, 0),
            new Vector3i(1, 0, 0),
            new Vector3i(0, 0, 0),
            view,
            consumer,
        );

        expect(meta.map((m) => [m.x, m.z])).toEqual([
            [0, 0],
            [1, 0],
        ]);
        // both columns have exactly one solid block at y = 0
        expect(meta.map((m) => m.height)).toEqual([0, 0]);
        // the second column's block emits light 9; the first emits none
        expect(meta.map((m) => m.light)).toEqual([0, 9]);
        expect(meta[0]!.rgba[3]).toBe(1);

        // two blocks meshed into one model
        expect(faceCount(tileModel)).toBe(24);
        // the second block was translated one step along +x
        expect(facePositions(tileModel, 12)[0]).toBe(1);
    });

    it("reports height 0 and a transparent colour for an empty column", () => {
        const world = new TestWorldData();
        const h = harness(world, {});
        const pass = new BlockRenderPass(h.resourcePack, h.gallery, h.renderSettings);
        const view = new TileModelView(new ArrayTileModel(8));

        let seen: { height: number; alpha: number } | null = null;
        pass.render(
            testWorld(world, 0, 0),
            new Vector3i(0, 0, 0),
            new Vector3i(0, 0, 0),
            new Vector3i(0, 0, 0),
            view,
            (_x, _z, color, height) => {
                seen = { height, alpha: color.a };
            },
        );

        expect(seen).toEqual({ height: 0, alpha: 0 });
    });
});

describe("model element geometry", () => {
    it("applies the element rotation matrix before the 1/16 scale", () => {
        // a 45-degree rotation about Y around the block centre keeps the centre put
        const textureVariable = new TextureVariable(new ResourcePath<Texture>(CUBE_TEXTURE));
        const faces = new Map<Direction, Face>([
            [Direction.UP, new Face(null, textureVariable, null, 0, -1)],
        ]);
        const element = new Element(
            new Vector3f(0, 0, 0),
            new Vector3f(16, 16, 16),
            new Rotation(new Vector3f(8, 8, 8), 0, 45, 0, false),
            faces,
        );
        const model = new Model(new Map<string, TextureVariable>(), [element]);

        const world = new TestWorldData().set(0, 0, 0, { state: STONE });
        const h = harness(world, {
            models: new Map([[CUBE_MODEL_PATH, model]]),
            textures: stoneTextures(),
        });
        const renderer = new ResourceModelRenderer(h.resourcePack, h.gallery, h.renderSettings);
        h.block.set(0, 0, 0);
        renderer.render(
            h.block,
            stoneVariant(),
            h.view.initialize(),
            new Color().set(0, 0, 0, 0, true),
        );

        expect(faceCount(h.tileModel)).toBe(2);
        const positions = facePositions(h.tileModel, 0);
        // the top face stays at y = 1 and its corners move off the axis-aligned unit square
        expect(positions[1]).toBe(1);
        expect(positions[0]).not.toBe(0);
    });
});
