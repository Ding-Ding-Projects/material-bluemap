import type { Camera, Scene, WebGLRenderer } from "three";
import { Marker } from "./Marker";
import type { MarkerData } from "./Marker";
import { CSS2DObject } from "../util/CSS2DRenderer";
import { animate, EasingFunctions, htmlToElement } from "../util/Utils";
import { sanitizeHtml } from "../util/sanitize";

export interface PlayerMarkerData extends MarkerData {
    playerUuid: string;
    name: string;
    playerHead: string;
    rotation: { pitch: number; yaw: number };
    foreign: boolean | undefined;
}

export interface PlayerLike {
    uuid: string;
    name?: string;
    foreign?: boolean;
    position?: { x?: number; y?: number; z?: number };
    rotation?: { yaw?: number; pitch?: number; roll?: number };
}

export class PlayerMarker extends Marker {
    declare readonly isPlayerMarker: boolean;
    declare data: PlayerMarkerData;

    elementObject: CSS2DObject;
    playerHeadElement: HTMLImageElement;
    playerNameElement: HTMLDivElement;

    constructor(markerId: string, playerUuid: string, playerHead: string = "assets/steve.png") {
        super(markerId);
        Object.defineProperty(this, "isPlayerMarker", { value: true });
        this.data.type = "player";

        this.data.playerUuid = playerUuid;
        this.data.name = playerUuid;
        this.data.playerHead = playerHead;
        this.data.rotation = {
            pitch: 0,
            yaw: 0,
        };

        this.elementObject = new CSS2DObject(
            htmlToElement(`
<div id="bm-marker-${this.data.id}" class="bm-marker-${this.data.type}">
    <img src="${this.data.playerHead}" alt="playerhead" draggable="false">
    <div class="bm-player-name"></div>
</div>
        `),
        );
        this.elementObject.onBeforeRender = (renderer, scene, camera) =>
            this.onBeforeRender(renderer, scene, camera);

        this.playerHeadElement = this.element.getElementsByTagName("img")[0]!;
        this.playerNameElement = this.element.getElementsByTagName("div")[0]!;

        this.addEventListener("removed", () => {
            if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
        });

        this.playerHeadElement.addEventListener(
            "error",
            () => {
                this.playerHeadElement.src = "assets/steve.png";
            },
            { once: true },
        );

        this.add(this.elementObject);
    }

    get element(): HTMLDivElement {
        return this.elementObject.element.getElementsByTagName("div")[0]!;
    }

    override onBeforeRender = (renderer: WebGLRenderer, scene: Scene, camera: Camera): void => {
        const distance = Marker.calculateDistanceToCameraPlane(this.position, camera);

        let value = "near";
        if (distance > 1000) {
            value = "med";
        }
        if (distance > 5000) {
            value = "far";
        }

        this.element.setAttribute("distance-data", value);
    };

    override updateFromData(markerData: PlayerLike): void {
        // animate position update
        const pos = markerData.position || {};
        const rot = markerData.rotation || {};
        if (!this.position.x && !this.position.y && !this.position.z) {
            this.position.set(pos.x || 0, (pos.y || 0) + 1.8, pos.z || 0);
            this.data.rotation.pitch = rot.pitch || 0;
            this.data.rotation.yaw = rot.yaw || 0;
        } else {
            const startPos = {
                x: this.position.x,
                y: this.position.y,
                z: this.position.z,
                pitch: this.data.rotation.pitch,
                yaw: this.data.rotation.yaw,
            };
            const deltaPos = {
                x: (pos.x || 0) - startPos.x,
                y: (pos.y || 0) + 1.8 - startPos.y,
                z: (pos.z || 0) - startPos.z,
                pitch: (rot.pitch || 0) - startPos.pitch,
                yaw: (rot.yaw || 0) - startPos.yaw,
            };
            while (deltaPos.yaw > 180) deltaPos.yaw -= 360;
            while (deltaPos.yaw < -180) deltaPos.yaw += 360;

            if (deltaPos.x || deltaPos.y || deltaPos.z || deltaPos.pitch || deltaPos.yaw) {
                animate((progress) => {
                    const ease = EasingFunctions.easeInOutCubic!(progress);
                    this.position.set(
                        startPos.x + deltaPos.x * ease || 0,
                        startPos.y + deltaPos.y * ease || 0,
                        startPos.z + deltaPos.z * ease || 0,
                    );
                    this.data.rotation.pitch = startPos.pitch + deltaPos.pitch * ease || 0;
                    this.data.rotation.yaw = startPos.yaw + deltaPos.yaw * ease || 0;
                }, 1000);
            }
        }

        // update name
        const name = markerData.name || this.data.playerUuid;
        this.data.name = name;
        if (this.playerNameElement.innerHTML !== name)
            this.playerNameElement.innerHTML = sanitizeHtml(name);

        // update world
        this.data.foreign = markerData.foreign;
    }

    override dispose(): void {
        super.dispose();

        const element = this.elementObject.element;
        if (element.parentNode) element.parentNode.removeChild(element);
    }
}
