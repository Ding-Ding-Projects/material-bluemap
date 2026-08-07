/**
 * Serves a map's own data over HTTP, out of a real {@link MapStorage} — tiles, settings,
 * textures and assets.
 *
 * upstream: `common/.../web/MapStorageRequestHandler.java`, mounted per configured map by
 * `Plugin.java` at `maps/{id}/(.*)` (via `RoutingRequestHandler`/`MapRequestHandler`). This
 * port keeps upstream's mount shape — `/maps/{id}/...` — but is a plain {@link HttpHandler}
 * added to this package's chain-of-responsibility `HttpServer`, exactly like
 * `RemoteProxyHandler`'s `/remote/{profileId}/...` and `packages/app`'s
 * `LocalMapHandler`'s `/local/{renderId}/...`. Both of those already exist in this
 * codebase; this is their third sibling, and the one that talks to a real
 * {@link MapStorage} instead of the filesystem (`LocalMapHandler`) or another HTTP server
 * (`RemoteProxyHandler`).
 *
 * ## What is deliberately NOT the same as `LocalMapHandler`
 *
 * `LocalMapHandler` reads two candidate files off disk (`<path>` and `<path>.gz`) because
 * it has no storage abstraction to ask. This handler has one — {@link GridStorage} and
 * {@link ItemStorage} already know how a tile or a document is compressed — so it ports
 * `MapStorageRequestHandler#writeToResponse` instead: the *requested* file extension is
 * never inspected (upstream's tile-matching regex discards it with a trailing `.*`), and
 * the response's `Content-Encoding` is decided purely from the stored {@link Compression}
 * and the request's `Accept-Encoding` header. A request for `.prbm` and a request for
 * `.prbm.gz` get an identical response.
 *
 * ## What is deliberately NOT the same as `RemoteProxyHandler`
 *
 * `RemoteProxyHandler` returns a real 404 for an unknown `profileId` rather than falling
 * through the handler chain, and `LocalMapHandler` does the same for an unknown
 * `renderId`. This handler follows that established local convention for an unmounted map
 * id too — once a request structurally matches `/maps/{id}/...` it is this handler's to
 * answer, definitively, rather than falling through to `StaticHandler` and producing a
 * confusing 404 for an unrelated static file.
 *
 * ## HTTP method
 *
 * Upstream's `HttpConnection`/`Server` never special-cases `HEAD` anywhere in this call
 * path — `MapStorageRequestHandler` reads `request.getMethod()` nowhere at all — so this
 * port does not either: every method gets the same body. The viewer only ever issues
 * `GET`, so nothing it depends on is affected by this.
 *
 * ## Live data
 *
 * upstream: `MapRequestHandler`'s constructor registers `live/sse`, `live/players.json`
 * and `live/markers.json` *on top of* this handler's own catch-all, so they take priority
 * over the raw-storage fallback above whenever a supplier is present. A mounted map here
 * always has a supplier — defaulting to the honest "nothing live yet" stubs in
 * `../live/liveDataStubs.js` when the caller does not pass a real one, since the desktop
 * app does not track live players yet (see that file's doc comment) — so those three
 * routes are handled unconditionally before the tile/meta logic below, exactly mirroring
 * upstream's registration order.
 */

import type * as http from "node:http";
import { Compression, type CompressedInputStream, type MapStorage } from "@worldlens/engine";
import type { HttpHandler } from "./HttpServer.js";
import { LiveDataBroadcaster } from "../live/LiveDataBroadcaster.js";
import { noLiveMarkers, noLivePlayers } from "../live/liveDataStubs.js";
import { SseConnectionManager } from "../live/SseConnectionManager.js";

/** upstream: `api/ContentTypeRegistry` (the api package) — the same suffix table, ported locally. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
    txt: "text/plain",
    css: "text/css",
    csv: "text/csv",
    htm: "text/html",
    html: "text/html",
    js: "text/javascript",
    xml: "text/xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    tif: "image/tiff",
    tiff: "image/tiff",
    svg: "image/svg+xml",
    json: "application/json",
    mp3: "audio/mpeg",
    oga: "audio/ogg",
    wav: "audio/wav",
    weba: "audio/webm",
    mp4: "video/mp4",
    mpeg: "video/mpeg",
    webm: "video/webm",
    ttf: "font/ttf",
    woff: "font/woff",
    woff2: "font/woff2",
};
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/** upstream: `ContentTypeRegistry.fromFileName(String)` */
function contentTypeFromFileName(fileName: string): string {
    const dot = fileName.lastIndexOf(".");
    if (dot < 0) return DEFAULT_CONTENT_TYPE;
    const slash = fileName.lastIndexOf("/");
    if (dot < slash) return DEFAULT_CONTENT_TYPE;
    return CONTENT_TYPES[fileName.slice(dot + 1)] ?? DEFAULT_CONTENT_TYPE;
}

/** upstream: `MapStorageRequestHandler.TILE_PATTERN` — same character classes, same groups. */
const TILE_PATTERN = /^tiles\/([\d/]+)\/x(-?[\d/]+)z(-?[\d/]+).*$/;

/** upstream: `TimeUnit.DAYS.toSeconds(1)` */
const ONE_DAY_SECONDS = 24 * 60 * 60;

const HIRES_CONTENT_TYPE = "application/octet-stream";
const LOWRES_CONTENT_TYPE = "image/png";

/**
 * upstream: `HttpHeader#contains` as used by `hasHeaderValue("Accept-Encoding", id)` —
 * split on `,`, trim each token, lowercase, exact-match. Deliberately NOT stripping a
 * `;q=...` quality suffix: upstream does not either, so `gzip;q=0.8` does not match `gzip`
 * here any more than it does there.
 */
function hasEncoding(headerValue: string | undefined, id: string): boolean {
    if (headerValue === undefined) return false;
    const wanted = id.toLowerCase();
    return headerValue
        .split(",")
        .some((token) => token.trim().toLowerCase() === wanted);
}

/** upstream: `new LiveDataSupplierBroadcaster<>(livePlayersDataSupplier, 1000)` */
const PLAYERS_POLL_INTERVAL_MS = 1000;
/** upstream: `new LiveDataSupplierBroadcaster<>(liveMarkerDataSupplier, 10000)` */
const MARKERS_POLL_INTERVAL_MS = 10_000;

export interface MapStorageMount {
    readonly mapId: string;
    readonly storage: MapStorage;
    /**
     * upstream: `MapRequestHandler`'s `livePlayersDataSupplier`. Defaults to the honest
     * "no live players" stub — see `../live/liveDataStubs.js`.
     */
    readonly livePlayers?: () => string;
    /** upstream: `MapRequestHandler`'s `liveMarkerDataSupplier`. Defaults to "no marker sets". */
    readonly liveMarkers?: () => string;
    /** upstream: `webserverConfig.isSseEnabled()`. Defaults to `true`. */
    readonly useSSE?: boolean;
    /**
     * upstream hard-codes this at `1000`; exposed only so a test need not sit through a
     * full second to see a poll happen — the same reasoning `RenderManagerOptions` gives
     * for exposing its own upstream-hard-coded intervals.
     */
    readonly playersPollIntervalMs?: number;
    /** upstream hard-codes this at `10000`; see {@link playersPollIntervalMs}. */
    readonly markersPollIntervalMs?: number;
}

interface ResolvedMount {
    readonly mapId: string;
    readonly storage: MapStorage;
    readonly useSSE: boolean;
    readonly sse: SseConnectionManager;
    readonly players: LiveDataBroadcaster;
    readonly markers: LiveDataBroadcaster;
}

export class MapStorageHandler implements HttpHandler {
    private readonly mounts = new Map<string, ResolvedMount>();

    /** upstream: the per-map construction inside `Plugin.java`'s webserver setup */
    setMount(mount: MapStorageMount): void {
        this.removeMount(mount.mapId);

        const sse = new SseConnectionManager();
        const players = new LiveDataBroadcaster(
            mount.livePlayers ?? noLivePlayers,
            mount.playersPollIntervalMs ?? PLAYERS_POLL_INTERVAL_MS,
        );
        const markers = new LiveDataBroadcaster(
            mount.liveMarkers ?? noLiveMarkers,
            mount.markersPollIntervalMs ?? MARKERS_POLL_INTERVAL_MS,
        );
        const useSSE = mount.useSSE ?? true;

        if (useSSE) {
            // upstream: `registerSseCallback` — only poll for changes to broadcast while
            // somebody is actually connected to `live/sse`.
            const onPlayers = (data: string): void => sse.broadcast("player", data);
            const onMarkers = (data: string): void => sse.broadcast("marker", data);
            sse.addHasConnectionsListener((hasConnections) => {
                if (hasConnections) {
                    players.addUpdateListener(onPlayers);
                    markers.addUpdateListener(onMarkers);
                } else {
                    players.removeUpdateListener(onPlayers);
                    markers.removeUpdateListener(onMarkers);
                }
            });
        }

        this.mounts.set(mount.mapId, { mapId: mount.mapId, storage: mount.storage, useSSE, sse, players, markers });
    }

    removeMount(mapId: string): void {
        const existing = this.mounts.get(mapId);
        if (existing === undefined) return;
        existing.sse.close();
        existing.players.close();
        existing.markers.close();
        this.mounts.delete(mapId);
    }

    getMount(mapId: string): MapStorageMount | null {
        const mount = this.mounts.get(mapId);
        if (mount === undefined) return null;
        return { mapId: mount.mapId, storage: mount.storage, useSSE: mount.useSSE };
    }

    getMounts(): MapStorageMount[] {
        return [...this.mounts.values()].map((mount) => ({
            mapId: mount.mapId,
            storage: mount.storage,
            useSSE: mount.useSSE,
        }));
    }

    /**
     * upstream: `MapRequestHandler#onTileUpdate` — broadcast to `live/sse` that a tile
     * changed. Upstream wires this straight to a live `BmMap`'s
     * `HiresModelManager`/`LowresTileManager` listeners; this package has no `BmMap` of its
     * own, so whatever drives a real render (see the render-manager work for #29) calls
     * this once a tile is actually written, instead of this handler inventing a `BmMap`
     * dependency it does not otherwise need.
     */
    notifyTileUpdate(mapId: string, x: number, z: number, lod: number): void {
        const mount = this.mounts.get(mapId);
        if (mount === undefined || !mount.useSSE) return;
        mount.sse.broadcast("tile", JSON.stringify({ x, y: z, lod }));
    }

    /** Diagnostic: how many `live/sse` clients are currently attached to a mounted map. */
    getSseConnectionCount(mapId: string): number {
        return this.mounts.get(mapId)?.sse.connectionCount() ?? 0;
    }

    async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
        const url = new URL(req.url ?? "/", "http://localhost");
        const match = /^\/maps\/([^/]+)\/(.*)$/.exec(url.pathname);
        if (match === null) return false;

        const [, rawMapId, rawRest] = match;
        let mapId: string;
        let rest: string;
        try {
            mapId = decodeURIComponent(rawMapId ?? "");
            rest = decodeURIComponent(rawRest ?? "");
        } catch {
            res.writeHead(400, { "content-type": "text/plain" });
            res.end("Bad Request");
            return true;
        }

        const mount = this.mounts.get(mapId);
        if (mount === undefined) {
            res.writeHead(404, { "content-type": "text/plain" });
            res.end("Unknown map");
            return true;
        }

        return await this.serve(req, res, mount, rest);
    }

    private async serve(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        mount: ResolvedMount,
        rawPath: string,
    ): Promise<boolean> {
        // upstream: normalize path (strip one leading and one trailing "/")
        let path = rawPath;
        if (path.startsWith("/")) path = path.slice(1);
        if (path.endsWith("/")) path = path.slice(0, -1);

        // upstream: `MapRequestHandler`'s own registrations, checked ahead of the
        // catch-all `MapStorageRequestHandler` below — see the class doc's "Live data" note.
        if (mount.useSSE && path === "live/sse") {
            mount.sse.open(req, res);
            return true;
        }
        if (path === "live/players.json") {
            this.respondJson(res, mount.players.get());
            return true;
        }
        if (path === "live/markers.json") {
            this.respondJson(res, mount.markers.get());
            return true;
        }

        try {
            const tileMatch = TILE_PATTERN.exec(path);
            if (tileMatch !== null) {
                const lodStr = tileMatch[1] ?? "";
                const xStr = (tileMatch[2] ?? "").replace(/\//g, "");
                const zStr = (tileMatch[3] ?? "").replace(/\//g, "");
                // upstream: Integer.parseInt throws NumberFormatException on a non-numeric
                // group (caught, ignored, falls through to NOT_FOUND below); mirrored here
                // as an explicit validity check rather than a thrown/caught exception.
                if (/^\d+$/.test(lodStr) && /^-?\d+$/.test(xStr) && /^-?\d+$/.test(zStr)) {
                    const lod = Number.parseInt(lodStr, 10);
                    const x = Number.parseInt(xStr, 10);
                    const z = Number.parseInt(zStr, 10);

                    const gridStorage = lod === 0 ? mount.storage.hiresTiles() : mount.storage.lowresTiles(lod);
                    const data = await gridStorage.read(x, z);
                    if (data === null) {
                        res.writeHead(204);
                        res.end();
                        return true;
                    }

                    await this.writeToResponse(req, res, data, {
                        "cache-control": `public, max-age=${String(ONE_DAY_SECONDS)}`,
                        "content-type": lod === 0 ? HIRES_CONTENT_TYPE : LOWRES_CONTENT_TYPE,
                    });
                    return true;
                }
            }

            const data = await this.readMeta(mount, path);
            if (data !== null) {
                await this.writeToResponse(req, res, data, {
                    "cache-control": `public, max-age=${String(ONE_DAY_SECONDS)}`,
                    "content-type": contentTypeFromFileName(path),
                });
                return true;
            }
        } catch (error) {
            console.error("[MapStorageHandler] Failed to read map data for web-request.", error);
            res.writeHead(500, { "content-type": "text/plain" });
            res.end("Internal Server Error");
            return true;
        }

        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not Found");
        return true;
    }

    /**
     * upstream: the meta-data `switch` in `MapStorageRequestHandler#handle`. `live/markers.json`
     * and `live/players.json` are deliberately absent here — they are always intercepted
     * earlier in {@link serve}, exactly as `MapRequestHandler`'s always-present suppliers
     * take priority over this catch-all upstream.
     */
    private readMeta(mount: ResolvedMount, path: string): Promise<CompressedInputStream | null> {
        switch (path) {
            case "settings.json":
                return mount.storage.settings().read();
            case "textures.json":
                return mount.storage.textures().read();
            default:
                if (path.startsWith("assets/")) {
                    return mount.storage.asset(path.slice("assets/".length)).read();
                }
                return Promise.resolve(null);
        }
    }

    /** upstream: `JsonDataRequestHandler#handle` */
    private respondJson(res: http.ServerResponse, body: string): void {
        const buf = Buffer.from(body, "utf-8");
        res.writeHead(200, {
            "cache-control": "no-cache",
            "content-type": "application/json",
            "content-length": String(buf.byteLength),
        });
        res.end(buf);
    }

    /** upstream: `MapStorageRequestHandler#writeToResponse` */
    private async writeToResponse(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        data: CompressedInputStream,
        headers: Record<string, string>,
    ): Promise<void> {
        const acceptEncoding = req.headers["accept-encoding"];
        const acceptEncodingValue = Array.isArray(acceptEncoding) ? acceptEncoding.join(",") : acceptEncoding;
        const compression = data.getCompression();

        let body: Buffer;
        if (compression !== Compression.NONE && hasEncoding(acceptEncodingValue, compression.getId())) {
            headers["content-encoding"] = compression.getId();
            body = data.getBuffer();
        } else if (
            compression !== Compression.GZIP &&
            headers["content-type"] !== "image/png" &&
            hasEncoding(acceptEncodingValue, Compression.GZIP.getId())
        ) {
            headers["content-encoding"] = Compression.GZIP.getId();
            body = await Compression.GZIP.compress(await data.decompress());
        } else {
            body = await data.decompress();
        }

        headers["content-length"] = String(body.byteLength);
        res.writeHead(200, headers);
        res.end(body);
    }
}
