/**
 * The CI-render surface's state, kept out of the component so it can be tested without one.
 *
 * Built to the shape `components/backup/backups.ts` established, and for the same reasons:
 * one row per sync keyed by id so an event for a sync started in another window lands in
 * the right place, a bounded log so a four-hour render does not grow one without limit,
 * and byte formatting **imported** rather than written again - `1.7 GB` has to read
 * identically whether somebody is watching a world leave or a map arrive.
 *
 * ## Nothing here decides that a run succeeded
 *
 * The row's state is whatever the main process last said, and a run with no conclusion is
 * shown as running rather than as nearly finished. {@link jobTone} maps a job's real
 * status onto a colour and deliberately has no branch that turns "in progress" into
 * anything hopeful: a green tick beside a job that has not finished is the one thing a
 * progress surface must never draw.
 */

import { computed, ref } from "vue";
import type { ComputedRef, Ref } from "vue";
import { formatBytes } from "../downloads/downloads.js";
import type {
    CiJobReport,
    CiOwnerChoicesAnswer,
    CiPreflight,
    CiRenderBridge,
    CiRepositoryChoice,
    CiRepositoryNameAvailability,
    CiRoute,
    CiRunReport,
    CiSyncEvent,
    CiSyncFailure,
    CiSyncPhase,
    CiSyncRequest,
    CiSyncResult,
    CiSyncState,
    CiSyncSummary,
} from "./ciRenderBridge.js";

export { formatBytes };

/** How many log lines a row keeps. A render can talk for hours. */
export const LOG_LIMIT = 100;

type Translate = (key: string, named: Record<string, unknown>, fallback?: string) => string;

/** `t(key, fallback)` and `t(key, named, fallback)` both, as vue-i18n offers them. */
type T = ((key: string, fallback: string) => string) & Translate;

export type CiRowState = "running" | "rendered" | "failed" | "cancelled";

export interface CiLogLine {
    readonly id: number;
    readonly level: string;
    readonly message: string;
    readonly at: string;
}

/** The upload's own byte count, so an hours-long transfer is not a bare spinner. */
export interface CiTransferProgress {
    readonly description: string;
    readonly bytesDone: number;
    readonly bytesTotal: number;
    /** 0 to 100. An estimate of the transfer only; the byte counts beside it are exact. */
    readonly percent: number;
    /**
     * How many of the upload's own pieces - files while packing, parts while splitting,
     * release assets while uploading - are done, out of how many there are.
     *
     * The main process's own count, forwarded rather than derived from the bytes above: a
     * part skipped because it is already on the release moves this without moving a byte.
     */
    readonly assetsDone: number;
    readonly assetsTotal: number;
    /** The specific piece in flight right now, when the upload named one. */
    readonly asset: string | null;
}

export interface CiRow {
    readonly syncId: string;
    readonly repository: string;
    readonly mapId: string;
    readonly worldFolder: string;
    readonly state: CiRowState;
    readonly phase: CiSyncPhase | null;
    /**
     * Which credential is actually driving this sync.
     *
     * Null until the first `phase` event arrives - `started` fires before the route is
     * resolved, so for a moment there genuinely is no answer yet, and null says that rather
     * than guessing. Once a phase has arrived this stays set for the rest of the row's life,
     * including a resumed sync loaded from `loadKnown()` before any live event has landed.
     */
    readonly route: CiRoute | null;
    /** Null until the upload says something, and cleared once the run is in flight. */
    readonly transfer: CiTransferProgress | null;
    readonly run: CiRunReport | null;
    readonly summary: CiSyncSummary | null;
    readonly failure: CiSyncFailure | null;
    readonly startedAt: string | null;
    readonly finishedAt: string | null;
    readonly durationMs: number | null;
    /** True once a real event has arrived, as opposed to an id adopted from a list. */
    readonly live: boolean;
    readonly stopping: boolean;
    readonly log: readonly CiLogLine[];
}

/** Running first, then the endings. Newest first inside each rank. */
const RANK: Readonly<Record<CiRowState, number>> = {
    running: 0,
    failed: 1,
    cancelled: 2,
    rendered: 3,
};

function blankRow(syncId: string): CiRow {
    return {
        syncId,
        repository: "",
        mapId: "",
        worldFolder: "",
        state: "running",
        phase: null,
        route: null,
        transfer: null,
        run: null,
        summary: null,
        failure: null,
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        live: false,
        stopping: false,
        log: [],
    };
}

/** What each phase is called on screen. */
export function phaseLabel(phase: CiSyncPhase | null, t: T): string {
    switch (phase) {
        case "checking":
            return t("cirender.phase.checking", "Checking the world and the repository");
        case "uploading":
            return t("cirender.phase.uploading", "Uploading the world to GitHub");
        case "dispatching":
            return t("cirender.phase.dispatching", "Starting the workflow");
        case "waiting":
            return t("cirender.phase.waiting", "Waiting for GitHub to create the run");
        case "rendering":
            return t("cirender.phase.rendering", "GitHub is rendering");
        case "downloading":
            return t("cirender.phase.downloading", "Fetching the rendered map");
        case "registering":
            return t("cirender.phase.registering", "Adding it to the map list");
        case "finished":
            return t("cirender.phase.finished", "Finished");
        default:
            return t("cirender.phase.starting", "Starting");
    }
}

/**
 * What a run's own state is called, without ever implying an outcome it has not reached.
 *
 * A completed run says what it concluded; anything else says what it is doing. There is
 * deliberately no wording here that reads as "nearly done", because the difference between
 * a render at 90% and a render that failed at 90% is invisible to this surface and the
 * user is the one who pays for the confusion.
 */
export function runLabel(run: CiRunReport | null, t: T): string {
    if (run === null) return t("cirender.run.none", "No run yet");
    if (run.status !== "completed") {
        return t(
            "cirender.run.going",
            { status: run.status.replace("_", " ") },
            "Run is {status}",
        );
    }
    return t(
        "cirender.run.ended",
        { conclusion: run.conclusion ?? "finished with no conclusion" },
        "Run ended: {conclusion}",
    );
}

/** A job's colour. No branch here turns an unfinished job into a success. */
export function jobTone(job: CiJobReport): "success" | "error" | "warning" | "info" | "default" {
    if (job.status !== "completed") return job.status === "in_progress" ? "info" : "default";
    switch (job.conclusion) {
        case "success":
            return "success";
        case "failure":
        case "timed_out":
        case "startup_failure":
            return "error";
        case "cancelled":
        case "action_required":
            return "warning";
        default:
            return "default";
    }
}

/**
 * Which of the two GitHub credentials is actually driving this row, in words.
 *
 * Null before the first `phase` event has arrived, and this returns the empty string for
 * that rather than a placeholder - the caller decides whether to show anything at all, and
 * "" never reads as a sentence that says nothing was found.
 */
export function routeLabel(route: CiRoute | null, t: T): string {
    if (route === null) return "";
    return route === "gh"
        ? t("cirender.row.route.gh", "Using the gh command-line tool")
        : t("cirender.row.route.session", "Using this application's GitHub sign-in");
}

/** One wave's shards, counted. `wave` is null for the bucket of jobs with no wave in their name. */
export interface CiWaveSummary {
    readonly wave: number | null;
    readonly done: number;
    readonly total: number;
}

/**
 * Jobs bucketed by {@link CiJobReport.wave}, in the order a wave was first seen.
 *
 * A summary rather than a percentage: GitHub reports nothing from inside a shard, so "3 of
 * 5 finished" is the whole of what this route can honestly say about a wave in progress.
 */
export function waveSummaries(jobs: readonly CiJobReport[]): readonly CiWaveSummary[] {
    const order: (number | null)[] = [];
    const buckets = new Map<number | null, CiJobReport[]>();
    for (const job of jobs) {
        const key = job.wave;
        let bucket = buckets.get(key);
        if (bucket === undefined) {
            bucket = [];
            buckets.set(key, bucket);
            order.push(key);
        }
        bucket.push(job);
    }
    return order.map((wave) => {
        const members = buckets.get(wave) ?? [];
        return { wave, done: members.filter(jobFinished).length, total: members.length };
    });
}

/** True for a job GitHub has called `completed`, whatever it concluded. */
function jobFinished(job: CiJobReport): boolean {
    return job.status === "completed";
}

/**
 * The one line that says whether a re-sync would send anything.
 *
 * Worth its own function because it is the sentence that decides whether somebody starts
 * a four-hour upload, and getting the polarity backwards would be a very quiet bug.
 */
export function uploadLine(preflight: CiPreflight | null, t: T): string {
    if (preflight === null) return "";
    if (preflight.world === null) return preflight.worldFailure ?? "";
    if (!preflight.uploadNeeded) {
        return t(
            "cirender.upload.none",
            { asset: preflight.state?.assetName ?? "" },
            "The world has not changed since it was uploaded as {asset}, so nothing will be sent.",
        );
    }
    return t(
        "cirender.upload.needed",
        { size: formatBytes(preflight.estimatedArchiveBytes, t) },
        "About {size} will be uploaded to GitHub before anything is rendered.",
    );
}

/* -------------------------------------------------------------------------- */
/* Naming a repository: the last segment of a folder, and GitHub's own rules  */
/* -------------------------------------------------------------------------- */

/**
 * The folder's own name, from a full path - what a repository name is suggested from once a
 * world is chosen.
 *
 * Trailing separators are dropped first so a folder chosen with one still names itself
 * rather than the empty string, and both slash styles are recognised because a folder can
 * arrive here by a Windows browse dialog, a POSIX drop target, or hand-typed text on either.
 */
export function worldFolderName(path: string): string {
    const trimmed = path.trim().replace(/[\\/]+$/, "");
    if (trimmed === "") return "";
    const parts = trimmed.split(/[\\/]/);
    return parts[parts.length - 1] ?? "";
}

const REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Why `repo` is not a name GitHub will accept, in the reader's own words - or null when it
 * is fine, or empty, since an empty field is a separate "this is required" message rather
 * than an invalid one.
 *
 * Checked here rather than only server-side, because the suggestion at
 * `suggestCiRepositoryName` in the main process is a *sanitizer* and this is the matching
 * *validator*: somebody who edits the suggestion, or never used it, still gets told what is
 * wrong before pressing a button that would otherwise fail with GitHub's own, less specific
 * refusal.
 */
export function repoNameProblem(repo: string, t: T): string | null {
    const trimmed = repo.trim();
    if (trimmed === "") return null;
    if (trimmed === "." || trimmed === "..") {
        return t("cirender.repo.invalid.dots", 'A repository name cannot be just "." or "..".');
    }
    if (/\.git$/i.test(trimmed)) {
        return t("cirender.repo.invalid.gitSuffix", 'A repository name cannot end in ".git".');
    }
    if (trimmed.length > 100) {
        return t("cirender.repo.invalid.long", "A repository name cannot be longer than 100 characters.");
    }
    if (!REPOSITORY_NAME_PATTERN.test(trimmed)) {
        return t(
            "cirender.repo.invalid.chars",
            "Repository names may only use letters, digits, dots, hyphens and underscores.",
        );
    }
    return null;
}

/* -------------------------------------------------------------------------- */
/* The surface's state                                                        */
/* -------------------------------------------------------------------------- */

export interface CiRenders {
    /** True when this build can start a CI render at all. */
    readonly available: boolean;
    readonly canCancel: boolean;
    readonly canList: boolean;
    readonly canCheck: boolean;

    readonly rows: ComputedRef<readonly CiRow[]>;
    readonly preflight: Ref<CiPreflight | null>;
    readonly preflightFailure: Ref<string | null>;
    readonly checking: Ref<boolean>;
    readonly known: Ref<readonly CiSyncState[]>;
    readonly knownFailure: Ref<string | null>;
    /**
     * A sync refused before it had an id, so there is no row for it.
     *
     * Being signed out, an unaccepted licence and an unacknowledged public repository all
     * fail before a record exists, and inventing a row for a sync that never began would
     * put a permanent failure into a list of real ones.
     */
    readonly startFailure: Ref<CiSyncFailure | null>;
    readonly starting: Ref<boolean>;

    /*
     * What the "What, and where" card needs so nobody has to know what to type: who could
     * own the repository, whether a suggested name is free, and which repositories already
     * exist to pick from instead of typing a new one. Each is independently optional - a
     * build missing one of the four bridge methods below simply reports `false` for the
     * matching `canX` flag and the field falls back to free text, exactly as it always could.
     */
    readonly owners: Ref<CiOwnerChoicesAnswer | null>;
    readonly loadingOwners: Ref<boolean>;
    readonly repositories: Ref<readonly CiRepositoryChoice[]>;
    readonly loadingRepositories: Ref<boolean>;
    readonly repositoriesFailure: Ref<string | null>;
    readonly nameAvailability: Ref<CiRepositoryNameAvailability | null>;
    readonly checkingName: Ref<boolean>;
    readonly canListOwners: boolean;
    readonly canSuggestRepoName: boolean;
    readonly canCheckRepoName: boolean;
    readonly canListRepositories: boolean;

    check(request: CiSyncRequest): Promise<CiPreflight | null>;
    start(request: CiSyncRequest): Promise<CiSyncResult | null>;
    poll(syncId: string): Promise<CiSyncResult | null>;
    stop(syncId: string): Promise<boolean>;
    loadKnown(): Promise<void>;
    loadOwners(): Promise<void>;
    loadRepositories(): Promise<void>;
    suggestRepoName(sourceName: string): Promise<string | null>;
    checkRepoName(owner: string, repo: string): Promise<void>;
    /** Drops whatever the last check said, for a field that just changed underneath it. */
    clearNameAvailability(): void;
    dispose(): void;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function createCiRenders(bridge: CiRenderBridge | null): CiRenders {
    const byId = ref<Readonly<Record<string, CiRow>>>({});
    const preflight = ref<CiPreflight | null>(null);
    const preflightFailure = ref<string | null>(null);
    const checking = ref(false);
    const known = ref<readonly CiSyncState[]>([]);
    const knownFailure = ref<string | null>(null);
    const startFailure = ref<CiSyncFailure | null>(null);
    const starting = ref(false);

    const owners = ref<CiOwnerChoicesAnswer | null>(null);
    const loadingOwners = ref(false);
    const repositories = ref<readonly CiRepositoryChoice[]>([]);
    const loadingRepositories = ref(false);
    const repositoriesFailure = ref<string | null>(null);
    const nameAvailability = ref<CiRepositoryNameAvailability | null>(null);
    const checkingName = ref(false);

    let nextLogId = 1;
    // Bumped on every checkRepoName/clearNameAvailability call so a slow, out-of-order
    // availability answer can tell it has been superseded and drop itself instead of
    // overwriting a newer check's result. See checkRepoName below.
    let nameCheckToken = 0;

    const rows = computed<readonly CiRow[]>(() =>
        Object.values(byId.value).sort((left, right) => {
            const rank = RANK[left.state] - RANK[right.state];
            if (rank !== 0) return rank;
            // ISO-8601 sorts correctly as text. A row with no timestamp came from an id
            // alone and goes last rather than pretending to be the oldest on screen.
            const leftAt = left.startedAt ?? "";
            const rightAt = right.startedAt ?? "";
            if (leftAt !== rightAt) return rightAt.localeCompare(leftAt);
            return left.syncId.localeCompare(right.syncId);
        }),
    );

    function put(row: CiRow): void {
        byId.value = { ...byId.value, [row.syncId]: row };
    }

    function rowFor(syncId: string): CiRow {
        return byId.value[syncId] ?? blankRow(syncId);
    }

    function append(row: CiRow, level: string, message: string, at: string): readonly CiLogLine[] {
        const next = [...row.log, { id: nextLogId++, level, message, at }];
        return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
    }

    function handle(event: CiSyncEvent): void {
        // A failure that happened before a record existed carries a placeholder id and is
        // not a row of anything. It is reported beside the form instead.
        if (event.syncId === "" || event.syncId === "nowhere") {
            if (event.type === "failed") startFailure.value = event.failure;
            return;
        }

        const row = rowFor(event.syncId);

        switch (event.type) {
            case "started":
                put({
                    ...row,
                    repository: event.repository,
                    mapId: event.mapId,
                    worldFolder: event.worldFolder,
                    state: "running",
                    phase: null,
                    // Not known yet: `started` fires before the route is resolved, and the
                    // next `phase` event is what says which credential actually drove it.
                    route: null,
                    transfer: null,
                    run: null,
                    summary: null,
                    failure: null,
                    startedAt: event.at,
                    finishedAt: null,
                    durationMs: null,
                    stopping: false,
                    live: true,
                });
                break;
            case "phase":
                // The transfer's bar is cleared the moment the sync moves past uploading.
                // Leaving a finished upload's bar beside "GitHub is rendering" would read
                // as a render that is 100% done rather than one that has just started.
                put({
                    ...row,
                    phase: event.phase,
                    route: event.route,
                    transfer: event.phase === "uploading" ? row.transfer : null,
                    live: true,
                });
                break;
            case "log":
                put({ ...row, log: append(row, event.level, event.message, event.at), live: true });
                break;
            case "progress":
                put({
                    ...row,
                    transfer: {
                        description: event.description,
                        bytesDone: event.bytesDone,
                        bytesTotal: event.bytesTotal,
                        percent:
                            event.bytesTotal <= 0
                                ? 0
                                : Math.min(100, (event.bytesDone / event.bytesTotal) * 100),
                        assetsDone: event.assetsDone,
                        assetsTotal: event.assetsTotal,
                        asset: event.asset,
                    },
                    live: true,
                });
                break;
            case "run":
                put({ ...row, run: event.run, state: "running", transfer: null, live: true });
                break;
            case "finished":
                put({
                    ...row,
                    state: "rendered",
                    phase: "finished",
                    route: event.summary.route,
                    summary: event.summary,
                    repository: event.summary.repository,
                    mapId: event.summary.mapId,
                    durationMs: event.durationMs,
                    finishedAt: event.at,
                    failure: null,
                    stopping: false,
                    live: true,
                });
                break;
            case "failed":
                put({
                    ...row,
                    state: "failed",
                    // A failure this early can genuinely predate any phase - "no route" and
                    // "read-only" both fail before a credential is settled - so this keeps
                    // whatever the row already knew rather than overwriting it with null.
                    route: event.failure.route ?? row.route,
                    failure: event.failure,
                    // A failure that carries the run keeps it on screen: "which job, and
                    // what did its log say" is the whole of what a person needs next.
                    run: event.failure.run ?? row.run,
                    finishedAt: event.at,
                    stopping: false,
                    live: true,
                });
                break;
            case "cancelled":
                put({ ...row, state: "cancelled", finishedAt: event.at, stopping: false, live: true });
                break;
        }
    }

    const unsubscribe = bridge === null ? null : bridge.onCiRenderEvent(handle);

    return {
        available: bridge !== null,
        canCancel: bridge?.canCancel ?? false,
        canList: bridge?.canList ?? false,
        canCheck: bridge?.canCheck ?? false,

        rows,
        preflight,
        preflightFailure,
        checking,
        known,
        knownFailure,
        startFailure,
        starting,

        owners,
        loadingOwners,
        repositories,
        loadingRepositories,
        repositoriesFailure,
        nameAvailability,
        checkingName,
        canListOwners: bridge?.listCiOwners !== undefined,
        canSuggestRepoName: bridge?.suggestCiRepoName !== undefined,
        canCheckRepoName: bridge?.checkCiRepoName !== undefined,
        canListRepositories: bridge?.listExistingRepositories !== undefined,

        async check(request: CiSyncRequest): Promise<CiPreflight | null> {
            if (bridge === null) return null;
            checking.value = true;
            preflightFailure.value = null;
            // Cleared, not kept: a stale report beside a changed repository name is how
            // somebody reads "private" about a repository they have just typed over.
            preflight.value = null;
            try {
                const answer = await bridge.ciRenderPreflight(request);
                if (!answer.ok) {
                    preflightFailure.value = answer.message;
                    return null;
                }
                preflight.value = answer.value;
                return answer.value;
            } catch (error) {
                preflightFailure.value = describe(error);
                return null;
            } finally {
                checking.value = false;
            }
        },

        async start(request: CiSyncRequest): Promise<CiSyncResult | null> {
            if (bridge === null) return null;
            starting.value = true;
            startFailure.value = null;
            try {
                const result = await bridge.startCiRender(request);
                if (!result.ok && (result.syncId === "" || result.syncId === "nowhere")) {
                    startFailure.value = result.failure;
                }
                return result;
            } catch (error) {
                startFailure.value = {
                    code: "bridge",
                    message: describe(error),
                    detail: null,
                    status: null,
                    needsSignIn: false,
                    needsEula: false,
                    route: null,
                    run: null,
                    failingJob: null,
                    logExcerpt: null,
                };
                return null;
            } finally {
                starting.value = false;
            }
        },

        async poll(syncId: string): Promise<CiSyncResult | null> {
            if (bridge === null) return null;
            const result = await bridge.checkCiRender(syncId);
            if (result.ok && result.outcome === "running" && result.run !== null) {
                put({ ...rowFor(syncId), run: result.run, live: true });
            }
            return result;
        },

        async stop(syncId: string): Promise<boolean> {
            if (bridge === null) return false;
            put({ ...rowFor(syncId), stopping: true });
            return await bridge.cancelCiRender(syncId);
        },

        async loadKnown(): Promise<void> {
            if (bridge === null) return;
            knownFailure.value = null;
            try {
                const answer = await bridge.listCiRenders();
                if (answer.ok) {
                    known.value = answer.value;
                    // Adopting the ids puts a sync started in another window, or before
                    // this one was opened, on screen rather than leaving it invisible.
                    for (const state of answer.value) {
                        if (byId.value[state.syncId] === undefined) put(blankRow(state.syncId));
                    }
                } else {
                    knownFailure.value = answer.message;
                }
            } catch (error) {
                knownFailure.value = describe(error);
            }
        },

        async loadOwners(): Promise<void> {
            if (bridge?.listCiOwners === undefined) return;
            loadingOwners.value = true;
            try {
                owners.value = await bridge.listCiOwners();
            } catch (error) {
                owners.value = { ok: false, signedIn: true, message: describe(error) };
            } finally {
                loadingOwners.value = false;
            }
        },

        async loadRepositories(): Promise<void> {
            if (bridge?.listExistingRepositories === undefined) return;
            loadingRepositories.value = true;
            repositoriesFailure.value = null;
            try {
                const answer = await bridge.listExistingRepositories();
                if (answer.ok) repositories.value = answer.value;
                else repositoriesFailure.value = answer.message;
            } catch (error) {
                repositoriesFailure.value = describe(error);
            } finally {
                loadingRepositories.value = false;
            }
        },

        async suggestRepoName(sourceName: string): Promise<string | null> {
            if (bridge?.suggestCiRepoName === undefined) return null;
            try {
                return await bridge.suggestCiRepoName(sourceName);
            } catch {
                // A suggestion that failed to arrive is simply no suggestion. The field
                // stays exactly as empty as it was; nothing here is worth reporting as an
                // error over a name somebody was always free to type themselves.
                return null;
            }
        },

        async checkRepoName(owner: string, repo: string): Promise<void> {
            if (bridge?.checkCiRepoName === undefined) return;
            // Claim this round before awaiting anything, so a later call - or a clear -
            // fired while this one is still in flight can tell it has been superseded.
            const token = ++nameCheckToken;
            checkingName.value = true;
            try {
                const answer = await bridge.checkCiRepoName({ owner, repo });
                if (token !== nameCheckToken) return; // A newer check (or a clear) already won.
                nameAvailability.value = answer;
            } catch (error) {
                if (token !== nameCheckToken) return;
                nameAvailability.value = { status: "unknown", owner, repo, message: describe(error) };
            } finally {
                if (token === nameCheckToken) checkingName.value = false;
            }
        },

        clearNameAvailability(): void {
            nameCheckToken++;
            nameAvailability.value = null;
        },

        dispose(): void {
            unsubscribe?.();
        },
    };
}
