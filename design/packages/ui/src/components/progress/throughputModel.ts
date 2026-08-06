/**
 * How fast a render is actually moving, right now, in the one currency every route already
 * reports: overall percent complete.
 *
 * This exists for exactly one reason. A live speed control that changes something real but
 * shows nothing changing is indistinguishable, to the person looking at it, from one that
 * does nothing at all - the project has been bitten by that shape of defect before. Dragging
 * the dial has to produce visible evidence, and the honest evidence available here is a rate:
 * how much overall percent moved per minute, over a short recent window, so a slowdown or a
 * speedup shows up within seconds rather than being averaged away across the whole render.
 *
 * **This is not a tile count, a chunk count or a region count**, and it does not pretend to
 * be one. Upstream's own progress line for a map or a region is a percentage only - see
 * `render/progress.ts`'s header comment, quoted again in `progressModel.ts`'s own
 * `mapTaskSeen` - there is no tile, region or chunk count anywhere in it for this port to
 * have discarded. Inventing one here would be fabricating a number nobody can trace back to
 * anything the engine actually said. Percent-per-minute is real, is live, and is exactly as
 * precise as the engine's own reporting allows - no more, and said as no more.
 *
 * A tiny window on purpose - see {@link DEFAULT_WINDOW_MS} - rather than the whole render's
 * average: an average since the render started is deliberately unresponsive to a speed
 * change made ninety minutes in, which is the one moment this reading exists to be believed.
 */

export interface ThroughputSample {
    readonly atMs: number;
    /** 0 to 100. */
    readonly percent: number;
}

export interface ThroughputReading {
    /**
     * Percent of the overall render completed per minute, over the recent window - or
     * `null` when there is not yet enough to say. Never negative: a render that briefly
     * reports a lower percent than before (upstream re-scanning a map) reads as `0`, a
     * stall, rather than a nonsensical negative rate.
     */
    readonly percentPerMinute: number | null;
    /** How much real time the reading actually covers, in milliseconds. */
    readonly windowMs: number;
}

export const NO_THROUGHPUT: ThroughputReading = { percentPerMinute: null, windowMs: 0 };

/**
 * How much of the render's history counts towards the current rate.
 *
 * Two minutes: short enough that a level change dragged mid-render shows its effect within
 * the window sliding past the moment it was applied, long enough that upstream's own
 * ten-second progress cadence (`render/progress.ts`) gives several real samples inside it
 * rather than one lonely pair.
 */
export const DEFAULT_WINDOW_MS = 120_000;

/**
 * The shortest real span a rate is computed from.
 *
 * Two samples a heartbeat apart can only ever produce a wildly extrapolated number - the
 * same reasoning `progressModel.ts`'s own `ETA_MIN_SAMPLES` is built on, applied to elapsed
 * time instead of to a sample count because this tracker keeps a rolling window rather than
 * a fixed number of observations.
 */
export const MIN_SPAN_MS = 3_000;

export interface ThroughputTracker {
    /** One observation. `percent` is 0 to 100, over the whole render. */
    observe(percent: number, atMs: number): void;
    /** Points the tracker at a new run. History is dropped, never carried across. */
    reset(): void;
    /** The current reading, from whatever is still inside the window. */
    reading(): ThroughputReading;
}

export function createThroughputTracker(windowMs: number = DEFAULT_WINDOW_MS): ThroughputTracker {
    let samples: ThroughputSample[] = [];

    return {
        observe(percent: number, atMs: number): void {
            if (!Number.isFinite(percent) || !Number.isFinite(atMs)) return;
            samples.push({ percent, atMs });
            const cutoff = atMs - windowMs;
            samples = samples.filter((sample) => sample.atMs >= cutoff);
        },

        reset(): void {
            samples = [];
        },

        reading(): ThroughputReading {
            if (samples.length < 2) return NO_THROUGHPUT;
            const first = samples[0] as ThroughputSample;
            const last = samples[samples.length - 1] as ThroughputSample;
            const span = last.atMs - first.atMs;
            if (span < MIN_SPAN_MS) return { percentPerMinute: null, windowMs: span };

            const deltaPercent = last.percent - first.percent;
            // Never negative - see this file's own header for why a re-scan reads as a
            // stall rather than as a render running backwards.
            const perMinute = Math.max(0, (deltaPercent / span) * 60_000);
            return { percentPerMinute: perMinute, windowMs: span };
        },
    };
}
