import type { BlockProperties } from "../../../world/BlockProperties.js";
import type { BlockState } from "../../../world/BlockState.js";

/**
 * Phase C placeholder — replaced by the full port of
 * resources/pack/resourcepack/ResourcePack.java (texture/model/blockstate loading,
 * atlases, extensions and the loading-caches).
 *
 * Only the surface the world/block layer consumes (ExtendedBlock#getProperties) is
 * declared here.
 */
export interface ResourcePack {
    /**
     * upstream: {@code BlockProperties getBlockProperties(world.BlockState)} — the
     * (cached) block-properties derived from config, extensions and models
     */
    getBlockProperties(state: BlockState): BlockProperties;
}
