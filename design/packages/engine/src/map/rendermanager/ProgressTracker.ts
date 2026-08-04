/**
 * upstream: `common/.../rendermanager/ProgressTracker.java`
 *
 * A rolling estimate of *how long one whole unit of progress takes*, sampled on a timer.
 *
 * The shape is deliberately indirect and worth stating plainly, because the obvious
 * reading of the field name is wrong: `timesPerProgress` does not hold elapsed times, it
 * holds `deltaTime / deltaProgress` — the time a *complete* 0→1 run would take at the rate
 * observed over that one interval. Averaging those and multiplying by the progress still
 * outstanding is what {@link RenderManager.estimateCurrentRenderTaskTimeRemaining} does.
 * An implementation that stored raw interval durations would produce an estimate that is
 * wrong by whatever fraction of the task each tick happened to cover.
 *
 * ## Threading
 *
 * Upstream runs the sampler on a daemon `java.util.Timer` thread and marks
 * `resetAndStart`, `getAverageTimePerProgress` and `update` `synchronized`, because that
 * timer thread and the render threads genuinely run at the same time: without the lock a
 * reader could see `lastTime` from after an update and `lastProgress` from before it, and
 * compute a rate from two unrelated moments.
 *
 * Here the sampler is a `setInterval` callback on the one event loop, and all three
 * methods are **fully synchronous — no `await` anywhere inside them**. That is the whole
 * argument, and it is not the generic "JS is single-threaded" hand-wave: the hazard in a
 * single-threaded runtime is an `await` *between* two mutations of the same state, which
 * lets another continuation observe the half-updated pair. There is no such suspension
 * point in any of these bodies, so `lastTime` and `lastProgress` can only ever be read as
 * a matched pair. The progress supplier is required to be synchronous for exactly this
 * reason; an async one would reintroduce the tear the lock existed to prevent.
 *
 * The timer is `unref`'d where the runtime supports it, which is what makes it a daemon:
 * upstream's `Timer` is constructed with `isDaemon = true` so a forgotten tracker cannot
 * keep the JVM alive, and a ref'd interval would keep Node alive in exactly the same way.
 */

/**
 * upstream: `Supplier<Double>`.
 *
 * Synchronous on purpose — see the threading note above. `RenderTask.estimateProgress()`
 * is synchronous upstream too, so nothing is being narrowed here.
 */
export type ProgressSupplier = () => number;

export class ProgressTracker {
    readonly #averagingCount: number;

    /**
     * upstream: `Deque<Long> timesPerProgress` — a bounded FIFO of *extrapolated total
     * durations*, newest last. Bounded so the estimate follows the render's current speed
     * rather than averaging in a burst from ten minutes ago.
     */
    readonly #timesPerProgress: number[] = [];

    #progressSupplier: ProgressSupplier = () => 0;
    #lastTime = 0;
    #lastProgress = 0;

    #timer: ReturnType<typeof setInterval> | null = null;

    constructor(updateIntervalMs: number, averagingCount: number) {
        this.#averagingCount = averagingCount;

        // `setInterval` fires first after one full interval, as `scheduleAtFixedRate` with
        // an equal initial delay and period does. Sampling immediately would compare the
        // starting progress against itself and record nothing anyway, but the delay also
        // means a tracker constructed before `resetAndStart` never samples a stale
        // supplier.
        const timer = setInterval(() => {
            this.#update();
        }, updateIntervalMs);
        if (typeof timer === "object" && typeof timer.unref === "function") timer.unref();
        this.#timer = timer;
    }

    /**
     * upstream: `resetAndStart(Supplier<Double>)` — point the tracker at a new task.
     *
     * The history is cleared rather than carried over because the rate of the previous
     * task says nothing about this one, and a single leftover sample from a fast task
     * would make a slow one report an absurdly short time remaining.
     */
    resetAndStart(progressSupplier: ProgressSupplier): void {
        this.#progressSupplier = progressSupplier;
        this.#lastTime = Date.now();
        this.#lastProgress = progressSupplier();
        this.#timesPerProgress.length = 0;
    }

    /**
     * upstream: `getAverageTimePerProgress()`.
     *
     * Zero when nothing has been sampled yet: upstream's `Collectors.averagingLong` over
     * an empty stream is `0.0`, and callers multiply this by the progress remaining, so
     * "no data" reads as "no estimate" rather than as NaN leaking into a displayed ETA.
     */
    getAverageTimePerProgress(): number {
        if (this.#timesPerProgress.length === 0) return 0;
        let sum = 0;
        for (const time of this.#timesPerProgress) sum += time;
        // Java's `Double.longValue()` truncates toward zero rather than rounding.
        return Math.trunc(sum / this.#timesPerProgress.length);
    }

    /**
     * upstream: `update()` — one sample.
     *
     * The `deltaProgress !== 0` guard is doing two jobs, and dropping either one breaks
     * the estimate. It avoids the division by zero, obviously. Less obviously, it also
     * leaves `lastTime`/`lastProgress` *untouched* on a tick where nothing moved, so the
     * time spent stalled is charged to the next interval that does move. Advancing
     * `lastTime` on a stalled tick would silently discard that time and make a stuck
     * render look fast.
     */
    #update(): void {
        const now = Date.now();
        const progress = this.#progressSupplier();

        const deltaTime = now - this.#lastTime;
        const deltaProgress = progress - this.#lastProgress;

        if (deltaProgress !== 0) {
            // Java: `(long) (deltaTime / deltaProgress)` — double division, then a cast
            // that truncates toward zero. A task whose progress went backwards yields a
            // negative sample here; that is upstream's behaviour and is left alone.
            const totalDuration = Math.trunc(deltaTime / deltaProgress);

            this.#timesPerProgress.push(totalDuration);
            while (this.#timesPerProgress.length > this.#averagingCount) this.#timesPerProgress.shift();

            this.#lastTime = now;
            this.#lastProgress = progress;
        }
    }

    /**
     * upstream: `cancel()` — stops the sampler for good.
     *
     * Idempotent, like `Timer.cancel()`. `RenderManager.start` cancels the outgoing
     * tracker before building a new one, so a manager restarted a dozen times leaves a
     * dozen dead intervals rather than a dozen live ones.
     */
    cancel(): void {
        if (this.#timer !== null) {
            clearInterval(this.#timer);
            this.#timer = null;
        }
    }
}
