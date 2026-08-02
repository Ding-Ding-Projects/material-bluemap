import { MarkerManager } from "./MarkerManager";
import { PLAYER_MARKER_SET_ID } from "./PlayerMarkerManager";
import type { MarkerSet, MarkerSetDataInput } from "./MarkerSet";

export class NormalMarkerManager extends MarkerManager {
    /**
     * @param root - The scene to which all markers will be added
     * @param fileUrl - The marker file from which this manager updates its markers
     */
    constructor(
        root: MarkerSet,
        fileUrl: string,
        events: EventTarget | null = null,
        paused: boolean = false,
    ) {
        super(root, fileUrl, events, paused);
    }

    override updateFromData(markerData: Record<string, MarkerSetDataInput>): boolean {
        this.root.updateMarkerSetsFromData(markerData, [PLAYER_MARKER_SET_ID, "bm-popup-set"]);
        return true;
    }

    override clear(): void {
        this.root.updateMarkerSetsFromData({}, [PLAYER_MARKER_SET_ID, "bm-popup-set"]);
    }
}
