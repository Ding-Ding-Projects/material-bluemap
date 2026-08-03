import { LRUCache } from "lru-cache";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { EntityState } from "../../../resources/pack/resourcepack/entitystate/EntityState.js";
import type { Part } from "../../../resources/pack/resourcepack/entitystate/Part.js";
import type { Entity } from "../../../world/Entity.js";
import type { BlockNeighborhood } from "../../../world/block/BlockNeighborhood.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { RenderSettings } from "../RenderSettings.js";
import type { TileModelView } from "../TileModelView.js";
import type { EntityRenderer } from "./EntityRenderer.js";
import type { EntityRendererType } from "./EntityRendererType.js";

/** upstream: {@code Caches.build(...)} — maximumSize(10000) + expireAfterAccess(1 minute) */
const CACHE_MAX = 10000;
const CACHE_TTL_MS = 60 * 1000;

/**
 * upstream: map/hires/entity/EntityModelRenderer.java
 *
 * Renders one entity: it looks the entity's {@link EntityState} up in the resource pack,
 * hands every part to the renderer that part names, and finally rotates the whole model by
 * the entity's own yaw/pitch.
 */
export class EntityModelRenderer {
    private readonly resourcePack: ResourcePack;
    private readonly textureGallery: TextureGallery;
    private readonly renderSettings: RenderSettings;

    /** upstream: {@code private final LoadingCache<EntityRendererType, EntityRenderer> entityRenderers} */
    private readonly entityRenderers = new LRUCache<EntityRendererType, EntityRenderer>({
        max: CACHE_MAX,
        ttl: CACHE_TTL_MS,
        updateAgeOnGet: true,
    });

    constructor(
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
    ) {
        this.resourcePack = resourcePack;
        this.textureGallery = textureGallery;
        this.renderSettings = renderSettings;
    }

    private renderer(type: EntityRendererType): EntityRenderer {
        const cached = this.entityRenderers.get(type);
        if (cached !== undefined) return cached;

        const renderer = type.create(this.resourcePack, this.textureGallery, this.renderSettings);
        this.entityRenderers.set(type, renderer);
        return renderer;
    }

    render(entity: Entity, block: BlockNeighborhood, tileModel: TileModelView): void {
        const stateResource: EntityState | null = this.resourcePack
            .getEntityStates()
            .get(entity.getId());
        if (stateResource == null) return;

        // upstream's `Part[] parts` is not null-checked — an entity-state json without a
        // "parts" member throws a NullPointerException there, and a TypeError here
        const parts = stateResource.getParts() as Part[];
        if (parts.length === 0) return;

        const modelStart = tileModel.getStart();

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i]!;
            this.renderer(part.getRenderer()).render(entity, block, part, tileModel.initialize());
        }

        tileModel.initialize(modelStart);

        // apply entity rotation
        tileModel.rotateYXZ(entity.getRotation().getY(), entity.getRotation().getX(), 0);
    }
}
