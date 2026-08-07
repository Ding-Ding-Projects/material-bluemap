import { Key, Registry, type Keyed } from "@worldlens/shared";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { RenderSettings } from "../RenderSettings.js";
import type { EntityRenderer } from "./EntityRenderer.js";
import type { EntityRendererFactory } from "./EntityRendererFactory.js";
import { MissingModelRenderer } from "./MissingModelRenderer.js";
import { ResourceModelRenderer } from "./ResourceModelRenderer.js";

/** upstream: map/hires/entity/EntityRendererType.java */
export interface EntityRendererType extends Keyed, EntityRendererFactory {
    /**
     * If the loaded resourcepack does not have any resources for this entity, this method will be called.
     * If this method returns true, this renderer will be used to render the entity instead.
     *
     * <p>
     *     This can (and should only then) be used to provide a way of rendering entities that are completely dynamically
     *     created by a mod, and there is no way to provide static entity resources that point at the correct renderer.
     * </p>
     *
     * @param entityType The entity-type {@link Key} that was not found in the loaded resources.
     * @return true if this renderer-type can render the provided entity-type {@link Key} despite missing resources.
     *
     * (upstream interface-default: {@code false})
     */
    isFallbackFor(entityType: Key): boolean;
}

/**
 * upstream: {@code ResourceModelRenderer::new} / {@code MissingModelRenderer::new} — a
 * constructor-reference is a factory in java; here it is a one-method object.
 *
 * The two renderer modules import this one back (for {@code REGISTRY} / {@code DEFAULT}),
 * so they are pulled in lazily rather than at module scope: `MissingModelRenderer` reads
 * `EntityRendererType.REGISTRY` at *call* time, which would otherwise be a temporal dead
 * zone during this module's own evaluation.
 */
function rendererFactory(
    load: () => new (
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
    ) => EntityRenderer,
): EntityRendererFactory {
    return {
        create(
            resourcePack: ResourcePack,
            textureGallery: TextureGallery,
            renderSettings: RenderSettings,
        ): EntityRenderer {
            const Renderer = load();
            return new Renderer(resourcePack, textureGallery, renderSettings);
        },
    };
}

/** upstream: EntityRendererType.Impl */
class Impl implements EntityRendererType {
    constructor(
        private readonly key: Key,
        private readonly rendererFactory: EntityRendererFactory,
    ) {}

    getKey(): Key {
        return this.key;
    }

    create(
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
    ): EntityRenderer {
        return this.rendererFactory.create(resourcePack, textureGallery, renderSettings);
    }

    isFallbackFor(_entityType: Key): boolean {
        return false;
    }
}

/** upstream: {@code EntityRendererType DEFAULT = new Impl(Key.bluemap("default"), ResourceModelRenderer::new)} */
const DEFAULT: EntityRendererType = new Impl(
    Key.bluemap("default"),
    rendererFactory(() => ResourceModelRenderer),
);
/** upstream: {@code EntityRendererType MISSING = new Impl(Key.bluemap("missing"), MissingModelRenderer::new)} */
const MISSING: EntityRendererType = new Impl(
    Key.bluemap("missing"),
    rendererFactory(() => MissingModelRenderer),
);

export const EntityRendererType = {
    DEFAULT,
    MISSING,

    REGISTRY: new Registry<EntityRendererType>(DEFAULT, MISSING),

    Impl,
};
