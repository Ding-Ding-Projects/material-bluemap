import type { ResourcePack } from "../../resources/pack/resourcepack/ResourcePack.js";
import type { TextureGallery } from "../TextureGallery.js";
import type { RenderPass } from "./RenderPass.js";
import type { RenderSettings } from "./RenderSettings.js";

/** upstream: map/hires/RenderPassFactory.java */
export interface RenderPassFactory {
    create(
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
    ): RenderPass;
}
