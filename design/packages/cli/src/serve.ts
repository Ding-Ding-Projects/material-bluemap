/**
 * `-w`/`--webserver`, over the real HTTP handlers `packages/server` ports.
 *
 * Java source: `BlueMapCLI.startWebserver`
 *
 * upstream registers a default route (serves `webroot`) and then, per configured map, a
 * `maps/{id}/(.*)` route to a `MapRequestHandler`. This port assembles the same chain out
 * of real, already-ported, already-tested handlers:
 *
 *   - `StaticHandler(webroot)` — the default/catch-all route
 *   - `MapStorageHandler` — one `setMount` per map, matching upstream's per-map
 *     `MapRequestHandler` mount at `maps/{id}/...`
 *   - `RenderUpdateHandler` — **not** an upstream route (see that module's own doc
 *     comment); wired here too so a running webserver can also be told to re-render
 *     without a second process
 *
 * `HttpServer` here is the chain-of-responsibility router `packages/server` already has;
 * handlers are tried in the order added. `RenderUpdateHandler` is registered before
 * `MapStorageHandler` — see the registration code below for why that specific order is
 * load-bearing, not cosmetic — and `StaticHandler` stays last as the true catch-all, so
 * `/maps/...` is never shadowed by a same-named file on disk.
 */

import type { BmMap, RenderManager } from "@worldlens/engine";
import type { WebserverConfig } from "@worldlens/config";
import { HttpServer, MapStorageHandler, RenderDriver, RenderUpdateHandler, StaticHandler } from "@worldlens/server";
import type { Logger } from "./logger.js";

export interface RunningServer {
    readonly host: string;
    readonly port: number;
    readonly renderUpdateHandler: RenderUpdateHandler;
    close(): Promise<void>;
}

export interface StartWebserverOptions {
    readonly webserver: WebserverConfig;
    readonly webroot: string;
    readonly maps: ReadonlyMap<string, BmMap>;
    readonly renderManager: RenderManager;
    readonly logger: Logger;
}

export async function startWebserver(options: StartWebserverOptions): Promise<RunningServer> {
    const { webserver, webroot, maps, renderManager, logger } = options;
    logger.info("Starting webserver ...");

    const server = new HttpServer({ host: webserver.ip, port: webserver.port });

    const mapStorageHandler = new MapStorageHandler();
    for (const [mapId, map] of maps) {
        mapStorageHandler.setMount({ mapId, storage: map.getStorage(), useSSE: webserver["sse-enabled"] });
    }

    const renderDriver = new RenderDriver(renderManager);
    const renderUpdateHandler = new RenderUpdateHandler(renderDriver);
    for (const [mapId, map] of maps) renderUpdateHandler.setMap(mapId, map);

    // Registration order matters, and not just "map routes before the static catch-all".
    // MapStorageHandler.handle() claims — and answers, even if only with its own 404 —
    // every request under /maps/{id}/... the instant {id} is mounted, regardless of what
    // the rest of the path is; it never falls through. RenderUpdateHandler's /update route
    // therefore has to be tried FIRST, or MapStorageHandler always wins the race and
    // /maps/{id}/update never reaches it. StaticHandler stays last, as the true catch-all.
    server.addHandler(renderUpdateHandler);
    server.addHandler(mapStorageHandler);
    server.addHandler(new StaticHandler(webroot));

    const address = await server.listen();
    logger.info(`Webserver started, listening on ${webserver.ip}:${String(address.port)}`);

    return {
        host: webserver.ip,
        port: address.port,
        renderUpdateHandler,
        close: async () => {
            await server.close();
        },
    };
}
