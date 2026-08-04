/**
 * Running Chunker over a Bedrock world, and refusing to leave anything that looks like
 * a world unless one was actually produced.
 *
 * The invocation is the one Chunker's own README documents:
 *
 * ```
 * <java> -jar chunker-cli-<version>.jar -i <bedrock world> -f JAVA_1_21_4 -o <output>
 * ```
 *
 * Spawned directly, with no shell in between, for the same reason `render/runner.ts`
 * does it: a shell between this process and the JVM means the cancel path kills the shell
 * and leaves a detached JVM writing gigabytes into somebody's disk with nothing holding a
 * handle to it.
 *
 * ## Exit code zero does not mean it worked
 *
 * This is the single most important fact about driving this CLI, it is not obvious, and
 * it was established by reading Chunker's `CLI.java` rather than by guessing. Three of its
 * failure paths print a message to stderr and then leave `run()` normally, so picocli
 * returns 0 and the process exits 0:
 *
 * - `Failed to find suitable reader for the world.` - the input was not a world Chunker
 *   recognises. This is the *most likely* failure in this app, because it is what a
 *   corrupt or half-copied Bedrock world produces.
 * - `Failed to find suitable writer for the world.` - the target format was rejected.
 * - the `--keepOriginalNBT` guard, which calls `System.exit(0)` explicitly on refusal.
 *
 * A caller that trusts the exit code therefore reports a triumphant success over an empty
 * directory. So success here requires all three of: exit code 0, the `Conversion complete!`
 * line on stdout, and an output directory that {@link verifyConvertedWorld} confirms holds
 * an actual Java world. Any one of them missing is a failure, and is reported as one.
 *
 * The codes that *are* meaningful: `1` is a conversion exception, `12` is
 * `OutOfMemoryError`, and `2` is picocli's usage error, which for this app means it built a
 * command line wrong.
 *
 * ## Running out of memory is the expected failure, and exit code 12 rarely catches it
 *
 * Chunker's memory use grows without bound on larger worlds (see `memory.ts` for the
 * observation and who is claiming it), so out-of-memory is not an exotic case here - on a
 * big world it is the *likely* ending, and it deserves its own sentence rather than being
 * folded into a generic "conversion failed".
 *
 * Exit code 12 is not a reliable way to spot it. Chunker's `catch (OutOfMemoryError)` wraps
 * the body of `run()`, which is the **main** thread; the conversion itself runs as a task,
 * and a failure on one of its worker threads is captured by `conversionTask.future()
 * .exceptionally(...)`, printed as `Failed with exception` plus a stack trace, and exited
 * with **code 1**. So the most likely out-of-memory death arrives looking exactly like any
 * other exception, and a classifier keyed on exit 12 alone would mislabel it.
 *
 * Three signals are therefore treated as out-of-memory, in this order of reliability:
 * an `OutOfMemoryError`-shaped line anywhere in the output (which covers both the main
 * thread and every worker thread, and the `-XX:+ExitOnOutOfMemoryError` termination
 * notice), exit code 12, and - only when nothing completed - a process killed outright with
 * no exit code at all, which is what the operating system's own out-of-memory killer leaves
 * behind on a machine driven into paging.
 *
 * ## Nothing is written where a world would be until it is a world
 *
 * The conversion writes into a sibling staging directory ending in {@link STAGING_SUFFIX},
 * and that directory is renamed to the real name only after the output has been verified.
 * A cancelled conversion, a crashed JVM, a full disk and a machine that lost power all
 * leave a directory whose name says plainly that it is unfinished, and which the next run
 * removes. The alternative - converting in place and cleaning up afterwards - relies on
 * the cleanup code getting to run, which is exactly what does not happen in the cases that
 * matter.
 *
 * ## Cancellation
 *
 * Chunker's CLI polls a progress value in a loop and has no interrupt path of its own, so
 * cancelling means ending the process. As `render/runner.ts` documents from measurement on
 * this platform, Windows has no POSIX signals and libuv implements every `kill` as
 * `TerminateProcess`, so the JVM dies immediately without running a shutdown hook. There
 * is nothing to flush and nothing to lose: a half-written Java world is worthless, which
 * is precisely why it is being written under a staging name and deleted rather than saved.
 */

import { mkdir, rename, rm } from "node:fs/promises";
import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { dirname, join } from "node:path";
import { LineSplitter } from "../render/progress.js";
import { inspectWorldFolder } from "../world/inspect.js";

/**
 * The Java format converted worlds are written as.
 *
 * `JAVA_1_21_4` is a real identifier in Chunker's writer registry, not a guess: its
 * supported Java versions are enumerated in `JavaEncoders`, and the identifier is that
 * version with dots turned into underscores and a trailing `.0` dropped. A modern format
 * that BlueMap has long read, rather than the newest Chunker offers - the target only has
 * to be something the renderer definitely understands, and picking the bleeding edge trades
 * a benefit nobody gets for a risk somebody eventually hits.
 *
 * Chunker resolves a format to its nearest supported version, and rejects an unknown one
 * with a message listing every valid value - which {@link ChunkerConversion} captures and
 * reports rather than swallowing.
 */
export const DEFAULT_JAVA_TARGET = "JAVA_1_21_4";

/** What an unfinished conversion is called on disk, so it can never be mistaken for a world. */
export const STAGING_SUFFIX = ".converting";

/**
 * The JVM arguments to run Chunker with, and - just as deliberately - the one that is absent.
 *
 * **No `-Xmx`.** Chunker's memory use grows without bound on larger worlds (see
 * `memory.ts`), and against unbounded growth a heap ceiling is not a fix, it is the point at
 * which the failure happens. Raising it does not avoid the failure; it delays it, and a
 * delayed one lands harder, because a JVM permitted to reach most of physical memory drives
 * the machine into paging or gets killed by the operating system - which reaches this code
 * as a process that vanished rather than as an `OutOfMemoryError` anybody can read. Leaving
 * it off means the JVM's own default ceiling applies, which is a documented, predictable
 * fraction of physical RAM and is not a claim by this app that the problem is handled.
 *
 * **`-XX:+ExitOnOutOfMemoryError`** is the one flag genuinely worth passing, and it is not a
 * mitigation either - it changes nothing about whether the conversion succeeds. It makes the
 * *failure* honest: the JVM halts at the first `OutOfMemoryError` on any thread and prints
 * `Terminating due to java.lang.OutOfMemoryError`. Without it, Chunker catches a
 * worker-thread failure into `exceptionally(...)` and exits 1 like any other exception,
 * while the process may thrash for minutes first. With it the ending is immediate and
 * carries a line {@link OUT_OF_MEMORY_LINE} recognises, which is what lets the person be
 * told what actually happened instead of "conversion failed".
 */
export const RECOMMENDED_JVM_ARGS: readonly string[] = ["-XX:+ExitOnOutOfMemoryError"];

/** Chunker's own exit code for running out of heap. */
export const EXIT_OUT_OF_MEMORY = 12;

/** picocli's exit code for a command line this app built wrongly. */
export const EXIT_USAGE = 2;

/** The line Chunker prints on the one path that actually finished the work. */
const COMPLETE_LINE = /^Conversion complete!/;

/**
 * Chunker's progress line, e.g. `42.50%`.
 *
 * It is printed with `System.out.printf("%.2f%%%n", …)`, which formats in the JVM's
 * **default locale** - so on a machine set to French or German the separator is a comma
 * and a parser that only accepts a dot silently reports no progress at all for the entire
 * conversion. Both are accepted, and the fraction is optional because a locale may drop it.
 */
const PROGRESS_LINE = /^\s*(\d{1,3})(?:[.,](\d+))?\s*%\s*$/;

/** `Converting from Bedrock 1.20.80 to Java 1.21.4`, which names both real versions. */
const CONVERTING_LINE = /^Converting from (\S+) (\S+) to (\S+) (\S+)/;

/** The failure paths that exit zero. See the note at the top of the file. */
const SILENT_FAILURE_LINE = /^Failed to find suitable (reader|writer)/;

/**
 * How a JVM says it ran out of memory, in every form this can arrive in.
 *
 * Matched against every line of both streams rather than only the last, because the useful
 * one is inside a stack trace that Chunker prints before exiting with a code that says
 * nothing about memory. `Terminating due to` is the notice the JVM itself prints under
 * `-XX:+ExitOnOutOfMemoryError`, which is why this app passes that flag: it turns an
 * ambiguous exit into a line that can be recognised.
 *
 * The narrower variants are listed alongside the general one because a
 * `GC overhead limit exceeded` is what a *leak* looks like just before the end - the heap
 * is technically not full, the collector is simply making no progress - and it would
 * otherwise be classified as an ordinary crash.
 */
const OUT_OF_MEMORY_LINE =
    /\b(java\.lang\.)?OutOfMemoryError\b|\bJava heap space\b|\bGC overhead limit exceeded\b|\bTerminating due to java\.lang\.OutOfMemoryError\b|\bRequested array size exceeds VM limit\b/i;

export type ConversionPhase = "starting" | "converting" | "compacting" | "verifying";

export type ConversionEvent =
    | { readonly kind: "phase"; readonly phase: ConversionPhase }
    | { readonly kind: "progress"; readonly percent: number }
    | { readonly kind: "editions"; readonly from: string; readonly to: string }
    | { readonly kind: "log"; readonly line: string; readonly stream: "stdout" | "stderr" };

export type SpawnChunker = (
    command: string,
    args: readonly string[],
    options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
) => ChildProcessByStdio<null, Readable, Readable>;

export interface ChunkerRunOptions {
    /** Absolute path to the `java` executable, from `main/java/`. Java 17 or newer. */
    readonly javaExecutable: string;
    /** Absolute path to the chunker-cli jar. */
    readonly jarPath: string;
    /** The Bedrock world. Read only; never written to. */
    readonly inputDirectory: string;
    /** Where the Java world is written. Should be a staging path. */
    readonly outputDirectory: string;
    readonly outputFormat?: string;
    /**
     * A pruning JSON file for `-p`, restricting the conversion to part of the world.
     *
     * Used by the batched path in `batchConvert.ts`. A path rather than an inline JSON object
     * even though Chunker accepts both: a batch's config can list dozens of bounding boxes,
     * and a JSON object of that size on a command line runs into the platform's argument
     * limit and into every layer that quotes it differently.
     */
    readonly pruningFile?: string;
    /** Extra JVM arguments, before `-jar`. See {@link RECOMMENDED_JVM_ARGS}. */
    readonly jvmArgs?: readonly string[];
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly onEvent?: (event: ConversionEvent) => void;
    readonly spawn?: SpawnChunker;
}

export interface ChunkerRunResult {
    readonly exitCode: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly cancelled: boolean;
    /** True only if `Conversion complete!` was actually printed. */
    readonly completeLineSeen: boolean;
    /** Set when Chunker reported it could not read the input or write the output. */
    readonly silentFailure: string | null;
    /**
     * The out-of-memory line, when one appeared anywhere in the output.
     *
     * Far more trustworthy than the exit code for this particular failure - see the note at
     * the top of the file for why a worker-thread OOM arrives as a plain exit 1.
     */
    readonly outOfMemory: string | null;
    readonly sourceEdition: string | null;
    readonly targetEdition: string | null;
    readonly lastPercent: number;
    /** The last few lines, bounded, for a failure report. */
    readonly diagnostics: readonly string[];
    readonly durationMs: number;
}

/** Kept bounded: a failure report wants the last complaints, not a whole conversion log. */
const MAX_DIAGNOSTICS = 40;

/** How long a polite stop is given before the process is killed outright. */
export const CANCEL_GRACE_MS = 8_000;

/**
 * One run of the Chunker CLI.
 *
 * Never rejects. A spawn failure - no JVM at that path, a jar that is not a jar - is an
 * outcome the interface has to render exactly like a non-zero exit, and turning one of the
 * two into a thrown exception makes every caller handle the same event twice.
 */
export class ChunkerConversion {
    private readonly options: ChunkerRunOptions;
    private child: ChildProcessByStdio<null, Readable, Readable> | null = null;
    private cancelRequested = false;
    private killTimer: NodeJS.Timeout | null = null;
    private finished = false;

    private readonly diagnostics: string[] = [];
    private completeLineSeen = false;
    private silentFailure: string | null = null;
    private outOfMemory: string | null = null;
    private sourceEdition: string | null = null;
    private targetEdition: string | null = null;
    private lastPercent = 0;

    constructor(options: ChunkerRunOptions) {
        this.options = options;
    }

    /** The arguments this run will pass, exposed so a report can quote them exactly. */
    arguments(): string[] {
        const options = this.options;
        const args: string[] = [...(options.jvmArgs ?? [])];
        args.push("-jar", options.jarPath);
        args.push("-i", options.inputDirectory);
        args.push("-f", options.outputFormat ?? DEFAULT_JAVA_TARGET);
        args.push("-o", options.outputDirectory);
        if (options.pruningFile !== undefined) args.push("-p", options.pruningFile);
        // `--keepOriginalNBT` is deliberately never passed. Chunker only honours it when
        // input and output formats match, and refuses the whole conversion with
        // `System.exit(0)` when they differ - which for a Bedrock-to-Java conversion is
        // always. Passing it would turn every conversion into a silent no-op.
        return args;
    }

    async start(): Promise<ChunkerRunResult> {
        const startedAt = Date.now();
        if (this.cancelRequested) return this.result(null, null, startedAt);

        this.emit({ kind: "phase", phase: "starting" });

        const spawn = this.options.spawn ?? defaultSpawn;
        let child: ChildProcessByStdio<null, Readable, Readable>;
        try {
            child = spawn(this.options.javaExecutable, this.arguments(), {
                // The CLI resolves relative paths against its working directory. Every path
                // this app passes is absolute, so this only decides where a stray file would
                // land; the world's own parent is the least surprising place for that.
                cwd: this.options.cwd ?? dirname(this.options.outputDirectory),
                env: this.options.env ?? process.env,
            });
        } catch (error) {
            this.record(describe(error));
            this.finished = true;
            return this.result(null, null, startedAt);
        }
        this.child = child;

        this.emit({ kind: "phase", phase: "converting" });

        const stdout = this.pipe(child.stdout, "stdout");
        const stderr = this.pipe(child.stderr, "stderr");

        const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
            (resolve) => {
                child.once("error", (error) => {
                    this.record(describe(error));
                    resolve({ code: null, signal: null });
                });
                child.once("close", (code, signal) => resolve({ code, signal }));
            },
        );

        // Awaited after `close` rather than raced with it: the streams can still hold
        // buffered output when the process ends, and on this CLI the last line before a
        // crash is the stack trace that explains it.
        await Promise.all([stdout, stderr]);

        this.finished = true;
        this.clearKillTimer();
        return this.result(exit.code, exit.signal, startedAt);
    }

    /**
     * Asks the conversion to stop, then makes sure it did.
     *
     * Returns immediately; `start()`'s promise resolves when the process is actually gone.
     * Calling it twice is harmless, which matters because "did that click register?" is
     * answered by clicking again.
     */
    cancel(): void {
        if (this.cancelRequested) return;
        this.cancelRequested = true;

        const child = this.child;
        if (child === null || this.finished || child.exitCode !== null) return;

        child.kill("SIGINT");
        this.killTimer = setTimeout(() => {
            if (!this.finished && child.exitCode === null) child.kill("SIGKILL");
        }, CANCEL_GRACE_MS);
        // Never hold the event loop open on behalf of a process that is already dying.
        this.killTimer.unref?.();
    }

    isCancelled(): boolean {
        return this.cancelRequested;
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
            for (const line of splitter.push(chunk)) this.consume(line, which);
        }
        for (const line of splitter.flush()) this.consume(line, which);
    }

    private consume(raw: string, which: "stdout" | "stderr"): void {
        const line = raw.trimEnd();
        if (line.trim() === "") return;

        // Checked on every line of both streams, before anything else, because it arrives
        // inside a stack trace whose exit code will not mention memory at all.
        if (this.outOfMemory === null && OUT_OF_MEMORY_LINE.test(line)) {
            this.outOfMemory = line.trim();
            this.record(line);
        }

        const progress = PROGRESS_LINE.exec(line);
        if (progress !== null) {
            const whole = Number.parseInt(progress[1] ?? "0", 10);
            const fraction = Number.parseFloat(`0.${progress[2] ?? "0"}`);
            // Clamped rather than trusted. A progress bar driven past 100 renders as a
            // filled bar that keeps growing, which reads as a bug in this app rather than
            // as rounding in somebody else's printf.
            const percent = Math.min(100, Math.max(0, whole + fraction));
            this.lastPercent = percent;
            this.emit({ kind: "progress", percent });
            return;
        }

        if (COMPLETE_LINE.test(line)) {
            this.completeLineSeen = true;
        } else if (line.startsWith("Compacting world")) {
            // A long, silent tail on a big world. Named as its own phase so a bar that has
            // sat at 100% for four minutes is explained rather than looking like a hang.
            this.emit({ kind: "phase", phase: "compacting" });
        } else {
            const converting = CONVERTING_LINE.exec(line);
            if (converting !== null) {
                this.sourceEdition = `${converting[1] ?? ""} ${converting[2] ?? ""}`.trim();
                this.targetEdition = `${converting[3] ?? ""} ${converting[4] ?? ""}`.trim();
                this.emit({
                    kind: "editions",
                    from: this.sourceEdition,
                    to: this.targetEdition,
                });
            } else if (SILENT_FAILURE_LINE.test(line)) {
                // The whole reason this class cannot trust an exit code. Captured here so
                // the failure has the CLI's own words in it rather than a generic sentence.
                this.silentFailure ??= line;
                this.record(line);
            } else if (which === "stderr") {
                this.record(line);
            }
        }

        this.emit({ kind: "log", line, stream: which });
    }

    private emit(event: ConversionEvent): void {
        this.options.onEvent?.(event);
    }

    private record(text: string): void {
        if (text.trim() === "") return;
        this.diagnostics.push(text);
        if (this.diagnostics.length > MAX_DIAGNOSTICS) this.diagnostics.shift();
    }

    private result(
        exitCode: number | null,
        signal: NodeJS.Signals | null,
        startedAt: number,
    ): ChunkerRunResult {
        return {
            exitCode,
            signal,
            cancelled: this.cancelRequested,
            completeLineSeen: this.completeLineSeen,
            silentFailure: this.silentFailure,
            outOfMemory: this.outOfMemory,
            sourceEdition: this.sourceEdition,
            targetEdition: this.targetEdition,
            lastPercent: this.lastPercent,
            diagnostics: [...this.diagnostics],
            durationMs: Date.now() - startedAt,
        };
    }
}

const defaultSpawn: SpawnChunker = (command, args, options) =>
    nodeSpawn(command, [...args], {
        cwd: options.cwd,
        env: options.env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
    });

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export interface ConvertedWorldCheck {
    readonly ok: boolean;
    readonly regionFiles: number;
    readonly levelDat: boolean;
    /** Why it is not a world, when it is not. Empty when `ok`. */
    readonly reason: string;
}

/**
 * Whether what Chunker wrote is actually a Java world.
 *
 * The third leg of the success test, and the only one that inspects the result rather than
 * believing a report about it. A `level.dat` alone is not enough: Chunker writes the level
 * data before it writes chunks, so a conversion killed early leaves a directory that has
 * one and no terrain at all, which BlueMap would happily render as a completely blank map.
 *
 * Injectable inspection so the whole success-and-failure matrix is testable without ever
 * producing a real converted world.
 */
export async function verifyConvertedWorld(
    directory: string,
    inspect: typeof inspectWorldFolder = inspectWorldFolder,
): Promise<ConvertedWorldCheck> {
    let listing;
    try {
        listing = await inspect(directory);
    } catch (error) {
        return {
            ok: false,
            regionFiles: 0,
            levelDat: false,
            reason: `The converted world could not be read back: ${describe(error)}`,
        };
    }

    const levelDat = listing.entries.some(
        (entry) => !entry.directory && entry.path.toLowerCase() === "level.dat",
    );
    let regionFiles = 0;
    for (const [key, count] of Object.entries(listing.regionFiles)) {
        // The empty key is the chosen folder itself, which for a world is never where
        // region files live. Counting it would let a directory of stray `.mca` files pass.
        if (key === "") continue;
        regionFiles += count;
    }

    if (!levelDat) {
        return {
            ok: false,
            regionFiles,
            levelDat,
            reason: "The conversion produced no level.dat, so nothing usable was written.",
        };
    }
    if (regionFiles === 0) {
        return {
            ok: false,
            regionFiles,
            levelDat,
            reason:
                "The conversion produced a level.dat but no region files, so the world has " +
                "no terrain in it. This is what a conversion that stopped early leaves behind.",
        };
    }
    return { ok: true, regionFiles, levelDat, reason: "" };
}

export type ConversionFailureCode =
    | "cancelled"
    | "spawn-failed"
    | "unreadable-input"
    | "out-of-memory"
    | "bad-invocation"
    | "chunker-failed"
    | "incomplete-output";

export interface ConversionSuccess {
    readonly ok: true;
    /** Where the Java world ended up, absolute and ready to render. */
    readonly outputDirectory: string;
    readonly regionFiles: number;
    readonly sourceEdition: string | null;
    readonly targetEdition: string | null;
    readonly durationMs: number;
}

export interface ConversionFailure {
    readonly ok: false;
    readonly code: ConversionFailureCode;
    readonly message: string;
    /** True when the staging directory was removed, which is the normal case. */
    readonly cleanedUp: boolean;
    readonly diagnostics: readonly string[];
    readonly durationMs: number;
}

export type ConversionOutcome = ConversionSuccess | ConversionFailure;

export interface ConvertWorldOptions extends Omit<ChunkerRunOptions, "outputDirectory"> {
    /** Where the finished Java world should end up. Must not already exist. */
    readonly outputDirectory: string;
    /**
     * The source world's measured size, used only to phrase an out-of-memory failure.
     *
     * Optional and never load-bearing: it lets the message say "this world is 1.4 GB, and
     * the converter's memory use grows without bound past about 200 MB" instead of a
     * sizeless sentence. A conversion runs identically without it.
     */
    readonly sourceBytes?: number | null;
    /** Injected in tests so no conversion has to happen to prove the outcomes. */
    readonly run?: (options: ChunkerRunOptions) => {
        start(): Promise<ChunkerRunResult>;
        cancel(): void;
    };
    /**
     * Handed the live run the instant it exists, so a Cancel button can reach it.
     *
     * The run is constructed inside this function, which means a caller has no other way
     * to get at it. Without this callback a cancel channel could only ever set a flag that
     * nothing reads, and a Cancel button that reports success while a JVM keeps converting
     * is worse than one that plainly does not work.
     */
    readonly onStart?: (handle: { cancel(): void }) => void;
    readonly verify?: typeof verifyConvertedWorld;
    /** Injected in tests. Defaults to `fs.rm`. */
    readonly remove?: (path: string) => Promise<void>;
}

/**
 * Converts a Bedrock world into a Java one, or leaves the disk as it found it.
 *
 * The whole contract in one sentence: on any outcome other than a verified success, the
 * final output path does not exist. The conversion runs into `<output>.converting`, and
 * that name only becomes the real one after {@link verifyConvertedWorld} has confirmed
 * there is a world in it. Every failure path deletes the staging directory.
 *
 * Never rejects. The outcome is a value, including the failures, because a refusal that
 * arrives as an exception is a refusal every caller has to remember to catch.
 */
export async function convertBedrockWorld(
    options: ConvertWorldOptions,
): Promise<ConversionOutcome> {
    const staging = `${options.outputDirectory}${STAGING_SUFFIX}`;
    const remove = options.remove ?? ((path: string) => rm(path, { recursive: true, force: true }));
    const verify = options.verify ?? verifyConvertedWorld;

    // A staging directory left by a previous attempt - a crash, a power cut - is removed
    // rather than converted into. Chunker would otherwise write into a directory already
    // holding half of an unrelated conversion, and the result would pass verification
    // while being a mixture of two worlds.
    await remove(staging);
    await mkdir(staging, { recursive: true });

    const outputDirectory = options.outputDirectory;

    // Built field by field rather than by spreading `options` minus a few keys. The run
    // receives the *staging* directory, and a rest-spread would silently carry any future
    // option added to this function's own signature through to the CLI runner - including
    // the real `outputDirectory`, which is the one value that must not reach it.
    const runOptions: ChunkerRunOptions = {
        javaExecutable: options.javaExecutable,
        jarPath: options.jarPath,
        inputDirectory: options.inputDirectory,
        outputDirectory: staging,
        ...(options.outputFormat === undefined ? {} : { outputFormat: options.outputFormat }),
        ...(options.pruningFile === undefined ? {} : { pruningFile: options.pruningFile }),
        ...(options.jvmArgs === undefined ? {} : { jvmArgs: options.jvmArgs }),
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        ...(options.env === undefined ? {} : { env: options.env }),
        ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
        ...(options.spawn === undefined ? {} : { spawn: options.spawn }),
    };

    const conversion = (options.run ?? ((o: ChunkerRunOptions) => new ChunkerConversion(o)))(
        runOptions,
    );
    options.onStart?.(conversion);

    const result = await conversion.start();

    const fail = async (
        code: ConversionFailureCode,
        message: string,
    ): Promise<ConversionFailure> => {
        let cleanedUp = true;
        try {
            await remove(staging);
        } catch {
            // Reported rather than thrown. The conversion has already failed; failing
            // again on the tidy-up would replace a message naming the real problem with
            // one naming a permission error on a directory nobody asked about. The
            // directory keeps its `.converting` name either way, so it can never be
            // mistaken for a world.
            cleanedUp = false;
        }
        return {
            ok: false,
            code,
            message,
            cleanedUp,
            diagnostics: result.diagnostics,
            durationMs: result.durationMs,
        };
    };

    if (result.cancelled) {
        return await fail(
            "cancelled",
            "The conversion was cancelled. The half-converted copy has been deleted; the " +
                "Bedrock world was never modified.",
        );
    }

    // Before the spawn check, because a process the operating system killed for memory also
    // arrives with no exit code, and "Chunker could not be started" would be a flatly wrong
    // description of a conversion that ran for twenty minutes first.
    if (outOfMemoryHappened(result)) {
        return await fail("out-of-memory", outOfMemoryMessage(options.sourceBytes ?? null));
    }

    if (result.exitCode === null && result.signal === null) {
        return await fail(
            "spawn-failed",
            `Chunker could not be started: ${result.diagnostics.at(-1) ?? "the process did not run."}`,
        );
    }

    // Checked before the exit code, because this is the failure that exits zero.
    if (result.silentFailure !== null) {
        return await fail(
            "unreadable-input",
            `Chunker could not use this world: ${result.silentFailure} This usually means the ` +
                `folder is not a complete Bedrock world - a copy taken while the game was ` +
                `running, or one missing its db folder.`,
        );
    }

    if (result.exitCode === EXIT_USAGE) {
        return await fail(
            "bad-invocation",
            `Chunker rejected the command line this app built: ${result.diagnostics.at(-1) ?? "no detail was given."}`,
        );
    }
    if (result.exitCode !== 0) {
        return await fail(
            "chunker-failed",
            `Chunker stopped with exit code ${String(result.exitCode)}. ${result.diagnostics.at(-1) ?? ""}`.trim(),
        );
    }
    if (!result.completeLineSeen) {
        return await fail(
            "incomplete-output",
            "Chunker exited without reporting that the conversion completed, so the copy " +
                "cannot be trusted and has been deleted.",
        );
    }

    const check = await verify(staging);
    if (!check.ok) {
        return await fail("incomplete-output", check.reason);
    }

    // The rename is the moment the copy becomes a world. Everything before it happened
    // under a name that says "unfinished", so there is no instant at which a partly
    // written directory is sitting at the path the rest of the app treats as a world.
    await mkdir(dirname(outputDirectory), { recursive: true });
    await rename(staging, outputDirectory);

    return {
        ok: true,
        outputDirectory,
        regionFiles: check.regionFiles,
        sourceEdition: result.sourceEdition,
        targetEdition: result.targetEdition,
        durationMs: result.durationMs,
    };
}

/**
 * Whether this run died for memory.
 *
 * Three signals, deliberately in this order. The printed error is the reliable one and
 * covers every thread; exit code 12 only fires for an out-of-memory on Chunker's main
 * thread; and a process that ended with neither an exit code nor a signal, having produced
 * real progress and no completion, is what an operating system's own out-of-memory killer
 * leaves behind - which is exactly the ending a heap allowed to grow until the machine
 * pages produces.
 *
 * The last of the three requires `lastPercent > 0` so it cannot swallow a genuine spawn
 * failure: a JVM that never started has no progress to its name.
 */
function outOfMemoryHappened(result: ChunkerRunResult): boolean {
    if (result.cancelled) return false;
    if (result.outOfMemory !== null) return true;
    if (result.exitCode === EXIT_OUT_OF_MEMORY) return true;
    return (
        result.exitCode === null &&
        result.signal === null &&
        result.lastPercent > 0 &&
        !result.completeLineSeen
    );
}

/**
 * What to say when it does, which is not "try a bigger heap".
 *
 * The remedy Chunker's own issue tracker offers is a larger `-Xmx`. That advice assumes the
 * failure is a world too big for the available RAM; if the converter's memory use grows
 * without bound then a larger heap only postpones the same ending, and postponing it makes
 * it land harder - a JVM allowed to reach most of physical memory takes the machine into
 * paging or gets killed outright by the operating system. Repeating that advice here would
 * send somebody to run the same twenty-minute conversion again with a number changed and
 * nothing else, so this names the limitation instead and offers the options that do work.
 */
function outOfMemoryMessage(sourceBytes: number | null): string {
    const size =
        sourceBytes !== null && sourceBytes > 0
            ? ` This world is ${(sourceBytes / (1024 * 1024 * 1024)).toFixed(1)} GB.`
            : "";
    return (
        `The converter ran out of memory, which it is known to do on worlds this size.` +
        `${size} Chunker's memory use grows without bound past roughly 200 MB of world, so ` +
        `this is a limitation of the converter rather than of your world, your computer or ` +
        `this app - and giving it more memory does not fix it, it only moves the failure ` +
        `later. Nothing was left behind and your Bedrock world was not modified. What does ` +
        `help is converting a smaller world, trimming this one first, or using a machine ` +
        `with considerably more RAM.`
    );
}

/**
 * Where a converted copy of a world goes, and roughly how big it will be.
 *
 * Beside the original rather than inside it - writing into the Bedrock world would break
 * the promise that the original is untouched, and Minecraft would then find a stray
 * directory in a save it manages.
 */
export function convertedWorldPath(bedrockWorld: string, suffix = " (Java)"): string {
    const parent = dirname(bedrockWorld);
    const name = bedrockWorld.slice(parent.length).replace(/^[\\/]+/, "");
    return join(parent, `${name}${suffix}`);
}

/**
 * An honest estimate of the converted world's size, in bytes.
 *
 * Presented as a range and labelled an estimate wherever it is shown, because it is one.
 * Anvil stores chunks in 32x32 regions with its own compression while Bedrock's LevelDB
 * stores them per-chunk with a compaction pass, so the ratio genuinely varies with how
 * sparse the world is. The lower bound is the source size - a conversion that shrank a
 * world would be a surprise - and the upper bound is twice it, which is where the
 * disk-space warning should be drawn.
 *
 * Null in, null out. A world whose size could not be measured gets no invented estimate.
 */
export function estimateConvertedSize(
    sourceBytes: number | null,
): { readonly low: number; readonly high: number } | null {
    if (sourceBytes === null || sourceBytes <= 0) return null;
    return { low: sourceBytes, high: sourceBytes * 2 };
}
