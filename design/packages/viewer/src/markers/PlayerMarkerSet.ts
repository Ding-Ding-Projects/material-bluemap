import { MarkerSet } from "./MarkerSet";
import type { MarkerSetData, MarkerSetDataInput } from "./MarkerSet";
import { alert } from "../util/Utils";
import { PlayerMarker } from "./PlayerMarker";
import type { PlayerLike } from "./PlayerMarker";
import type { Marker } from "./Marker";

export interface PlayerMarkerSetData extends MarkerSetData {
    playerheadsUrl: string;
}

export class PlayerMarkerSet extends MarkerSet {
    declare data: PlayerMarkerSetData;

    constructor(id: string, playerheadsUrl: string, data: MarkerSetDataInput | null = null) {
        super(id, data);
        this.data.label = "Player";
        this.data.toggleable = true;
        this.data.defaultHide = false;

        this.data.playerheadsUrl = playerheadsUrl;
    }

    updateFromPlayerData(data: { players?: PlayerLike[] }): boolean {
        if (!Array.isArray(data.players)) {
            this.clear();
            return false;
        }

        const updatedPlayerMarkers = new Set<Marker>();

        // update
        data.players.forEach((playerData) => {
            try {
                const playerMarker = this.updatePlayerMarkerFromData(playerData);
                updatedPlayerMarkers.add(playerMarker);
            } catch (err) {
                alert(this.events, err, "fine");
            }
        });

        // remove
        this.markers.forEach((playerMarker) => {
            if (!updatedPlayerMarkers.has(playerMarker)) {
                this.remove(playerMarker);
            }
        });

        return true;
    }

    updatePlayerMarkerFromData(markerData: PlayerLike): Marker {
        const playerUuid = markerData.uuid;
        if (!playerUuid) throw new Error("player-data has no uuid!");
        const markerId = this.getPlayerMarkerId(playerUuid);

        let marker: Marker | undefined = this.markers.get(markerId);

        // create new if not existent of wrong type
        if (!marker || !(marker as PlayerMarker).isPlayerMarker) {
            if (marker) this.remove(marker);
            marker = new PlayerMarker(
                markerId,
                playerUuid,
                `${this.data.playerheadsUrl}${playerUuid}.png`,
            );
            this.add(marker);
        }

        // update
        marker.updateFromData(markerData);

        // hide if from different world
        marker.visible = !markerData.foreign;

        return marker;
    }

    getPlayerMarker(playerUuid: string): Marker | undefined {
        return this.markers.get(this.getPlayerMarkerId(playerUuid));
    }

    getPlayerMarkerId(playerUuid: string): string {
        return "bm-player-" + playerUuid;
    }
}
