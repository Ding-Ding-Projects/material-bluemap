/**
 * Drives `-r`/`-f`/`-e`/`-u` and `--markers`, over a real `RenderManager`.
 *
 * Java source: `BlueMapCLI.renderMaps` / `BlueMapCLI.updateMarkers`
 *
 * The scheduling itself is not reimplemented: every map's update is
 * `MapUpdatePreparationTask.updateMap(map, renderManager, force)`, the exact call
 * `packages/server/src/render/RenderDriver.ts` makes and the exact call a plugin's
 * `/bluemap update` command makes upstream — see that module's own doc comment for why.
 *
 * ## `-u`/`--watch`, now wired (closes issue #40's CLI half)
 *
 * Upstream's `-u` does two things, both now real here: it starts a `MapUpdateService`
 * file-watcher per map (`packages/server/src/plugin/MapUpdateService.ts`, already ported)
 * and, when `core.conf`'s `full-update-interval` is greater than zero, a periodic timer
 * that re-triggers every targeted map on that interval
 * (`BlueMapCLI.java:182-197`'s `updateAllMapsTask`). `startWatchers` below is the join
 * between "a region-file changed" and "a region got re-rendered" that the module doc
 * comment on `MapUpdateService` already names; this file just calls it. The process is
 * kept alive by `index.ts` the same way `-w` already keeps it alive for the webserver —
 * see that file's own comment.
 */

import type { BmMap, RenderManager } from "@worldlens/engine";
import { TileUpdateStrategy } from "@worldlens/engine";
import type { ResolvedCliActions, TileUpdateStrategy as ForceStrategyString } from "@worldlens/config";
import { RenderDriver, MapUpdateService } from "@worldlens/server";
import type { Logger } from "./logger.js";

const FORCE_STRATEGY: Readonly<Record<ForceStrategyString, TileUpdateStrategy>> = {
    none: TileUpdateStrategy.FORCE_NONE,
    edge: TileUpdateStrategy.FORCE_EDGE,
    all: TileUpdateStrategy.FORCE_ALL,
};

export interface RunRenderOptions {
    readonly maps: ReadonlyMap<string, BmMap>;
    readonly renderManager: RenderManager;
    readonly renderThreadCount: number;
    readonly renderThreadPriority: number;
    readonly logger: Logger;
    readonly progressIntervalMs?: number;
}

/**
 * Schedules an update for every given map and waits for the render manager to drain,
 * logging progress the way `BlueMapCLI`'s own `TimerTask` does — off `ProgressTracker`,
 * via `RenderDriver.getStatus()`, never invented.
 */
export async function runRender(
    action: NonNullable<ResolvedCliActions["render"]>,
    options: RunRenderOptions,
): Promise<{ readonly triggered: number; readonly targets: readonly BmMap[] }> {
    const { maps, renderManager, logger } = options;
    const driver = new RenderDriver(renderManager);
    const force = FORCE_STRATEGY[action.force];

    const targets = action.maps === null ? [...maps.values()] : action.maps.flatMap((id) => (maps.has(id) ? [maps.get(id)!] : []));
    targets.sort((a, b) => a.getMapSettings().getSorting() - b.getMapSettings().getSorting());

    if (targets.length === 0) {
        logger.warn("No maps matched -m/--maps (or none are configured); nothing to render.");
        return { triggered: 0, targets: [] };
    }

    logger.info(`Start updating ${String(targets.length)} map(s) ...`);
    let triggered = 0;
    for (const map of targets) {
        const result = driver.triggerUpdate(map, force);
        if (result.scheduled) triggered++;
    }

    renderManager.start(options.renderThreadCount, options.renderThreadPriority);

    const progressIntervalMs = options.progressIntervalMs ?? 10_000;
    const progressTimer = setInterval(() => {
        const status = driver.getStatus();
        if (status.currentTaskDescription === null) return;
        const progressPercent = status.currentTaskProgress === null ? "?" : (Math.round(status.currentTaskProgress * 100000) / 1000).toString();
        const eta = status.estimatedTimeRemainingMs !== null && status.estimatedTimeRemainingMs > 0 ? ` (ETA: ${formatDuration(status.estimatedTimeRemainingMs)})` : "";
        logger.info(`${status.currentTaskDescription}: ${progressPercent}%${eta}`);
    }, progressIntervalMs);
    if (typeof progressTimer === "object" && typeof (progressTimer as { unref?: () => void }).unref === "function") {
        (progressTimer as unknown as { unref: () => void }).unref();
    }

    try {
        await renderManager.awaitIdle();
    } finally {
        clearInterval(progressTimer);
    }

    logger.info("Your maps are now all up-to-date!");
    return { triggered, targets };
}

export interface RunningWatch {
    /** upstream: `List<MapUpdateService> mapUpdateServices` */
    readonly services: readonly MapUpdateService[];
    /** upstream: `Timer timer` holding `updateAllMapsTask` — `null` when `full-update-interval <= 0`. */
    readonly fullUpdateTimer: ReturnType<typeof setInterval> | null;
    /** upstream: `shutdown`'s watcher half — closes every watcher, then clears the full-update timer. */
    close(): Promise<void>;
}

export interface StartWatchersOptions {
    readonly targets: readonly BmMap[];
    readonly renderManager: RenderManager;
    /** upstream: `CoreConfig.getUpdateCooldown()`, in seconds (`core.conf`'s `update-cooldown`). */
    readonly updateCooldownSeconds: number;
    /** upstream: `CoreConfig.getFullUpdateInterval()`, in minutes (`core.conf`'s `full-update-interval`); 0 disables it. */
    readonly fullUpdateIntervalMinutes: number;
    readonly logger: Logger;
}

/**
 * upstream: `BlueMapCLI.renderMaps`'s `if (watch) { ... }` watcher-construction block plus
 * its `if (watch) { long fullUpdateInterval = ...; ... }` periodic-timer block. One
 * `MapUpdateService` per targeted map, started immediately, plus (when the config's
 * `full-update-interval` is positive) a timer that re-triggers every targeted map's
 * incremental update on that interval, exactly as `updateAllMapsTask` does.
 *
 * A watcher that fails to construct for one map is logged and skipped, matching upstream's
 * per-map `try`/`catch` — one map's world-type refusing a watch service must not stop the
 * rest, nor the render this CLI already performed for it.
 */
export function startWatchers(options: StartWatchersOptions): RunningWatch {
    const { targets, renderManager, updateCooldownSeconds, fullUpdateIntervalMinutes, logger } = options;
    const driver = new RenderDriver(renderManager);

    const services: MapUpdateService[] = [];
    for (const map of targets) {
        try {
            const service = new MapUpdateService(renderManager, map, {
                regionUpdateCooldownMs: updateCooldownSeconds * 1000,
                verbose: true,
                onInfo: (message) => logger.info(message),
                onDebug: (message) => logger.info(message),
                onWarn: (message) => logger.warn(message),
                onError: (message, error) => logger.error(message, error),
            });
            service.start();
            services.push(service);
            logger.info(`Watching map '${map.getId()}' for changes...`);
        } catch (error) {
            logger.error(`Failed to create update-watcher for map: ${map.getId()} (This means the map might not automatically update)`, error);
        }
    }

    let fullUpdateTimer: ReturnType<typeof setInterval> | null = null;
    if (fullUpdateIntervalMinutes > 0) {
        const intervalMs = fullUpdateIntervalMinutes * 60_000;
        fullUpdateTimer = setInterval(() => {
            logger.info(`Start updating ${String(targets.length)} map(s) ...`);
            for (const map of targets) driver.triggerUpdate(map, TileUpdateStrategy.FORCE_NONE);
        }, intervalMs);
        if (typeof fullUpdateTimer === "object" && typeof (fullUpdateTimer as { unref?: () => void }).unref === "function") {
            (fullUpdateTimer as unknown as { unref: () => void }).unref();
        }
    }

    return {
        services,
        fullUpdateTimer,
        async close(): Promise<void> {
            await Promise.all(services.map((service) => service.close()));
            if (fullUpdateTimer !== null) clearInterval(fullUpdateTimer);
        },
    };
}

function formatDuration(ms: number): string {
    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (value: number): string => String(value).padStart(2, "0");
    return hours > 0 ? `${String(hours)}:${pad(minutes)}:${pad(seconds)}` : `${String(minutes)}:${pad(seconds)}`;
}

/**
 * `--markers`: writes `live/markers.json` for each targeted map straight from its config's
 * `marker-sets`, the way `BlueMapCLI.updateMarkers` writes `MarkerGson.toJson(mapConfig
 * .parseMarkerSets())`. This is a simplification, said plainly: it serializes the config's
 * own JSON shape rather than reproducing `MarkerGson`'s exact field-by-field mapping, so a
 * byte-for-byte match with upstream's output is not claimed. An absent `marker-sets` writes
 * `{}`, matching the empty-map case both sides agree on.
 */
export async function runUpdateMarkers(
    action: NonNullable<ResolvedCliActions["updateMarkers"]>,
    maps: ReadonlyMap<string, BmMap>,
    logger: Logger,
): Promise<void> {
    const targetIds = action.maps === null ? [...maps.keys()] : action.maps;
    for (const mapId of targetIds) {
        const map = maps.get(mapId);
        if (map === undefined) {
            logger.warn(`--markers: map '${mapId}' is not configured or could not be built; skipped.`);
            continue;
        }
        try {
            // upstream: `MarkerGson.INSTANCE.toJson(this.markerSets, writer)`. `BmMap`'s own
            // markerSets is always empty today (`MarkerSet = never` — the markers API has not
            // landed, see docs/deviations.md), so this always writes "{}"; the shape here
            // matches `BmMap.save()`'s own internal serialization so both stay honest twins.
            const markerSets = map.getMarkerSets();
            const body = Buffer.from(JSON.stringify(Object.fromEntries(markerSets)), "utf-8");
            await map.getStorage().markers().write(body);
            logger.info(`Updated markers for map '${mapId}'`);
        } catch (error) {
            logger.error(`Failed to save markers for map '${mapId}'!`, error);
        }
    }
}
