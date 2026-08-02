import { MathUtils } from "three";
import { KeyCombination } from "../../KeyCombination";
import type { ControlsManager } from "../../ControlsManager";
import type { Map } from "../../../map/Map";

export class KeyRotateControls {
    static KEYS = {
        LEFT: [
            new KeyCombination("ArrowLeft", KeyCombination.ALT),
            new KeyCombination("KeyA", KeyCombination.ALT),
            new KeyCombination("Delete"),
        ],
        RIGHT: [
            new KeyCombination("ArrowRight", KeyCombination.ALT),
            new KeyCombination("KeyD", KeyCombination.ALT),
            new KeyCombination("End"),
        ],
    };

    target: EventTarget;
    manager: ControlsManager | null;

    deltaRotation: number;

    left: boolean;
    right: boolean;

    speed: number;
    stiffness: number;

    constructor(target: EventTarget, speed: number, stiffness: number) {
        this.target = target;
        this.manager = null;

        this.deltaRotation = 0;

        this.left = false;
        this.right = false;

        this.speed = speed;
        this.stiffness = stiffness;
    }

    start(manager: ControlsManager): void {
        this.manager = manager;

        window.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("keyup", this.onKeyUp);
        window.addEventListener("blur", this.onStop);
    }

    stop(): void {
        window.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("keyup", this.onKeyUp);
        window.removeEventListener("blur", this.onStop);
    }

    update(delta: number, _map: Map): void {
        if (this.left) this.deltaRotation += 1;
        if (this.right) this.deltaRotation -= 1;

        if (this.deltaRotation === 0) return;

        let smoothing = this.stiffness / (16.666 / delta);
        smoothing = MathUtils.clamp(smoothing, 0, 1);

        this.manager!.rotation += this.deltaRotation * smoothing * this.speed * delta * 0.06;

        this.deltaRotation *= 1 - smoothing;
        if (Math.abs(this.deltaRotation) < 0.0001) {
            this.deltaRotation = 0;
        }
    }

    onKeyDown = (evt: KeyboardEvent) => {
        if (KeyCombination.oneDown(evt, ...KeyRotateControls.KEYS.LEFT)) {
            this.left = true;
            evt.preventDefault();
        }
        if (KeyCombination.oneDown(evt, ...KeyRotateControls.KEYS.RIGHT)) {
            this.right = true;
            evt.preventDefault();
        }
    };

    onKeyUp = (evt: KeyboardEvent) => {
        if (KeyCombination.oneUp(evt, ...KeyRotateControls.KEYS.LEFT)) {
            this.left = false;
        }
        if (KeyCombination.oneUp(evt, ...KeyRotateControls.KEYS.RIGHT)) {
            this.right = false;
        }
    };

    onStop = (_evt: FocusEvent) => {
        this.left = false;
        this.right = false;
    };
}
