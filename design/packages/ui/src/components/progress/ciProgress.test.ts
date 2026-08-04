/**
 * A render on GitHub's runners, in the same vocabulary as one on this machine.
 *
 * The claims worth pinning down are the ones this adapter refuses to make: no percentage
 * derived from a step number, no byte count derived from a phase name, and no job turned
 * into a finished one by anything other than GitHub saying it completed.
 */

import { describe, expect, it } from "vitest";
import { CI_PHASES, ciProgressFacts, plannedShards, shardFromJob } from "./ciProgress.js";
import { summariseShards } from "./progressModel.js";
import type { CiJobReport, CiPreflight, CiRunReport } from "../cirender/ciRenderBridge.js";

function job(partial: Partial<CiJobReport>): CiJobReport {
    return {
        id: 1,
        name: "render (0)",
        status: "completed",
        conclusion: "success",
        htmlUrl: "https://github.test/job/1",
        startedAt: "2026-08-03T09:14:00.000Z",
        completedAt: "2026-08-03T09:18:00.000Z",
        ...partial,
    };
}

function run(jobs: CiJobReport[]): CiRunReport {
    return {
        runId: 42,
        runNumber: 7,
        htmlUrl: "https://github.test/run/42",
        status: "in_progress",
        conclusion: null,
        createdAt: "2026-08-03T09:13:00.000Z",
        updatedAt: "2026-08-03T09:16:00.000Z",
        headSha: "abc123",
        jobs,
    };
}

describe("one job, as a shard", () => {
    it("reads the status before the conclusion, so nothing in flight is called finished", () => {
        // A job GitHub has not called `completed` is not finished, whatever its conclusion
        // field happens to hold. This is the one ordering that keeps a green tick off an
        // unfinished job.
        const running = shardFromJob(job({ status: "in_progress", conclusion: "success" }));

        expect(running.state).toBe("running");
    });

    it("treats a status it has never seen as not yet begun", () => {
        const odd = shardFromJob(job({ status: "unknown", conclusion: null }));

        expect(odd.state).toBe("queued");
    });

    it("names an unrecognised conclusion as unrecognised rather than rounding it", () => {
        const odd = shardFromJob(job({ status: "completed", conclusion: "something-new" }));

        expect(odd.state).toBe("unknown");
    });

    it("maps the conclusions GitHub actually publishes", () => {
        expect(shardFromJob(job({ conclusion: "success" })).state).toBe("succeeded");
        expect(shardFromJob(job({ conclusion: "failure" })).state).toBe("failed");
        expect(shardFromJob(job({ conclusion: "timed_out" })).state).toBe("failed");
        expect(shardFromJob(job({ conclusion: "cancelled" })).state).toBe("cancelled");
        expect(shardFromJob(job({ conclusion: "skipped" })).state).toBe("skipped");
    });

    it("carries the times, so a shard can say how long it has been going", () => {
        const shard = shardFromJob(job({}));

        expect(shard.startedAtMs).toBe(Date.parse("2026-08-03T09:14:00.000Z"));
        expect(shard.finishedAtMs).toBe(Date.parse("2026-08-03T09:18:00.000Z"));
        expect(shard.group).toBe("render");
    });
});

describe("the whole sync", () => {
    it("counts the phase as a step and refuses to turn it into a percentage", () => {
        const facts = ciProgressFacts({
            phase: "rendering",
            run: null,
            active: true,
            startedAt: "2026-08-03T09:13:00.000Z",
        });
        const overall = facts.levels[0];

        expect(overall?.count).toEqual({ done: 5, total: CI_PHASES.length, unit: "steps" });
        // Uploading a world can take an evening and registering a map takes a moment. A
        // denominator in steps is not a denominator in time, and a bar that pretends
        // otherwise sits at 62% for four hours.
        expect(overall?.percent).toBeNull();
    });

    it("gives the shards the one real proportion this route has", () => {
        const facts = ciProgressFacts({
            phase: "rendering",
            run: run([
                job({ id: 1, name: "render (0)", conclusion: "success" }),
                job({ id: 2, name: "render (1)", status: "in_progress", conclusion: null }),
                job({ id: 3, name: "render (2)", status: "queued", conclusion: null }),
            ]),
            active: true,
            startedAt: "2026-08-03T09:13:00.000Z",
        });
        const shards = facts.levels.find((level) => level.id === "shards");

        expect(shards?.count).toEqual({ done: 1, total: 3, unit: "jobs" });
        expect(shards?.percent).toBeCloseTo(100 / 3);
        expect(facts.shards).toHaveLength(3);
    });

    it("counts against the plan, so an unexpanded matrix is not reported as complete", () => {
        const preflight = {
            plan: { mapId: "m", mapName: "m", dimension: "d", inputs: { "max-jobs": "7" }, notCarried: [] },
        } as unknown as CiPreflight;

        expect(plannedShards(preflight)).toBe(7);
        const facts = ciProgressFacts({
            phase: "rendering",
            run: run([job({ id: 1, conclusion: "success" })]),
            active: true,
            startedAt: null,
            preflight,
        });

        expect(summariseShards(facts.shards, plannedShards(preflight))).toEqual({
            done: 1,
            total: 7,
            unit: "jobs",
        });
    });

    it("offers no estimate, because GitHub reports nothing from inside a shard", () => {
        const facts = ciProgressFacts({ phase: "rendering", run: run([]), active: true, startedAt: null });

        expect(facts.estimate.source).toBe("none");
    });

    it("shows no bytes for the upload and says in words where they are instead", () => {
        const facts = ciProgressFacts({ phase: "uploading", run: null, active: true, startedAt: null });

        // `sync.ts` deliberately does not re-emit them: the upload is a backup and already
        // has byte-by-byte progress on the backup channel. A second stream for one transfer
        // is two chances to disagree about how far it has got.
        expect(facts.transfers).toEqual([]);
        expect(facts.notes.map((note) => note.key)).toContain("progress.ci.uploadBytes");
    });

    it("says that waves are not published rather than inventing one", () => {
        const facts = ciProgressFacts({
            phase: "rendering",
            run: run([job({})]),
            active: true,
            startedAt: null,
        });

        expect(facts.notes.map((note) => note.key)).toContain("progress.ci.waves");
    });
});
