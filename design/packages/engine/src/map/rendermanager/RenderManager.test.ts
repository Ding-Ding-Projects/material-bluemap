import { describe, expect, it } from "vitest";
import { RenderManager, type RenderManagerOptions } from "./RenderManager.js";
import { RenderTask } from "./RenderTask.js";

function delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * A task whose whole job is to be measurable.
 *
 * `#remaining` is decremented **before** the first `await`, which is what makes the call
 * counts here exact rather than approximate: the manager reads `hasMoreWork()` inside a
 * synchronous region, so the decrement lands before any other worker gets a turn and the
 * pool cannot overshoot the requested number of slices. A fake that decremented after its
 * await would overshoot by up to one slice per worker and every count below would have to
 * become an inequality — which is exactly the sort of slack that hides a real off-by-one.
 */
class FakeTask implements RenderTask {
    readonly description: string;
    readonly containedTasks = new Set<RenderTask>();

    workCalls = 0;
    cancelCalls = 0;
    inFlight = 0;
    maxInFlight = 0;

    readonly #total: number;
    readonly #delayMs: number;
    readonly #log: string[] | null;
    #remaining: number;
    #cancelled = false;

    constructor(description: string, workUnits = 1, delayMs = 0, log: string[] | null = null) {
        this.description = description;
        this.#total = workUnits;
        this.#remaining = workUnits;
        this.#delayMs = delayMs;
        this.#log = log;
    }

    async doWork(): Promise<void> {
        this.workCalls++;
        this.#remaining--;
        this.inFlight++;
        this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
        this.#log?.push(this.description);

        try {
            if (this.#delayMs > 0) await delay(this.#delayMs);
            else await Promise.resolve();
        } finally {
            this.inFlight--;
        }
    }

    hasMoreWork(): boolean {
        return !this.#cancelled && this.#remaining > 0;
    }

    estimateProgress(): number {
        if (this.#total === 0) return 1;
        return Math.min(1, Math.max(0, (this.#total - this.#remaining) / this.#total));
    }

    cancel(): void {
        this.cancelCalls++;
        this.#cancelled = true;
    }

    contains(task: RenderTask): boolean {
        return RenderTask.equals(this, task) || this.containedTasks.has(task);
    }

    getDescription(): string {
        return this.description;
    }

    getDetail(): string | null {
        return null;
    }
}

/** Throws from its first `failures` slices, then behaves. */
class FlakyTask implements RenderTask {
    workCalls = 0;
    failures = 0;

    readonly #total: number;
    #remaining: number;
    #failuresLeft: number;

    constructor(
        readonly description: string,
        workUnits: number,
        failures: number,
    ) {
        this.#total = workUnits;
        this.#remaining = workUnits;
        this.#failuresLeft = failures;
    }

    async doWork(): Promise<void> {
        this.workCalls++;
        await Promise.resolve();
        if (this.#failuresLeft > 0) {
            this.#failuresLeft--;
            this.failures++;
            // A failed slice consumes no work, so a manager that treated the rejection as
            // completion would be caught by the call counts below.
            throw new Error("boom");
        }
        this.#remaining--;
    }

    hasMoreWork(): boolean {
        return this.#remaining > 0;
    }

    estimateProgress(): number {
        return (this.#total - this.#remaining) / this.#total;
    }

    cancel(): void {
        this.#remaining = 0;
    }

    contains(task: RenderTask): boolean {
        return RenderTask.equals(this, task);
    }

    getDescription(): string {
        return this.description;
    }

    getDetail(): string | null {
        return null;
    }
}

/** A task addressed by value rather than by identity, like `WorldRegionUpdateTask`. */
class KeyedTask extends FakeTask {
    constructor(readonly key: string) {
        super("keyed " + key, 1);
    }

    equals(other: unknown): boolean {
        return other instanceof KeyedTask && other.key === this.key;
    }
}

/**
 * Upstream's intervals are 5 and 10 seconds. Every one of them is shortened here, and the
 * progress sampler pushed far out of the way, so a suite proving pool behaviour does not
 * spend a minute proving how patient it is.
 */
function newManager(overrides: RenderManagerOptions = {}): RenderManager {
    return new RenderManager({
        idleWaitMs: 5,
        errorBackoffMs: 5,
        awaitIdleWaitMs: 5,
        awaitShutdownWaitMs: 5,
        progressUpdateIntervalMs: 1_000_000,
        progressAveragingCount: 12,
        onError: () => {},
        onInfo: () => {},
        ...overrides,
    });
}

async function shutDown(manager: RenderManager): Promise<void> {
    manager.stop();
    await manager.awaitShutdown();
}

describe("RenderManager: the pool", () => {
    it("refuses to start with no workers", () => {
        const manager = newManager();
        expect(() => {
            manager.start(0);
        }).toThrow("threadCount has to be 1 or more!");
        expect(manager.isRunning()).toBe(false);
    });

    it("refuses to start twice", async () => {
        const manager = newManager();
        manager.start(2);
        try {
            expect(() => {
                manager.start(2);
            }).toThrow("RenderManager is already running!");
            expect(manager.getWorkerThreadCount()).toBe(2);
        } finally {
            await shutDown(manager);
        }
    });

    it("does not begin consuming the queue inside start()", async () => {
        const manager = newManager();
        const task = new FakeTask("immediate", 4);
        manager.scheduleRenderTask(task);

        manager.start(2);
        // `Thread.start()` returns before the thread runs; so does this.
        expect(task.workCalls).toBe(0);

        await manager.awaitIdle();
        await shutDown(manager);
        expect(task.workCalls).toBe(4);
    });

    it("never runs more concurrent slices than it has workers", async () => {
        const manager = newManager();
        const task = new FakeTask("bounded", 200, 2);
        manager.scheduleRenderTask(task);

        manager.start(4);
        await manager.awaitIdle();
        await shutDown(manager);

        expect(task.maxInFlight).toBe(4);
        expect(task.workCalls).toBe(200);
    });

    it("runs strictly one slice at a time with a single worker", async () => {
        const manager = newManager();
        const task = new FakeTask("serial", 40, 1);
        manager.scheduleRenderTask(task);

        manager.start(1);
        await manager.awaitIdle();
        await shutDown(manager);

        expect(task.maxInFlight).toBe(1);
        expect(task.workCalls).toBe(40);
    });

    it("works the queue strictly in order, one task at a time", async () => {
        const manager = newManager();
        const log: string[] = [];
        const a = new FakeTask("a", 5, 1, log);
        const b = new FakeTask("b", 5, 1, log);
        const c = new FakeTask("c", 5, 1, log);

        expect(manager.scheduleRenderTasks(a, b, c)).toBe(3);

        manager.start(3);
        await manager.awaitIdle();
        await shutDown(manager);

        // Not merely "a finished before b": no slice of b may run while a is unfinished,
        // because every worker is on the head of the queue and the head retires only once
        // no worker is still inside it.
        expect(log).toEqual([
            "a", "a", "a", "a", "a",
            "b", "b", "b", "b", "b",
            "c", "c", "c", "c", "c",
        ]);
        expect([...manager.getCompletedTasks().keys()]).toEqual([a, b, c]);
    });

    it("records when each task completed, keeping only the last ten", async () => {
        const manager = newManager();
        const tasks = Array.from({ length: 13 }, (_, i) => new FakeTask("task-" + i, 1));
        expect(manager.scheduleRenderTasks(...tasks)).toBe(13);

        const before = Date.now();
        manager.start(1);
        await manager.awaitIdle();
        await shutDown(manager);
        const after = Date.now();

        const completed = manager.getCompletedTasks();
        expect(completed.size).toBe(10);
        expect([...completed.keys()]).toEqual(tasks.slice(3));
        for (const finishedAt of completed.values()) {
            expect(finishedAt).toBeGreaterThanOrEqual(before);
            expect(finishedAt).toBeLessThanOrEqual(after);
        }

        // A copy: evicting from it must not touch the manager's own history.
        completed.clear();
        expect(manager.getCompletedTasks().size).toBe(10);
    });

    it("reports when it was last busy", async () => {
        const manager = newManager();
        expect(manager.getLastTimeBusy()).toBe(-1);

        const before = Date.now();
        manager.scheduleRenderTask(new FakeTask("busy", 4, 1));
        manager.start(2);
        await manager.awaitIdle();
        await shutDown(manager);

        expect(manager.getLastTimeBusy()).toBeGreaterThanOrEqual(before);
        expect(manager.getLastTimeBusy()).toBeLessThanOrEqual(Date.now());
    });

    it("deregisters every worker on shutdown, and can be started again", async () => {
        const manager = newManager();
        manager.start(3);
        expect(manager.isRunning()).toBe(true);
        expect(manager.getWorkerThreadCount()).toBe(3);

        await shutDown(manager);
        expect(manager.isRunning()).toBe(false);
        expect(manager.getWorkerThreadCount()).toBe(0);

        const task = new FakeTask("second run", 3);
        manager.scheduleRenderTask(task);
        manager.start(1);
        await manager.awaitIdle();
        await shutDown(manager);
        expect(task.workCalls).toBe(3);
    });
});

describe("RenderManager: cancellation", () => {
    it("stops handing a cancelled task any more work, not just reporting it", async () => {
        const manager = newManager();
        const task = new FakeTask("long", 1000, 1);
        manager.scheduleRenderTask(task);
        manager.start(2);

        await delay(30);

        // Sampled and cancelled in one synchronous turn, so nothing can slip between them.
        const callsAtCancellation = task.workCalls;
        expect(manager.removeRenderTask(task)).toBe(true);
        expect(task.cancelCalls).toBe(1);

        expect(callsAtCancellation).toBeGreaterThan(0);
        expect(callsAtCancellation).toBeLessThan(1000);

        await manager.awaitIdle();
        await shutDown(manager);

        // The slices already in flight had incremented this before they suspended, so an
        // honest cancellation leaves the count exactly where it was. One extra call means
        // the pool kept feeding a task it had been told to stop.
        expect(task.workCalls).toBe(callsAtCancellation);
    });

    it("cancels the running task rather than yanking it out from under the workers", () => {
        const manager = newManager();
        const running = new FakeTask("running", 10);
        const queued = new FakeTask("queued", 10);
        manager.scheduleRenderTasks(running, queued);

        expect(manager.removeRenderTask(running)).toBe(true);
        expect(running.cancelCalls).toBe(1);
        expect(manager.getScheduledRenderTasks()).toEqual([running, queued]);

        // A queued task is simply dropped, uncancelled — it never started.
        expect(manager.removeRenderTask(queued)).toBe(true);
        expect(queued.cancelCalls).toBe(0);
        expect(manager.getScheduledRenderTasks()).toEqual([running]);
    });

    it("removes a task addressed by value, not only by identity", () => {
        const manager = newManager();
        const head = new FakeTask("head", 1);
        const queued = new KeyedTask("r1,2");
        manager.scheduleRenderTasks(head, queued);

        expect(manager.removeRenderTask(new KeyedTask("r9,9"))).toBe(false);
        expect(manager.removeRenderTask(new KeyedTask("r1,2"))).toBe(true);
        expect(manager.getScheduledRenderTasks()).toEqual([head]);
    });

    it("removeAllRenderTasks cancels the head and discards everything behind it", async () => {
        const manager = newManager();
        const head = new FakeTask("head", 1000, 1);
        const behind = new FakeTask("behind", 5, 1);
        manager.scheduleRenderTasks(head, behind);
        manager.start(1);

        await delay(20);
        manager.removeAllRenderTasks();
        expect(head.cancelCalls).toBe(1);
        expect(behind.cancelCalls).toBe(0);
        expect(manager.getScheduledRenderTasks()).toEqual([head]);

        await manager.awaitIdle();
        await shutDown(manager);

        expect(head.workCalls).toBeLessThan(1000);
        expect(behind.workCalls).toBe(0);
    });

    it("removeRenderTasksIf cancels a matching head and drops matching tasks behind it", () => {
        const manager = newManager();
        const head = new FakeTask("drop me", 1);
        const keep = new FakeTask("keep", 1);
        const drop = new FakeTask("drop me too", 1);
        manager.scheduleRenderTasks(head, keep, drop);

        manager.removeRenderTasksIf((task) => task.getDescription().startsWith("drop"));

        expect(head.cancelCalls).toBe(1);
        expect(drop.cancelCalls).toBe(0);
        expect(manager.getScheduledRenderTasks()).toEqual([head, keep]);
    });

    it("stop() ends the pool and no further slice is issued", async () => {
        const manager = newManager();
        const task = new FakeTask("endless", 10_000, 1);
        manager.scheduleRenderTask(task);
        manager.start(2);

        await delay(30);
        await shutDown(manager);

        expect(manager.isRunning()).toBe(false);
        const callsAtShutdown = task.workCalls;
        expect(callsAtShutdown).toBeGreaterThan(0);
        expect(callsAtShutdown).toBeLessThan(10_000);

        await delay(30);
        // Still queued, still has work, and still nobody working on it.
        expect(task.workCalls).toBe(callsAtShutdown);
        expect(manager.getScheduledRenderTaskCount()).toBe(1);
    });

    it("stop() wakes workers that are parked waiting for work", async () => {
        // The point of the wake: nothing is queued, so every worker is sitting in an idle
        // wait. Without it, shutdown would take a full idle interval per worker rather
        // than resolving now.
        const manager = newManager({ idleWaitMs: 60_000 });
        manager.start(3);
        await delay(20);
        expect(manager.isRunning()).toBe(true);

        const before = Date.now();
        await shutDown(manager);

        expect(manager.isRunning()).toBe(false);
        expect(Date.now() - before).toBeLessThan(5_000);
    });
});

describe("RenderManager: failures", () => {
    it("keeps the pool alive when a task throws, and finishes the queue", async () => {
        const errors: unknown[] = [];
        const manager = newManager({
            onError: (_message, error) => {
                errors.push(error);
            },
        });

        const flaky = new FlakyTask("flaky", 3, 2);
        const later = new FakeTask("later", 3);
        manager.scheduleRenderTasks(flaky, later);

        manager.start(1);
        await manager.awaitIdle();

        expect(manager.isRunning()).toBe(true);
        await shutDown(manager);

        expect(errors).toHaveLength(2);
        expect(flaky.failures).toBe(2);
        // Two thrown slices consumed no work, so the three real ones still had to happen.
        expect(flaky.workCalls).toBe(5);
        expect(flaky.hasMoreWork()).toBe(false);
        expect(later.workCalls).toBe(3);
        expect([...manager.getCompletedTasks().keys()]).toEqual([flaky, later]);
    });

    it("names the worker in the message it logs", async () => {
        const messages: string[] = [];
        const manager = newManager({
            onError: (message) => {
                messages.push(message);
            },
        });

        manager.scheduleRenderTask(new FlakyTask("flaky", 1, 1));
        manager.start(1);
        await manager.awaitIdle();
        await shutDown(manager);

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatch(
            /^RenderManager\(\d+\): WorkerThread\(\d+\): Exception while doing some work!$/,
        );
    });

    it("does not lose the busy count when a slice throws", async () => {
        // The decrement lives in a `finally`; if it did not, `busyCount` would climb by
        // one per failure and the head could never retire — the queue would hang forever
        // rather than fail visibly, which is the worst way for this to break.
        const manager = newManager();
        const flaky = new FlakyTask("flaky", 2, 4);
        const after = new FakeTask("after", 1);
        manager.scheduleRenderTasks(flaky, after);

        manager.start(3);
        await manager.awaitIdle();
        await shutDown(manager);

        expect(manager.getScheduledRenderTaskCount()).toBe(0);
        expect(after.workCalls).toBe(1);
    });
});

describe("RenderManager: scheduling", () => {
    it("refuses a task that something already queued contains", () => {
        const manager = newManager();
        const head = new FakeTask("head", 1);
        const container = new FakeTask("container", 1);
        const member = new FakeTask("member", 1);
        container.containedTasks.add(member);

        manager.scheduleRenderTasks(head, container);
        expect(manager.scheduleRenderTask(member)).toBe(false);
        expect(manager.getScheduledRenderTasks()).toEqual([head, container]);
    });

    it("does not consult the running task when deciding whether a task is already queued", () => {
        // The head is being worked on right now, so "already scheduled" would be a lie
        // about it: re-scheduling wants another pass after this one, not a refusal.
        const manager = newManager();
        const head = new FakeTask("head", 1);
        const member = new FakeTask("member", 1);
        head.containedTasks.add(member);

        manager.scheduleRenderTask(head);
        expect(manager.containsRenderTask(member)).toBe(false);
        expect(manager.scheduleRenderTask(member)).toBe(true);
        expect(manager.getScheduledRenderTasks()).toEqual([head, member]);
    });

    it("drops queued tasks that a newly scheduled task contains", () => {
        const manager = newManager();
        const head = new FakeTask("head", 1);
        const covered = new FakeTask("covered", 1);
        const untouched = new FakeTask("untouched", 1);
        manager.scheduleRenderTasks(head, covered, untouched);

        const container = new FakeTask("container", 1);
        container.containedTasks.add(covered);

        expect(manager.scheduleRenderTask(container)).toBe(true);
        expect(manager.getScheduledRenderTasks()).toEqual([head, untouched, container]);
        expect(covered.cancelCalls).toBe(0);
    });

    it("cancels — but keeps — a running task that a newly scheduled task contains", () => {
        const manager = newManager();
        const head = new FakeTask("head", 1);
        const other = new FakeTask("other", 1);
        manager.scheduleRenderTasks(head, other);

        const container = new FakeTask("container", 1);
        container.containedTasks.add(head);

        expect(manager.scheduleRenderTask(container)).toBe(true);
        expect(head.cancelCalls).toBe(1);
        expect(manager.getScheduledRenderTasks()[0]).toBe(head);
    });

    it("leaves a lone running task alone when a containing task is scheduled", () => {
        // Upstream's `size < 2` early return: with only the running task queued, it is not
        // examined at all, so it runs to completion even though the new task covers it.
        const manager = newManager();
        const head = new FakeTask("head", 1);
        manager.scheduleRenderTask(head);

        const container = new FakeTask("container", 1);
        container.containedTasks.add(head);

        expect(manager.scheduleRenderTask(container)).toBe(true);
        expect(head.cancelCalls).toBe(0);
        expect(manager.getScheduledRenderTasks()).toEqual([head, container]);
    });

    it("puts a next-scheduled task behind the running one, never in front of it", () => {
        const manager = newManager();
        const head = new FakeTask("head", 1);
        const tail = new FakeTask("tail", 1);
        const jumper = new FakeTask("jumper", 1);
        manager.scheduleRenderTasks(head, tail);

        expect(manager.scheduleRenderTaskNext(jumper)).toBe(true);
        expect(manager.getScheduledRenderTasks()).toEqual([head, jumper, tail]);
    });

    it("appends a next-scheduled task when there is nothing to jump", () => {
        const manager = newManager();
        const head = new FakeTask("head", 1);
        const jumper = new FakeTask("jumper", 1);

        expect(manager.scheduleRenderTaskNext(head)).toBe(true);
        expect(manager.scheduleRenderTaskNext(jumper)).toBe(true);
        expect(manager.getScheduledRenderTasks()).toEqual([head, jumper]);
    });

    it("keeps the given order when several tasks jump the queue at once", () => {
        const manager = newManager();
        const head = new FakeTask("head", 1);
        const tail = new FakeTask("tail", 1);
        manager.scheduleRenderTasks(head, tail);

        const first = new FakeTask("first", 1);
        const second = new FakeTask("second", 1);
        const third = new FakeTask("third", 1);

        expect(manager.scheduleRenderTasksNext(first, second, third)).toBe(3);
        expect(manager.getScheduledRenderTasks()).toEqual([head, first, second, third, tail]);
    });

    it("appends when several tasks jump a queue with nothing to jump", () => {
        const manager = newManager();
        const first = new FakeTask("first", 1);
        const second = new FakeTask("second", 1);

        expect(manager.scheduleRenderTasksNext(first, second)).toBe(2);
        expect(manager.getScheduledRenderTasks()).toEqual([first, second]);
    });

    it("sorts the queue behind the running task, stably", () => {
        const manager = newManager();
        const head = new FakeTask("head", 1);
        const c = new FakeTask("c", 1);
        const a1 = new FakeTask("a", 1);
        const b = new FakeTask("b", 1);
        const a2 = new FakeTask("a", 1);
        manager.scheduleRenderTasks(head, c, a1, b, a2);

        manager.reorderRenderTasks((x, y) => x.getDescription().localeCompare(y.getDescription()));

        // `head` keeps position 0 even though "head" sorts after "b"; the two equal "a"s
        // keep the order they were scheduled in.
        expect(manager.getScheduledRenderTasks()).toEqual([head, a1, a2, b, c]);
    });

    it("does not reorder a queue too short to have anything to reorder", () => {
        const manager = newManager();
        const head = new FakeTask("z", 1);
        const next = new FakeTask("a", 1);
        manager.scheduleRenderTasks(head, next);

        manager.reorderRenderTasks((x, y) => x.getDescription().localeCompare(y.getDescription()));
        expect(manager.getScheduledRenderTasks()).toEqual([head, next]);
    });

    it("reports the queue without handing out the queue itself", () => {
        const manager = newManager();
        const head = new FakeTask("head", 1);
        manager.scheduleRenderTask(head);

        const snapshot = manager.getScheduledRenderTasks();
        snapshot.length = 0;

        expect(manager.getScheduledRenderTaskCount()).toBe(1);
        expect(manager.getCurrentRenderTask()).toBe(head);
    });

    it("has no current task when nothing is queued", () => {
        const manager = newManager();
        expect(manager.getCurrentRenderTask()).toBeNull();
        expect(manager.getScheduledRenderTaskCount()).toBe(0);
        expect(manager.removeRenderTask(new FakeTask("absent", 1))).toBe(false);
    });
});

describe("RenderManager: progress", () => {
    it("estimates nothing before it has been started or given a task", () => {
        const manager = newManager();
        expect(manager.estimateCurrentRenderTaskTimeRemaining()).toBe(0);
    });

    it("estimates nothing while the queue is empty, even once running", async () => {
        const manager = newManager();
        manager.start(1);
        try {
            await delay(10);
            expect(manager.estimateCurrentRenderTaskTimeRemaining()).toBe(0);
        } finally {
            await shutDown(manager);
        }
    });

    it("estimates the time left on the running task once it has sampled it", async () => {
        const manager = newManager({ progressUpdateIntervalMs: 5 });
        const task = new FakeTask("slow", 60, 2);
        manager.scheduleRenderTask(task);
        manager.start(1);

        await delay(60);

        const current = manager.getCurrentRenderTask();
        const remaining = manager.estimateCurrentRenderTaskTimeRemaining();
        const progress = task.estimateProgress();

        manager.removeAllRenderTasks();
        await manager.awaitIdle();
        await shutDown(manager);

        expect(current).toBe(task);
        expect(progress).toBeGreaterThan(0);
        expect(progress).toBeLessThan(1);
        expect(Number.isFinite(remaining)).toBe(true);
        expect(Number.isInteger(remaining)).toBe(true);
        expect(remaining).toBeGreaterThan(0);
    });

    it("finishes the head before the next task becomes the one being estimated", async () => {
        // The progress tracker follows the head, so the head advancing is what re-points
        // it (`newTask`); if that flag were never set back to true the tracker would report
        // the first task's rate for the whole render. Polling for the advance rather than
        // waiting a fixed budget: the platform's timer granularity is 15ms on some hosts
        // and 1ms on others, and this behaviour depends on neither.
        const manager = newManager({ progressUpdateIntervalMs: 5 });
        const first = new FakeTask("first", 3);
        const second = new FakeTask("second", 10_000, 1);
        manager.scheduleRenderTasks(first, second);
        manager.start(1);

        while (manager.getCurrentRenderTask() !== second) await delay(2);
        const remaining = manager.estimateCurrentRenderTaskTimeRemaining();

        manager.removeAllRenderTasks();
        await manager.awaitIdle();
        await shutDown(manager);

        expect(first.workCalls).toBe(3);
        expect(first.hasMoreWork()).toBe(false);
        expect([...manager.getCompletedTasks().keys()]).toEqual([first, second]);
        // The tracker's history was cleared with the head change, so nothing of the first
        // task's rate can leak into the second task's estimate.
        expect(Number.isInteger(remaining)).toBe(true);
        expect(remaining).toBeGreaterThanOrEqual(0);
    });

    it("reports the running task while awaiting idle, when asked to", async () => {
        const lines: string[] = [];
        const manager = newManager({
            onInfo: (message) => {
                lines.push(message);
            },
        });

        manager.scheduleRenderTask(new FakeTask("updating region 1,2", 6, 2));
        manager.start(1);
        await manager.awaitIdle(true);
        await shutDown(manager);

        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
            expect(line).toMatch(
                /^Waiting for task 'updating region 1,2' to stop\.\. \(\d+(\.\d+)?%\)$/,
            );
        }
    });

    it("says nothing while awaiting idle unless asked", async () => {
        const lines: string[] = [];
        const manager = newManager({
            onInfo: (message) => {
                lines.push(message);
            },
        });

        manager.scheduleRenderTask(new FakeTask("quiet", 4, 1));
        manager.start(1);
        await manager.awaitIdle();
        await shutDown(manager);

        expect(lines).toEqual([]);
    });

    it("awaitIdle resolves immediately when there is nothing queued", async () => {
        const manager = newManager({ awaitIdleWaitMs: 60_000 });
        const before = Date.now();
        await manager.awaitIdle();
        expect(Date.now() - before).toBeLessThan(5_000);
    });
});
