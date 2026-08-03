import {
    Color,
    MatrixM4f,
    TrigMath,
    VectorM2f,
    VectorM3f,
    type Key,
} from "@material-bluemap/shared";
import type { ResourcePath } from "../../../resources/ResourcePath.js";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { Variant } from "../../../resources/pack/resourcepack/blockstate/Variant.js";
import type { Element } from "../../../resources/pack/resourcepack/model/Element.js";
import type { Model } from "../../../resources/pack/resourcepack/model/Model.js";
import type { Texture } from "../../../resources/pack/resourcepack/texture/Texture.js";
import { Direction } from "../../../util/Direction.js";
import type { BlockNeighborhood } from "../../../world/block/BlockNeighborhood.js";
import type { ExtendedBlock } from "../../../world/block/ExtendedBlock.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { RenderSettings } from "../RenderSettings.js";
import type { TileModelView } from "../TileModelView.js";
import type { BlockRenderer } from "./BlockRenderer.js";
import { BlockColorCalculator } from "./color/BlockColorCalculator.js";

const fr = Math.fround;

/** upstream: {@code private static final float BLOCK_SCALE = 1f / 16f} */
const BLOCK_SCALE = 1 / 16;

const MASK_24 = 0x00ffffffn;

/**
 * upstream: {@code private static float hashToFloat(int x, int z, long seed)}
 *
 * <pre>
 * final long hash = x * 73428767L ^ z * 4382893L ^ seed * 457;
 * return (hash * (hash + 456149) &amp; 0x00ffffff) / (float) 0x01000000;
 * </pre>
 *
 * The same 64-bit shape as {@code blockstate/VariantSet}'s position-PRNG (different
 * constants, and a seed): every `int` operand widens to `long` *before* the multiply, the
 * square wraps on overflow, and only the low 24 bits survive. A `number` implementation is
 * wrong twice over — the products round as doubles and {@code hash * (hash + 456149)} is
 * far above 2^53 — so the arithmetic runs on BigInt with {@link BigInt.asIntN} at every
 * point java would wrap. The final division is exact in both languages (a value below 2^24
 * over a power of two), so the java `float` equals this `number`.
 *
 * Exported (upstream: private) so the port's tests can pin it against the reference jar.
 */
export function hashToFloat(x: number, z: number, seed: bigint): number {
    const hash =
        BigInt.asIntN(64, BigInt(x | 0) * 73428767n) ^
        BigInt.asIntN(64, BigInt(z | 0) * 4382893n) ^
        BigInt.asIntN(64, seed * 457n);
    const product = BigInt.asIntN(64, hash * BigInt.asIntN(64, hash + 456149n));
    return Number(product & MASK_24) / 0x01000000;
}

/**
 * upstream: map/hires/block/ResourceModelRenderer.java
 *
 * This model builder creates a BlockStateModel using the information from parsed
 * resource-pack json files — the heart of the mesher. It walks the chosen variant's model
 * elements, emits each element's six faces with their uvs and rotation, applies the tint
 * from the colour package, computes ambient occlusion and light, culls faces against
 * neighbours, and finally applies the variant's rotation matrix and the random offset.
 *
 * Everything is allocated once in the constructor and reused, exactly as upstream does:
 * this runs once per rendered block.
 */
export class ResourceModelRenderer implements BlockRenderer {
    private readonly modelProvider: (key: Key) => Model | null;
    private readonly textureProvider: (key: Key) => Texture | null;
    private readonly textureGallery: TextureGallery;
    private readonly renderSettings: RenderSettings;
    private readonly blockColorCalculator: BlockColorCalculator;

    private readonly corners: VectorM3f[] = [];
    private readonly rawUvs: VectorM2f[] = [];
    /**
     * upstream: {@code new VectorM2f[4]} — a *reference* array into {@link rawUvs},
     * rotated by the face's uv-rotation. The uv-lock pass below mutates the referenced
     * rawUvs in place, which is safe because they are re-set for every face.
     */
    private readonly uvs: (VectorM2f | undefined)[] = [undefined, undefined, undefined, undefined];
    private readonly tintColor = new Color();
    private readonly mapColor = new Color();

    private block!: BlockNeighborhood;
    private variant!: Variant;
    private modelResource!: Model;
    private blockModel!: TileModelView;
    private blockColor!: Color;
    private blockColorOpacity = 0;

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

        for (let i = 0; i < 8; i++) this.corners.push(new VectorM3f(0, 0, 0));
        for (let i = 0; i < 4; i++) this.rawUvs.push(new VectorM2f(0, 0));
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
        this.blockModel = blockModel;
        this.blockColor = color;
        this.blockColorOpacity = 0;
        this.variant = variant;

        const modelResource = variant.getModel().getResource(this.modelProvider);
        if (modelResource == null) return;
        this.modelResource = modelResource;

        this.tintColor.set(0, 0, 0, -1, true);

        // render model
        const modelStart = blockModel.getStart();

        const elements = modelResource.getElements();
        if (elements != null) {
            for (const element of elements) {
                // upstream iterates `Element[]`; this port's array is `(Element | null)[]`
                // because a json `null` element survives parsing — upstream would NPE, so
                // the same value can not occur in a pack that renders at all
                if (element == null) continue;
                this.buildModelElementResource(element, blockModel.initialize());
            }
        }

        if (color.a > 0) {
            color.flatten().straight();
            color.a = this.blockColorOpacity;
        }

        blockModel.initialize(modelStart);

        // apply model-transform
        if (variant.isTransformed()) blockModel.transform(variant.getTransformMatrix());

        //random offset
        if (block.getProperties().isRandomOffset()) {
            const dx = fr(fr(hashToFloat(block.getX(), block.getZ(), 123984n) - 0.5) * 0.75);
            const dz = fr(fr(hashToFloat(block.getX(), block.getZ(), 345542n) - 0.5) * 0.75);
            blockModel.translate(dx, 0, dz);
        }
    }

    private readonly modelElementTransform = new MatrixM4f();

    /**
     * The {@code blockModel} parameter shadows the field of the same name upstream, and is
     * handed {@code blockModel.initialize()} — the very same view object — so the two are
     * always identical. This port uses the field throughout.
     */
    private buildModelElementResource(element: Element, blockModel: TileModelView): void {
        //create faces
        const from = element.getFrom();
        const to = element.getTo();

        const minX = fr(from.getX()),
            minY = fr(from.getY()),
            minZ = fr(from.getZ()),
            maxX = fr(to.getX()),
            maxY = fr(to.getY()),
            maxZ = fr(to.getZ());

        const c = this.corners;
        c[0]!.x = minX; c[0]!.y = minY; c[0]!.z = minZ;
        c[1]!.x = minX; c[1]!.y = minY; c[1]!.z = maxZ;
        c[2]!.x = maxX; c[2]!.y = minY; c[2]!.z = minZ;
        c[3]!.x = maxX; c[3]!.y = minY; c[3]!.z = maxZ;
        c[4]!.x = minX; c[4]!.y = maxY; c[4]!.z = minZ;
        c[5]!.x = minX; c[5]!.y = maxY; c[5]!.z = maxZ;
        c[6]!.x = maxX; c[6]!.y = maxY; c[6]!.z = minZ;
        c[7]!.x = maxX; c[7]!.y = maxY; c[7]!.z = maxZ;

        const modelStart = blockModel.getStart();
        this.createElementFace(element, Direction.DOWN, c[0]!, c[2]!, c[3]!, c[1]!);
        this.createElementFace(element, Direction.UP, c[5]!, c[7]!, c[6]!, c[4]!);
        this.createElementFace(element, Direction.NORTH, c[2]!, c[0]!, c[4]!, c[6]!);
        this.createElementFace(element, Direction.SOUTH, c[1]!, c[3]!, c[7]!, c[5]!);
        this.createElementFace(element, Direction.WEST, c[0]!, c[1]!, c[5]!, c[4]!);
        this.createElementFace(element, Direction.EAST, c[3]!, c[2]!, c[6]!, c[7]!);
        blockModel.initialize(modelStart);

        //rotate and scale down
        blockModel.transform(
            this.modelElementTransform
                // upstream's Rotation#getMatrix is non-null once init() has run, which
                // every construction path of the ported Rotation does
                .copy(element.getRotation().getMatrix() as MatrixM4f)
                .scale(BLOCK_SCALE, BLOCK_SCALE, BLOCK_SCALE),
        );
    }

    private readonly faceRotationVector = new VectorM3f(0, 0, 0);

    private createElementFace(
        element: Element,
        faceDir: Direction,
        c0: VectorM3f,
        c1: VectorM3f,
        c2: VectorM3f,
        c3: VectorM3f,
    ): void {
        const face = element.getFaces().get(faceDir);
        if (face === undefined) return;

        const faceDirVector = faceDir.toVector();

        // light calculation
        const facedBlockNeighbor = this.getRotationRelativeBlockOf(faceDir);
        const blockLightData = this.block.getLightData();
        const facedLightData = facedBlockNeighbor.getLightData();

        const sunLight = Math.max(blockLightData.getSkyLight(), facedLightData.getSkyLight());
        const blockLight = Math.max(blockLightData.getBlockLight(), facedLightData.getBlockLight());

        // filter out faces that are in a "cave" that should not be rendered
        if (
            this.block.isRemoveIfCave() &&
            (this.renderSettings.isCaveDetectionUsesBlockLight()
                ? Math.max(blockLight, sunLight)
                : sunLight) === 0
        )
            return;

        // calculate faceRotationVector
        this.faceRotationVector.set(faceDirVector);
        this.faceRotationVector.rotateAndScale(element.getRotation().getMatrix() as MatrixM4f);
        this.makeRotationRelative(this.faceRotationVector);

        // face culling
        if (this.renderSettings.isRenderTopOnly() && this.faceRotationVector.y < 0.01) return;
        const cullface = face.getCullface();
        if (cullface != null) {
            const b = this.getRotationRelativeBlockOf(cullface);
            const p = b.getProperties();
            if (p.isCulling()) return;
            if (p.getCullingIdentical() && b.getBlockState().equals(this.block.getBlockState()))
                return;
        }

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

        // ####### texture
        const modelTextures = this.modelResource.getTextures();
        const texturePath: ResourcePath<Texture> | null = face
            .getTexture()
            .getTexturePath((name) => modelTextures.get(name) ?? null);
        const textureId = this.textureGallery.get(texturePath);
        tileModel.setMaterialIndex(face1, textureId);
        tileModel.setMaterialIndex(face2, textureId);

        // ####### UV
        // upstream's Face#getUv is non-null once Element#init has calculated the default
        const uvRaw = face.getUv()!;
        const uvx = fr(fr(uvRaw.getX()) / 16),
            uvy = fr(fr(uvRaw.getY()) / 16),
            uvz = fr(fr(uvRaw.getZ()) / 16),
            uvw = fr(fr(uvRaw.getW()) / 16);

        this.rawUvs[0]!.set(uvx, uvw);
        this.rawUvs[1]!.set(uvz, uvw);
        this.rawUvs[2]!.set(uvz, uvy);
        this.rawUvs[3]!.set(uvx, uvy);

        // face-rotation
        // (`| 0` folds javascript's -0 — which java's int arithmetic can not produce —
        // back onto 0, so a rotation of -360 indexes rawUvs[0] rather than rawUvs[-0])
        let rotationSteps = (Math.floor(face.getRotation() / 90) % 4) | 0;
        if (rotationSteps < 0) rotationSteps += 4;
        for (let i = 0; i < 4; i++) this.uvs[i] = this.rawUvs[(rotationSteps + i) % 4];

        // UV-Lock counter-rotation
        if (this.variant.isUvlock() && this.variant.isTransformed()) {
            const uvRotation = this.uvLockRotation(faceDir);
            const cx = TrigMath.cos(uvRotation),
                cy = TrigMath.sin(uvRotation);
            for (const uv of this.uvs) {
                uv!.translate(-0.5, -0.5);
                uv!.rotate(cx, cy);
                uv!.translate(0.5, 0.5);
            }
        }

        const uv0 = this.uvs[0]!,
            uv1 = this.uvs[1]!,
            uv2 = this.uvs[2]!,
            uv3 = this.uvs[3]!;

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

        // ####### face-tint
        if (face.getTintindex() >= 0) {
            if (this.tintColor.a < 0) {
                BlockColorCalculator.getBlockColor(
                    this.blockColorCalculator,
                    this.block,
                    this.tintColor,
                );
            }

            tileModel.setColor(face1, this.tintColor.r, this.tintColor.g, this.tintColor.b);
            tileModel.setColor(face2, this.tintColor.r, this.tintColor.g, this.tintColor.b);
        } else {
            tileModel.setColor(face1, 1, 1, 1);
            tileModel.setColor(face2, 1, 1, 1);
        }

        // ####### blocklight
        const emissiveBlockLight = Math.max(blockLight, element.getLightEmission());
        tileModel.setBlocklight(face1, emissiveBlockLight);
        tileModel.setBlocklight(face2, emissiveBlockLight);

        // ####### sunlight
        tileModel.setSunlight(face1, sunLight);
        tileModel.setSunlight(face2, sunLight);

        // ######## AO
        let ao0 = 1,
            ao1 = 1,
            ao2 = 1,
            ao3 = 1;
        if (this.modelResource.isAmbientocclusion()) {
            ao0 = this.testAo(c0, faceDir);
            ao1 = this.testAo(c1, faceDir);
            ao2 = this.testAo(c2, faceDir);
            ao3 = this.testAo(c3, faceDir);
        }

        tileModel.setAOs(face1, ao0, ao1, ao2);
        tileModel.setAOs(face2, ao0, ao2, ao3);

        //if is top face set model-color
        const a = this.faceRotationVector.y;
        if (a > 0.01 && texturePath != null) {
            const texture = texturePath.getResource(this.textureProvider);
            if (texture != null) {
                this.mapColor.set(texture.getColorPremultiplied());
                if (this.tintColor.a >= 0) {
                    this.mapColor.multiply(this.tintColor);
                }

                // apply light
                const ambientLight = fr(this.renderSettings.getAmbientLight());
                let combinedLight = Math.max(fr(sunLight / 15), fr(blockLight / 15));
                combinedLight = fr(fr(fr(1 - ambientLight) * combinedLight) + ambientLight);
                this.mapColor.r = fr(this.mapColor.r * combinedLight);
                this.mapColor.g = fr(this.mapColor.g * combinedLight);
                this.mapColor.b = fr(this.mapColor.b * combinedLight);

                if (this.mapColor.a > this.blockColorOpacity)
                    this.blockColorOpacity = this.mapColor.a;

                this.blockColor.add(this.mapColor);
            }
        }
    }

    private readonly rotatedNormal = new VectorM3f(0, 0, 0);
    private readonly rotatedUp = new VectorM3f(0, 0, 0);
    private readonly projectedWorldUp = new VectorM3f(0, 0, 0);

    private uvLockRotation(direction: Direction): number {
        if (!this.variant.isTransformed()) return 0;

        this.makeRotationRelative(this.rotatedNormal.set(direction.toVector()));
        this.makeRotationRelative(this.rotatedUp.set(direction.getLocalUp().toVector()));

        // project world-up (0, 1, 0) onto rotated face
        this.projectedWorldUp.set(0, 1, 0);
        let dot = this.projectedWorldUp.dot(this.rotatedNormal);
        this.projectedWorldUp.set(this.rotatedNormal);
        this.projectedWorldUp.mul(dot);
        this.projectedWorldUp.set(
            fr(0 - this.projectedWorldUp.x),
            fr(1 - this.projectedWorldUp.y),
            fr(0 - this.projectedWorldUp.z),
        );

        // special case, if we are close to up or down, the rotation should be locked to NORTH/SOUTH (localUp)
        if (this.projectedWorldUp.lengthSquared() < 0.01) {
            const upDown = this.rotatedNormal.y > 0 ? Direction.UP : Direction.DOWN;
            this.projectedWorldUp.set(upDown.getLocalUp().toVector());
        } else {
            this.projectedWorldUp.normalize();
        }

        // compute angle between rotatedUp and projectedWorldUp around rotatedNormal
        dot = this.rotatedUp.dot(this.projectedWorldUp);
        // note: `cross` mutates rotatedUp, which upstream relies on (`dot` above was
        // already read from the un-crossed vector)
        return fr(
            TrigMath.atan2(
                this.rotatedUp.cross(this.projectedWorldUp).dot(this.rotatedNormal),
                dot,
            ),
        );
    }

    /**
     * upstream: {@code getRotationRelativeBlock(Direction)}, which delegates through a
     * {@code (Vector3i)} overload. Nothing calls that middle overload with a raw vector,
     * so the two collapse into one here.
     */
    private getRotationRelativeBlockOf(direction: Direction): ExtendedBlock {
        const v = direction.toVector();
        return this.getRotationRelativeBlock(v.getX(), v.getY(), v.getZ());
    }

    private readonly rotationRelativeBlockDirection = new VectorM3f(0, 0, 0);

    private getRotationRelativeBlock(dx: number, dy: number, dz: number): ExtendedBlock {
        this.rotationRelativeBlockDirection.set(dx, dy, dz);
        this.makeRotationRelative(this.rotationRelativeBlockDirection);

        return this.block.getNeighborBlock(
            // java's Math.round(float) -> int; `| 0` maps javascript's -0 back onto 0
            Math.round(this.rotationRelativeBlockDirection.x) | 0,
            Math.round(this.rotationRelativeBlockDirection.y) | 0,
            Math.round(this.rotationRelativeBlockDirection.z) | 0,
        );
    }

    private makeRotationRelative(direction: VectorM3f): void {
        if (this.variant.isTransformed()) direction.rotateAndScale(this.variant.getTransformMatrix());
    }

    private testAo(vertex: VectorM3f, dir: Direction): number {
        const dirVec = dir.toVector();
        let occluding = 0;

        let x = 0;
        if (vertex.x === 16) {
            x = 1;
        } else if (vertex.x === 0) {
            x = -1;
        }

        let y = 0;
        if (vertex.y === 16) {
            y = 1;
        } else if (vertex.y === 0) {
            y = -1;
        }

        let z = 0;
        if (vertex.z === 16) {
            z = 1;
        } else if (vertex.z === 0) {
            z = -1;
        }

        if (x * dirVec.getX() + y * dirVec.getY() > 0) {
            if (this.getRotationRelativeBlock(x, y, 0).getProperties().isOccluding()) occluding++;
        }

        if (x * dirVec.getX() + z * dirVec.getZ() > 0) {
            if (this.getRotationRelativeBlock(x, 0, z).getProperties().isOccluding()) occluding++;
        }

        if (y * dirVec.getY() + z * dirVec.getZ() > 0) {
            if (this.getRotationRelativeBlock(0, y, z).getProperties().isOccluding()) occluding++;
        }

        if (x * dirVec.getX() + y * dirVec.getY() + z * dirVec.getZ() > 0) {
            if (this.getRotationRelativeBlock(x, y, z).getProperties().isOccluding()) occluding++;
        }

        if (occluding > 3) occluding = 3;
        return Math.max(0, Math.min(fr(1 - fr(occluding * 0.25)), 1));
    }
}
