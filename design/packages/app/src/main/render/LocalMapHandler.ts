/**
 * Serving a locally rendered map, exactly as the viewer serves a remote one.
 *
 * A render's output is a static web root, so the viewer can open it the same way it
 * opens a server on the internet: mount it at a path and hand `BlueMapApp` that path as
 * its `dataRoot`. `RemoteProxyHandler` already does this for remote instances at
 * `/remote/{profileId}/...`; this is its local twin at `/local/{renderId}/...`, and the
 * viewer cannot tell the two apart, which is the point.
 *
 * ## What is served, and what deliberately is not
 *
 * Only two things: the webapp's `settings.json`, and everything under `maps/`. The
 * render also leaves upstream's own webapp in the same directory when it is asked to
 * generate one - `index.html`, its bundle, and a `sql.php` - and none of that is
 * reachable through this handler. Upstream's own file handler refuses `.php` for the
 * obvious reason; scoping this one to the paths the viewer actually asks for means the
 * question never arises.
 *
 * ## Compression
 *
 * The engine writes hires tiles gzip-compressed, so the file on disk for the tile the
 * viewer calls `tiles/0/x0/z1/0.prbm` is `tiles/0/x0/z1/0.prbm.gz`. The viewer asks for
 * either name depending on its `clientDecompression` setting, and both are answered:
 *
 * - an exact file wins, served as-is. That is the `.prbm.gz` request, and the raw gzip
 *   bytes are what the viewer wants to decompress itself;
 * - failing that, `<path>.gz` is served with `Content-Encoding: gzip` when the client
 *   accepts gzip, and decompressed here when it does not.
 *
 * This is what upstream's `MapStorageRequestHandler.writeToResponse` does, arrived at
 * the same way, including the part that matters most: **a missing tile is 204, not
 * 404.** A world is a sparse grid and most tile requests are for tiles that were never
 * rendered because there is nothing there. The viewer treats 204 as empty space; a 404
 * would make ordinary empty terrain look like a broken server.
 */

import type * as http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { normalize, resolve, sep } from "node:path";
import type { HttpHandler } from "@material-bluemap/server";

const gunzipAsync = promisify(gunzip);

/** Upstream's own mapping, from `MapStorageRequestHandler`. */
const HIRES_CONTENT_TYPE = "application/octet-stream";
const LOWRES_CONTENT_TYPE = "image/png";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
    json: "application/json",
    png: LOWRES_CONTENT_TYPE,
    prbm: HIRES_CONTENT_TYPE,
    gz: "application/gzip",
};

export interface LocalMapMount {
    readonly renderId: string;
    /** The webapp root: `settings.json` at the top, `maps/` beneath it. */
    readonly webRoot: string;
    /** For a report: which engine produced what is being served. */
    readonly engineLabel: string;
}

/**
 * Mounts rendered maps under `/local/{renderId}/`.
 *
 * One handler for every render rather than one per render, mirroring
 * `RemoteProxyHandler`'s profile map: mounts come and go as renders finish, and adding
 * a handler to the server for each one would grow the dispatch chain forever.
 */
export class LocalMapHandler implements HttpHandler {
    private readonly mounts = new Map<string, LocalMapMount>();

    setMount(mount: LocalMapMount): void {
        this.mounts.set(mount.renderId, { ...mount, webRoot: resolve(mount.webRoot) });
    }

    removeMount(renderId: string): void {
        this.mounts.delete(renderId);
    }

    getMounts(): LocalMapMount[] {
        return [...this.mounts.values()];
    }

    getMount(renderId: string): LocalMapMount | null {
        return this.mounts.get(renderId) ?? null;
    }

    /** The path a viewer should be given as its `dataRoot`. */
    static dataRoot(renderId: string): string {
        return `/local/${encodeURIComponent(renderId)}`;
    }

    async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
        const url = new URL(req.url ?? "/", "http://localhost");
        const match = /^\/local\/([^/]+)\/(.*)$/.exec(url.pathname);
        if (match === null) return false;

        const [, rawRenderId, rawPath] = match;
        if (rawRenderId === undefined || rawPath === undefined) return false;

        if (req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405, { "content-type": "text/plain" });
            res.end("Method Not Allowed");
            return true;
        }

        const mount = this.mounts.get(decodeURIComponent(rawRenderId));
        if (mount === undefined) {
            res.writeHead(404, { "content-type": "text/plain" });
            res.end("Unknown local render");
            return true;
        }

        let relative: string;
        try {
            relative = decodeURIComponent(rawPath);
        } catch {
            res.writeHead(400, { "content-type": "text/plain" });
            res.end("Bad Request");
            return true;
        }

        if (!isServable(relative)) {
            res.writeHead(404, { "content-type": "text/plain" });
            res.end("Not Found");
            return true;
        }

        const filePath = resolveInside(mount.webRoot, relative);
        if (filePath === null) {
            res.writeHead(400, { "content-type": "text/plain" });
            res.end("Bad Request");
            return true;
        }

        return await this.serve(req, res, filePath, relative);
    }

    private async serve(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        filePath: string,
        relative: string,
    ): Promise<boolean> {
        const direct = await fileStat(filePath);
        if (direct !== null) {
            return await sendFile(req, res, filePath, direct.size, direct.mtimeMs, relative, false);
        }

        const compressed = `${filePath}.gz`;
        const gz = await fileStat(compressed);
        if (gz !== null) {
            return await sendFile(req, res, compressed, gz.size, gz.mtimeMs, relative, true);
        }

        // Nothing on disk under either name. For a tile that means "nothing was
        // rendered here", which is ordinary rather than exceptional, and upstream
        // answers it with 204. Everything else is a genuine 404.
        if (isTilePath(relative)) {
            res.writeHead(204);
            res.end();
            return true;
        }
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not Found");
        return true;
    }
}

/**
 * Only the paths the viewer actually loads.
 *
 * `settings.json` is the webapp's own; everything else must live under `maps/`, which
 * covers each map's `settings.json`, `textures.json[.gz]`, `tiles/...`, `live/...` and
 * `assets/...`. Anything outside that set is not part of a map and is not served.
 */
function isServable(relative: string): boolean {
    if (relative === "settings.json") return true;
    return relative.startsWith("maps/") && relative.length > "maps/".length;
}

const TILE_PATH = /^maps\/[^/]+\/tiles\//;

function isTilePath(relative: string): boolean {
    return TILE_PATH.test(relative);
}

/**
 * Joins a request path onto the root and proves the result is still inside it.
 *
 * Normalising first and comparing afterwards is the order that matters: `maps/../..`
 * only stops looking innocent once it has been collapsed. The trailing separator on the
 * prefix is what stops `<root>-elsewhere` from passing a naive `startsWith`.
 */
function resolveInside(root: string, relative: string): string | null {
    if (relative.includes("\0")) return null;
    const candidate = resolve(root, normalize(relative));
    const prefix = root.endsWith(sep) ? root : root + sep;
    return candidate.startsWith(prefix) ? candidate : null;
}

async function fileStat(path: string): Promise<{ size: number; mtimeMs: number } | null> {
    try {
        const stats = await stat(path);
        if (!stats.isFile()) return null;
        return { size: stats.size, mtimeMs: stats.mtimeMs };
    } catch {
        return null;
    }
}

function contentTypeFor(relative: string): string {
    // Read off the *requested* name, not the file on disk: a request for `.prbm` that
    // is answered from `.prbm.gz` is still a hires tile, and saying `application/gzip`
    // would describe the transfer encoding as though it were the content.
    const withoutGz = relative.endsWith(".gz") ? relative.slice(0, -3) : relative;
    const dot = withoutGz.lastIndexOf(".");
    const extension = dot < 0 ? "" : withoutGz.slice(dot + 1).toLowerCase();
    if (relative.endsWith(".gz") && extension === "prbm") return HIRES_CONTENT_TYPE;
    return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

function acceptsGzip(req: http.IncomingMessage): boolean {
    const header = req.headers["accept-encoding"];
    const value = Array.isArray(header) ? header.join(",") : (header ?? "");
    return /(^|,)\s*gzip\s*(;|,|$)/i.test(value);
}

async function sendFile(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    filePath: string,
    size: number,
    mtimeMs: number,
    relative: string,
    /** True when the bytes on disk are gzip that the request did not name. */
    transparentlyCompressed: boolean,
): Promise<boolean> {
    // The same shape `StaticHandler` uses, so a rendered map revalidates the way the
    // rest of the app's static content does. The viewer's `RevalidatingFileLoader`
    // depends on ETags being stable for unchanged files and different for changed ones.
    const etag = createHash("sha1")
        .update(`${String(size)}|${filePath}|${String(mtimeMs)}`)
        .digest("hex")
        .slice(0, 16);

    if (req.headers["if-none-match"] === etag) {
        res.writeHead(304);
        res.end();
        return true;
    }

    const contentType = contentTypeFor(relative);

    if (transparentlyCompressed && !acceptsGzip(req)) {
        // Rare: everything that speaks HTTP accepts gzip. Decompressing here rather
        // than sending gzip bytes with no `Content-Encoding` is the difference between
        // a slow response and a corrupt one.
        let body: Buffer;
        try {
            body = Buffer.from(await gunzipAsync(await readFile(filePath)));
        } catch {
            res.writeHead(500, { "content-type": "text/plain" });
            res.end("Failed to read tile");
            return true;
        }
        res.writeHead(200, {
            "content-type": contentType,
            "content-length": body.byteLength,
            etag,
            "cache-control": "no-cache",
        });
        if (req.method === "HEAD") res.end();
        else res.end(body);
        return true;
    }

    const headers: Record<string, string | number> = {
        "content-type": contentType,
        "content-length": size,
        etag,
        // `no-cache` means "revalidate", not "do not store". A locally rendered map is
        // rewritten in place by the next incremental render, so a cached tile with a
        // long max-age would show yesterday's terrain with no way to ask for today's.
        "cache-control": "no-cache",
    };
    if (transparentlyCompressed) headers["content-encoding"] = "gzip";

    res.writeHead(200, headers);
    if (req.method === "HEAD") {
        res.end();
        return true;
    }

    const stream = createReadStream(filePath);
    stream.pipe(res);
    await new Promise<void>((done) => {
        res.on("close", () => {
            stream.destroy();
            done();
        });
        stream.on("error", () => {
            res.destroy();
            done();
        });
    });
    return true;
}
