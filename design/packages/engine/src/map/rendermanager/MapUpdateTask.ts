import type { Vector2i } from "@material-bluemap/shared";
import type { BmMap } from "../BmMap.js";
import { CombinedRenderTask } from "./CombinedRenderTask.js";
import type { MapRenderTask } from "./MapRenderTask.js";
import { MapSaveTask } from "./MapSaveTask.js";
import type { RenderTask } from "./RenderTask.js";
import { TileUpdateStrategy } from "./TileUpdateStrategy.js";
import { WorldRegionUpdateTask } from "./WorldRegionUpdateTask.js";

/**
 * upstream: `common/.../rendermanager/MapUpdateTask.java`
 *
 * One region-update task per region, run strictly in the order given, followed by a save.
 * It is a {@link CombinedRenderTask} that also knows which map it belongs to, so the
 * render manager can answer "is this map already updating?".
 *
 * ## Why there is no public constructor
 *
 * Upstream has two, told apart by the element type of the collection they are handed:
 * `MapUpdateTask(map, Collection<Vector2i>, force)` builds the region tasks itself, and
 * the package-private `MapUpdateTask(map, Collection<RenderTask>, int)` takes a list
 * somebody else built. Both are arrays at runtime in javascript, so a single constructor
 * would have to sniff the first element to decide — which silently picks the wrong
 * behaviour for an empty list, exactly the case
 * {@link MapUpdatePreparationTask} passes when it resumes. Two named factories instead.
 *
 * They do not build the same thing, and the difference is real:
 * - {@link MapUpdateTask.forRegions} appends **one** save, at the end;
 * - {@link MapUpdatePreparationTask} hands {@link MapUpdateTask.fromTasks} a list that
 *   already has a save at **both** ends, so an update interrupted halfway has a
 *   checkpoint on disk from before it started.
 */
export class MapUpdateTask extends CombinedRenderTask implements MapRenderTask {
    readonly #map: BmMap;

    private constructor(map: BmMap, tasks: Iterable<RenderTask>, currentTaskIndex: number) {
        // upstream: "updating map '%s'".formatted(map.getId())
        super(`updating map '${map.getId()}'`, tasks, currentTaskIndex);
        this.#map = map;
    }

    /** upstream: `public MapUpdateTask(BmMap, Collection<Vector2i>, TileUpdateStrategy)` */
    static forRegions(
        map: BmMap,
        regions: Iterable<Vector2i>,
        force: TileUpdateStrategy = TileUpdateStrategy.FORCE_NONE,
    ): MapUpdateTask {
        // upstream: Stream.concat(regions.map(WorldRegionUpdateTask::new), Stream.of(new MapSaveTask(map)))
        const tasks: RenderTask[] = [];
        for (const region of regions) tasks.push(new WorldRegionUpdateTask(map, region, force));
        tasks.push(new MapSaveTask(map));

        return new MapUpdateTask(map, tasks, 0);
    }

    /**
     * upstream: the package-private `MapUpdateTask(BmMap, Collection<RenderTask>, int)`.
     *
     * `currentTaskIndex` exists so a partially-completed update resumes where it stopped
     * rather than re-running every region from the start.
     */
    static fromTasks(map: BmMap, tasks: Iterable<RenderTask>, currentTaskIndex = 0): MapUpdateTask {
        return new MapUpdateTask(map, tasks, currentTaskIndex);
    }

    getMap(): BmMap {
        return this.#map;
    }
}
