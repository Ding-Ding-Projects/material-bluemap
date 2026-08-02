import { Object3D } from "three";
import type { MarkerClickEvent } from "./markers/ObjectMarker";

export * as Three from "three";

// TS-only helper-types that exist in multiple modules — re-export explicitly to resolve
// the star-export ambiguity
export type { FollowingPlayerData } from "./controls/map/MapControls";
export type { ColorLike } from "./markers/ExtrudeMarker";

export * from "./controls/freeflight/FreeFlightControls";
export * from "./controls/freeflight/keyboard/KeyHeightControls";
// class name conflicts with map controls
export { KeyMoveControls as FreeFlightKeyMoveControls } from "./controls/freeflight/keyboard/KeyMoveControls";
export { MouseAngleControls as FreeFlightMouseAngleControls } from "./controls/freeflight/mouse/MouseAngleControls";
export { MouseRotateControls as FreeFlightMouseRotateControls } from "./controls/freeflight/mouse/MouseRotateControls";
export * from "./controls/freeflight/touch/TouchPanControls";

export * from "./controls/map/MapControls";
export * from "./controls/map/MapHeightControls";
export * from "./controls/map/keyboard/KeyAngleControls";
export { KeyMoveControls as MapKeyMoveControls } from "./controls/map/keyboard/KeyMoveControls";
export * from "./controls/map/keyboard/KeyRotateControls";
export * from "./controls/map/keyboard/KeyZoomControls";
export { MouseAngleControls as MapMouseAngleControls } from "./controls/map/mouse/MouseAngleControls";
export * from "./controls/map/mouse/MouseMoveControls";
export { MouseRotateControls as MapMouseRotateControls } from "./controls/map/mouse/MouseRotateControls";
export * from "./controls/map/mouse/MouseZoomControls";
export * from "./controls/map/touch/TouchAngleControls";
export * from "./controls/map/touch/TouchMoveControls";
export * from "./controls/map/touch/TouchRotateControls";
export * from "./controls/map/touch/TouchZoomControls";

export * from "./controls/ControlsManager";
export * from "./controls/KeyCombination";

export * from "./map/LowresTileLoader";
export * from "./map/Map";
export * from "./map/Tile";
export * from "./map/TileLoader";
export * from "./map/TileManager";
export * from "./map/TileMap";
export * from "./map/hires/HiresFragmentShader";
export * from "./map/hires/HiresVertexShader";
export * from "./map/lowres/LowresFragmentShader";
export * from "./map/lowres/LowresVertexShader";

export * from "./markers/ExtrudeMarker";
export * from "./markers/HtmlMarker";
export * from "./markers/LineMarker";
export * from "./markers/Marker";
export * from "./markers/MarkerFillFragmentShader";
export * from "./markers/MarkerFillVertexShader";
export * from "./markers/MarkerManager";
export * from "./markers/MarkerSet";
export * from "./markers/NormalMarkerManager";
export * from "./markers/ObjectMarker";
export * from "./markers/PlayerMarker";
export * from "./markers/PlayerMarkerManager";
export * from "./markers/PlayerMarkerSet";
export * from "./markers/PoiMarker";
export * from "./markers/ShapeMarker";

export * from "./skybox/SkyFragmentShader";
export * from "./skybox/SkyVertexShader";
export * from "./skybox/SkyboxScene";

export * from "./util/CSS2DRenderer";
export * from "./util/CombinedCamera";
export * from "./util/LineShader";
export * from "./util/Stats";
export * from "./util/Utils";

export * from "./BlueMapApp";
export * from "./MainMenu";
export * from "./MapViewer";
export * from "./PopupMarker";
export * from "./Utils";

/**
 * @return whether the event has been consumed (true) or not (false)
 */
Object3D.prototype.onClick = function (this: Object3D, event: MarkerClickEvent): boolean {
    if (this.parent) {
        if (!Array.isArray(event.eventStack)) event.eventStack = [];
        event.eventStack.push(this);

        return this.parent.onClick(event);
    }

    return false;
};
