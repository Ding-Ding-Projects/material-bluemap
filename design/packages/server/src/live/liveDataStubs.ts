/**
 * Honest "nothing live yet" suppliers — upstream's own JSON shape for zero online players
 * and zero configured marker sets, never invented data.
 *
 * The desktop app does not track live players yet; that is separate, later work
 * (`design/ROADMAP.md`'s "local live players" phase — issue #41 says so explicitly). Until
 * it exists, a mounted map still answers `live/players.json` and `live/markers.json` the
 * way upstream answers a real server with nobody online and no marker sets configured,
 * rather than 404ing an endpoint the viewer expects to always be able to poll.
 *
 * upstream: `common/.../live/LivePlayersDataSupplier.java` writes
 * `{"players":[<one object per online player>]}`; for zero players that is exactly
 * `{"players":[]}`.
 *
 * upstream: `common/.../live/LiveMarkersDataSupplier.java` writes
 * `MarkerGson.toJson(markerSets)` for a `Map<String, MarkerSet>`; for an empty map that is
 * `{}` — also the only document `BmMap#markerSets` can produce today, per
 * `docs/deviations.md`'s note on it (the markers API has not landed yet).
 */

export function noLivePlayers(): string {
    return JSON.stringify({ players: [] });
}

export function noLiveMarkers(): string {
    return "{}";
}
