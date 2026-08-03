import { Key, Registry, type Keyed } from "@material-bluemap/shared";
import type { ResourcePack } from "../../resources/pack/resourcepack/ResourcePack.js";
import type { TextureGallery } from "../TextureGallery.js";
import type { RenderPass } from "./RenderPass.js";
import type { RenderPassFactory } from "./RenderPassFactory.js";
import type { RenderSettings } from "./RenderSettings.js";
import { BlockRenderPass } from "./block/BlockRenderPass.js";
import { EntityRenderPass } from "./entity/EntityRenderPass.js";

/** upstream: map/hires/RenderPassType.java */
export interface RenderPassType extends Keyed, RenderPassFactory {}

/** upstream: RenderPassType.Impl */
class Impl implements RenderPassType {
    constructor(
        private readonly key: Key,
        private readonly factory: RenderPassFactory,
    ) {}

    getKey(): Key {
        return this.key;
    }

    create(
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
    ): RenderPass {
        return this.factory.create(resourcePack, textureGallery, renderSettings);
    }
}

/** upstream: `RenderPassType BLOCKS = new Impl(Key.bluemap("blocks"), BlockRenderPass::new)` */
const BLOCKS: RenderPassType = new Impl(Key.bluemap("blocks"), {
    create: (resourcePack, textureGallery, renderSettings) =>
        new BlockRenderPass(resourcePack, textureGallery, renderSettings),
});

/** upstream: `RenderPassType ENTITIES = new Impl(Key.bluemap("entities"), EntityRenderPass::new)` */
const ENTITIES: RenderPassType = new Impl(Key.bluemap("entities"), {
    create: (resourcePack, textureGallery, renderSettings) =>
        new EntityRenderPass(resourcePack, textureGallery, renderSettings),
});

export const RenderPassType = {
    BLOCKS,
    ENTITIES,

    /**
     * upstream: `Registry<RenderPassType> REGISTRY = new Registry<>(BLOCKS, ENTITIES)`.
     *
     * Registration order is load-bearing: `HiresModelManager` renders the passes in
     * the registry's iteration order, and that order decides which faces land in the
     * model first — and therefore, within one material group, which order they are
     * written to the file in.
     */
    REGISTRY: new Registry<RenderPassType>(BLOCKS, ENTITIES),

    Impl,
};
