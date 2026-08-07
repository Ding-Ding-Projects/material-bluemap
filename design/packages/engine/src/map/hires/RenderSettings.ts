import type { Grid, Vector2i } from "@worldlens/shared";
import type { Mask } from "../mask/Mask.js";

/**
 * upstream: map/hires/RenderSettings.java
 *
 * Java interface-defaults have no TypeScript equivalent, so this port uses the shape the
 * rest of the tree already uses for them (see `map/hires/block/color/BlockColorCalculator`
 * and `map/MapSettings`): the member stays on the interface — every implementor has to
 * supply it, which is what a defaulted java method looks like from a *caller's* side — and
 * the default *body* lives on the {@link RenderSettings} companion object so an
 * implementor can delegate to it instead of re-deriving it.
 *
 * The three boundary-test defaults are pure functions of {@link getRenderMask}, so they are
 * only on the companion: nothing implements them itself, and a caller invokes
 * {@code RenderSettings.isInsideRenderBoundaries(settings, x, z)}.
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
     * If blocklight should be used instead of skylight to detect "caves"
     */
    isCaveDetectionUsesBlockLight(): boolean;

    /**
     * The (default) ambient light of this world (0-1)
     */
    getAmbientLight(): number;

    /**
     * The same as the maximum height, but blocks that are above this value are treated as AIR.<br>
     * This leads to the top-faces being rendered instead of them being culled.
     * (upstream interface-default: {@code true})
     */
    isRenderEdges(): boolean;

    /**
     * The sunlight-strength that the air blocks produced by {@link isRenderEdges} will have.
     * (upstream interface-default: {@code 15})
     */
    getEdgeLightStrength(): number;

    /** (upstream interface-default: {@code false}) */
    isIgnoreMissingLightData(): boolean;

    getRenderMask(): Mask;

    isSaveHiresLayer(): boolean;

    isRenderTopOnly(): boolean;
}

/** the mask-holder every boundary-test default needs (upstream: `this`) */
type MaskHolder = Pick<RenderSettings, "getRenderMask">;

/**
 * upstream: {@code default boolean isInsideRenderBoundaries(int x, int z)} — the whole
 * y-column at (x, z), so an undefined/mixed result counts as inside.
 */
function isInsideRenderBoundaries(settings: MaskHolder, x: number, z: number): boolean;
/** upstream: {@code default boolean isInsideRenderBoundaries(int x, int y, int z)} */
function isInsideRenderBoundaries(
    settings: MaskHolder,
    x: number,
    y: number,
    z: number,
): boolean;
function isInsideRenderBoundaries(
    settings: MaskHolder,
    x: number,
    b: number,
    c?: number,
): boolean {
    if (c === undefined) {
        const z = b;
        return settings.getRenderMask().test(x, -2147483648, z, x, 2147483647, z).getOr(true);
    }
    return settings.getRenderMask().test(x, b, c);
}

export const RenderSettings = {
    /** upstream: {@code default boolean isRenderEdges()} */
    isRenderEdges(): boolean {
        return true;
    },

    /** upstream: {@code default int getEdgeLightStrength()} */
    getEdgeLightStrength(): number {
        return 15;
    },

    /** upstream: {@code default boolean isIgnoreMissingLightData()} */
    isIgnoreMissingLightData(): boolean {
        return false;
    },

    isInsideRenderBoundaries,

    /**
     * upstream: {@code default boolean isInsideRenderBoundaries(Vector2i cell, Grid grid,
     * boolean allowPartiallyIncludedCells)}
     */
    isInsideRenderBoundariesOfCell(
        settings: MaskHolder,
        cell: Vector2i,
        grid: Grid,
        allowPartiallyIncludedCells: boolean,
    ): boolean {
        return settings
            .getRenderMask()
            .test(
                grid.getCellMinX(cell.getX()),
                -2147483648,
                grid.getCellMinY(cell.getY()),
                grid.getCellMaxX(cell.getX()),
                2147483647,
                grid.getCellMaxY(cell.getY()),
            )
            .getOr(allowPartiallyIncludedCells);
    },

    /**
     * Returns a predicate which is filtering out all cells of a {@link Grid}
     * that are outside the render boundaries.
     */
    getCellRenderBoundariesFilter(
        settings: MaskHolder,
        grid: Grid,
        allowPartiallyIncludedCells: boolean,
    ): (cell: Vector2i) => boolean {
        return (cell) =>
            RenderSettings.isInsideRenderBoundariesOfCell(
                settings,
                cell,
                grid,
                allowPartiallyIncludedCells,
            );
    },
};
