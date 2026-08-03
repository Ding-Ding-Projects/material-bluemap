import { Color, MatrixM4f, VectorM2f, VectorM3f, type Key } from "@material-bluemap/shared";
import type { ResourcePath } from "../../../resources/ResourcePath.js";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { Part } from "../../../resources/pack/resourcepack/entitystate/Part.js";
import type { Element } from "../../../resources/pack/resourcepack/model/Element.js";
import type { Model } from "../../../resources/pack/resourcepack/model/Model.js";
import type { Texture } from "../../../resources/pack/resourcepack/texture/Texture.js";
import { Direction } from "../../../util/Direction.js";
import type { Entity } from "../../../world/Entity.js";
import type { BlockNeighborhood } from "../../../world/block/BlockNeighborhood.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { RenderSettings } from "../RenderSettings.js";
import type { TileModelView } from "../TileModelView.js";
import type { EntityRenderer } from "./EntityRenderer.js";

const fr = Math.fround;

/** upstream: {@code private static final float SCALE = 1f / 16f} */
const SCALE = 1 / 16;

/** upstream: ResourceModelRenderer.TintColorProvider (a nested {@code @FunctionalInterface}) */
export interface TintColorProvider {
    setTintColor(tintIndex: number, target: Color): void;
}

export const TintColorProvider = {
    /** upstream: {@code TintColorProvider NO_TINT = (index, color) -> color.set(1f, 1f, 1f, 1f, true)} */
    NO_TINT: {
        setTintColor(_tintIndex: number, target: Color): void {
            target.set(1, 1, 1, 1, true);
        },
    } as TintColorProvider,
};

/**
 * upstream: map/hires/entity/ResourceModelRenderer.java
 *
 * This model builder creates a BlockStateModel using the information from parsed
 * resource-pack json files.
 *
 * It is the entity twin of `map/hires/block/ResourceModelRenderer` (upstream marks the pair
 * {@code @SuppressWarnings("DuplicatedCode")}): no neighbour-culling, no ambient occlusion
 * and no uv-lock, and its light comes from the single block the entity stands in rather
 * than per-face from the faced neighbour.
 */
export class ResourceModelRenderer implements EntityRenderer {
    private readonly modelProvider: (key: Key) => Model | null;
    private readonly textureGallery: TextureGallery;
    private readonly renderSettings: RenderSettings;

    private readonly corners: VectorM3f[] = [];
    private readonly rawUvs: VectorM2f[] = [];
    /** upstream: {@code new VectorM2f[4]} — a *reference* array into {@link rawUvs} */
    private readonly uvs: (VectorM2f | undefined)[] = [undefined, undefined, undefined, undefined];
    private readonly tintColor = new Color();

    private modelResource!: Model;
    private tileModel!: TileModelView;
    private sunLight = 0;
    private blockLight = 0;
    private tintProvider!: TintColorProvider;

    constructor(
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
    ) {
        this.modelProvider = (key) => resourcePack.getModels().get(key);
        this.textureGallery = textureGallery;
        this.renderSettings = renderSettings;

        for (let i = 0; i < 8; i++) this.corners.push(new VectorM3f(0, 0, 0));
        for (let i = 0; i < 4; i++) this.rawUvs.push(new VectorM2f(0, 0));
    }

    getModelProvider(): (key: Key) => Model | null {
        return this.modelProvider;
    }

    getTextureGallery(): TextureGallery {
        return this.textureGallery;
    }

    getRenderSettings(): RenderSettings {
        return this.renderSettings;
    }

    render(
        entity: Entity,
        block: BlockNeighborhood,
        part: Part,
        tileModel: TileModelView,
    ): void {
        this.renderModel(
            entity,
            block,
            // upstream dereferences this without a null-check: an entity-state whose model
            // can not be resolved throws a NullPointerException there, and a TypeError here
            part.getModel().getResource(this.modelProvider) as Model,
            TintColorProvider.NO_TINT,
            tileModel,
        );

        // apply transform
        if (part.isTransformed()) tileModel.transform(part.getTransformMatrix() as MatrixM4f);
    }

    /**
     * upstream: the package-private {@code void render(Entity, BlockNeighborhood, Model,
     * TintColorProvider, TileModelView)} overload — renamed because TypeScript can not
     * overload on a parameter type the way java does here (a {@link Part} and a
     * {@link Model} are both plain objects at runtime).
     */
    renderModel(
        entity: Entity,
        block: BlockNeighborhood,
        model: Model,
        tintProvider: TintColorProvider,
        tileModel: TileModelView,
    ): void {
        this.modelResource = model;
        this.tileModel = tileModel;
        this.tintProvider = tintProvider;

        // light calculation
        const blockLightData = block.getLightData();
        this.sunLight = blockLightData.getSkyLight();
        this.blockLight = blockLightData.getBlockLight();

        // filter out entities that are in a "cave" that should not be rendered
        if (
            block.isRemoveIfCave() &&
            (this.renderSettings.isCaveDetectionUsesBlockLight()
                ? Math.max(this.blockLight, this.sunLight)
                : this.sunLight) === 0
        )
            return;

        // render model
        const modelStart = this.tileModel.getStart();

        const elements = this.modelResource.getElements();
        if (elements != null) {
            for (const element of elements) {
                // upstream iterates `Element[]`; this port's array is `(Element | null)[]`
                // because a json `null` element survives parsing — upstream would NPE, so
                // the same value can not occur in a pack that renders at all
                if (element == null) continue;
                this.buildModelElementResource(element, this.tileModel.initialize());
            }
        }

        this.tileModel.initialize(modelStart);
    }

    private readonly modelElementTransform = new MatrixM4f();

    /**
     * The {@code blockModel} parameter is handed {@code this.tileModel.initialize()} — the
     * very same view object — so the two are always identical, exactly as upstream.
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
                .scale(SCALE, SCALE, SCALE),
        );
    }

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

        // initialize the faces
        this.tileModel.initialize();
        this.tileModel.add(2);

        const tileModel = this.tileModel.getTileModel();
        const face1 = this.tileModel.getStart();
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
        let rotationSteps = Math.floor(face.getRotation() / 90) % 4;
        if (rotationSteps < 0) rotationSteps += 4;
        for (let i = 0; i < 4; i++) this.uvs[i] = this.rawUvs[(rotationSteps + i) % 4];

        tileModel.setUvs(face1,
            this.uvs[0]!.x, this.uvs[0]!.y,
            this.uvs[1]!.x, this.uvs[1]!.y,
            this.uvs[2]!.x, this.uvs[2]!.y,
        );

        tileModel.setUvs(face2,
            this.uvs[0]!.x, this.uvs[0]!.y,
            this.uvs[2]!.x, this.uvs[2]!.y,
            this.uvs[3]!.x, this.uvs[3]!.y,
        );

        // ####### face-tint
        if (face.getTintindex() >= 0) {
            this.tintProvider.setTintColor(face.getTintindex(), this.tintColor);
            tileModel.setColor(face1, this.tintColor.r, this.tintColor.g, this.tintColor.b);
            tileModel.setColor(face2, this.tintColor.r, this.tintColor.g, this.tintColor.b);
        } else {
            tileModel.setColor(face1, 1, 1, 1);
            tileModel.setColor(face2, 1, 1, 1);
        }

        // ####### blocklight
        const emissiveBlockLight = Math.max(this.blockLight, element.getLightEmission());
        tileModel.setBlocklight(face1, emissiveBlockLight);
        tileModel.setBlocklight(face2, emissiveBlockLight);

        // ####### sunlight
        tileModel.setSunlight(face1, this.sunLight);
        tileModel.setSunlight(face2, this.sunLight);

        // ######## AO
        tileModel.setAOs(face1, 1, 1, 1);
        tileModel.setAOs(face2, 1, 1, 1);
    }
}
