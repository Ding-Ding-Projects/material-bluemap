import { PlayerMarkerSet } from "./PlayerMarkerSet";
import { MarkerManager } from "./MarkerManager";
import type { MarkerSet } from "./MarkerSet";
import type { PlayerLike, PlayerMarker } from "./PlayerMarker";

export const PLAYER_MARKER_SET_ID = "bm-players";

export class PlayerMarkerManager extends MarkerManager {
    playerheadsUrl: string;

    /**
     * @param root - The scene to which all markers will be added
     * @param fileUrl - The marker file from which this manager updates its markers
     * @param playerheadsUrl - The url from which playerhead images should be loaded
     */
    constructor(
        root: MarkerSet,
        fileUrl: string,
        playerheadsUrl: string,
        events: EventTarget | null = null,
        paused: boolean = false,
    ) {
        super(root, fileUrl, events, paused);

        this.playerheadsUrl = playerheadsUrl;
    }

    override updateFromData(markerFileData: { players?: PlayerLike[] }): boolean {
        const playerMarkerSet = this.getPlayerMarkerSet(Array.isArray(markerFileData.players));
        if (!playerMarkerSet) return false;
        return playerMarkerSet.updateFromPlayerData(markerFileData);
    }

    private getPlayerMarkerSet(create: boolean = true): PlayerMarkerSet | undefined {
        let playerMarkerSet = this.root.markerSets.get(PLAYER_MARKER_SET_ID) as
            PlayerMarkerSet | undefined;

        if (!playerMarkerSet && create) {
            playerMarkerSet = new PlayerMarkerSet(PLAYER_MARKER_SET_ID, this.playerheadsUrl);
            this.root.add(playerMarkerSet);
        }

        return playerMarkerSet;
    }

    getPlayerMarker(playerUuid: string): PlayerMarker | undefined {
        return this.getPlayerMarkerSet()!.getPlayerMarker(playerUuid) as PlayerMarker | undefined;
    }

    override clear(): void {
        this.getPlayerMarkerSet(false)?.clear();
    }
}
