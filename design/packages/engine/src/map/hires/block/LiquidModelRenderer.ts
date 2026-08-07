import {
    Color,
    MatrixM3f,
    TrigMath,
    VectorM2f,
    VectorM3f,
    type Key,
} from "@worldlens/shared";
import type { ResourcePath } from "../../../resources/ResourcePath.js";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { Variant } from "../../../resources/pack/resourcepack/blockstate/Variant.js";
import type { Model } from "../../../resources/pack/resourcepack/model/Model.js";
import type { Texture } from "../../../resources/pack/resourcepack/texture/Texture.js";
import { Direction } from "../../../util/Direction.js";
import { BlockState } from "../../../world/BlockState.js";
import type { BlockNeighborhood } from "../../../world/block/BlockNeighborhood.js";
import type { ExtendedBlock } from "../../../world/block/ExtendedBlock.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { RenderSettings } from "../RenderSettings.js";
import type { TileModelView } from "../TileModelView.js";
import type { BlockRenderer } from "./BlockRenderer.js";
import type { BlockColorCalculator } from "./color/BlockColorCalculator.js";

const fr = Math.fround;

/** upstream: {@code private static final float BLOCK_SCALE = 1f / 16f} */
const BLOCK_SCALE = 1 / 16;

/**
 * upstream: {@code private static final MatrixM3f FLOWING_UV_SCALE} — the still→flow uv
 * halving applied to every side face (and to the up-face when it is not flowing).
 */
const FLOWING_UV_SCALE: MatrixM3f = new MatrixM3f()
    .identity()
    .translate(-0.5, -0.5)
    .scale(0.5, 0.5, 1)
    .translate(0.5, 0.5);

/**
 * upstream: map/hires/block/LiquidModelRenderer.java
 *
 * A model builder for all liquid blocks. Its two departures from
 * {@code ResourceModelRenderer} are the ones that show up visually: the corner heights of
 * a flowing liquid are averaged from the neighbours (rather than read from a model), and
 * the culling rule is "same liquid, or a culling neighbour on any face except UP".
 */
export class LiquidModelRenderer implements BlockRenderer {
    private readonly modelProvider: (key: Key) => Model | null;
    private readonly textureProvider: (key: Key) => Texture | null;
    private readonly textureGallery: TextureGallery;
    private readonly renderSettings: RenderSettings;
    private readonly blockColorCalculator: BlockColorCalculator;

    private readonly corners: VectorM3f[];
    private readonly uvs: VectorM2f[] = [];

    private block!: BlockNeighborhood;
    private blockState!: BlockState;
    private modelResource!: Model;
    private blockModel!: TileModelView;
    private blockColor!: Color;

    constructor(
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
    ) {
        this.modelProvider = (key) => resourcePack.getModels().get(key);
        this.textureProvider = (key) => resourcePack.getTextures().get(key);
        this.textureGallery = textureGallery;
        this.renderSettings = renderSettings;
        this.blockColorCalculator = resourcePack.createBlockColorCalculator();

        this.corners = [
            new VectorM3f(0, 0, 0),
            new VectorM3f(0, 0, 16),
            new VectorM3f(16, 0, 0),
            new VectorM3f(16, 0, 16),
            new VectorM3f(0, 16, 0),
            new VectorM3f(0, 16, 16),
            new VectorM3f(16, 16, 0),
            new VectorM3f(16, 16, 16),
        ];

        for (let i = 0; i < 4; i++) this.uvs.push(new VectorM2f(0, 0));
    }

    getModelProvider(): (key: Key) => Model | null {
        return this.modelProvider;
    }

    getTextureProvider(): (key: Key) => Texture | null {
        return this.textureProvider;
    }

    getTextureGallery(): TextureGallery {
        return this.textureGallery;
    }

    getRenderSettings(): RenderSettings {
        return this.renderSettings;
    }

    getBlockColorCalculator(): BlockColorCalculator {
        return this.blockColorCalculator;
    }

    render(
        block: BlockNeighborhood,
        variant: Variant,
        blockModel: TileModelView,
        color: Color,
    ): void {
        this.block = block;
        this.blockState = block.getBlockState();
        const modelResource = variant.getModel().getResource(this.modelProvider);
        this.blockModel = blockModel;
        this.blockColor = color;

        if (modelResource == null) return;
        this.modelResource = modelResource;

        // for waterlogged blocks, pretend it's just water
        if (this.blockState.isWaterlogged() || block.getProperties().isAlwaysWaterlogged())
            this.blockState = BlockState.WATER;

        this.build();
    }

    private readonly tintcolor = new Color();

    private build(): void {
        const blockLight = this.block.getBlockLightLevel();
        const sunLight = this.block.getSunLightLevel();

        // filter out blocks that are in a "cave" that should not be rendered
        if (
            this.block.isRemoveIfCave() &&
            (this.renderSettings.isCaveDetectionUsesBlockLight()
                ? Math.max(blockLight, sunLight)
                : sunLight) === 0
        )
            return;

        const c = this.corners;

        const level = this.blockState.getLiquidLevel();
        if (level < 8 && !(level === 0 && this.isSameLiquid(this.block.getNeighborBlock(0, 1, 0)))) {
            c[4]!.y = this.getLiquidCornerHeight(-1, -1);
            c[5]!.y = this.getLiquidCornerHeight(-1, 0);
            c[6]!.y = this.getLiquidCornerHeight(0, -1);
            c[7]!.y = this.getLiquidCornerHeight(0, 0);
        } else {
            c[4]!.y = 16;
            c[5]!.y = 16;
            c[6]!.y = 16;
            c[7]!.y = 16;
        }

        const modelTextures = this.modelResource.getTextures();
        const stillVariable = modelTextures.get("still");
        const flowVariable = modelTextures.get("flow");
        const stillTexturePath: ResourcePath<Texture> | null =
            stillVariable === undefined
                ? null
                : stillVariable.getTexturePath((name) => modelTextures.get(name) ?? null);
        const flowTexturePath: ResourcePath<Texture> | null =
            flowVariable === undefined
                ? null
                : flowVariable.getTexturePath((name) => modelTextures.get(name) ?? null);

        const stillTextureId = this.textureGallery.get(stillTexturePath);
        const flowTextureId = this.textureGallery.get(flowTexturePath);

        this.blockColorCalculator.getBlockColor(this.block, this.blockState, this.tintcolor);

        const modelStart = this.blockModel.getStart();

        this.createElementFace(Direction.DOWN, c[0]!, c[2]!, c[3]!, c[1]!, this.tintcolor, stillTextureId, flowTextureId);
        const upFaceRendered =
            this.createElementFace(Direction.UP, c[5]!, c[7]!, c[6]!, c[4]!, this.tintcolor, stillTextureId, flowTextureId);
        this.createElementFace(Direction.NORTH, c[2]!, c[0]!, c[4]!, c[6]!, this.tintcolor, stillTextureId, flowTextureId);
        this.createElementFace(Direction.SOUTH, c[1]!, c[3]!, c[7]!, c[5]!, this.tintcolor, stillTextureId, flowTextureId);
        this.createElementFace(Direction.WEST, c[0]!, c[1]!, c[5]!, c[4]!, this.tintcolor, stillTextureId, flowTextureId);
        this.createElementFace(Direction.EAST, c[3]!, c[2]!, c[6]!, c[7]!, this.tintcolor, stillTextureId, flowTextureId);

        this.blockModel.initialize(modelStart);

        //scale down
        this.blockModel.scale(BLOCK_SCALE, BLOCK_SCALE, BLOCK_SCALE);

        //calculate mapcolor
        if (upFaceRendered) {
            const stillTexture =
                stillTexturePath == null ? null : stillTexturePath.getResource(this.textureProvider);

            if (stillTexture != null) {
                this.blockColor.set(stillTexture.getColorPremultiplied());
                this.blockColor.multiply(this.tintcolor);

                // apply light
                const ambientLight = fr(this.renderSettings.getAmbientLight());
                let combinedLight = fr(Math.max(sunLight, blockLight) / 15);
                combinedLight = fr(fr(ambientLight + combinedLight) / fr(ambientLight + 1));
                this.blockColor.r = fr(this.blockColor.r * combinedLight);
                this.blockColor.g = fr(this.blockColor.g * combinedLight);
                this.blockColor.b = fr(this.blockColor.b * combinedLight);
            }
        } else {
            this.blockColor.set(0, 0, 0, 0, true);
        }
    }

    private getLiquidCornerHeight(x: number, z: number): number {
        let ix: number, iz: number;

        for (ix = x; ix <= x + 1; ix++) {
            for (iz = z; iz <= z + 1; iz++) {
                if (this.isSameLiquid(this.block.getNeighborBlock(ix, 1, iz))) {
                    return 16;
                }
            }
        }

        let sumHeight = 0;
        let count = 0;
        let neighbor: ExtendedBlock;
        let neighborBlockState: BlockState;

        for (ix = x; ix <= x + 1; ix++) {
            for (iz = z; iz <= z + 1; iz++) {
                neighbor = this.block.getNeighborBlock(ix, 0, iz);
                neighborBlockState = neighbor.getBlockState();
                if (this.isSameLiquid(neighbor)) {
                    if (neighborBlockState.getLiquidLevel() === 0) return 14;

                    sumHeight = fr(sumHeight + this.getLiquidBaseHeight(neighborBlockState));
                    count++;
                } else if (!LiquidModelRenderer.isLiquidBlockingBlock(neighborBlockState)) {
                    count++;
                }
            }
        }

        //should both never happen
        if (sumHeight === 0) return 3;
        if (count === 0) return 3;

        return fr(sumHeight / count);
    }

    private static isLiquidBlockingBlock(blockState: BlockState): boolean {
        return !blockState.isAir();
    }

    private isSameLiquid(block: ExtendedBlock): boolean {
        const blockState = block.getBlockState();

        if (this.blockState.isWater())
            return (
                blockState.isWater() ||
                blockState.isWaterlogged() ||
                block.getProperties().isAlwaysWaterlogged()
            );

        return blockState.getId().equals(this.blockState.getId());
    }

    private getLiquidBaseHeight(block: BlockState): number {
        const level = block.getLiquidLevel();
        return level >= 8 ? 16 : fr(14 - fr(level * 1.9));
    }

    private readonly uvTransform = new MatrixM3f();

    private createElementFace(
        faceDir: Direction,
        c0: VectorM3f,
        c1: VectorM3f,
        c2: VectorM3f,
        c3: VectorM3f,
        color: Color,
        stillTextureId: number,
        flowTextureId: number,
    ): boolean {
        const faceDirVector = faceDir.toVector();

        //face culling
        const bl = this.block.getNeighborBlock(
            faceDirVector.getX(),
            faceDirVector.getY(),
            faceDirVector.getZ(),
        );

        if (this.isSameLiquid(bl) || (faceDir !== Direction.UP && bl.getProperties().isCulling()))
            return false;

        // initialize the faces
        this.blockModel.initialize();
        this.blockModel.add(2);

        const tileModel = this.blockModel.getTileModel();
        const face1 = this.blockModel.getStart();
        const face2 = face1 + 1;

        // ####### positions
        tileModel.setPositions(face1,
            c0.x, c0.y, c0.z,
            c1.x, c1.y, c1.z,
            c2.x, c2.y, c2.z,
        );
        tileModel.setPositions(face2,
            c0.x, c0.y, c0.z,
            c2.x, c2.y, c2.z,
            c3.x, c3.y, c3.z,
        );

        //UV
        const uv0 = this.uvs[0]!,
            uv1 = this.uvs[1]!,
            uv2 = this.uvs[2]!,
            uv3 = this.uvs[3]!;
        uv0.set(0, 1);
        uv1.set(1, 1);
        uv2.set(1, 0);
        uv3.set(0, 0);

        // still/flow ?
        let flow = false;
        if (faceDir === Direction.UP) {
            const flowAngle = this.getFlowingAngle();
            if (flowAngle !== -1) {
                flow = true;
                this.uvTransform
                    .identity()
                    .translate(-0.5, -0.5)
                    .scale(0.5, 0.5, 1)
                    .rotate(-flowAngle, 0, 0, 1)
                    .translate(0.5, 0.5);

                uv0.transform(this.uvTransform);
                uv1.transform(this.uvTransform);
                uv2.transform(this.uvTransform);
                uv3.transform(this.uvTransform);
            }
        } else if (faceDir !== Direction.DOWN) {
            flow = true;

            uv0.transform(FLOWING_UV_SCALE);
            uv1.transform(FLOWING_UV_SCALE);
            uv2.transform(FLOWING_UV_SCALE);
            uv3.transform(FLOWING_UV_SCALE);
        }

        tileModel.setUvs(face1,
            uv0.x, uv0.y,
            uv1.x, uv1.y,
            uv2.x, uv2.y,
        );

        tileModel.setUvs(face2,
            uv0.x, uv0.y,
            uv2.x, uv2.y,
            uv3.x, uv3.y,
        );

        // texture index
        tileModel.setMaterialIndex(face1, flow ? flowTextureId : stillTextureId);
        tileModel.setMaterialIndex(face2, flow ? flowTextureId : stillTextureId);

        // color
        tileModel.setColor(face1, color.r, color.g, color.b);
        tileModel.setColor(face2, color.r, color.g, color.b);

        //ao
        tileModel.setAOs(face1, 1, 1, 1);
        tileModel.setAOs(face2, 1, 1, 1);

        // light
        let blockLight: number, sunLight: number;
        if (faceDir === Direction.UP) {
            blockLight = this.block.getBlockLightLevel();
            sunLight = this.block.getSunLightLevel();
        } else {
            blockLight = bl.getBlockLightLevel();
            sunLight = bl.getSunLightLevel();
        }

        tileModel.setBlocklight(face1, blockLight);
        tileModel.setBlocklight(face2, blockLight);

        tileModel.setSunlight(face1, sunLight);
        tileModel.setSunlight(face2, sunLight);

        return true;
    }

    private readonly flowingVector = new VectorM2f(0, 0);

    private getFlowingAngle(): number {
        const own = fr(this.getLiquidBaseHeight(this.blockState) * BLOCK_SCALE);
        if (own > 0.8) return -1;

        this.flowingVector.set(0, 0);

        this.flowingVector.x = fr(this.flowingVector.x + this.compareLiquidHeights(own, -1, 0));
        this.flowingVector.x = fr(this.flowingVector.x - this.compareLiquidHeights(own, 1, 0));

        this.flowingVector.y = fr(this.flowingVector.y - this.compareLiquidHeights(own, 0, -1));
        this.flowingVector.y = fr(this.flowingVector.y + this.compareLiquidHeights(own, 0, 1));

        if (this.flowingVector.x === 0 && this.flowingVector.y === 0) return -1; // not flowing

        // `angleTo` returns a float and RAD_TO_DEG is a double, so the product is a double
        // and the cast truncates it — a boundary this is sensitive to, which is why
        // VectorM2f#angleTo goes through TrigMath#acos rather than Math.acos
        const angle = Math.trunc(this.flowingVector.angleTo(0, -1) * TrigMath.RAD_TO_DEG);
        // `| 0` folds javascript's -0 (from negating a zero angle) onto the int 0 java
        // would have produced
        return this.flowingVector.x < 0 ? angle : -angle | 0;
    }

    private compareLiquidHeights(ownHeight: number, dx: number, dz: number): number {
        const neighbor = this.block.getNeighborBlock(dx, 0, dz);
        if (neighbor.getBlockState().isAir()) return 0;
        if (!this.isSameLiquid(neighbor)) return 0;

        const otherHeight = fr(this.getLiquidBaseHeight(neighbor.getBlockState()) * BLOCK_SCALE);
        return fr(otherHeight - ownHeight);
    }
}
