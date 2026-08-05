/**
 * A render on GitHub's runners, described in the shared progress vocabulary.
 *
 * The CI route is the one with genuinely different shapes to report — a world going up, a
 * matrix of shard jobs, a map coming back — and it is also the one most tempting to give
 * its own panel. It does not get one. This turns what `main/cirender/sync.ts` already emits
 * into a {@link ProgressFacts}, so `RenderProgressDetail.vue` draws a CI render with the
 * same bars, the same elapsed clock, the same stall detection and the same accessibility as
 * a render on this machine.
 *
 * It reads the CI bridge's types and touches nothing there: everything here is a pure
 * function of a run report the surface already holds.
 *
 * ## What it refuses to claim
 *
 * - **The phase is a step, not a proportion.** The eight phases are real and ordered, so
 *   "step 5 of 8" is a true count. Their durations are wildly unequal — uploading a world
 *   can take an evening and registering a map takes a moment — so no percentage is derived
 *   from the step number and the bar stays indeterminate. A denominator in steps is not a
 *   denominator in time, and a bar that pretends otherwise sits at 62% for four hours.
 * - **The upload's bytes are not here.** `sync.ts` deliberately does not re-emit them: the
 *   upload is a backup, it already has byte-by-byte progress on the backup channel, and a
 *   second stream for one transfer is two chances to disagree about how far it has got. So
 *   this reports no {@link TransferStat} and says so in a note, rather than converting a
 *   phase name into a fake byte count.
 * - **A shard groups by its wave when the run actually named one.** `render-shard-wave.yml`
 *   names every job it starts `Wave <n> shard <m>`, and `CiJobReport.wave` is that number,
 *   already read from it by the main process - see that field's own comment for why a job
 *   naming no wave carries `null` rather than a guessed `0`. When at least one job in the
 *   run carries a real wave, shards group by it. Only a run with no wave anywhere - an
 *   older workflow, or one dispatched by hand outside it - falls back to the stem GitHub's
 *   own default matrix naming gives a job, `render (3)` and `render (4)` under `render`,
 *   and only then does a note say the wave is not known.
 */

import type { CiJobReport, CiPreflight, CiRunReport, CiSyncPhase } from "../cirender/ciRenderBridge.js";
import { NO_ESTIMATE, shardGroupOf, summariseShards } from "./progressModel.js";
import type { ProgressFacts, ProgressLevel, ProgressText, ShardStat } from "./progressModel.js";

/** The phases `CiRenderSync` moves through, in the order it moves through them. */
export const CI_PHASES: readonly CiSyncPhase[] = [
    "checking",
    "uploading",
    "dispatching",
    "waiting",
    "rendering",
    "downloading",
    "registering",
    "finished",
];

/**
 * What each phase is called, under the keys `components/cirender/ciRenders.ts` already uses.
 *
 * Deliberately the same keys rather than a parallel set: two tables would let the CI screen
 * and the progress detail describe the same phase differently once somebody translated one
 * of them.
 */
export function ciPhaseText(phase: CiSyncPhase | null): ProgressText {
    switch (phase) {
        case "checking":
            return { key: "cirender.phase.checking", fallback: "Checking the world and the repository", values: {} };
        case "uploading":
            return { key: "cirender.phase.uploading", fallback: "Uploading the world to GitHub", values: {} };
        case "dispatching":
            return { key: "cirender.phase.dispatching", fallback: "Starting the workflow", values: {} };
        case "waiting":
            return { key: "cirender.phase.waiting", fallback: "Waiting for GitHub to create the run", values: {} };
        case "rendering":
            return { key: "cirender.phase.rendering", fallback: "GitHub is rendering", values: {} };
        case "downloading":
            return { key: "cirender.phase.downloading", fallback: "Fetching the rendered map", values: {} };
        case "registering":
            return { key: "cirender.phase.registering", fallback: "Adding it to the map list", values: {} };
        case "finished":
            return { key: "cirender.phase.finished", fallback: "Finished", values: {} };
        default:
            return { key: "cirender.phase.starting", fallback: "Starting", values: {} };
    }
}

/**
 * One GitHub job, as a shard.
 *
 * The status is read before the conclusion, and that ordering is the whole safety property:
 * a job GitHub has not called `completed` is reported as queued or running whatever its
 * conclusion field happens to hold, so nothing here can turn an in-flight job into a
 * finished one. Only a completed job is decided by its conclusion, and a conclusion this
 * application has never seen is reported as unrecognised rather than rounded to the nearest
 * state that happens to be green.
 */
export function shardFromJob(job: CiJobReport): ShardStat {
    return {
        id: String(job.id),
        name: job.name,
        // The wave, when the run actually named one, over the mechanical stem: a real
        // schedule grouping is worth more than "render (3)" and "render (4)" both reading
        // "render", and it is what lets the note below say the wave truly is not known
        // only when it truly is not.
        group: job.wave !== null ? waveGroupLabel(job.wave) : shardGroupOf(job.name),
        state: shardStateOf(job),
        startedAtMs: parseTime(job.startedAt),
        finishedAtMs: parseTime(job.completedAt),
        url: job.htmlUrl === "" ? null : job.htmlUrl,
    };
}

/** The label a wave-numbered job groups under, e.g. `Wave 2`. */
function waveGroupLabel(wave: number): string {
    return `Wave ${wave}`;
}

function shardStateOf(job: CiJobReport): ShardStat["state"] {
    if (job.status !== "completed") {
        if (job.status === "in_progress") return "running";
        // Every other status GitHub publishes means the job has not begun. An
        // unrecognised one is read the same way, because a provider that has not said
        // "completed" has not said the job is over.
        return "queued";
    }
    switch (job.conclusion) {
        case "success":
            return "succeeded";
        case "failure":
        case "timed_out":
        case "startup_failure":
            return "failed";
        case "cancelled":
            return "cancelled";
        case "skipped":
        case "neutral":
        case "stale":
            return "skipped";
        default:
            return "unknown";
    }
}

function parseTime(value: string | null | undefined): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
}

export interface CiProgressInput {
    readonly phase: CiSyncPhase | null;
    readonly run: CiRunReport | null;
    /** True while this sync is being followed. A finished one never reports a stall. */
    readonly active: boolean;
    readonly startedAt: string | null;
    /** When this surface last heard anything about the sync. */
    readonly lastEventAt?: string | null;
    /**
     * What the preflight found, when the surface has it.
     *
     * Used for two honest facts and nothing else: how many shards the plan asked for, so a
     * matrix that has not been expanded yet is not reported as complete, and how large the
     * upload is, so somebody watching the upload phase knows what they are waiting for.
     */
    readonly preflight?: CiPreflight | null;
}

/** The number of shards the plan asked GitHub for, when the plan said. */
export function plannedShards(preflight: CiPreflight | null | undefined): number | null {
    const raw = preflight?.plan?.inputs["max-jobs"];
    if (raw === undefined) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function ciProgressFacts(input: CiProgressInput): ProgressFacts {
    const shards = (input.run?.jobs ?? []).map(shardFromJob);
    const planned = plannedShards(input.preflight);
    const step = input.phase === null ? 0 : CI_PHASES.indexOf(input.phase) + 1;

    const levels: ProgressLevel[] = [
        {
            id: "overall",
            label: { key: "progress.level.overall", fallback: "Overall", values: {} },
            detail: null,
            // No percentage: see the note at the top of this file. The step count is real
            // and is shown as numbers beside an indeterminate bar.
            percent: null,
            count: step > 0 ? { done: step, total: CI_PHASES.length, unit: "steps" } : null,
        },
        {
            id: "phase",
            label: ciPhaseText(input.phase),
            detail: null,
            percent: null,
            count: null,
        },
    ];

    if (shards.length > 0 || planned !== null) {
        const count = summariseShards(shards, planned);
        levels.push({
            id: "shards",
            label: { key: "progress.level.shards", fallback: "Shards on GitHub", values: {} },
            detail: null,
            // The only real proportion this route has: jobs that have reached an outcome,
            // out of the jobs the plan asked for.
            percent: count.total === null || count.total === 0 ? null : (count.done / count.total) * 100,
            count,
        });
    }

    const notes: ProgressText[] = [];
    if (input.phase === "uploading") {
        notes.push({
            key: "progress.ci.uploadBytes",
            fallback:
                "The upload runs through the backup surface, which is where its byte-by-byte progress is reported. This panel follows the render, not the transfer.",
            values: {},
        });
    }
    // A note only while the wave genuinely is unknown - dropped, not softened, the moment
    // any job in the run actually named one. A run with jobs that all carry `wave: null`
    // predates `render-shard-wave.yml`'s naming, or was dispatched by hand outside it; a
    // run with even one wave-named job is trusted to have named them all.
    const anyWaveKnown = (input.run?.jobs ?? []).some((job) => job.wave !== null);
    if (shards.length > 0 && !anyWaveKnown) {
        notes.push({
            key: "progress.ci.waves",
            fallback:
                "The workflow does not publish which wave a shard belongs to, so shards are grouped by the name GitHub gave them.",
            values: {},
        });
    }

    return {
        route: "actions",
        active: input.active,
        startedAtMs: parseTime(input.startedAt),
        lastEventAtMs: parseTime(input.lastEventAt) ?? parseTime(input.run?.updatedAt),
        // A run report is a poll of GitHub's state, not a measurement of the render inside
        // it, so nothing here claims a bar moved. The shard states are what move.
        lastProgressAtMs: parseTime(input.run?.updatedAt),
        levels,
        // No estimate at all. GitHub reports no progress from inside a shard, so the only
        // honest answer to "how long is left" is nothing.
        estimate: NO_ESTIMATE,
        transfers: [],
        shards,
        notes,
    };
}
