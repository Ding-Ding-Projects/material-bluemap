/**
 * One render, watched from the interface.
 *
 * A render of a real world takes minutes and moves in ten-second steps, so the
 * events are pushed rather than polled and this holds the latest of each: which
 * phase, which map, how far, how long is left. A spinner for four minutes is
 * indistinguishable from a hang, and a hang is what people conclude.
 *
 * The end states are kept apart on purpose. Finished, failed and cancelled are
 * three different things, and a cancellation shown as a failure tells somebody
 * who pressed Cancel that something went wrong when nothing did.
 *
 * Two failures get their own treatment because both are common and both are
 * fixable in one place: missing Mojang download consent, and no Java runtime.
 * Neither is re-asked here. Consent is answered once at first launch, so this
 * says what is missing and points at the setting that owns it.
 *
 * A render that has ended also reads back the `render.json` the render itself
 * wrote, so the panel can name the engine that produced it. The app promises never
 * to switch renderer silently; that record is what turns the promise into
 * something a person can check.
 *
 * The engine's output is kept as console lines rather than as strings: each carries
 * its level, who wrote it, and whatever advice this app has about it. Two things
 * come out of that. The log reads as a narrative, because the run writes its own
 * status lines into the same stream the engine writes into, so "starting", "running"
 * and "stopped with code 1" appear in order beside the output they bracket. And a
 * line the app knows something useful about arrives already annotated, once, at the
 * moment it arrives, rather than being re-matched every time the console re-renders
 * or is filtered, which is what would make a once-per-render tip depend on whether
 * somebody had typed in the search box.
 */

import { computed, ref, shallowRef, type ComputedRef, type Ref } from "vue";
import { createAnnotator, type ConsoleText } from "../console/annotations.js";
import {
    CONSOLE_LINE_CAP,
    appendLine,
    normaliseLevel,
    type ConsoleLine,
} from "../console/consoleModel.js";
import { NO_ESTIMATE, createEtaTracker } from "../progress/progressModel.js";
import type {
    ProgressCount,
    ProgressEstimate,
    ProgressFacts,
    ProgressLevel,
    ProgressRoute,
    ProgressText,
    TransferStat,
} from "../progress/progressModel.js";
import type {
    EngineDescription,
    RenderEvent,
    RenderFailure,
    RenderRequest,
    RenderResult,
    RenderSummary,
    RenderTaskProgress,
    SettingsTarget,
    SpeedAdjustmentResult,
    SpeedLevelNumber,
    WorldBridge,
} from "./worldBridge.js";
import { speedLevelByNumber } from "../config/speedLevels.js";
import type { Translate } from "./worldFolder.js";

export type RunState = "idle" | "starting" | "running" | "finished" | "failed" | "cancelled";

/**
 * How many log lines are kept.
 *
 * The console owns the number; this is the name the rest of the flow has always known
 * it by. It is stated on screen along with how many lines have been dropped, because a
 * ring that quietly forgets its own beginning is how the setup warning a render printed
 * in its first second stops existing by the time anybody looks.
 */
export const LOG_LIMIT = CONSOLE_LINE_CAP;

/**
 * One line of the console.
 *
 * An alias rather than a second declaration, so the panel, the console and this file
 * cannot end up with three subtly different ideas of what a log line is.
 */
export type RenderLogLine = ConsoleLine;

/**
 * The run narrating itself into the engine's own log.
 *
 * Held as keys and fallbacks rather than as sentences because this file has no
 * translator: `createRenderRun` is built from a bridge and nothing else. Translating
 * where the line is drawn also means a status line changes language when the language
 * mode does, rather than keeping whichever one was active when it was written.
 */
const SIGNALS = {
    starting: { key: "world.console.signal.starting", fallback: "Starting the render.", values: {} },
    running: { key: "world.console.signal.running", fallback: "Running.", values: {} },
    watching: {
        key: "world.console.signal.watching",
        fallback: "Watching a render that was already going.",
        values: {},
    },
    stopping: {
        key: "world.console.signal.stopping",
        fallback: "Stopping. Every tile already drawn is kept.",
        values: {},
    },
    cancelled: {
        key: "world.console.signal.stoppedCancelled",
        fallback: "Stopped. You stopped it, and every tile already drawn is kept.",
        values: {},
    },
    failed: {
        key: "world.console.signal.stoppedFailed",
        fallback: "Stopped. The render did not finish.",
        values: {},
    },
} as const satisfies Readonly<Record<string, ConsoleText>>;

/** `Stopped.` with the number the engine actually exited with, when there is one. */
function stoppedWithCode(code: number): ConsoleText {
    return {
        key: "world.console.signal.stoppedCode",
        fallback: "Stopped. The engine exited with code {code}.",
        values: { code },
    };
}

/** The engine's phases, in the order it goes through them. */
export const RENDER_PHASES = [
    "starting",
    "downloading-resources",
    "loading-resources",
    "loading-maps",
    "rendering",
    "watching",
    "stopping",
    "finished",
] as const;

/**
 * What a phase is called, held rather than translated.
 *
 * The run has no translator - `createRenderRun` is built from a bridge and nothing else -
 * and a label translated where it is drawn also changes language when the language mode
 * does, rather than keeping whichever one was active when the render started. A phase this
 * port has never seen keeps its own name as the fallback, so an engine that grows a ninth
 * phase says its name rather than showing a blank.
 */
export function phaseText(phase: string): ProgressText {
    switch (phase) {
        case "starting":
            return { key: "world.run.phase.starting", fallback: "Starting the engine", values: {} };
        case "downloading-resources":
            return {
                key: "world.run.phase.downloading",
                fallback: "Downloading the Minecraft client files",
                values: {},
            };
        case "loading-resources":
            return { key: "world.run.phase.loadingResources", fallback: "Loading textures and models", values: {} };
        case "loading-maps":
            return { key: "world.run.phase.loadingMaps", fallback: "Reading the world", values: {} };
        case "rendering":
            return { key: "world.run.phase.rendering", fallback: "Rendering tiles", values: {} };
        case "watching":
            return { key: "world.run.phase.watching", fallback: "Watching the world for changes", values: {} };
        case "stopping":
            return { key: "world.run.phase.stopping", fallback: "Finishing up", values: {} };
        case "finished":
            return { key: "world.run.phase.finished", fallback: "Finished", values: {} };
        default:
            return { key: `world.run.phase.${phase}`, fallback: phase, values: {} };
    }
}

/** What a phase is called on screen. Unknown phases are shown as they arrive. */
export function phaseLabel(phase: string | null, t: Translate): string {
    if (phase === null) return "";
    const text = phaseText(phase);
    return t(text.key, text.values, text.fallback);
}

/**
 * A duration in words.
 *
 * The engine sends its own `etaText` most of the time, which is used verbatim
 * because it is the engine's own estimate in the engine's own words. This is for
 * the times it sends only a number.
 */
export function formatDuration(seconds: number, t: Translate): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "";
    const whole = Math.round(seconds);
    // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n
    // compiles the fallback as a message too and consumes `{n}` as a named parameter
    // of its own, so a later `replace` has nothing left to substitute and a duration
    // reads "seconds" with no number in front of it.
    if (whole < 60) return t("world.run.seconds", { n: whole }, "{n} seconds");

    const minutes = Math.floor(whole / 60);
    if (minutes < 60) {
        return t("world.run.minutes", { n: minutes }, "{n} minutes");
    }
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return t("world.run.hours", { h: hours, m: rest }, "{h} hours {m} minutes");
}

/* -------------------------------------------------------------------------- */
/* Failures                                                                   */
/* -------------------------------------------------------------------------- */

export type FailureKind =
    | "consent"
    | "java"
    | "engine-missing"
    | "world"
    | "storage"
    | "request"
    | "nothing-rendered"
    | "cancelled"
    | "engine-failed"
    /**
     * The engine never started because the place it was asked to run in could not take it.
     *
     * Kept apart from `engine-failed` because nothing ran: there is no engine output to
     * read, and the advice is about Docker or a folder rather than about a render.
     */
    | "runtime";

/** Sorts a failure into the one of these it is, so each gets its own answer. */
export function classifyFailure(failure: RenderFailure): FailureKind {
    switch (failure.code) {
        case "consent-required":
            return "consent";
        case "java-unavailable":
            return "java";
        case "cli-jar-missing":
            return "engine-missing";
        case "world-not-found":
            return "world";
        case "workspace-unwritable":
            return "storage";
        case "invalid-request":
        case "already-running":
            return "request";
        case "no-maps-rendered":
            return "nothing-rendered";
        case "cancelled":
            return "cancelled";
        case "docker-unavailable":
        case "container-mount-refused":
            return "runtime";
        default:
            return "engine-failed";
    }
}

/** What to offer beside a failure, when a setting would fix it. */
export interface FailureRemedy {
    /** The settings row to open, or null when no setting helps. */
    readonly settings: SettingsTarget | null;
    /** Label for the button that opens it. Empty when there is none. */
    readonly actionKey: string;
    readonly actionFallback: string;
}

export interface FailureAdvice {
    readonly kind: FailureKind;
    /** The engine's own sentence, shown as written. */
    readonly message: string;
    /** What it means and what to do, in this app's terms. */
    readonly explanation: string;
    readonly remedy: FailureRemedy;
    /** The engine's supporting evidence, behind a disclosure. Null when there is none. */
    readonly detail: string | null;
}

/**
 * What a failure means and where to fix it.
 *
 * The engine's own `message` is never rewritten or hidden: it is the most precise
 * statement available and it is what a person would search for. The explanation
 * sits beside it and says what this app can do about it.
 */
export function adviseOnFailure(failure: RenderFailure, t: Translate): FailureAdvice {
    const kind = classifyFailure(failure);

    const base = {
        kind,
        message: failure.message,
        detail: failure.detail,
    };

    switch (kind) {
        case "consent":
            return {
                ...base,
                explanation: t(
                    "world.run.fail.consent",
                    "BlueMap builds its blocks from the Minecraft client files, which are downloaded from Mojang. That download is accepted once, in Settings, and it has not been. Nothing was started and nothing was written.",
                ),
                remedy: {
                    settings: failure.settings ?? { surface: "settings", anchor: "mojang-download-consent", missing: true },
                    actionKey: "world.run.fail.consentAction",
                    actionFallback: "Open the download setting",
                },
            };
        case "java":
            return {
                ...base,
                explanation: t(
                    "world.run.fail.java",
                    "The BlueMap engine runs on Java, and no Java runtime new enough to run it was found on this machine. The app can fetch one for you, or you can point it at one you already have.",
                ),
                remedy: {
                    settings: failure.settings ?? { surface: "settings", anchor: "java-runtime", missing: true },
                    actionKey: "world.run.fail.javaAction",
                    actionFallback: "Set up the Java runtime",
                },
            };
        case "engine-missing":
            return {
                ...base,
                explanation: t(
                    "world.run.fail.engineMissing",
                    "The BlueMap engine itself is not installed in this build, so there was nothing to run. The detail below lists the folders that were searched.",
                ),
                remedy: { settings: failure.settings, actionKey: "", actionFallback: "" },
            };
        case "world":
            return {
                ...base,
                explanation: t(
                    "world.run.fail.world",
                    "The world folder could not be read when the render started. It may have been moved, renamed, or be on a drive that is not connected.",
                ),
                remedy: {
                    settings: failure.settings,
                    actionKey: "world.run.fail.worldAction",
                    actionFallback: "Choose the world again",
                },
            };
        case "storage":
            return {
                ...base,
                explanation: t(
                    "world.run.fail.storage",
                    "The folder maps are written to could not be created or written. It may be read-only, full, or on a drive that is not connected.",
                ),
                remedy: {
                    settings: failure.settings,
                    actionKey: "world.run.fail.storageAction",
                    actionFallback: "Change where maps are written",
                },
            };
        case "request":
            return {
                ...base,
                explanation: t(
                    "world.run.fail.request",
                    "The render was refused before anything ran, so nothing was written. The message above says exactly which part of the request was refused.",
                ),
                remedy: { settings: failure.settings, actionKey: "", actionFallback: "" },
            };
        case "nothing-rendered":
            return {
                ...base,
                explanation: t(
                    "world.run.fail.nothing",
                    "The engine ran and finished without rendering a single map. That usually means the dimension chosen has no region files in this world, so there was nothing to draw.",
                ),
                remedy: {
                    settings: failure.settings,
                    actionKey: "world.run.fail.nothingAction",
                    actionFallback: "Check the world and dimension",
                },
            };
        case "cancelled":
            return {
                ...base,
                explanation: t(
                    "world.run.fail.cancelled",
                    "You stopped it. The tiles already rendered are kept, and carrying on later picks up from where it stopped.",
                ),
                remedy: { settings: null, actionKey: "", actionFallback: "" },
            };
        case "runtime":
            // The message the main process built already names the real reason - which
            // Docker state it found, or which folder it refused to mount and why. Falling
            // through to the generic engine wording would replace a precise sentence with
            // a vague one, so these carry their own text and add nothing to it.
            return {
                ...base,
                explanation: failure.message,
                remedy: { settings: failure.settings, actionKey: "", actionFallback: "" },
            };
        case "engine-failed":
            return {
                ...base,
                explanation: t(
                    "world.run.fail.engine",
                    "The engine started and then stopped with an error. Its own output is below; the last few lines are usually the ones that say why.",
                ),
                remedy: { settings: failure.settings, actionKey: "", actionFallback: "" },
            };
    }
}

/* -------------------------------------------------------------------------- */
/* The run                                                                    */
/* -------------------------------------------------------------------------- */

export interface RenderRun {
    readonly state: Ref<RunState>;
    /** Learned from the engine, because the id is derived from the world folder. */
    readonly renderId: Ref<string | null>;
    readonly engine: Ref<EngineDescription | null>;
    /**
     * The record the render left behind, read once it has ended. Null until then,
     * and null on a build whose bridge cannot answer for it.
     */
    readonly provenance: Ref<RenderSummary | null>;
    readonly phase: Ref<string | null>;
    readonly task: Ref<RenderTaskProgress | null>;
    readonly percent: ComputedRef<number>;
    /** True while the engine is between phases and has reported no percentage yet. */
    readonly indeterminate: ComputedRef<boolean>;
    /**
     * The whole breakdown, in the vocabulary every route reports through.
     *
     * The route this feeds - a child process here, a container here, or a container on a
     * machine over SSH - arrives on one event stream on purpose, so one derivation covers
     * all three. `components/progress/RenderProgressDetail.vue` draws it, and
     * `ciProgressFacts` builds the same shape for a render on GitHub's runners.
     */
    readonly progress: ComputedRef<ProgressFacts>;
    readonly mapIds: Ref<readonly string[]>;
    readonly dataRoot: Ref<string | null>;
    readonly durationMs: Ref<number | null>;
    readonly failure: Ref<RenderFailure | null>;
    readonly log: Ref<readonly RenderLogLine[]>;
    /**
     * How many lines the cap has dropped off the front of this render.
     *
     * Kept so the console can say it out loud. Nothing else in this file uses it, which
     * is the point: the alternative is a console that silently shows the last ten
     * thousand lines of a longer log and looks exactly like a complete one.
     */
    readonly logDropped: Ref<number>;
    readonly cancelling: Ref<boolean>;
    readonly startedAt: Ref<string | null>;
    /** True while a render is in flight, which is what disables the start control. */
    readonly active: ComputedRef<boolean>;
    /** True when this build cannot render at all. */
    readonly available: boolean;
    /**
     * The `renderThreads` this render was actually asked to start with, or `null` when the
     * request never named one and this machine's own automatic default applied instead.
     *
     * This is the one raw fact a live speed control has to show honestly as "not moving
     * mid-render": `render-thread-count` is read by the JVM once, at startup, and there is no
     * `render-thread-priority` anywhere on this path at all - see `speedLevels.ts`'s own
     * `matchThreadCount` for why that makes this a coarser question than the pre-render
     * dial's exact-pair match.
     */
    readonly renderThreads: Ref<number | null>;
    /** The JVM thread priority this render started with, or null when BlueMap's default applies. */
    readonly renderThreadPriority: Ref<number | null>;

    start(request: RenderRequest): Promise<RenderResult | null>;
    /**
     * Watches a render this panel did not start, by id.
     *
     * Resuming an interrupted render is the case: the bridge call resolves only
     * when that render has ended, so without this the progress of a render that
     * is already going would arrive with nowhere to be shown.
     */
    expect(renderId: string): void;
    /** Applies a final result, for a render whose events said nothing at all. */
    settle(result: RenderResult): void;
    cancel(): Promise<boolean>;
    /**
     * Changes this render's speed while it is running, applying whatever its route can
     * genuinely change right now. `null` when there is no render to address at all -
     * never a guessed-at result the interface would have to treat as real.
     */
    adjustSpeed(level: SpeedLevelNumber): Promise<SpeedAdjustmentResult | null>;
    /**
     * Restarts this render at a chosen level, so the thread count baked into its launch
     * genuinely changes rather than staying stuck until whenever the next render happens
     * to be. Stops the current run first when one is active and waits for it to actually
     * end - BlueMap's own incremental storage means nothing already drawn is lost - then
     * starts again with the same maps and the level's own thread count.
     *
     * Never happens on its own: this is only ever called from an explicit choice the
     * person made, per the standing rule that a restart is offered, not performed behind
     * anybody's back.
     */
    restartWithLevel(level: SpeedLevelNumber): Promise<RenderResult | null>;
    /** Clears the finished, failed or cancelled state so another render can be started. */
    reset(): void;
    /** Stops listening. Called when the surface holding this goes away. */
    dispose(): void;
}

export interface RenderRunOptions {
    /**
     * Which of the four ways this render is running, when the surface knows.
     *
     * Nothing on the event stream says. `main/remote/orchestrator.ts` goes to real trouble
     * to emit exactly the events a local render emits - which is what makes one panel work
     * for all of them - and the consequence is that a render over SSH is indistinguishable
     * from one in a container here. The only machine-readable difference is the engine's
     * `label`, which is an English sentence and not something to match on. So the surface
     * that chose the location is the thing that can say, and when nobody says, this reports
     * no route rather than guessing at one.
     *
     * Accepts a function as well as a plain value, for the surface that lets somebody
     * change where a render will go *after* this was constructed - `WorldScreen.vue`'s
     * location picker is read at the moment a render starts, not at the moment its panel
     * was built, and a plain value captured once would go on reporting whichever route was
     * chosen first no matter how many times the picker changed afterwards.
     */
    readonly route?: ProgressRoute | (() => ProgressRoute | null);
    /** The clock, for a test that decides what time it is. */
    readonly now?: () => number;
}

/** Resolves a `route` option, whichever of its two shapes was given. */
function resolveRoute(route: ProgressRoute | (() => ProgressRoute | null) | undefined): ProgressRoute | null {
    if (route === undefined) return null;
    return typeof route === "function" ? route() : route;
}

export function createRenderRun(bridge: WorldBridge | null, options: RenderRunOptions = {}): RenderRun {
    const now = options.now ?? ((): number => Date.now());
    const state = ref<RunState>("idle");
    const renderId = ref<string | null>(null);
    const engine = ref<EngineDescription | null>(null);
    const provenance = ref<RenderSummary | null>(null);
    const phase = ref<string | null>(null);
    const task = ref<RenderTaskProgress | null>(null);
    const mapIds = ref<readonly string[]>([]);
    const dataRoot = ref<string | null>(null);
    const durationMs = ref<number | null>(null);
    const failure = ref<RenderFailure | null>(null);
    /**
     * Shallow on purpose, and this is a performance decision with a measured cause.
     *
     * A deep `ref` wraps every element it hands out in a reactive proxy, so reading the
     * array to append to it re-proxied all ten thousand lines, once per line: appending
     * the log of a long render took nearly six seconds of pure overhead in a test that
     * did nothing else. Nothing ever mutates a line after it is written, so there is
     * nothing for deep reactivity to observe; replacing the array is the change, and a
     * shallow ref reports exactly that.
     */
    const log = shallowRef<readonly RenderLogLine[]>([]);
    const logDropped = ref(0);
    const cancelling = ref(false);
    const startedAt = ref<string | null>(null);
    const renderThreads = ref<number | null>(null);
    const renderThreadPriority = ref<number | null>(null);

    /** The request the current or most recent render actually started with, for a restart. */
    let lastRequest: RenderRequest | null = null;
    /**
     * Resolved the moment this run genuinely stops being active - see `noteEnd`, the single
     * funnel every ending path (event-driven and the `settle()` backstop alike) already goes
     * through. `restartWithLevel` is the only reader: it needs to know the *real* end of the
     * process it just asked to cancel, not merely that the request to cancel was acknowledged.
     */
    let inactiveWaiters: Array<() => void> = [];

    /**
     * The maps the engine has actually worked on, in the order it first named each.
     *
     * Not the same list as `mapIds`, which is what was *asked for*. The difference is what
     * makes "2 of 3 maps done" a real count rather than a guess: the position of the map
     * currently being worked on, inside the list of maps already touched, is a fact the
     * events carry.
     */
    const observedMaps = ref<readonly string[]>([]);
    const startedAtMs = ref<number | null>(null);
    /** The last event of any kind. Answers "is it alive", which log lines also answer. */
    const lastEventAtMs = ref<number | null>(null);
    /** The last event that moved a bar. Answers the different question, "is it getting on". */
    const lastProgressAtMs = ref<number | null>(null);
    /**
     * The phase the current task was reported under.
     *
     * Kept so a percentage is only shown against the phase it belongs to. A phase change
     * arrives on its own event, and continuing to show the last task's percentage under the
     * new phase's name would be a bar describing something that is no longer happening.
     */
    const taskPhase = ref<string | null>(null);
    /**
     * True once a real per-map or per-region render task has been seen.
     *
     * `"rendering"` is the phase upstream's own progress lines report through, and every
     * one of them - `progress.ts`'s doc comment quotes the exact `logInfo` call that
     * produces them - is a percentage and, when it has one, an ETA. Nothing else. There is
     * no tile, region or chunk count anywhere in that line for this port to have discarded,
     * so a task-level `count` stays `null` for the life of this file, and this flag is what
     * lets the panel say why in words instead of leaving that a silent gap.
     */
    const mapTaskSeen = ref(false);
    /**
     * True once the render has started fetching the finished map back.
     *
     * Only the remote route reports this, on the render's own progress channel, and it
     * reports it as files staged rather than as bytes: the size of what is coming back is
     * not known until the remote render has finished producing it, so there is nothing to
     * count against in advance. The flag is what lets the panel say that in words rather
     * than leaving a byte counter mysteriously absent. See `transferStats` for the other
     * half of a remote transfer - what went up - which does carry real bytes.
     */
    const downloadTransferSeen = ref(false);
    /**
     * Real bytes over the wire, when the route actually counts them.
     *
     * Only `main/remote/orchestrator.ts` emits a `"transfer"` event, and only while a world
     * is going up: its size is known before anything leaves this computer, sized folder by
     * folder in `sizeOfFolder`. There is at most one entry - one render sends at most one
     * world upload's worth of bytes - and it is replaced wholesale on every event rather
     * than appended to, because each event already carries the running total.
     */
    const transferStats = ref<readonly TransferStat[]>([]);
    /**
     * The upload's last sample, for a rate that is never extrapolated from one point.
     *
     * `bytesPerSecond` on a fresh transfer is null until a second sample exists to measure
     * a delta against - the first sample only says a transfer has begun, not how fast.
     */
    let lastTransferSample: { atMs: number; bytesDone: number } | null = null;

    /**
     * The estimator, which is upstream's own maths and not a second one.
     *
     * Fed the *overall* fraction rather than the current task's, because the question a
     * person is asking of this screen is how long until the render is done, not how long
     * until this one of nine tasks is. The formula - extrapolated whole-run durations in a
     * bounded window, stalled intervals charged forward - is `ProgressTracker`'s, ported in
     * `packages/engine/src/map/rendermanager/`.
     */
    const eta = createEtaTracker();

    let nextLogId = 1;
    /**
     * The advice table's one-shot state, which belongs to this run and not to the app.
     *
     * A tip offered on the first estimate of one render is worth offering again on the
     * first estimate of the next. A shared annotator would show it to whoever rendered
     * first and to nobody afterwards, which is indistinguishable from the feature not
     * working.
     */
    const annotator = createAnnotator();
    /**
     * True once the end of the run has been written into the log.
     *
     * The end arrives twice on the ordinary path: as an event, and again in the result
     * `settle` applies. Both are needed, because a render refused before anything was
     * spawned emits no events at all. This is what stops the ordinary path printing
     * "Stopped." twice.
     */
    let ended = false;
    /**
     * True between asking for a render and learning its id.
     *
     * The engine derives a stable render id from the world folder, which is what
     * makes a second render of the same world carry on from the first rather than
     * starting again. That means the interface does not know the id until the
     * engine says it, and events start arriving before `startRender` resolves. So
     * the first `started` event after asking is adopted, and everything else is
     * matched against the id it carried.
     */
    let adopting = false;

    const percent = computed(() => {
        const current = task.value;
        if (current === null) return 0;
        return Math.max(0, Math.min(100, current.percent));
    });

    const indeterminate = computed(
        () => (state.value === "starting" || state.value === "running") && task.value === null,
    );

    const active = computed(() => state.value === "starting" || state.value === "running");

    /* ---------------------------------------------------------------------- */
    /* The breakdown                                                          */
    /* ---------------------------------------------------------------------- */

    /**
     * An event's own timestamp, or the clock when it did not carry a usable one.
     *
     * The bridge sends ISO strings. Falling back to the clock rather than to null matters
     * because the two timers on screen - elapsed, and how long it has been quiet - are the
     * whole point of this panel, and an unparseable timestamp would silently switch them
     * off rather than being slightly wrong.
     */
    function timeOf(at: string | undefined): number {
        if (at === undefined) return now();
        const parsed = Date.parse(at);
        return Number.isNaN(parsed) ? now() : parsed;
    }

    /**
     * Bytes per second, measured between this sample and the one before it.
     *
     * Never from one sample against the transfer's start: an upload's own first sample
     * often arrives well after the transfer began (staging, `mkdir`, the preflight already
     * behind it), and dividing by that stale elapsed time would report a rate nobody would
     * believe. Two consecutive samples, close together, is what a rate this application
     * stands behind actually needs.
     */
    function transferRate(bytesDone: number, atMs: number): number | null {
        const previous = lastTransferSample;
        lastTransferSample = { atMs, bytesDone };
        if (previous === null) return null;
        const elapsedMs = atMs - previous.atMs;
        const movedBytes = bytesDone - previous.bytesDone;
        if (elapsedMs <= 0 || movedBytes <= 0) return null;
        return (movedBytes / elapsedMs) * 1000;
    }

    /**
     * How much of one map a task represents.
     *
     * Upstream runs three tasks per map - prepare, update, save - each reporting 0 to 100%
     * of itself. Feeding all three straight into an overall bar would send it backwards
     * twice per map, so each kind contributes what it actually means: preparing has not
     * started the map, updating is the long one and carries its own percentage, and saving
     * means the map is drawn. A kind this port does not recognise contributes its own
     * percentage when it names a map and nothing when it does not, which is what keeps a
     * remote transfer - which names no map - out of the render's overall figure.
     */
    function mapFraction(current: RenderTaskProgress): number {
        const percent = Math.max(0, Math.min(100, current.percent)) / 100;
        switch (current.kind) {
            case "preparing-map":
                return 0;
            case "updating-map":
                return percent;
            case "saving-map":
            case "purging-map":
            case "deleting-map":
                return 1;
            default:
                return current.mapId === null ? 0 : percent;
        }
    }

    /** Maps done out of maps planned, or null before either number exists. */
    function mapsCount(): ProgressCount | null {
        const planned = mapIds.value.length;
        const seen = observedMaps.value;
        const total = planned > 0 ? Math.max(planned, seen.length) : seen.length > 0 ? seen.length : null;
        if (total === null) return null;
        if (state.value === "finished") return { done: total, total, unit: "maps" };
        const current = task.value?.mapId ?? null;
        const index = current === null ? -1 : seen.indexOf(current);
        // Between tasks the maps already seen are the maps already done. While one is being
        // worked on, the ones before it in the order they were first named are.
        const done = index >= 0 ? index : seen.length;
        return { done: Math.min(done, total), total, unit: "maps" };
    }

    /** 0 to 1 across the whole render, or null when the number of maps is not known. */
    function overallFraction(): number | null {
        if (state.value === "finished") return 1;
        const count = mapsCount();
        if (count === null || count.total === null || count.total === 0) return null;
        const current = task.value;
        const fraction = current === null ? 0 : mapFraction(current);
        return Math.max(0, Math.min(1, (count.done + fraction) / count.total));
    }

    /**
     * How long is left, preferring the engine's own answer over this application's.
     *
     * The engine prints an estimate for the task it is on; when it does, that is the more
     * precise statement and it is used in its own words. The tracker is what fills the
     * silence - upstream omits the estimate entirely whenever its own is not positive - and
     * it says so, because a number this application worked out should never be mistaken for
     * one the engine stood behind. When neither has anything, nothing is shown.
     */
    function estimate(): ProgressEstimate {
        const current = task.value;
        if (current !== null) {
            if (current.etaText !== null && current.etaText.trim() !== "") {
                return { source: "engine", seconds: current.etaSeconds, text: current.etaText };
            }
            if (current.etaSeconds !== null) {
                return { source: "engine", seconds: current.etaSeconds, text: null };
            }
        }
        const fraction = overallFraction();
        if (fraction === null) return NO_ESTIMATE;
        const remaining = eta.remainingMs(fraction);
        return remaining === null ? NO_ESTIMATE : { source: "tracker", seconds: remaining / 1000, text: null };
    }

    function levels(): readonly ProgressLevel[] {
        const built: ProgressLevel[] = [];
        const count = mapsCount();
        const fraction = overallFraction();
        built.push({
            id: "overall",
            label: { key: "progress.level.overall", fallback: "Overall", values: {} },
            detail: null,
            percent: fraction === null ? null : fraction * 100,
            count,
        });

        const current = task.value;
        const phaseName = phase.value;
        if (phaseName !== null) {
            built.push({
                id: "phase",
                label: phaseText(phaseName),
                detail: null,
                // Only when the percentage belongs to the phase being named. Between the
                // two, the phase is honestly of unknown size: loading resources and reading
                // a world report no percentage at all, and inventing one for them is exactly
                // the bar that creeps to 99% and is never believed again.
                percent:
                    current !== null && taskPhase.value === phaseName
                        ? Math.max(0, Math.min(100, current.percent))
                        : null,
                count: null,
            });
        }

        if (current !== null) {
            built.push({
                id: "task",
                label: { key: "progress.level.task", fallback: "Right now", values: {} },
                // Upstream's own description, verbatim: `updating map 'overworld'`. It is
                // the most precise statement available and the string somebody would search.
                detail: current.description === "" ? null : current.description,
                percent: Math.max(0, Math.min(100, current.percent)),
                count: null,
            });
        }

        return built;
    }

    function notes(): readonly ProgressText[] {
        const built: ProgressText[] = [];
        if (mapTaskSeen.value) {
            built.push({
                key: "progress.note.noTileCounts",
                fallback:
                    "The engine's own progress line for a map or a region is a percentage only - upstream's CLI never prints how many tiles, regions or chunks that percentage is out of, so there is no count to show beside it.",
                values: {},
            });
        }
        if (downloadTransferSeen.value) {
            built.push({
                key: "progress.note.stagedNotBytes",
                fallback:
                    "Fetching the rendered map back is reported as files staged, not as bytes moved: its size is not known until the render on the far end has finished, so there is no byte count or transfer rate to show for that part.",
                values: {},
            });
        }
        return built;
    }

    const progress = computed<ProgressFacts>(() => ({
        route: resolveRoute(options.route),
        active: active.value,
        startedAtMs: startedAtMs.value,
        lastEventAtMs: lastEventAtMs.value,
        lastProgressAtMs: lastProgressAtMs.value,
        levels: levels(),
        estimate: estimate(),
        // Real bytes when the remote route's own "transfer" event supplied them. See
        // `transferStats`'s own comment for why only the upload direction ever can.
        transfers: transferStats.value,
        // Nothing on this stream shards. A local, container or SSH render is one engine.
        shards: [],
        notes: notes(),
    }));

    function mine(event: RenderEvent): boolean {
        if (renderId.value === null) {
            if (!adopting) return false;
            if (event.type !== "started") return false;
            renderId.value = event.renderId;
            adopting = false;
            return true;
        }
        return event.renderId === renderId.value;
    }

    function push(line: RenderLogLine): void {
        const result = appendLine(log.value, line, LOG_LIMIT);
        log.value = result.lines;
        logDropped.value += result.dropped;
    }

    /** One line of the engine's own output, annotated as it arrives. */
    function append(level: string, message: string, at: string): void {
        push({
            id: nextLogId++,
            level: normaliseLevel(level),
            origin: "engine",
            message,
            text: null,
            at,
            annotations: annotator.annotate(message),
        });
    }

    /**
     * One line of this app narrating what it is doing.
     *
     * Written into the same stream as the engine's output rather than shown somewhere
     * else, because the value of it is the ordering: "Stopping." between the last
     * progress tick and the engine's own farewell is what turns a wall of output into an
     * account of what happened.
     */
    function signal(text: ConsoleText): void {
        push({
            id: nextLogId++,
            level: "signal",
            origin: "app",
            message: "",
            text,
            at: new Date().toISOString(),
            // The app does not annotate its own sentences. Running the table over them
            // would let a status line the app wrote trigger advice about a line the
            // engine never printed.
            annotations: [],
        });
    }

    /** The one closing line, whichever of the two paths reaches the end first. */
    function noteEnd(text: ConsoleText): void {
        if (ended) return;
        ended = true;
        signal(text);
        const waiters = inactiveWaiters;
        inactiveWaiters = [];
        for (const resolve of waiters) resolve();
    }

    /** How a failure ends the narrative: with the engine's exit code when it ran. */
    function endedByFailure(reason: RenderFailure): ConsoleText {
        return reason.exitCode === null ? SIGNALS.failed : stoppedWithCode(reason.exitCode);
    }

    /**
     * Reads back the record the render wrote about itself.
     *
     * `render.json` names the engine that actually ran, which is not the same claim
     * as the one this process made when it started: the record is written by the
     * render, so it is evidence rather than an expectation. It is read once the
     * render has ended, because that is when the record is complete.
     *
     * A bridge with nothing to answer with resolves null - `resolveWorldBridge`
     * substitutes exactly that for a preload without `renderEngine` - and a read
     * that throws is left alone. Either way the panel falls back to the engine the
     * events described and never invents one.
     */
    async function loadProvenance(): Promise<void> {
        const id = renderId.value;
        if (bridge === null || id === null) return;
        try {
            const record = await bridge.renderEngine(id);
            // The run may have been reset and pointed at another render while this was
            // in flight, and labelling that one with this one's engine would be a lie
            // of exactly the kind the record exists to prevent.
            if (record !== null && renderId.value === id) provenance.value = record;
        } catch {
            // Nothing to say: the live description is still on screen.
        }
    }

    function handle(event: RenderEvent): void {
        if (!mine(event)) return;

        // Before the switch, and for every kind including a log line. "Has anything arrived
        // recently" is a different question from "has a bar moved recently", and an engine
        // that is logging steadily while reporting no percentage - which is exactly what
        // loading resources looks like - is working rather than stuck.
        const at = timeOf(event.at);
        lastEventAtMs.value = at;

        switch (event.type) {
            case "started":
                state.value = "running";
                engine.value = event.engine;
                mapIds.value = event.mapIds;
                startedAt.value = event.at;
                startedAtMs.value = at;
                phase.value = "starting";
                // The rate of whatever ran before says nothing about this one, and a single
                // leftover sample from a fast render would make a slow one report an
                // absurdly short time remaining.
                eta.reset();
                signal(SIGNALS.running);
                break;
            case "phase":
                phase.value = event.phase;
                break;
            case "progress":
                phase.value = event.phase;
                task.value = event.task;
                taskPhase.value = event.phase;
                lastProgressAtMs.value = at;
                if (event.task.mapId !== null && !observedMaps.value.includes(event.task.mapId)) {
                    observedMaps.value = [...observedMaps.value, event.task.mapId];
                }
                // A progress report naming no map, during the "rendering" phase itself, is
                // a real per-map or per-region task upstream's log format simply has no
                // count in - see `mapTaskSeen`'s own comment. One naming no map during the
                // phases either side of rendering is the remote route moving files instead;
                // it is real progress and gets its own bar, but it is not a map being drawn
                // and must not move the overall one.
                if (event.phase === "rendering") {
                    mapTaskSeen.value = true;
                } else if (event.task.mapId === null && event.phase === "stopping") {
                    downloadTransferSeen.value = true;
                }
                {
                    const fraction = overallFraction();
                    if (fraction !== null) eta.observe(fraction, at);
                }
                break;
            case "transfer": {
                const rate = transferRate(event.bytesDone, at);
                transferStats.value = [
                    {
                        id: `${event.renderId}-${event.direction}`,
                        direction: event.direction,
                        label:
                            event.direction === "up"
                                ? {
                                      key: "progress.transfer.sending",
                                      fallback: "Sending files",
                                      values: {},
                                  }
                                : {
                                      key: "progress.transfer.fetching",
                                      fallback: "Fetching the rendered map",
                                      values: {},
                                  },
                        bytesDone: event.bytesDone,
                        bytesTotal: event.bytesTotal,
                        bytesPerSecond: rate,
                    },
                ];
                lastProgressAtMs.value = at;
                break;
            }
            case "log":
                append(event.level, event.message, event.at);
                break;
            case "finished":
                state.value = "finished";
                phase.value = "finished";
                dataRoot.value = event.dataRoot;
                mapIds.value = event.mapIds;
                engine.value = event.engine;
                durationMs.value = event.durationMs;
                cancelling.value = false;
                // Zero rather than "no code": the engine ran to completion, and the
                // number a person would look for in a terminal is the one it exited with.
                noteEnd(stoppedWithCode(0));
                void loadProvenance();
                break;
            case "failed":
                state.value = "failed";
                failure.value = event.failure;
                cancelling.value = false;
                noteEnd(endedByFailure(event.failure));
                void loadProvenance();
                break;
            case "cancelled":
                state.value = "cancelled";
                cancelling.value = false;
                noteEnd(SIGNALS.cancelled);
                void loadProvenance();
                break;
        }
    }

    const unsubscribe = bridge === null ? () => undefined : bridge.onRenderEvent(handle);

    function reset(): void {
        if (active.value) return;
        state.value = "idle";
        renderId.value = null;
        engine.value = null;
        provenance.value = null;
        phase.value = null;
        task.value = null;
        mapIds.value = [];
        dataRoot.value = null;
        durationMs.value = null;
        failure.value = null;
        log.value = [];
        logDropped.value = 0;
        cancelling.value = false;
        startedAt.value = null;
        renderThreads.value = null;
        renderThreadPriority.value = null;
        observedMaps.value = [];
        startedAtMs.value = null;
        lastEventAtMs.value = null;
        lastProgressAtMs.value = null;
        taskPhase.value = null;
        mapTaskSeen.value = false;
        downloadTransferSeen.value = false;
        transferStats.value = [];
        lastTransferSample = null;
        eta.reset();
        adopting = false;
        ended = false;
        annotator.reset();
    }

    function expect(id: string): void {
        if (active.value) return;
        reset();
        renderId.value = id;
        state.value = "starting";
        // The clock starts when this surface starts watching, which is honest about what it
        // measures: a render adopted from another window has been going for longer than
        // this, and claiming its real start time from a number nobody sent would be worse.
        startedAtMs.value = now();
        lastEventAtMs.value = startedAtMs.value;
        signal(SIGNALS.watching);
    }

    /**
     * The backstop for a render whose events said nothing.
     *
     * A failure that happens before anything is spawned - a missing consent
     * record, no Java runtime - emits no events at all, so the resolved result is
     * the only place the reason exists. An outcome the events already reported is
     * left alone rather than restated.
     */
    function settle(result: RenderResult): void {
        renderId.value = result.renderId;

        if (result.ok) {
            if (state.value === "finished") return;
            state.value = "finished";
            dataRoot.value = result.dataRoot;
            mapIds.value = result.mapIds;
            engine.value = result.engine;
            durationMs.value = result.durationMs;
            noteEnd(stoppedWithCode(0));
        } else if (result.failure.code === "cancelled") {
            if (state.value !== "cancelled") state.value = "cancelled";
            noteEnd(SIGNALS.cancelled);
        } else if (state.value !== "failed" && state.value !== "cancelled") {
            state.value = "failed";
            failure.value = result.failure;
            noteEnd(endedByFailure(result.failure));
        }

        cancelling.value = false;
        void loadProvenance();
    }

    async function start(request: RenderRequest): Promise<RenderResult | null> {
        if (bridge === null || active.value) return null;

        lastRequest = request;
        reset();
        state.value = "starting";
        renderThreads.value = request.renderThreads ?? null;
        renderThreadPriority.value = request.renderThreadPriority ?? null;
        adopting = true;
        // The engine's own `started` event overwrites this with the moment it really began.
        // Until it arrives - which for a render that has to fetch a Java runtime first can
        // be a while - the elapsed clock counts from the press of the button, which is what
        // the person watching is timing anyway.
        startedAtMs.value = now();
        lastEventAtMs.value = startedAtMs.value;
        signal(SIGNALS.starting);

        let result: RenderResult;
        try {
            result = await bridge.startRender(request);
        } catch (error) {
            // The bridge is documented never to reject, so this is a broken bridge
            // rather than a failed render. Saying so is more useful than showing it
            // as an engine failure it never got as far as.
            adopting = false;
            state.value = "failed";
            failure.value = {
                code: "bridge-failed",
                message: error instanceof Error ? error.message : String(error),
                settings: null,
                detail: null,
                exitCode: null,
            };
            noteEnd(SIGNALS.failed);
            return null;
        }

        adopting = false;
        settle(result);
        return result;
    }

    async function cancel(): Promise<boolean> {
        const id = renderId.value;
        if (bridge === null || id === null || !active.value) return false;
        cancelling.value = true;
        signal(SIGNALS.stopping);
        try {
            return await bridge.cancelRender(id);
        } catch {
            cancelling.value = false;
            return false;
        }
    }

    async function adjustSpeed(level: SpeedLevelNumber): Promise<SpeedAdjustmentResult | null> {
        const id = renderId.value;
        if (bridge === null || id === null) return null;
        // Optional on `WorldBridge` itself - see that field's own doc comment - because a
        // caller reached through `resolveWorldBridge` never sees it missing, only a fake
        // built directly (as some still are, elsewhere in this package) predating it might.
        if (bridge.adjustRenderSpeed === undefined) {
            return {
                ok: false,
                renderId: id,
                level,
                route: "unsupported",
                appliedNow: false,
                needsRestart: false,
                reason: "not-running",
                message: "This build cannot adjust a render's speed while it is running yet.",
                detail: null,
            };
        }
        try {
            return await bridge.adjustRenderSpeed(id, level);
        } catch (error) {
            // The bridge is documented never to reject; this mirrors `start()`'s own
            // treatment of that promise breaking its own contract, as a refusal the
            // caller can show rather than an unhandled rejection three frames up.
            return {
                ok: false,
                renderId: id,
                level,
                route: "unsupported",
                appliedNow: false,
                needsRestart: false,
                reason: "not-running",
                message: error instanceof Error ? error.message : String(error),
                detail: null,
            };
        }
    }

    async function restartWithLevel(level: SpeedLevelNumber): Promise<RenderResult | null> {
        if (bridge === null || lastRequest === null) return null;

        if (active.value) {
            let waiter: (() => void) | null = null;
            const stopped = new Promise<void>((resolve) => {
                waiter = resolve;
                inactiveWaiters.push(resolve);
            });
            const acknowledged = await cancel();
            if (!acknowledged) {
                // Nothing was actually asked to stop - drop the waiter rather than hang
                // forever waiting for an ending that was never set in motion.
                if (waiter !== null) inactiveWaiters = inactiveWaiters.filter((entry) => entry !== waiter);
            } else {
                await stopped;
            }
        }

        const speed = speedLevelByNumber(level);
        return await start({
            ...lastRequest,
            renderThreads: speed.threadCount,
            renderThreadPriority: speed.threadPriority,
        });
    }

    function dispose(): void {
        unsubscribe();
    }

    return {
        state,
        renderId,
        engine,
        provenance,
        phase,
        task,
        percent,
        indeterminate,
        progress,
        mapIds,
        dataRoot,
        durationMs,
        failure,
        log,
        logDropped,
        cancelling,
        startedAt,
        renderThreads,
        renderThreadPriority,
        active,
        available: bridge !== null,
        start,
        expect,
        settle,
        cancel,
        adjustSpeed,
        restartWithLevel,
        reset,
        dispose,
    };
}
