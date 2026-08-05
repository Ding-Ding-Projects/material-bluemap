import { IOException, INT, TypeToken } from "@material-bluemap/nbt";
import type { ObjectSchema } from "@material-bluemap/nbt";
import type { Vector2i } from "@material-bluemap/shared";
import type { BmMap } from "../BmMap.js";
import { CombinedRenderTask } from "./CombinedRenderTask.js";
import type { MapRenderTask } from "./MapRenderTask.js";
import { MapSaveTask } from "./MapSaveTask.js";
import type { RenderTask } from "./RenderTask.js";
import type { SerializableRenderTask, Serialized } from "./serialization/SerializableRenderTask.js";
import { BM_MAP_TOKEN, RENDER_TASK_LIST_TOKEN } from "./serialization/tokens.js";
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
export class MapUpdateTask
    extends CombinedRenderTask
    implements MapRenderTask, SerializableRenderTask<MapUpdateTaskSerialized>
{
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

    /**
     * upstream: `Serialized serialize() { return new Serialized(map, getTasks(),
     * getCurrentTaskIndex()); }`
     *
     * The saved `tasks` list is exactly {@link CombinedRenderTask.getTasks} — every
     * sub-task, completed ones included, each serialized through its own {@link
     * RenderTaskAdapter} entry. That is what makes resume-without-redo work: on restore,
     * {@link MapUpdateTaskSerialized.deserialize} rebuilds the *same* list via {@link
     * MapUpdateTask.fromTasks} with the saved `currentTaskIndex`, and {@link
     * CombinedRenderTask.doWork} never calls `doWork()` on anything before that index — a
     * finished region is never touched again, it is just carried along as inert history.
     */
    serialize(): MapUpdateTaskSerialized {
        return new MapUpdateTaskSerialized(this.#map, [...this.getTasks()], this.getCurrentTaskIndex());
    }
}

/** upstream: {@code TypeToken.of(MapUpdateTask.Serialized.class)} */
export const MAP_UPDATE_TASK_SERIALIZED_TOKEN: TypeToken<MapUpdateTaskSerialized> = TypeToken.of(
    "rendermanager.MapUpdateTask.Serialized",
);

/**
 * upstream: `MapUpdateTask.Serialized` — the map, the full sub-task list (saves and region
 * updates alike) and the cursor into it.
 *
 * `tasks` defaults to `[]` and `currentTaskIndex` to `0` so a truncated file that is
 * missing them still deserializes into *something* runnable — an update with no work left
 * to do — rather than failing outright over fields that have a perfectly sensible empty
 * meaning. `map` has no such default: an update task naming no map cannot mean anything,
 * so it is the one field {@link deserialize} refuses to substitute for.
 */
export class MapUpdateTaskSerialized implements Serialized<MapUpdateTask> {
    map: BmMap | null;
    tasks: RenderTask[];
    currentTaskIndex: number;

    constructor(map: BmMap | null = null, tasks: RenderTask[] = [], currentTaskIndex = 0) {
        this.map = map;
        this.tasks = tasks;
        this.currentTaskIndex = currentTaskIndex;
    }

    /**
     * upstream: `public MapUpdateTask deserialize() { return new MapUpdateTask(map, tasks,
     * currentTaskIndex); }` — the package-private constructor, i.e. exactly {@link
     * MapUpdateTask.fromTasks}, never {@link MapUpdateTask.forRegions}. See the note on
     * {@link MapUpdateTask} for why sniffing the list to pick between them would be wrong
     * for precisely this call: a resumed update whose remaining work is empty hands
     * `fromTasks` a `[]`, and `forRegions` would misread that as "no regions", not "already
     * done".
     */
    deserialize(): MapUpdateTask {
        if (this.map === null)
            throw new IOException("map-update render-task is missing its 'map' field");
        return MapUpdateTask.fromTasks(this.map, this.tasks, this.currentTaskIndex);
    }

    /** Port addition: the explicit nbt-schema replacing upstream's field-reflection. */
    static readonly SCHEMA: ObjectSchema<MapUpdateTaskSerialized> = {
        create: () => new MapUpdateTaskSerialized(),
        fields: {
            map: { names: ["map"], type: BM_MAP_TOKEN },
            tasks: { names: ["tasks"], type: RENDER_TASK_LIST_TOKEN },
            currentTaskIndex: { names: ["current-task-index"], type: INT },
        },
    };
}
