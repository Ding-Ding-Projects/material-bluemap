import { MathUtils } from "three";
import { softMax } from "../../../util/Utils";
import { MapControls } from "../MapControls";
import type { ControlsManager } from "../../ControlsManager";
import type { Map } from "../../../map/Map";

export class TouchAngleControls {
    target: Element;
    hammer: HammerManager;
    manager: ControlsManager | null;

    moving: boolean;
    lastY: number;
    deltaAngle: number;

    speed: number;
    stiffness: number;

    pixelToSpeedMultiplierY: number;

    constructor(target: Element, hammer: HammerManager, speed: number, stiffness: number) {
        this.target = target;
        this.hammer = hammer;
        this.manager = null;

        this.moving = false;
        this.lastY = 0;
        this.deltaAngle = 0;

        this.speed = speed;
        this.stiffness = stiffness;

        this.pixelToSpeedMultiplierY = 0;
        this.updatePixelToSpeedMultiplier();
    }

    start(manager: ControlsManager): void {
        this.manager = manager;

        this.hammer.on("tiltstart", this.onTouchDown);
        this.hammer.on("tiltmove", this.onTouchMove);
        this.hammer.on("tiltend", this.onTouchUp);
        this.hammer.on("tiltcancel", this.onTouchUp);

        window.addEventListener("resize", this.updatePixelToSpeedMultiplier);
    }

    stop(): void {
        this.hammer.off("tiltstart", this.onTouchDown);
        this.hammer.off("tiltmove", this.onTouchMove);
        this.hammer.off("tiltend", this.onTouchUp);
        this.hammer.off("tiltcancel", this.onTouchUp);

        window.removeEventListener("resize", this.updatePixelToSpeedMultiplier);
    }

    update(delta: number, _map: Map): void {
        if (this.deltaAngle === 0) return;

        let smoothing = this.stiffness / (16.666 / delta);
        smoothing = MathUtils.clamp(smoothing, 0, 1);

        this.manager!.angle +=
            this.deltaAngle * smoothing * this.speed * this.pixelToSpeedMultiplierY;
        this.manager!.angle = softMax(
            this.manager!.angle,
            MapControls.getMaxPerspectiveAngleForDistance(this.manager!.distance),
            0.8,
        );

        this.deltaAngle *= 1 - smoothing;
        if (Math.abs(this.deltaAngle) < 0.0001) {
            this.deltaAngle = 0;
        }
    }

    reset(): void {
        this.deltaAngle = 0;
    }

    private onTouchDown = (evt: HammerInput) => {
        this.moving = true;
        this.deltaAngle = 0;
        this.lastY = evt.center.y;
    };

    private onTouchMove = (evt: HammerInput) => {
        if (this.moving) {
            this.deltaAngle -= evt.center.y - this.lastY;
        }

        this.lastY = evt.center.y;
    };

    private onTouchUp = (_evt: HammerInput) => {
        this.moving = false;
    };

    updatePixelToSpeedMultiplier = () => {
        this.pixelToSpeedMultiplierY = 1 / this.target.clientHeight;
    };
}
