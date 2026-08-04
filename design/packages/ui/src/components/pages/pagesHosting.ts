/**
 * The Pages-hosting surface's state, kept out of the component so it can be tested without one.
 *
 * Built to the shape `components/cirender/ciRenders.ts` established, and for the same reasons:
 * one row per publish keyed by the render it belongs to, so an event for work started in
 * another window lands in the right place rather than inventing a second row; a bounded log,
 * because staging tens of thousands of files talks; and byte formatting **imported** rather
 * than written again, so `1.7 GB` reads identically whether somebody is watching a world leave
 * or a site go up.
 *
 * ## Nothing here decides that a site is live
 *
 * The row's state is whatever the main process last said. {@link statusTone} has no branch
 * that turns "built" or "queued" into a success, because GitHub reporting a build as finished
 * and a browser being able to open the URL are two different claims, and only the second one
 * is what somebody is about to send to a friend. Green means a request to that URL answered
 * 200, and nothing else does.
 */

import { computed, ref } from "vue";
import type { ComputedRef, Ref } from "vue";
import { formatBytes } from "../downloads/downloads.js";
import type {
    PagesBridge,
    PagesCandidate,
    PagesEvent,
    PagesFailure,
    PagesOwner,
    PagesPhase,
    PagesPreflight,
    PagesPublishReport,
    PagesPublishRequest,
    PagesRecord,
    PagesResult,
    PagesSiteStatus,
    PagesTarget,
} from "./pagesBridge.js";

export { formatBytes };

/** How many log lines a row keeps. Staging a large map has a lot to say. */
export const LOG_LIMIT = 100;

type Translate = (key: string, named: Record<string, unknown>, fallback?: string) => string;

/** `t(key, fallback)` and `t(key, named, fallback)` both, as vue-i18n offers them. */
type T = ((key: string, fallback: string) => string) & Translate;

export type PagesRowState = "publishing" | "published" | "failed" | "cancelled";

export interface PagesLogLine {
    readonly id: number;
    readonly level: string;
    readonly message: string;
    readonly at: string;
}

/** How far a step has got, with the real numbers rather than a spinner. */
export interface PagesProgress {
    readonly description: string;
    readonly done: number;
    readonly total: number;
    /** 0 to 100. The counts beside it are the exact ones. */
    readonly percent: number;
}

export interface PagesRow {
    readonly renderId: string;
    readonly target: string;
    readonly state: PagesRowState;
    readonly phase: PagesPhase | null;
    readonly progress: PagesProgress | null;
    readonly report: PagesPublishReport | null;
    readonly failure: PagesFailure | null;
    readonly startedAt: string | null;
    readonly finishedAt: string | null;
    readonly durationMs: number | null;
    readonly stopping: boolean;
    readonly log: readonly PagesLogLine[];
}

/** Running first, then the endings. Newest first inside each rank. */
const RANK: Readonly<Record<PagesRowState, number>> = {
    publishing: 0,
    failed: 1,
    cancelled: 2,
    published: 3,
};

function blankRow(renderId: string): PagesRow {
    return {
        renderId,
        target: "",
        state: "publishing",
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
export function phaseLabel(phase: PagesPhase | null, t: T): string {
    switch (phase) {
        case "preparing":
            return t("pages.phase.preparing", "Preparing the map for a host that only serves files");
        case "checking":
            return t("pages.phase.checking", "Checking the repository and the publishing branch");
        case "staging":
            return t("pages.phase.staging", "Staging the map's files");
        case "pushing":
            return t("pages.phase.pushing", "Pushing to GitHub");
        case "enabling":
            return t("pages.phase.enabling", "Turning GitHub Pages on");
        case "waiting":
            return t("pages.phase.waiting", "Waiting for GitHub to build the site");
        case "verifying":
            return t("pages.phase.verifying", "Opening the published address to check it answers");
        case "finished":
            return t("pages.phase.finished", "Finished");
        default:
            return t("pages.phase.starting", "Starting");
    }
}

/**
 * What the site's state is called, without ever implying one it has not reached.
 *
 * "Built" is GitHub's word for "the build step finished", which is not the same as a page
 * that loads: a first build routinely reports built a minute before the address resolves. So
 * only `live` says live, and only a 200 produces it.
 */
export function statusLabel(status: PagesSiteStatus, t: T): string {
    switch (status) {
        case "live":
            return t("pages.status.live", "Live, and answering");
        case "built":
            return t("pages.status.built", "GitHub says built, but the address did not answer yet");
        case "building":
            return t("pages.status.building", "GitHub is building it");
        case "queued":
            return t("pages.status.queued", "Queued at GitHub");
        case "errored":
            return t("pages.status.errored", "GitHub's build failed");
        default:
            return t("pages.status.unknown", "GitHub has not said yet");
    }
}

/** A site's colour. No branch here turns an unverified site into a success. */
export function statusTone(status: PagesSiteStatus): "success" | "error" | "warning" | "info" {
    if (status === "live") return "success";
    if (status === "errored") return "error";
    if (status === "unknown") return "warning";
    return "info";
}

/**
 * The one line that says what publishing this render would cost.
 *
 * Worth its own function because it is the sentence somebody reads before agreeing to push
 * several gigabytes across tens of thousands of files, and a wrong number here is a wrong
 * decision rather than a cosmetic slip.
 */
export function sizeLine(preflight: PagesPreflight | null, t: T): string {
    const site = preflight?.site;
    if (site === null || site === undefined) return "";
    return t(
        "pages.size",
        { size: formatBytes(site.totalBytes, t), files: site.fileCount },
        "{size} across {files} files would be pushed.",
    );
}

/* -------------------------------------------------------------------------- */
/* The surface's state                                                        */
/* -------------------------------------------------------------------------- */

export interface PagesHosting {
    /** True when this build can publish a map at all. */
    readonly available: boolean;
    readonly canListOwners: boolean;
    readonly canListPublished: boolean;
    readonly canStop: boolean;
    readonly canCancel: boolean;

    readonly rows: ComputedRef<readonly PagesRow[]>;
    readonly candidates: Ref<readonly PagesCandidate[]>;
    readonly candidatesFailure: Ref<string | null>;
    readonly owners: Ref<readonly PagesOwner[]>;
    readonly ownersFailure: Ref<string | null>;
    readonly published: Ref<readonly PagesRecord[]>;
    readonly publishedFailure: Ref<string | null>;
    readonly preflight: Ref<PagesPreflight | null>;
    readonly preflightFailure: Ref<string | null>;
    readonly checking: Ref<boolean>;
    readonly starting: Ref<boolean>;
    /**
     * A publish refused before a row existed for it.
     *
     * An invalid request and a missing acknowledgement both fail before anything started, and
     * inventing a row for a publish that never began would put a permanent failure into a list
     * of real ones.
     */
    readonly startFailure: Ref<PagesFailure | null>;
    readonly stopFailure: Ref<string | null>;

    loadCandidates(): Promise<void>;
    loadOwners(): Promise<void>;
    loadPublished(): Promise<void>;
    check(request: PagesTarget): Promise<PagesPreflight | null>;
    publish(request: PagesPublishRequest): Promise<PagesResult | null>;
    stopPublishing(renderId: string): Promise<boolean>;
    /** Takes a published site down: Pages off, publishing branch deleted. */
    removeHosting(request: PagesTarget): Promise<boolean>;
    dispose(): void;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function createPagesHosting(bridge: PagesBridge | null): PagesHosting {
    const byId = ref<Readonly<Record<string, PagesRow>>>({});
    const candidates = ref<readonly PagesCandidate[]>([]);
    const candidatesFailure = ref<string | null>(null);
    const owners = ref<readonly PagesOwner[]>([]);
    const ownersFailure = ref<string | null>(null);
    const published = ref<readonly PagesRecord[]>([]);
    const publishedFailure = ref<string | null>(null);
    const preflight = ref<PagesPreflight | null>(null);
    const preflightFailure = ref<string | null>(null);
    const checking = ref(false);
    const starting = ref(false);
    const startFailure = ref<PagesFailure | null>(null);
    const stopFailure = ref<string | null>(null);

    let nextLogId = 1;

    const rows = computed<readonly PagesRow[]>(() =>
        Object.values(byId.value).sort((left, right) => {
            const rank = RANK[left.state] - RANK[right.state];
            if (rank !== 0) return rank;
            // ISO-8601 sorts correctly as text. A row with no timestamp came from an id alone
            // and goes last rather than pretending to be the oldest on screen.
            const leftAt = left.startedAt ?? "";
            const rightAt = right.startedAt ?? "";
            if (leftAt !== rightAt) return rightAt.localeCompare(leftAt);
            return left.renderId.localeCompare(right.renderId);
        }),
    );

    function put(row: PagesRow): void {
        byId.value = { ...byId.value, [row.renderId]: row };
    }

    function rowFor(renderId: string): PagesRow {
        return byId.value[renderId] ?? blankRow(renderId);
    }

    function append(row: PagesRow, level: string, message: string, at: string): readonly PagesLogLine[] {
        const next = [...row.log, { id: nextLogId++, level, message, at }];
        return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
    }

    function handle(event: PagesEvent): void {
        const row = rowFor(event.renderId);
        switch (event.type) {
            case "started":
                put({
                    ...row,
                    target: event.target,
                    state: "publishing",
                    phase: null,
                    progress: null,
                    report: null,
                    failure: null,
                    startedAt: event.at,
                    finishedAt: null,
                    durationMs: null,
                    stopping: false,
                });
                break;
            case "phase":
                // The bar is cleared the moment the publish moves past the step it belonged
                // to. Leaving a full staging bar beside "Pushing to GitHub" would read as a
                // push that is done rather than one that has just started.
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
                    state: "published",
                    phase: "finished",
                    progress: null,
                    report: event.report,
                    target: `${event.report.owner}/${event.report.repo}`,
                    failure: null,
                    durationMs: event.durationMs,
                    finishedAt: event.at,
                    stopping: false,
                });
                break;
            case "failed":
                put({
                    ...row,
                    state: "failed",
                    progress: null,
                    failure: event.failure,
                    finishedAt: event.at,
                    stopping: false,
                });
                break;
            case "cancelled":
                put({
                    ...row,
                    state: "cancelled",
                    progress: null,
                    finishedAt: event.at,
                    stopping: false,
                });
                break;
        }
    }

    const unsubscribe = bridge === null ? null : bridge.onEvent(handle);

    /**
     * The published-sites list, refreshed.
     *
     * A free function rather than a method, because publishing and taking a site down both
     * refresh it and a `this` inside an object literal is exactly the sort of thing that keeps
     * working until somebody destructures the store.
     */
    async function loadPublishedRecords(): Promise<void> {
        if (bridge === null) return;
        publishedFailure.value = null;
        try {
            const answer = await bridge.listPublished();
            if (answer.ok) published.value = answer.value;
            else publishedFailure.value = answer.message;
        } catch (error) {
            publishedFailure.value = describe(error);
        }
    }

    return {
        available: bridge !== null,
        canListOwners: bridge?.canListOwners ?? false,
        canListPublished: bridge?.canListPublished ?? false,
        canStop: bridge?.canStop ?? false,
        canCancel: bridge?.canCancel ?? false,

        rows,
        candidates,
        candidatesFailure,
        owners,
        ownersFailure,
        published,
        publishedFailure,
        preflight,
        preflightFailure,
        checking,
        starting,
        startFailure,
        stopFailure,

        async loadCandidates(): Promise<void> {
            if (bridge === null) return;
            candidatesFailure.value = null;
            try {
                const answer = await bridge.listRenders();
                if (answer.ok) candidates.value = answer.value;
                else candidatesFailure.value = answer.message;
            } catch (error) {
                candidatesFailure.value = describe(error);
            }
        },

        async loadOwners(): Promise<void> {
            if (bridge === null) return;
            ownersFailure.value = null;
            try {
                const answer = await bridge.listOwners();
                if (answer.ok) owners.value = answer.value;
                else ownersFailure.value = answer.message;
            } catch (error) {
                ownersFailure.value = describe(error);
            }
        },

        loadPublished: loadPublishedRecords,

        async check(request: PagesTarget): Promise<PagesPreflight | null> {
            if (bridge === null) return null;
            checking.value = true;
            preflightFailure.value = null;
            // Cleared, not kept: a stale report beside a changed repository name is how
            // somebody reads "this branch is yours" about a repository they just typed over.
            preflight.value = null;
            try {
                const answer = await bridge.preflight(request);
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

        async publish(request: PagesPublishRequest): Promise<PagesResult | null> {
            if (bridge === null) return null;
            starting.value = true;
            startFailure.value = null;
            try {
                const result = await bridge.publish(request);
                if (!result.ok && byId.value[request.renderId] === undefined) {
                    startFailure.value = result.failure;
                }
                if (result.ok) await loadPublishedRecords();
                return result;
            } catch (error) {
                startFailure.value = {
                    code: "bridge",
                    message: describe(error),
                    detail: null,
                    needsGhSignIn: false,
                };
                return null;
            } finally {
                starting.value = false;
            }
        },

        async stopPublishing(renderId: string): Promise<boolean> {
            if (bridge === null) return false;
            put({ ...rowFor(renderId), stopping: true });
            return await bridge.cancel(renderId);
        },

        async removeHosting(request: PagesTarget): Promise<boolean> {
            if (bridge === null) return false;
            stopFailure.value = null;
            try {
                const result = await bridge.removeHosting(request);
                if (!result.ok) {
                    stopFailure.value = result.failure.message;
                    return false;
                }
                await loadPublishedRecords();
                return true;
            } catch (error) {
                stopFailure.value = describe(error);
                return false;
            }
        },

        dispose(): void {
            unsubscribe?.();
        },
    };
}
