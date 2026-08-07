import { LRUCache } from "lru-cache";
import type { Key } from "@worldlens/shared";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { Part } from "../../../resources/pack/resourcepack/entitystate/Part.js";
import type { Entity } from "../../../world/Entity.js";
import type { BlockNeighborhood } from "../../../world/block/BlockNeighborhood.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { RenderSettings } from "../RenderSettings.js";
import type { EntityRenderer } from "./EntityRenderer.js";
import { EntityRendererType } from "./EntityRendererType.js";
import type { TileModelView } from "../TileModelView.js";

/** upstream: Logger.global.logDebug — the logger-package is not part of this port */
function logDebug(message: string): void {
    console.debug(message);
}

/** upstream: {@code Caches.build(...)} — maximumSize(10000) + expireAfterAccess(1 minute) */
const CACHE_MAX = 10000;
const CACHE_TTL_MS = 60 * 1000;

/**
 * upstream: {@code private static final LoadingCache<Key, EntityRendererType>
 * ENTITY_RENDERER_TYPES} — keyed by the entity-type key's formatted form, because a
 * javascript Map keys objects by identity while upstream relies on {@code Key}'s
 * value-equality.
 */
const ENTITY_RENDERER_TYPES = new LRUCache<string, EntityRendererType>({
    max: CACHE_MAX,
    ttl: CACHE_TTL_MS,
    updateAgeOnGet: true,
});

function entityRendererTypeFor(entityType: Key): EntityRendererType {
    const cacheKey = entityType.getFormatted();
    const cached = ENTITY_RENDERER_TYPES.get(cacheKey);
    if (cached !== undefined) return cached;

    let type: EntityRendererType | null = null;
    for (const candidate of EntityRendererType.REGISTRY.values()) {
        if (candidate.isFallbackFor(entityType)) {
            type = candidate;
            break;
        }
    }

    if (type === null) {
        logDebug("No renderer found for entity type: " + entityType);
        type = EntityRendererType.DEFAULT;
    }

    ENTITY_RENDERER_TYPES.set(cacheKey, type);
    return type;
}

/**
 * upstream: map/hires/entity/MissingModelRenderer.java
 *
 * The renderer an entity-state points at when the resource pack has nothing for that
 * entity: it asks every registered {@link EntityRendererType} whether it wants to stand in
 * for the entity's type, and delegates to the first one that does (falling back to
 * {@link EntityRendererType.DEFAULT}).
 */
export class MissingModelRenderer implements EntityRenderer {
    /** upstream: {@code private final LoadingCache<EntityRendererType, EntityRenderer> entityRenderers} */
    private readonly entityRenderers = new LRUCache<EntityRendererType, EntityRenderer>({
        max: CACHE_MAX,
        ttl: CACHE_TTL_MS,
        updateAgeOnGet: true,
    });

    private readonly resourcePack: ResourcePack;
    private readonly textureGallery: TextureGallery;
    private readonly renderSettings: RenderSettings;

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

    render(entity: Entity, block: BlockNeighborhood, part: Part, tileModel: TileModelView): void {
        this.renderer(entityRendererTypeFor(entity.getId())).render(entity, block, part, tileModel);
    }
}
