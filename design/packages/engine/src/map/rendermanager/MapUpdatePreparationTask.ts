import { Vector2i } from "@material-bluemap/shared";
import type { Grid } from "@material-bluemap/shared";
import type { BmMap } from "../BmMap.js";
import { RenderSettings } from "../hires/RenderSettings.js";
import type { MapRenderTask } from "./MapRenderTask.js";
import { MapSaveTask } from "./MapSaveTask.js";
import { MapUpdateTask } from "./MapUpdateTask.js";
import { RenderTask } from "./RenderTask.js";
import { TileUpdateStrategy } from "./TileUpdateStrategy.js";
import { WorldRegionUpdateTask } from "./WorldRegionUpdateTask.js";

/*
 * upstream: Logger.global — the logger-package is not part of this port (yet), see the
 * equivalent note in map/BmMap.ts
 */
function logWarning(message: string): void {
    console.warn(message);
}

function logError(message: string, ex: unknown): void {
    console.error(message, ex);
}

/**
 * The part of `RenderManager` that this task needs.
 *
 * Declared structurally because `rendermanager/RenderManager.ts` is being written in the
 * same wave as this file; the concrete class satisfies it without naming it, and this
 * block becomes a plain `import type` the moment it lands. The one member is upstream's,
 * with upstream's signature, so nothing can quietly diverge in the meantime.
 */
export interface RenderTaskScheduler {
    scheduleRenderTask(task: RenderTask): void;
}

/** upstream: the lombok `@Builder` parameters, with `map` and `taskConsumer` `@NonNull` */
export interface MapUpdatePreparationTaskOptions {
    map: BmMap;
    /** A block position; regions are kept when their centre is within {@link radius} of it. */
    center?: Vector2i | null;
    radius?: number | null;
    force?: TileUpdateStrategy | null;
    taskConsumer: (task: MapUpdateTask) => void;
}

/**
 * upstream: `common/.../rendermanager/MapUpdatePreparationTask.java`
 *
 * Works out *what* an update should cover and hands a built {@link MapUpdateTask} to a
 * consumer. It exists as a task in its own right because listing a world's regions is
 * itself slow enough to want scheduling and cancelling — on a large world it is thousands
 * of directory entries plus a walk of the stored region state.
 *
 * The single most important behaviour here is the refusal in {@link findRegions}: a world
 * that lists **no** regions produces no update task at all. That is not an optimisation.
 * An empty region list with `checkForRemovedRegions` on would mean "every region that was
 * ever rendered has been removed", and the update would faithfully delete the entire map.
 * A misconfigured world path is far likelier than a genuinely emptied one, so upstream
 * warns and does nothing.
 */
export class MapUpdatePreparationTask implements MapRenderTask {
    readonly #map: BmMap;
    readonly #center: Vector2i | null;
    readonly #radius: number | null;
    readonly #force: TileUpdateStrategy;
    readonly #taskConsumer: (task: MapUpdateTask) => void;

    #hasMoreWork: boolean;
    #cancelled: boolean;

    constructor(options: MapUpdatePreparationTaskOptions) {
        if (options.map === null || options.map === undefined)
            throw new Error("map must not be null");
        if (options.taskConsumer === null || options.taskConsumer === undefined)
            throw new Error("taskConsumer must not be null");

        this.#map = options.map;
        this.#center = options.center ?? null;
        this.#radius = options.radius ?? null;
        // upstream: `force != null ? force : TileUpdateStrategy.FORCE_NONE`
        this.#force = options.force ?? TileUpdateStrategy.FORCE_NONE;
        this.#taskConsumer = options.taskConsumer;
        this.#hasMoreWork = true;
        this.#cancelled = false;
    }

    getMap(): BmMap {
        return this.#map;
    }

    /**
     * upstream: claim the single unit of work by clearing `hasMoreWork` inside the
     * `synchronized` block, then check cancellation.
     *
     * Cancellation is checked three times — before the work, and again after the regions
     * and the tasks are built — because the expensive part sits between them and a task
     * cancelled during it must not still schedule an update. The last check is the one
     * that matters: it is the difference between "we wasted a directory listing" and "we
     * started a full map update the user asked us to abandon".
     */
    async doWork(): Promise<void> {
        if (!this.#hasMoreWork) return;
        this.#hasMoreWork = false;
        if (this.#cancelled) return;

        const regions = await this.#findRegions();
        if (regions.length === 0) return;

        const tasks = await this.#createTasks(regions);
        const mapUpdateTask = MapUpdateTask.fromTasks(this.#map, tasks);

        if (this.#cancelled) return;

        this.#taskConsumer(mapUpdateTask);
    }

    hasMoreWork(): boolean {
        return this.#hasMoreWork && !this.#cancelled;
    }

    estimateProgress(): number {
        return RenderTask.estimateProgress();
    }

    cancel(): void {
        this.#cancelled = true;
    }

    getDescription(): string {
        return `preparing map '${this.#map.getId()}' update`;
    }

    getDetail(): string | null {
        return RenderTask.getDetail();
    }

    contains(task: RenderTask): boolean {
        return RenderTask.contains(this, task);
    }

    /**
     * upstream: `createTasks(Collection<Vector2i>)`.
     *
     * The save-tasks bracketing the region tasks are upstream's, and both ends earn their
     * place: the leading save flushes whatever the previous run left in memory before a
     * long update starts writing, and the trailing one commits the update itself.
     */
    async #createTasks(regions: Iterable<Vector2i>): Promise<RenderTask[]> {
        const regionTasks: WorldRegionUpdateTask[] = [];
        for (const region of regions)
            regionTasks.push(new WorldRegionUpdateTask(this.#map, region, this.#force));

        const lastUpdated = await WorldRegionUpdateTask.readRegionLastUpdated(regionTasks);
        regionTasks.sort(
            WorldRegionUpdateTask.regionLastUpdatedComparator(
                lastUpdated,
                WorldRegionUpdateTask.defaultComparator(Vector2i.ZERO),
            ),
        );

        // save map before and after the whole update
        const tasks: RenderTask[] = [new MapSaveTask(this.#map)];
        tasks.push(...regionTasks);
        tasks.push(new MapSaveTask(this.#map));

        return tasks;
    }

    /**
     * upstream: `findRegions()`.
     *
     * Upstream collects into a `HashSet<Vector2i>`, which de-duplicates by *value*. A
     * javascript `Set` keys objects by identity, so two `Vector2i(3, 4)` would both
     * survive and the same region would be rendered twice — the set is therefore keyed by
     * the coordinate pair, with the vector as the value.
     *
     * One thing this cannot reproduce: java's `HashSet` iteration order, which decides the
     * order of regions that tie under both comparators in {@link createTasks} (same stored
     * update-time, same distance from origin — e.g. `(1,0)` and `(0,-1)` on a first run,
     * where every stored time is 0). This port iterates in insertion order instead. Which
     * of several equidistant, equally-stale regions renders first is not a behaviour
     * upstream defines, and both sorts are stable, so the set of work is identical.
     */
    async #findRegions(): Promise<Vector2i[]> {
        const world = this.#map.getWorld();
        const regionGrid = world.getRegionGrid();

        const regionBoundsFilter = RenderSettings.getCellRenderBoundariesFilter(
            this.#map.getMapSettings(),
            regionGrid,
            true,
        );
        const regionRadiusFilter = this.#regionRadiusFilter(regionGrid);

        const regions = new Map<string, Vector2i>();
        const add = (region: Vector2i): void => {
            regions.set(`${region.getX()},${region.getY()}`, region);
        };

        // update all regions in the world-files
        for (const region of world.listRegions()) {
            if (!regionBoundsFilter(region)) continue;
            if (!regionRadiusFilter(region)) continue;
            add(region);
        }

        // no regions could mean the world might be configured incorrectly so we don't
        // update anything to avoid accidentally deleting the entire map
        if (regions.size === 0) {
            logWarning(
                `No regions found in world '${world.getId()}', update-task for map '${this.#map.getId()}' will not be created.`,
            );
            return [];
        }

        // also add regions that have a "lastUpdateTime" timestamp in the map-state data
        // (they might have been rendered before but deleted now)
        //
        // Note these are added *unfiltered*: a region that has moved outside the render
        // boundaries, or outside the radius, still has to be visited so its now-orphaned
        // tiles get deleted. Applying the filters here would leave them on disk forever.
        if (this.#map.getMapSettings().isCheckForRemovedRegions()) {
            try {
                await this.#map.getMapRegionState().forEach((x, z) => {
                    add(new Vector2i(x, z));
                });
            } catch (ex) {
                // upstream logs the IOException and carries on with the regions it has:
                // a failure to read the stored state must not abandon an update of the
                // regions that are demonstrably there
                logError("Failed to iterate over map region-state", ex);
            }
        }

        return [...regions.values()];
    }

    /**
     * upstream: the `regionRadiusFilter` lambda inside `findRegions`.
     *
     * The arithmetic is upstream's, and reproducing it exactly matters because it decides
     * which regions a `radius` render touches:
     *
     * - `halfCell = regionGrid.getGridSize().div(2)` is *integer* division truncating
     *   toward zero, which the ported `Vector2i#div` already does.
     * - `halfCell.length()` is flow-math's `(float) Math.sqrt(lengthSquared())` — a
     *   **float**, not a double, and it is then `Math.ceil`ed. `Math.fround` reproduces
     *   that rounding step; without it a length that lands just under an integer in float
     *   but just over it in double would ceil one region further out.
     * - `(long) Math.pow(radius + ceil, 2)` truncates toward zero.
     * - the comparison is `Vector2l#distanceSquared`, i.e. `dx*dx + dy*dy` in 64-bit
     *   integers. Javascript doubles hold that exactly while `|dx|, |dy| <= 2^26`, and the
     *   largest block coordinate Minecraft permits is under 3*10^7, so every representable
     *   world is inside the exact range. Upstream widened to `long` for the same reason:
     *   `int` would overflow here.
     */
    #regionRadiusFilter(regionGrid: Grid): (r: Vector2i) => boolean {
        const center = this.#center;
        const radius = this.#radius;
        if (center === null || radius === null || radius < 0) return () => true;

        const halfCell = regionGrid.getGridSize().div(2);
        const halfCellLength = Math.fround(
            Math.sqrt(halfCell.getX() * halfCell.getX() + halfCell.getY() * halfCell.getY()),
        );
        const increasedRadiusSquared = Math.trunc(
            Math.pow(radius + Math.ceil(halfCellLength), 2),
        );

        return (r: Vector2i) => {
            const min = regionGrid.getCellMin(r);
            const regionCenter = min.add(halfCell);
            const dx = regionCenter.getX() - center.getX();
            const dz = regionCenter.getY() - center.getY();
            return dx * dx + dz * dz <= increasedRadiusSquared;
        };
    }

    /** upstream: `static MapUpdatePreparationTask updateMap(BmMap, RenderManager)` */
    static updateMap(map: BmMap, renderManager: RenderTaskScheduler): MapUpdatePreparationTask;
    /** upstream: `static MapUpdatePreparationTask updateMap(BmMap, TileUpdateStrategy, RenderManager)` */
    static updateMap(
        map: BmMap,
        force: TileUpdateStrategy,
        renderManager: RenderTaskScheduler,
    ): MapUpdatePreparationTask;
    static updateMap(
        map: BmMap,
        forceOrManager: TileUpdateStrategy | RenderTaskScheduler,
        maybeManager?: RenderTaskScheduler,
    ): MapUpdatePreparationTask {
        const renderManager =
            maybeManager ?? (forceOrManager as RenderTaskScheduler);
        const force = maybeManager === undefined ? null : (forceOrManager as TileUpdateStrategy);

        return new MapUpdatePreparationTask({
            map,
            force,
            taskConsumer: (task) => {
                renderManager.scheduleRenderTask(task);
            },
        });
    }
}
