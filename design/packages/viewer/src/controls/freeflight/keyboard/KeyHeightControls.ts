import { MathUtils } from "three";
import { KeyCombination } from "../../KeyCombination";
import type { ControlsManager } from "../../ControlsManager";
import type { Map } from "../../../map/Map";

export class KeyHeightControls {
    static KEYS = {
        UP: [new KeyCombination("Space"), new KeyCombination("PageUp")],
        DOWN: [
            new KeyCombination("ShiftLeft"),
            new KeyCombination("ShiftRight"),
            new KeyCombination("PageDown"),
        ],
    };

    target: EventTarget;
    manager: ControlsManager | null;

    deltaY: number;

    up: boolean;
    down: boolean;

    speed: number;
    stiffness: number;

    constructor(target: EventTarget, speed: number, stiffness: number) {
        this.target = target;
        this.manager = null;

        this.deltaY = 0;

        this.up = false;
        this.down = false;

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
        if (this.up) this.deltaY += 1;
        if (this.down) this.deltaY -= 1;

        if (this.deltaY === 0) return;

        let smoothing = this.stiffness / (16.666 / delta);
        smoothing = MathUtils.clamp(smoothing, 0, 1);

        this.manager!.position.y += this.deltaY * smoothing * this.speed * delta * 0.06;

        this.deltaY *= 1 - smoothing;
        if (Math.abs(this.deltaY) < 0.0001) {
            this.deltaY = 0;
        }
    }

    onKeyDown = (evt: KeyboardEvent) => {
        if (KeyCombination.oneUp(evt, ...KeyHeightControls.KEYS.UP)) {
            this.up = true;
            evt.preventDefault();
        } else if (KeyCombination.oneUp(evt, ...KeyHeightControls.KEYS.DOWN)) {
            this.down = true;
            evt.preventDefault();
        }
    };

    onKeyUp = (evt: KeyboardEvent) => {
        if (KeyCombination.oneUp(evt, ...KeyHeightControls.KEYS.UP)) {
            this.up = false;
        }
        if (KeyCombination.oneUp(evt, ...KeyHeightControls.KEYS.DOWN)) {
            this.down = false;
        }
    };

    onStop = (_evt: FocusEvent) => {
        this.up = false;
        this.down = false;
    };
}
