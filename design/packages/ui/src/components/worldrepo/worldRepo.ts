/**
 * The "world kept in a git repository" surface's state, kept out of the component so it can
 * be tested without one.
 *
 * Built to the shape `pages/pagesHosting.ts` and `backup/backups.ts` already established, and
 * for the same reasons: one row per sync keyed by the target it belongs to, so an event for a
 * sync started in another window lands in the right place rather than inventing a second row;
 * a bounded log, because staging thousands of region files talks; and byte formatting
 * **imported** rather than written again.
 *
 * ## Adoption is deliberately a second, unrelated slice of state
 *
 * Syncing pushes; adoption only ever reads (see `worldRepoBridge.ts`'s own doc comment and
 * `main/worldrepo/adopt.ts`'s). Keeping them as two halves of one composable rather than two
 * separate ones is a convenience for the one screen that needs both, not a claim that they
 * are the same feature - nothing in the adoption half ever touches `rows`, `records` or the
 * sync event stream, and nothing in the sync half ever touches `adoptionSignals` or `plan`.
 */

import { computed, ref } from "vue";
import type { ComputedRef, Ref } from "vue";
import { formatBytes } from "../downloads/downloads.js";
import type {
    Answer,
    WorldRepoAdoptionCandidate,
    WorldRepoAdoptionPlan,
    WorldRepoAdoptionSignal,
    WorldRepoBridge,
    WorldRepoEvent,
    WorldRepoFailure,
    WorldRepoOwner,
    WorldRepoPhase,
    WorldRepoPreflight,
    WorldRepoRecord,
    WorldRepoRemoveResult,
    WorldRepoReport,
    WorldRepoSyncReport,
    WorldRepoSyncRequest,
    WorldRepoSyncResult,
    WorldRepoTarget,
} from "./worldRepoBridge.js";

export { formatBytes };

/** How many log lines a row keeps. Staging thousands of region files has a lot to say. */
export const LOG_LIMIT = 100;

type Translate = (key: string, named: Record<string, unknown>, fallback?: string) => string;
type T = ((key: string, fallback: string) => string) & Translate;

/** The default branch a world syncs to, mirrored from `main/worldrepo/repo.ts`'s own constant. */
export const DEFAULT_WORLD_BRANCH = "world";

/**
 * A stable, filesystem-safe key for one sync target, computed identically to
 * `main/worldrepo/repo.ts`'s own `targetKey` so a row built here before the first event
 * arrives lands under the exact key that event will carry.
 */
export function targetKey(owner: string, repo: string, branch: string): string {
    const safe = (value: string): string => value.replace(/[^A-Za-z0-9._-]/g, "_");
    return `${safe(owner)}__${safe(repo)}__${safe(branch || DEFAULT_WORLD_BRANCH)}`;
}

export type WorldRepoRowState = "syncing" | "synced" | "failed" | "cancelled";

export interface WorldRepoLogLine {
    readonly id: number;
    readonly level: string;
    readonly message: string;
    readonly at: string;
}

export interface WorldRepoProgress {
    readonly description: string;
    readonly done: number;
    readonly total: number;
    /** 0 to 100. The counts beside it are the exact ones. */
    readonly percent: number;
}

export interface WorldRepoRow {
    readonly key: string;
    readonly target: string;
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly state: WorldRepoRowState;
    readonly phase: WorldRepoPhase | null;
    readonly progress: WorldRepoProgress | null;
    readonly report: WorldRepoSyncReport | null;
    readonly failure: WorldRepoFailure | null;
    readonly startedAt: string | null;
    readonly finishedAt: string | null;
    readonly durationMs: number | null;
    readonly stopping: boolean;
    readonly log: readonly WorldRepoLogLine[];
}

/** Running first, then the endings. Newest first inside each rank. */
const RANK: Readonly<Record<WorldRepoRowState, number>> = {
    syncing: 0,
    failed: 1,
    cancelled: 2,
    synced: 3,
};

function blankRow(key: string, owner: string, repo: string, branch: string): WorldRepoRow {
    return {
        key,
        target: `${owner}/${repo}#${branch}`,
        owner,
        repo,
        branch,
        state: "syncing",
        phase: null,
        progress: null,
        report: null,
        failure: null,
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        stopping: false,
        log: [],
    };
}

/** What each step is called on screen. */
export function phaseLabel(phase: WorldRepoPhase | null, t: T): string {
    switch (phase) {
        case "preparing":
            return t("worldrepo.phase.preparing", "Reading the world's files");
        case "checking":
            return t("worldrepo.phase.checking", "Checking the repository and the branch");
        case "staging":
            return t("worldrepo.phase.staging", "Staging the world's files");
        case "committing":
            return t("worldrepo.phase.committing", "Recording the world as one commit");
        case "pushing":
            return t("worldrepo.phase.pushing", "Pushing to GitHub");
        case "verifying":
            return t("worldrepo.phase.verifying", "Reading the branch back to confirm the push landed");
        case "finished":
            return t("worldrepo.phase.finished", "Finished");
        default:
            return t("worldrepo.phase.starting", "Starting");
    }
}

/**
 * The one line that says what syncing this world would cost.
 *
 * Worth its own function, mirroring `pagesHosting.ts`'s `sizeLine`, because it is the
 * sentence somebody reads before agreeing to push a world folder that can be gigabytes
 * across tens of thousands of files.
 */
export function sizeLine(world: WorldRepoReport | null, t: T): string {
    if (world === null) return "";
    return t(
        "worldrepo.size",
        { size: formatBytes(world.bytes, t), files: world.fileCount },
        "{size} across {files} files would be pushed.",
    );
}

/* -------------------------------------------------------------------------- */
/* The surface's state                                                        */
/* -------------------------------------------------------------------------- */

export interface WorldRepo {
    /** True when this build can keep a world in a git repository at all. */
    readonly available: boolean;

    readonly rows: ComputedRef<readonly WorldRepoRow[]>;
    readonly records: Ref<readonly WorldRepoRecord[]>;
    readonly recordsFailure: Ref<string | null>;
    readonly loadingRecords: Ref<boolean>;
    readonly owners: Ref<readonly WorldRepoOwner[]>;
    readonly ownersFailure: Ref<string | null>;
    readonly loadingOwners: Ref<boolean>;
    readonly preflight: Ref<WorldRepoPreflight | null>;
    readonly preflightFailure: Ref<string | null>;
    readonly checking: Ref<boolean>;
    readonly starting: Ref<boolean>;
    /** A sync refused before a row existed for it - an invalid request, a missing acknowledgement. */
    readonly startFailure: Ref<WorldRepoFailure | null>;
    /** Keys currently being removed (stop tracking), so a bulk action can show real progress. */
    readonly removingKeys: Ref<ReadonlySet<string>>;
    readonly removeFailure: Ref<string | null>;

    /** Adoption: never syncs, never writes - see this module's own doc comment. */
    readonly adoptionSignals: Ref<readonly WorldRepoAdoptionSignal[]>;
    readonly probing: Ref<boolean>;
    readonly probeFailure: Ref<string | null>;
    readonly plan: Ref<WorldRepoAdoptionPlan | null>;
    readonly planning: Ref<boolean>;
    readonly planFailure: Ref<string | null>;

    loadOwners(): Promise<void>;
    loadRecords(): Promise<void>;
    check(target: WorldRepoTarget): Promise<WorldRepoPreflight | null>;
    sync(request: WorldRepoSyncRequest): Promise<WorldRepoSyncResult | null>;
    resume(target: WorldRepoTarget): Promise<WorldRepoSyncResult | null>;
    cancelSync(key: string): Promise<boolean>;
    /** Stops tracking one target. Never touches the world folder; deletes only the branch. */
    remove(target: WorldRepoTarget): Promise<boolean>;
    /** Checks a bounded list of candidates for this application's own markers. */
    probeAdoption(candidates: readonly WorldRepoAdoptionCandidate[], branch?: string): Promise<void>;
    /** What adopting one repository would restore, or an honest refusal. */
    planAdoption(owner: string, repo: string, branch?: string): Promise<WorldRepoAdoptionPlan | null>;
    clearPlan(): void;
    dispose(): void;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function bridgeFailure(error: unknown): WorldRepoFailure {
    return { code: "bridge", message: describe(error), detail: null, needsGhSignIn: false };
}

export function createWorldRepo(bridge: WorldRepoBridge | null): WorldRepo {
    const byKey = ref<Readonly<Record<string, WorldRepoRow>>>({});
    const records = ref<readonly WorldRepoRecord[]>([]);
    const recordsFailure = ref<string | null>(null);
    const loadingRecords = ref(false);
    const owners = ref<readonly WorldRepoOwner[]>([]);
    const ownersFailure = ref<string | null>(null);
    const loadingOwners = ref(false);
    const preflight = ref<WorldRepoPreflight | null>(null);
    const preflightFailure = ref<string | null>(null);
    const checking = ref(false);
    const starting = ref(false);
    const startFailure = ref<WorldRepoFailure | null>(null);
    const removingKeys = ref<ReadonlySet<string>>(new Set());
    const removeFailure = ref<string | null>(null);

    const adoptionSignals = ref<readonly WorldRepoAdoptionSignal[]>([]);
    const probing = ref(false);
    const probeFailure = ref<string | null>(null);
    const plan = ref<WorldRepoAdoptionPlan | null>(null);
    const planning = ref(false);
    const planFailure = ref<string | null>(null);

    let nextLogId = 1;

    const rows = computed<readonly WorldRepoRow[]>(() =>
        Object.values(byKey.value).sort((left, right) => {
            const rank = RANK[left.state] - RANK[right.state];
            if (rank !== 0) return rank;
            const leftAt = left.startedAt ?? "";
            const rightAt = right.startedAt ?? "";
            if (leftAt !== rightAt) return rightAt.localeCompare(leftAt);
            return left.key.localeCompare(right.key);
        }),
    );

    function put(row: WorldRepoRow): void {
        byKey.value = { ...byKey.value, [row.key]: row };
    }

    function rowFor(key: string, owner = "", repo = "", branch = ""): WorldRepoRow {
        return byKey.value[key] ?? blankRow(key, owner, repo, branch);
    }

    function append(row: WorldRepoRow, level: string, message: string, at: string): readonly WorldRepoLogLine[] {
        const next = [...row.log, { id: nextLogId++, level, message, at }];
        return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
    }

    function handle(event: WorldRepoEvent): void {
        const row = rowFor(event.key);
        switch (event.type) {
            case "started":
                put({ ...row, target: event.target, state: "syncing", phase: null, progress: null, report: null, failure: null, startedAt: event.at, finishedAt: null, durationMs: null, stopping: false });
                break;
            case "phase":
                // Cleared the moment the sync moves past the step it belonged to, exactly
                // like `pagesHosting.ts` clears its own bar: a full staging bar beside
                // "Pushing to GitHub" would read as a push that is already done.
                put({ ...row, phase: event.phase, progress: null });
                break;
            case "progress":
                put({
                    ...row,
                    phase: event.phase,
                    progress: {
                        description: event.description,
                        done: event.done,
                        total: event.total,
                        percent: event.total <= 0 ? 0 : Math.min(100, (event.done / event.total) * 100),
                    },
                });
                break;
            case "log":
                put({ ...row, log: append(row, event.level, event.message, event.at) });
                break;
            case "finished":
                put({
                    ...row,
                    state: "synced",
                    phase: "finished",
                    progress: null,
                    report: event.report,
                    target: `${event.report.owner}/${event.report.repo}#${event.report.branch}`,
                    owner: event.report.owner,
                    repo: event.report.repo,
                    branch: event.report.branch,
                    failure: null,
                    durationMs: event.durationMs,
                    finishedAt: event.at,
                    stopping: false,
                });
                break;
            case "failed":
                put({ ...row, state: "failed", progress: null, failure: event.failure, finishedAt: event.at, stopping: false });
                break;
            case "cancelled":
                put({ ...row, state: "cancelled", progress: null, finishedAt: event.at, stopping: false });
                break;
        }
    }

    const unsubscribe = bridge === null ? null : bridge.onWorldRepoEvent(handle);

    async function loadRecordsInternal(): Promise<void> {
        if (bridge === null) return;
        loadingRecords.value = true;
        recordsFailure.value = null;
        try {
            const answer: Answer<readonly WorldRepoRecord[]> = await bridge.records();
            if (answer.ok) records.value = answer.value;
            else recordsFailure.value = answer.message;
        } catch (error) {
            recordsFailure.value = describe(error);
        } finally {
            loadingRecords.value = false;
        }
    }

    async function runSyncLike(
        call: () => Promise<WorldRepoSyncResult>,
        owner: string,
        repo: string,
        branch: string,
    ): Promise<WorldRepoSyncResult | null> {
        if (bridge === null) return null;
        const key = targetKey(owner, repo, branch);
        // An optimistic row the instant the button is pressed, rather than waiting on the
        // IPC round-trip for the first "started" event - a bridge call that is about to walk
        // thousands of files should never look like nothing happened yet.
        put({ ...rowFor(key, owner, repo, branch), state: "syncing", failure: null, stopping: false });
        starting.value = true;
        startFailure.value = null;
        try {
            const result = await call();
            if (!result.ok) {
                startFailure.value = result.failure;
                // `main/worldrepo/repo.ts`'s own `fail()` emits a matching "failed" event for
                // every refusal `sync`/`resume` return, which is what normally moves the row
                // out of "syncing" on its own. Patched here too so a bridge that, unlike the
                // real one, answers a refusal with no matching event still leaves the row
                // honestly finished rather than stuck reading "syncing" forever.
                const current = byKey.value[key];
                if (current !== undefined && current.state === "syncing") {
                    put({ ...current, state: "failed", progress: null, failure: result.failure, stopping: false });
                }
            }
            if (result.ok) await loadRecordsInternal();
            return result;
        } catch (error) {
            const failure = bridgeFailure(error);
            startFailure.value = failure;
            const current = byKey.value[key];
            if (current !== undefined && current.state === "syncing") {
                put({ ...current, state: "failed", progress: null, failure, stopping: false });
            }
            return null;
        } finally {
            starting.value = false;
        }
    }

    return {
        available: bridge !== null,

        rows,
        records,
        recordsFailure,
        loadingRecords,
        owners,
        ownersFailure,
        loadingOwners,
        preflight,
        preflightFailure,
        checking,
        starting,
        startFailure,
        removingKeys,
        removeFailure,

        adoptionSignals,
        probing,
        probeFailure,
        plan,
        planning,
        planFailure,

        async loadOwners(): Promise<void> {
            if (bridge === null) return;
            loadingOwners.value = true;
            ownersFailure.value = null;
            try {
                const answer = await bridge.owners();
                if (answer.ok) owners.value = answer.value;
                else ownersFailure.value = answer.message;
            } catch (error) {
                ownersFailure.value = describe(error);
            } finally {
                loadingOwners.value = false;
            }
        },

        loadRecords: loadRecordsInternal,

        async check(target: WorldRepoTarget): Promise<WorldRepoPreflight | null> {
            if (bridge === null) return null;
            checking.value = true;
            preflightFailure.value = null;
            // Cleared, not kept: a stale report beside a repository name that was just typed
            // over is how somebody reads "this branch is yours" about the wrong repository.
            preflight.value = null;
            try {
                const answer = await bridge.preflight(target);
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

        sync: (request: WorldRepoSyncRequest) =>
            runSyncLike(() => (bridge as WorldRepoBridge).sync(request), request.owner, request.repo, request.branch ?? DEFAULT_WORLD_BRANCH),

        resume: (target: WorldRepoTarget) =>
            runSyncLike(() => (bridge as WorldRepoBridge).resume(target), target.owner, target.repo, target.branch ?? DEFAULT_WORLD_BRANCH),

        async cancelSync(key: string): Promise<boolean> {
            if (bridge === null) return false;
            const row = byKey.value[key];
            if (row !== undefined) put({ ...row, stopping: true });
            return await bridge.cancel(key);
        },

        async remove(target: WorldRepoTarget): Promise<boolean> {
            if (bridge === null) return false;
            const key = targetKey(target.owner, target.repo, target.branch ?? DEFAULT_WORLD_BRANCH);
            removingKeys.value = new Set([...removingKeys.value, key]);
            removeFailure.value = null;
            try {
                const result: WorldRepoRemoveResult = await bridge.remove(target);
                if (!result.ok) {
                    removeFailure.value = result.failure.message;
                    return false;
                }
                await loadRecordsInternal();
                return true;
            } catch (error) {
                removeFailure.value = describe(error);
                return false;
            } finally {
                const next = new Set(removingKeys.value);
                next.delete(key);
                removingKeys.value = next;
            }
        },

        async probeAdoption(candidates: readonly WorldRepoAdoptionCandidate[], branch?: string): Promise<void> {
            if (bridge === null) return;
            probing.value = true;
            probeFailure.value = null;
            try {
                const answer = await bridge.adoptionProbe({
                    candidates,
                    ...(branch === undefined ? {} : { branch }),
                });
                if (answer.ok) adoptionSignals.value = answer.value;
                else probeFailure.value = answer.message;
            } catch (error) {
                probeFailure.value = describe(error);
            } finally {
                probing.value = false;
            }
        },

        async planAdoption(owner: string, repo: string, branch?: string): Promise<WorldRepoAdoptionPlan | null> {
            if (bridge === null) return null;
            planning.value = true;
            planFailure.value = null;
            plan.value = null;
            try {
                const answer = await bridge.adoptionPlan({ owner, repo, ...(branch === undefined ? {} : { branch }) });
                if (!answer.ok) {
                    planFailure.value = answer.message;
                    return null;
                }
                plan.value = answer.value;
                return answer.value;
            } catch (error) {
                planFailure.value = describe(error);
                return null;
            } finally {
                planning.value = false;
            }
        },

        clearPlan(): void {
            plan.value = null;
            planFailure.value = null;
        },

        dispose(): void {
            unsubscribe?.();
        },
    };
}
