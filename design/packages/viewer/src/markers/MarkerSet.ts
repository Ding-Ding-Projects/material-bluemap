import { Scene } from "three";
import type { Object3D } from "three";
import { alert } from "../util/Utils";
import { ShapeMarker } from "./ShapeMarker";
import { ExtrudeMarker } from "./ExtrudeMarker";
import { LineMarker } from "./LineMarker";
import { HtmlMarker } from "./HtmlMarker";
import { PoiMarker } from "./PoiMarker";
import { makeReactive } from "../util/reactivity";
import { getLocalStorage, setLocalStorage } from "../Utils";
import type { Marker, MarkerData } from "./Marker";

export interface MarkerSetData {
    id: string;
    label: string;
    toggleable: boolean;
    defaultHide: boolean;
    sorting: number;
    markerSets: MarkerSetData[];
    markers: MarkerData[];
    visible: boolean;
    readonly listed: boolean;
    saveState: () => void;
}

export interface MarkerDataInput {
    type?: string;
}

export interface MarkerSetDataInput {
    label?: string;
    toggleable?: boolean;
    defaultHidden?: boolean;
    sorting?: number;
    markerSets?: Record<string, MarkerSetDataInput>;
    markers?: Record<string, MarkerDataInput>;
}

export class MarkerSet extends Scene {
    declare readonly isMarkerSet: boolean;

    markerSets: Map<string, MarkerSet>;
    markers: Map<string, Marker>;

    data: MarkerSetData;

    declare events?: EventTarget | null;

    constructor(id: string, data: MarkerSetDataInput | null = null) {
        super();
        Object.defineProperty(this, "isMarkerSet", { value: true });

        this.markerSets = new Map();
        this.markers = new Map();

        this.data = makeReactive<MarkerSetData>({
            id: id,
            label: id,
            toggleable: true,
            defaultHide: false,
            sorting: 0,
            markerSets: [],
            markers: [],
            visible: this.visible,
            get listed() {
                return (
                    this.toggleable ||
                    this.markers.filter((marker: MarkerData) => marker.listed).length > 0 ||
                    this.markerSets.filter((markerSet: MarkerSetData) => markerSet.listed).length >
                        0
                );
            },
            saveState: () => {
                setLocalStorage(this.localStorageKey("visible"), this.visible);
            },
        });

        Object.defineProperty(this, "visible", {
            get(this: MarkerSet) {
                return this.data.visible;
            },
            set(this: MarkerSet, value: boolean) {
                this.data.visible = value;
            },
        });

        if (data) {
            this.updateFromData(data);
        }

        if (this.data.toggleable) {
            const storedVisible = getLocalStorage(this.localStorageKey("visible"));
            if (storedVisible !== undefined) {
                this.visible = !!storedVisible;
            } else if (this.data.defaultHide) {
                this.visible = false;
            }
        }
    }

    updateFromData(data: MarkerSetDataInput): void {
        // update set info
        this.data.label = data.label || this.data.id;
        this.data.toggleable = !!data.toggleable;
        this.data.defaultHide = !!data.defaultHidden;
        this.data.sorting = data.sorting || this.data.sorting;

        // update markerSets
        this.updateMarkerSetsFromData(data.markerSets);

        // update markers
        this.updateMarkersFromData(data.markers);
    }

    updateMarkerSetsFromData(
        data: Record<string, MarkerSetDataInput> = {},
        ignore: string[] = [],
    ): void {
        const updatedMarkerSets = new Set<string>(ignore);

        // add & update MarkerSets
        Object.keys(data).forEach((markerSetId) => {
            if (updatedMarkerSets.has(markerSetId)) return;
            updatedMarkerSets.add(markerSetId);

            const markerSetData = data[markerSetId]!;
            try {
                this.updateMarkerSetFromData(markerSetId, markerSetData);
            } catch (err) {
                alert(this.events, err, "fine");
            }
        });

        // remove not updated MarkerSets
        this.markerSets.forEach((markerSet, setId) => {
            if (!updatedMarkerSets.has(setId)) {
                this.remove(markerSet);
            }
        });
    }

    updateMarkerSetFromData(markerSetId: string, data: MarkerSetDataInput): void {
        let markerSet = this.markerSets.get(markerSetId);

        if (!markerSet) {
            // create new if not existent
            markerSet = new MarkerSet(markerSetId, data);
            this.add(markerSet);
        } else {
            // update
            markerSet.updateFromData(data);
        }
    }

    updateMarkersFromData(data: Record<string, MarkerDataInput> = {}, ignore: string[] = []): void {
        const updatedMarkers = new Set<string>(ignore);

        Object.keys(data).forEach((markerId) => {
            if (updatedMarkers.has(markerId)) return;

            const markerData = data[markerId]!;
            try {
                this.updateMarkerFromData(markerId, markerData);
                updatedMarkers.add(markerId);
            } catch (err) {
                alert(this.events, err, "fine");
                console.debug(err);
            }
        });

        // remove not updated Markers
        this.markers.forEach((marker, markerId) => {
            if (!updatedMarkers.has(markerId)) {
                this.remove(marker);
            }
        });
    }

    updateMarkerFromData(markerId: string, data: MarkerDataInput): void {
        if (!data.type) throw new Error("marker-data has no type!");
        let marker: Marker | undefined = this.markers.get(markerId);

        // create new if not existent of wrong type
        if (!marker || marker.data.type !== data.type) {
            if (marker) this.remove(marker);

            switch (data.type) {
                case "shape":
                    marker = new ShapeMarker(markerId);
                    break;
                case "extrude":
                    marker = new ExtrudeMarker(markerId);
                    break;
                case "line":
                    marker = new LineMarker(markerId);
                    break;
                case "html":
                    marker = new HtmlMarker(markerId);
                    break;
                case "poi":
                    marker = new PoiMarker(markerId);
                    break;
                default:
                    throw new Error(`Unknown marker-type: '${data.type}'`);
            }

            this.add(marker);
        }

        // update marker
        marker.updateFromData(data);
    }

    /**
     * Removes all markers and marker-sets
     */
    override clear(): this {
        [...this.markerSets.values()].forEach((markerSet) => this.remove(markerSet));
        [...this.markers.values()].forEach((marker) => this.remove(marker));
        return this;
    }

    override add(...object: Object3D[]): this {
        if (object.length === 1) {
            //super.add() will re-invoke this method for each array-entry if it's more than one
            const o = object[0]!;
            const markerSet = o as MarkerSet;
            const marker = o as Marker;
            if (markerSet.isMarkerSet && !this.markerSets.has(markerSet.data.id)) {
                this.markerSets.set(markerSet.data.id, markerSet);
                this.data.markerSets.push(markerSet.data);
            }
            if (marker.isMarker && !this.markers.has(marker.data.id)) {
                this.markers.set(marker.data.id, marker);
                this.data.markers.push(marker.data);
            }
        }

        return super.add(...object);
    }

    override remove(...object: Object3D[]): this {
        if (object.length === 1) {
            //super.remove() will re-invoke this method for each array-entry if it's more than one
            const o = object[0]!;
            const markerSet = o as MarkerSet;
            const marker = o as Marker;
            if (markerSet.isMarkerSet) {
                const i = this.data.markerSets.indexOf(markerSet.data);
                if (i > -1) this.data.markerSets.splice(i, 1);
                this.markerSets.delete(markerSet.data.id);
                markerSet.dispose();
            }
            if (marker.isMarker) {
                const i = this.data.markers.indexOf(marker.data);
                if (i > -1) this.data.markers.splice(i, 1);
                this.markers.delete(marker.data.id);
                marker.dispose();
            }
        }

        return super.remove(...object);
    }

    dispose(): void {
        this.children.forEach((child) => {
            const disposable = child as Object3D & { dispose?: () => void };
            if (disposable.dispose) disposable.dispose();
        });
    }

    localStorageKey(key: string): string {
        return "bluemap-markerset-" + encodeURIComponent(this.data.id) + "-" + key;
    }
}
