import type { Color } from "@material-bluemap/shared";
import { LRUCache } from "lru-cache";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { Variant } from "../../../resources/pack/resourcepack/blockstate/Variant.js";
import type { BlockState } from "../../../world/BlockState.js";
import type { BlockNeighborhood } from "../../../world/block/BlockNeighborhood.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { RenderSettings } from "../RenderSettings.js";
import type { TileModelView } from "../TileModelView.js";
import type { BlockRenderer } from "./BlockRenderer.js";
import { BlockRendererType } from "./BlockRendererType.js";

/*
 * upstream: Logger.global.logDebug — the logger-package is not part of this port (yet),
 * so the log-calls are backed by the console directly.
 */
function logDebug(message: string): void {
    console.debug(message);
}

/** upstream: {@code util/Caches.build(...)} — maximumSize(10000), expireAfterAccess(1 minute) */
const CACHE_MAX_SIZE = 10000;
const CACHE_TTL_MS = 60 * 1000;

/**
 * The canonical cache-key of a world-BlockState. Upstream keys the caffeine cache on the
 * BlockState itself, which hashes/compares by id plus its *sorted* property-array; a js
 * Map compares by identity, so the equivalent value-key is built here — the same shape
 * {@code resources/pack/resourcepack/ResourcePack} already uses for its two caches.
 */
function blockStateCacheKey(blockState: BlockState): string {
    const properties = Array.from(blockState.getProperties().entries())
        .map(([key, value]) => key + "=" + value)
        .sort();
    return blockState.getId().getFormatted() + "[" + properties.join(",") + "]";
}

/**
 * upstream: {@code private static final LoadingCache<BlockState, BlockRendererType>
 * BLOCK_RENDERER_TYPES} — static, so it is shared by every MissingModelRenderer instance
 * exactly as upstream's is.
 */
const blockRendererTypes = new LRUCache<string, BlockRendererType>({
    max: CACHE_MAX_SIZE,
    ttl: CACHE_TTL_MS,
    updateAgeOnGet: true,
});

function rendererTypeFor(blockState: BlockState): BlockRendererType {
    const key = blockStateCacheKey(blockState);
    const cached = blockRendererTypes.get(key);
    if (cached !== undefined) return cached;

    let resolved: BlockRendererType | null = null;
    for (const type of BlockRendererType.REGISTRY.values()) {
        if (type.isFallbackFor(blockState)) {
            resolved = type;
            break;
        }
    }

    if (resolved === null) {
        logDebug("No renderer found for block state: " + blockState);
        resolved = BlockRendererType.DEFAULT;
    }

    blockRendererTypes.set(key, resolved);
    return resolved;
}

/**
 * upstream: map/hires/block/MissingModelRenderer.java
 *
 * The renderer bluemap falls back to when the loaded resource-pack has no resources for a
 * block-state. It asks every registered {@link BlockRendererType} whether it can render
 * the state anyway ({@code isFallbackFor}) and delegates to the first that says yes;
 * otherwise the block is drawn with the default renderer and the "missing-block" model
 * the caller passed in.
 */
export class MissingModelRenderer implements BlockRenderer {
    private readonly blockRenderers: (type: BlockRendererType) => BlockRenderer;

    constructor(
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
    ) {
        const cache = new LRUCache<BlockRendererType, BlockRenderer>({
            max: CACHE_MAX_SIZE,
            ttl: CACHE_TTL_MS,
            updateAgeOnGet: true,
        });
        this.blockRenderers = (type) => {
            const cached = cache.get(type);
            if (cached !== undefined) return cached;
            const created = type.create(resourcePack, textureGallery, renderSettings);
            cache.set(type, created);
            return created;
        };
    }

    render(
        block: BlockNeighborhood,
        variant: Variant,
        blockModel: TileModelView,
        blockColor: Color,
    ): void {
        this.blockRenderers(rendererTypeFor(block.getBlockState())).render(
            block,
            variant,
            blockModel,
            blockColor,
        );
    }
}
