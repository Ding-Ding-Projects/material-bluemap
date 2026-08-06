/**
 * Every render in progress, on every route this application can run one on, in one list.
 *
 * ## The defect this exists to fix, and the one it does not
 *
 * "Navigate away and the render is lost" reads as one bug and is actually two very
 * different ones, and the fix for this file is only the smaller of them:
 *
 *  - **The render itself does not stop.** `main/render/orchestrator.ts` holds every running
 *    render in a `Map` that belongs to the *main process*, keyed by render id, completely
 *    independent of any window, tab or Vue component. `render/ipc.ts` broadcasts every
 *    event to every window (`BrowserWindow.getAllWindows()`), and `WorldScreen.vue`'s
 *    `onBeforeUnmount` calls `run.dispose()`, which only calls `bridge.onRenderEvent`'s own
 *    unsubscribe function - it never calls `cancelRender`. A container render survives the
 *    whole application closing, because Docker's daemon owns the container's lifetime and
 *    `docker run` was only ever the client. Closing the tab that was watching a render, or
 *    the app itself for a container render, does not touch the work.
 *  - **The *view* of it is what was lost**, because the progress, phase and log lines lived
 *    in `createRenderRun()`'s own reactive refs, which are private to the component that
 *    constructed them and are garbage the moment that component unmounts. There was no
 *    place to go and look, so a render that was still going looked exactly like one that
 *    had vanished.
 *
 * This file is the second fix: a place that always knows what is running, independent of
 * which screen (if any) is currently watching it, so navigating away never again means
 * losing sight of a render that is still going.
 *
 * ## Three routes, three very different discovery problems
 *
 * - **Local.** A render process is a direct child of this application (`render/runner.ts`
 *   deliberately puts no shell between the two, precisely so a killed app cannot leave an
 *   orphan). So a local render genuinely does *not* survive the app closing - there is
 *   nothing left to discover after a restart, only a session file saying it was cut off.
 *   While the app is running, `render:active` names every one this instance's own
 *   orchestrator is driving, and this file watches each with the same {@link createRenderRun}
 *   `WorldScreen.vue` already uses, so the numbers can never disagree between the two.
 * - **Container (Docker, local or over SSH).** The opposite: `docker run` is a client and
 *   the daemon owns the container, so it keeps rendering after the app that started it is
 *   gone. `main/runtime/reattach.ts`'s `ContainerReattacher` is the machinery that finds one
 *   again on the next launch - built, wired to `runtime:containers`/`runtime:reattach`, and
 *   until this page existed, reachable from exactly one place: the "containers left running"
 *   panel inside `WorldScreen.vue`, which only a person who happened to open the Make-a-map
 *   tab would ever see. This file surfaces the same offers everywhere, and promotes an
 *   accepted offer into a tracked row the moment it is reattached.
 * - **GitHub's runners.** Independent of this application entirely: the render is running on
 *   somebody else's computer, and its status is whatever `checkCiRender`/`listCiRenders`
 *   read from the run right now. `components/cirender/ciRenders.ts` already tracks this
 *   fully - `reconcile()` finds a sync in flight anywhere, `loadKnown()` finds one recorded
 *   on disk - so this file reuses that composable rather than polling GitHub a second way.
 *
 * ## Nothing here re-derives progress
 *
 * A local or container row's `facts` come from the exact same {@link createRenderRun}
 * instance the render console itself is built on; a CI row's come from
 * `progress/ciProgress.ts`'s `ciProgressFacts`, the same function `RenderProgressDetail.vue`
 * already draws for the CI screen. A percentage, an ETA or a phase name computed a second
 * way here is a second way for the two screens to disagree about the same render.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import type {
    ContainerOffer,
    ContainerOffersBridge,
    ReattachResult,
} from "../world/containerOffers.js";
import { resolveContainerOffersBridge } from "../world/containerOffers.js";
import { createRenderRun, type RenderRun } from "../world/renderRun.js";
import type { RenderEvent, RenderSummary, WorldBridge } from "../world/worldBridge.js";
import { resolveWorldBridge } from "../world/worldBridge.js";
import { worldFolderName, type CiRenders, type CiRow } from "../cirender/ciRenders.js";
import { ciProgressFacts } from "../progress/ciProgress.js";
import { EMPTY_FACTS, type ProgressFacts, type ProgressRoute } from "../progress/progressModel.js";

/** The three routes this page groups every render under. */
export type RenderRouteBucket = "local" | "docker" | "ci";

/** `remote` (a container reached over SSH) is still the container family for this list. */
export function bucketOfRoute(route: ProgressRoute | null): RenderRouteBucket | null {
    switch (route) {
        case "local":
            return "local";
        case "docker":
        case "remote":
            return "docker";
        case "actions":
            return "ci";
        default:
            return null;
    }
}

export type RowState = "starting" | "running" | "finished" | "failed" | "cancelled" | "offer";

/** Running first, then the endings, newest first inside a rank. Offers rank with running. */
const STATE_RANK: Readonly<Record<RowState, number>> = {
    starting: 0,
    running: 0,
    offer: 0,
    failed: 1,
    cancelled: 2,
    finished: 3,
};

export interface ActiveRenderRow {
    /** Unique across the whole page: `local:<id>`, `docker:<id>`, `ci:<syncId>`. */
    readonly key: string;
    readonly renderId: string;
    readonly route: RenderRouteBucket;
    /** `this computer`, `renderer@host:2222`, a repository full name - whichever the route has. */
    readonly routeDetail: string | null;
    readonly worldLabel: string;
    readonly projectLabel: string;
    readonly state: RowState;
    readonly facts: ProgressFacts;
    /** The overall level's percent, or null when the size is genuinely unknown. */
    readonly percent: number | null;
    readonly errorText: string | null;
    readonly startedAtMs: number | null;
    readonly canCancel: boolean;
    readonly canOpenConsole: boolean;
    /** True for a container this app found running but has not picked back up yet. */
    readonly needsReattach: boolean;
    readonly reattachMessage: string | null;
    /** True while a cancel or reattach for this row is in flight. */
    readonly busy: boolean;
}

/** Where "open console" actually sends somebody, so the shell can drive real navigation. */
export interface ConsoleTarget {
    readonly page: "world" | "cirender";
    /** The render id to focus once the page is open, when the page can be told one. */
    readonly focusRenderId: string | null;
}

export type EmptyStateKind = "checking" | "empty" | "has-rows";

/** Text a search bar can match against, independent of the language this row is shown in. */
export function searchTextOf(row: ActiveRenderRow): string {
    return [
        row.worldLabel,
        row.projectLabel,
        row.routeDetail ?? "",
        row.renderId,
        row.state,
        row.errorText ?? "",
    ]
        .join(" • ")
        .toLowerCase();
}

export function sortRows(rows: readonly ActiveRenderRow[]): ActiveRenderRow[] {
    return [...rows].sort((left, right) => {
        const rank = STATE_RANK[left.state] - STATE_RANK[right.state];
        if (rank !== 0) return rank;
        const leftAt = left.startedAtMs ?? 0;
        const rightAt = right.startedAtMs ?? 0;
        if (leftAt !== rightAt) return rightAt - leftAt;
        return left.key.localeCompare(right.key);
    });
}

/** The label a render is found under: the map name(s), or the id when nothing else is known. */
function projectLabelOf(maps: readonly { readonly name: string }[], fallback: string): string {
    if (maps.length === 0) return fallback;
    return maps.map((map) => map.name).join(", ");
}

function worldLabelOf(maps: readonly { readonly world: string }[], fallback: string): string {
    const first = maps[0];
    if (first === undefined) return fallback;
    const name = worldFolderName(first.world);
    return name === "" ? fallback : name;
}

function overallPercentOf(facts: ProgressFacts): number | null {
    const overall = facts.levels.find((level) => level.id === "overall");
    return overall?.percent ?? null;
}

/* -------------------------------------------------------------------------- */
/* Local and docker: watched with the exact same `createRenderRun` the console uses */
/* -------------------------------------------------------------------------- */

interface LocalTrack {
    readonly renderId: string;
    readonly run: RenderRun;
    seed: RenderSummary | null;
    reattached: boolean;
    reattachBusy: boolean;
    reattachMessage: string | null;
}

function trackToRow(track: LocalTrack): ActiveRenderRow {
    const run = track.run;
    const seed = track.seed;
    const maps = seed?.maps ?? [];
    const idFallback = track.renderId;
    const runtime = seed?.runtime ?? (run.engine.value === null ? null : "local");
    const bucket: RenderRouteBucket = runtime === "docker" ? "docker" : "local";
    const facts = run.progress.value;

    // `run.state` only ever leaves "starting" for "running" on a `started` event, which a
    // render adopted mid-flight (`expect()`, exactly what a watched render or a reattached
    // container is) never receives - that event already happened before this row was
    // watching. Any *other* event arriving is still proof the render is genuinely running,
    // so a row does not sit reading "starting" forever for something plainly in progress.
    const state: RowState =
        run.state.value === "idle"
            ? "starting"
            : run.state.value === "starting" && facts.lastEventAtMs !== null
              ? "running"
              : run.state.value;
    const failure = run.failure.value;

    return {
        key: `${bucket}:${track.renderId}`,
        renderId: track.renderId,
        route: bucket,
        routeDetail: bucket === "docker" ? "this computer" : null,
        worldLabel: worldLabelOf(maps, idFallback),
        projectLabel: projectLabelOf(maps, idFallback),
        state,
        facts,
        percent: overallPercentOf(facts),
        errorText:
            failure === null
                ? track.reattachMessage
                : failure.detail === null
                  ? failure.message
                  : `${failure.message} ${failure.detail}`,
        startedAtMs: facts.startedAtMs,
        canCancel: run.active.value,
        canOpenConsole: true,
        needsReattach: false,
        reattachMessage: null,
        busy: run.cancelling.value || track.reattachBusy,
    };
}

/* -------------------------------------------------------------------------- */
/* The aggregator                                                             */
/* -------------------------------------------------------------------------- */

export interface ActiveRendersOptions {
    readonly worldBridge?: WorldBridge | null;
    readonly containerOffersBridge?: ContainerOffersBridge | null;
    /** The CI-render composable, shared or freshly built - see `createCiRenders`. */
    readonly ciRenders?: CiRenders | null;
    /** How often the three routes are re-polled, in milliseconds. */
    readonly pollIntervalMs?: number;
}

export interface ActiveRenders {
    readonly rows: ComputedRef<readonly ActiveRenderRow[]>;
    /** True once the first pass over all three routes has completed. */
    readonly checked: Ref<boolean>;
    readonly emptyState: ComputedRef<EmptyStateKind>;
    readonly available: boolean;
    readonly canCancel: boolean;

    /** Polls all three routes once. Safe to call repeatedly; never throws. */
    reconcile(): Promise<void>;
    /** Where "open its console" should send somebody, for a row's key. */
    consoleTargetFor(key: string): ConsoleTarget | null;
    /** Cancels (or, for an offer, stops) the render behind one row. */
    cancel(key: string): Promise<boolean>;
    /** Picks a container offer back up. Returns false for a key that is not an offer. */
    reattach(key: string): Promise<boolean>;
    /** Starts (or stops, when already going) the periodic poll. */
    dispose(): void;
}

const DEFAULT_POLL_INTERVAL_MS = 6_000;

export function createActiveRenders(options: ActiveRendersOptions = {}): ActiveRenders {
    const worldBridge =
        options.worldBridge === undefined ? resolveWorldBridge() : options.worldBridge;
    const containerOffersBridge =
        options.containerOffersBridge === undefined
            ? resolveContainerOffersBridge()
            : options.containerOffersBridge;
    const ciRenders = options.ciRenders ?? null;

    const checked = ref(false);
    const localIds = ref<readonly string[]>([]);
    const localTracks = new Map<string, LocalTrack>();

    const offers = ref<readonly ContainerOffer[]>([]);
    const offerBusy = ref<Readonly<Record<string, boolean>>>({});
    const offerFailures = ref<Readonly<Record<string, string>>>({});

    /** Bumped to force `rows` to re-evaluate after a Map mutation Vue cannot see on its own. */
    const generation = ref(0);
    function bump(): void {
        generation.value++;
    }

    function ensureTrack(renderId: string): LocalTrack {
        const existing = localTracks.get(renderId);
        if (existing !== undefined) return existing;
        const run = createRenderRun(worldBridge);
        run.expect(renderId);
        const track: LocalTrack = {
            renderId,
            run,
            seed: null,
            reattached: false,
            reattachBusy: false,
            reattachMessage: null,
        };
        localTracks.set(renderId, track);
        void seedTrack(track);
        return track;
    }

    async function seedTrack(track: LocalTrack): Promise<void> {
        if (worldBridge === null) return;
        try {
            const summary = await worldBridge.renderEngine(track.renderId);
            if (summary !== null) track.seed = summary;
        } catch {
            // The live event stream still names the maps once a `started` event arrives;
            // losing the seed only delays the world/project label, never the render itself.
        }
        bump();
    }

    /** A raw listener beside every per-render one, so a render started or reattached in
     * another window is picked up the moment it announces itself rather than waiting for
     * the next poll. See the file header on why `render:active` alone cannot see a
     * container reattached elsewhere in this same process. */
    const unsubscribeRaw =
        worldBridge === null
            ? null
            : worldBridge.onRenderEvent((event: RenderEvent) => {
                  if (event.type !== "started") return;
                  if (localTracks.has(event.renderId)) return;
                  ensureTrack(event.renderId);
                  localIds.value = localIds.value.includes(event.renderId)
                      ? localIds.value
                      : [...localIds.value, event.renderId];
              });

    function pruneFinishedTracks(activeIds: readonly string[]): void {
        const stillActive = new Set(activeIds);
        for (const [renderId, track] of [...localTracks]) {
            if (stillActive.has(renderId)) continue;
            if (track.run.active.value) continue; // still starting/running by its own account
            // Kept for one more pass so a render that just finished still shows its result;
            // dropped once its state is a genuine ending and it has fallen off the active list.
            const state = track.run.state.value;
            if (state === "finished" || state === "failed" || state === "cancelled") {
                track.run.dispose();
                localTracks.delete(renderId);
            }
        }
    }

    async function reconcileLocal(): Promise<void> {
        if (worldBridge === null) return;
        let active: readonly string[] = [];
        try {
            active = await worldBridge.activeRenders();
        } catch {
            return;
        }
        for (const renderId of active) ensureTrack(renderId);
        localIds.value = [...new Set([...localIds.value, ...active])];
        pruneFinishedTracks(active);
        bump();
    }

    async function reconcileContainers(): Promise<void> {
        if (containerOffersBridge === null) return;
        try {
            const scan = await containerOffersBridge.containerOffers();
            offers.value = scan.offers.filter((offer) => !localTracks.has(offer.renderId));
        } catch {
            // Not knowing about a container out there is not worth failing the whole
            // reconciliation over; the other two routes still get their answer.
        }
    }

    async function reconcileCi(): Promise<void> {
        if (ciRenders === null) return;
        await ciRenders.reconcile();
        await ciRenders.loadKnown();
    }

    async function reconcile(): Promise<void> {
        await Promise.all([reconcileLocal(), reconcileContainers(), reconcileCi()]);
        checked.value = true;
    }

    function offerToRow(offer: ContainerOffer): ActiveRenderRow {
        const key = `docker:${offer.renderId}`;
        return {
            key,
            renderId: offer.renderId,
            route: "docker",
            routeDetail: offer.where,
            worldLabel: offer.mapIds.length > 0 ? offer.mapIds.join(", ") : offer.renderId,
            projectLabel: offer.mapIds.length > 0 ? offer.mapIds.join(", ") : offer.renderId,
            state: "offer",
            facts: EMPTY_FACTS,
            percent: null,
            errorText: offerFailures.value[offer.renderId] ?? null,
            startedAtMs: Date.parse(offer.startedAt) || null,
            canCancel: offer.canResume || offer.state === "running",
            canOpenConsole: false,
            needsReattach: true,
            reattachMessage: offer.message,
            busy: offerBusy.value[offer.renderId] === true,
        };
    }

    function ciRowToFacts(row: CiRow): ProgressFacts {
        return ciProgressFacts({
            phase: row.phase,
            run: row.run,
            active: row.state === "running",
            startedAt: row.startedAt,
            preflight: null,
        });
    }

    function ciToRow(row: CiRow): ActiveRenderRow {
        const facts = ciRowToFacts(row);
        const state: RowState =
            row.state === "rendered" ? "finished" : row.state === "running" ? "running" : row.state;
        const failure = row.failure;
        return {
            key: `ci:${row.syncId}`,
            renderId: row.syncId,
            route: "ci",
            routeDetail: row.repository === "" ? null : row.repository,
            worldLabel: row.worldFolder === "" ? row.syncId : worldFolderName(row.worldFolder),
            projectLabel: row.mapId === "" ? row.syncId : row.mapId,
            state,
            facts,
            percent: overallPercentOf(facts),
            errorText:
                failure === null
                    ? null
                    : failure.detail === null
                      ? failure.message
                      : `${failure.message} ${failure.detail}`,
            startedAtMs: row.startedAt === null ? null : Date.parse(row.startedAt) || null,
            canCancel: (ciRenders?.canCancel ?? false) && row.state === "running",
            canOpenConsole: true,
            needsReattach: false,
            reattachMessage: null,
            busy: row.stopping,
        };
    }

    const rows = computed<readonly ActiveRenderRow[]>(() => {
        // Read so this computed re-runs on a mutation to the tracked-id/offer/generation
        // refs, even though the interesting state lives one level down inside each track.
        void generation.value;
        void localIds.value;

        const built: ActiveRenderRow[] = [];
        for (const renderId of localIds.value) {
            const track = localTracks.get(renderId);
            if (track !== undefined) built.push(trackToRow(track));
        }
        for (const offer of offers.value) built.push(offerToRow(offer));
        if (ciRenders !== null) for (const row of ciRenders.rows.value) built.push(ciToRow(row));
        return sortRows(built);
    });

    const emptyState = computed<EmptyStateKind>(() => {
        if (!checked.value) return "checking";
        return rows.value.length === 0 ? "empty" : "has-rows";
    });

    function consoleTargetFor(key: string): ConsoleTarget | null {
        const row = rows.value.find((candidate) => candidate.key === key);
        if (row === undefined || !row.canOpenConsole) return null;
        return row.route === "ci"
            ? { page: "cirender", focusRenderId: null }
            : { page: "world", focusRenderId: row.renderId };
    }

    async function cancel(key: string): Promise<boolean> {
        const row = rows.value.find((candidate) => candidate.key === key);
        if (row === undefined) return false;

        if (row.needsReattach) {
            if (containerOffersBridge === null) return false;
            offerBusy.value = { ...offerBusy.value, [row.renderId]: true };
            try {
                const stopped = await containerOffersBridge.cancelContainer(row.renderId);
                if (stopped)
                    offers.value = offers.value.filter((offer) => offer.renderId !== row.renderId);
                return stopped;
            } finally {
                const rest = { ...offerBusy.value };
                delete rest[row.renderId];
                offerBusy.value = rest;
            }
        }

        if (row.route === "ci") {
            if (ciRenders === null) return false;
            return await ciRenders.stop(row.renderId);
        }

        const track = localTracks.get(row.renderId);
        if (track === undefined) return false;
        return await track.run.cancel();
    }

    async function reattach(key: string): Promise<boolean> {
        const row = rows.value.find((candidate) => candidate.key === key);
        if (row === undefined || !row.needsReattach || containerOffersBridge === null) return false;

        offerBusy.value = { ...offerBusy.value, [row.renderId]: true };
        try {
            const result: ReattachResult = await containerOffersBridge.reattachContainer(
                row.renderId,
            );
            if (result.ok) {
                offers.value = offers.value.filter((offer) => offer.renderId !== row.renderId);
                ensureTrack(row.renderId);
                localIds.value = localIds.value.includes(row.renderId)
                    ? localIds.value
                    : [...localIds.value, row.renderId];
                bump();
                return true;
            }
            offerFailures.value = { ...offerFailures.value, [row.renderId]: result.message };
            return false;
        } catch (error) {
            offerFailures.value = {
                ...offerFailures.value,
                [row.renderId]: error instanceof Error ? error.message : String(error),
            };
            return false;
        } finally {
            const rest = { ...offerBusy.value };
            delete rest[row.renderId];
            offerBusy.value = rest;
        }
    }

    let timer: ReturnType<typeof setInterval> | null = null;
    const interval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    if (worldBridge !== null || containerOffersBridge !== null || ciRenders !== null) {
        timer = setInterval(() => {
            void reconcile();
        }, interval);
    }

    return {
        rows,
        checked,
        emptyState,
        available: worldBridge !== null || containerOffersBridge !== null || ciRenders !== null,
        canCancel: true,
        reconcile,
        consoleTargetFor,
        cancel,
        reattach,
        dispose(): void {
            if (timer !== null) clearInterval(timer);
            timer = null;
            unsubscribeRaw?.();
            for (const track of localTracks.values()) track.run.dispose();
            localTracks.clear();
        },
    };
}
