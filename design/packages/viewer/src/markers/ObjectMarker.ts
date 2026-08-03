import { Vector3 } from "three";
import type { Intersection, Object3D } from "three";
import { Marker } from "./Marker";
import type { MarkerData } from "./Marker";
import { CSS2DObject } from "../util/CSS2DRenderer";
import { animate, htmlToElement } from "../util/Utils";
import { sanitizeHtml } from "../util/sanitize";

export interface MarkerClickEventData {
    doubleTap?: boolean;
    [key: string]: unknown;
}

export interface MarkerClickEvent {
    event?: Event;
    data: MarkerClickEventData;
    intersection?: Intersection & { pointOnLine?: Vector3 | null };
    eventStack?: Object3D[];
}

declare module "three" {
    interface Object3D {
        /**
         * Consumes a map-interaction on this object.
         * The default implementation (installed on Object3D.prototype in BlueMap.ts) bubbles
         * the event up the parent-chain.
         * @returns whether the event has been consumed (true) or not (false)
         */
        onClick(event: MarkerClickEvent): boolean;
    }
}

export interface ObjectMarkerData extends MarkerData {
    label: string | null;
    detail: string | null;
    link: string | null;
    newTab: boolean;
}

export interface ObjectMarkerDataInput {
    position?: { x?: number; y?: number; z?: number };
    label?: string;
    detail?: string;
    sorting?: number;
    listed?: boolean;
    link?: string;
    newTab?: boolean;
}

export class ObjectMarker extends Marker {
    declare readonly isObjectMarker: boolean;
    declare data: ObjectMarkerData;

    lastClick: number;

    constructor(markerId: string) {
        super(markerId);
        Object.defineProperty(this, "isObjectMarker", { value: true });
        this.data.type = "object";

        this.data.label = null;
        this.data.detail = null;
        this.data.link = null;
        this.data.newTab = true;

        this.lastClick = -1;
    }

    override onClick(event: MarkerClickEvent): boolean {
        const pos = new Vector3();
        if (event.intersection) {
            pos.copy(event.intersection.pointOnLine || event.intersection.point);
            pos.sub(this.position);
        }

        if (event.data.doubleTap) return false;

        if (this.data.detail || this.data.label) {
            const popup = new LabelPopup((this.data.detail || this.data.label)!);
            popup.position.copy(pos);
            this.add(popup);
            popup.open();
        }

        if (this.data.link) {
            window.open(this.data.link, this.data.newTab ? "_blank" : "_self");
        }

        return true;
    }

    override updateFromData(markerData: ObjectMarkerDataInput): void {
        // update position
        const pos = markerData.position || {};
        this.position.setX(pos.x || 0);
        this.position.setY(pos.y || 0);
        this.position.setZ(pos.z || 0);

        // update label
        this.data.label = markerData.label || null;

        //update detail
        this.data.detail = markerData.detail || null;

        //update sorting
        this.data.sorting = markerData.sorting || 0;

        //update listed
        this.data.listed = markerData.listed === undefined ? true : markerData.listed;

        // update link
        this.data.link = markerData.link || null;
        this.data.newTab = !!markerData.newTab;
    }
}

export class LabelPopup extends CSS2DObject {
    constructor(label: string) {
        super(htmlToElement(`<div class="bm-marker-labelpopup">${sanitizeHtml(label)}</div>`));
    }

    /**
     * @param autoClose - whether this object should be automatically closed and removed again on any other interaction
     */
    open(autoClose: boolean = true): void {
        const targetOpacity = Number(this.element.style.opacity || 1);

        this.element.style.opacity = "0";
        const inAnimation = animate((progress) => {
            this.element.style.opacity = (progress * targetOpacity).toString();
        }, 300);

        if (autoClose) {
            const removeHandler = (evt: Event) => {
                if (evt.composedPath().includes(this.element)) return;

                inAnimation.cancel();
                this.close();

                window.removeEventListener("mousedown", removeHandler);
                window.removeEventListener("touchstart", removeHandler);
                window.removeEventListener("keydown", removeHandler);
                window.removeEventListener("mousewheel", removeHandler);
            };

            // add listeners delayed to prevent closing
            window.setTimeout(() => {
                window.addEventListener("mousedown", removeHandler);
                window.addEventListener("touchstart", removeHandler, { passive: true });
                window.addEventListener("keydown", removeHandler);
                window.addEventListener("mousewheel", removeHandler);
            }, 100);
        }
    }

    /**
     * @param remove - whether this object should be removed from its parent when the close-animation finished
     */
    close(remove: boolean = true): void {
        const startOpacity = parseFloat(this.element.style.opacity);

        animate(
            (progress) => {
                this.element.style.opacity = (startOpacity - progress * startOpacity).toString();
            },
            300,
            (completed) => {
                if (remove && completed && this.parent) {
                    this.parent.remove(this);
                }
            },
        );
    }
}
