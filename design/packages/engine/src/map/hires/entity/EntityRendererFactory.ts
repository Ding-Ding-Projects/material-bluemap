import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { RenderSettings } from "../RenderSettings.js";
import type { EntityRenderer } from "./EntityRenderer.js";

/** upstream: map/hires/entity/EntityRendererFactory.java */
export interface EntityRendererFactory {
    create(
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
    ): EntityRenderer;
}
