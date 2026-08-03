import { Key, Registry, type Keyed } from "@material-bluemap/shared";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { BlockState } from "../../../world/BlockState.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { RenderSettings } from "../RenderSettings.js";
import type { BlockRenderer } from "./BlockRenderer.js";
import type { BlockRendererFactory } from "./BlockRendererFactory.js";
import { LiquidModelRenderer } from "./LiquidModelRenderer.js";
import { MissingModelRenderer } from "./MissingModelRenderer.js";
import { ResourceModelRenderer } from "./ResourceModelRenderer.js";

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

/*
 * upstream: `new Impl(Key.bluemap("default"), ResourceModelRenderer::new)` and friends.
 *
 * A TypeScript arrow standing in for the java constructor-reference. The renderer modules
 * form an import cycle with this one — `MissingModelRenderer` reads
 * {@link BlockRendererType.REGISTRY}, and `blockstate/Variant` defaults its renderer to
 * {@link BlockRendererType.DEFAULT} — but nothing dereferences a binding from the other
 * side of the cycle at module-evaluation time, so the live bindings are all initialized
 * long before the first `create` call. That is the same laziness a java method-reference
 * gives, kept without a dynamic import.
 */
const DEFAULT: BlockRendererType = new Impl(Key.bluemap("default"), {
    create: (resourcePack, textureGallery, renderSettings) =>
        new ResourceModelRenderer(resourcePack, textureGallery, renderSettings),
});
const LIQUID: BlockRendererType = new Impl(Key.bluemap("liquid"), {
    create: (resourcePack, textureGallery, renderSettings) =>
        new LiquidModelRenderer(resourcePack, textureGallery, renderSettings),
});
const MISSING: BlockRendererType = new Impl(Key.bluemap("missing"), {
    create: (resourcePack, textureGallery, renderSettings) =>
        new MissingModelRenderer(resourcePack, textureGallery, renderSettings),
});

export const BlockRendererType = {
    DEFAULT,
    LIQUID,
    MISSING,

    REGISTRY: new Registry<BlockRendererType>(DEFAULT, LIQUID, MISSING),

    Impl,
};
