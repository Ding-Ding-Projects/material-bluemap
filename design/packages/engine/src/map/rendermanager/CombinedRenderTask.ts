import { RenderTask } from "./RenderTask.js";

/**
 * upstream: `common/.../rendermanager/CombinedRenderTask.java`
 *
 * Runs a list of tasks strictly in order: every call to {@link CombinedRenderTask.doWork}
 * goes to the current sub-task, and the cursor only moves on once that sub-task says it
 * has no more work. Nothing here runs two sub-tasks at once, which is the whole point —
 * "save the map, then update every region, then save it again" is only correct if the
 * saves really do bracket the updates.
 */
export class CombinedRenderTask implements RenderTask {
    readonly #description: string;
    readonly #tasks: readonly RenderTask[];
    #currentTaskIndex: number;

    /**
     * @param tasks copied and frozen, matching upstream's
     *        `Collections.unmodifiableList(new ArrayList<>(tasks))`: a caller that keeps
     *        mutating the collection it passed in must not be able to change what a
     *        running task will do next.
     */
    constructor(description: string, tasks: Iterable<RenderTask>, currentTaskIndex = 0) {
        this.#description = description;
        this.#tasks = Object.freeze([...tasks]);
        this.#currentTaskIndex = currentTaskIndex;
    }

    getDescription(): string {
        return this.#description;
    }

    getTasks(): readonly RenderTask[] {
        return this.#tasks;
    }

    getCurrentTaskIndex(): number {
        return this.#currentTaskIndex;
    }

    /**
     * upstream: the `synchronized` block picks the sub-task and advances the cursor, then
     * releases the lock *before* running it — so several threads can be inside the same
     * sub-task, but never inside two different ones.
     *
     * Javascript has no preemption, so everything from the first line to the `await` below
     * is already indivisible; that synchronous prefix *is* the critical section, and it
     * contains exactly what upstream's did. Running `task.doWork()` after it, rather than
     * inside it, is not an optimisation either — overlapping calls to a single sub-task is
     * how a region task gets more than one tile in flight.
     *
     * Note what does *not* happen when the current sub-task is exhausted: the cursor moves
     * and the call returns without doing any work. That empty call is upstream's, and a
     * manager that treats "doWork returned" as "a unit of work happened" will mis-measure
     * throughput by exactly one call per sub-task.
     */
    async doWork(): Promise<void> {
        if (!this.hasMoreWork()) return;
        const task = this.#tasks[this.#currentTaskIndex];
        if (task === undefined) return;

        if (!task.hasMoreWork()) {
            this.#currentTaskIndex++;
            return;
        }

        await task.doWork();
    }

    hasMoreWork(): boolean {
        return this.#currentTaskIndex < this.#tasks.length;
    }

    /**
     * upstream: `currentTask + tasks[currentTask].estimateProgress()` over the task count.
     *
     * Every sub-task is weighted equally regardless of how long it actually takes, so a
     * combined task holding two map-saves around a thousand region updates reports 1/1002
     * done the moment the first save finishes. That is upstream's arithmetic and the CLI's
     * ETA is calibrated against it.
     *
     * The empty-list case cannot divide by zero: `0 >= 0` returns 1 first.
     */
    estimateProgress(): number {
        const currentTask = this.#currentTaskIndex;
        if (currentTask >= this.#tasks.length) return 1;

        let total = currentTask;
        total += this.#tasks[currentTask]?.estimateProgress() ?? 0;

        return total / this.#tasks.length;
    }

    cancel(): void {
        for (const task of this.#tasks) task.cancel();
    }

    /**
     * upstream: `contains(RenderTask)`.
     *
     * Three cases, in upstream's order:
     * 1. it is this task;
     * 2. it is another combined task, in which case *every* one of its sub-tasks must be
     *    contained here — note this makes an empty combined task contained by everything,
     *    which is vacuously true and is upstream's behaviour;
     * 3. otherwise, ask each sub-task, so containment reaches through nesting.
     */
    contains(task: RenderTask): boolean {
        if (RenderTask.equals(this, task)) return true;

        if (task instanceof CombinedRenderTask) {
            for (const subTask of task.#tasks) {
                if (!this.contains(subTask)) return false;
            }
            return true;
        }

        for (const subTask of this.#tasks) {
            if (subTask.contains(task)) return true;
        }

        return false;
    }

    /** upstream: the current sub-task's description, or empty once the list is exhausted */
    getDetail(): string | null {
        if (this.#currentTaskIndex >= this.#tasks.length) return null;
        return this.#tasks[this.#currentTaskIndex]?.getDescription() ?? null;
    }
}
