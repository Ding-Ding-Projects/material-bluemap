import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressTracker } from "./ProgressTracker.js";

/*
 * Every progress increment here is a negative power of two (0.25, 0.5, 0.125...) so the
 * expected sample is exact. Tenths are not representable in binary floating point, and a
 * supplier stepping by 0.1 makes `deltaTime / deltaProgress` land on 9999.999999999998 —
 * which the truncation then reports as 9999, and the test as a bug that is not there.
 */
describe("ProgressTracker", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("reports no estimate before it has sampled anything", () => {
        const tracker = new ProgressTracker(1000, 12);
        try {
            expect(tracker.getAverageTimePerProgress()).toBe(0);
        } finally {
            tracker.cancel();
        }
    });

    it("does not sample until a full update interval has passed", () => {
        let progress = 0;
        const tracker = new ProgressTracker(1000, 12);
        try {
            tracker.resetAndStart(() => progress);
            progress = 0.5;

            vi.advanceTimersByTime(999);
            expect(tracker.getAverageTimePerProgress()).toBe(0);

            vi.advanceTimersByTime(1);
            expect(tracker.getAverageTimePerProgress()).toBe(2000);
        } finally {
            tracker.cancel();
        }
    });

    it("samples the extrapolated whole-run duration, not the interval that was measured", () => {
        let progress = 0;
        const tracker = new ProgressTracker(1000, 12);
        try {
            tracker.resetAndStart(() => progress);

            // A quarter of the way through in one second means four seconds in total.
            progress = 0.25;
            vi.advanceTimersByTime(1000);

            expect(tracker.getAverageTimePerProgress()).toBe(4000);
        } finally {
            tracker.cancel();
        }
    });

    it("averages the samples it has kept", () => {
        let progress = 0;
        const tracker = new ProgressTracker(1000, 12);
        try {
            tracker.resetAndStart(() => progress);

            progress = 0.25; // 1000 / 0.25 -> 4000
            vi.advanceTimersByTime(1000);
            progress = 0.75; // 1000 / 0.5  -> 2000
            vi.advanceTimersByTime(1000);

            expect(tracker.getAverageTimePerProgress()).toBe(3000);
        } finally {
            tracker.cancel();
        }
    });

    it("charges a stalled interval to the next one that actually moves", () => {
        let progress = 0;
        const tracker = new ProgressTracker(1000, 12);
        try {
            tracker.resetAndStart(() => progress);

            // Nothing moved: no sample, and — the part that matters — the baseline time is
            // left alone, so the second below is not quietly thrown away.
            vi.advanceTimersByTime(1000);
            expect(tracker.getAverageTimePerProgress()).toBe(0);

            progress = 0.25;
            vi.advanceTimersByTime(1000);

            // Two seconds for a quarter, not one: the stall is part of the elapsed time.
            expect(tracker.getAverageTimePerProgress()).toBe(8000);
        } finally {
            tracker.cancel();
        }
    });

    it("keeps only the most recent samples, so the estimate follows the current speed", () => {
        let progress = 0;
        const tracker = new ProgressTracker(1000, 2);
        try {
            tracker.resetAndStart(() => progress);

            progress = 0.5; // -> 2000, and this one must fall out of the window
            vi.advanceTimersByTime(1000);
            progress = 0.75; // -> 4000
            vi.advanceTimersByTime(1000);
            progress = 0.875; // -> 8000
            vi.advanceTimersByTime(1000);

            expect(tracker.getAverageTimePerProgress()).toBe(6000);
        } finally {
            tracker.cancel();
        }
    });

    it("truncates the average toward zero, as Double.longValue() does", () => {
        let progress = 0;
        const tracker = new ProgressTracker(1000, 12);
        try {
            tracker.resetAndStart(() => progress);

            progress = 0.5; // 2000
            vi.advanceTimersByTime(1000);
            progress = 0.75; // 4000
            vi.advanceTimersByTime(1000);
            progress = 0.875; // 8000
            vi.advanceTimersByTime(1000);

            // 14000 / 3 = 4666.66..., not 4667.
            expect(tracker.getAverageTimePerProgress()).toBe(4666);
        } finally {
            tracker.cancel();
        }
    });

    it("records a negative sample when a task's progress goes backwards", () => {
        // Upstream does not guard against this and neither does the port: a task that
        // revises its own estimate downwards genuinely has more work than it thought, and
        // inventing a floor here would hide that from whoever is reading the ETA.
        let progress = 0.5;
        const tracker = new ProgressTracker(1000, 12);
        try {
            tracker.resetAndStart(() => progress);

            progress = 0.25;
            vi.advanceTimersByTime(1000);

            expect(tracker.getAverageTimePerProgress()).toBe(-4000);
        } finally {
            tracker.cancel();
        }
    });

    it("clears the history and rebaselines when pointed at a new task", () => {
        let first = 0;
        const tracker = new ProgressTracker(1000, 12);
        try {
            tracker.resetAndStart(() => first);
            first = 0.5;
            vi.advanceTimersByTime(1000);
            expect(tracker.getAverageTimePerProgress()).toBe(2000);

            // A second task, already a quarter done when the tracker picks it up.
            let second = 0.25;
            tracker.resetAndStart(() => second);
            expect(tracker.getAverageTimePerProgress()).toBe(0);

            second = 0.75;
            vi.advanceTimersByTime(1000);

            // Half a unit of progress in a second. Had the reset not rebaselined,
            // three quarters would have been measured instead and this would read 1333.
            expect(tracker.getAverageTimePerProgress()).toBe(2000);
        } finally {
            tracker.cancel();
        }
    });

    it("stops sampling once cancelled", () => {
        let progress = 0;
        const tracker = new ProgressTracker(1000, 12);
        tracker.resetAndStart(() => progress);

        progress = 0.5;
        vi.advanceTimersByTime(1000);
        expect(tracker.getAverageTimePerProgress()).toBe(2000);

        tracker.cancel();

        progress = 1;
        vi.advanceTimersByTime(60_000);
        expect(tracker.getAverageTimePerProgress()).toBe(2000);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("can be cancelled twice", () => {
        const tracker = new ProgressTracker(1000, 12);
        tracker.cancel();
        expect(() => {
            tracker.cancel();
        }).not.toThrow();
    });
});
