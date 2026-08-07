import { describe, expect, it } from "vitest";
import { Color, Key, Vector2d, Vector3d, Vector3f } from "@worldlens/shared";
import { ResourcePath } from "../../../resources/ResourcePath.js";
import type { JsonValue } from "../../../resources/adapter/JsonMapper.js";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import { EntityState } from "../../../resources/pack/resourcepack/entitystate/EntityState.js";
import { Part } from "../../../resources/pack/resourcepack/entitystate/Part.js";
import { Model } from "../../../resources/pack/resourcepack/model/Model.js";
import type { Texture } from "../../../resources/pack/resourcepack/texture/Texture.js";
import { LightData } from "../../../world/LightData.js";
import type { Entity } from "../../../world/Entity.js";
import type { BlockNeighborhood } from "../../../world/block/BlockNeighborhood.js";
import { Mask } from "../../mask/Mask.js";
import { TextureGallery } from "../../TextureGallery.js";
import { ArrayTileModel } from "../ArrayTileModel.js";
import type { RenderSettings } from "../RenderSettings.js";
import { TileModelView } from "../TileModelView.js";
import { EntityModelRenderer } from "./EntityModelRenderer.js";
import { EntityRendererType } from "./EntityRendererType.js";
import { MissingModelRenderer } from "./MissingModelRenderer.js";
import { ResourceModelRenderer, TintColorProvider } from "./ResourceModelRenderer.js";

const MODEL_KEY = new ResourcePath<Model>("test", "entity/thing");

/** one full cube with a down- and an up-face; the down-face is tinted */
const MODEL = Model.Adapter.read({
    textures: { side: "test:entity/skin" },
    elements: [
        {
            from: [0, 0, 0],
            to: [16, 16, 16],
            light_emission: 5,
            faces: {
                down: { texture: "#side", tintindex: 0 },
                up: { texture: "#side" },
            },
        },
    ],
} as unknown as JsonValue);

function renderSettings(caveDetectionUsesBlockLight = false): RenderSettings {
    return {
        getRemoveCavesBelowY: () => -64,
        getCaveDetectionOceanFloor: () => -5,
        isCaveDetectionUsesBlockLight: () => caveDetectionUsesBlockLight,
        getAmbientLight: () => 0,
        isRenderEdges: () => true,
        getEdgeLightStrength: () => 15,
        isIgnoreMissingLightData: () => false,
        getRenderMask: () => Mask.ALL,
        isSaveHiresLayer: () => true,
        isRenderTopOnly: () => false,
    };
}

function resourcePack(entityStates: Map<string, EntityState> = new Map()): ResourcePack {
    return {
        getModels: () => ({ get: (key: Key) => (key.getFormatted() === MODEL_KEY.getFormatted() ? MODEL : null) }),
        getTextures: () => ({ get: () => null as Texture | null }),
        getEntityStates: () => ({
            get: (key: Key) => entityStates.get(key.getFormatted()) ?? null,
        }),
    } as unknown as ResourcePack;
}

function block(skyLight: number, blockLight: number, removeIfCave = false): BlockNeighborhood {
    return {
        getLightData: () => new LightData(skyLight, blockLight),
        isRemoveIfCave: () => removeIfCave,
    } as unknown as BlockNeighborhood;
}

function entity(id: string, rotation = new Vector2d(0, 0)): Entity {
    return {
        getId: () => Key.parse(id, Key.MINECRAFT_NAMESPACE),
        getPos: () => new Vector3d(0, 0, 0),
        getRotation: () => rotation,
    } as unknown as Entity;
}

function positionsOf(model: ArrayTileModel, face: number): number[] {
    return [...model.position.subarray(face * 9, face * 9 + 9)];
}

describe("EntityRendererType", () => {
    it("builds the real renderers its keys name", () => {
        const pack = resourcePack();
        const gallery = new TextureGallery();
        const settings = renderSettings();

        expect(EntityRendererType.DEFAULT.create(pack, gallery, settings)).toBeInstanceOf(
            ResourceModelRenderer,
        );
        expect(EntityRendererType.MISSING.create(pack, gallery, settings)).toBeInstanceOf(
            MissingModelRenderer,
        );
    });

    it("is registered under its bluemap keys and claims no entity as a fallback", () => {
        expect(EntityRendererType.REGISTRY.get(Key.bluemap("default"))).toBe(
            EntityRendererType.DEFAULT,
        );
        expect(EntityRendererType.REGISTRY.get(Key.bluemap("missing"))).toBe(
            EntityRendererType.MISSING,
        );
        expect(EntityRendererType.DEFAULT.isFallbackFor(Key.minecraft("pig"))).toBe(false);
        expect(EntityRendererType.MISSING.isFallbackFor(Key.minecraft("pig"))).toBe(false);
    });
});

describe("ResourceModelRenderer (entity)", () => {
    function renderPart(
        options: {
            skyLight?: number;
            blockLight?: number;
            removeIfCave?: boolean;
            caveDetectionUsesBlockLight?: boolean;
            position?: Vector3f;
        } = {},
    ): ArrayTileModel {
        const tileModel = new ArrayTileModel(16);
        const view = new TileModelView(tileModel);
        const renderer = new ResourceModelRenderer(
            resourcePack(),
            new TextureGallery(),
            renderSettings(options.caveDetectionUsesBlockLight ?? false),
        );

        const part =
            options.position === undefined
                ? new Part(MODEL_KEY)
                : new Part(MODEL_KEY, options.position, Vector3f.ZERO);

        renderer.render(
            entity("minecraft:pig"),
            block(options.skyLight ?? 15, options.blockLight ?? 7, options.removeIfCave ?? false),
            part,
            view.initialize(),
        );

        return tileModel;
    }

    it("emits two triangles per model-face, scaled down by 16", () => {
        const model = renderPart();

        // one element with two faces -> 2 * 2 triangles
        expect(model.size()).toBe(4);

        // DOWN is emitted first: c0=(0,0,0) c1=(16,0,0) c2=(16,0,16), scaled by 1/16
        expect(positionsOf(model, 0)).toEqual([0, 0, 0, 1, 0, 0, 1, 0, 1]);
        expect(positionsOf(model, 1)).toEqual([0, 0, 0, 1, 0, 1, 0, 0, 1]);
    });

    it("takes sunlight from the block and blocklight from the brighter of block and element", () => {
        const model = renderPart({ skyLight: 12, blockLight: 3 });

        for (let face = 0; face < model.size(); face++) {
            expect(model.sunlight[face]).toBe(12);
            // the element declares light_emission 5, which beats the block's 3
            expect(model.blocklight[face]).toBe(5);
        }

        const brighter = renderPart({ skyLight: 12, blockLight: 9 });
        expect(brighter.blocklight[0]).toBe(9);
    });

    it("renders entity faces unshaded and untinted", () => {
        const model = renderPart();
        for (let face = 0; face < model.size(); face++) {
            expect([...model.ao.subarray(face * 3, face * 3 + 3)]).toEqual([1, 1, 1]);
            // the tinted down-face gets NO_TINT's white, same as the untinted up-face
            expect([...model.color.subarray(face * 3, face * 3 + 3)]).toEqual([1, 1, 1]);
        }
    });

    it("resolves every face to the same texture ordinal", () => {
        const model = renderPart();
        for (let face = 0; face < model.size(); face++) {
            // nothing is registered in the gallery, so everything falls back to ordinal 0
            expect(model.materialIndex[face]).toBe(0);
        }
    });

    it("uses the element's calculated default uvs", () => {
        const model = renderPart();
        // DOWN's default uv is (from.x, 16 - to.z, to.x, 16 - from.z) = (0, 0, 16, 16),
        // divided by 16 -> (0, 0, 1, 1); rawUvs are (x,w) (z,w) (z,y) (x,y)
        expect([...model.uv.subarray(0, 6)]).toEqual([0, 1, 1, 1, 1, 0]);
    });

    it("skips an entity in an unlit cave", () => {
        expect(renderPart({ skyLight: 0, blockLight: 0, removeIfCave: true }).size()).toBe(0);
        // still rendered while the sun reaches it
        expect(renderPart({ skyLight: 1, blockLight: 0, removeIfCave: true }).size()).toBe(4);
        // with block-light detection on, a torch is enough to keep it
        expect(
            renderPart({
                skyLight: 0,
                blockLight: 6,
                removeIfCave: true,
                caveDetectionUsesBlockLight: true,
            }).size(),
        ).toBe(4);
        // ... but not when the setting is off
        expect(
            renderPart({ skyLight: 0, blockLight: 6, removeIfCave: true }).size(),
        ).toBe(0);
    });

    it("applies the part's own transform", () => {
        const model = renderPart({ position: new Vector3f(2, 3, 4) });
        expect(positionsOf(model, 0)).toEqual([2, 3, 4, 3, 3, 4, 3, 3, 5]);
    });

    it("honours a tint-provider through the model-level entry point", () => {
        const tileModel = new ArrayTileModel(16);
        const view = new TileModelView(tileModel);
        const renderer = new ResourceModelRenderer(
            resourcePack(),
            new TextureGallery(),
            renderSettings(),
        );

        const tint: TintColorProvider = {
            setTintColor(tintIndex: number, target: Color): void {
                expect(tintIndex).toBe(0);
                target.set(0.25, 0.5, 0.75, 1, true);
            },
        };
        renderer.renderModel(entity("minecraft:pig"), block(15, 0), MODEL, tint, view.initialize());

        // faces 0/1 are the tinted DOWN face, 2/3 the untinted UP face
        expect([...tileModel.color.subarray(0, 3)]).toEqual([0.25, 0.5, 0.75]);
        expect([...tileModel.color.subarray(6, 9)]).toEqual([1, 1, 1]);
    });
});

describe("EntityModelRenderer", () => {
    function entityStates(json: unknown): Map<string, EntityState> {
        return new Map([["minecraft:pig", EntityState.Adapter.read(json as JsonValue)]]);
    }

    it("renders nothing for an entity the resource pack does not know", () => {
        const tileModel = new ArrayTileModel(16);
        const view = new TileModelView(tileModel);
        new EntityModelRenderer(resourcePack(), new TextureGallery(), renderSettings()).render(
            entity("minecraft:pig"),
            block(15, 0),
            view.initialize(),
        );
        expect(tileModel.size()).toBe(0);
    });

    it("renders nothing for an entity-state without parts", () => {
        const tileModel = new ArrayTileModel(16);
        const view = new TileModelView(tileModel);
        new EntityModelRenderer(
            resourcePack(entityStates({ parts: [] })),
            new TextureGallery(),
            renderSettings(),
        ).render(entity("minecraft:pig"), block(15, 0), view.initialize());
        expect(tileModel.size()).toBe(0);
    });

    it("renders every part of the entity-state", () => {
        const tileModel = new ArrayTileModel(32);
        const view = new TileModelView(tileModel);
        new EntityModelRenderer(
            resourcePack(
                entityStates({
                    parts: [
                        { model: "test:entity/thing" },
                        { model: "test:entity/thing", position: [0, 8, 0] },
                    ],
                }),
            ),
            new TextureGallery(),
            renderSettings(),
        ).render(entity("minecraft:pig"), block(15, 0), view.initialize());

        // two parts, one element each, two faces each, two triangles per face
        expect(tileModel.size()).toBe(8);
        // the second part sits 8 blocks up
        expect(positionsOf(tileModel, 4)).toEqual([0, 8, 0, 1, 8, 0, 1, 8, 1]);
    });

    /**
     * upstream: {@code tileModel.rotateYXZ(entity.getRotation().getY(),
     * entity.getRotation().getX(), 0f)} — the rotation's **y** component is the pitch
     * (the rotation about x) and its **x** component is the yaw. Getting that pair the
     * wrong way round tips every entity onto its side, so it is pinned here.
     */
    function renderRotated(rotation: Vector2d): number[] {
        const tileModel = new ArrayTileModel(16);
        const view = new TileModelView(tileModel);
        new EntityModelRenderer(
            resourcePack(entityStates({ parts: [{ model: "test:entity/thing" }] })),
            new TextureGallery(),
            renderSettings(),
        ).render(entity("minecraft:pig", rotation), block(15, 0), view.initialize());
        return positionsOf(tileModel, 0);
    }

    it("pitches the finished model by the rotation's y component", () => {
        // 180 degrees about x: the corner at (1, 0, 1) lands at (1, 0, -1)
        const positions = renderRotated(new Vector2d(0, 180));
        expect(positions[6]).toBeCloseTo(1, 5);
        expect(positions[7]).toBeCloseTo(0, 5);
        expect(positions[8]).toBeCloseTo(-1, 5);
    });

    it("yaws the finished model by the rotation's x component", () => {
        // 180 degrees about y: the corner at (1, 0, 1) lands at (-1, 0, -1)
        const positions = renderRotated(new Vector2d(180, 0));
        expect(positions[6]).toBeCloseTo(-1, 5);
        expect(positions[7]).toBeCloseTo(0, 5);
        expect(positions[8]).toBeCloseTo(-1, 5);
    });
});

describe("MissingModelRenderer", () => {
    it("falls back to the default renderer for an entity nothing claims", () => {
        const tileModel = new ArrayTileModel(16);
        const view = new TileModelView(tileModel);
        const renderer = new MissingModelRenderer(
            resourcePack(),
            new TextureGallery(),
            renderSettings(),
        );

        renderer.render(
            entity("minecraft:pig"),
            block(15, 0),
            new Part(MODEL_KEY),
            view.initialize(),
        );

        // the default renderer is ResourceModelRenderer, which draws the part's model
        expect(tileModel.size()).toBe(4);
    });
});
