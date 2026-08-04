import type { BmMap } from "../BmMap.js";
import type { MapRenderTask } from "./MapRenderTask.js";
import { RenderTask } from "./RenderTask.js";

/**
 * upstream: `common/.../rendermanager/MapSaveTask.java`
 *
 * Saves the map exactly once, then reports itself finished forever.
 */
export class MapSaveTask implements MapRenderTask {
    readonly #map: BmMap;

    /**
     * upstream: an `AtomicBoolean`, and the atomicity is the feature — several render
     * threads call `doWork()` on the same task, and `compareAndSet(false, true)` lets
     * exactly one of them through to `map.save()`.
     *
     * A plain boolean reproduces that here only because the flip below happens *before*
     * the first `await`: javascript runs to completion up to that point, so a second
     * caller entering while the save is in flight already sees `true` and returns. Writing
     * it the other way round — save, then set the flag — would let every overlapping
     * caller save, which is the bug the atomic was there to stop.
     */
    #saved: boolean;

    constructor(map: BmMap) {
        this.#map = map;
        this.#saved = false;
    }

    getMap(): BmMap {
        return this.#map;
    }

    async doWork(): Promise<void> {
        if (this.#saved) return;
        this.#saved = true;
        await this.#map.save();
    }

    hasMoreWork(): boolean {
        return !this.#saved;
    }

    estimateProgress(): number {
        return RenderTask.estimateProgress();
    }

    /**
     * upstream: `saved.set(true)`.
     *
     * Cancelling does not interrupt a save already running — it only stops one that has
     * not started. Cancelling mid-save and assuming nothing was written is wrong.
     */
    cancel(): void {
        this.#saved = true;
    }

    getDescription(): string {
        return `saving map '${this.#map.getId()}'`;
    }

    getDetail(): string | null {
        return RenderTask.getDetail();
    }

    /**
     * upstream: identity, then `getClass() != task.getClass()`, then the map ids.
     *
     * `instanceof` is the same test here because upstream's class is `final`, so no
     * subclass can exist to tell the two checks apart. Two save-tasks for the same map id
     * contain each other, which is what stops the manager scheduling a second save of a
     * map that is already queued to be saved.
     */
    contains(task: RenderTask): boolean {
        if ((this as RenderTask) === task) return true;
        if (!(task instanceof MapSaveTask)) return false;
        return this.#map.getId() === task.#map.getId();
    }
}
