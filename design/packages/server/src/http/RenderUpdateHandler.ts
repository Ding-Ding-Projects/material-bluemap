/**
 * `POST /maps/{id}/update` and `GET /maps/{id}/update` — the HTTP surface over
 * {@link RenderDriver}. See that module's doc comment for why this route exists at all:
 * upstream's web server has no equivalent, because upstream never triggers a render from
 * an HTTP request.
 */

import type * as http from "node:http";
import { TileUpdateStrategy, type BmMap } from "@material-bluemap/engine";
import type { HttpHandler } from "./HttpServer.js";
import type { RenderDriver } from "../render/RenderDriver.js";

const FORCE_STRATEGIES: Readonly<Record<string, TileUpdateStrategy>> = {
    force_all: TileUpdateStrategy.FORCE_ALL,
    force_edge: TileUpdateStrategy.FORCE_EDGE,
    force_none: TileUpdateStrategy.FORCE_NONE,
};

export class RenderUpdateHandler implements HttpHandler {
    private readonly maps = new Map<string, BmMap>();

    constructor(private readonly driver: RenderDriver) {}

    setMap(mapId: string, map: BmMap): void {
        this.maps.set(mapId, map);
    }

    removeMap(mapId: string): void {
        this.maps.delete(mapId);
    }

    async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
        const url = new URL(req.url ?? "/", "http://localhost");
        const match = /^\/maps\/([^/]+)\/update\/?$/.exec(url.pathname);
        if (match === null) return false;

        let mapId: string;
        try {
            mapId = decodeURIComponent(match[1] ?? "");
        } catch {
            res.writeHead(400, { "content-type": "text/plain" });
            res.end("Bad Request");
            return true;
        }

        const map = this.maps.get(mapId);
        if (map === undefined) {
            res.writeHead(404, { "content-type": "text/plain" });
            res.end("Unknown map");
            return true;
        }

        if (req.method === "GET" || req.method === "HEAD") {
            this.respondJson(res, this.driver.getStatus());
            return true;
        }

        if (req.method === "POST") {
            const forceParam = url.searchParams.get("force");
            if (forceParam !== null && !(forceParam in FORCE_STRATEGIES)) {
                res.writeHead(400, { "content-type": "text/plain" });
                res.end(`Unknown force strategy '${forceParam}'`);
                return true;
            }
            const force = forceParam === null ? undefined : FORCE_STRATEGIES[forceParam];
            const result = this.driver.triggerUpdate(map, force);
            this.respondJson(res, result, result.scheduled ? 202 : 200);
            return true;
        }

        res.writeHead(405, { "content-type": "text/plain", allow: "GET, HEAD, POST" });
        res.end("Method Not Allowed");
        return true;
    }

    private respondJson(res: http.ServerResponse, body: unknown, status = 200): void {
        const buf = Buffer.from(JSON.stringify(body), "utf-8");
        res.writeHead(status, { "content-type": "application/json", "content-length": String(buf.byteLength) });
        res.end(buf);
    }
}
