import type { Mask } from "../mask/Mask.js";

/**
 * Phase D placeholder — replaced by the full port of map/hires/RenderSettings.java
 * (which adds the ambient-light / cave-detection-blocklight / hires-layer settings and
 * the render-boundary interface-defaults). Declared here is the surface the
 * world/block layer (ExtendedBlock) consumes.
 */
export interface RenderSettings {
    /**
     * The y-level below which "caves" will not be rendered
     */
    getRemoveCavesBelowY(): number;

    /**
     * The y-level relative to the ocean-floor heightmap below which caves will not be rendered
     */
    getCaveDetectionOceanFloor(): number;

    /**
     * The same as the maximum height, but blocks that are above this value are treated as AIR.<br>
     * This leads to the top-faces being rendered instead of them being culled.
     * (upstream interface-default: {@code true})
     */
    isRenderEdges(): boolean;

    /**
     * The sunlight-strength that the air blocks produced by {@link #isRenderEdges} will have.
     * (upstream interface-default: {@code 15})
     */
    getEdgeLightStrength(): number;

    getRenderMask(): Mask;
}
