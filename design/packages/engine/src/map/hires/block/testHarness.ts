import { Color, Key, Vector3f, Vector4f } from "@material-bluemap/shared";
import { ResourcePath } from "../../../resources/ResourcePath.js";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import { BlockState as PackBlockState } from "../../../resources/pack/resourcepack/blockstate/BlockState.js";
import { Variant } from "../../../resources/pack/resourcepack/blockstate/Variant.js";
import { VariantSet } from "../../../resources/pack/resourcepack/blockstate/VariantSet.js";
import { Variants } from "../../../resources/pack/resourcepack/blockstate/Variants.js";
import { Element } from "../../../resources/pack/resourcepack/model/Element.js";
import { Face } from "../../../resources/pack/resourcepack/model/Face.js";
import { Model } from "../../../resources/pack/resourcepack/model/Model.js";
import { Rotation } from "../../../resources/pack/resourcepack/model/Rotation.js";
import { TextureVariable } from "../../../resources/pack/resourcepack/model/TextureVariable.js";
import type { Texture } from "../../../resources/pack/resourcepack/texture/Texture.js";
import { Direction } from "../../../util/Direction.js";
import { Tristate } from "../../../util/Tristate.js";
import type { BlockEntity } from "../../../world/BlockEntity.js";
import { BlockProperties } from "../../../world/BlockProperties.js";
import { BlockState } from "../../../world/BlockState.js";
import { Chunk } from "../../../world/Chunk.js";
import { DimensionType } from "../../../world/DimensionType.js";
import type { World } from "../../../world/World.js";
import { LightData } from "../../../world/LightData.js";
import { Biome } from "../../../world/biome/Biome.js";
import type { BlockAccess } from "../../../world/block/BlockAccess.js";
import { BlockNeighborhood } from "../../../world/block/BlockNeighborhood.js";
import { Mask } from "../../mask/Mask.js";
import { TextureGallery } from "../../TextureGallery.js";
import { ArrayTileModel } from "../ArrayTileModel.js";
import type { RenderSettings } from "../RenderSettings.js";
import { TileModelView } from "../TileModelView.js";
import type { BlockColorCalculator } from "./color/BlockColorCalculator.js";

/**
 * A small hand-built world + resource-pack, so the block renderers can be driven without
 * a Minecraft installation. Everything here is a real ported type — the tile model is the
 * real {@link ArrayTileModel}, so the Float32Array rounding the mesher relies on is the
 * rounding the assertions see.
 */

/** one block in the test world */
export interface TestBlock {
    state: BlockState;
    skyLight?: number;
    blockLight?: number;
}

export class TestWorldData {
    private readonly blocks = new Map<string, TestBlock>();

    static key(x: number, y: number, z: number): string {
        return `${x},${y},${z}`;
    }

    set(x: number, y: number, z: number, block: TestBlock): this {
        this.blocks.set(TestWorldData.key(x, y, z), block);
        return this;
    }

    get(x: number, y: number, z: number): TestBlock | undefined {
        return this.blocks.get(TestWorldData.key(x, y, z));
    }
}

export class TestBlockAccess implements BlockAccess {
    private x = 0;
    private y = 0;
    private z = 0;
    private readonly lightData = new LightData(15, 0);

    constructor(private readonly world: TestWorldData) {}

    set(x: number, y: number, z: number): void {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    copy(): BlockAccess {
        const copy = new TestBlockAccess(this.world);
        copy.set(this.x, this.y, this.z);
        return copy;
    }

    getX(): number {
        return this.x;
    }
    getY(): number {
        return this.y;
    }
    getZ(): number {
        return this.z;
    }

    getBlockState(): BlockState {
        return this.world.get(this.x, this.y, this.z)?.state ?? BlockState.AIR;
    }

    getLightData(): LightData {
        const block = this.world.get(this.x, this.y, this.z);
        return this.lightData.set(block?.skyLight ?? 15, block?.blockLight ?? 0);
    }

    getBiome(): Biome {
        return Biome.DEFAULT;
    }

    getBlockEntity(): BlockEntity | null {
        return null;
    }

    hasOceanFloorY(): boolean {
        return false;
    }

    getOceanFloorY(): number {
        return 0;
    }

    getSunLightLevel(): number {
        return this.getLightData().getSkyLight();
    }

    getBlockLightLevel(): number {
        return this.getLightData().getBlockLight();
    }
}

export interface TestRenderSettingsOverrides {
    removeCavesBelowY?: number;
    caveDetectionOceanFloor?: number;
    caveDetectionUsesBlockLight?: boolean;
    ambientLight?: number;
    renderEdges?: boolean;
    edgeLightStrength?: number;
    renderMask?: Mask;
    renderTopOnly?: boolean;
    saveHiresLayer?: boolean;
}

export function testRenderSettings(o: TestRenderSettingsOverrides = {}): RenderSettings {
    return {
        getRemoveCavesBelowY: () => o.removeCavesBelowY ?? -2147483648,
        getCaveDetectionOceanFloor: () => o.caveDetectionOceanFloor ?? 0,
        isCaveDetectionUsesBlockLight: () => o.caveDetectionUsesBlockLight ?? false,
        getAmbientLight: () => o.ambientLight ?? 0,
        isRenderEdges: () => o.renderEdges ?? false,
        getEdgeLightStrength: () => o.edgeLightStrength ?? 15,
        isIgnoreMissingLightData: () => false,
        getRenderMask: () => o.renderMask ?? Mask.ALL,
        isSaveHiresLayer: () => o.saveHiresLayer ?? true,
        isRenderTopOnly: () => o.renderTopOnly ?? false,
    };
}

/** a fixed tint, so a tinted face is distinguishable from an untinted one */
export const TEST_TINT: Color = new Color().set(0.25, 0.5, 0.75, 1, false);

export class TestBlockColorCalculator implements BlockColorCalculator {
    getBlockColor(_block: BlockAccess, _blockState: BlockState, target: Color): Color {
        return target.set(TEST_TINT);
    }
}

export interface TestPackOptions {
    models?: Map<string, Model>;
    textures?: Map<string, Texture>;
    blockStates?: Map<string, PackBlockState>;
    properties?: Map<string, BlockProperties>;
}

/**
 * A stand-in for {@link ResourcePack}: the renderers only reach for `getModels`,
 * `getTextures`, `getBlockState`, `getBlockProperties` and `createBlockColorCalculator`,
 * and building the real pack would need a Minecraft client jar.
 */
export function testResourcePack(options: TestPackOptions = {}): ResourcePack {
    const models = options.models ?? new Map<string, Model>();
    const textures = options.textures ?? new Map<string, Texture>();
    const blockStates = options.blockStates ?? new Map<string, PackBlockState>();
    const properties = options.properties ?? new Map<string, BlockProperties>();

    return {
        getModels: () => ({ get: (key: Key) => models.get(key.getFormatted()) ?? null }),
        getTextures: () => ({ get: (key: Key) => textures.get(key.getFormatted()) ?? null }),
        getBlockState: (state: BlockState) =>
            blockStates.get(state.getId().getFormatted()) ?? null,
        getBlockProperties: (state: BlockState) =>
            properties.get(state.getId().getFormatted()) ?? BlockProperties.DEFAULT,
        createBlockColorCalculator: () => new TestBlockColorCalculator(),
    } as unknown as ResourcePack;
}

export function cullingProperties(): BlockProperties {
    return new BlockProperties(
        Tristate.TRUE,
        Tristate.TRUE,
        Tristate.FALSE,
        Tristate.FALSE,
        Tristate.FALSE,
    );
}

export function occludingOnlyProperties(): BlockProperties {
    return new BlockProperties(
        Tristate.FALSE,
        Tristate.TRUE,
        Tristate.FALSE,
        Tristate.FALSE,
        Tristate.FALSE,
    );
}

/** a full 16^3 cube model with one texture on every face */
export function cubeModel(
    textureKey: string,
    faceOptions: {
        cullface?: boolean;
        tintindex?: number;
        rotation?: number;
        uv?: Vector4f;
        ambientocclusion?: boolean;
    } = {},
): Model {
    const textureVariable = new TextureVariable(new ResourcePath<Texture>(textureKey));
    const faces = new Map<Direction, Face>();
    for (const direction of Direction.values()) {
        faces.set(
            direction,
            new Face(
                faceOptions.uv ?? null,
                textureVariable,
                faceOptions.cullface === false ? null : direction,
                faceOptions.rotation ?? 0,
                faceOptions.tintindex ?? -1,
            ),
        );
    }

    const element = new Element(
        new Vector3f(0, 0, 0),
        new Vector3f(16, 16, 16),
        Rotation.ZERO,
        faces,
    );

    const textureMap = new Map<string, TextureVariable>();
    const model = new Model(textureMap, [element], faceOptions.ambientocclusion ?? true);
    if (faceOptions.ambientocclusion === false) {
        // upstream's (textures, elements, ambientocclusion) constructor drops the flag, so
        // it has to be set the way gson would — through the adapter's field assignment
        (model as unknown as { ambientocclusion: boolean }).ambientocclusion = false;
    }
    return model;
}

/** the resource-pack blockstate that always yields the one given variant */
export function singleVariantState(...variants: Variant[]): PackBlockState {
    return new PackBlockState(new Variants([], new VariantSet(...variants)));
}

/** a {@link Chunk} backed by {@link TestWorldData}, for driving {@link BlockRenderPass} */
export class TestChunk extends Chunk {
    constructor(
        private readonly world: TestWorldData,
        private readonly minY: number,
        private readonly maxY: number,
    ) {
        super();
    }

    override isGenerated(): boolean {
        return true;
    }

    override getBlockState(x: number, y: number, z: number): BlockState {
        return this.world.get(x, y, z)?.state ?? BlockState.AIR;
    }

    override getLightData(x: number, y: number, z: number, target: LightData): LightData {
        const block = this.world.get(x, y, z);
        return target.set(block?.skyLight ?? 15, block?.blockLight ?? 0);
    }

    override getMinY(): number {
        return this.minY;
    }

    override getMaxY(): number {
        return this.maxY;
    }
}

export function testWorld(world: TestWorldData, minY = 0, maxY = 0): World {
    const chunk = new TestChunk(world, minY, maxY);
    return {
        getDimensionType: () => DimensionType.OVERWORLD,
        getChunkAtBlock: () => chunk,
        getChunk: () => chunk,
    } as unknown as World;
}

export interface Harness {
    tileModel: ArrayTileModel;
    view: TileModelView;
    block: BlockNeighborhood;
    gallery: TextureGallery;
    resourcePack: ResourcePack;
    renderSettings: RenderSettings;
}

export function harness(
    world: TestWorldData,
    options: TestPackOptions = {},
    settings: TestRenderSettingsOverrides = {},
): Harness {
    const resourcePack = testResourcePack(options);
    const renderSettings = testRenderSettings(settings);
    const tileModel = new ArrayTileModel(64);
    const gallery = new TextureGallery();

    return {
        tileModel,
        view: new TileModelView(tileModel),
        block: new BlockNeighborhood(
            new TestBlockAccess(world),
            resourcePack,
            renderSettings,
            DimensionType.OVERWORLD,
        ),
        gallery,
        resourcePack,
        renderSettings,
    };
}

/** the three vertices of one face, as flat [x,y,z] triples */
export function facePositions(model: ArrayTileModel, face: number): number[] {
    const index = face * ArrayTileModel.FI_POSITION;
    return Array.from(model.position.subarray(index, index + 9));
}

export function faceUvs(model: ArrayTileModel, face: number): number[] {
    const index = face * 6;
    return Array.from(model.uv.subarray(index, index + 6));
}

export function faceAos(model: ArrayTileModel, face: number): number[] {
    const index = face * 3;
    return Array.from(model.ao.subarray(index, index + 3));
}

export function faceColor(model: ArrayTileModel, face: number): number[] {
    const index = face * ArrayTileModel.FI_COLOR;
    return Array.from(model.color.subarray(index, index + 3));
}
