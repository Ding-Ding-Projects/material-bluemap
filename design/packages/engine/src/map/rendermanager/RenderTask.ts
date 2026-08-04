/**
 * upstream: `common/.../rendermanager/RenderTask.java`
 *
 * The unit of work a render manager schedules. One `doWork()` call is *a slice*, not the
 * whole job: the manager calls it in a loop, on as many threads as it has, until
 * {@link RenderTask.hasMoreWork} says stop. Which is also why `hasMoreWork()` being false
 * is ambiguous on purpose — upstream's own javadoc says it means "finished OR cancelled
 * and choosing to stop", and a caller must not read it as "succeeded".
 *
 * ## Two things java gives for free that TypeScript does not
 *
 * **Checked exceptions.** `void doWork() throws Exception` lets a task fail loudly and
 * lets the manager log it and carry on. Here `doWork` returns a promise, so the same
 * failure arrives as a rejection. A task that rejects has *not* necessarily given up:
 * `hasMoreWork()` is still the authority, exactly as upstream, so a manager that treats a
 * rejection as completion will spin forever on a task that keeps failing — it must check
 * `hasMoreWork()` and cancel the task itself if it wants to stop.
 *
 * **Interface defaults.** Java declares bodies for `estimateProgress`, `contains` and
 * `getDetail`; a TypeScript interface cannot. Rather than making them optional — which
 * pushes an `?? 0` onto every call site and lets one forgotten `??` silently report a
 * finished task as 0% — they are required here and the companion {@link RenderTask}
 * object below carries upstream's bodies, which is the same shape `MapSettings` and
 * `RenderSettings` already use for java interface-defaults in this port.
 *
 * ## Asynchrony
 *
 * Only `doWork` is asynchronous, and it has to be: the port's `BmMap.save`,
 * `BmMap.renderTile` and every storage call return promises. Everything else stays
 * synchronous because upstream's is, and because a progress bar that has to `await` to
 * read a percentage is a progress bar that changes the thing it measures.
 */
export interface RenderTask {
    /** upstream: `void doWork() throws Exception` */
    doWork(): Promise<void>;

    /**
     * Whether this task is requesting more calls to its {@link RenderTask.doWork} method.
     *
     * This can be false because the task is finished, OR because the task got cancelled
     * and decides to interrupt.
     */
    hasMoreWork(): boolean;

    /**
     * The estimated progress made so far, from 0 to 1.
     *
     * upstream interface-default: {@link RenderTask.estimateProgress}
     */
    estimateProgress(): number;

    /**
     * Requests to cancel this task. The task then self-decides what to do with this request.
     */
    cancel(): void;

    /**
     * Checks if the given task is somehow included with this task.
     *
     * upstream interface-default: {@link RenderTask.contains}
     */
    contains(task: RenderTask): boolean;

    getDescription(): string;

    /**
     * upstream: `Optional<String> getDetail()` — an absent detail is `null` here, which is
     * how this port spells `Optional`/`@Nullable` everywhere else.
     *
     * upstream interface-default: {@link RenderTask.getDetail}
     */
    getDetail(): string | null;

    /**
     * upstream: `Object#equals`, which most tasks inherit as identity and a few override.
     *
     * Optional because that is exactly what java gives: a class that does not declare it
     * gets identity. {@link RenderTask.equals} resolves the two cases the same way the JVM
     * does, so `contains` behaves identically whether or not a task overrode it.
     */
    equals?(other: unknown): boolean;
}

export const RenderTask = {
    /** upstream: `default double estimateProgress() { return 0d; }` */
    estimateProgress(): number {
        return 0;
    },

    /** upstream: `default boolean contains(RenderTask task) { return equals(task); }` */
    contains(self: RenderTask, task: RenderTask): boolean {
        return RenderTask.equals(self, task);
    },

    /** upstream: `default Optional<String> getDetail() { return Optional.empty(); }` */
    getDetail(): string | null {
        return null;
    },

    /**
     * `self.equals(other)` when the task overrides it, identity when it does not — the
     * two cases java's dynamic dispatch picks between.
     */
    equals(self: RenderTask, other: unknown): boolean {
        if (self.equals !== undefined) return self.equals(other);
        return (self as unknown) === other;
    },
};
