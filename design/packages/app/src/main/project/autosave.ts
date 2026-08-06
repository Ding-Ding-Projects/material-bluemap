/**
 * Autosave: turning "the project changed in memory" into a scheduled, debounced snapshot
 * through the exact write-then-record path a manual Save already uses.
 *
 * Nothing about *saving* is reinvented here. {@link saveProject} still writes the file
 * atomically and then records exactly one revision through the append-only history engine in
 * `../history/`; a broken history write still cannot fail the write; a project's settings are
 * still snapshotted whole, because they already live inside the one file `saveProject` writes
 * - a project embeds its `core`/`webapp`/`webserver`/`plugin` bodies as text, so there is no
 * second, external config a restore could drift away from. This module is only the scheduler
 * in front of that: it decides *when* to call it automatically, so a person editing a project
 * never has to remember to press Save to be protected.
 *
 * ## Debounced, on a quiet interval, with a ceiling
 *
 * A keystroke does not autosave. {@link ProjectAutosaveEngine.notifyChange} restarts a timer
 * every time it is called, and only once that timer goes quiet for {@link
 * DEFAULT_AUTOSAVE_QUIET_MS} does a write actually happen - so a burst of edits made while
 * someone is actively typing coalesces into the *one* write that reflects where they stopped,
 * not a row per keystroke. Nobody wants a history with four hundred entries in it; the whole
 * value of a revision list is that each row is something that happened.
 *
 * The reverse failure mode is just as real: someone who keeps editing without ever pausing for
 * the full quiet interval would never autosave at all under a pure debounce, which is exactly
 * backwards - continuous editing for ninety seconds is ninety seconds of unprotected work.
 * {@link DEFAULT_AUTOSAVE_MAX_WAIT_MS} is the ceiling that forces a write anyway once a pending
 * change has waited long enough, however busy the quiet timer stays.
 *
 * ## An unchanged project schedules nothing
 *
 * {@link ProjectAutosaveEngine.notifyChange} compares the incoming project's serialized text
 * against the text this engine last wrote (or, before any write, against nothing - so the
 * first real edit always schedules). A call that describes no change from that baseline is a
 * no-op: no timer starts, and if a change that *had* been pending is undone before its timer
 * fires, the pending write is cancelled rather than committed. This is the same discipline
 * `history/repository.ts` already applies at the git layer - "an unchanged state records
 * nothing" - applied one layer earlier, so a no-op edit never even reaches a file write.
 *
 * ## Boundaries flush immediately, and so does a destructive action or quitting
 *
 * Waiting out the debounce is right for ordinary typing and wrong for a moment that matters:
 * a field just got committed, a dialog just closed, the user just switched to another project,
 * the window just lost focus, something irreversible is about to happen, or the application is
 * about to quit. {@link ProjectAutosaveEngine.flush} writes whatever is pending for one world
 * right away, cancelling its debounce timer rather than waiting for it. {@link
 * ProjectAutosaveEngine.flushAll} does the same for every world this engine is tracking, which
 * is what a quit handler needs: nothing pending is worth losing to a process that is about to
 * exit. {@link wireAutosaveQuitFlush} is the small adapter that hooks that into Electron's own
 * `before-quit` event without this module importing Electron for anything but a type.
 *
 * ## A failed autosave never fails the edit that triggered it
 *
 * `saveProject` already turns a broken history into `{ ok: true, historyOk: false, ... }`
 * rather than a rejection, and this engine passes that value straight through to whoever is
 * listening via {@link ProjectAutosaveOptions.onAutosave}. The belt-and-braces `try`/`catch`
 * around the injected `save` function exists only for the seam a test uses to prove the
 * property, not because `saveProject` is expected to reject - nothing calling `notifyChange`
 * or `flush` can be taken down by a write that goes wrong, automatic or not.
 */

import { serializeProjectFile, type ProjectFile } from "@material-bluemap/config";

import { saveProject, type ProjectSaveOptions, type ProjectSaveResult } from "./save.js";

/** How long an edit has to go quiet before it autosaves. */
export const DEFAULT_AUTOSAVE_QUIET_MS = 15_000;

/** The longest a pending edit is left un-persisted while further edits keep arriving. */
export const DEFAULT_AUTOSAVE_MAX_WAIT_MS = 90_000;

/**
 * Why one autosave happened.
 *
 * `quiet` is the debounce (or its ceiling) firing on its own; everything else is a caller
 * asking for an immediate flush. The distinction matters to whoever is deciding whether an
 * autosave deserves an interruption: a `quiet` tick is exactly the ambient, unattended kind of
 * event the project's non-blocking-notification rules say belongs quietly in a history panel
 * rather than in a toast, where `destructive` and `quit` are the ones worth being certain about.
 */
export type AutosaveReason = "quiet" | "boundary" | "destructive" | "quit";

/** What one autosave attempt produced, and why it was attempted. */
export interface AutosaveOutcome {
    readonly worldFolder: string;
    readonly reason: AutosaveReason;
    readonly result: ProjectSaveResult;
}

export type AutosaveListener = (outcome: AutosaveOutcome) => void;

export interface ProjectAutosaveOptions extends ProjectSaveOptions {
    /** How long an edit has to go quiet before it autosaves. Defaults to {@link DEFAULT_AUTOSAVE_QUIET_MS}. */
    readonly quietMs?: number;
    /** The ceiling on how long a pending edit waits. Defaults to {@link DEFAULT_AUTOSAVE_MAX_WAIT_MS}. */
    readonly maxWaitMs?: number;
    /** Told about every attempt, automatic or flushed, successful or not. */
    readonly onAutosave?: AutosaveListener;
    /**
     * The write-and-record call this engine schedules. Defaults to {@link saveProject}.
     *
     * Injected so a test can watch every call this engine makes, and can reproduce a `save`
     * that rejects outright - which `saveProject` itself never does - to prove the scheduler
     * survives even that.
     */
    readonly save?: (
        options: ProjectSaveOptions,
        worldFolder: string,
        project: ProjectFile,
    ) => Promise<ProjectSaveResult>;
}

export interface ProjectAutosaveEngine {
    /**
     * Tells the engine the project for one world now looks like this.
     *
     * Restarts the debounce timer. A call whose text matches this engine's last known baseline
     * is a no-op: it starts nothing, and if it exactly cancels out a write that was already
     * pending, that pending write is dropped rather than committed.
     */
    notifyChange(worldFolder: string, project: ProjectFile): void;
    /**
     * Writes whatever is pending for one world immediately, instead of waiting for the debounce.
     *
     * A no-op when nothing is pending: the world's baseline already matches what would be
     * written, so there is genuinely nothing to record, and calling this at every boundary
     * unconditionally must not manufacture a revision that says otherwise.
     */
    flush(worldFolder: string, reason: Exclude<AutosaveReason, "quiet">): Promise<ProjectSaveResult | null>;
    /** {@link flush}, for every world this engine currently has pending edits for. */
    flushAll(reason: Exclude<AutosaveReason, "quiet">): Promise<void>;
    /** Whether one world has an edit waiting to be written. */
    hasPendingFor(worldFolder: string): boolean;
    /** Whether *any* world has an edit waiting to be written. What a quit handler checks. */
    hasAnyPending(): boolean;
    /** Cancels every pending timer without writing. Only for shutting the engine down. */
    dispose(): void;
}

interface WorldEntry {
    /** The project waiting to be written, or null when nothing is pending. */
    pending: ProjectFile | null;
    /** The serialized text of the project as this engine last wrote it, or null before any write. */
    baseline: string | null;
    timer: ReturnType<typeof setTimeout> | null;
    ceiling: ReturnType<typeof setTimeout> | null;
    /** Every write for one world is serialized after the one before it, so none can overlap. */
    chain: Promise<void>;
}

function freshEntry(): WorldEntry {
    return { pending: null, baseline: null, timer: null, ceiling: null, chain: Promise.resolve() };
}

function clearTimers(entry: WorldEntry): void {
    if (entry.timer !== null) clearTimeout(entry.timer);
    if (entry.ceiling !== null) clearTimeout(entry.ceiling);
    entry.timer = null;
    entry.ceiling = null;
}

/**
 * The scheduler in front of {@link saveProject}. See the module doc comment for the contract.
 */
export function createProjectAutosave(options: ProjectAutosaveOptions): ProjectAutosaveEngine {
    const quietMs = options.quietMs ?? DEFAULT_AUTOSAVE_QUIET_MS;
    const maxWaitMs = options.maxWaitMs ?? DEFAULT_AUTOSAVE_MAX_WAIT_MS;
    const runSave = options.save ?? saveProject;
    const worlds = new Map<string, WorldEntry>();
    let disposed = false;

    function entryFor(worldFolder: string): WorldEntry {
        let entry = worlds.get(worldFolder);
        if (entry === undefined) {
            entry = freshEntry();
            worlds.set(worldFolder, entry);
        }
        return entry;
    }

    /**
     * Runs the pending write for one world, serialized after anything already in flight.
     *
     * The project is taken off `pending` and the timers are cleared *before* the write starts,
     * not after: `notifyChange` can be called again while this write is still running, and it
     * has to see an empty `pending` so a genuinely new edit starts its own fresh debounce
     * instead of being folded into (or lost underneath) the write already under way.
     */
    function enqueue(worldFolder: string, entry: WorldEntry, reason: AutosaveReason): Promise<ProjectSaveResult | null> {
        const project = entry.pending;
        if (project === null) return entry.chain.then(() => null);

        entry.pending = null;
        clearTimers(entry);

        const attempt = entry.chain.then(async (): Promise<ProjectSaveResult | null> => {
            if (disposed) return null;

            let result: ProjectSaveResult;
            try {
                result = await runSave(options, worldFolder, project);
            } catch (error) {
                // `saveProject` itself never rejects - every failure it can have is a value.
                // This exists so an autosave cannot be brought down even by a caller-injected
                // `save` that does reject, which is the shape a test uses to prove the point.
                result = {
                    ok: false,
                    reason: `The project could not be autosaved: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                };
            }

            if (result.ok) entry.baseline = serializeProjectFile(result.project);
            options.onAutosave?.({ worldFolder, reason, result });
            return result;
        });

        // Failures are swallowed *here*, in the chain that gates the next write, not in the
        // promise returned to the caller above - the caller still sees the real result,
        // including a `{ ok: false }` one, and only the internal serialization queue is
        // shielded from ever stalling on a rejected link.
        entry.chain = attempt.then(
            () => undefined,
            () => undefined,
        );
        return attempt;
    }

    return {
        notifyChange(worldFolder, project) {
            if (disposed) return;
            const entry = entryFor(worldFolder);
            const text = serializeProjectFile(project);

            if (text === entry.baseline) {
                // Nothing about the project differs from what this engine last wrote. If a
                // change was pending, it has been undone back to that same state, so the
                // pending write is dropped rather than committed - an unchanged state records
                // nothing, even when it arrived by cancelling itself out.
                entry.pending = null;
                clearTimers(entry);
                return;
            }

            entry.pending = project;
            if (entry.timer !== null) clearTimeout(entry.timer);
            entry.timer = setTimeout(() => {
                entry.timer = null;
                void enqueue(worldFolder, entry, "quiet");
            }, quietMs);

            // The ceiling is anchored to the *start* of this pending burst and is left alone by
            // every further edit, so continuous editing cannot push it back indefinitely.
            if (entry.ceiling === null) {
                entry.ceiling = setTimeout(() => {
                    entry.ceiling = null;
                    void enqueue(worldFolder, entry, "quiet");
                }, maxWaitMs);
            }
        },

        async flush(worldFolder, reason) {
            const entry = worlds.get(worldFolder);
            if (entry === undefined || entry.pending === null) return null;
            return await enqueue(worldFolder, entry, reason);
        },

        async flushAll(reason) {
            await Promise.all(
                [...worlds.entries()]
                    .filter(([, entry]) => entry.pending !== null)
                    .map(([worldFolder, entry]) => enqueue(worldFolder, entry, reason)),
            );
        },

        hasPendingFor(worldFolder) {
            return worlds.get(worldFolder)?.pending !== null && worlds.has(worldFolder);
        },

        hasAnyPending() {
            return [...worlds.values()].some((entry) => entry.pending !== null);
        },

        dispose() {
            disposed = true;
            for (const entry of worlds.values()) clearTimers(entry);
            worlds.clear();
        },
    };
}

/* -------------------------------------------------------------------------- */
/* Flushing on quit                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Just enough of Electron's `App` to hook a quit-time flush into, so this module never imports
 * Electron for anything but a type and a test can exercise it with a plain object.
 */
export interface QuitAppLike {
    quit(): void;
    on(event: "before-quit", listener: (event: { preventDefault(): void }) => void): void;
}

/**
 * Makes sure nothing pending is lost when the application quits.
 *
 * An ordinary quit with nothing pending is left alone entirely - this never delays closing the
 * application for the common case. When something *is* pending, the first `before-quit` is
 * cancelled with `preventDefault`, every pending world is flushed, and only then is `quit()`
 * called again - which is what actually lets the application close, since the event this time
 * finds nothing left pending and does not cancel itself a second time.
 */
export function wireAutosaveQuitFlush(app: QuitAppLike, engine: ProjectAutosaveEngine): void {
    let quitting = false;
    app.on("before-quit", (event) => {
        if (quitting) return;
        if (!engine.hasAnyPending()) return;

        event.preventDefault();
        quitting = true;
        void engine.flushAll("quit").finally(() => app.quit());
    });
}
