import { MapControls } from "../MapControls";
import type { ControlsManager } from "../../ControlsManager";
import type { Map } from "../../../map/Map";

export class TouchZoomControls {
    hammer: HammerManager;
    manager: ControlsManager | null;

    moving: boolean;
    deltaZoom: number;
    lastZoom: number;

    constructor(hammer: HammerManager) {
        this.hammer = hammer;
        this.manager = null;

        this.moving = false;
        this.deltaZoom = 1;
        this.lastZoom = 1;
    }

    start(manager: ControlsManager): void {
        this.manager = manager;

        this.hammer.on("zoomstart", this.onTouchDown);
        this.hammer.on("zoommove", this.onTouchMove);
        this.hammer.on("zoomend", this.onTouchUp);
        this.hammer.on("zoomcancel", this.onTouchUp);
    }

    stop(): void {
        this.hammer.off("zoomstart", this.onTouchDown);
        this.hammer.off("zoommove", this.onTouchMove);
        this.hammer.off("zoomend", this.onTouchUp);
        this.hammer.off("zoomcancel", this.onTouchUp);
    }

    update(_delta: number, _map: Map): void {
        if (this.deltaZoom === 1) return;

        this.manager!.distance /= this.deltaZoom;
        this.deltaZoom = 1;
    }

    reset(): void {
        this.deltaZoom = 1;
    }

    private onTouchDown = (_evt: HammerInput) => {
        this.moving = true;
        this.lastZoom = 1;
    };

    private onTouchMove = (evt: HammerInput) => {
        if (this.moving) {
            this.deltaZoom *= evt.scale / this.lastZoom;
            this.manager!.angle = Math.min(
                this.manager!.angle,
                MapControls.getMaxPerspectiveAngleForDistance(this.manager!.distance),
            );
        }

        this.lastZoom = evt.scale;
    };

    private onTouchUp = (_evt: HammerInput) => {
        this.moving = false;
    };
}
