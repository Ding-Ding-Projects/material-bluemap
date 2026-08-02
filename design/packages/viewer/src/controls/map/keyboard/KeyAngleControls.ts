import { MathUtils } from "three";
import { KeyCombination } from "../../KeyCombination";
import { softMax } from "../../../util/Utils";
import { MapControls } from "../MapControls";
import type { ControlsManager } from "../../ControlsManager";
import type { Map } from "../../../map/Map";

export class KeyAngleControls {
    static KEYS = {
        UP: [
            new KeyCombination("ArrowUp", KeyCombination.ALT),
            new KeyCombination("KeyW", KeyCombination.ALT),
            new KeyCombination("PageUp"),
        ],
        DOWN: [
            new KeyCombination("ArrowDown", KeyCombination.ALT),
            new KeyCombination("KeyS", KeyCombination.ALT),
            new KeyCombination("PageDown"),
        ],
    };

    target: EventTarget;
    manager: ControlsManager | null;

    deltaAngle: number;

    up: boolean;
    down: boolean;

    speed: number;
    stiffness: number;

    constructor(target: EventTarget, speed: number, stiffness: number) {
        this.target = target;
        this.manager = null;

        this.deltaAngle = 0;

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
        if (this.up) this.deltaAngle -= 1;
        if (this.down) this.deltaAngle += 1;

        if (this.deltaAngle === 0) return;

        let smoothing = this.stiffness / (16.666 / delta);
        smoothing = MathUtils.clamp(smoothing, 0, 1);

        this.manager!.angle += this.deltaAngle * smoothing * this.speed * delta * 0.06;
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

    onKeyDown = (evt: KeyboardEvent) => {
        if (KeyCombination.oneDown(evt, ...KeyAngleControls.KEYS.UP)) {
            this.up = true;
            evt.preventDefault();
        }
        if (KeyCombination.oneDown(evt, ...KeyAngleControls.KEYS.DOWN)) {
            this.down = true;
            evt.preventDefault();
        }
    };

    onKeyUp = (evt: KeyboardEvent) => {
        if (KeyCombination.oneUp(evt, ...KeyAngleControls.KEYS.UP)) {
            this.up = false;
        }
        if (KeyCombination.oneUp(evt, ...KeyAngleControls.KEYS.DOWN)) {
            this.down = false;
        }
    };

    onStop = (_evt: FocusEvent) => {
        this.up = false;
        this.down = false;
    };
}
