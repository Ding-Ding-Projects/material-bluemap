/**
 * The thing that actually drives the updater, and the only part of it that has state.
 *
 * Everything an update *decides* lives next door in pure modules: `feed.ts` decides where
 * to look, `state.ts` decides what a result means, `schedule.ts` decides when to look
 * again, `failure.ts` decides what an error was. This module owns the two things that
 * cannot be pure - a live updater object and a clock - and nothing else.
 *
 * ## Nothing here interrupts anybody
 *
 * The download runs in the background and the app never restarts itself. Electron's
 * `autoUpdater` fetches and stages on its own; installation happens only inside
 * {@link UpdateController.restart}, only when the user asks, and only when
 * {@link UpdateControllerOptions.renderInProgress} says no render is in flight.
 *
 * A render is treated exactly as unsaved work: a BlueMap render of a large world runs for
 * hours, and quitting into an installer half way through throws that time away with no
 * route back to it. So the refusal is a *value* rather than an exception, it names the
 * render as the reason, and the banner shows it before the button is pressed rather than
 * after.
 *
 * ## Nothing here rejects
 *
 * Every method returns a value, failures included. An updater whose Check button can throw
 * is an updater whose Check button can leave a spinner running forever, and "the app looks
 * frozen" is the failure this whole subsystem exists to avoid producing.
 */

import { classifyUpdateFailure } from "./failure.js";
import { describeFeed, type FeedConfiguration, type FeedResolution } from "./feed.js";
import type { UpdateFeedHandoff } from "./feedHandoff.js";
import {
    STARTUP_DELAY_MS,
    initialSchedule,
    nextCheckDelay,
    scheduleAfterFailure,
    scheduleAfterSuccess,
    type ScheduleState,
} from "./schedule.js";
import {
    initialUpdateState,
    isReady,
    reduceUpdate,
    type UpdateEvent,
    type UpdateState,
} from "./state.js";

/* -------------------------------------------------------------------------- */
/* The seams                                                                  */
/* -------------------------------------------------------------------------- */

/** A timer handle, opaque on purpose so a test can hand back anything it likes. */
export type TimerHandle = unknown;

export interface UpdateTimers {
    setTimeout(handler: () => void, ms: number): TimerHandle;
    clearTimeout(handle: TimerHandle): void;
}

/**
 * The part of Electron's `autoUpdater` this controller uses.
 *
 * Structural rather than an import, for the same reason `IpcMain` is a parameter
 * everywhere else in this process: a value import of `electron` would make every test in
 * this directory need an Electron runtime, and testing an updater against a real update
 * server is not a test anybody can run.
 */
export interface UpdateEngine {
    setFeedURL(options: {
        url: string;
        headers?: Record<string, string>;
        serverType?: "default" | "json";
    }): void;
    checkForUpdates(): void;
    quitAndInstall(): void;
    on(event: string, listener: (...args: never[]) => void): unknown;
}

/**
 * Wraps Electron's own `autoUpdater` as an {@link UpdateEngine}.
 *
 * Takes the emitter structurally so this module still compiles, and still runs, with no
 * Electron anywhere near it. The call site is one line in `main/index.ts`.
 */
export function engineFromAutoUpdater(
    updater: NodeJS.EventEmitter & {
        setFeedURL(options: {
            url: string;
            headers?: Record<string, string>;
            serverType?: "default" | "json";
        }): void;
        checkForUpdates(): void;
        quitAndInstall(): void;
    },
): UpdateEngine {
    return {
        setFeedURL: (options) => {
            updater.setFeedURL(options);
        },
        checkForUpdates: () => {
            updater.checkForUpdates();
        },
        quitAndInstall: () => {
            updater.quitAndInstall();
        },
        on: (event, listener) => updater.on(event, listener as (...args: unknown[]) => void),
    };
}

/** What a metadata-only probe found, for a build that cannot install its own updates. */
export interface UpdateProbeResult {
    readonly newer: boolean;
    readonly version: string | null;
    readonly notesUrl: string | null;
}

export type UpdateRestartRefusal =
    /** Nothing is staged, so there is nothing a restart would install. */
    | "nothing-ready"
    /** A render is running. Restarting would throw away hours of work. */
    | "render-in-progress"
    /** This build has no updater at all. */
    | "unsupported"
    /** The updater was asked to install and refused. */
    | "failed";

export type UpdateRestartResult =
    | { readonly ok: true; readonly version: string }
    | { readonly ok: false; readonly code: UpdateRestartRefusal; readonly message: string };

export interface UpdateControllerOptions {
    /** `app.getVersion()`. Shown verbatim; no funny level ever touches it. */
    readonly currentVersion: string;
    /** The outcome of {@link resolveFeed}. A refusal becomes the `unsupported` status. */
    readonly feed: FeedResolution;
    /** Null when there is nothing to drive, which is every non-Windows build. */
    readonly engine: UpdateEngine | null;
    /** True while a render is running. Read fresh every time it matters. */
    readonly renderInProgress: () => boolean;
    /** Called with the whole state whenever any of it changes. */
    readonly onChange: (state: UpdateState) => void;
    readonly timers?: UpdateTimers;
    readonly now?: () => Date;
    /** Durable proof that this profile has received an update from the current feed. */
    readonly feedHandoff?: UpdateFeedHandoff;
    /**
     * Optional metadata-only lookup, used when this build cannot install an update.
     *
     * A development build still benefits from being told a release exists; what it must
     * not do is imply it can install one. The status stays `unsupported` and the version
     * is reported beside it.
     */
    readonly probe?: () => Promise<UpdateProbeResult>;
}

/** A local ISO-8601 timestamp with its offset, matching the rest of this application. */
function localTimestamp(date: Date): string {
    const pad = (value: number): string => String(value).padStart(2, "0");
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const absolute = Math.abs(offset);
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
        `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
    );
}

const REAL_TIMERS: UpdateTimers = {
    setTimeout: (handler, ms) => setTimeout(handler, ms),
    clearTimeout: (handle) => {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
};

export class UpdateController {
    private readonly options: UpdateControllerOptions;
    private readonly timers: UpdateTimers;
    private readonly now: () => Date;

    private state: UpdateState;
    private schedule: ScheduleState = initialSchedule();
    private timer: TimerHandle | null = null;
    private started = false;
    private disposed = false;
    /** True between a check being asked for and the engine answering it. */
    private inFlight = false;
    private activeFeed: "current" | "legacy" = "current";
    private fallbackAttempted = false;
    private currentFeedHadNoUpdate = false;
    private currentFeedConfirmed = false;

    constructor(options: UpdateControllerOptions) {
        this.options = options;
        this.timers = options.timers ?? REAL_TIMERS;
        this.now = options.now ?? ((): Date => new Date());
        this.state = initialUpdateState(options.currentVersion);
    }

    /**
     * Wires the engine up and starts the schedule. Safe to call twice.
     *
     * A build with no feed, or no engine, ends here in `unsupported` with the reason the
     * feed resolver gave. That is the whole of what "honest failure copy" means for a
     * machine that was never going to update: it says so once, at the start, instead of
     * offering a button that does nothing.
     */
    start(): void {
        if (this.started || this.disposed) return;
        this.started = true;

        if (!this.options.feed.ok) {
            this.apply({ type: "unsupported", reason: this.options.feed.reason });
            this.probeAnyway();
            return;
        }
        const engine = this.options.engine;
        if (engine === null) {
            this.apply({
                type: "unsupported",
                reason:
                    "This build has no updater wired up, so it cannot fetch a new version. " +
                    "Installed copies update themselves.",
            });
            this.probeAnyway();
            return;
        }

        const feed = this.options.feed.feed;
        const fallback = this.options.feed.legacyFallback;
        if (fallback === null) {
            this.currentFeedConfirmed = true;
        } else {
            try {
                this.currentFeedConfirmed =
                    this.options.feedHandoff?.isCurrentConfirmed(feed.url, fallback.url) ?? false;
            } catch {
                this.currentFeedConfirmed = false;
            }
        }
        try {
            this.setEngineFeed(engine, feed);
        } catch (error) {
            // A feed the updater refuses is the end of the road for this launch, and it
            // must not become a schedule that retries a configuration error every six hours.
            this.apply({ type: "failed", failure: classifyUpdateFailure(error), at: this.stamp() });
            return;
        }
        // Only the address, never the header. `describeFeed` is what enforces that.
        this.apply({ type: "feed", url: describeFeed(feed).url });

        this.listen(engine);
        this.arm(STARTUP_DELAY_MS);
    }

    /** The state right now, with render activity re-read so it is never stale. */
    current(): UpdateState {
        const active = this.readRenderActivity();
        if (active !== this.state.renderInProgress) {
            this.state = reduceUpdate(this.state, { type: "render-activity", active });
        }
        return this.state;
    }

    /**
     * Asks now rather than at the next scheduled moment.
     *
     * Returns the state rather than a promise of a result: the answer arrives on the change
     * callback like every other answer, and a Check button that awaited a result would be a
     * Check button that hangs when the network does.
     */
    check(options: { readonly manual?: boolean } = {}): UpdateState {
        const manual = options.manual ?? false;
        if (this.disposed) return this.current();

        const engine = this.options.engine;
        if (this.state.status === "unsupported" || engine === null || !this.options.feed.ok) {
            // Not an error: the reason is already on the state, and re-raising it as a
            // failure would replace an explanation with a complaint.
            this.probeAnyway();
            return this.current();
        }
        if (this.inFlight) return this.current();
        if (isReady(this.state)) {
            // Already staged. Checking again cannot improve on "restart to install".
            return this.current();
        }

        this.inFlight = true;
        this.apply({ type: "check-started", manual });
        try {
            engine.checkForUpdates();
        } catch (error) {
            this.inFlight = false;
            this.fail(classifyUpdateFailure(error));
        }
        return this.current();
    }

    /**
     * Quits into the staged installer, or says why it will not.
     *
     * The render guard is re-read here rather than trusted from the state, because the
     * state was published when the banner was drawn and a render can start between the
     * banner appearing and the button being pressed.
     */
    restart(): UpdateRestartResult {
        if (this.state.status === "unsupported") {
            return {
                ok: false,
                code: "unsupported",
                message: this.state.unsupportedReason ?? "This build cannot install updates.",
            };
        }
        const version = this.state.readyVersion;
        if (!isReady(this.state) || version === null) {
            return {
                ok: false,
                code: "nothing-ready",
                message:
                    "There is no update staged on this machine yet, so a restart would come back to the same version.",
            };
        }
        if (this.readRenderActivity()) {
            return {
                ok: false,
                code: "render-in-progress",
                message:
                    "A render is running. Installing the update would quit the app and throw that render away, so it " +
                    `was not installed. Version ${version} stays staged and installs whenever you are ready.`,
            };
        }
        const engine = this.options.engine;
        if (engine === null) {
            return { ok: false, code: "unsupported", message: "This build has no updater to run." };
        }
        try {
            engine.quitAndInstall();
        } catch (error) {
            const failure = classifyUpdateFailure(error);
            this.fail(failure);
            return { ok: false, code: "failed", message: failure.message };
        }
        return { ok: true, version };
    }

    dispose(): void {
        this.disposed = true;
        this.cancelTimer();
    }

    /* ---------------------------------------------------------------------- */
    /* Internals                                                              */
    /* ---------------------------------------------------------------------- */

    private listen(engine: UpdateEngine): void {
        const handler = (event: string, run: (args: readonly unknown[]) => void): void => {
            engine.on(event, ((...args: unknown[]) => {
                if (this.disposed) return;
                run(args);
            }) as (...args: never[]) => void);
        };

        handler("checking-for-update", () => {
            // The engine can begin a check the schedule did not ask for - Squirrel retries
            // internally - so the flag is set from the engine's own signal too rather than
            // only from `check()`, or the interface would miss those entirely.
            this.inFlight = true;
            this.apply({ type: "check-started", manual: this.state.lastCheckWasManual });
        });

        handler("update-not-available", () => {
            this.inFlight = false;
            if (this.activeFeed === "current" && this.tryLegacyFallback(engine, true)) return;
            if (this.activeFeed === "legacy") this.restoreCurrentFeed(engine);
            this.schedule = scheduleAfterSuccess(this.schedule, isReady(this.state));
            this.apply({ type: "up-to-date", at: this.stamp() });
            this.rearm();
        });

        handler("update-available", () => {
            // Electron's updater begins downloading as part of the check; there is no
            // "found one, not fetching it yet" moment to report, so this is `downloading`
            // rather than `available`. `available` is what a metadata-only probe produces.
            this.inFlight = false;
            this.apply({ type: "downloading", version: null });
        });

        handler("update-downloaded", (args) => {
            this.inFlight = false;
            if (this.activeFeed === "current") this.confirmCurrentFeed();
            // Electron's signature: (event, releaseNotes, releaseName, releaseDate, updateURL).
            const notes = typeof args[1] === "string" && args[1].trim() !== "" ? args[1] : null;
            const name = typeof args[2] === "string" && args[2].trim() !== "" ? args[2] : null;
            const url =
                typeof args[4] === "string" && args[4].startsWith("https://") ? args[4] : null;
            this.schedule = scheduleAfterSuccess(this.schedule, true);
            this.apply({
                type: "downloaded",
                // Never invented. An installer whose version the feed did not name is still
                // an installer, and "a newer version" beats a version number nobody checked.
                version: name ?? "a newer version",
                notes,
                notesUrl: url,
                at: this.stamp(),
            });
            this.rearm();
        });

        handler("error", (args) => {
            this.inFlight = false;
            if (this.activeFeed === "current" && this.tryLegacyFallback(engine, false)) return;
            if (this.activeFeed === "legacy" && this.currentFeedHadNoUpdate) {
                this.restoreCurrentFeed(engine);
                this.schedule = scheduleAfterSuccess(this.schedule, isReady(this.state));
                this.apply({ type: "up-to-date", at: this.stamp() });
                this.rearm();
                return;
            }
            if (this.activeFeed === "legacy") this.restoreCurrentFeed(engine);
            this.fail(classifyUpdateFailure(args[0]));
        });
    }

    private setEngineFeed(engine: UpdateEngine, feed: FeedConfiguration): void {
        engine.setFeedURL({
            url: feed.url,
            headers: { ...feed.headers },
            serverType: feed.serverType,
        });
    }

    private tryLegacyFallback(engine: UpdateEngine, currentHadNoUpdate: boolean): boolean {
        if (
            !this.options.feed.ok ||
            this.currentFeedConfirmed ||
            this.fallbackAttempted ||
            this.activeFeed !== "current"
        ) {
            return false;
        }
        const fallback = this.options.feed.legacyFallback;
        if (fallback === null) return false;

        this.fallbackAttempted = true;
        this.currentFeedHadNoUpdate = currentHadNoUpdate;
        this.activeFeed = "legacy";
        try {
            this.setEngineFeed(engine, fallback);
            this.apply({ type: "feed", url: describeFeed(fallback).url });
            this.inFlight = true;
            this.apply({ type: "check-started", manual: this.state.lastCheckWasManual });
            engine.checkForUpdates();
        } catch (error) {
            this.inFlight = false;
            this.restoreCurrentFeed(engine);
            if (currentHadNoUpdate) {
                // The current feed already gave an authoritative no-update result. A
                // synchronous refusal while selecting the temporary bridge must not turn
                // that successful check into a failure.
                this.schedule = scheduleAfterSuccess(this.schedule, isReady(this.state));
                this.apply({ type: "up-to-date", at: this.stamp() });
                this.rearm();
            } else {
                this.fail(classifyUpdateFailure(error));
            }
        }
        return true;
    }

    private restoreCurrentFeed(engine: UpdateEngine): void {
        if (!this.options.feed.ok) return;
        this.activeFeed = "current";
        this.fallbackAttempted = false;
        this.currentFeedHadNoUpdate = false;
        try {
            this.setEngineFeed(engine, this.options.feed.feed);
            this.apply({ type: "feed", url: describeFeed(this.options.feed.feed).url });
        } catch {
            // The next scheduled/manual check will surface the current feed refusal. A
            // fallback result that already arrived remains the honest result for this cycle.
        }
    }

    private confirmCurrentFeed(): void {
        if (!this.options.feed.ok || this.options.feed.legacyFallback === null) return;
        this.currentFeedConfirmed = true;
        try {
            this.options.feedHandoff?.confirmCurrent(
                this.options.feed.feed.url,
                this.options.feed.legacyFallback.url,
            );
        } catch {
            // A persistence failure must not discard an update that was already downloaded.
            // This launch stays confirmed; a later launch safely rechecks both feeds.
        }
    }

    private fail(failure: ReturnType<typeof classifyUpdateFailure>): void {
        this.schedule = scheduleAfterFailure(this.schedule);
        this.apply({ type: "failed", failure, at: this.stamp() });
        this.rearm();
    }

    private apply(event: UpdateEvent): void {
        const next = reduceUpdate(this.state, event);
        const active = this.readRenderActivity();
        this.state =
            active === next.renderInProgress
                ? next
                : reduceUpdate(next, { type: "render-activity", active });
        this.options.onChange(this.state);
    }

    private readRenderActivity(): boolean {
        try {
            return this.options.renderInProgress();
        } catch {
            // A broken activity probe must never be the reason an update installs over a
            // render. Unknown is treated as busy, which is the safe direction.
            return true;
        }
    }

    private stamp(): string {
        return localTimestamp(this.now());
    }

    private arm(delay: number): void {
        this.cancelTimer();
        if (this.disposed) return;
        this.timer = this.timers.setTimeout(() => {
            this.timer = null;
            this.check();
        }, delay);
    }

    private rearm(): void {
        const delay = nextCheckDelay(this.schedule);
        if (delay === null) {
            this.cancelTimer();
            return;
        }
        this.arm(delay);
    }

    private cancelTimer(): void {
        if (this.timer === null) return;
        this.timers.clearTimeout(this.timer);
        this.timer = null;
    }

    /**
     * Asks a metadata-only probe, when there is one, for a build that cannot install.
     *
     * Deliberately fire-and-forget and deliberately silent about its own failures: this is
     * a courtesy on a build that already knows it cannot update, and turning a failed
     * courtesy into an error banner would be noise on top of an explanation.
     */
    private probeAnyway(): void {
        const probe = this.options.probe;
        if (probe === undefined) return;
        void probe().then(
            (result) => {
                if (this.disposed || !result.newer) return;
                this.apply({
                    type: "available",
                    version: result.version,
                    notesUrl: result.notesUrl,
                });
            },
            () => {
                /* A probe that fails leaves the explanation in place, which is the truth. */
            },
        );
    }
}
