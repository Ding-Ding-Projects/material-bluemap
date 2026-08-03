import type { Key } from "@material-bluemap/shared";
import type { BlockProperties } from "../../../world/BlockProperties.js";
import type { BlockState } from "../../../world/BlockState.js";
import type { ColorMap } from "./texture/ColorMap.js";

/**
 * Phase C placeholder — replaced by the full port of
 * resources/pack/resourcepack/ResourcePack.java (texture/model/blockstate loading,
 * atlases, extensions and the loading-caches).
 *
 * Only the surface the world/block layer consumes (ExtendedBlock#getProperties) and the
 * colormap-lookup the block-color layer consumes are declared here.
 */
export interface ResourcePack {
    /**
     * upstream: {@code BlockProperties getBlockProperties(world.BlockState)} — the
     * (cached) block-properties derived from config, extensions and models
     */
    getBlockProperties(state: BlockState): BlockProperties;

    /**
     * upstream: {@code ResourcePool<ColorMap> getColormaps()} (lombok @Getter) — only
     * the key-lookup {@link BlockColorCalculatorFactory#colorMap} performs is declared
     * on this placeholder; the full ResourcePool arrives with the ResourcePack port.
     */
    getColormaps(): { get(key: Key): ColorMap | null };
}
