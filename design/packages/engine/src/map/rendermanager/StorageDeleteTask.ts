import type { MapStorage } from "../../storage/MapStorage.js";
import { RenderTask } from "./RenderTask.js";

/**
 * upstream: `common/.../rendermanager/StorageDeleteTask.java`
 *
 * Deletes a map from a storage. Unlike {@link MapPurgeTask} this does *not* need a
 * `BmMap`, which is the whole reason it exists: it is how a map that is no longer in the
 * configuration gets removed, and by then there is no loaded map to purge. Nothing here
 * resets render state either — there is none to reset.
 */
export class StorageDeleteTask implements RenderTask {
    readonly #storage: MapStorage;
    readonly #mapId: string;

    #progress: number;
    #hasMoreWork: boolean;
    #cancelled: boolean;

    constructor(storage: MapStorage, mapId: string) {
        // upstream: Objects.requireNonNull on both
        if (storage === null || storage === undefined) throw new Error("storage must not be null");
        if (mapId === null || mapId === undefined) throw new Error("mapId must not be null");

        this.#storage = storage;
        this.#mapId = mapId;
        this.#progress = 0;
        this.#hasMoreWork = true;
        this.#cancelled = false;
    }

    getStorage(): MapStorage {
        return this.#storage;
    }

    getMapId(): string {
        return this.#mapId;
    }

    /** upstream: claim the single unit of work, then check cancellation — see {@link MapPurgeTask.doWork} */
    async doWork(): Promise<void> {
        if (!this.#hasMoreWork) return;
        this.#hasMoreWork = false;
        if (this.#cancelled) return;

        await this.#storage.delete((progress) => {
            this.#progress = progress;
            return !this.#cancelled;
        });
    }

    hasMoreWork(): boolean {
        return this.#hasMoreWork && !this.#cancelled;
    }

    estimateProgress(): number {
        return this.#progress;
    }

    cancel(): void {
        this.#cancelled = true;
    }

    /**
     * upstream: `storage.equals(sTask.storage) && mapId.equals(sTask.mapId)`.
     *
     * No `MapStorage` implementation overrides `equals` upstream or here, so the storage
     * comparison is identity in both. Two delete-tasks naming the same map id on two
     * *different* storage objects are therefore not equal — which is right, because they
     * delete different files.
     */
    contains(task: RenderTask): boolean {
        if (task === (this as RenderTask)) return true;
        if (task instanceof StorageDeleteTask)
            return this.#storage === task.#storage && this.#mapId === task.#mapId;
        return false;
    }

    getDescription(): string {
        return `deleting map '${this.#mapId}'`;
    }

    getDetail(): string | null {
        return RenderTask.getDetail();
    }
}
