import { MathUtils } from "three";
import { MapControls } from "../MapControls";
import { softMax, softSet } from "../../../util/Utils";
import type { ControlsManager } from "../../ControlsManager";
import type { Map } from "../../../map/Map";

export class MouseAngleControls {
    target: Element;
    manager: ControlsManager | null;

    moving: boolean;
    lastY: number;
    deltaAngle: number;

    dynamicDistance: boolean;
    startDistance: number;

    speed: number;
    stiffness: number;

    pixelToSpeedMultiplierY: number;

    constructor(target: Element, speed: number, stiffness: number) {
        this.target = target;
        this.manager = null;

        this.moving = false;
        this.lastY = 0;
        this.deltaAngle = 0;

        this.dynamicDistance = false;
        this.startDistance = 0;

        this.speed = speed;
        this.stiffness = stiffness;

        this.pixelToSpeedMultiplierY = 0;
        this.updatePixelToSpeedMultiplier();
    }

    start(manager: ControlsManager): void {
        this.manager = manager;

        this.target.addEventListener("mousedown", this.onMouseDown as EventListener);
        window.addEventListener("mousemove", this.onMouseMove);
        window.addEventListener("mouseup", this.onMouseUp);
        window.addEventListener("wheel", this.onWheel);

        window.addEventListener("resize", this.updatePixelToSpeedMultiplier);
    }

    stop(): void {
        this.target.removeEventListener("mousedown", this.onMouseDown as EventListener);
        window.removeEventListener("mousemove", this.onMouseMove);
        window.removeEventListener("mouseup", this.onMouseUp);
        window.removeEventListener("wheel", this.onWheel);

        window.removeEventListener("resize", this.updatePixelToSpeedMultiplier);
    }

    update(delta: number, _map: Map): void {
        if (this.deltaAngle === 0) return;

        let smoothing = this.stiffness / (16.666 / delta);
        smoothing = MathUtils.clamp(smoothing, 0, 1);

        this.manager!.angle +=
            this.deltaAngle * smoothing * this.speed * this.pixelToSpeedMultiplierY;

        if (this.dynamicDistance) {
            let targetDistance = this.startDistance;
            targetDistance = Math.min(
                targetDistance,
                MapControls.getMaxDistanceForPerspectiveAngle(this.manager!.angle),
            );
            targetDistance = Math.max(
                targetDistance,
                (this.manager!.controls as MapControls).minDistance,
            );
            this.manager!.distance = softSet(this.manager!.distance, targetDistance, 0.4);
            this.manager!.angle = softMax(
                this.manager!.angle,
                MapControls.getMaxPerspectiveAngleForDistance(targetDistance),
                0.8,
            );
        } else {
            this.manager!.angle = softMax(
                this.manager!.angle,
                MapControls.getMaxPerspectiveAngleForDistance(this.manager!.distance),
                0.8,
            );
        }

        this.deltaAngle *= 1 - smoothing;
        if (Math.abs(this.deltaAngle) < 0.0001) {
            this.deltaAngle = 0;
        }
    }

    reset(): void {
        this.deltaAngle = 0;
    }

    private onMouseDown = (evt: MouseEvent) => {
        if (
            (evt.buttons !== undefined ? evt.buttons === 2 : evt.button === 2) ||
            ((evt.altKey || evt.ctrlKey) &&
                (evt.buttons !== undefined ? evt.buttons === 1 : evt.button === 0))
        ) {
            this.moving = true;
            this.deltaAngle = 0;
            this.lastY = evt.y;

            this.startDistance = this.manager!.distance;
            this.dynamicDistance = this.manager!.distance < 1000;
        }
    };

    private onMouseMove = (evt: MouseEvent) => {
        if (this.moving) {
            this.deltaAngle -= evt.y - this.lastY;
        }

        this.lastY = evt.y;
    };

    private onMouseUp = (_evt: MouseEvent) => {
        this.moving = false;
    };

    onWheel = (_evt: WheelEvent) => {
        this.dynamicDistance = false;
    };

    updatePixelToSpeedMultiplier = () => {
        this.pixelToSpeedMultiplierY = 1 / this.target.clientHeight;
    };
}
