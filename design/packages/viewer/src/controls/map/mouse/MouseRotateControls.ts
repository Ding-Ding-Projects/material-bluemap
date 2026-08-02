import { MathUtils } from "three";
import type { ControlsManager } from "../../ControlsManager";
import type { Map } from "../../../map/Map";

export class MouseRotateControls {
    target: Element;
    manager: ControlsManager | null;

    moving: boolean;
    lastX: number;
    deltaRotation: number;

    speed: number;
    stiffness: number;

    pixelToSpeedMultiplierX: number;

    constructor(target: Element, speed: number, stiffness: number) {
        this.target = target;
        this.manager = null;

        this.moving = false;
        this.lastX = 0;
        this.deltaRotation = 0;

        this.speed = speed;
        this.stiffness = stiffness;

        this.pixelToSpeedMultiplierX = 0;
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
        if (this.deltaRotation === 0) return;

        let smoothing = this.stiffness / (16.666 / delta);
        smoothing = MathUtils.clamp(smoothing, 0, 1);

        this.manager!.rotation +=
            this.deltaRotation * smoothing * this.speed * this.pixelToSpeedMultiplierX;

        this.deltaRotation *= 1 - smoothing;
        if (Math.abs(this.deltaRotation) < 0.0001) {
            this.deltaRotation = 0;
        }
    }

    reset(): void {
        this.deltaRotation = 0;
    }

    private onMouseDown = (evt: MouseEvent) => {
        if (
            (evt.buttons !== undefined ? evt.buttons === 2 : evt.button === 2) ||
            ((evt.altKey || evt.ctrlKey) &&
                (evt.buttons !== undefined ? evt.buttons === 1 : evt.button === 0))
        ) {
            this.moving = true;
            this.deltaRotation = 0;
            this.lastX = evt.x;
        }
    };

    private onMouseMove = (evt: MouseEvent) => {
        if (this.moving) {
            this.deltaRotation += evt.x - this.lastX;
        }

        this.lastX = evt.x;
    };

    private onMouseUp = (_evt: MouseEvent) => {
        this.moving = false;
    };

    updatePixelToSpeedMultiplier = () => {
        this.pixelToSpeedMultiplierX = 1 / this.target.clientWidth; //* (this.target.clientWidth / this.target.clientHeight);
    };
}
