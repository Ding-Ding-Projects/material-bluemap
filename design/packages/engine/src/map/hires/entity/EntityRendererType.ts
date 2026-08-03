import { Key, Registry, type Keyed } from "@material-bluemap/shared";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { RenderSettings } from "../RenderSettings.js";
import type { EntityRenderer } from "./EntityRenderer.js";
import type { EntityRendererFactory } from "./EntityRendererFactory.js";

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
 * PHASE D BOUNDARY — upstream passes the concrete mesher renderer's constructor into
 * each {@code Impl} ({@code ResourceModelRenderer::new}, {@code MissingModelRenderer::new}).
 * Those renderers need TileModelView, ArrayTileModel, the resource-pack Part/Model types
 * and the full RenderSettings, none of which are ported yet, so the factory throws when
 * it is *called*. The key-identity and the registry-lookup — everything the Phase C
 * ResourcesGson adapters need — work fully. The mesher wave replaces these with the real
 * renderer constructors.
 */
function phaseDRendererFactory(key: string): EntityRendererFactory {
    return {
        create(): EntityRenderer {
            throw new Error(`${key} renderer is not ported yet (Phase D)`);
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

const DEFAULT: EntityRendererType = new Impl(
    Key.bluemap("default"),
    phaseDRendererFactory("bluemap:default"),
);
const MISSING: EntityRendererType = new Impl(
    Key.bluemap("missing"),
    phaseDRendererFactory("bluemap:missing"),
);

export const EntityRendererType = {
    DEFAULT,
    MISSING,

    REGISTRY: new Registry<EntityRendererType>(DEFAULT, MISSING),

    Impl,
};
