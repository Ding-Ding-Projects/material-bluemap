import { MathUtils } from "three";
import type { ControlsManager } from "../../ControlsManager";
import type { Map } from "../../../map/Map";

export class TouchRotateControls {
    hammer: HammerManager;
    manager: ControlsManager | null;

    moving: boolean;
    lastRotation: number;
    deltaRotation: number;

    speed: number;
    stiffness: number;

    constructor(hammer: HammerManager, speed: number, stiffness: number) {
        this.hammer = hammer;
        this.manager = null;

        this.moving = false;
        this.lastRotation = 0;
        this.deltaRotation = 0;

        this.speed = speed;
        this.stiffness = stiffness;
    }

    start(manager: ControlsManager): void {
        this.manager = manager;

        this.hammer.on("rotatestart", this.onTouchDown);
        this.hammer.on("rotatemove", this.onTouchMove);
        this.hammer.on("rotateend", this.onTouchUp);
        this.hammer.on("rotatecancel", this.onTouchUp);
    }

    stop(): void {
        this.hammer.off("rotatestart", this.onTouchDown);
        this.hammer.off("rotatemove", this.onTouchMove);
        this.hammer.off("rotateend", this.onTouchUp);
        this.hammer.off("rotatecancel", this.onTouchUp);
    }

    update(delta: number, _map: Map): void {
        if (this.deltaRotation === 0) return;

        let smoothing = this.stiffness / (16.666 / delta);
        smoothing = MathUtils.clamp(smoothing, 0, 1);

        this.manager!.rotation += this.deltaRotation * smoothing * this.speed;

        this.deltaRotation *= 1 - smoothing;
        if (Math.abs(this.deltaRotation) < 0.0001) {
            this.deltaRotation = 0;
        }
    }

    reset(): void {
        this.deltaRotation = 0;
    }

    private onTouchDown = (evt: HammerInput) => {
        this.moving = true;
        this.deltaRotation = 0;
        this.lastRotation = evt.rotation;
    };

    private onTouchMove = (evt: HammerInput) => {
        if (this.moving) {
            let delta = evt.rotation - this.lastRotation;
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;

            this.deltaRotation -= delta;
        }

        this.lastRotation = evt.rotation;
    };

    private onTouchUp = (_evt: HammerInput) => {
        this.moving = false;
    };
}
