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
 */

import { mkdir, stat } from "node:fs/promises";
import { writeRenderConfig, validateMaps, InvalidRenderRequestError } from "./config.js";
import type { RenderMapRequest } from "./config.js";
import * as failures from "./failure.js";
import type { RenderFailure } from "./failure.js";
import { LocalMapHandler } from "./LocalMapHandler.js";
import type { RenderPhase, RenderTaskProgress, CliLogLevel } from "./progress.js";
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

export interface RenderRequest {
    readonly maps: readonly RenderMapRequest[];
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
    readonly now?: () => Date;
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
    private readonly running = new Map<string, CliRun>();

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
        const run = this.running.get(renderId);
        if (run === undefined) return false;
        run.cancel();
        return true;
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
     */
    async render(request: RenderRequest): Promise<RenderResult> {
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
        try {
            await mkdir(workspace.root, { recursive: true });
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
        } catch (error) {
            return this.fail(renderId, failures.workspaceUnwritable(workspace.root, describe(error)), null);
        }

        const description = describeEngineFor(engine);
        const startedAt = this.timestamp();
        let record = this.newRecord(renderId, engine, request, startedAt);
        await this.saveRecord(workspace, record);
        // Written before the process is spawned, so a crash one second later still leaves
        // a record saying a render was running and where its output is.
        await this.options.sessions?.start({
            renderId,
            maps: request.maps,
            configDir: workspace.configDir,
            outputRoot: workspace.webRoot,
            engine: engine.engine,
            engineVersion: engine.engineVersion,
            javaVersion: engine.javaVersion,
            startedAt,
        });

        this.emit({
            type: "started",
            renderId,
            mapIds: request.maps.map((map) => map.id),
            engine: description,
            at: startedAt,
        });

        const run = new CliRun({
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
            onSignal: (signal) => {
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
            },
        });

        this.running.set(renderId, run);
        let result;
        try {
            result = await run.start();
        } finally {
            this.running.delete(renderId);
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
    ): RenderRecord {
        return {
            recordVersion: RENDER_RECORD_VERSION,
            renderId,
            engine: engine.engine,
            engineVersion: engine.engineVersion,
            enginePath: engine.enginePath,
            javaVersion: engine.javaVersion,
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

function describeEngineFor(engine: ResolvedEngine): EngineDescription {
    const label = RENDER_ENGINE_LABELS[engine.engine];
    const java = engine.javaVersion === null ? "" : ` on Java ${engine.javaVersion}`;
    return {
        id: engine.engine,
        label: `${label} ${engine.engineVersion}${java}`,
        version: engine.engineVersion,
        javaVersion: engine.javaVersion,
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
