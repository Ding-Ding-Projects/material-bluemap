/**
 * Running one engine launch, local or containerised, and stopping it.
 *
 * There is exactly one of these classes and both modes go through it. The output of a
 * `docker run` is the output of the JVM inside it - Docker attaches to the container's
 * stdout and stderr and copies them through unchanged - so the same {@link
 * RenderOutputTracker} that reads a local render reads a containerised one, and every
 * phase, every progress line, every warning and every setup-problem banner arrives on
 * both paths or on neither.
 *
 * ## Cancelling a container is not cancelling a process
 *
 * This is the one place the two modes genuinely differ, and getting it wrong is the
 * expensive kind of wrong. Killing the `docker run` client does **not** stop the
 * container: the daemon owns the container's lifetime, the client is a viewer attached to
 * it, and a killed client leaves a detached JVM rendering into somebody's disk with
 * nothing left holding a handle to it. Exactly the orphan `render/runner.ts` avoids by
 * refusing to put a shell between itself and the JVM, re-created by a different route.
 *
 * So cancellation asks the *daemon*: `docker stop --time N <name>`, which sends SIGTERM
 * into the container, waits, and kills it if it has not gone. `--init` in the launch is
 * what makes that SIGTERM reach the JVM at all. The client is then given the same polite
 * SIGINT and the same escalation as a local run, so an unresponsive daemon still ends
 * with this process letting go rather than waiting forever.
 */

import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { LineSplitter, RenderOutputTracker } from "../render/progress.js";
import type { RenderSignal } from "../render/progress.js";
import { execFileCommandRunner, type CommandRunner } from "./command.js";
import { stopContainerArguments, type EngineLaunch } from "./plan.js";

/** The child an engine spawn produces: no stdin, both output streams piped. */
export type EngineChildProcess = ChildProcessByStdio<null, Readable, Readable>;

export type SpawnEngine = (
    command: string,
    args: readonly string[],
    options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
) => EngineChildProcess;

/** How long a polite stop is given before the process is killed outright. */
export const CANCEL_GRACE_MS = 12_000;

/** A failure report wants the last few complaints, not the whole log. */
const MAX_DIAGNOSTICS = 40;

/** Kept for the repair pass, which needs the engine's own last words verbatim. */
const MAX_STDERR_LINES = 60;

export interface EngineRunResult {
    /** Null when the process was terminated by a signal instead of exiting. */
    readonly exitCode: number | null;
    readonly signal: NodeJS.Signals | null;
    /** Why the process could not be started at all, or null when it started. */
    readonly spawnError: string | null;
    readonly cancelled: boolean;
    /** True once `Your maps are now all up-to-date!` was seen. */
    readonly upToDate: boolean;
    /** The count from `Start updating N maps ...`, or null if it never appeared. */
    readonly mapsScheduled: number | null;
    readonly mapsLoaded: readonly string[];
    /** True if the engine complained that the Mojang download was not accepted. */
    readonly consentMissing: boolean;
    /** Upstream's multi-line "problem with your BlueMap setup" banners, in order. */
    readonly setupProblems: readonly string[];
    /** The last few WARNING and ERROR lines, for a failure report. */
    readonly diagnostics: readonly string[];
    /** Everything that arrived on stderr, bounded. The repair pass reads this. */
    readonly stderr: readonly string[];
    readonly durationMs: number;
}

export interface EngineProcessOptions {
    readonly launch: EngineLaunch;
    readonly env?: NodeJS.ProcessEnv;
    readonly onSignal?: (signal: RenderSignal, stream: "stdout" | "stderr") => void;
    readonly spawn?: SpawnEngine;
    /**
     * How a container is asked to stop. Injected so a test can prove the request is made
     * without a daemon, and so a future rootless or remote daemon can be reached
     * differently without touching this class.
     */
    readonly stopContainer?: (name: string) => Promise<void>;
    readonly runner?: CommandRunner;
    readonly graceMs?: number;
}

/**
 * One run of the engine.
 *
 * Constructed, then `start()`ed once. `cancel()` is safe at any point, including before
 * the process has spawned and after it has exited, because a person pressing Cancel does
 * not know or care which of those is true at that instant.
 */
export class EngineProcess {
    private readonly options: EngineProcessOptions;
    private child: EngineChildProcess | null = null;
    private cancelRequested = false;
    private killTimer: NodeJS.Timeout | null = null;
    private finished = false;

    private readonly tracker = new RenderOutputTracker();
    private readonly diagnostics: string[] = [];
    private readonly stderrLines: string[] = [];
    private readonly mapsLoaded: string[] = [];
    private readonly setupProblems: string[] = [];
    private mapsScheduled: number | null = null;
    private upToDate = false;
    private consentMissing = false;
    private spawnError: string | null = null;

    constructor(options: EngineProcessOptions) {
        this.options = options;
    }

    /** The launch this run will perform, so a failure report can quote it exactly. */
    launch(): EngineLaunch {
        return this.options.launch;
    }

    /**
     * Spawns the process and resolves when it has exited.
     *
     * Never rejects. A spawn failure is an outcome the interface has to render, the same
     * as a non-zero exit, and turning one of the two into a thrown exception makes every
     * caller handle the same event twice.
     */
    async start(): Promise<EngineRunResult> {
        const startedAt = Date.now();
        if (this.cancelRequested) return this.result(null, null, startedAt);

        const spawn = this.options.spawn ?? defaultSpawn;
        let child: EngineChildProcess;
        try {
            child = spawn(this.options.launch.command, this.options.launch.args, {
                cwd: this.options.launch.cwd,
                env: this.options.env ?? process.env,
            });
        } catch (error) {
            this.spawnError = errorCode(error) ?? describe(error);
            this.record(describe(error));
            this.finished = true;
            return this.result(null, null, startedAt);
        }
        this.child = child;

        const stdout = this.pipe(child.stdout, "stdout");
        const stderr = this.pipe(child.stderr, "stderr");

        const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
            (resolve) => {
                child.once("error", (error) => {
                    this.spawnError = errorCode(error) ?? describe(error);
                    this.record(describe(error));
                    resolve({ code: null, signal: null });
                });
                child.once("close", (code, signal) => resolve({ code, signal }));
            },
        );

        // Awaited after `close` rather than raced with it: the streams can still hold
        // buffered output when the process ends, and the last line before a crash is
        // usually the one that explains it.
        await Promise.all([stdout, stderr]);
        for (const signal of this.tracker.finish()) this.consume(signal, "stdout");

        this.finished = true;
        this.clearKillTimer();
        return this.result(exit.code, exit.signal, startedAt);
    }

    /**
     * Asks the run to stop, then makes sure it did.
     *
     * Returns immediately; `start()`'s promise is what resolves when the process is
     * actually gone. Calling it twice is harmless, which matters because "did that click
     * register?" is answered by clicking again.
     */
    cancel(): void {
        if (this.cancelRequested) return;
        this.cancelRequested = true;

        const name = this.options.launch.containerName;
        if (name !== null && !this.finished) {
            // Not awaited, and its failure is swallowed on purpose: the daemon may be
            // gone, and a cancel that rejects because Docker went away is a cancel that
            // leaves the interface believing the render is still running. The escalation
            // below is what guarantees this process lets go either way.
            void this.stopContainer(name).catch(() => undefined);
        }

        const child = this.child;
        if (child === null || this.finished || child.exitCode !== null) return;

        child.kill("SIGINT");

        this.killTimer = setTimeout(() => {
            if (!this.finished && child.exitCode === null) child.kill("SIGKILL");
        }, this.options.graceMs ?? CANCEL_GRACE_MS);
        // Never hold the event loop open on behalf of a process that is already dying.
        this.killTimer.unref?.();
    }

    /** True once cancellation has been asked for. */
    isCancelled(): boolean {
        return this.cancelRequested;
    }

    /**
     * The OS process id backing this run right now, or `null` when there is none to
     * address - never spawned yet, already exited, or the child object never reported one.
     *
     * For a local launch this is the JVM itself, and the whole process tree in one id for
     * the same reason `render/runner.ts`'s own `pid()` is: no shell, no launcher script.
     * For a **container** launch this is the `docker run` *client*, not the JVM inside the
     * container - exactly the distinction this file's header comment exists to make. A
     * caller that wants to reach the container itself must address it by name through
     * {@link EngineLaunch.containerName}, never through this id.
     */
    pid(): number | null {
        if (this.child === null || this.finished) return null;
        if (this.child.exitCode !== null) return null;
        const pid = this.child.pid;
        return typeof pid === "number" ? pid : null;
    }

    private async stopContainer(name: string): Promise<void> {
        const stop = this.options.stopContainer;
        if (stop !== undefined) {
            await stop(name);
            return;
        }
        const runner = this.options.runner ?? execFileCommandRunner;
        await runner(this.options.launch.command, stopContainerArguments(name), {});
    }

    private clearKillTimer(): void {
        if (this.killTimer === null) return;
        clearTimeout(this.killTimer);
        this.killTimer = null;
    }

    private async pipe(stream: NodeJS.ReadableStream, which: "stdout" | "stderr"): Promise<void> {
        const splitter = new LineSplitter();
        stream.setEncoding("utf8");
        for await (const chunk of stream as AsyncIterable<string>) {
            for (const line of splitter.push(chunk)) this.line(line, which);
        }
        for (const line of splitter.flush()) this.line(line, which);
    }

    private line(line: string, which: "stdout" | "stderr"): void {
        if (which === "stderr") this.keepStderr(line);
        for (const signal of this.tracker.push(line)) this.consume(signal, which);
    }

    private keepStderr(line: string): void {
        const text = line.replace(/\r$/, "");
        if (text.trim() === "") return;
        this.stderrLines.push(text);
        if (this.stderrLines.length > MAX_STDERR_LINES) this.stderrLines.shift();
    }

    private consume(signal: RenderSignal, which: "stdout" | "stderr"): void {
        switch (signal.kind) {
            case "log":
                if (signal.line.level === "WARNING" || signal.line.level === "ERROR") {
                    this.record(`[${signal.line.level}] ${signal.line.message}`);
                }
                break;
            case "maps-scheduled":
                this.mapsScheduled = signal.count;
                break;
            case "map-loaded":
                if (!this.mapsLoaded.includes(signal.mapId)) this.mapsLoaded.push(signal.mapId);
                break;
            case "up-to-date":
                this.upToDate = true;
                break;
            case "consent-missing":
                this.consentMissing = true;
                break;
            case "setup-problem":
                this.setupProblems.push(signal.text);
                this.record(signal.text);
                break;
            default:
                break;
        }
        this.options.onSignal?.(signal, which);
    }

    private record(text: string): void {
        if (text.trim().length === 0) return;
        this.diagnostics.push(text);
        if (this.diagnostics.length > MAX_DIAGNOSTICS) this.diagnostics.shift();
    }

    private result(
        exitCode: number | null,
        signal: NodeJS.Signals | null,
        startedAt: number,
    ): EngineRunResult {
        return {
            exitCode,
            signal,
            spawnError: this.spawnError,
            cancelled: this.cancelRequested,
            upToDate: this.upToDate,
            mapsScheduled: this.mapsScheduled,
            mapsLoaded: [...this.mapsLoaded],
            consentMissing: this.consentMissing,
            setupProblems: [...this.setupProblems],
            diagnostics: [...this.diagnostics],
            stderr: [...this.stderrLines],
            durationMs: Date.now() - startedAt,
        };
    }
}

const defaultSpawn: SpawnEngine = (command, args, options) =>
    nodeSpawn(command, [...args], {
        cwd: options.cwd,
        env: options.env,
        // Explicit rather than inherited: neither the engine nor the Docker client reads
        // anything from stdin here, and leaving it attached to the app's own would let a
        // child block on a terminal that is not there.
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
    });

function errorCode(error: unknown): string | null {
    if (typeof error !== "object" || error === null || !("code" in error)) return null;
    const code = (error as { readonly code?: unknown }).code;
    return typeof code === "string" ? code : null;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
