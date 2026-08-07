import { rm, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { BlueNBT, INT, IOException, LenientListAdapter, RegistryAdapter, TypeToken } from "@worldlens/nbt";
import type { ObjectSchema } from "@worldlens/nbt";
import { Key } from "@worldlens/shared";
import { FileHelper } from "../../../util/FileHelper.js";
import type { BmMap } from "../../BmMap.js";
import { MAP_PURGE_TASK_SERIALIZED_TOKEN, MapPurgeTask, MapPurgeTaskSerialized } from "../MapPurgeTask.js";
import { MAP_SAVE_TASK_SERIALIZED_TOKEN, MapSaveTask, MapSaveTaskSerialized } from "../MapSaveTask.js";
import { MAP_UPDATE_TASK_SERIALIZED_TOKEN, MapUpdateTask, MapUpdateTaskSerialized } from "../MapUpdateTask.js";
import type { RenderTask } from "../RenderTask.js";
import { TileUpdateStrategy } from "../TileUpdateStrategy.js";
import {
    WORLD_REGION_UPDATE_TASK_SERIALIZED_TOKEN,
    WorldRegionUpdateTask,
    WorldRegionUpdateTaskSerialized,
} from "../WorldRegionUpdateTask.js";
import { BmMapAdapter } from "./BmMapAdapter.js";
import { defineTaskCodec, RenderTaskAdapter } from "./RenderTaskAdapter.js";
import type { RenderTaskCodec } from "./RenderTaskAdapter.js";
import {
    BM_MAP_TOKEN,
    RENDER_TASK_LIST_TOKEN,
    RENDER_TASK_TOKEN,
    TILE_UPDATE_STRATEGY_TOKEN,
    VECTOR2I_TOKEN,
} from "./tokens.js";
import { Vector2iAdapter } from "./Vector2iAdapter.js";

/*
 * upstream: Logger.global — the logger-package is not part of this port (yet), see the
 * equivalent note in map/BmMap.ts
 */
function logError(message: string, ex: unknown): void {
    console.error(message, ex);
}

function logDebug(message: string): void {
    console.debug(message);
}

/**
 * The on-disk format's schema version. Bumped whenever a change to the field layout below
 * would make an older file read incorrectly rather than merely fail to read — per the
 * issue this ships for: "a saved queue that a later version of the app reads incorrectly is
 * worse than one it refuses to read". A version mismatch is treated exactly like a corrupt
 * file: refused and discarded, never guessed at.
 */
export const RENDER_TASK_QUEUE_FORMAT_VERSION = 1;

export const TASKS_DATA_TOKEN: TypeToken<TasksData> = TypeToken.of("rendermanager.TasksData");

/** upstream: `common/.../plugin/TasksData.java` — `@Data class TasksData { List<RenderTask> renderTasks; }` */
export class TasksData {
    version: number = RENDER_TASK_QUEUE_FORMAT_VERSION;
    renderTasks: RenderTask[] = [];
}

const TASKS_DATA_SCHEMA: ObjectSchema<TasksData> = {
    create: () => new TasksData(),
    fields: {
        version: { names: ["version"], type: INT },
        renderTasks: { names: ["render-tasks"], type: RENDER_TASK_LIST_TOKEN },
    },
};

/**
 * The full set of codecs {@link RenderTaskAdapter} dispatches on, built once at module
 * scope rather than inside {@link createRenderTaskBlueNBT} — a codec needs no `BlueNBT`
 * instance to exist (only *resolving* one lazily needs it, see the class doc comment on
 * {@link RenderTaskAdapter}), so there is no reason to rebuild the array on every call, and
 * keeping one shared array is what lets {@link isRenderTaskSerializable} answer "does this
 * task have a saved form at all" without needing a `BlueNBT` either.
 */
const RENDER_TASK_CODECS: readonly RenderTaskCodec[] = [
    defineTaskCodec({
        key: Key.bluemap("map-purge"),
        matches: (task): task is MapPurgeTask => task instanceof MapPurgeTask,
        serializedType: MAP_PURGE_TASK_SERIALIZED_TOKEN,
        serialize: (task) => task.serialize(),
    }),
    defineTaskCodec({
        key: Key.bluemap("map-save"),
        matches: (task): task is MapSaveTask => task instanceof MapSaveTask,
        serializedType: MAP_SAVE_TASK_SERIALIZED_TOKEN,
        serialize: (task) => task.serialize(),
    }),
    defineTaskCodec({
        key: Key.bluemap("map-update"),
        matches: (task): task is MapUpdateTask => task instanceof MapUpdateTask,
        serializedType: MAP_UPDATE_TASK_SERIALIZED_TOKEN,
        serialize: (task) => task.serialize(),
    }),
    defineTaskCodec({
        key: Key.bluemap("region-update"),
        matches: (task): task is WorldRegionUpdateTask => task instanceof WorldRegionUpdateTask,
        serializedType: WORLD_REGION_UPDATE_TASK_SERIALIZED_TOKEN,
        serialize: (task) => task.serialize(),
    }),
];

/**
 * Whether `task` has a registered {@link RenderTaskCodec} at all — i.e. whether it can
 * survive being written into a saved queue. {@link saveRenderTaskQueue} filters the queue
 * through this *before* handing it to the list adapter, rather than relying on {@link
 * RenderTaskAdapter.write}'s per-task "write nothing" fallback to do it implicitly: {@link
 * LenientListAdapter.write} commits to the list's original element *count* in the nbt
 * stream before writing any element, so a task that writes nothing would leave the file
 * with fewer real entries than the header claims — corrupt, not merely short. Upstream's
 * own `LenientListAdapter`/`RenderTaskAdapter` pairing has the identical latent hazard if a
 * non-serializable task is ever handed to it inside a list; this port closes it at the one
 * call site that matters instead of carrying it forward unverified.
 */
export function isRenderTaskSerializable(task: RenderTask): boolean {
    return RENDER_TASK_CODECS.some((codec) => codec.matches(task));
}

/**
 * upstream: `Plugin#createRenderTaskBlueNBT()`.
 *
 * Builds a fresh {@link BlueNBT} instance, scoped to exactly this feature and this call —
 * matching upstream, which also builds one from scratch on every save and every load
 * rather than keeping a shared instance around. The `maps` a saved queue can be restored
 * against are threaded through {@link BmMapAdapter} here, not looked up globally: whoever
 * is loading a queue is the only one who can say which maps currently exist to restore it
 * into.
 *
 * `onDroppedTask` receives one {@link IOException} per render-task entry that failed to
 * parse (an unknown `type`, or a `map` id that is not in `maps`) — {@link
 * LenientListAdapter} drops that single entry and keeps going rather than failing the
 * whole queue, exactly as upstream's own `LenientListAdapter` usage here does.
 */
export function createRenderTaskBlueNBT(
    maps: ReadonlyMap<string, BmMap>,
    onDroppedTask?: (error: IOException) => void,
): BlueNBT {
    const blueNBT = new BlueNBT();

    // -- leaf adapters: no dependency on anything else registered below --
    blueNBT.register(
        TILE_UPDATE_STRATEGY_TOKEN,
        new RegistryAdapter(
            TileUpdateStrategy.REGISTRY,
            (formatted, defaultNamespace) => Key.parse(formatted, defaultNamespace),
            Key.BLUEMAP_NAMESPACE,
            TileUpdateStrategy.FORCE_NONE,
        ),
    );
    blueNBT.register(VECTOR2I_TOKEN, new Vector2iAdapter());
    blueNBT.register(BM_MAP_TOKEN, new BmMapAdapter(maps));

    // -- the polymorphic render-task dispatcher and the lenient list wrapping it --
    //
    // upstream registers `RenderTaskAdapter` and calls its `init(blueNBT)` before
    // registering `List<RenderTask>`'s own adapter — "a bit of trickery" its own comment
    // calls out, needed because upstream's `init()` resolves eagerly. This port's
    // `RenderTaskAdapter` resolves lazily instead (see the class doc comment there), so the
    // three registrations below have no ordering constraint between each other; they are
    // kept in this order because it reads top-down as "the dispatcher, then the list of
    // them", not because a different order would break.
    const renderTaskAdapter = new RenderTaskAdapter(blueNBT, RENDER_TASK_CODECS);
    blueNBT.register(RENDER_TASK_TOKEN, renderTaskAdapter);
    blueNBT.register(
        RENDER_TASK_LIST_TOKEN,
        new LenientListAdapter<RenderTask>(
            blueNBT,
            RENDER_TASK_TOKEN,
            onDroppedTask ??
                ((error) => logDebug(`Failed to load render-task: ${error.message}`)),
        ),
    );

    // -- each task-type's own plain-data form --
    blueNBT.register(MAP_PURGE_TASK_SERIALIZED_TOKEN, MapPurgeTaskSerialized.SCHEMA);
    blueNBT.register(MAP_SAVE_TASK_SERIALIZED_TOKEN, MapSaveTaskSerialized.SCHEMA);
    blueNBT.register(MAP_UPDATE_TASK_SERIALIZED_TOKEN, MapUpdateTaskSerialized.SCHEMA);
    blueNBT.register(WORLD_REGION_UPDATE_TASK_SERIALIZED_TOKEN, WorldRegionUpdateTaskSerialized.SCHEMA);

    blueNBT.register(TASKS_DATA_TOKEN, TASKS_DATA_SCHEMA);

    return blueNBT;
}

/** true if the given error is a "file does not exist" error */
function isNoSuchFile(ex: unknown): boolean {
    return typeof ex === "object" && ex !== null && (ex as { code?: string }).code === "ENOENT";
}

async function deleteQuietly(file: string): Promise<void> {
    try {
        await rm(file, { force: true });
    } catch {
        // best-effort: a queue file that could not even be deleted is reported by the
        // caller's own onError already; failing to clean it up must not fail the load
    }
}

/**
 * upstream: `Plugin#save()`'s render-task half — `tasksData.setRenderTasks(...)` then
 * `blueNBT.write(tasksData, out, ...)` through `FileHelper.createFilepartOutputStream`.
 *
 * Ported to this package's own atomic-write convention instead — write to `<file>.filepart`
 * then rename — which is exactly what {@link FileItemStorage.write} already does for every
 * other file this engine persists, matching "adapted to this app's conventions" rather than
 * inventing a second atomic-write idiom.
 */
export async function saveRenderTaskQueue(
    file: string,
    tasks: readonly RenderTask[],
    maps: ReadonlyMap<string, BmMap>,
): Promise<void> {
    const blueNBT = createRenderTaskBlueNBT(maps);

    // upstream's own queue can (legitimately) hold tasks with no `Serialized` form at all
    // — `StorageDeleteTask`, `MapUpdatePreparationTask` — and those are filtered out here,
    // not left for `RenderTaskAdapter`'s per-task "write nothing" to handle implicitly; see
    // the doc comment on `isRenderTaskSerializable` for why doing it there would corrupt
    // the file instead of merely omitting an entry.
    const data = new TasksData();
    data.version = RENDER_TASK_QUEUE_FORMAT_VERSION;
    data.renderTasks = tasks.filter(isRenderTaskSerializable);

    const bytes = blueNBT.writeToBytes(data, TASKS_DATA_TOKEN);

    const resolvedFile = resolve(file);
    const folder = dirname(resolvedFile);
    await FileHelper.createDirectories(folder);

    const partFile = resolve(folder, basename(resolvedFile) + ".filepart");
    await writeFile(partFile, bytes);
    await FileHelper.atomicMove(partFile, resolvedFile);
}

/**
 * upstream: `Plugin#load()`'s render-task half.
 *
 * - A missing file is not an error: nothing was ever saved, so an empty queue is correct.
 * - A file whose top-level structure cannot be parsed at all (a genuinely truncated write,
 *   e.g. the process died mid-`writeFile`) is refused wholesale — reported through
 *   `onError` and deleted, exactly as upstream deletes `tasks.dat` on a read failure —
 *   rather than attempting to salvage whatever bytes happen to be there.
 * - A version that does not match {@link RENDER_TASK_QUEUE_FORMAT_VERSION} is treated the
 *   same way: refused and discarded, never interpreted under the wrong layout.
 * - Once the top level parses, individual render-task entries are lenient: a `map` id that
 *   is no longer loaded, or an unrecognised task `type`, drops only that one entry (see
 *   {@link createRenderTaskBlueNBT}'s `onDroppedTask`) and the rest of the queue restores.
 */
export async function loadRenderTaskQueue(
    file: string,
    maps: ReadonlyMap<string, BmMap>,
    onError: (message: string, error: unknown) => void = logError,
): Promise<RenderTask[]> {
    const resolvedFile = resolve(file);

    let bytes: Uint8Array;
    try {
        bytes = await readFile(resolvedFile);
    } catch (ex) {
        if (isNoSuchFile(ex)) return [];
        onError(`Failed to read render-task queue '${resolvedFile}'`, ex);
        return [];
    }

    const blueNBT = createRenderTaskBlueNBT(maps, (error) =>
        onError("Failed to load render-task", error),
    );

    let data: TasksData;
    try {
        data = blueNBT.read(bytes, TASKS_DATA_TOKEN);
    } catch (ex) {
        onError(`Failed to parse render-task queue '${resolvedFile}', discarding it`, ex);
        await deleteQuietly(resolvedFile);
        return [];
    }

    if (data.version !== RENDER_TASK_QUEUE_FORMAT_VERSION) {
        onError(
            `Render-task queue '${resolvedFile}' has format version ${data.version}, ` +
                `expected ${RENDER_TASK_QUEUE_FORMAT_VERSION}; discarding it`,
            null,
        );
        await deleteQuietly(resolvedFile);
        return [];
    }

    return data.renderTasks;
}
