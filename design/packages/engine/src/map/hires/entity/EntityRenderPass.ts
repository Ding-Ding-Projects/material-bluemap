import type { Vector3i } from "@worldlens/shared";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { World } from "../../../world/World.js";
import { Block } from "../../../world/block/Block.js";
import { BlockNeighborhood } from "../../../world/block/BlockNeighborhood.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { TileMetaConsumer } from "../../TileMetaConsumer.js";
import type { RenderPass } from "../RenderPass.js";
import type { RenderSettings } from "../RenderSettings.js";
import type { TileModelView } from "../TileModelView.js";
import { EntityModelRenderer } from "./EntityModelRenderer.js";

const fr = Math.fround;

/**
 * upstream: map/hires/entity/EntityRenderPass.java
 *
 * Port note: {@code World#iterateEntities} is asynchronous here (it reads the entity
 * chunks from disk), so this pass' {@code render} returns a promise. The
 * {@link RenderPass} signature declares {@code void}, which in TypeScript accepts any
 * return value — a caller that does not await it would run the rest of the tile render
 * before the entities are in the model, so {@code HiresModelManager} awaits it.
 */
export class EntityRenderPass implements RenderPass {
    private readonly resourcePack: ResourcePack;
    private readonly renderSettings: RenderSettings;
    private readonly entityRenderer: EntityModelRenderer;

    constructor(
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
    ) {
        this.resourcePack = resourcePack;
        this.renderSettings = renderSettings;
        this.entityRenderer = new EntityModelRenderer(
            resourcePack,
            textureGallery,
            renderSettings,
        );
    }

    async render(
        world: World,
        modelMin: Vector3i,
        modelMax: Vector3i,
        modelAnchor: Vector3i,
        model: TileModelView,
        _tileMetaConsumer?: TileMetaConsumer,
    ): Promise<void> {
        const block = new BlockNeighborhood(
            new Block(world, 0, 0, 0),
            this.resourcePack,
            this.renderSettings,
            world.getDimensionType(),
        );
        await world.iterateEntities(
            modelMin.getX(),
            modelMin.getZ(),
            modelMax.getX(),
            modelMax.getZ(),
            (entity) => {
                const pos = entity.getPos();
                block.set(pos.getFloorX(), pos.getFloorY(), pos.getFloorZ());
                this.entityRenderer.render(entity, block, model.initialize());
                // upstream narrows each coordinate to `float` before subtracting the
                // (int) anchor, so the subtraction itself is 32-bit
                model.translate(
                    fr(fr(pos.getX()) - modelAnchor.getX()),
                    fr(fr(pos.getY()) - modelAnchor.getY()),
                    fr(fr(pos.getZ()) - modelAnchor.getZ()),
                );
            },
        );
    }
}
