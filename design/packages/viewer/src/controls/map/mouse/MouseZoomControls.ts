import { MathUtils } from "three";
import { MapControls } from "../MapControls";
import type { ControlsManager } from "../../ControlsManager";
import type { Map } from "../../../map/Map";

export class MouseZoomControls {
    target: EventTarget;
    manager: ControlsManager | null;

    stiffness: number;
    speed: number;

    deltaZoom: number;

    constructor(target: EventTarget, speed: number, stiffness: number) {
        this.target = target;
        this.manager = null;

        this.stiffness = stiffness;
        this.speed = speed;

        this.deltaZoom = 0;
    }

    start(manager: ControlsManager): void {
        this.manager = manager;

        this.target.addEventListener("wheel", this.onMouseWheel as EventListener, {
            passive: false,
        });
    }

    stop(): void {
        this.target.removeEventListener("wheel", this.onMouseWheel as EventListener);
    }

    update(delta: number, _map: Map): void {
        if (this.deltaZoom === 0) return;

        let smoothing = this.stiffness / (16.666 / delta);
        smoothing = MathUtils.clamp(smoothing, 0, 1);

        this.manager!.distance *= Math.pow(1.5, this.deltaZoom * smoothing * this.speed);
        this.manager!.angle = Math.min(
            this.manager!.angle,
            MapControls.getMaxPerspectiveAngleForDistance(this.manager!.distance),
        );

        this.deltaZoom *= 1 - smoothing;
        if (Math.abs(this.deltaZoom) < 0.0001) {
            this.deltaZoom = 0;
        }
    }

    reset(): void {
        this.deltaZoom = 0;
    }

    private onMouseWheel = (evt: WheelEvent) => {
        evt.preventDefault();

        let delta = evt.deltaY;
        if (evt.deltaMode === WheelEvent.DOM_DELTA_PIXEL) delta *= 0.01;
        if (evt.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 0.33;

        this.deltaZoom += delta;
    };
}
