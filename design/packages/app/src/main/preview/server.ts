/**
 * Watching a render live, in a real browser tab, while it is still running.
 *
 * ## Why this exists beside `LocalMapHandler`
 *
 * `LocalMapHandler` already serves a render's tiles - but only to the Electron window this
 * application opened for itself, behind a random per-launch bearer token nobody outside the
 * process ever has, and only the two API-ish subtrees (`settings.json`, `maps/`) the app's
 * *own* viewer bundle needs. Nothing about that lets somebody open the map in Firefox, in a
 * second window, or on a phone on the same desk - and `pages/hosting.ts`'s own doc comment
 * says as much: "A render finishes and the map is served at
 * `http://127.0.0.1:<port>/local/<renderId>/`, which is a URL nobody else can open."
 *
 * This module is that URL. It serves ONE render's output directory - `<storageDir>/<renderId>/web`,
 * exactly what `render/workspace.ts`'s `renderWorkspace().webRoot` names - as a complete,
 * self-contained site: `index.html` and its bundle included, because `webapp.enabled`
 * defaults to true and every render already writes upstream's own viewer there. No second
 * JVM, no second engine, no coupling to the app's own IPC-driven UI: a plain, read-only
 * static file server, unauthenticated (loopback has no user to authenticate against) and
 * scoped to nothing but that one directory.
 *
 * ## Live, not just "eventually correct"
 *
 * The engine writes tiles into `webRoot/maps/<id>/tiles/...` from the moment a render
 * starts, whether it is running on this machine directly or inside a Docker container bind-
 * mounted to this same host path (`runtime/plan.ts`'s `hostWebRoot`) - either way the bytes
 * land on this disk in real time. This handler never waits for `LocalMapHandler.setMount`,
 * which today only happens once `RenderOrchestrator` calls `mount()` after a render
 * *finishes* (see `orchestrator.ts`); it reads straight off the workspace directory the
 * moment it exists, so opening the URL mid-render shows exactly what has been written so
 * far, sparse tiles and all.
 *
 * ## The cache the viewer keeps that this server cannot see
 *
 * `viewer/src/util/RevalidatingFileLoader.ts` keeps every tile it has ever fetched in an
 * in-memory `THREE.Cache` for the life of the page, and only re-fetches a URL once that URL
 * has been explicitly dropped from its `revalidatedUrls` set (`TileLoader.load`'s `force`
 * parameter). So a tile the visitor has already looked at will not refresh on its own even
 * though this server would happily answer a fresh request with fresh bytes - the HTTP layer
 * (`Cache-Control: no-cache` plus a real ETag, exactly `LocalMapHandler`'s own answer to the
 * same question) is necessary and not sufficient, because the browser never asks again for a
 * URL the page already holds in memory. A silently stale live view is worse than no live
 * view, so `injectLiveBanner` below adds a small on-page affordance while the render is
 * active - it never lies about what will happen and it never forces a reload on somebody
 * without saying so first.
 *
 * ## What is read-only, and how
 *
 * Every response is `createReadStream`/`readFile`, Node's default `'r'` open flag, which
 * takes no exclusive lock on Windows or anywhere else - the same access `LocalMapHandler`
 * already makes against files the engine is concurrently writing, in production, today. This
 * server never writes into `webRoot`.
 */

import type * as http from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { normalize, resolve, sep } from "node:path";
import { HttpServer, type HttpHandler } from "@material-bluemap/server";

const gunzipAsync = promisify(gunzip);

/** upstream's own mapping, matching `MapStorageHandler`'s table plus the webapp's own assets. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    txt: "text/plain; charset=utf-8",
    css: "text/css",
    csv: "text/csv",
    js: "text/javascript",
    mjs: "text/javascript",
    xml: "text/xml",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    ttf: "font/ttf",
    woff: "font/woff",
    woff2: "font/woff2",
    prbm: "application/octet-stream",
    gz: "application/gzip",
};
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * The endpoint the injected banner polls. Two leading underscores and a hyphenated,
 * namespaced segment: nothing a render ever writes could collide with it, because
 * `pathFromCoords` never emits an underscore and no map id may contain a slash.
 */
export const PREVIEW_STATUS_PATH = "/__material-bluemap-preview/status";

export interface RenderPreviewHandlerOptions {
    readonly renderId: string;
    /** `<storageDir>/<renderId>/web` - `renderWorkspace().webRoot`, verbatim. */
    readonly webRoot: string;
    /** True while the render that produced this output is still writing to it. */
    readonly isActive: () => boolean;
}

/**
 * Serves exactly one render's output directory, at the server's root.
 *
 * Deliberately not a class with a `Map` of mounts the way `LocalMapHandler` and
 * `MapStorageHandler` are: one server, one render, one directory, because this is stood up
 * and torn down per "host this live" action rather than living for the app's whole lifetime.
 */
export class RenderPreviewHandler implements HttpHandler {
    private readonly options: RenderPreviewHandlerOptions;
    private readonly root: string;

    constructor(options: RenderPreviewHandlerOptions) {
        this.options = options;
        this.root = resolve(options.webRoot);
    }

    async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
        if (req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405, { "content-type": "text/plain" });
            res.end("Method Not Allowed");
            return true;
        }

        const url = new URL(req.url ?? "/", "http://localhost");

        if (url.pathname === PREVIEW_STATUS_PATH) {
            this.respondStatus(res);
            return true;
        }

        let relative: string;
        try {
            relative = decodeURIComponent(url.pathname);
        } catch {
            res.writeHead(400, { "content-type": "text/plain" });
            res.end("Bad Request");
            return true;
        }
        if (relative === "/" || relative === "") relative = "/index.html";
        relative = relative.replace(/^\/+/, "");

        if (relative.includes("\0")) {
            res.writeHead(400, { "content-type": "text/plain" });
            res.end("Bad Request");
            return true;
        }

        const filePath = resolveInside(this.root, relative);
        if (filePath === null) {
            res.writeHead(400, { "content-type": "text/plain" });
            res.end("Bad Request");
            return true;
        }

        await this.serve(req, res, filePath, relative);
        return true;
    }

    private respondStatus(res: http.ServerResponse): void {
        const body = Buffer.from(
            JSON.stringify({
                renderId: this.options.renderId,
                active: this.options.isActive(),
                checkedAt: new Date().toISOString(),
            }),
            "utf-8",
        );
        res.writeHead(200, {
            "content-type": "application/json",
            "content-length": body.byteLength,
            "cache-control": "no-store",
        });
        res.end(body);
    }

    private async serve(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        filePath: string,
        relative: string,
    ): Promise<void> {
        const direct = await fileStat(filePath);
        if (direct !== null) {
            await this.sendFile(req, res, filePath, direct.size, direct.mtimeMs, relative, false);
            return;
        }

        const compressed = `${filePath}.gz`;
        const gz = await fileStat(compressed);
        if (gz !== null) {
            await this.sendFile(req, res, compressed, gz.size, gz.mtimeMs, relative, true);
            return;
        }

        // Nothing on disk under either name. A world is a sparse grid, so a tile path that
        // was never rendered is ordinary, not exceptional - upstream answers it 204 and the
        // viewer draws nothing, exactly the behaviour `LocalMapHandler` already gives.
        if (isTilePath(relative)) {
            res.writeHead(204);
            res.end();
            return;
        }
        res.writeHead(404, { "content-type": "text/plain" });
        res.end(
            relative === "index.html"
                ? "This render has no web viewer bundled (webapp generation was off for it), " +
                      "but its raw map data is still served under /maps/... and /settings.json."
                : "Not Found",
        );
    }

    private async sendFile(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        filePath: string,
        size: number,
        mtimeMs: number,
        relative: string,
        transparentlyCompressed: boolean,
    ): Promise<void> {
        const etag = createHash("sha1")
            .update(`${String(size)}|${filePath}|${String(mtimeMs)}`)
            .digest("hex")
            .slice(0, 16);

        if (req.headers["if-none-match"] === etag) {
            res.writeHead(304);
            res.end();
            return;
        }

        const contentType = contentTypeFor(relative);

        // `index.html` is small and gets a live-status banner woven in, so it is read whole
        // rather than streamed - every other file, tiles included, still streams.
        if (relative === "index.html" && !transparentlyCompressed) {
            let html: string;
            try {
                html = await readFile(filePath, "utf-8");
            } catch {
                res.writeHead(500, { "content-type": "text/plain" });
                res.end("Failed to read the map's index page");
                return;
            }
            const body = Buffer.from(injectLiveBanner(html), "utf-8");
            res.writeHead(200, {
                "content-type": contentType,
                "content-length": body.byteLength,
                etag,
                "cache-control": "no-cache",
            });
            if (req.method === "HEAD") res.end();
            else res.end(body);
            return;
        }

        if (transparentlyCompressed && !acceptsGzip(req)) {
            let body: Buffer;
            try {
                body = Buffer.from(await gunzipAsync(await readFile(filePath)));
            } catch {
                res.writeHead(500, { "content-type": "text/plain" });
                res.end("Failed to read tile");
                return;
            }
            res.writeHead(200, {
                "content-type": contentType,
                "content-length": body.byteLength,
                etag,
                "cache-control": "no-cache",
            });
            if (req.method === "HEAD") res.end();
            else res.end(body);
            return;
        }

        const headers: Record<string, string | number> = {
            "content-type": contentType,
            "content-length": size,
            etag,
            // Revalidate, never store: a render this server is hosting is rewritten in
            // place while it runs, so a long-lived cached response would show whatever the
            // tile looked like when it was first fetched, forever.
            "cache-control": "no-cache",
        };
        if (transparentlyCompressed) headers["content-encoding"] = "gzip";

        res.writeHead(200, headers);
        if (req.method === "HEAD") {
            res.end();
            return;
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
    }
}

const TILE_PATH = /^maps\/[^/]+\/tiles\//;

function isTilePath(relative: string): boolean {
    return TILE_PATH.test(relative);
}

/** Joins a request path onto the root and proves the result is still inside it. */
function resolveInside(root: string, relative: string): string | null {
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
    const withoutGz = relative.endsWith(".gz") ? relative.slice(0, -3) : relative;
    const dot = withoutGz.lastIndexOf(".");
    const extension = dot < 0 ? "" : withoutGz.slice(dot + 1).toLowerCase();
    return CONTENT_TYPES[extension] ?? DEFAULT_CONTENT_TYPE;
}

function acceptsGzip(req: http.IncomingMessage): boolean {
    const header = req.headers["accept-encoding"];
    const value = Array.isArray(header) ? header.join(",") : (header ?? "");
    return /(^|,)\s*gzip\s*(;|,|$)/i.test(value);
}

/**
 * Adds a small, honest, non-blocking on-page affordance for the tile-caching problem the
 * class doc explains: a manual "Reload" action always available, plus (only while the
 * render is active) a quiet auto-refresh every 20 seconds, which stops the instant the
 * status endpoint reports the render has finished.
 *
 * Injected before `</body>`, or appended at the end when the page has none. Never touches
 * the file on disk - this runs once per request, in memory, against bytes just read.
 */
export function injectLiveBanner(html: string): string {
    const snippet = LIVE_BANNER_SNIPPET;
    const marker = /<\/body>/i;
    if (marker.test(html)) return html.replace(marker, `${snippet}</body>`);
    return html + snippet;
}

const LIVE_BANNER_SNIPPET = `
<div id="material-bluemap-preview-banner" role="status" aria-live="polite" style="
    position:fixed;right:12px;bottom:12px;z-index:2147483647;
    font:13px/1.4 system-ui,sans-serif;color:#fff;background:rgba(20,20,24,0.88);
    border-radius:8px;padding:8px 12px;max-width:280px;
    box-shadow:0 2px 10px rgba(0,0,0,0.35);display:flex;align-items:center;gap:8px;">
  <span id="material-bluemap-preview-banner-text">Checking render status…</span>
  <button id="material-bluemap-preview-banner-reload" type="button" style="
      background:#4f86ff;color:#fff;border:none;border-radius:4px;
      padding:4px 8px;font:inherit;cursor:pointer;">Reload</button>
</div>
<script>
(function () {
  "use strict";
  var TEXT_ACTIVE = "Live: rendering in progress. Tiles you have already looked at will not " +
      "refresh on their own \\u2014 reload to see new ones.";
  var TEXT_FINISHED = "This render has finished. Showing the finished map.";
  var TEXT_UNKNOWN = "Could not reach the hosting server to check render status.";
  var POLL_MS = 20000;
  var el = document.getElementById("material-bluemap-preview-banner");
  var text = document.getElementById("material-bluemap-preview-banner-text");
  var reload = document.getElementById("material-bluemap-preview-banner-reload");
  var lastActive = null;
  if (reload) {
    reload.addEventListener("click", function () { window.location.reload(); });
    reload.addEventListener("focus", function () { reload.style.outline = "2px solid #fff"; });
    reload.addEventListener("blur", function () { reload.style.outline = "none"; });
  }
  function poll() {
    fetch("${PREVIEW_STATUS_PATH}", { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("status " + response.status);
      return response.json();
    }).then(function (data) {
      var active = !!data.active;
      if (text) text.textContent = active ? TEXT_ACTIVE : TEXT_FINISHED;
      if (el) el.style.display = "flex";
      // Only auto-reload on the transition into "still active" and only while active -
      // never forces a reload the instant the page loads, and never nags after it finishes.
      if (active && lastActive === true) window.location.reload();
      lastActive = active;
    }).catch(function () {
      if (text) text.textContent = TEXT_UNKNOWN;
    });
  }
  poll();
  setInterval(poll, POLL_MS);
})();
</script>
`;

/* -------------------------------------------------------------------------- */
/* Standing the server up                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A memorable default so the same map tends to answer at the same address across a
 * session. Arbitrary within the dynamic/private range, and never load-bearing: the moment
 * it is taken - by a previous run of this same app, or anything else on the machine - the
 * server falls back to whatever the operating system assigns instead, and says so.
 */
export const DEFAULT_PREVIEW_PORT = 48100;

export type PreviewBindHost = "127.0.0.1" | "0.0.0.0";

/** Loopback: only this machine can reach it. This is the default, and it should stay one. */
export const LOOPBACK_HOST: PreviewBindHost = "127.0.0.1";

/** Every interface: other devices on the same network can reach it. Opt-in only. */
export const NETWORK_HOST: PreviewBindHost = "0.0.0.0";

export interface StartPreviewServerOptions {
    readonly renderId: string;
    readonly webRoot: string;
    readonly isActive: () => boolean;
    /** Defaults to {@link LOOPBACK_HOST}. Pass {@link NETWORK_HOST} only on explicit opt-in. */
    readonly host?: PreviewBindHost;
    /** Defaults to {@link DEFAULT_PREVIEW_PORT}. Pass `0` to always ask the OS for one. */
    readonly port?: number;
}

export interface PreviewServerHandle {
    readonly renderId: string;
    readonly host: PreviewBindHost;
    readonly port: number;
    readonly url: string;
    /** The port that was actually asked for first. */
    readonly requestedPort: number;
    /** False when the requested port was busy and a different one was used instead. */
    readonly usedRequestedPort: boolean;
    stop(): Promise<void>;
}

function isAddressInUse(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "EADDRINUSE"
    );
}

/**
 * Starts serving one render's output. Binds to loopback unless `host` is explicitly
 * {@link NETWORK_HOST}, and never fails outright just because the preferred port is busy -
 * see {@link isAddressInUse} above for the one case that retries rather than rethrows.
 */
export async function startPreviewServer(options: StartPreviewServerOptions): Promise<PreviewServerHandle> {
    const host = options.host ?? LOOPBACK_HOST;
    const requestedPort = options.port ?? DEFAULT_PREVIEW_PORT;

    const handler = new RenderPreviewHandler({
        renderId: options.renderId,
        webRoot: options.webRoot,
        isActive: options.isActive,
    });

    let server = new HttpServer({ host, port: requestedPort });
    server.addHandler(handler);

    let usedRequestedPort = true;
    let address;
    try {
        address = await server.listen();
    } catch (error) {
        if (!isAddressInUse(error) || requestedPort === 0) throw error;
        usedRequestedPort = false;
        server = new HttpServer({ host, port: 0 });
        server.addHandler(handler);
        address = await server.listen();
    }

    const activeServer = server;
    return {
        renderId: options.renderId,
        host,
        port: address.port,
        url: `http://${host === NETWORK_HOST ? hostnameForDisplay() : host}:${String(address.port)}/`,
        requestedPort,
        usedRequestedPort,
        stop: () => activeServer.close(),
    };
}

/**
 * `0.0.0.0` is what the socket binds to, not an address a browser can open - so the URL
 * shown for a network-exposed server names `localhost` instead, which resolves on this
 * machine exactly the same way and is at least a real address elsewhere on the network's
 * DNS the moment somebody swaps in this machine's actual LAN IP. `ipc.ts` additionally
 * reports the concrete LAN address(es) beside this URL for that reason.
 */
function hostnameForDisplay(): string {
    return "localhost";
}
