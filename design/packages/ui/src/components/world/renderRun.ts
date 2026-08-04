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
import type {
    EngineDescription,
    RenderEvent,
    RenderFailure,
    RenderRequest,
    RenderResult,
    RenderSummary,
    RenderTaskProgress,
    SettingsTarget,
    WorldBridge,
} from "./worldBridge.js";
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

/** What a phase is called on screen. Unknown phases are shown as they arrive. */
export function phaseLabel(phase: string | null, t: Translate): string {
    switch (phase) {
        case null:
            return "";
        case "starting":
            return t("world.run.phase.starting", "Starting the engine");
        case "downloading-resources":
            return t("world.run.phase.downloading", "Downloading the Minecraft client files");
        case "loading-resources":
            return t("world.run.phase.loadingResources", "Loading textures and models");
        case "loading-maps":
            return t("world.run.phase.loadingMaps", "Reading the world");
        case "rendering":
            return t("world.run.phase.rendering", "Rendering tiles");
        case "watching":
            return t("world.run.phase.watching", "Watching the world for changes");
        case "stopping":
            return t("world.run.phase.stopping", "Finishing up");
        case "finished":
            return t("world.run.phase.finished", "Finished");
        default:
            return phase;
    }
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
    | "engine-failed";

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
    /** Clears the finished, failed or cancelled state so another render can be started. */
    reset(): void;
    /** Stops listening. Called when the surface holding this goes away. */
    dispose(): void;
}

export function createRenderRun(bridge: WorldBridge | null): RenderRun {
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

        switch (event.type) {
            case "started":
                state.value = "running";
                engine.value = event.engine;
                mapIds.value = event.mapIds;
                startedAt.value = event.at;
                phase.value = "starting";
                signal(SIGNALS.running);
                break;
            case "phase":
                phase.value = event.phase;
                break;
            case "progress":
                phase.value = event.phase;
                task.value = event.task;
                break;
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
        adopting = false;
        ended = false;
        annotator.reset();
    }

    function expect(id: string): void {
        if (active.value) return;
        reset();
        renderId.value = id;
        state.value = "starting";
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

        reset();
        state.value = "starting";
        adopting = true;
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
        mapIds,
        dataRoot,
        durationMs,
        failure,
        log,
        logDropped,
        cancelling,
        startedAt,
        active,
        available: bridge !== null,
        start,
        expect,
        settle,
        cancel,
        reset,
        dispose,
    };
}
