/**
 * Finding a render that was cut off, and starting it again where it stopped.
 *
 * ## Resuming is a re-run, not a replay
 *
 * There is no checkpoint format here and there is deliberately none. BlueMap's storage is
 * incremental: `<map>/rstate/` holds `MapTileState`, `MapChunkState` and `MapRegionState`
 * as small per-region cells, and a plain `-r` re-run asks `TileActionResolver` what each
 * tile needs and renders only that. A render that got 60% of the way through a world and
 * died has 60% of the world on disk *and* the bookkeeping that says so.
 *
 * So a resume is the same render, run again, with two rules:
 *
 * 1. **Destroy nothing.** No deleting the output, no clearing `rstate`, and no `-f`.
 *    Every one of those turns a resume back into a full render, which is the exact
 *    outcome the feature exists to avoid. The orchestrator already never deletes; the
 *    request built here simply does not ask it to.
 * 2. **Same settings, or no resume.** Rendering the same map with different settings on
 *    top of tiles produced by the old ones gives a map that is half one thing and half
 *    the other, with nothing anywhere to say so. `session.ts` records a hash of the
 *    settings; a mismatch is refused, in words that name what to do about it.
 *
 * ## What counts as interrupted
 *
 * A session is written `running` and finished `completed` or `interrupted`. A session
 * still saying `running` when it is read by a *different* app instance therefore describes
 * a render whose app never got to finish the sentence: it crashed, or the machine went
 * down. That is detected on launch, written back so the file stops lying, and offered.
 *
 * It is offered, and never acted on. Silently restarting hours of rendering on somebody's
 * machine because they opened the app is not a favour, and silently discarding the record
 * throws away the only evidence that the work exists. The interface asks.
 */

import type { RenderMapRequest } from "./config.js";
import type { RenderRequest } from "./orchestrator.js";
import { RENDER_ENGINE_LABELS } from "./provenance.js";
import { renderConfigFingerprint } from "./session.js";
import type {
    RenderInterruptionReason,
    RenderSession,
    RenderSessionMap,
    RenderSessionStore,
} from "./session.js";

/**
 * What the interface is told about a render it could offer to resume.
 *
 * Plain data, because it crosses IPC. It carries how far the render got rather than only
 * that it stopped: "interrupted at 62.4% of updating map 'overworld'" is an offer somebody
 * can weigh, and "there is an unfinished render" is not.
 */
export interface InterruptedRenderSummary {
    readonly renderId: string;
    readonly reason: RenderInterruptionReason;
    readonly maps: readonly RenderSessionMap[];
    readonly startedAt: string;
    /** When it stopped. Null for a crash, which never got to write one. */
    readonly interruptedAt: string | null;
    /** The last percentage seen, or null when it died before the first progress line. */
    readonly percent: number | null;
    /** Upstream's own wording for what it was doing, e.g. `updating map 'overworld'`. */
    readonly description: string | null;
    /** e.g. `BlueMap engine (Java) 5.22-27 on Java 25.0.3`. */
    readonly engine: string;
    /** One sentence for the offer. Facts only; the interface styles it. */
    readonly message: string;
}

export interface InterruptedRender {
    readonly summary: InterruptedRenderSummary;
    readonly session: RenderSession;
}

/**
 * The state a session is *actually* in, as opposed to the one it last managed to write.
 *
 * The only case where the two differ is a session left `running` by an app that is gone.
 * `instanceId` is the current app instance; see the note in `session.ts` about why that,
 * and not a process id, is the test.
 */
export function observedStatus(
    session: RenderSession,
    instanceId: string,
): "running" | "completed" | "interrupted" {
    if (session.status !== "running") return session.status;
    return session.ownerInstance === instanceId ? "running" : "interrupted";
}

/** True when the session describes a render this app could offer to pick up again. */
export function isResumable(session: RenderSession, instanceId: string): boolean {
    return observedStatus(session, instanceId) === "interrupted";
}

function engineLabel(session: RenderSession): string {
    const label = RENDER_ENGINE_LABELS[session.engine];
    const java = session.javaVersion === null ? "" : ` on Java ${session.javaVersion}`;
    return `${label} ${session.engineVersion}${java}`;
}

function mapNames(maps: readonly RenderSessionMap[]): string {
    const names = maps.map((map) => map.name);
    if (names.length === 0) return "a map";
    if (names.length === 1) return `'${String(names[0])}'`;
    if (names.length === 2) return `'${String(names[0])}' and '${String(names[1])}'`;
    return `${names.length} maps`;
}

/**
 * The sentence shown with the offer.
 *
 * Cancellation reads as cancellation. Somebody who pressed Cancel and is then told their
 * render "was interrupted" reasonably concludes something went wrong, and the whole point
 * of keeping the reason is that nothing did.
 */
export function describeInterrupted(
    session: RenderSession,
    reason: RenderInterruptionReason,
): string {
    const where =
        session.progress === null
            ? "before the engine reported any progress"
            : `at ${session.progress.percent.toFixed(1)}% of ${session.progress.description}`;

    switch (reason) {
        case "cancelled":
            return `You stopped rendering ${mapNames(session.maps)} ${where}. The tiles it finished are still on disk, so resuming carries on from there.`;
        case "failed":
            return `Rendering ${mapNames(session.maps)} stopped ${where}${session.detail === null ? "" : ` (${session.detail})`}. The tiles it finished are still on disk, so resuming carries on from there.`;
        default:
            return `Rendering ${mapNames(session.maps)} was cut off ${where}, without the app getting a chance to stop it. The tiles it finished are still on disk, so resuming carries on from there.`;
    }
}

export function toInterruptedSummary(
    session: RenderSession,
    reason: RenderInterruptionReason,
): InterruptedRenderSummary {
    return {
        renderId: session.renderId,
        reason,
        maps: session.maps,
        startedAt: session.startedAt,
        interruptedAt: session.endedAt,
        percent: session.progress?.percent ?? null,
        description: session.progress?.description ?? null,
        engine: engineLabel(session),
        message: describeInterrupted(session, reason),
    };
}

/**
 * Turns a session left `running` by a dead app instance into an honest `interrupted`.
 *
 * Returns the corrected session, or null when nothing needed correcting. Writing the
 * correction back matters: a record that keeps claiming a render is running is a record
 * that will be read that way by everything else, including any later code that decides
 * whether starting a render is safe.
 */
export function reconcile(
    session: RenderSession,
    instanceId: string,
    at: string,
): RenderSession | null {
    if (session.status !== "running" || session.ownerInstance === instanceId) return null;
    return {
        ...session,
        status: "interrupted",
        reason: "process-gone",
        detail:
            session.detail ??
            "The app closed while this render was running, so it never reported an outcome.",
        endedAt: session.endedAt ?? session.progress?.at ?? session.updatedAt,
        updatedAt: at,
    };
}

export interface FindInterruptedOptions {
    /** Include sessions somebody has already declined. Off by default; see `dismiss`. */
    readonly includeDismissed?: boolean;
    readonly now?: () => Date;
}

/**
 * Every render this app could offer to resume, newest first.
 *
 * Reconciles as it goes, so calling it on launch both answers the question and stops the
 * files claiming something that is no longer true. It is safe to call repeatedly: the
 * correction is idempotent, and a session already marked `interrupted` is left alone.
 */
export async function findInterruptedRenders(
    store: RenderSessionStore,
    options: FindInterruptedOptions = {},
): Promise<InterruptedRender[]> {
    const at = (options.now?.() ?? new Date()).toISOString();
    const found: InterruptedRender[] = [];

    for (const stored of await store.list()) {
        const corrected = reconcile(stored, store.instanceId, at);
        if (corrected !== null) await store.put(corrected);
        const session = corrected ?? stored;

        if (session.status !== "interrupted") continue;
        if (session.dismissed && options.includeDismissed !== true) continue;

        const reason: RenderInterruptionReason = session.reason ?? "process-gone";
        found.push({ summary: toInterruptedSummary(session, reason), session });
    }

    return found;
}

export type ResumeRefusalCode =
    | "no-session"
    | "not-interrupted"
    | "already-running"
    | "config-changed";

export interface ResumePlan {
    readonly ok: true;
    readonly renderId: string;
    /** Exactly what to hand `RenderOrchestrator.render`. Never carries `force`. */
    readonly request: RenderRequest;
    readonly session: RenderSession;
    readonly summary: string;
}

export interface ResumeRefused {
    readonly ok: false;
    readonly renderId: string;
    readonly code: ResumeRefusalCode;
    /** Says what is wrong and what would fix it. Shown as written. */
    readonly message: string;
}

export type ResumeDecision = ResumePlan | ResumeRefused;

/**
 * The render request that continues a session: the same maps, and no `-f`.
 *
 * "The same maps" includes the config body each was started with. A resume rewrites the
 * config directory and runs the engine over it again, so dropping the body here would
 * carry a ninety-key render on with a six-key file - producing exactly the half-one,
 * half-the-other map that `config-changed` refuses when a *person* changes the settings.
 */
export function resumeRequestFor(session: RenderSession): RenderRequest {
    return {
        renderId: session.renderId,
        maps: session.maps.map((map) => ({
            id: map.id,
            world: map.world,
            name: map.name,
            dimension: map.dimension,
            ...(map.config === undefined ? {} : { config: map.config }),
        })),
        // Stated rather than left out. `-f` re-renders everything and would throw away
        // precisely the work this is here to keep.
        force: false,
        // Carried, so a container render is carried on **in a container**. Leaving it out
        // would resume it locally without saying so, which is exactly the silent
        // substitution the runtime choice refuses everywhere else - and the tiles would be
        // half one runtime's and half the other's with nothing on screen to say so.
        // Absent on a session written before the field existed, and absent means local,
        // which is what those renders were.
        ...(session.runtime === undefined ? {} : { runtime: session.runtime }),
    };
}

export interface PlanResumeOptions {
    /**
     * The maps to resume with, when the caller has its own idea of them.
     *
     * Omitted, the session's own maps are used and the check below is a formality that
     * always passes. Supplied, it is the real check: this is where a person who changed
     * the dimension, renamed a map, pointed it at a different world folder or edited any
     * of the ninety-odd settings in its config body since the render died gets told that
     * those tiles and these settings do not belong together.
     */
    readonly maps?: readonly RenderMapRequest[];
    /** True when a render is already in flight under this id. */
    readonly running?: boolean;
}

/**
 * Decides whether a session can be resumed, and with what.
 *
 * Pure, and returns a value rather than throwing, for the same reason `render()` does:
 * every outcome here is something the interface has to show, and an exception would have
 * to be turned back into this shape by every caller.
 */
export function planResume(
    session: RenderSession | null,
    options: PlanResumeOptions = {},
): ResumeDecision {
    if (session === null) {
        return {
            ok: false,
            renderId: "",
            code: "no-session",
            message: "There is no record of that render, so there is nothing to carry on from.",
        };
    }

    if (options.running === true) {
        return {
            ok: false,
            renderId: session.renderId,
            code: "already-running",
            message: "That render is already going. Watch it rather than starting it again.",
        };
    }

    if (session.status === "completed") {
        return {
            ok: false,
            renderId: session.renderId,
            code: "not-interrupted",
            message:
                "That render finished. Rendering it again would only look for changes since; " +
                "there is nothing to resume.",
        };
    }

    if (session.status !== "interrupted") {
        return {
            ok: false,
            renderId: session.renderId,
            code: "not-interrupted",
            message: "That render is not in a state that can be carried on from.",
        };
    }

    const requested = options.maps;
    if (requested !== undefined) {
        const fingerprint = renderConfigFingerprint(requested);
        if (fingerprint !== session.configHash) {
            return {
                ok: false,
                renderId: session.renderId,
                code: "config-changed",
                message:
                    "The map settings have changed since this render was started, so it cannot " +
                    "be carried on. The tiles already on disk were rendered from the old " +
                    "settings, and rendering the new ones on top of them would produce a map " +
                    "that is half one and half the other with nothing to show which is which. " +
                    "Either put the settings back to what they were, or start a fresh render, " +
                    `which will redo the work. (Recorded ${session.configHash.slice(0, 12)}, ` +
                    `now ${fingerprint.slice(0, 12)}.)`,
            };
        }
    }

    const reason: RenderInterruptionReason = session.reason ?? "process-gone";
    return {
        ok: true,
        renderId: session.renderId,
        request: resumeRequestFor(session),
        session,
        summary: describeInterrupted(session, reason),
    };
}
