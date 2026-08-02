import { MathUtils } from "three";
import type { ControlsManager } from "../../ControlsManager";
import type { Map } from "../../../map/Map";

export class MouseAngleControls {
    target: Element;
    manager: ControlsManager | null;

    moving: boolean;
    lastY: number;
    deltaAngle: number;

    speedLeft: number;
    speedRight: number;
    speedCapture: number;
    stiffness: number;

    pixelToSpeedMultiplier: number;

    constructor(
        target: Element,
        speedLeft: number,
        speedRight: number,
        speedCapture: number,
        stiffness: number,
    ) {
        this.target = target;
        this.manager = null;

        this.moving = false;
        this.lastY = 0;
        this.deltaAngle = 0;

        this.speedLeft = speedLeft;
        this.speedRight = speedRight;
        this.speedCapture = speedCapture;
        this.stiffness = stiffness;

        this.pixelToSpeedMultiplier = 0;
        this.updatePixelToSpeedMultiplier();
    }

    start(manager: ControlsManager): void {
        this.manager = manager;

        this.target.addEventListener("mousedown", this.onMouseDown as EventListener);
        window.addEventListener("mousemove", this.onMouseMove);
        window.addEventListener("mouseup", this.onMouseUp);

        window.addEventListener("resize", this.updatePixelToSpeedMultiplier);
    }

    stop(): void {
        this.target.removeEventListener("mousedown", this.onMouseDown as EventListener);
        window.removeEventListener("mousemove", this.onMouseMove);
        window.removeEventListener("mouseup", this.onMouseUp);

        window.removeEventListener("resize", this.updatePixelToSpeedMultiplier);
    }

    update(delta: number, _map: Map): void {
        if (this.deltaAngle === 0) return;

        let smoothing = this.stiffness / (16.666 / delta);
        smoothing = MathUtils.clamp(smoothing, 0, 1);

        this.manager!.angle += this.deltaAngle * smoothing;

        this.deltaAngle *= 1 - smoothing;
        if (Math.abs(this.deltaAngle) < 0.0001) {
            this.deltaAngle = 0;
        }
    }

    reset(): void {
        this.deltaAngle = 0;
    }

    private onMouseDown = (evt: MouseEvent) => {
        this.moving = true;
        this.deltaAngle = 0;
        this.lastY = evt.y;
    };

    private onMouseMove = (evt: MouseEvent) => {
        if (document.pointerLockElement) {
            this.deltaAngle += evt.movementY * this.speedCapture * this.pixelToSpeedMultiplier;
        } else if (this.moving) {
            if (evt.buttons === 1) {
                this.deltaAngle +=
                    (evt.y - this.lastY) * this.speedLeft * this.pixelToSpeedMultiplier;
            } else {
                this.deltaAngle +=
                    (evt.y - this.lastY) * this.speedRight * this.pixelToSpeedMultiplier;
            }
        }

        this.lastY = evt.y;
    };

    private onMouseUp = (_evt: MouseEvent) => {
        this.moving = false;
    };

    updatePixelToSpeedMultiplier = () => {
        this.pixelToSpeedMultiplier = 1 / this.target.clientHeight;
    };
}
