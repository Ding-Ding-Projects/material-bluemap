/**
 * upstream: util/InstancePool.java
 *
 * A pool of reusable instances, so the mesher can recycle its multi-megabyte tile
 * buffers instead of reallocating one per tile. `recycler` gets the instance back and
 * returns either the instance to pool or `null` to drop it.
 */

/** upstream: `Supplier<T>` */
export type InstanceCreator<T> = () => T;

/** upstream: `Function<T, T>` — returning null drops the instance instead of pooling it */
export type InstanceRecycler<T> = (instance: T) => T | null;

export class InstancePool<T> {
    private readonly creator: InstanceCreator<T>;
    private readonly recycler: InstanceRecycler<T>;
    private readonly pool: T[] = [];

    /** upstream: `@Nullable Duration autoClearTime` (milliseconds here) */
    private readonly autoClearTime: number | null;
    private autoClearTask: ReturnType<typeof setTimeout> | null = null;

    constructor(
        creator: InstanceCreator<T>,
        recycler: InstanceRecycler<T> = (instance) => instance,
        autoClearTime: number | null = null,
    ) {
        this.creator = creator;
        this.recycler = recycler;
        this.autoClearTime = autoClearTime;
        this.updateAutoClear();
    }

    /**
     * upstream: `private synchronized void updateAutoClear()`.
     *
     * The timer is `unref`'d, because upstream's is a daemon thread: a pool that has
     * been used once must not be the reason a node process refuses to exit.
     */
    private updateAutoClear(): void {
        if (this.autoClearTask !== null) clearTimeout(this.autoClearTask);
        if (this.autoClearTime !== null) {
            const task = setTimeout(() => {
                this.clear();
            }, this.autoClearTime);
            if (typeof task === "object" && typeof task.unref === "function") task.unref();
            this.autoClearTask = task;
        }
    }

    /** upstream: `T claimInstance()` */
    claimInstance(): T {
        let instance = this.pool.pop();
        if (instance === undefined) {
            instance = this.creator();
        }
        this.updateAutoClear();
        return instance;
    }

    /** upstream: `void recycleInstance(T instance)` */
    recycleInstance(instance: T): void {
        const recycled = this.recycler(instance);
        if (recycled !== null) this.pool.push(recycled);
        this.updateAutoClear();
    }

    /** upstream: `void clear()` */
    clear(): void {
        this.pool.length = 0;
    }
}
