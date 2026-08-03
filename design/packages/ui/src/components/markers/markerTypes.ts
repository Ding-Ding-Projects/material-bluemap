import type { MarkerData, MarkerSetData } from "@material-bluemap/viewer";

/**
 * The marker menu never sees the three.js marker objects, only the reactive `data`
 * objects the viewer publishes (`MarkerSet.data`, `Marker.data`). Those are plain
 * reactive records, and the subtype fields the menu needs are declared on subclasses:
 * `label` on {@link ObjectMarkerData}/{@link HtmlMarkerData}, and
 * `name`/`playerUuid`/`playerHead`/`foreign` on {@link PlayerMarkerData}. This widened
 * shape lets one list render every marker type without narrowing per row.
 */
export interface AnyMarkerData extends MarkerData {
    label?: string | null;
    detail?: string | null;
    name?: string;
    playerUuid?: string;
    /**
     * Fully-resolved player-head URL, built by `PlayerMarkerSet` from the map's
     * `mapDataRoot`. Upstream's MarkerItem re-derived this from a `mapId` captured once
     * at setup, which both went stale after a map switch and ignored this port's
     * per-profile data root; reading it from the marker keeps both correct.
     */
    playerHead?: string;
    foreign?: boolean;
}

/** {@link MarkerSetData} with its children widened to {@link AnyMarkerData}. */
export type AnyMarkerSetData = Omit<MarkerSetData, "markers" | "markerSets"> & {
    markers: AnyMarkerData[];
    markerSets: AnyMarkerSetData[];
};

/** Minimal position shape, so the filter module needs no dependency on three.js. */
export interface Vec3Like {
    x: number;
    y: number;
    z: number;
}

/** Controls expose their own reactive `data` object; only the follow state is read here. */
export interface FollowingPlayerLike {
    id?: string;
}

export interface FollowCapableControlsData {
    followingPlayer?: FollowingPlayerLike | null;
}

export interface FollowCapableControls {
    followPlayerMarker?(marker: object): void;
    stopFollowingPlayerMarker?(): void;
}
