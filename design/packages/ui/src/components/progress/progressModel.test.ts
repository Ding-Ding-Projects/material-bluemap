/**
 * The maths behind the bars, tested without mounting anything.
 *
 * Three things here are worth more than the rest, because each of them is a way a progress
 * surface lies while looking fine: an estimate produced from too little data, a stall that
 * is not reported, and a job count that turns an unfinished job into a finished one.
 */

import { describe, expect, it } from "vitest";
import {
    EMPTY_FACTS,
    STALL_AFTER_MS,
    createEtaTracker,
    milestoneKeyOf,
    shardFinished,
    shardGroupOf,
    shardGroups,
    summariseShards,
    timingOf,
} from "./progressModel.js";
import type { ProgressFacts, ShardStat } from "./progressModel.js";

function shard(name: string, state: ShardStat["state"]): ShardStat {
    return {
        id: name,
        name,
        group: shardGroupOf(name),
        state,
        startedAtMs: null,
        finishedAtMs: null,
        url: null,
    };
}

/**
 * upstream: `ProgressTracker`, whose test file in `packages/engine/` is the reference these
 * cases are written against. The port there samples a supplier on a timer; this one is fed
 * observations from an event stream. The arithmetic has to be the same one, because two
 * estimators in one application is two answers to "how long is left".
 */
describe("the estimate is upstream's maths", () => {
    it("records the extrapolated duration of a whole run, not the interval that was seen", () => {
        const tracker = createEtaTracker();
        tracker.observe(0, 0);
        tracker.observe(0.1, 1_000);

        // One tenth of the work in one second means ten seconds for all of it, not one.
        expect(tracker.averageTimePerProgress()).toBe(10_000);
    });

    it("takes the first observation as an anchor and produces no sample from it", () => {
        const tracker = createEtaTracker();
        tracker.observe(0.4, 1_000);

        expect(tracker.samples()).toBe(0);
        expect(tracker.averageTimePerProgress()).toBe(0);
    });

    it("charges a stalled interval forward instead of discarding it", () => {
        const tracker = createEtaTracker();
        tracker.observe(0, 0);
        // Five seconds in which nothing moved. Advancing the anchor here would throw that
        // time away and make a stuck render look fast, which is the exact failure the
        // upstream guard exists to prevent.
        tracker.observe(0, 5_000);
        tracker.observe(0.1, 10_000);

        expect(tracker.samples()).toBe(1);
        expect(tracker.averageTimePerProgress()).toBe(100_000);
    });

    it("keeps only the newest samples, so the estimate follows the current speed", () => {
        const tracker = createEtaTracker(2);
        tracker.observe(0, 0);
        tracker.observe(0.1, 1_000); // 10000, and about to fall out of the window
        tracker.observe(0.2, 3_000); // 20000
        tracker.observe(0.3, 7_000); // 40000

        expect(tracker.samples()).toBe(2);
        expect(tracker.averageTimePerProgress()).toBe(30_000);
    });

    it("truncates toward zero, exactly as the Java cast does", () => {
        const tracker = createEtaTracker();
        tracker.observe(0, 0);
        tracker.observe(0.3, 1_000);

        // 1000 / 0.3 is 3333.33...
        expect(tracker.averageTimePerProgress()).toBe(3_333);
    });

    it("multiplies the average by the work still outstanding", () => {
        const tracker = createEtaTracker();
        tracker.observe(0, 0);
        tracker.observe(0.1, 1_000);
        tracker.observe(0.2, 2_000);
        tracker.observe(0.3, 3_000);

        expect(tracker.remainingMs(0.3)).toBe(7_000);
    });

    it("says nothing at all while the window is thin", () => {
        const tracker = createEtaTracker();
        tracker.observe(0, 0);
        tracker.observe(0.1, 1_000);
        tracker.observe(0.2, 2_000);

        // Two samples can extrapolate to a figure that is confident and hours wrong, and a
        // wild number on a screen is believed exactly once.
        expect(tracker.samples()).toBe(2);
        expect(tracker.remainingMs(0.2)).toBeNull();
    });

    it("says nothing rather than a negative number when progress went backwards", () => {
        const tracker = createEtaTracker();
        tracker.observe(0.9, 0);
        tracker.observe(0.6, 1_000);
        tracker.observe(0.3, 2_000);
        tracker.observe(0.1, 3_000);

        expect(tracker.averageTimePerProgress()).toBeLessThan(0);
        expect(tracker.remainingMs(0.1)).toBeNull();
    });

    it("drops its history when pointed at a new run", () => {
        const tracker = createEtaTracker();
        tracker.observe(0, 0);
        tracker.observe(0.5, 1_000);
        tracker.reset();

        expect(tracker.samples()).toBe(0);
        expect(tracker.averageTimePerProgress()).toBe(0);
    });
});

describe("is it still moving", () => {
    const T0 = 1_000_000;
    const running: ProgressFacts = {
        ...EMPTY_FACTS,
        active: true,
        startedAtMs: T0,
        lastEventAtMs: T0 + 10_000,
        lastProgressAtMs: T0 + 5_000,
    };

    it("counts elapsed from the start and quiet from the last event of any kind", () => {
        const timing = timingOf(running, T0 + 70_000);

        expect(timing.elapsedMs).toBe(70_000);
        expect(timing.sinceEventMs).toBe(60_000);
        // Different question, different answer: a bar can be still while log lines arrive.
        expect(timing.sinceProgressMs).toBe(65_000);
    });

    it("calls it quiet only once the threshold has actually passed", () => {
        expect(timingOf(running, T0 + 10_000 + STALL_AFTER_MS - 1).stalled).toBe(false);
        expect(timingOf(running, T0 + 10_000 + STALL_AFTER_MS).stalled).toBe(true);
    });

    it("never raises the alarm beside a render that has ended", () => {
        // A finished render is silent for the best possible reason, and a warning there is
        // a warning nobody reads the next time it means something.
        const finished = { ...running, active: false };

        expect(timingOf(finished, T0 + 3_600_000).stalled).toBe(false);
    });

    it("reports nothing rather than zero before anything has happened", () => {
        const timing = timingOf(EMPTY_FACTS, T0);

        expect(timing.elapsedMs).toBeNull();
        expect(timing.sinceEventMs).toBeNull();
        expect(timing.stalled).toBe(false);
    });
});

describe("shards", () => {
    it("counts a job as finished only once it has actually reached an outcome", () => {
        expect(shardFinished(shard("a", "queued"))).toBe(false);
        expect(shardFinished(shard("a", "running"))).toBe(false);
        expect(shardFinished(shard("a", "succeeded"))).toBe(true);
        expect(shardFinished(shard("a", "failed"))).toBe(true);
        // Completed with a conclusion this application has never seen. It is over; what it
        // concluded is unknown, and unknown is shown rather than rounded to a green tick.
        expect(shardFinished(shard("a", "unknown"))).toBe(true);
    });

    it("counts against the shards the plan asked for, not the ones listed so far", () => {
        // A matrix that GitHub has not expanded yet lists two jobs out of seven. Taking the
        // length of the list as the total would report "2 of 2 finished" beside a render
        // with five shards still to be created.
        const count = summariseShards([shard("render (0)", "succeeded"), shard("render (1)", "running")], 7);

        expect(count).toEqual({ done: 1, total: 7, unit: "jobs" });
    });

    it("never reports a total smaller than the jobs it can see", () => {
        const count = summariseShards([shard("a", "succeeded"), shard("b", "succeeded")], 1);

        expect(count.total).toBe(2);
    });

    it("reads the stem a matrix job shares with its siblings, from GitHub's own naming", () => {
        expect(shardGroupOf("render (3)")).toBe("render");
        expect(shardGroupOf("render (shard 3, ubuntu-latest)")).toBe("render");
        expect(shardGroupOf("collect")).toBeNull();
    });

    it("gathers shards under their stems, groups in the order they first appeared", () => {
        const groups = shardGroups([
            shard("render (0)", "succeeded"),
            shard("collect", "queued"),
            shard("render (1)", "running"),
        ]);

        expect(groups.map((group) => group.name)).toEqual(["render", null]);
        expect(groups[0]?.count).toEqual({ done: 1, total: 2, unit: "jobs" });
    });
});

describe("what gets announced", () => {
    const base: ProgressFacts = {
        ...EMPTY_FACTS,
        active: true,
        levels: [
            {
                id: "overall",
                label: { key: "progress.level.overall", fallback: "Overall", values: {} },
                detail: null,
                percent: 41.2,
                count: { done: 1, total: 3, unit: "maps" },
            },
        ],
    };
    const timing = timingOf(base, 0);

    it("says nothing new when only the percentage moved", () => {
        const crept = {
            ...base,
            levels: [{ ...base.levels[0]!, percent: 41.7 }],
        };

        // An announcement per progress event is a screen reader reading a number every ten
        // seconds for four hours, after which the region is muted and says nothing ever.
        expect(milestoneKeyOf(crept, timing)).toBe(milestoneKeyOf(base, timing));
    });

    it("says something new when a map finished, when it went quiet, and when it ended", () => {
        const advanced = {
            ...base,
            levels: [{ ...base.levels[0]!, count: { done: 2, total: 3, unit: "maps" as const } }],
        };

        expect(milestoneKeyOf(advanced, timing)).not.toBe(milestoneKeyOf(base, timing));
        expect(milestoneKeyOf(base, { ...timing, stalled: true })).not.toBe(milestoneKeyOf(base, timing));
        expect(milestoneKeyOf({ ...base, active: false }, timing)).not.toBe(milestoneKeyOf(base, timing));
    });
});
