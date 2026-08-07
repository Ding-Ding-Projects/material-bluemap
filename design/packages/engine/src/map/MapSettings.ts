import type { Vector2i } from "@worldlens/shared";
import type { RenderSettings } from "./hires/RenderSettings.js";

/**
 * upstream: map/MapSettings.java
 *
 * Upstream's two interface-default methods ({@code isSaveHiresLayer},
 * {@code isRenderTopOnly}) *override* the ones {@link RenderSettings} declares, so they
 * are re-stated here with the matching {@link MapSettings} companion functions holding
 * MapSettings' bodies — the shape this port uses for java interface-defaults throughout.
 * A settings object that delegates to {@code RenderSettings.isSaveHiresLayer} instead of
 * {@code MapSettings.isSaveHiresLayer} is a different map, not a stylistic choice.
 */
export interface MapSettings extends RenderSettings {
    getSorting(): number;

    getStartPos(): Vector2i;

    getSkyColor(): string;

    getVoidColor(): string;

    /**
     * upstream: {@code long getMinInhabitedTime()} — a tick-count, kept as a `number`
     * exactly as {@code Chunk#getInhabitedTime()} already is (decision D1).
     */
    getMinInhabitedTime(): number;

    getMinInhabitedTimeRadius(): number;

    getHiresTileSize(): number;

    getLowresTileSize(): number;

    getLodCount(): number;

    getLodFactor(): number;

    getSkyLight(): number;

    isEnablePerspectiveView(): boolean;

    isEnableFlatView(): boolean;

    isEnableFreeFlightView(): boolean;

    isEnableHires(): boolean;

    isCheckForRemovedRegions(): boolean;

    /** upstream interface-default: {@link MapSettings.isSaveHiresLayer} */
    isSaveHiresLayer(): boolean;

    /** upstream interface-default: {@link MapSettings.isRenderTopOnly} */
    isRenderTopOnly(): boolean;
}

export const MapSettings = {
    /** upstream: {@code default boolean isSaveHiresLayer()} */
    isSaveHiresLayer(settings: Pick<MapSettings, "isEnableHires">): boolean {
        return settings.isEnableHires();
    },

    /** upstream: {@code default boolean isRenderTopOnly()} */
    isRenderTopOnly(
        settings: Pick<
            MapSettings,
            "isEnableHires" | "isEnablePerspectiveView" | "isEnableFreeFlightView"
        >,
    ): boolean {
        return (
            !settings.isEnableHires() ||
            (!settings.isEnablePerspectiveView() && !settings.isEnableFreeFlightView())
        );
    },
};
