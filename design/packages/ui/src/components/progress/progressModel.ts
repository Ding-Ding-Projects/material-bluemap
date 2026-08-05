/**
 * What a render is doing, said in enough detail to be worth watching.
 *
 * There are four ways this application can render — as a child process on this machine, in
 * a container on this machine, in a container on somebody else's machine over SSH, and on
 * GitHub's runners — and exactly one surface reports all four. This file is the vocabulary
 * that surface speaks. Nothing in here knows about any particular route: each route builds
 * a {@link ProgressFacts} out of whatever it genuinely knows, and
 * `RenderProgressDetail.vue` draws it. A second panel for a second route is a second thing
 * to keep correct, and the one that fell behind would be the one nobody was watching.
 *
 * ## The one rule everything else follows from
 *
 * **A denominator is never invented.** A percentage on its own is a number somebody cannot
 * act on: 40% says nothing about whether ten minutes or ten hours remain, and a bar that
 * creeps towards 99% to look busy is noticed exactly once, after which nothing on the
 * screen is believed again. So {@link ProgressLevel.percent} is `number | null`, and `null`
 * means *this genuinely does not know its own size* and draws as an indeterminate bar.
 * Where a real count exists — maps of maps, jobs of jobs, bytes of bytes — it travels in
 * {@link ProgressCount} beside the bar and is shown as numbers, because the numbers are the
 * part a person can reason about.
 *
 * The same honesty applies to what a route *cannot* say: {@link ProgressFacts.notes} is
 * where a route states its own blind spot in words, rather than leaving a gap that reads as
 * a bug.
 *
 * ## Is it still moving?
 *
 * The single most useful fact about a four-hour render is whether anything has happened
 * recently, and it is the one thing a percentage cannot express. {@link timingOf} answers
 * it from two timestamps the routes already carry: the last event of any kind, and the last
 * event that moved the progress. Both are kept, because they answer different questions —
 * an engine that is logging but not progressing is loading resources, and an engine that is
 * doing neither is stuck.
 *
 * ## The estimate is upstream's, not a second one
 *
 * {@link createEtaTracker} is the maths of `ProgressTracker` and
 * `RenderManager.estimateCurrentRenderTaskTimeRemaining`, ported in
 * `packages/engine/src/map/rendermanager/`, driven by observations pushed from an event
 * stream rather than by a timer sampling a synchronous supplier. The formula is the same
 * one: each interval contributes `deltaTime / deltaProgress` — the duration a *whole* 0→1
 * run would take at the rate just observed — into a bounded window, and the estimate is the
 * average of that window times the progress still outstanding. Storing raw interval
 * durations instead would produce an estimate wrong by whatever fraction of the work each
 * observation happened to cover.
 *
 * Two deliberate departures, both in the direction of saying less:
 *
 * - An interval in which progress did not move leaves the last pair **untouched**, so the
 *   stalled time is charged forward onto the next interval that does move. Advancing it
 *   would silently discard that time and make a stuck render look fast. This is upstream's
 *   behaviour and the reason it is worth keeping.
 * - Below {@link ETA_MIN_SAMPLES} observations the estimate is `null` rather than a number.
 *   Upstream shows whatever it has; a screen a person is staring at should not, because two
 *   samples taken twenty seconds apart can extrapolate to a confident and absurd figure.
 */

/** Which of the four ways a render is running. `null` when nothing has said. */
export type ProgressRoute = "local" | "docker" | "remote" | "actions";

/**
 * A phrase held as a key, a fallback and its values rather than as a sentence.
 *
 * The modules that build facts have no translator — `renderRun.ts` is built from a bridge
 * and nothing else — and translating where the phrase is *drawn* also means a label
 * changes language when the language mode does, rather than keeping whichever one happened
 * to be active when the render started.
 *
 * Always spent as `t(key, values, fallback)`, never `t(key, fallback).replace(...)`:
 * vue-i18n compiles the fallback as a message too and consumes `{done}` as a named
 * parameter of its own, so a later `replace` has nothing left to substitute.
 */
export interface ProgressText {
    readonly key: string;
    readonly fallback: string;
    readonly values: Readonly<Record<string, unknown>>;
}

/** What is being counted. Each has its own phrasing, because "4 of 7" alone says nothing. */
export type ProgressUnit =
    | "maps"
    | "jobs"
    | "steps"
    | "files"
    | "bytes"
    | "tiles"
    | "regions"
    | "chunks";

export interface ProgressCount {
    readonly done: number;
    /**
     * Null when nothing knows the denominator, and never filled in with a guess.
     *
     * A count with an unknown total is still worth showing — "812 regions so far" is a
     * real fact — but its bar stays indeterminate, because the one thing the number cannot
     * support is a proportion.
     */
    readonly total: number | null;
    readonly unit: ProgressUnit;
}

/**
 * One band of the breakdown: the whole run, the phase inside it, the unit being worked.
 *
 * Ordered coarse to fine by whoever builds the facts, and drawn in that order. Three is the
 * usual number and none of them is mandatory: a route that only knows one thing reports one
 * level rather than padding out to three.
 */
export interface ProgressLevel {
    /** Stable across ticks, so a bar is not re-created every second. */
    readonly id: string;
    readonly label: ProgressText;
    /**
     * The engine's own words for what it is doing, verbatim.
     *
     * Never translated and never rewritten: it is the most precise statement available and
     * it is the string somebody would paste into a search box.
     */
    readonly detail: string | null;
    /** 0 to 100, or null when the size is genuinely unknown. Null draws indeterminate. */
    readonly percent: number | null;
    readonly count: ProgressCount | null;
}

export type EstimateSource = "engine" | "tracker" | "none";

export interface ProgressEstimate {
    readonly source: EstimateSource;
    readonly seconds: number | null;
    /** The engine's own words, when it sent any. Preferred over re-wording its number. */
    readonly text: string | null;
}

export const NO_ESTIMATE: ProgressEstimate = { source: "none", seconds: null, text: null };

export type TransferDirection = "up" | "down";

/**
 * Bytes over a wire, when a route actually counts them.
 *
 * Transferring a world is what dominates a remote or a GitHub render, so a route that can
 * count bytes should. A route that cannot must leave this empty and say so in
 * {@link ProgressFacts.notes} rather than converting a file count into a byte count.
 */
export interface TransferStat {
    readonly id: string;
    readonly direction: TransferDirection;
    readonly label: ProgressText;
    readonly bytesDone: number;
    /** Null when the size of what is being moved is not known in advance. */
    readonly bytesTotal: number | null;
    /** Null until enough has moved to measure a rate. Never extrapolated from one sample. */
    readonly bytesPerSecond: number | null;
}

/**
 * A job's state, in the six outcomes worth telling apart.
 *
 * `unknown` is a real member rather than an oversight: a provider that reports a state this
 * application has never seen is shown as unrecognised, never rounded to the nearest state
 * that happens to be green.
 */
export type ShardState = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "skipped" | "unknown";

export interface ShardStat {
    readonly id: string;
    readonly name: string;
    /**
     * What this shard is shown grouped under.
     *
     * Never a guess: it is either the wave a job's own name actually carried - `ciProgress.ts`
     * reads `CiJobReport.wave`, which the main process parsed from the workflow's own job
     * naming - or, for a job that named none, the stem a matrix job mechanically shares with
     * its siblings, e.g. `render` for `render (3)`. Null when neither is available.
     */
    readonly group: string | null;
    readonly state: ShardState;
    readonly startedAtMs: number | null;
    readonly finishedAtMs: number | null;
    readonly url: string | null;
}

/** Everything one route knows right now, minus the clock. */
export interface ProgressFacts {
    readonly route: ProgressRoute | null;
    readonly active: boolean;
    readonly startedAtMs: number | null;
    /** The last event of any kind, including log lines. Answers "is it alive". */
    readonly lastEventAtMs: number | null;
    /** The last event that moved a bar. Answers "is it getting anywhere". */
    readonly lastProgressAtMs: number | null;
    readonly levels: readonly ProgressLevel[];
    readonly estimate: ProgressEstimate;
    readonly transfers: readonly TransferStat[];
    readonly shards: readonly ShardStat[];
    /** What this route cannot report, stated rather than left as a silent gap. */
    readonly notes: readonly ProgressText[];
}

export const EMPTY_FACTS: ProgressFacts = {
    route: null,
    active: false,
    startedAtMs: null,
    lastEventAtMs: null,
    lastProgressAtMs: null,
    levels: [],
    estimate: NO_ESTIMATE,
    transfers: [],
    shards: [],
    notes: [],
};

/* -------------------------------------------------------------------------- */
/* Is it still moving?                                                        */
/* -------------------------------------------------------------------------- */

/**
 * How long a render may say nothing at all before it is called quiet.
 *
 * Upstream's CLI prints progress on a ten-second timer and logs in between, so a minute of
 * complete silence is six missed ticks and worth pointing at. It is deliberately measured
 * against events of *any* kind rather than against progress: loading resources legitimately
 * produces no percentage for minutes while logging steadily, and flagging that as stalled
 * would train somebody to ignore the flag by the time it means something.
 */
export const STALL_AFTER_MS = 60_000;

export interface ProgressTiming {
    /** Since the render started. Null before it did. */
    readonly elapsedMs: number | null;
    /** Since anything at all arrived. Null before anything did. */
    readonly sinceEventMs: number | null;
    /** Since a bar last moved. Null before one did. */
    readonly sinceProgressMs: number | null;
    /** True once nothing of any kind has arrived for {@link STALL_AFTER_MS}. */
    readonly stalled: boolean;
}

/** The clock, applied to the facts. Pure, so a test can decide what time it is. */
export function timingOf(facts: ProgressFacts, nowMs: number): ProgressTiming {
    const since = (at: number | null): number | null => (at === null ? null : Math.max(0, nowMs - at));
    const sinceEventMs = since(facts.lastEventAtMs);
    return {
        elapsedMs: since(facts.startedAtMs),
        sinceEventMs,
        sinceProgressMs: since(facts.lastProgressAtMs),
        // Only a running render can stall. One that has finished is silent for the best
        // possible reason, and an alarm beside a completed render is an alarm nobody reads.
        stalled: facts.active && sinceEventMs !== null && sinceEventMs >= STALL_AFTER_MS,
    };
}

/* -------------------------------------------------------------------------- */
/* The estimate                                                               */
/* -------------------------------------------------------------------------- */

/** upstream: the `12` in `new ProgressTracker(5000, 12)`. */
export const ETA_WINDOW = 12;

/**
 * How many observations are needed before an estimate is offered at all.
 *
 * Upstream offers one from the first sample because its consumer is a log line. This one is
 * read off a screen somebody is staring at, and two samples twenty seconds apart can
 * extrapolate to a figure that is both confident and hours wrong. Three is the point at
 * which the average has outvoted a single unlucky interval.
 */
export const ETA_MIN_SAMPLES = 3;

export interface EtaTracker {
    /**
     * One observation. `progress` is 0 to 1 over the whole run.
     *
     * The first call only anchors the pair; it produces no sample, because a rate needs two
     * moments. An observation where progress did not move is recorded as nothing *and
     * leaves the anchor alone*, which is what charges the stalled time forward.
     */
    observe(progress: number, atMs: number): void;
    /** Points the tracker at a new run. History is dropped, never carried across. */
    reset(): void;
    samples(): number;
    /** upstream: `getAverageTimePerProgress()`. Zero when nothing has been sampled. */
    averageTimePerProgress(): number;
    /**
     * upstream: `estimateCurrentRenderTaskTimeRemaining()`, in milliseconds.
     *
     * Null rather than upstream's zero when there is too little to say, so a caller shows
     * nothing rather than "0 seconds left" beside a render with an hour to go.
     */
    remainingMs(progress: number): number | null;
}

export function createEtaTracker(
    window: number = ETA_WINDOW,
    minSamples: number = ETA_MIN_SAMPLES,
): EtaTracker {
    const timesPerProgress: number[] = [];
    let lastTime: number | null = null;
    let lastProgress = 0;

    return {
        observe(progress: number, atMs: number): void {
            if (!Number.isFinite(progress) || !Number.isFinite(atMs)) return;
            if (lastTime === null) {
                lastTime = atMs;
                lastProgress = progress;
                return;
            }

            const deltaTime = atMs - lastTime;
            const deltaProgress = progress - lastProgress;

            // The guard does two jobs and dropping either one breaks the estimate. It avoids
            // the division by zero, obviously. Less obviously it leaves the anchor untouched
            // on an interval where nothing moved, so that time is charged to the next
            // interval that does move rather than being silently discarded.
            if (deltaProgress === 0) return;

            // Java's `(long) (deltaTime / deltaProgress)`: double division, then a cast that
            // truncates toward zero.
            timesPerProgress.push(Math.trunc(deltaTime / deltaProgress));
            while (timesPerProgress.length > window) timesPerProgress.shift();
            lastTime = atMs;
            lastProgress = progress;
        },

        reset(): void {
            timesPerProgress.length = 0;
            lastTime = null;
            lastProgress = 0;
        },

        samples(): number {
            return timesPerProgress.length;
        },

        averageTimePerProgress(): number {
            if (timesPerProgress.length === 0) return 0;
            let sum = 0;
            for (const time of timesPerProgress) sum += time;
            // Java's `Double.longValue()` truncates toward zero rather than rounding.
            return Math.trunc(sum / timesPerProgress.length);
        },

        remainingMs(progress: number): number | null {
            if (timesPerProgress.length < minSamples) return null;
            if (!Number.isFinite(progress)) return null;
            let sum = 0;
            for (const time of timesPerProgress) sum += time;
            const average = Math.trunc(sum / timesPerProgress.length);
            // A run whose progress went backwards averages negative. Upstream keeps the
            // negative number; a screen must not show "about -4 minutes left".
            if (average <= 0) return null;
            const remaining = Math.trunc((1 - Math.min(1, Math.max(0, progress))) * average);
            return remaining <= 0 ? null : remaining;
        },
    };
}

/* -------------------------------------------------------------------------- */
/* Shards                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * True for a shard that has reached an outcome, whatever that outcome was.
 *
 * `unknown` counts as finished, and that is not an oversight. An adapter only produces it
 * for a job the provider has reported as **completed** with a conclusion this application
 * does not recognise; a job still in flight under an unrecognised status is reported as
 * `queued`, because a provider that has not said "completed" has not said it is over.
 */
export function shardFinished(shard: ShardStat): boolean {
    return shard.state !== "queued" && shard.state !== "running";
}

/**
 * How many of the planned jobs have reached an outcome.
 *
 * `planned` is the number the plan asked for, when the caller knows it. It matters because
 * a matrix that has not been expanded yet lists fewer jobs than were asked for, and taking
 * the length of the list as the total would show "2 of 2 finished" beside a render with
 * five shards still to be created.
 */
export function summariseShards(shards: readonly ShardStat[], planned: number | null = null): ProgressCount {
    const done = shards.filter(shardFinished).length;
    const total = planned === null ? shards.length : Math.max(planned, shards.length);
    return { done, total: total > 0 ? total : null, unit: "jobs" };
}

/** Which shards are running right now, in the order the provider listed them. */
export function runningShards(shards: readonly ShardStat[]): readonly ShardStat[] {
    return shards.filter((shard) => shard.state === "running");
}

/**
 * The stem a matrix job shares with its siblings.
 *
 * GitHub names a matrix job `render (3)` or `render (shard 3, ubuntu-latest)`, so the stem
 * is everything before the last parenthesised group. Mechanical, from the provider's own
 * naming — not an inference about waves, which nothing in the render workflow publishes.
 */
export function shardGroupOf(name: string): string | null {
    const match = /^(.*\S)\s*\([^()]*\)\s*$/.exec(name);
    const stem = match?.[1];
    return stem === undefined || stem === "" ? null : stem;
}

export interface ShardGroup {
    readonly name: string | null;
    readonly shards: readonly ShardStat[];
    readonly count: ProgressCount;
}

/** Shards gathered under their stems, groups in the order they were first seen. */
export function shardGroups(shards: readonly ShardStat[]): readonly ShardGroup[] {
    const order: (string | null)[] = [];
    const bucketed = new Map<string | null, ShardStat[]>();
    for (const shard of shards) {
        const key = shard.group;
        let bucket = bucketed.get(key);
        if (bucket === undefined) {
            bucket = [];
            bucketed.set(key, bucket);
            order.push(key);
        }
        bucket.push(shard);
    }
    return order.map((name) => {
        const members = bucketed.get(name) ?? [];
        return { name, shards: members, count: summariseShards(members) };
    });
}

/* -------------------------------------------------------------------------- */
/* Milestones                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A key that changes only when something worth saying out loud has changed.
 *
 * A polite live region that fires on every progress event is a screen reader reading a
 * percentage every ten seconds for four hours, which is not a description of a render, it
 * is a reason to turn the application off. So the announcement is bound to this: the phase,
 * the coarse counts, whether it has gone quiet, and whether it is still running. A bar
 * creeping from 41.2% to 41.7% changes none of them and says nothing.
 */
export function milestoneKeyOf(facts: ProgressFacts, timing: ProgressTiming): string {
    const coarse = facts.levels
        .map((level) => {
            const count = level.count;
            return count === null
                ? level.label.key
                : `${level.label.key}:${String(count.done)}/${String(count.total ?? "?")}`;
        })
        .join("|");
    const shards = summariseShards(facts.shards);
    return [
        facts.active ? "live" : "done",
        coarse,
        `${String(shards.done)}/${String(shards.total ?? "?")}`,
        timing.stalled ? "quiet" : "moving",
    ].join("~");
}
