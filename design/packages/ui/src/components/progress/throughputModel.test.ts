import { describe, expect, it } from "vitest";

import { NO_THROUGHPUT, createThroughputTracker } from "./throughputModel.js";

describe("createThroughputTracker", () => {
    it("reports NO_THROUGHPUT before two samples exist", () => {
        const tracker = createThroughputTracker();
        expect(tracker.reading()).toEqual(NO_THROUGHPUT);
        tracker.observe(10, 0);
        expect(tracker.reading()).toEqual(NO_THROUGHPUT);
    });

    it("computes a real percent-per-minute rate from two samples far enough apart", () => {
        const tracker = createThroughputTracker();
        tracker.observe(0, 0);
        tracker.observe(10, 60_000); // 10% in one minute
        const reading = tracker.reading();
        expect(reading.percentPerMinute).not.toBeNull();
        expect(reading.percentPerMinute as number).toBeCloseTo(10, 5);
        expect(reading.windowMs).toBe(60_000);
    });

    it("refuses to report a rate from samples closer together than MIN_SPAN_MS", () => {
        const tracker = createThroughputTracker();
        tracker.observe(0, 0);
        tracker.observe(1, 500);
        expect(tracker.reading().percentPerMinute).toBeNull();
    });

    it("reads faster when the underlying rate genuinely sped up", () => {
        const slow = createThroughputTracker();
        slow.observe(0, 0);
        slow.observe(5, 60_000);

        const fast = createThroughputTracker();
        fast.observe(0, 0);
        fast.observe(20, 60_000);

        expect((fast.reading().percentPerMinute as number)).toBeGreaterThan(
            slow.reading().percentPerMinute as number,
        );
    });

    it("reports 0 rather than a negative number when percent moves backwards", () => {
        const tracker = createThroughputTracker();
        tracker.observe(50, 0);
        tracker.observe(40, 60_000);
        expect(tracker.reading().percentPerMinute).toBe(0);
    });

    it("drops samples that have fallen outside the window", () => {
        const tracker = createThroughputTracker(10_000);
        tracker.observe(0, 0);
        tracker.observe(50, 5_000);
        // This observation pushes the first sample (at t=0) outside a 10-second window.
        tracker.observe(60, 15_000);
        const reading = tracker.reading();
        // Only the last two samples remain in the window: 50 -> 60 over 10 seconds.
        expect(reading.windowMs).toBe(10_000);
    });

    it("reset drops every sample and returns to NO_THROUGHPUT", () => {
        const tracker = createThroughputTracker();
        tracker.observe(0, 0);
        tracker.observe(10, 60_000);
        expect(tracker.reading().percentPerMinute).not.toBeNull();
        tracker.reset();
        expect(tracker.reading()).toEqual(NO_THROUGHPUT);
    });

    it("ignores a non-finite observation rather than corrupting the window", () => {
        const tracker = createThroughputTracker();
        tracker.observe(0, 0);
        tracker.observe(Number.NaN, 30_000);
        tracker.observe(10, 60_000);
        const reading = tracker.reading();
        expect(reading.percentPerMinute).not.toBeNull();
        expect(reading.windowMs).toBe(60_000);
    });
});
