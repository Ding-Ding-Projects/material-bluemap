import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { RenderSettings } from "../RenderSettings.js";
import type { BlockRenderer } from "./BlockRenderer.js";

/** upstream: map/hires/block/BlockRendererFactory.java */
export interface BlockRendererFactory {
    create(
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
    ): BlockRenderer;
}
