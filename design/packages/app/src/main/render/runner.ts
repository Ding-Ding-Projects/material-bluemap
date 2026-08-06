/**
 * Running the BlueMap CLI as a child process, and stopping it.
 *
 * The CLI is spawned directly - `<java> -jar <cli.jar> -c <configDir> -r ...` - with no
 * shell in between. A shell would add a process between this one and the JVM, and the
 * cancel path would then kill the shell and leave a detached JVM rendering into
 * somebody's disk with nothing left holding a handle to it.
 *
 * ## What cancellation actually does
 *
 * Measured on this machine rather than assumed. Spawning the CLI, letting it render for
 * twenty-five seconds and calling `child.kill("SIGINT")` produced:
 *
 * ```
 * >>> sending SIGINT at 2026-08-03T16:46:40.307Z
 * >>> kill returned: true
 * >>> exit code=null signal=SIGINT at 2026-08-03T16:46:40.353Z
 * ```
 *
 * Forty-six milliseconds, and none of the CLI's shutdown sequence
 * (`Stopping...` / `Saving...` / `Stopped.`) ran. That is Windows: it has no POSIX
 * signals, so libuv implements every `kill` as `TerminateProcess` and the JVM's
 * shutdown hook never gets the chance to flush. No orphan was left behind, which is
 * what matters most - the process tree is one JVM and killing it kills the render.
 *
 * On a platform that does deliver signals, SIGINT reaches the JVM's shutdown hook and
 * the CLI saves what it has rendered before exiting, which is a genuinely better
 * cancel. So the sequence is the same on both: ask politely, wait, and escalate to
 * SIGKILL only if the process is still there. On Windows the first step already ended
 * it and the escalation never fires; on Linux and macOS the wait is what buys the tiles
 * already rendered. Either way an interrupted render loses no *finished* work, because
 * BlueMap's storage is incremental and the next render resumes from what is on disk.
 */

import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { LineSplitter, RenderOutputTracker } from "./progress.js";
import type { RenderSignal } from "./progress.js";

/**
 * The child a spawn produces.
 *
 * `stdin` is `null` rather than a stream, and the type says so: the CLI reads nothing
 * from it, and leaving it attached would let a child block waiting on a terminal that
 * is not there. Both output streams are piped, because ERROR lines go to stderr and a
 * reader that watches only stdout never sees a failure.
 */
export type CliChildProcess = ChildProcessByStdio<null, Readable, Readable>;

/** Injectable so a test can run a real child process of its own choosing. */
export type SpawnCli = (
    command: string,
    args: readonly string[],
    options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
) => CliChildProcess;

export interface CliRunOptions {
    /** Absolute path to the `java` executable, from the toolchain layer. */
    readonly javaExecutable: string;
    /** Absolute path to the BlueMap CLI shadow jar. */
    readonly jarPath: string;
    /** Absolute path to the config folder passed to `-c`. */
    readonly configDir: string;
    /**
     * The child's working directory.
     *
     * Not optional, and not defaulted to the app's own directory. The CLI resolves
     * relative paths against this, so leaving it to chance is how tiles end up in the
     * repository root.
     */
    readonly cwd: string;
    /** Render only these map ids (`-m`). Omit to render every configured map. */
    readonly maps?: readonly string[];
    /** `-f`: re-render everything rather than only what changed. */
    readonly force?: boolean;
    /** `-e`: re-render map edges. */
    readonly fixEdges?: boolean;
    /** Extra JVM arguments, placed before `-jar`. `-Xmx4G` is the usual one. */
    readonly jvmArgs?: readonly string[];
    readonly env?: NodeJS.ProcessEnv;
    readonly onSignal?: (signal: RenderSignal, stream: "stdout" | "stderr") => void;
    readonly spawn?: SpawnCli;
}

export interface CliRunResult {
    /** Null when the process was terminated by a signal instead of exiting. */
    readonly exitCode: number | null;
    /** The signal that ended it, when one did. */
    readonly signal: NodeJS.Signals | null;
    readonly cancelled: boolean;
    /** True once `Your maps are now all up-to-date!` was seen. */
    readonly upToDate: boolean;
    /** The count from `Start updating N maps ...`, or null if it never appeared. */
    readonly mapsScheduled: number | null;
    /** Map ids the CLI reported loading. */
    readonly mapsLoaded: readonly string[];
    /** True if the CLI complained that the Mojang download was not accepted. */
    readonly consentMissing: boolean;
    /** Upstream's multi-line "problem with your BlueMap setup" banners, in order. */
    readonly setupProblems: readonly string[];
    /** The last few WARNING and ERROR lines, for a failure report. */
    readonly diagnostics: readonly string[];
    readonly durationMs: number;
}

/** How long a polite stop is given before the process is killed outright. */
export const CANCEL_GRACE_MS = 8_000;

/** Kept bounded: a failure report wants the last few complaints, not the whole log. */
const MAX_DIAGNOSTICS = 40;

/**
 * One run of the CLI.
 *
 * Constructed, then `start()`ed once. `cancel()` is safe at any point, including before
 * the process has spawned and after it has exited, because a person pressing Cancel
 * does not know or care which of those is true at that instant.
 */
export class CliRun {
    private readonly options: CliRunOptions;
    private child: CliChildProcess | null = null;
    private cancelRequested = false;
    private killTimer: NodeJS.Timeout | null = null;
    private finished = false;

    private readonly tracker = new RenderOutputTracker();
    private readonly diagnostics: string[] = [];
    private readonly mapsLoaded: string[] = [];
    private readonly setupProblems: string[] = [];
    private mapsScheduled: number | null = null;
    private upToDate = false;
    private consentMissing = false;

    constructor(options: CliRunOptions) {
        this.options = options;
    }

    /** The arguments this run will pass, exposed so a report can quote them exactly. */
    arguments(): string[] {
        const options = this.options;
        const args: string[] = [...(options.jvmArgs ?? [])];
        args.push("-jar", options.jarPath);
        args.push("-c", options.configDir);
        // `-r` renders; `-s` writes the webapp's settings.json, which is the first file
        // the viewer loads and the one that lists the maps. `-g` is deliberately not
        // passed: it would also unpack upstream's own webapp - index.html, its bundle
        // and a sql.php - into the web root, and this app ships its own viewer.
        args.push("-r", "-s");
        if (options.force === true) args.push("-f");
        if (options.fixEdges === true) args.push("-e");
        if (options.maps !== undefined && options.maps.length > 0) {
            args.push("-m", options.maps.join(","));
        }
        return args;
    }

    /**
     * Spawns the process and resolves when it has exited.
     *
     * Never rejects. A spawn failure is an outcome the interface has to render, the
     * same as a non-zero exit, and turning one of the two into a thrown exception makes
     * every caller handle the same event twice.
     */
    async start(): Promise<CliRunResult> {
        const startedAt = Date.now();
        if (this.cancelRequested) {
            return this.result(null, null, startedAt);
        }

        const spawn = this.options.spawn ?? defaultSpawn;
        let child: CliChildProcess;
        try {
            child = spawn(this.options.javaExecutable, this.arguments(), {
                cwd: this.options.cwd,
                env: this.options.env ?? process.env,
            });
        } catch (error) {
            this.diagnostics.push(describe(error));
            this.finished = true;
            return this.result(null, null, startedAt);
        }
        this.child = child;

        const stdout = this.pipe(child.stdout, "stdout");
        const stderr = this.pipe(child.stderr, "stderr");

        const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
            (resolve) => {
                child.once("error", (error) => {
                    this.diagnostics.push(describe(error));
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
     * Asks the render to stop, then makes sure it did.
     *
     * Returns immediately; `start()`'s promise is what resolves when the process is
     * actually gone. Calling it twice is harmless, which matters because "did that
     * click register?" is answered by clicking again.
     */
    cancel(): void {
        if (this.cancelRequested) return;
        this.cancelRequested = true;

        const child = this.child;
        if (child === null || this.finished || child.exitCode !== null) return;

        child.kill("SIGINT");

        // On Windows this timer never fires, because `kill` there is `TerminateProcess`
        // and the process is already gone. On a platform with real signals it is the
        // deadline on a JVM that has decided not to honour its shutdown hook.
        this.killTimer = setTimeout(() => {
            if (!this.finished && child.exitCode === null) child.kill("SIGKILL");
        }, CANCEL_GRACE_MS);
        // Never hold the event loop open on behalf of a process that is already dying.
        this.killTimer.unref?.();
    }

    /** True once cancellation has been asked for. */
    isCancelled(): boolean {
        return this.cancelRequested;
    }

    /**
     * The OS process id this run is backed by right now, or `null` when there is none to
     * address - never spawned yet, already exited, or the child object never reported one.
     *
     * The process tree here is exactly one process: the JVM itself, spawned directly with
     * no shell and no launcher script in between (see this file's own header comment). So
     * a caller that wants to touch "the whole process tree" a running render occupies
     * needs nothing more than this one id - there is no child of the JVM to also reach.
     */
    pid(): number | null {
        if (this.child === null || this.finished) return null;
        if (this.child.exitCode !== null) return null;
        const pid = this.child.pid;
        return typeof pid === "number" ? pid : null;
    }

    private clearKillTimer(): void {
        if (this.killTimer === null) return;
        clearTimeout(this.killTimer);
        this.killTimer = null;
    }

    private async pipe(
        stream: NodeJS.ReadableStream,
        which: "stdout" | "stderr",
    ): Promise<void> {
        const splitter = new LineSplitter();
        stream.setEncoding("utf8");
        for await (const chunk of stream as AsyncIterable<string>) {
            for (const line of splitter.push(chunk)) {
                for (const signal of this.tracker.push(line)) this.consume(signal, which);
            }
        }
        for (const line of splitter.flush()) {
            for (const signal of this.tracker.push(line)) this.consume(signal, which);
        }
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
    ): CliRunResult {
        return {
            exitCode,
            signal,
            cancelled: this.cancelRequested,
            upToDate: this.upToDate,
            mapsScheduled: this.mapsScheduled,
            mapsLoaded: [...this.mapsLoaded],
            consentMissing: this.consentMissing,
            setupProblems: [...this.setupProblems],
            diagnostics: [...this.diagnostics],
            durationMs: Date.now() - startedAt,
        };
    }
}

const defaultSpawn: SpawnCli = (command, args, options) =>
    nodeSpawn(command, [...args], {
        cwd: options.cwd,
        env: options.env,
        // Explicit rather than inherited: the CLI reads nothing from stdin, and leaving
        // it attached to the app's own would let a child block on a terminal that is
        // not there. `windowsHide` keeps a console window from flashing up on Windows.
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
    });

function describe(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}
