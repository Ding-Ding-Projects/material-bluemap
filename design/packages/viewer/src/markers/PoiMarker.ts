import { HtmlMarker } from "./HtmlMarker";
import type { HtmlMarkerData } from "./HtmlMarker";
import type { MarkerClickEvent } from "./ObjectMarker";
import { sanitizeHtml } from "../util/sanitize";

export interface PoiMarkerData extends HtmlMarkerData {
    detail: string | null;
}

export interface PoiMarkerDataInput {
    position?: { x?: number; y?: number; z?: number };
    anchor?: { x?: number; y?: number };
    iconAnchor?: { x?: number; y?: number };
    label?: string;
    detail?: string;
    sorting?: number;
    listed?: boolean;
    icon?: string;
    classes?: string[];
    minDistance?: number;
    maxDistance?: number;
}

export class PoiMarker extends HtmlMarker {
    declare readonly isPoiMarker: boolean;
    declare data: PoiMarkerData;

    iconElement: HTMLImageElement;
    labelElement: HTMLDivElement;

    _lastIcon: string | null | undefined;

    constructor(markerId: string) {
        super(markerId);
        Object.defineProperty(this, "isPoiMarker", { value: true });
        this.data.type = "poi";

        this.data.detail = null;

        this.html = `<img src="" alt="POI Icon (${this.data.id})" class="bm-marker-poi-icon" draggable="false" style="pointer-events: auto"><div class="bm-marker-poi-label"></div>`;

        this.iconElement = this.element.getElementsByTagName("img").item(0)!;
        this.labelElement = this.element.getElementsByTagName("div").item(0)!;

        this._lastIcon = null;
    }

    override onClick(event: MarkerClickEvent): boolean {
        if (event.data.doubleTap) return false;

        if (this.highlight || !this.data.label) return true;
        this.highlight = true;

        const eventHandler = (evt: Event) => {
            if (evt.composedPath().includes(this.element)) return;

            this.highlight = false;

            window.removeEventListener("mousedown", eventHandler);
            window.removeEventListener("touchstart", eventHandler);
            window.removeEventListener("keydown", eventHandler);
            window.removeEventListener("mousewheel", eventHandler);
        };

        setTimeout(function () {
            window.addEventListener("mousedown", eventHandler);
            window.addEventListener("touchstart", eventHandler, { passive: true });
            window.addEventListener("keydown", eventHandler);
            window.addEventListener("mousewheel", eventHandler);
        }, 0);

        return true;
    }

    set highlight(highlight: boolean) {
        if (highlight) {
            this.element.classList.add("bm-marker-highlight");
        } else {
            this.element.classList.remove("bm-marker-highlight");
        }
    }

    get highlight(): boolean {
        return this.element.classList.contains("bm-marker-highlight");
    }

    override updateFromData(markerData: PoiMarkerDataInput): void {
        // update position
        const pos = markerData.position || {};
        this.position.setX(pos.x || 0);
        this.position.setY(pos.y || 0);
        this.position.setZ(pos.z || 0);

        // update anchor
        const anch = markerData.anchor || markerData.iconAnchor || {}; //"iconAnchor" for backwards compatibility
        this.iconElement.style.transform = `translate(${-anch.x!}px, ${-anch.y!}px)`;
        //this.anchor.setX(anch.x || 0);
        //this.anchor.setY(anch.y || 0);

        // update label
        if (this.data.label !== markerData.label) {
            this.data.label = markerData.label || "";
        }

        //update sorting
        if (this.data.sorting !== markerData.sorting) {
            this.data.sorting = markerData.sorting || 0;
        }

        //update listed
        if (this.data.listed !== markerData.listed) {
            this.data.listed = markerData.listed === undefined ? true : markerData.listed;
        }

        // update detail
        if (this.data.detail !== markerData.detail) {
            this.data.detail = markerData.detail || this.data.label;
            this.labelElement.innerHTML = sanitizeHtml(this.data.detail || "");
        }

        // update icon
        if (this._lastIcon !== markerData.icon) {
            this.iconElement.src = markerData.icon || "assets/poi.svg";
            this._lastIcon = markerData.icon;
        }

        // update style-classes
        if (this.data.classes !== markerData.classes) {
            this.data.classes = markerData.classes!;
            const highlight = this.element.classList.contains("bm-marker-highlight");

            this.element.classList.value = `bm-marker-html`;
            if (highlight) this.element.classList.add("bm-marker-highlight");
            this.element.classList.add(...markerData.classes!);
        }

        // update min/max distances
        this.fadeDistanceMin = markerData.minDistance || 0;
        this.fadeDistanceMax =
            markerData.maxDistance !== undefined ? markerData.maxDistance : Number.MAX_VALUE;
    }
}
