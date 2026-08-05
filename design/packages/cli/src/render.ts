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
 * ## `-u`/`--watch` is accepted, not implemented
 *
 * Upstream's `-u` does two things: it changes `force`'s starting point (an incremental
 * update, same as no flag) and it starts a `MapUpdateService` file-watcher per map plus a
 * periodic full-update timer, so the process keeps running and re-renders on change.
 * `packages/engine` has the watcher primitives (`WatchService`, `MCAWorldRegionWatchService`)
 * but nothing joins a file-system event to a render task yet — `ROADMAP.md` issue #40,
 * "Watch-driven re-render... nothing joins a file-system event to a render task". So this
 * CLI does the one real render `-u` implies, then refuses to sit and pretend it is
 * watching: it prints exactly what is missing and exits non-zero, per the issue's own
 * "Never exit 0 having done nothing" requirement. `-ru` and `-fu` etc. still perform their
 * real render first.
 */

import type { BmMap, RenderManager } from "@material-bluemap/engine";
import { TileUpdateStrategy } from "@material-bluemap/engine";
import type { ResolvedCliActions, TileUpdateStrategy as ForceStrategyString } from "@material-bluemap/config";
import { RenderDriver } from "@material-bluemap/server";
import type { Logger } from "./logger.js";

/** Distinct from upstream's 0/1/2: an explicitly requested behaviour this CLI does not implement yet. */
export const EXIT_NOT_IMPLEMENTED = 3;

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
): Promise<{ readonly triggered: number }> {
    const { maps, renderManager, logger } = options;
    const driver = new RenderDriver(renderManager);
    const force = FORCE_STRATEGY[action.force];

    const targets = action.maps === null ? [...maps.values()] : action.maps.flatMap((id) => (maps.has(id) ? [maps.get(id)!] : []));
    targets.sort((a, b) => a.getMapSettings().getSorting() - b.getMapSettings().getSorting());

    if (targets.length === 0) {
        logger.warn("No maps matched -m/--maps (or none are configured); nothing to render.");
        return { triggered: 0 };
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
    return { triggered };
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
