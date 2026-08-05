import { Color } from "@material-bluemap/shared";
import { LRUCache } from "lru-cache";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { Variant } from "../../../resources/pack/resourcepack/blockstate/Variant.js";
import { BlockState } from "../../../world/BlockState.js";
import type { BlockNeighborhood } from "../../../world/block/BlockNeighborhood.js";
import { flattenLegacyBlockState } from "../../../world/mca/legacy/FlatteningRename.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { RenderSettings } from "../RenderSettings.js";
import type { TileModelView } from "../TileModelView.js";
import type { BlockRenderer } from "./BlockRenderer.js";
import type { BlockRendererType } from "./BlockRendererType.js";

/**
 * upstream: {@code util/Caches.build(loader)} — a caffeine LoadingCache with
 * {@code maximumSize(10000)} and {@code expireAfterAccess(1, MINUTES)}, the same shape
 * {@code resources/pack/resourcepack/ResourcePack} already mirrors with `lru-cache`.
 *
 * Keyed by the {@link BlockRendererType} object: upstream's key type overrides neither
 * {@code equals} nor {@code hashCode}, so caffeine compares it by identity — which is
 * exactly what a javascript Map key does.
 */
const CACHE_MAX_SIZE = 10000;
const CACHE_TTL_MS = 60 * 1000;

function rendererCache(
    create: (type: BlockRendererType) => BlockRenderer,
): (type: BlockRendererType) => BlockRenderer {
    const cache = new LRUCache<BlockRendererType, BlockRenderer>({
        max: CACHE_MAX_SIZE,
        ttl: CACHE_TTL_MS,
        updateAgeOnGet: true,
    });
    return (type) => {
        const cached = cache.get(type);
        if (cached !== undefined) return cached;
        const created = create(type);
        cache.set(type, created);
        return created;
    };
}

/**
 * upstream: map/hires/block/BlockStateModelRenderer.java
 *
 * One level above {@link BlockRenderer}: it resolves a block-state to its resource-pack
 * blockstate, asks that for the variants applying at this position (which is where the
 * coordinate-seeded variant PRNG in {@code blockstate/VariantSet} runs), dispatches each
 * variant to its renderer, and combines the per-variant colours into the one colour that
 * represents the block.
 */
export class BlockStateModelRenderer {
    private readonly resourcePack: ResourcePack;
    private readonly blockRenderers: (type: BlockRendererType) => BlockRenderer;

    private readonly variants: Variant[] = [];

    constructor(
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
    ) {
        this.resourcePack = resourcePack;
        this.blockRenderers = rendererCache((type) =>
            type.create(resourcePack, textureGallery, renderSettings),
        );
    }

    private readonly waterloggedColor = new Color();

    /** upstream: {@code render(BlockNeighborhood, TileModelView, Color)} */
    render(block: BlockNeighborhood, blockModel: TileModelView, blockColor: Color): void;
    /** upstream: {@code render(BlockNeighborhood, BlockState, TileModelView, Color)} */
    render(
        block: BlockNeighborhood,
        blockState: BlockState,
        tileModel: TileModelView,
        blockColor: Color,
    ): void;
    render(
        block: BlockNeighborhood,
        b: BlockState | TileModelView,
        c: TileModelView | Color,
        d?: Color,
    ): void {
        const blockState = b instanceof BlockState ? b : block.getBlockState();
        const tileModel = (b instanceof BlockState ? c : b) as TileModelView;
        const blockColor = (b instanceof BlockState ? d : c) as Color;

        blockColor.set(0, 0, 0, 0, true);

        //shortcut for air
        if (blockState.isAir()) return;

        const modelStart = tileModel.getStart();

        // render block
        this.renderModel(block, blockState, tileModel.initialize(), blockColor);

        // add water if block is waterlogged
        if (blockState.isWaterlogged() || block.getProperties().isAlwaysWaterlogged()) {
            this.waterloggedColor.set(0, 0, 0, 0, true);
            this.renderModel(block, BlockState.WATER, tileModel.initialize(), this.waterloggedColor);
            blockColor.set(this.waterloggedColor.overlay(blockColor.premultiplied()));
        }

        tileModel.initialize(modelStart);
    }

    private readonly variantColor = new Color();

    private renderModel(
        block: BlockNeighborhood,
        blockState: BlockState,
        tileModel: TileModelView,
        blockColor: Color,
    ): void {
        const modelStart = tileModel.getStart();

        /*
         * Port-only, no upstream analog: a pre-flattening (1.12.2) chunk hands back the
         * exact pre-flattening block name (Chunk_1_12 / BlockIdMapper are correct about
         * that — see FlatteningRename.ts), so only *here*, right before the resource pack
         * is consulted, is that name translated to its modern equivalent. Gated on
         * `block.isLegacy()` so a modern block-state — which can legitimately use some of
         * these exact names for a different, already-correct block (a real 1.13-1.20.2
         * chunk's `minecraft:grass` really does mean the grass tuft) — is never touched.
         */
        const lookupState = block.isLegacy() ? flattenLegacyBlockState(blockState) : blockState;

        const stateResource = this.resourcePack.getBlockState(lookupState);
        if (stateResource == null) return;

        let blockColorOpacity = 0;
        this.variants.length = 0;
        stateResource.forEach(lookupState, block.getX(), block.getY(), block.getZ(), (variant) =>
            this.variants.push(variant),
        );

        for (let i = 0; i < this.variants.length; i++) {
            this.variantColor.set(0, 0, 0, 0, true);

            const variant = this.variants[i]!;
            this.blockRenderers(variant.getRenderer()).render(
                block,
                variant,
                tileModel.initialize(),
                this.variantColor,
            );

            if (this.variantColor.a > blockColorOpacity) blockColorOpacity = this.variantColor.a;
            blockColor.add(this.variantColor.premultiplied());
        }

        if (blockColor.a > 0) {
            blockColor.flatten().straight();
            blockColor.a = blockColorOpacity;
        }

        tileModel.initialize(modelStart);
    }
}
