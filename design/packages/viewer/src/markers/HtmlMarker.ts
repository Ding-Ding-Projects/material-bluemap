import type { Camera, Scene, Vector2, WebGLRenderer } from "three";
import { Marker } from "./Marker";
import type { MarkerData } from "./Marker";
import { CSS2DObject } from "../util/CSS2DRenderer";
import { htmlToElement } from "../util/Utils";
import { sanitizeHtml } from "../util/sanitize";

export interface HtmlMarkerData extends MarkerData {
    label: string | null;
    classes: string[];
}

export interface HtmlMarkerDataInput {
    position?: { x?: number; y?: number; z?: number };
    label?: string;
    sorting?: number;
    listed?: boolean;
    anchor?: { x?: number; y?: number };
    html?: string;
    classes?: string[];
    minDistance?: number;
    maxDistance?: number;
}

export class HtmlMarker extends Marker {
    declare readonly isHtmlMarker: boolean;
    declare data: HtmlMarkerData;

    elementObject: CSS2DObject;
    fadeDistanceMin: number;
    fadeDistanceMax: number;

    constructor(markerId: string) {
        super(markerId);
        Object.defineProperty(this, "isHtmlMarker", { value: true });
        this.data.type = "html";

        this.data.label = null;

        this.data.classes = [];

        this.elementObject = new CSS2DObject(
            htmlToElement(
                `<div id="bm-marker-${this.data.id}" class="bm-marker-${this.data.type}"></div>`,
            ),
        );
        this.elementObject.onBeforeRender = (renderer, scene, camera) =>
            this.onBeforeRender(renderer, scene, camera);

        this.fadeDistanceMin = 0;
        this.fadeDistanceMax = Number.MAX_VALUE;

        this.addEventListener("removed", () => {
            if (this.element?.parentNode) this.element.parentNode.removeChild(this.element);
        });

        this.add(this.elementObject);
    }

    override onBeforeRender = (renderer: WebGLRenderer, scene: Scene, camera: Camera): void => {
        if (this.fadeDistanceMax === Number.MAX_VALUE && this.fadeDistanceMin <= 0) {
            (this.element.parentNode as HTMLElement).style.opacity = undefined as unknown as string;
        } else {
            (this.element.parentNode as HTMLElement).style.opacity =
                Marker.calculateDistanceOpacity(
                    this.position,
                    camera,
                    this.fadeDistanceMin,
                    this.fadeDistanceMax,
                ).toString();
        }
    };

    get html(): string {
        return this.element.innerHTML;
    }

    set html(html: string) {
        this.element.innerHTML = sanitizeHtml(html);
    }

    get anchor(): Vector2 {
        return this.elementObject.anchor;
    }

    get element(): HTMLElement {
        return this.elementObject.element.getElementsByTagName("div")[0]!;
    }

    override updateFromData(markerData: HtmlMarkerDataInput): void {
        // update position
        const pos = markerData.position || {};
        this.position.setX(pos.x || 0);
        this.position.setY(pos.y || 0);
        this.position.setZ(pos.z || 0);

        // update label
        if (this.data.label !== markerData.label) {
            this.data.label = markerData.label || null;
        }

        //update sorting
        if (this.data.sorting !== markerData.sorting) {
            this.data.sorting = markerData.sorting || 0;
        }

        //update listed
        if (this.data.listed !== markerData.listed) {
            this.data.listed = markerData.listed === undefined ? true : markerData.listed;
        }

        // update anchor
        const anch = markerData.anchor || {};
        this.anchor.setX(anch.x || 0);
        this.anchor.setY(anch.y || 0);

        // update html
        if (this.element.innerHTML !== markerData.html) {
            this.element.innerHTML = sanitizeHtml(markerData.html || "");
        }

        // update style-classes
        if (this.data.classes !== markerData.classes) {
            this.data.classes = markerData.classes!;
            this.element.classList.value = `bm-marker-${this.data.type}`;
            this.element.classList.add(...markerData.classes!);
        }

        // update min/max distances
        this.fadeDistanceMin = markerData.minDistance || 0;
        this.fadeDistanceMax =
            markerData.maxDistance !== undefined ? markerData.maxDistance : Number.MAX_VALUE;
    }

    override dispose(): void {
        super.dispose();

        if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
    }
}
