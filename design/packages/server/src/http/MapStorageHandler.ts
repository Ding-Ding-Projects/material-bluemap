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
 */

import type * as http from "node:http";
import { Compression, type CompressedInputStream, type MapStorage } from "@material-bluemap/engine";
import type { HttpHandler } from "./HttpServer.js";

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

export interface MapStorageMount {
    readonly mapId: string;
    readonly storage: MapStorage;
}

export class MapStorageHandler implements HttpHandler {
    private readonly mounts = new Map<string, MapStorageMount>();

    setMount(mount: MapStorageMount): void {
        this.mounts.set(mount.mapId, mount);
    }

    removeMount(mapId: string): void {
        this.mounts.delete(mapId);
    }

    getMount(mapId: string): MapStorageMount | null {
        return this.mounts.get(mapId) ?? null;
    }

    getMounts(): MapStorageMount[] {
        return [...this.mounts.values()];
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
        mount: MapStorageMount,
        rawPath: string,
    ): Promise<boolean> {
        // upstream: normalize path (strip one leading and one trailing "/")
        let path = rawPath;
        if (path.startsWith("/")) path = path.slice(1);
        if (path.endsWith("/")) path = path.slice(0, -1);

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

    /** upstream: the meta-data `switch` in `MapStorageRequestHandler#handle` */
    private readMeta(mount: MapStorageMount, path: string): Promise<CompressedInputStream | null> {
        switch (path) {
            case "settings.json":
                return mount.storage.settings().read();
            case "textures.json":
                return mount.storage.textures().read();
            case "live/markers.json":
                return mount.storage.markers().read();
            case "live/players.json":
                return mount.storage.players().read();
            default:
                if (path.startsWith("assets/")) {
                    return mount.storage.asset(path.slice("assets/".length)).read();
                }
                return Promise.resolve(null);
        }
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
