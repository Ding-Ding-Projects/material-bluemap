/**
 * upstream: `common/.../rendermanager/RenderManager.java`
 *
 * The worker pool that drives a whole map render: a queue of {@link RenderTask}s, a fixed
 * number of workers chewing on the head of that queue, a progress estimate, and the
 * start / stop / await controls around it. This is the piece that turns "render a tile"
 * into "render a map".
 *
 * ## The one structural fact that surprises everybody
 *
 * The pool is **not** N tasks running side by side. Every worker works on the *same*
 * task — the head of the queue — calling its `doWork()` over and over until it says it
 * has no more work; only then does the head retire and the next task begin. The queue is
 * strictly sequential and the parallelism lives *inside* a task. A port that gave each
 * worker its own task would look like the same pool, would be faster on a microbenchmark,
 * and would be wrong: `MapUpdateTask` and friends are written on the assumption that they
 * own the render state they touch for the duration of their turn at the head.
 *
 * ## Java's threading, and what each piece became here
 *
 * Upstream uses real threads, `synchronized`, `wait`/`notify` and `Thread.interrupt`.
 * None of those exist in JavaScript, so this ports the *behaviour*: a bounded number of
 * concurrent in-flight `doWork()` calls over the one event loop.
 *
 * | Java | here | why it is equivalent |
 * | --- | --- | --- |
 * | `WorkerThread extends Thread` | an `async` loop per worker | N loops each awaiting one `doWork()` at a time bounds in-flight work at N, which is the only thing the thread count ever bought |
 * | `synchronized (renderTasks)` | an unbroken **synchronous** region | see the note on {@link RenderManager.doWork} — the hazard here is an `await` mid-mutation, not preemption |
 * | `renderTasks.wait(ms)` | `#awaitSignal(#taskWaiters, ms)` | a timeout plus an explicit wake, which is what a timed `wait` is |
 * | `renderTasks.notifyAll()` | `#notify(#taskWaiters)` | resolving a promise queues a microtask, so the notifier keeps running to the end of its synchronous region exactly as a thread holding the monitor does |
 * | `worker.interrupt()` | `running = false` + a wake | cooperative: see the cancellation note below |
 * | `AtomicInteger busyCount` | a plain `number` | atomics exist to make read-modify-write indivisible; `this.#busyCount++` inside a synchronous region already is |
 *
 * **`worker_threads` was considered and rejected.** Nothing upstream's semantics need is
 * unavailable on one event loop: the pool never runs two tasks at once, never touches
 * shared mutable state from two places at the same instant (it holds a lock precisely so
 * it does not), and the work itself is storage IO, which Node already overlaps without
 * threads. What real threads would buy is CPU parallelism inside a single task's
 * `doWork()` — a genuine benefit, but a *performance* change that would force every
 * `RenderTask` to become serialisable across a worker boundary. That is a different port.
 *
 * ## Cancellation actually stops work
 *
 * `Thread.interrupt()` tears a thread out of a blocking call; there is no such thing here,
 * so cancellation is cooperative in two layers, and both are load-bearing:
 *
 * - **Task level** — {@link RenderManager.removeRenderTask} and friends call
 *   `RenderTask.cancel()`, after which the task reports `hasMoreWork() === false` and the
 *   pool stops feeding it. This is upstream's own mechanism, unchanged: even in Java,
 *   removing the *running* task cancels rather than interrupts it.
 * - **Pool level** — {@link RenderManager.stop} clears `running` and wakes every waiting
 *   worker. A worker suspended in an idle wait resolves immediately and exits; a worker
 *   inside `task.doWork()` exits as soon as that call settles, because the loop condition
 *   is re-tested before another one is issued. What it does *not* do is abandon an
 *   in-flight `doWork()` mid-way — JavaScript cannot, and neither does upstream for work
 *   that is not sitting in an interruptible call.
 *
 * The failure this arrangement is written against is a pool that stops *reporting* work
 * while still doing it: had `stop()` only flipped a flag consulted by the progress
 * tracker, or had the worker loop re-checked `running` only after the queue drained, a
 * stopped manager would go on rendering tiles and writing render state with nobody
 * watching. The `running` test sits at the top of the loop and gates every single
 * `doWork()` call, so at most one call per worker outlives `stop()`.
 */

import type { BmMap } from "../BmMap.js";
import { ProgressTracker } from "./ProgressTracker.js";
import { RenderTask } from "./RenderTask.js";
import {
    loadRenderTaskQueue as loadRenderTaskQueueFile,
    saveRenderTaskQueue as saveRenderTaskQueueFile,
} from "./serialization/RenderTaskQueueStorage.js";

/*
 * upstream: Logger.global — the logger-package is not part of this port (yet), see the
 * equivalent note in map/BmMap.ts. Both are overridable through RenderManagerOptions so a
 * test can assert on them instead of printing at whoever is watching the console.
 */
function logInfo(message: string): void {
    console.info(message);
}

function logError(message: string, ex: unknown): void {
    console.error(message, ex);
}

/** upstream: the anonymous `LinkedHashMap`'s `removeEldestEntry` bound. */
const COMPLETED_TASK_HISTORY = 10;

/**
 * How long a worker may hold the event loop before it is made to yield a macrotask.
 *
 * This has no upstream counterpart and cannot have one: upstream's workers are OS threads,
 * preempted whether they cooperate or not. Here they are `async` loops, and `await` on an
 * already-settled promise only yields the **microtask** queue — which is drained to
 * exhaustion before any timer or IO callback runs. A pool of workers over tasks whose
 * `doWork()` never awaits anything real would therefore keep the microtask queue
 * permanently non-empty and starve every macrotask in the process, including the very
 * `stop()` the caller is trying to reach. The pool would be, literally, unstoppable.
 *
 * Yielding on elapsed time rather than on an iteration count keeps the cost proportional:
 * one macrotask hop per 20ms of work regardless of whether a `doWork()` takes a
 * microsecond or a second.
 */
const EVENT_LOOP_YIELD_INTERVAL_MS = 20;

/** Hands control back to the event loop so timers, IO and the caller's own code can run. */
function yieldToEventLoop(): Promise<void> {
    return new Promise<void>((resolve) => {
        // `setImmediate` runs in the check phase, so it costs nothing beyond one turn;
        // `setTimeout(0)` is clamped to a whole millisecond and would cap the pool at
        // ~1000 work units a second on any runtime without it.
        if (typeof setImmediate === "function") setImmediate(resolve);
        else setTimeout(resolve, 0);
    });
}

/**
 * Upstream's hard-coded intervals, exposed only so a test need not sit through them.
 *
 * Every default is the literal from `RenderManager.java`. They are options rather than
 * constants because the error backoff is ten seconds by design, and a test proving that a
 * throwing task does not kill the pool should not take ten seconds to say so.
 */
export interface RenderManagerOptions {
    /** upstream: the `10000` in `doWork()`'s two `renderTasks.wait(...)` calls. */
    idleWaitMs?: number;
    /** upstream: the `Thread.sleep(10000)` after a worker throws. */
    errorBackoffMs?: number;
    /** upstream: the `5000` in `awaitIdle(...)`. */
    awaitIdleWaitMs?: number;
    /** upstream: the `10000` in `awaitShutdown()`. */
    awaitShutdownWaitMs?: number;
    /** upstream: the `5000` in `new ProgressTracker(5000, 12)`. */
    progressUpdateIntervalMs?: number;
    /** upstream: the `12` in `new ProgressTracker(5000, 12)`. */
    progressAveragingCount?: number;
    /** upstream: `Logger.global.logError` */
    onError?: (message: string, error: unknown) => void;
    /** upstream: `Logger.global.logInfo` */
    onInfo?: (message: string) => void;
}

/**
 * upstream: the inner `WorkerThread` class.
 *
 * Reduced to its identity, because that is all of it that survives translation: the name
 * and priority it sets exist to make a thread dump readable and to be nice to the rest of
 * the machine, and there is no thread to name or deprioritise. The id is kept because it
 * appears in the error message upstream logs, and an error that cannot say which worker
 * produced it is a worse error.
 */
interface Worker {
    readonly id: number;
}

/*
 * Task equality is `RenderTask.equals(self, other)`, never `===`.
 *
 * Java's `List.remove(Object)` and `first.equals(task)` dispatch to whatever the task
 * declared, and it is not always identity: `WorldRegionUpdateTask` overrides it to mean
 * "same map, same region, same force strategy", so removing a freshly-constructed
 * descriptor really does remove the equivalent task already queued. Comparing with `===`
 * here would leave `removeRenderTask` silently failing on exactly the tasks whose whole
 * point is being addressable by value.
 */

export class RenderManager {
    static #nextRenderManagerIndex = 0;

    readonly #id: number;
    #nextWorkerThreadIndex = 0;

    #running = false;
    #lastTimeBusy = -1;

    /**
     * upstream: `Collection<WorkerThread> workerThreads` plus `AtomicInteger busyCount`.
     *
     * `#workers` holds the live workers and is what `isRunning()` reads; `#busyCount` is
     * how many of them are inside a `task.doWork()` right now, which is the number the
     * head-of-queue retirement rule turns on.
     */
    readonly #workers = new Set<Worker>();
    #busyCount = 0;

    #progressTracker: ProgressTracker | null = null;
    #newTask = true;

    /** upstream: `LinkedList<RenderTask>`. Index 0 is *the task currently being worked on*. */
    readonly #renderTasks: RenderTask[] = [];

    /**
     * upstream: the size-capped anonymous `LinkedHashMap<RenderTask, Long>`.
     *
     * A JS `Map` iterates in insertion order and, like `LinkedHashMap` in access-order-off
     * mode, re-setting an existing key does not move it — so evicting `keys().next()` is
     * exactly `removeEldestEntry`.
     */
    readonly #completedTasks = new Map<RenderTask, number>();

    /**
     * The promise-resolvers standing in for `Object.wait`.
     *
     * Two separate sets because Java has two separate monitors: `renderTasks` (woken by a
     * schedule, a completion, or the end of any `doWork()`) and `workerThreads` (woken
     * when a worker exits). `#stopWaiters` has no monitor of its own upstream — it is what
     * `Thread.interrupt()` did to the ten-second error sleep, which otherwise keeps a
     * worker alive for ten seconds after `stop()` and makes `awaitShutdown()` look hung.
     */
    readonly #taskWaiters = new Set<() => void>();
    readonly #workerWaiters = new Set<() => void>();
    readonly #stopWaiters = new Set<() => void>();

    readonly #idleWaitMs: number;
    readonly #errorBackoffMs: number;
    readonly #awaitIdleWaitMs: number;
    readonly #awaitShutdownWaitMs: number;
    readonly #progressUpdateIntervalMs: number;
    readonly #progressAveragingCount: number;
    readonly #onError: (message: string, error: unknown) => void;
    readonly #onInfo: (message: string) => void;

    constructor(options: RenderManagerOptions = {}) {
        this.#id = RenderManager.#nextRenderManagerIndex++;

        this.#idleWaitMs = options.idleWaitMs ?? 10_000;
        this.#errorBackoffMs = options.errorBackoffMs ?? 10_000;
        this.#awaitIdleWaitMs = options.awaitIdleWaitMs ?? 5_000;
        this.#awaitShutdownWaitMs = options.awaitShutdownWaitMs ?? 10_000;
        this.#progressUpdateIntervalMs = options.progressUpdateIntervalMs ?? 5_000;
        this.#progressAveragingCount = options.progressAveragingCount ?? 12;
        this.#onError = options.onError ?? logError;
        this.#onInfo = options.onInfo ?? logInfo;
    }

    // ---------------------------------------------------------------- lifecycle

    /**
     * upstream: `start(int threadCount, int threadPriority)`.
     *
     * `threadPriority` is accepted and ignored: there are no threads to prioritise, and
     * dropping the parameter would silently change the meaning of every existing
     * positional call site rather than making the situation visible.
     *
     * Java's `isRunning()` here is racy — it reads `Thread.isAlive()`, which is still
     * false for a thread that has been constructed but has not yet been scheduled, so two
     * near-simultaneous `start()` calls can both pass the guard. This port registers each
     * worker in `#workers` synchronously before the loop can suspend, so the guard is
     * exact. That is a strictly-narrower window, never a wider one.
     */
    start(threadCount: number, _threadPriority?: number): void {
        if (threadCount <= 0) throw new Error("threadCount has to be 1 or more!");
        if (this.isRunning()) throw new Error("RenderManager is already running!");

        /*
         * Java: synchronized (this.workerThreads) { ... }
         *
         * The lock kept a second starter, and any worker's exit handler, from seeing this
         * mid-rebuild — an empty `#workers` with `running` already true reads as "stopped"
         * to `isRunning()` and as "go" to a worker. There is no `await` between the first
         * line of this block and the last, so no continuation can observe that state.
         */
        this.#workers.clear();
        this.#busyCount = 0;

        this.#progressTracker?.cancel();
        this.#progressTracker = new ProgressTracker(
            this.#progressUpdateIntervalMs,
            this.#progressAveragingCount,
        );
        this.#newTask = true;

        this.#running = true;

        for (let i = 0; i < threadCount; i++) {
            const worker: Worker = { id: this.#nextWorkerThreadIndex++ };
            this.#workers.add(worker);
            // Deliberately not awaited: this is `Thread.start()`, which returns before the
            // thread has run. `#runWorker` contains its own error handling and its
            // `finally` deregisters the worker, so the only way out is through that path.
            void this.#runWorker(worker);
        }
    }

    /**
     * upstream: `stop()` — clear the flag, interrupt the workers, kill the progress timer.
     *
     * The two notifications are what `interrupt()` did: without them a worker parked in a
     * ten-second idle wait, or in the ten-second post-error backoff, keeps the pool
     * "running" long after it was told to stop, and `awaitShutdown()` sits there for it.
     * Note that this does *not* cancel the running task — neither does upstream; that is
     * {@link RenderManager.removeAllRenderTasks}'s job.
     */
    stop(): void {
        this.#running = false;
        this.#progressTracker?.cancel();
        this.#notify(this.#taskWaiters);
        this.#notify(this.#stopWaiters);
    }

    /**
     * upstream: `isRunning()` — "is any worker still alive".
     *
     * A worker removes itself from `#workers` in its own `finally`, so an empty set means
     * every loop has genuinely exited rather than merely been asked to.
     */
    isRunning(): boolean {
        return this.#workers.size > 0;
    }

    /**
     * upstream: `awaitIdle(boolean)` — resolves once the queue is empty.
     *
     * Upstream logs on every wakeup, and wakeups come from *every* completed `doWork()`
     * rather than only from the 5s timeout, so the log is far chattier than the interval
     * suggests. That is upstream's behaviour and is kept: making it quieter would change
     * what an operator sees while waiting for a shutdown to drain.
     */
    async awaitIdle(log = false): Promise<void> {
        while (this.#renderTasks.length > 0) {
            await this.#awaitSignal(this.#taskWaiters, this.#awaitIdleWaitMs);

            if (log) {
                const task = this.getCurrentRenderTask();
                if (task !== null) {
                    this.#onInfo(
                        "Waiting for task '" +
                            task.getDescription() +
                            "' to stop.. (" +
                            Math.round(task.estimateProgress() * 10000) / 100 +
                            "%)",
                    );
                }
            }
        }
    }

    /**
     * upstream: `awaitShutdown()`.
     *
     * Does not itself stop anything — call {@link RenderManager.stop} first, or this waits
     * for as long as the workers keep working, exactly as the Java does.
     */
    async awaitShutdown(): Promise<void> {
        while (this.isRunning()) {
            await this.#awaitSignal(this.#workerWaiters, this.#awaitShutdownWaitMs);
        }
    }

    // ---------------------------------------------------------------- scheduling

    /**
     * upstream: `scheduleRenderTask(RenderTask)`.
     *
     * Two things happen before the append, and the order matters. First, the task is
     * refused outright if something already queued *contains* it — re-queueing a region
     * that a pending whole-map update will cover anyway would render it twice. Second, any
     * queued task that this one contains is dropped, because the reverse is now true of
     * them.
     */
    scheduleRenderTask(task: RenderTask): boolean {
        // Java: synchronized (this.renderTasks). Everything from the containment check to
        // the append has to be one indivisible step, or a concurrent schedule could insert
        // between the check and the append and end up with both tasks queued. Synchronous
        // start to finish here, so nothing can interleave.
        if (this.containsRenderTask(task)) return false;

        this.#removeTasksThatAreContainedIn(task);
        this.#renderTasks.push(task);
        this.#notify(this.#taskWaiters);
        return true;
    }

    /** upstream: `scheduleRenderTasks(RenderTask...)` — returns how many were accepted. */
    scheduleRenderTasks(...tasks: RenderTask[]): number {
        let count = 0;
        for (const task of tasks) {
            if (this.scheduleRenderTask(task)) count++;
        }
        return count;
    }

    /**
     * upstream: `scheduleRenderTaskNext(RenderTask)` — jump the queue, but never the head.
     *
     * Index 1, not index 0: the head is being worked on right now by every worker, and
     * displacing it would leave those workers calling `doWork()` on a task that is no
     * longer the one the completion bookkeeping is tracking.
     */
    scheduleRenderTaskNext(task: RenderTask): boolean {
        if (this.#renderTasks.length <= 1) return this.scheduleRenderTask(task);
        if (this.containsRenderTask(task)) return false;

        this.#removeTasksThatAreContainedIn(task);
        this.#renderTasks.splice(1, 0, task);
        this.#notify(this.#taskWaiters);
        return true;
    }

    /**
     * upstream: `scheduleRenderTasksNext(RenderTask...)`.
     *
     * The backwards loop is upstream's and is the point of the method: each accepted task
     * lands at index 1, so inserting the last one first leaves them at 1..n in the order
     * they were given.
     */
    scheduleRenderTasksNext(...tasks: RenderTask[]): number {
        // Checked once, before any insertion, exactly as upstream does: with 0 or 1 tasks
        // queued there is no "next" position to speak of, so they are simply appended.
        if (this.#renderTasks.length <= 1) return this.scheduleRenderTasks(...tasks);

        let count = 0;
        for (let i = tasks.length - 1; i >= 0; i--) {
            const task = tasks[i];
            if (task !== undefined && this.scheduleRenderTaskNext(task)) count++;
        }
        return count;
    }

    /**
     * upstream: `reorderRenderTasks(Comparator<RenderTask>)`.
     *
     * The head is lifted out and put straight back so it cannot be reordered away from
     * position 0 while workers are inside it. `Array.prototype.sort` has been required to
     * be stable since ES2019, matching `List.sort`'s TimSort, so equal-ranked tasks keep
     * the order they were scheduled in rather than being shuffled by the engine's choice
     * of algorithm.
     */
    reorderRenderTasks(taskComparator: (a: RenderTask, b: RenderTask) => number): void {
        if (this.#renderTasks.length <= 2) return;

        const currentTask = this.#renderTasks.shift();
        this.#renderTasks.sort(taskComparator);
        if (currentTask !== undefined) this.#renderTasks.unshift(currentTask);
    }

    /**
     * upstream: `removeRenderTask(RenderTask)`.
     *
     * Removing the *running* task cancels it instead of dropping it, and that asymmetry is
     * deliberate: workers are inside it, and the queue's own bookkeeping retires a head
     * only once `busyCount` reaches zero. Cancelling makes `hasMoreWork()` go false, which
     * routes it through that same retirement path with the in-flight calls accounted for.
     * Yanking it out from under the workers would leave `busyCount` charged against a task
     * nobody is tracking any more.
     */
    removeRenderTask(task: RenderTask): boolean {
        if (this.#renderTasks.length === 0) return false;

        const first = this.#renderTasks[0];
        if (first !== undefined && RenderTask.equals(first, task)) {
            first.cancel();
            return true;
        }

        const index = this.#renderTasks.findIndex((candidate) => RenderTask.equals(candidate, task));
        if (index < 0) return false;
        this.#renderTasks.splice(index, 1);
        return true;
    }

    /**
     * upstream: `removeRenderTasksIf(Predicate<RenderTask>)`.
     *
     * The head is lifted out, tested, cancelled if it matches — and then put **back**. A
     * matching head is cancelled, never removed, for the reason given on
     * {@link RenderManager.removeRenderTask}.
     */
    removeRenderTasksIf(removeCondition: (task: RenderTask) => boolean): void {
        if (this.#renderTasks.length === 0) return;

        const first = this.#renderTasks.shift();
        if (first === undefined) return;
        if (removeCondition(first)) first.cancel();

        for (let i = this.#renderTasks.length - 1; i >= 0; i--) {
            const task = this.#renderTasks[i];
            if (task !== undefined && removeCondition(task)) this.#renderTasks.splice(i, 1);
        }

        this.#renderTasks.unshift(first);
    }

    /** upstream: `removeAllRenderTasks()` — cancels the head, discards everything behind it. */
    removeAllRenderTasks(): void {
        if (this.#renderTasks.length === 0) return;

        const first = this.#renderTasks[0];
        if (first === undefined) return;
        first.cancel();
        this.#renderTasks.length = 0;
        this.#renderTasks.push(first);
    }

    /**
     * upstream: `removeTasksThatAreContainedIn(RenderTask)`.
     *
     * The `size < 2` early return is upstream's, and it is not merely an optimisation: with
     * exactly one queued task the head would be lifted out, possibly cancelled, and put
     * back — so a new task that contains the running one would cancel it. Upstream chooses
     * not to, and the head keeps running to completion.
     */
    #removeTasksThatAreContainedIn(containingTask: RenderTask): void {
        if (this.#renderTasks.length < 2) return;

        const first = this.#renderTasks.shift();
        if (first === undefined) return;
        if (containingTask.contains(first)) first.cancel();

        for (let i = this.#renderTasks.length - 1; i >= 0; i--) {
            const task = this.#renderTasks[i];
            if (task !== undefined && containingTask.contains(task)) this.#renderTasks.splice(i, 1);
        }

        this.#renderTasks.unshift(first);
    }

    // ---------------------------------------------------------------- persistence

    /**
     * Writes the whole queue — every scheduled task, the running one included — to `file`,
     * so a later {@link RenderManager.loadRenderTaskQueue} call can resume it.
     *
     * upstream has no equivalent method: `Plugin#save()` reaches directly for
     * `getScheduledRenderTasks()` and hands the result to its own `BlueNBT` wiring. This is
     * that same shape, exposed here instead purely for discoverability — "can the render
     * manager write its own queue out" should not require knowing a separate module exists
     * — while the actual (de)serialization contract lives in
     * `rendermanager/serialization/`, where {@link RenderTaskAdapter}, {@link BmMapAdapter}
     * and each task's `Serialized` form are defined.
     *
     * `maps` is the live map set a saved task may refer to by id; see {@link BmMapAdapter}.
     */
    async saveRenderTaskQueue(file: string, maps: ReadonlyMap<string, BmMap>): Promise<void> {
        await saveRenderTaskQueueFile(file, this.getScheduledRenderTasks(), maps);
    }

    /**
     * Reads a queue previously written by {@link RenderManager.saveRenderTaskQueue} and
     * schedules every task it restores, exactly as upstream's `Plugin#load()` calls
     * `renderManager.scheduleRenderTasks(tasksData.getRenderTasks().toArray(...))`.
     *
     * Uses {@link RenderManager.scheduleRenderTasks} rather than appending directly, so the
     * normal containment rules still apply: a restored task that duplicates one already
     * queued (unusual immediately after a restart, but not impossible if this is called
     * more than once) is refused rather than queued twice. Returns how many were actually
     * accepted, for the same reason {@link RenderManager.scheduleRenderTasks} does.
     *
     * A missing file, a corrupt one, a version mismatch, or one bad entry inside an
     * otherwise-good file are none of them fatal here — see `loadRenderTaskQueue` in
     * `rendermanager/serialization/RenderTaskQueueStorage.ts` for exactly what each of those
     * does instead.
     */
    async loadRenderTaskQueue(file: string, maps: ReadonlyMap<string, BmMap>): Promise<number> {
        const tasks = await loadRenderTaskQueueFile(file, maps, this.#onError);
        return this.scheduleRenderTasks(...tasks);
    }

    // ---------------------------------------------------------------- inspection

    /**
     * upstream: `estimateCurrentRenderTaskTimeRemaining()`, in milliseconds.
     *
     * Zero rather than null when there is nothing to estimate from, so a caller rendering
     * an ETA shows "0" rather than propagating a NaN through a progress bar.
     */
    estimateCurrentRenderTaskTimeRemaining(): number {
        const progressTracker = this.#progressTracker;
        if (progressTracker === null) return 0;

        const task = this.getCurrentRenderTask();
        if (task === null) return 0;

        const progress = task.estimateProgress();
        const timePerProgress = progressTracker.getAverageTimePerProgress();
        // Java's `(long)` cast truncates toward zero.
        return Math.trunc((1 - progress) * timePerProgress);
    }

    /** upstream: `getCurrentRenderTask()` — the head, i.e. the one being worked on. */
    getCurrentRenderTask(): RenderTask | null {
        return this.#renderTasks[0] ?? null;
    }

    /** upstream: `getScheduledRenderTasks()` — a snapshot, head first. */
    getScheduledRenderTasks(): RenderTask[] {
        return [...this.#renderTasks];
    }

    /** upstream: `getScheduledRenderTaskCount()` */
    getScheduledRenderTaskCount(): number {
        return this.#renderTasks.length;
    }

    /**
     * upstream: `containsRenderTask(RenderTask)`.
     *
     * The head is skipped on purpose, and the comment upstream leaves is the whole reason:
     * it is already being processed, so "already scheduled" would be a lie about it — a
     * caller re-scheduling the running task wants it queued again *after* this pass, not
     * refused.
     */
    containsRenderTask(task: RenderTask): boolean {
        for (let i = 1; i < this.#renderTasks.length; i++) {
            if (this.#renderTasks[i]?.contains(task) === true) return true;
        }
        return false;
    }

    /** upstream: `getWorkerThreadCount()` — live workers, not the number `start` was given. */
    getWorkerThreadCount(): number {
        return this.#workers.size;
    }

    /** upstream: `getLastTimeBusy()` — epoch millis, or -1 if the pool has never worked. */
    getLastTimeBusy(): number {
        return this.#lastTimeBusy;
    }

    /**
     * upstream: `getCompletedTasks()` — the last {@link COMPLETED_TASK_HISTORY} tasks and
     * when each finished, as epoch millis.
     *
     * A copy, so a caller cannot evict from the manager's own history. Upstream's
     * `Map.copyOf` drops the iteration order; this keeps it, because a `Map` that
     * preserves insertion order costs nothing to build and a completion history that
     * cannot be read in completion order is most of the way to useless.
     */
    getCompletedTasks(): Map<RenderTask, number> {
        return new Map(this.#completedTasks);
    }

    // ---------------------------------------------------------------- the pool

    /**
     * upstream: `WorkerThread.run()`.
     *
     * The `running` test gating every iteration is what makes {@link RenderManager.stop}
     * real rather than advisory — see the cancellation note at the top of this file.
     */
    async #runWorker(worker: Worker): Promise<void> {
        try {
            // Zero, not `Date.now()`, so the first iteration yields before doing anything.
            // `start()` is synchronous and an `async` function body runs synchronously up
            // to its first `await`; without this hop the workers would begin consuming the
            // queue *inside* the `start()` call, which `Thread.start()` does not do.
            let lastYield = 0;

            while (this.#running) {
                const now = Date.now();
                if (now - lastYield >= EVENT_LOOP_YIELD_INTERVAL_MS) {
                    lastYield = now;
                    await yieldToEventLoop();
                    if (!this.#running) break;
                }

                try {
                    await this.#doWork();
                } catch (error) {
                    this.#onError(
                        "RenderManager(" +
                            this.#id +
                            "): WorkerThread(" +
                            worker.id +
                            "): Exception while doing some work!",
                        error,
                    );

                    // Upstream's comment is worth keeping in force: on error, wait before
                    // resurrecting this worker, so a fault that every worker will hit does
                    // not get hit by all of them at full speed forever. Interruptible via
                    // `#stopWaiters` because `Thread.sleep` was interruptible.
                    await this.#awaitSignal(this.#stopWaiters, this.#errorBackoffMs);
                }
            }
        } finally {
            // Java: synchronized (workerThreads) { remove(this); notifyAll(); }
            // Synchronous, and it must stay that way: `awaitShutdown` reads `isRunning()`
            // — i.e. the set — immediately after being woken, so a wake that arrived
            // before the removal would send it back to sleep for another full interval.
            this.#workers.delete(worker);
            this.#notify(this.#workerWaiters);
        }
    }

    /**
     * upstream: `doWork()` — one worker's turn.
     *
     * ## What the lock was protecting
     *
     * Java wraps everything from "read the head" to "increment busyCount" in
     * `synchronized (this.renderTasks)`, and the invariant it defends is the pairing of
     * **the head of the queue** with **`busyCount`**. Retiring a task is only safe when
     * `hasMoreWork()` is false *and* `busyCount` is zero at the same instant; if those two
     * facts are read at different moments, a worker can observe "no more work" from before
     * another worker incremented `busyCount`, retire a task that is still being worked on,
     * and then have that in-flight call decrement `busyCount` below zero — against the
     * *next* task, which then never retires at all, hanging the queue permanently.
     *
     * The equivalent hazard in a single-threaded runtime is not preemption, it is an
     * `await` between the read and the mutation, which lets another worker's continuation
     * run in the gap. So the port's guarantee is a syntactic one and can be checked by
     * reading it: **there is no `await` anywhere between the head read below and either the
     * `return` or the `busyCount` increment.** Every `await` in this method is either the
     * last statement on its path or the awaited work itself, by which point the pairing has
     * already been committed. The same argument covers the decrement in the `finally`,
     * which is likewise unbroken.
     */
    async #doWork(): Promise<void> {
        // ---- begin critical region (must contain no `await`) ----
        const task = this.#renderTasks[0];

        if (task === undefined) {
            // Java loops on `renderTasks.wait(10000)` inside the lock. Returning to the
            // worker loop instead re-tests `running` on the way round, which is what lets
            // an idle pool shut down promptly instead of after a full idle interval.
            await this.#awaitSignal(this.#taskWaiters, this.#idleWaitMs);
            return;
        }

        if (this.#newTask) {
            this.#newTask = false;
            // `#progressTracker` is non-null whenever a worker runs, since `start()` builds
            // one before creating any. Optional-called anyway so a stray call after `stop()`
            // reports no progress rather than throwing into the worker's error path.
            this.#progressTracker?.resetAndStart(() => task.estimateProgress());
        }

        // Making sure every worker is done with this task before the next one begins.
        if (!task.hasMoreWork()) {
            if (this.#busyCount <= 0) {
                this.#renderTasks.shift();
                this.#putCompleted(task);
                this.#notify(this.#taskWaiters);

                this.#newTask = true;

                // Upstream re-zeroes rather than trusting the counter it just tested — the
                // one place the invariant is re-established from scratch.
                this.#busyCount = 0;
            } else {
                await this.#awaitSignal(this.#taskWaiters, this.#idleWaitMs);
            }

            return;
        }

        this.#busyCount++;
        this.#lastTimeBusy = Date.now();
        // ---- end critical region ----

        try {
            await task.doWork();
        } finally {
            // Also a critical region: the decrement and the wake are one step, so the
            // worker woken by it cannot see the old count.
            this.#busyCount--;
            // Only stamped while somebody is *still* busy. On the last worker out,
            // `lastTimeBusy` stays at the moment work began, which is what makes it usable
            // as "when did this pool last have anything to do".
            if (this.#busyCount > 0) this.#lastTimeBusy = Date.now();
            this.#notify(this.#taskWaiters);
        }
    }

    /** upstream: the `LinkedHashMap.removeEldestEntry` override, capped at 10. */
    #putCompleted(task: RenderTask): void {
        this.#completedTasks.set(task, Date.now());
        while (this.#completedTasks.size > COMPLETED_TASK_HISTORY) {
            const eldest = this.#completedTasks.keys().next();
            if (eldest.done === true) break;
            this.#completedTasks.delete(eldest.value);
        }
    }

    // ---------------------------------------------------------------- wait/notify

    /**
     * upstream: `monitor.wait(timeoutMs)`.
     *
     * Resolves on the timeout or on the next {@link RenderManager.notify} of the same set,
     * whichever comes first. The timer is `unref`'d where the runtime supports it, matching
     * both Java monitors: a thread parked in `wait` does not stop the JVM exiting, and a
     * ref'd ten-second timer would hold the Node process open for ten seconds past a clean
     * shutdown.
     */
    #awaitSignal(waiters: Set<() => void>, timeoutMs: number): Promise<void> {
        return new Promise<void>((resolve) => {
            const finish = (): void => {
                waiters.delete(finish);
                clearTimeout(timer);
                resolve();
            };

            const timer = setTimeout(finish, timeoutMs);
            if (typeof timer === "object" && typeof timer.unref === "function") timer.unref();
            waiters.add(finish);
        });
    }

    /**
     * upstream: `monitor.notifyAll()`.
     *
     * Resolving a promise only *queues* a microtask, so every caller of this keeps running
     * to the end of its own synchronous region before any woken continuation resumes —
     * which is precisely the guarantee `notifyAll()` gives a thread that still holds the
     * monitor. That is why calling this from the middle of a critical region is safe.
     *
     * The set is drained before the callbacks run so a waiter that immediately re-waits
     * cannot be woken twice by the same notification.
     */
    #notify(waiters: Set<() => void>): void {
        if (waiters.size === 0) return;
        const pending = [...waiters];
        waiters.clear();
        for (const wake of pending) wake();
    }
}
