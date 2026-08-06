/**
 * Rendering a world, from a request to a map the viewer can open.
 *
 * The order of the steps is the design. Consent is checked **first**, before a
 * workspace is created, before a JDK is looked for, before a jar is resolved and long
 * before anything is spawned, so a person who has not accepted the Mojang download
 * cannot reach a state where the app has started downloading a client jar on their
 * behalf. It also means the answer arrives instantly rather than after a JDK probe,
 * which is what makes it read as a decision rather than as a failure.
 *
 * What this deliberately does not do is ask. `consent.ts` says it plainly: the question
 * is asked once at first launch and remembered forever. Putting a licence in front of
 * somebody who has just chosen a world and pressed Render is how people learn to click
 * through consent screens without reading them. A render without consent reports what
 * is missing and points at the settings row that changes it.
 *
 * ## Two places a render can run, and one of them is the default
 *
 * {@link RenderRequest.runtime} chooses between running the engine as a program on this
 * computer and running it in a container. **Absent means local**, so every caller written
 * before the field existed - and every request stored by `session.ts` and replayed by
 * `resume.ts` - keeps exactly the behaviour it already had, with no edit anywhere.
 *
 * The local path below is unchanged: the same `writeRenderConfig`, the same `CliRun`, the
 * same arguments in the same order. It is the route with an end-to-end proof behind it,
 * and a second mode is not worth one line of risk to it.
 *
 * Everything the *interface* sees is written once and shared. Both modes emit the same
 * {@link RenderEvent}s from the same `RenderOutputTracker`, move through the same phases,
 * are classified by the same {@link classifyRunFailure}, and are stopped by the same
 * `cancel()`. That is not a promise kept by discipline; it is kept by there being no
 * second code path for progress, failure or cancellation to differ on. What differs is
 * three things and they are all here:
 *
 * ```
 * which config is written   host paths (render/config.ts) vs container paths (runtime/config.ts)
 * what is spawned           the JVM (render/runner.ts)    vs `docker run` (runtime/process.ts)
 * what a cancel asks        the child process              vs the daemon, by container name
 * ```
 *
 * ## Docker is refused, never quietly substituted
 *
 * If a container is asked for and Docker cannot take one, the render fails with the
 * reason `runtime/docker.ts` gives - which distinguishes "not installed" from "installed,
 * daemon stopped" - and nothing is spawned. Rendering locally instead would be worse than
 * the refusal: the person gets a finished map, believes they have tested the container
 * path, and finds out otherwise the first time they depend on it.
 */

import { mkdir, stat } from "node:fs/promises";
import { writeEngineConfig } from "../runtime/config.js";
import { dockerUsable, probeDocker } from "../runtime/docker.js";
import type { DockerReport, ProbeDockerOptions } from "../runtime/docker.js";
import type { ContainerHandoffStore } from "../runtime/handoff.js";
import { CONTAINER_DATA_DIR, CONTAINER_WEB_ROOT, MountRefusedError } from "../runtime/mounts.js";
import {
    DEFAULT_RUNTIME_MODE,
    containerName,
    containerWorldPathFor,
    planDockerLaunch,
} from "../runtime/plan.js";
import type { EngineLaunch, RuntimeMode } from "../runtime/plan.js";
import { EngineProcess } from "../runtime/process.js";
import type { SpawnEngine } from "../runtime/process.js";
import { CONTAINER_PREFIX } from "../runtime/reattach.js";
import {
    applyDockerCpuQuota,
    applyLocalPriority,
    hostCpuCount,
    isSpeedLevel,
    localPriorityLevelFor,
    type DockerCpuControl,
    type PriorityControl,
    type SpeedLevelNumber,
} from "../runtime/speedControl.js";
import type { CommandRunner } from "../runtime/command.js";
import { writeRenderConfig, validateMaps, InvalidRenderRequestError } from "./config.js";
import type { RenderMapRequest } from "./config.js";
import * as failures from "./failure.js";
import type { RenderFailure } from "./failure.js";
import { LocalMapHandler } from "./LocalMapHandler.js";
import type { RenderPhase, RenderSignal, RenderTaskProgress, CliLogLevel } from "./progress.js";
import {
    RENDER_ENGINE_LABELS,
    RENDER_RECORD_VERSION,
    describeEngine,
    readRenderRecord,
    writeRenderRecord,
} from "./provenance.js";
import type { RenderEngineId, RenderOutcome, RenderRecord } from "./provenance.js";
import { CliRun } from "./runner.js";
import type { SpawnCli } from "./runner.js";
import type { RenderSessionStore } from "./session.js";
import { renderIdForWorld, renderWorkspace } from "./workspace.js";
import type { RenderWorkspace } from "./workspace.js";
import { collectEvidence } from "../repair/evidence.js";
import type { RepairEvidence } from "../repair/evidence.js";
import { REQUIRED_JAVA_FEATURE } from "../java/version.js";

/** Everything the orchestrator needs to know about the engine it is about to run. */
export interface ResolvedEngine {
    readonly engine: RenderEngineId;
    /** Upstream's git-derived jar version, e.g. `5.22-27`. */
    readonly engineVersion: string;
    /** Absolute path to the jar. */
    readonly enginePath: string;
    /** Absolute path to the `java` executable that will run it. */
    readonly javaExecutable: string;
    readonly javaVersion: string | null;
}

/**
 * The runtime modes {@link RenderOrchestrator.render} actually honours.
 *
 * Distinct from "which modes exist" and from "is Docker running on this machine", and the
 * distinction is the reason the constant is exported. A surface that reads Docker's health
 * as this build's capability offers a choice that renders locally anyway, which is worse
 * than not offering it - the person believes they chose.
 */
export const RENDER_RUNTIME_MODES: readonly RuntimeMode[] = ["local", "docker"];

export interface RenderRequest {
    readonly maps: readonly RenderMapRequest[];
    /**
     * Where to run the engine. **Absent means local**, which is the point of it being
     * optional: every caller and every stored request written before this field existed
     * keeps the behaviour it already had, with no edit and no migration.
     *
     * `docker` is honoured or refused, never approximated. See the note at the top.
     */
    readonly runtime?: RuntimeMode;
    /** Defaults to a stable id derived from the first map's world folder. */
    readonly renderId?: string;
    /** `-f`: re-render everything rather than only what changed since last time. */
    readonly force?: boolean;
    /** `-e`: re-render map edges. */
    readonly fixEdges?: boolean;
    readonly jvmArgs?: readonly string[];
    /** Turn on upstream's metrics reporting. Off unless asked for. */
    readonly metrics?: boolean;
    readonly renderThreads?: number;
}

/**
 * What one finished run reports, whichever mode produced it.
 *
 * `CliRunResult` and `EngineRunResult` both satisfy it, which is what lets
 * {@link classifyRunFailure} - unchanged, and the file's sharpest piece of logic - decide
 * a container render's outcome by exactly the rules it decides a local one by. A second
 * classifier would be a second set of rules about what "finished" means, and the two would
 * disagree the first time either was improved.
 */
export interface RenderRunOutcome {
    readonly exitCode: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly cancelled: boolean;
    readonly upToDate: boolean;
    readonly mapsScheduled: number | null;
    readonly consentMissing: boolean;
    readonly diagnostics: readonly string[];
    readonly durationMs: number;
    /**
     * Upstream's multi-line "problem with your BlueMap setup" banners, in order.
     *
     * Both `CliRunResult` and `EngineRunResult` already carry this; it was simply never
     * declared on the narrower interface the two are read through here. Added so a
     * genuine render failure can hand the repair module the same evidence either
     * concrete run type actually collected, rather than a copy this file re-derives.
     */
    readonly setupProblems: readonly string[];
    /** Map ids the engine reported loading. Same reason as {@link setupProblems}. */
    readonly mapsLoaded: readonly string[];
}

/**
 * What the orchestrator needs of a run in flight.
 *
 * `cancel()` means the same thing to a caller in both modes and something different
 * underneath: locally it signals the child, and in a container it asks the *daemon* to
 * stop the container by name. `runtime/process.ts` owns that difference. Killing the
 * `docker run` client instead would leave the container rendering into somebody's disk
 * with nothing holding a handle to it - the orphan `runner.ts` refuses to create, made by
 * another route.
 */
interface RenderRun {
    start(): Promise<RenderRunOutcome>;
    cancel(): void;
    /**
     * The OS process id this run is backed by right now, or `null` when there is none to
     * address. Both `CliRun` and `EngineProcess` document exactly what that id addresses
     * for their own mode - see either class's own `pid()` doc comment.
     */
    pid(): number | null;
}

/**
 * What a live render is running as, kept beside the `RenderRun` itself so
 * {@link RenderOrchestrator.adjustSpeed} can decide a route without re-deriving it from a
 * launch that may no longer be in scope by the time somebody drags a slider.
 */
interface RunningRender {
    readonly run: RenderRun;
    readonly mode: RuntimeMode;
    /** Set only for a container render - the exact name `docker update` must address. */
    readonly containerName: string | null;
    /** The `docker` binary this render's container was launched with, if it is one. */
    readonly dockerCommand: string;
}

/**
 * Why a level 1-5 request to a route that only carries part of the range - Docker's, per
 * `runtime/speedControl.ts`'s own header comment - resolved the way it did, `"applied"`
 * included. Never invented on the interface's behalf; the orchestrator names the real
 * reason so the surface never has to guess at one.
 */
export type SpeedAdjustmentReason =
    | "applied"
    | "priority-refused"
    | "process-exited"
    | "container-stopped"
    | "not-running"
    | "invalid-level";

/**
 * What one live speed-adjustment request did, and what it did not.
 *
 * `appliedNow` and `needsRestart` are the feature's whole honesty contract, spelled out as
 * two separate booleans rather than left for a caller to infer from `route` or `reason`:
 * something can be true of both at once (a local priority change lands immediately, and
 * the thread count and thread priority baked into this render's launch still do not move
 * until the next one), and a surface that only reads one of the two would either claim more
 * happened than did or hide the part that genuinely did.
 */
export interface SpeedAdjustmentResult {
    readonly ok: boolean;
    readonly renderId: string;
    readonly level: SpeedLevelNumber;
    readonly route: "local" | "docker" | "unsupported";
    /** True when something about the live process or container was actually changed now. */
    readonly appliedNow: boolean;
    /**
     * True when reaching this level's full effect needs the render restarted - always true
     * today, because the thread-count/thread-priority half of the novice dial is baked into
     * a launch's JVM arguments and cannot move without one. Named explicitly rather than
     * implied so a future route that genuinely applies everything live is not silently
     * mis-reported by an assumption written before it existed.
     */
    readonly needsRestart: boolean;
    readonly reason: SpeedAdjustmentReason;
    /** One sentence for a person, naming exactly what changed and what did not. */
    readonly message: string;
    /** The refusal's own words, when the route or the OS had any. */
    readonly detail: string | null;
}

export interface EngineDescription {
    readonly id: RenderEngineId;
    /** What to show on screen, e.g. `BlueMap engine (Java) 5.22-27 on Java 25.0.3`. */
    readonly label: string;
    readonly version: string;
    readonly javaVersion: string | null;
}

export interface RenderStartedEvent {
    readonly type: "started";
    readonly renderId: string;
    readonly mapIds: readonly string[];
    readonly engine: EngineDescription;
    readonly at: string;
}

export interface RenderPhaseEvent {
    readonly type: "phase";
    readonly renderId: string;
    readonly phase: RenderPhase;
    readonly at: string;
}

export interface RenderProgressEvent {
    readonly type: "progress";
    readonly renderId: string;
    readonly phase: RenderPhase;
    readonly task: RenderTaskProgress;
    readonly at: string;
}

/**
 * Bytes actually counted for a transfer, on their own event rather than folded into
 * {@link RenderProgressEvent}'s item-based percentage.
 *
 * Only `main/remote/orchestrator.ts` emits this, and only for `direction: "up"`: the size
 * of what is being sent is known before anything leaves this computer, but the size of the
 * rendered map coming back is not known until the remote render has finished producing it,
 * so a `"down"` transfer would carry a total nobody could vouch for. `bytesTotal` is `null`
 * rather than a guess whenever a path's size could not be measured.
 */
export interface RenderTransferEvent {
    readonly type: "transfer";
    readonly renderId: string;
    readonly direction: "up" | "down";
    readonly bytesDone: number;
    readonly bytesTotal: number | null;
    readonly at: string;
}

export interface RenderLogEvent {
    readonly type: "log";
    readonly renderId: string;
    readonly level: CliLogLevel;
    readonly message: string;
    readonly at: string;
}

export interface RenderFinishedEvent {
    readonly type: "finished";
    readonly renderId: string;
    /** What to hand the viewer as its `dataRoot`. */
    readonly dataRoot: string;
    readonly mapIds: readonly string[];
    readonly engine: EngineDescription;
    readonly durationMs: number;
    readonly at: string;
}

export interface RenderFailedEvent {
    readonly type: "failed";
    readonly renderId: string;
    readonly failure: RenderFailure;
    readonly at: string;
}

export interface RenderCancelledEvent {
    readonly type: "cancelled";
    readonly renderId: string;
    readonly at: string;
}

/**
 * Cancellation is its own event rather than a failure with a code.
 *
 * A cancelled render is not an error and must not be shown as one. Folding it into the
 * failure channel is exactly how a person who pressed Cancel ends up looking at a red
 * banner telling them something went wrong.
 */
export type RenderEvent =
    | RenderStartedEvent
    | RenderPhaseEvent
    | RenderProgressEvent
    | RenderTransferEvent
    | RenderLogEvent
    | RenderFinishedEvent
    | RenderFailedEvent
    | RenderCancelledEvent;

export interface RenderSuccess {
    readonly ok: true;
    readonly renderId: string;
    readonly dataRoot: string;
    readonly mapIds: readonly string[];
    readonly engine: EngineDescription;
    readonly durationMs: number;
    readonly record: RenderRecord;
}

export interface RenderFailureResult {
    readonly ok: false;
    readonly renderId: string;
    readonly failure: RenderFailure;
    readonly record: RenderRecord | null;
}

export type RenderResult = RenderSuccess | RenderFailureResult;

export interface RenderOrchestratorOptions {
    /**
     * Absolute directory renders are written under, already token-expanded.
     *
     * A function is accepted because the person can change where maps are written from
     * the setup step, and a value captured at construction would keep writing to the
     * old folder until the app was restarted - with no sign that it had.
     */
    readonly storageDir: string | (() => string);
    /**
     * Whether the Mojang download has been accepted.
     *
     * A function rather than a boolean because the answer can change while the app is
     * running: somebody can accept it in Settings between two renders, and somebody can
     * withdraw it. Reading it at the moment of the render is the only reading that is
     * current.
     */
    readonly hasConsent: () => boolean;
    readonly resolveEngine: () => Promise<ResolvedEngine>;
    /** Where a finished render is mounted for the viewer. */
    readonly mounts?: LocalMapHandler;
    /**
     * Where a render says it has started, how far it got, and how it ended.
     *
     * Optional, and everything below works without it: a render with no session store
     * still renders, still reports, still records provenance. What is lost is only the
     * ability to notice afterwards that it never finished. See `session.ts`.
     */
    readonly sessions?: RenderSessionStore;
    readonly onEvent?: (event: RenderEvent) => void;
    readonly appVersion?: string | null;
    readonly spawn?: SpawnCli;
    /**
     * Files a genuine render failure with the repair module, so the Diagnostics panel has
     * something to show. Optional, and everything above works without it: a render still
     * fails the same way, reports the same failure, and records the same provenance. What
     * is lost without it is only the repair registry's own copy of what happened - see
     * `main/index.ts`'s `startRepairDiagnostics`, whose `remember` is what this is meant to
     * receive.
     *
     * Never called for a cancellation - see the caller's own comment on why cancelling is
     * not a failure - and never let a throw from it escape `render()`: a repair module that
     * cannot file a record must not turn a reported failure into an unreported crash.
     */
    readonly rememberFailure?: (evidence: RepairEvidence) => void;
    readonly now?: () => Date;
    /**
     * The `-Xmx` ceiling to apply when a request does not already carry one.
     *
     * A function, for the same reason {@link storageDir} is: the ceiling is a persisted
     * setting somebody can change in Settings between two renders (`files/renderMemory.ts`),
     * and a value captured once at construction would keep applying whatever heap was chosen
     * at app launch. `main/index.ts` passes `() => renderMemory.jvmArgs()`.
     *
     * Never overrides a request that already names `jvmArgs` - today nothing sets one before
     * this runs, but a future caller (an advanced per-render override) must win over the
     * settings-wide default rather than being silently replaced by it.
     */
    readonly jvmArgs?: readonly string[] | (() => readonly string[]);

    /* ---- The container half. Every one of these is optional and local ignores them. ---- */

    /**
     * Whether Docker can take a container right now.
     *
     * Injected so every path below can be tested without a daemon anywhere near the test
     * machine: available, not installed, daemon stopped, permission refused. Those states
     * have different remedies and a test that can only produce one of them proves the
     * refusal works for one of them.
     */
    readonly probeDocker?: (options?: ProbeDockerOptions) => Promise<DockerReport>;
    /** The `docker` binary. A parameter so a test can name one that does not exist. */
    readonly docker?: string;
    /** The image a container render uses. Defaults to `runtime/plan.ts`'s stock JRE. */
    readonly dockerImage?: string;
    /**
     * `--user` for a container render, e.g. `1000:1000`.
     *
     * On Linux a container writing as root leaves root-owned tiles in a folder the
     * person's own account then cannot delete - a render that succeeds and leaves its
     * output unusable. Null on Windows and macOS, where the sharing layer maps ownership.
     */
    readonly containerUser?: string | null;
    /**
     * The account's home directory, so a mount of it can be refused **by name**.
     *
     * Omitting it does not disable the mount refusals - a drive root and the system
     * folders are still refused - but it does lose the one that matters most, because
     * pointing the world picker one level too high at a home folder is the mistake that
     * hands a container an entire profile.
     */
    readonly home?: string | null;
    /**
     * Where a container's name is written down before the container is started.
     *
     * Without it a container render still runs, still reports and still records its
     * provenance; what is lost is the ability to find the container again after the app
     * goes away, because `docker run` is a client and the daemon owns the container's
     * lifetime. See `runtime/handoff.ts`.
     */
    readonly containers?: ContainerHandoffStore;
    /** How a container is spawned. Injected so a test needs no Docker. */
    readonly spawnEngine?: SpawnEngine;
    /**
     * How a container is asked to stop. Injected so a test can prove the *daemon* is
     * asked rather than the client being killed.
     */
    readonly stopContainer?: (name: string) => Promise<void>;
    /**
     * How a live speed change reaches this machine's OS scheduler. Injected so a test can
     * prove the exact priority requested - and a refused raise - without touching this
     * process's own priority or depending on which OS the test happens to run on.
     */
    readonly priorityControl?: PriorityControl;
    /**
     * How a live speed change reaches Docker's daemon, as `docker update --cpus`. Distinct
     * from {@link stopContainer}: that is a single fixed command with no arguments to get
     * wrong, this one carries the exact quota being asked for, and a test wants to see it
     * without a daemon anywhere near the test machine.
     */
    readonly runner?: CommandRunner;
    /**
     * How many logical cores this host reports, for sizing a live Docker CPU quota.
     * Defaults to `runtime/speedControl.ts`'s own `hostCpuCount()`. Injected so a test's
     * expectations do not depend on how many cores the machine running the suite has.
     */
    readonly hostCpuCount?: () => number;
}

/** Raised by `resolveEngine` when there is no usable JDK. Carries the explanation. */
export class EngineUnavailableError extends Error {
    readonly reason: "java" | "jar";
    readonly detail: string;

    constructor(reason: "java" | "jar", detail: string) {
        super(detail);
        this.name = "EngineUnavailableError";
        this.reason = reason;
        this.detail = detail;
    }
}

export class RenderOrchestrator {
    private readonly options: RenderOrchestratorOptions;
    private readonly running = new Map<string, RunningRender>();

    constructor(options: RenderOrchestratorOptions) {
        this.options = options;
    }

    /** The directory renders are written under, right now. */
    storageDir(): string {
        const configured = this.options.storageDir;
        return typeof configured === "string" ? configured : configured();
    }

    /** Renders are keyed by id; this is what is in flight right now. */
    activeRenderIds(): string[] {
        return [...this.running.keys()];
    }

    /**
     * Asks a render to stop. Returns false when there is nothing running under that id.
     *
     * The promise returned by `render()` is what resolves when the process is actually
     * gone; this returns as soon as the request has been made, because the interface
     * needs to acknowledge the click immediately.
     */
    cancel(renderId: string): boolean {
        const running = this.running.get(renderId);
        if (running === undefined) return false;
        running.run.cancel();
        return true;
    }

    /**
     * Adjusts a render's speed while it is running, applying exactly what the render's
     * route can genuinely change right now and reporting exactly what it could not.
     *
     * Never throws, for the same reason nothing else on this class does: a slider being
     * dragged is not a place to let an OS refusal, an already-exited process or an
     * already-stopped container become an unhandled rejection three frames above a person
     * who only moved their mouse.
     *
     * Never touches this render's `core.conf`, its session record, or anything `resume.ts`
     * reads to decide whether a render can be carried on: the local route changes only this
     * OS's own bookkeeping about a live process id, and the Docker route changes only the
     * daemon's cgroup quota for a live container name. Neither writes a single byte this
     * render's own resumability depends on.
     */
    async adjustSpeed(renderId: string, level: SpeedLevelNumber): Promise<SpeedAdjustmentResult> {
        if (!isSpeedLevel(level)) {
            return {
                ok: false,
                renderId,
                level: 3,
                route: "unsupported",
                appliedNow: false,
                needsRestart: false,
                reason: "invalid-level",
                message: "Speed only goes from 1 to 5; that is not one of them.",
                detail: null,
            };
        }

        const running = this.running.get(renderId);
        if (running === undefined) {
            return {
                ok: false,
                renderId,
                level,
                route: "unsupported",
                appliedNow: false,
                needsRestart: false,
                reason: "not-running",
                message: `Render '${renderId}' is not running right now, so there is nothing to adjust.`,
                detail: null,
            };
        }

        if (running.mode === "docker") return await this.adjustDockerSpeed(running, renderId, level);
        return this.adjustLocalSpeed(running, renderId, level);
    }

    /**
     * Local route: OS process scheduling priority on the JVM's own pid.
     *
     * That one id is the whole process tree for a local render - see `render/runner.ts`'s
     * own `pid()` doc comment for why - so there is no separate child to also reach.
     */
    private adjustLocalSpeed(
        running: RunningRender,
        renderId: string,
        level: SpeedLevelNumber,
    ): SpeedAdjustmentResult {
        const pid = running.run.pid();
        if (pid === null) {
            return {
                ok: false,
                renderId,
                level,
                route: "local",
                appliedNow: false,
                needsRestart: true,
                reason: "process-exited",
                message:
                    "This render's process has already ended, so there is nothing left running to adjust.",
                detail: null,
            };
        }

        const result = applyLocalPriority(pid, level, this.options.priorityControl ?? {});
        if (!result.ok) {
            return {
                ok: false,
                renderId,
                level,
                route: "local",
                appliedNow: false,
                needsRestart: true,
                reason: "process-exited",
                message:
                    "This render's process ended before the priority change could reach it. Nothing was applied.",
                detail: result.error,
            };
        }

        if (result.refused) {
            const landedAt = result.applied === null ? null : localPriorityLevelFor(result.applied);
            const landedWords = landedAt === null ? "its previous priority" : `'${landedAt.label}'`;
            return {
                ok: true,
                renderId,
                level,
                route: "local",
                appliedNow: true,
                needsRestart: true,
                reason: "priority-refused",
                message:
                    `Windows would not raise this render to '${result.requested.label}' without administrator rights, which this application never asks for. It kept ${landedWords} instead. The thread count and thread priority baked into this render's launch still only change on the next render.`,
                detail: null,
            };
        }

        return {
            ok: true,
            renderId,
            level,
            route: "local",
            appliedNow: true,
            needsRestart: true,
            reason: "applied",
            message: `This render's OS priority is now '${result.requested.label}', effective immediately. The thread count and thread priority baked into this render's launch only change on the next render.`,
            detail: null,
        };
    }

    /** Docker route: the running container's own CPU quota, by name, through the daemon. */
    private async adjustDockerSpeed(
        running: RunningRender,
        renderId: string,
        level: SpeedLevelNumber,
    ): Promise<SpeedAdjustmentResult> {
        const name = running.containerName;
        if (name === null) {
            // Unreachable in practice - every docker-mode run carries a container name -
            // but typed nullable because `EngineLaunch.containerName` is, and a defensive
            // branch here is cheaper than a non-null assertion that quietly lies later.
            return {
                ok: false,
                renderId,
                level,
                route: "docker",
                appliedNow: false,
                needsRestart: true,
                reason: "not-running",
                message: "This render has no container name recorded, so there is nothing to adjust.",
                detail: null,
            };
        }

        const total = this.options.hostCpuCount?.() ?? hostCpuCount();
        const control: DockerCpuControl = {
            docker: running.dockerCommand,
            ...(this.options.runner === undefined ? {} : { runner: this.options.runner }),
        };
        const result = await applyDockerCpuQuota(name, level, total, control);

        if (!result.ok) {
            return {
                ok: false,
                renderId,
                level,
                route: "docker",
                appliedNow: false,
                needsRestart: true,
                reason: "container-stopped",
                message:
                    "Docker refused the CPU change - most likely because the container has already stopped. Nothing was applied.",
                detail: result.error,
            };
        }

        const quotaWords = result.quota.unlimited
            ? "every core this machine has - Docker cannot give a container more than that, so levels 3 through 5 all mean the same thing here"
            : `${String(result.quota.cpus)} of this machine's cores`;
        return {
            ok: true,
            renderId,
            level,
            route: "docker",
            appliedNow: true,
            needsRestart: true,
            reason: "applied",
            message: `This render's container is now allowed ${quotaWords}, effective immediately. The thread count and thread priority baked into this render's launch only change on the next render.`,
            detail: null,
        };
    }

    /**
     * Re-mounts a render that finished in an earlier session.
     *
     * Rendered maps outlive the process that made them, so on launch the app can offer
     * them without re-rendering. Only a record that says it finished is mounted: a
     * workspace left `running` by a crash holds a half-written map, and serving that as
     * though it were complete would show somebody torn terrain with no explanation.
     */
    async mountExisting(renderId: string): Promise<RenderRecord | null> {
        const workspace = renderWorkspace(this.storageDir(), renderId);
        const record = await readRenderRecord(workspace.recordFile);
        if (record === null || record.outcome !== "finished") return null;
        this.mount(workspace, record);
        return record;
    }

    /**
     * Renders. Never throws: every outcome is a value the interface can render.
     *
     * An exception here would have to be caught identically by every caller and turned
     * back into the same shape, and the one caller that forgets shows a stack trace to
     * somebody who pressed a button.
     *
     * The memory ceiling from {@link RenderOrchestratorOptions.jvmArgs} is applied here,
     * once, before anything else reads `request`: both the local `CliRun` path and the
     * container `planContainer` path read `request.jvmArgs` already, so filling it in here
     * covers both without either needing to know where the default comes from. A request
     * that already names `jvmArgs` - none does today - is left exactly as it is.
     */
    async render(request: RenderRequest): Promise<RenderResult> {
        if (request.jvmArgs === undefined) {
            const configured = this.options.jvmArgs;
            const defaults = configured === undefined
                ? []
                : typeof configured === "function"
                  ? configured()
                  : configured;
            if (defaults.length > 0) request = { ...request, jvmArgs: defaults };
        }

        let renderId = request.renderId ?? "";
        try {
            validateMaps(request.maps);
        } catch (error) {
            const message =
                error instanceof InvalidRenderRequestError ? error.message : describe(error);
            return this.fail(renderId, failures.invalidRequest(message), null);
        }

        const firstMap = request.maps[0];
        if (firstMap === undefined) {
            // Unreachable: `validateMaps` rejects an empty list. Written out anyway
            // because `noUncheckedIndexedAccess` is telling the truth about the type,
            // and a non-null assertion here would be a lie that outlives the check.
            return this.fail(renderId, failures.invalidRequest("A render needs at least one map."), null);
        }
        renderId = request.renderId ?? renderIdForWorld(firstMap.world);

        // Consent, before anything else happens. Nothing has been created, nothing has
        // been probed, and nothing will be spawned.
        if (!this.options.hasConsent()) {
            return this.fail(renderId, failures.consentRequired(), null);
        }

        if (this.running.has(renderId)) {
            return this.fail(renderId, failures.alreadyRunning(renderId), null);
        }

        for (const map of request.maps) {
            if (!(await isDirectory(map.world))) {
                return this.fail(renderId, failures.worldNotFound(map.id, map.world), null);
            }
        }

        // Absent means local, and an unrecognised value is refused rather than rounded
        // down to local: a request that named a mode nobody knows is a request whose
        // author believed something that is not true, and rendering it anyway hides that.
        const mode = runtimeModeOf(request.runtime);
        if (mode === null) {
            return this.fail(
                renderId,
                failures.invalidRequest(
                    `'${String(request.runtime)}' is not somewhere this application can run a render. ` +
                        `The choices are ${RENDER_RUNTIME_MODES.join(" and ")}.`,
                ),
                null,
            );
        }

        // Before the workspace, before the engine, and never followed by a local render.
        // The answer distinguishes "Docker is not installed" from "Docker is installed and
        // its daemon is stopped", which are the same sentence to a person only if the app
        // refuses to tell them apart.
        if (mode === "docker") {
            const report = await this.checkDocker();
            if (!dockerUsable(report)) {
                return this.fail(
                    renderId,
                    failures.dockerUnavailable(report.message, report.detail),
                    null,
                );
            }
        }

        let engine: ResolvedEngine;
        try {
            engine = await this.options.resolveEngine();
        } catch (error) {
            const failure =
                error instanceof EngineUnavailableError && error.reason === "jar"
                    ? failures.cliJarMissing(error.detail)
                    : failures.javaUnavailable(describe(error));
            return this.fail(renderId, failure, null);
        }

        const workspace = renderWorkspace(this.storageDir(), renderId);

        // Planned before anything is created. Deciding which folders a container may see
        // is a decision about strings and can refuse - a home directory, a drive root - and
        // a refusal that has already built a workspace leaves a directory on disk for a
        // render that never happened.
        let launch: EngineLaunch | null = null;
        if (mode === "docker") {
            try {
                launch = this.planContainer(renderId, engine, request, workspace);
            } catch (error) {
                if (error instanceof MountRefusedError) {
                    return this.fail(renderId, failures.containerMountRefused(error.message), null);
                }
                return this.fail(renderId, failures.invalidRequest(describe(error)), null);
            }
        }

        try {
            await mkdir(workspace.root, { recursive: true });
            if (launch === null) {
                await writeRenderConfig({
                    configDir: workspace.configDir,
                    dataDir: workspace.dataDir,
                    webRoot: workspace.webRoot,
                    maps: request.maps,
                    acceptDownload: true,
                    ...(request.metrics === undefined ? {} : { metrics: request.metrics }),
                    ...(request.renderThreads === undefined
                        ? {}
                        : { renderThreads: request.renderThreads }),
                });
            } else {
                await this.writeContainerConfig(workspace, request);
            }
        } catch (error) {
            return this.fail(renderId, failures.workspaceUnwritable(workspace.root, describe(error)), null);
        }

        const description = describeEngineFor(engine, mode);
        const startedAt = this.timestamp();
        let record = this.newRecord(renderId, engine, request, startedAt, mode, description);
        await this.saveRecord(workspace, record);
        // Written before the process is spawned, so a crash one second later still leaves
        // a record saying a render was running and where its output is.
        await this.options.sessions?.start({
            renderId,
            maps: request.maps,
            configDir: launch === null ? workspace.configDir : workspace.containerConfigDir,
            // Recorded so that carrying this render on later carries it on in the same
            // place rather than quietly moving it. See `resume.ts`.
            runtime: mode,
            outputRoot: workspace.webRoot,
            engine: engine.engine,
            engineVersion: engine.engineVersion,
            // The description's, not the resolved engine's: in a container the JVM that
            // ran is the image's, and naming this machine's JDK beside those tiles would
            // be a confident wrong answer. See `describeEngineFor`.
            javaVersion: description.javaVersion,
            startedAt,
        });

        this.emit({
            type: "started",
            renderId,
            mapIds: request.maps.map((map) => map.id),
            engine: description,
            at: startedAt,
        });

        /**
         * One signal handler, shared. This is where "the interface cannot tell" is
         * actually true rather than promised: both modes read their output through the
         * same `RenderOutputTracker`, so the same signals arrive here and become the same
         * events, in the same order, with the same phases.
         */
        const onSignal = (signal: RenderSignal): void => {
            switch (signal.kind) {
                case "phase":
                    this.emit({
                        type: "phase",
                        renderId,
                        phase: signal.phase,
                        at: this.timestamp(),
                    });
                    break;
                case "progress":
                    this.emit({
                        type: "progress",
                        renderId,
                        phase: "rendering",
                        task: signal.progress,
                        at: this.timestamp(),
                    });
                    // Not awaited: this runs on the stream the engine is writing to,
                    // and a slow disk must never back that up. The store throttles
                    // its own writes and swallows its own failures.
                    void this.options.sessions?.progress(renderId, signal.progress);
                    break;
                case "log":
                    this.emit({
                        type: "log",
                        renderId,
                        level: signal.line.level,
                        message: signal.line.message,
                        at: this.timestamp(),
                    });
                    break;
                default:
                    break;
            }
        };

        const run: RenderRun =
            launch === null
                ? new CliRun({
                      javaExecutable: engine.javaExecutable,
                      jarPath: engine.enginePath,
                      configDir: workspace.configDir,
                      // Deliberate, and the whole reason this directory exists: the CLI resolves
                      // relative paths against its working directory, so anything that somehow
                      // escaped being made absolute lands inside the render's own folder rather
                      // than wherever the app was started from.
                      cwd: workspace.root,
                      ...(request.force === undefined ? {} : { force: request.force }),
                      ...(request.fixEdges === undefined ? {} : { fixEdges: request.fixEdges }),
                      ...(request.jvmArgs === undefined ? {} : { jvmArgs: request.jvmArgs }),
                      ...(this.options.spawn === undefined ? {} : { spawn: this.options.spawn }),
                      onSignal,
                  })
                : new EngineProcess({
                      launch,
                      onSignal,
                      ...(this.options.spawnEngine === undefined
                          ? {}
                          : { spawn: this.options.spawnEngine }),
                      ...(this.options.stopContainer === undefined
                          ? {}
                          : { stopContainer: this.options.stopContainer }),
                  });

        this.running.set(renderId, {
            run,
            mode,
            containerName: launch?.containerName ?? null,
            dockerCommand: launch?.command ?? this.options.docker ?? "docker",
        });
        // The note goes down **before** `docker run`, not after it. The app can be killed
        // in the gap, and a container started with no record beside it is a render nobody
        // can find again: it keeps writing tiles into a bind-mounted folder with nothing
        // watching it, and the next launch has no name to ask the daemon about.
        if (launch !== null) await this.startHandoff(launch, renderId, request, workspace, description);

        let result: RenderRunOutcome;
        try {
            result = await run.start();
        } finally {
            this.running.delete(renderId);
            // Cleared in a `finally` for the same reason it was written early: whichever
            // way the run ended - finished, failed, cancelled, crashed - the container is
            // gone, and a record left behind is an offer to reattach to nothing.
            if (launch !== null) await this.options.containers?.finish(renderId);
        }

        const finishedAt = this.timestamp();
        const detail = result.diagnostics.length > 0 ? result.diagnostics.join("\n") : null;

        if (result.cancelled) {
            record = { ...record, outcome: "cancelled", finishedAt, durationMs: result.durationMs };
            await this.saveRecord(workspace, record);
            // Cancellation is an interruption with a reason, not a crash and not a
            // failure. The tiles it finished are finished, so the resume is still offered.
            await this.options.sessions?.interrupt(renderId, "cancelled", null);
            this.emit({ type: "cancelled", renderId, at: finishedAt });
            return { ok: false, renderId, failure: failures.cancelled(), record };
        }

        const failure = classifyRunFailure(result, detail);
        if (failure !== null) {
            record = {
                ...record,
                outcome: "failed",
                finishedAt,
                durationMs: result.durationMs,
                failureCode: failure.code,
            };
            await this.saveRecord(workspace, record);
            await this.options.sessions?.interrupt(renderId, "failed", failure.code);
            this.rememberFailure(mode, engine, workspace, request, launch, result);
            return this.fail(renderId, failure, record);
        }

        record = { ...record, outcome: "finished", finishedAt, durationMs: result.durationMs };
        await this.saveRecord(workspace, record);
        await this.options.sessions?.complete(renderId);
        this.mount(workspace, record);

        const dataRoot = LocalMapHandler.dataRoot(renderId);
        this.emit({
            type: "finished",
            renderId,
            dataRoot,
            mapIds: record.maps.map((map) => map.id),
            engine: description,
            durationMs: result.durationMs,
            at: finishedAt,
        });

        return {
            ok: true,
            renderId,
            dataRoot,
            mapIds: record.maps.map((map) => map.id),
            engine: description,
            durationMs: result.durationMs,
            record,
        };
    }

    /**
     * Asks Docker what it is, and never lets the asking become a fallback.
     *
     * A probe that fails in a way Docker itself never reports is still an answer, and it
     * is still `unusable` - which refuses the render. The one outcome this must never
     * produce is a thrown exception two frames above a `catch` that shrugs and renders
     * locally.
     */
    private async checkDocker(): Promise<DockerReport> {
        const probe = this.options.probeDocker ?? probeDocker;
        const options: ProbeDockerOptions =
            this.options.docker === undefined ? {} : { docker: this.options.docker };
        try {
            return await probe(options);
        } catch (error) {
            return {
                status: "unusable",
                clientVersion: null,
                serverVersion: null,
                message: "Docker could not be checked on this computer.",
                detail: describe(error),
            };
        }
    }

    /**
     * The whole `docker run`, mounts included. Throws `MountRefusedError` and nothing else.
     *
     * Nothing is created here and nothing is spawned; it is a decision about paths, which
     * is what makes it safe to do before the workspace exists and testable without Docker.
     */
    private planContainer(
        renderId: string,
        engine: ResolvedEngine,
        request: RenderRequest,
        workspace: RenderWorkspace,
    ): EngineLaunch {
        const home = this.options.home;
        return planDockerLaunch({
            role: "render",
            // The prefix the reattacher scans for. A container named any other way is a
            // container this app cannot recognise as its own on the next launch.
            containerName: containerName(CONTAINER_PREFIX, renderId),
            jarPath: engine.enginePath,
            hostConfigDir: workspace.containerConfigDir,
            hostDataDir: workspace.dataDir,
            hostWebRoot: workspace.webRoot,
            worlds: request.maps.map((map) => ({ mapId: map.id, hostPath: map.world })),
            // The `-Xmx` ceiling from `files/renderMemory.ts` travels here exactly as it
            // does locally, as a **JVM flag**, and deliberately not as `docker run -m`.
            // They are different controls with different failure modes: `-Xmx` is a heap
            // the JVM will never exceed, so a render that wants more dies with an
            // `OutOfMemoryError` somebody can read and retry with a bigger number, while
            // `-m` is a cgroup limit the kernel enforces by killing the container - exit
            // 137, no message, and nothing in the log to say why. Setting only the heap
            // keeps the diagnosable failure.
            ...(request.jvmArgs === undefined ? {} : { jvmArgs: request.jvmArgs }),
            ...(request.force === undefined ? {} : { force: request.force }),
            ...(request.fixEdges === undefined ? {} : { fixEdges: request.fixEdges }),
            ...(this.options.dockerImage === undefined ? {} : { image: this.options.dockerImage }),
            ...(this.options.docker === undefined ? {} : { docker: this.options.docker }),
            ...(this.options.containerUser === undefined
                ? {}
                : { user: this.options.containerUser }),
            // The `docker` client's own working directory, on this machine. The engine's
            // is `/bluemap`, set inside the launch.
            cwd: workspace.root,
            ...(home === undefined ? {} : { mountOptions: { home } }),
        });
    }

    /**
     * The same config set, written with the paths the *container* will read.
     *
     * `C:\Users\me\saves\world` does not exist inside a Linux container and neither does
     * the folder the tiles are meant to land in, so a containerised run gets `/worlds/<id>`
     * and `/bluemap/web` written into a folder on this machine that is then mounted at
     * `/bluemap/config`. `runtime/config.ts` is the authority on that; this only chooses
     * the paths.
     */
    private async writeContainerConfig(
        workspace: RenderWorkspace,
        request: RenderRequest,
    ): Promise<void> {
        // Every bind mount's host side has to exist first. A missing source is not an
        // error to Docker - it creates the directory, on Linux owned by root - and the
        // render then writes tiles into a folder the person's own account cannot delete.
        await mkdir(workspace.containerConfigDir, { recursive: true });
        await mkdir(workspace.dataDir, { recursive: true });
        await mkdir(workspace.storageRoot, { recursive: true });

        await writeEngineConfig({
            hostConfigDir: workspace.containerConfigDir,
            engineDataDir: CONTAINER_DATA_DIR,
            engineWebRoot: CONTAINER_WEB_ROOT,
            maps: request.maps.map((map) => ({ ...map, world: containerWorldPathFor(map.id) })),
            acceptDownload: true,
            ...(request.metrics === undefined ? {} : { metrics: request.metrics }),
            ...(request.renderThreads === undefined
                ? {}
                : { renderThreads: request.renderThreads }),
            // False, always. The engine's paths here are the container's, and a `mkdir` of
            // `/bluemap/web/maps` on Windows quietly produces `C:\bluemap\web\maps` - a
            // render that reports an empty output folder nobody can find.
            createEngineDirectories: false,
        });
    }

    /** Writes the container's name down beside the render, before the container exists. */
    private async startHandoff(
        launch: EngineLaunch,
        renderId: string,
        request: RenderRequest,
        workspace: RenderWorkspace,
        engine: EngineDescription,
    ): Promise<void> {
        const name = launch.containerName;
        if (name === null) return;
        await this.options.containers?.start({
            renderId,
            containerName: name,
            mode: "docker",
            mapIds: request.maps.map((map) => map.id),
            // The client that reaches this daemon, not the one inside the launch's args:
            // stopping the container later means running this binary again.
            docker: launch.command,
            storageRoot: workspace.storageRoot,
            webRoot: workspace.webRoot,
            cwd: workspace.root,
            engine,
        });
    }

    private mount(workspace: RenderWorkspace, record: RenderRecord): void {
        this.options.mounts?.setMount({
            renderId: workspace.renderId,
            webRoot: workspace.webRoot,
            engineLabel: describeEngine(record),
        });
    }

    private newRecord(
        renderId: string,
        engine: ResolvedEngine,
        request: RenderRequest,
        startedAt: string,
        runtime: RuntimeMode,
        description: EngineDescription,
    ): RenderRecord {
        return {
            recordVersion: RENDER_RECORD_VERSION,
            renderId,
            engine: engine.engine,
            engineVersion: engine.engineVersion,
            enginePath: engine.enginePath,
            javaVersion: description.javaVersion,
            // Recorded beside the engine and the JVM because it is the same kind of fact:
            // how somebody can tell, months later, what actually produced these tiles.
            runtime,
            maps: request.maps.map((map) => ({
                id: map.id,
                name: map.name ?? map.id,
                world: map.world,
                dimension: map.dimension ?? "minecraft:overworld",
            })),
            startedAt,
            finishedAt: null,
            outcome: "running" satisfies RenderOutcome,
            failureCode: null,
            durationMs: null,
            appVersion: this.options.appVersion ?? null,
        };
    }

    private async saveRecord(workspace: RenderWorkspace, record: RenderRecord): Promise<void> {
        try {
            await writeRenderRecord(workspace.recordFile, record);
        } catch {
            // A record that cannot be written must never fail the render that produced
            // it. Losing the note about which engine ran is a smaller harm than losing
            // the map, and the map is on disk either way.
        }
    }

    /**
     * Files a genuine render failure with the repair module, if this build has one wired
     * (`this.options.rememberFailure` - see that option's own doc comment).
     *
     * Config text is left empty rather than read from disk here: the basic diagnosis
     * codes this failure list exists to populate (a port in use, no Java, Java too old, an
     * unwritable output folder, the Mojang download not accepted, an out-of-memory kill, a
     * config BlueMap itself refused) read `exitCode`, `diagnostics` and `setupProblems`,
     * never `evidence.config` - only the guardrailed coding-agent pass reads that, and it
     * stays unreachable until Settings has a control for it (see `main/index.ts`'s own
     * comment on `startRepairDiagnostics`). Reading and redacting every config file on
     * every failed render to serve a feature nothing can reach yet would be work with no
     * observer.
     *
     * `command`/`args` for a local run are the JVM invocation this orchestrator actually
     * built (`-jar <engine>`), not `CliRun`'s complete argument list, which it keeps
     * private; for a container run they are `launch`'s own, exactly as spawned. Never lets
     * a throw - a malformed evidence record, an `options.rememberFailure` that itself
     * throws - escape into the caller: a repair module that cannot file a record must
     * never turn a reported failure into an unreported crash.
     */
    private rememberFailure(
        mode: RuntimeMode,
        engine: ResolvedEngine,
        workspace: RenderWorkspace,
        request: RenderRequest,
        launch: EngineLaunch | null,
        result: RenderRunOutcome,
    ): void {
        const remember = this.options.rememberFailure;
        if (remember === undefined) return;
        try {
            const evidence = collectEvidence({
                subject: "render",
                mode,
                command: launch?.command ?? engine.javaExecutable,
                args: launch?.args ?? ["-jar", engine.enginePath],
                result: {
                    exitCode: result.exitCode,
                    signal: result.signal,
                    spawnError: null,
                    cancelled: result.cancelled,
                    upToDate: result.upToDate,
                    mapsScheduled: result.mapsScheduled,
                    mapsLoaded: result.mapsLoaded,
                    consentMissing: result.consentMissing,
                    setupProblems: result.setupProblems,
                    diagnostics: result.diagnostics,
                    stderr: [],
                    durationMs: result.durationMs,
                },
                hostConfigDir: workspace.configDir,
                outputRoot: workspace.storageRoot,
                worlds: request.maps.map((map) => ({ mapId: map.id, path: map.world })),
                javaExecutable: engine.javaExecutable,
                javaVersion: engine.javaVersion,
                requiredJavaFeature: REQUIRED_JAVA_FEATURE,
            });
            remember(evidence);
        } catch {
            // See this method's own doc comment: a failure to file the evidence must
            // never turn a reported render failure into an unreported crash.
        }
    }

    private fail(
        renderId: string,
        failure: RenderFailure,
        record: RenderRecord | null,
    ): RenderFailureResult {
        this.emit({ type: "failed", renderId, failure, at: this.timestamp() });
        return { ok: false, renderId, failure, record };
    }

    private emit(event: RenderEvent): void {
        this.options.onEvent?.(event);
    }

    private timestamp(): string {
        return (this.options.now?.() ?? new Date()).toISOString();
    }
}

/**
 * Deciding whether a completed run actually rendered anything.
 *
 * Exit code alone is not the answer, and this is the sharp edge that makes the check
 * necessary. Point a map at a world folder that does not exist and the CLI prints a
 * warning banner, then:
 *
 * ```
 * [12:45:58 INFO] Start updating 0 maps ...
 * [12:45:58 INFO] Your maps are now all up-to-date!
 * ...
 * exit: 0
 * ```
 *
 * Exit zero, "up-to-date", and not one tile written. Reporting that as a finished
 * render is reporting a success that did not happen.
 */
export function classifyRunFailure(
    result: {
        readonly exitCode: number | null;
        readonly signal: NodeJS.Signals | null;
        readonly upToDate: boolean;
        readonly mapsScheduled: number | null;
        readonly consentMissing: boolean;
    },
    detail: string | null,
): RenderFailure | null {
    // A config that got past the consent gate anyway - a hand-edited core.conf, a
    // reused workspace - reports what it actually is rather than "exit code 2".
    if (result.consentMissing) return failures.consentRequired();

    if (result.exitCode !== 0) {
        if (result.exitCode === null) {
            const signal = result.signal === null ? "no signal" : result.signal;
            return failures.spawnFailed(
                detail ?? `The engine ended without an exit code (${signal}).`,
            );
        }
        return failures.cliFailed(result.exitCode, detail);
    }

    if (result.mapsScheduled === 0) return failures.noMapsRendered(detail);

    if (!result.upToDate) {
        return failures.cliFailed(
            0,
            detail ?? "The engine exited without reporting that the maps were up to date.",
        );
    }

    return null;
}

/**
 * Reads the requested mode. `null` means "not a mode this application has".
 *
 * Absent is local, which is the whole compatibility promise of the field. Anything else
 * unrecognised is refused rather than treated as absent: a request over IPC carrying
 * `"container"` or `"remote"` was written by somebody who believed it would do something,
 * and rendering locally would confirm that belief with a finished map.
 */
function runtimeModeOf(value: RuntimeMode | undefined): RuntimeMode | null {
    if (value === undefined) return DEFAULT_RUNTIME_MODE;
    return value === "local" || value === "docker" ? value : null;
}

/**
 * The engine as it will be described on screen and in `render.json`.
 *
 * The Java version named here is the one that **ran**. In a container that is the image's,
 * whose version this application has not asked for and does not know, so a container
 * render names no Java version rather than naming the JDK sitting unused on this computer.
 * Attributing container-rendered tiles to the host's JDK is exactly the confidently-wrong
 * answer `provenance.ts` exists to refuse, and it is worse than saying nothing because it
 * looks like knowledge.
 */
function describeEngineFor(engine: ResolvedEngine, mode: RuntimeMode): EngineDescription {
    const label = RENDER_ENGINE_LABELS[engine.engine];
    const javaVersion = mode === "docker" ? null : engine.javaVersion;
    const java = javaVersion === null ? "" : ` on Java ${javaVersion}`;
    return {
        id: engine.engine,
        label: `${label} ${engine.engineVersion}${java}`,
        version: engine.engineVersion,
        javaVersion,
    };
}

async function isDirectory(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
