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
    CiPreflight,
    CiRenderBridge,
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

export interface CiRow {
    readonly syncId: string;
    readonly repository: string;
    readonly mapId: string;
    readonly worldFolder: string;
    readonly state: CiRowState;
    readonly phase: CiSyncPhase | null;
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

    check(request: CiSyncRequest): Promise<CiPreflight | null>;
    start(request: CiSyncRequest): Promise<CiSyncResult | null>;
    poll(syncId: string): Promise<CiSyncResult | null>;
    stop(syncId: string): Promise<boolean>;
    loadKnown(): Promise<void>;
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

    let nextLogId = 1;

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
                put({ ...row, phase: event.phase, live: true });
                break;
            case "log":
                put({ ...row, log: append(row, event.level, event.message, event.at), live: true });
                break;
            case "run":
                put({ ...row, run: event.run, state: "running", live: true });
                break;
            case "finished":
                put({
                    ...row,
                    state: "rendered",
                    phase: "finished",
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

        dispose(): void {
            unsubscribe?.();
        },
    };
}
