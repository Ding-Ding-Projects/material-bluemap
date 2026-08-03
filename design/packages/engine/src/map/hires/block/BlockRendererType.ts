import { Key, Registry, type Keyed } from "@material-bluemap/shared";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { BlockState } from "../../../world/BlockState.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { RenderSettings } from "../RenderSettings.js";
import type { BlockRenderer } from "./BlockRenderer.js";
import type { BlockRendererFactory } from "./BlockRendererFactory.js";

/** upstream: map/hires/block/BlockRendererType.java */
export interface BlockRendererType extends Keyed, BlockRendererFactory {
    /**
     * If the loaded resourcepack does not have any resources for this blockState, this method will be called.
     * If this method returns true, this renderer will be used to render the block instead of rendering the default
     * black-purple "missing block" model.
     * When rendering, the provided "variant" will always be bluemaps default "missing-block" resource.
     *
     * <p>
     *     This can (and should only then) be used to provide a way of rendering blocks that are completely dynamically
     *     created by a mod, and there is no way to provide static block-state resources that point at the correct renderer.
     * </p>
     *
     * @param blockState The {@link BlockState} that was not found in the loaded resources.
     * @return true if this renderer-type can render the provided {@link BlockState} despite missing resources.
     *
     * (upstream interface-default: {@code false})
     */
    isFallbackFor(blockState: BlockState): boolean;
}

/**
 * PHASE D BOUNDARY — upstream passes the concrete mesher renderer's constructor into
 * each {@code Impl} ({@code ResourceModelRenderer::new}, {@code LiquidModelRenderer::new},
 * {@code MissingModelRenderer::new}). Those renderers need TileModelView, ArrayTileModel,
 * the resource-pack Variant/Model types and the full RenderSettings, none of which are
 * ported yet, so the factory throws when it is *called*. The key-identity and the
 * registry-lookup — everything the Phase C ResourcesGson adapters need — work fully.
 * The mesher wave replaces these with the real renderer constructors.
 */
function phaseDRendererFactory(key: string): BlockRendererFactory {
    return {
        create(): BlockRenderer {
            throw new Error(`${key} renderer is not ported yet (Phase D)`);
        },
    };
}

/** upstream: BlockRendererType.Impl */
class Impl implements BlockRendererType {
    constructor(
        private readonly key: Key,
        private readonly rendererFactory: BlockRendererFactory,
    ) {}

    getKey(): Key {
        return this.key;
    }

    create(
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
    ): BlockRenderer {
        return this.rendererFactory.create(resourcePack, textureGallery, renderSettings);
    }

    isFallbackFor(_blockState: BlockState): boolean {
        return false;
    }
}

const DEFAULT: BlockRendererType = new Impl(
    Key.bluemap("default"),
    phaseDRendererFactory("bluemap:default"),
);
const LIQUID: BlockRendererType = new Impl(
    Key.bluemap("liquid"),
    phaseDRendererFactory("bluemap:liquid"),
);
const MISSING: BlockRendererType = new Impl(
    Key.bluemap("missing"),
    phaseDRendererFactory("bluemap:missing"),
);

export const BlockRendererType = {
    DEFAULT,
    LIQUID,
    MISSING,

    REGISTRY: new Registry<BlockRendererType>(DEFAULT, LIQUID, MISSING),

    Impl,
};
