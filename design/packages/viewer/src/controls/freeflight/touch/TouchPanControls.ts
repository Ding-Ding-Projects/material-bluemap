import { MathUtils, Vector2 } from "three";
import type { ControlsManager } from "../../ControlsManager";
import type { Map } from "../../../map/Map";

export class TouchPanControls {
    static tempVec2_1 = new Vector2();

    target: Element;
    hammer: HammerManager;
    manager: ControlsManager | null;

    moving: boolean;
    lastPosition: Vector2;
    deltaPosition: Vector2;

    speed: number;
    stiffness: number;

    pixelToSpeedMultiplierX: number;
    pixelToSpeedMultiplierY: number;

    constructor(target: Element, hammer: HammerManager, speed: number, stiffness: number) {
        this.target = target;
        this.hammer = hammer;
        this.manager = null;

        this.moving = false;
        this.lastPosition = new Vector2();
        this.deltaPosition = new Vector2();

        this.speed = speed;
        this.stiffness = stiffness;

        this.pixelToSpeedMultiplierX = 0;
        this.pixelToSpeedMultiplierY = 0;
        this.updatePixelToSpeedMultiplier();
    }

    start(manager: ControlsManager): void {
        this.manager = manager;

        this.hammer.on("movestart", this.onTouchDown);
        this.hammer.on("movemove", this.onTouchMove);
        this.hammer.on("moveend", this.onTouchUp);
        this.hammer.on("movecancel", this.onTouchUp);

        window.addEventListener("resize", this.updatePixelToSpeedMultiplier);
    }

    stop(): void {
        this.hammer.off("movestart", this.onTouchDown);
        this.hammer.off("movemove", this.onTouchMove);
        this.hammer.off("moveend", this.onTouchUp);
        this.hammer.off("movecancel", this.onTouchUp);

        window.removeEventListener("resize", this.updatePixelToSpeedMultiplier);
    }

    update(delta: number, _map: Map): void {
        if (this.deltaPosition.x === 0 && this.deltaPosition.y === 0) return;

        let smoothing = this.stiffness / (16.666 / delta);
        smoothing = MathUtils.clamp(smoothing, 0, 1);

        this.manager!.rotation +=
            this.deltaPosition.x * this.speed * this.pixelToSpeedMultiplierX * this.stiffness;
        this.manager!.angle -=
            this.deltaPosition.y * this.speed * this.pixelToSpeedMultiplierY * this.stiffness;

        this.deltaPosition.multiplyScalar(1 - smoothing);
        if (this.deltaPosition.lengthSq() < 0.0001) {
            this.deltaPosition.set(0, 0);
        }
    }

    reset(): void {
        this.deltaPosition.set(0, 0);
    }

    private onTouchDown = (evt: HammerInput) => {
        if (evt.pointerType === "mouse") return;

        this.moving = true;
        this.deltaPosition.set(0, 0);
        this.lastPosition.set(evt.center.x, evt.center.y);
    };

    private onTouchMove = (evt: HammerInput) => {
        if (evt.pointerType === "mouse") return;

        const position = TouchPanControls.tempVec2_1.set(evt.center.x, evt.center.y);

        if (this.moving) {
            this.deltaPosition.sub(position).add(this.lastPosition);
        }

        this.lastPosition.copy(position);
    };

    private onTouchUp = (evt: HammerInput) => {
        if (evt.pointerType === "mouse") return;

        this.moving = false;
    };

    updatePixelToSpeedMultiplier = () => {
        this.pixelToSpeedMultiplierX =
            (1 / this.target.clientWidth) * (this.target.clientWidth / this.target.clientHeight);
        this.pixelToSpeedMultiplierY = 1 / this.target.clientHeight;
    };
}
