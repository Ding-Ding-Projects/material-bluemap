/**
 * Converting, and the far more important question of what is left on disk when it does
 * not work.
 *
 * The process runner is injected everywhere, so nothing here launches a JVM, needs Chunker
 * installed, or needs a Bedrock world. Where the subject is the *disk* - a cancelled run
 * tidying up, a failed run not leaving something that looks like a world - the real file
 * system is used with a temporary directory, because a mocked `rm` would prove only that
 * this code called a function.
 */

import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    ChunkerConversion,
    DEFAULT_JAVA_TARGET,
    EXIT_OUT_OF_MEMORY,
    EXIT_USAGE,
    RECOMMENDED_JVM_ARGS,
    STAGING_SUFFIX,
    convertBedrockWorld,
    convertedWorldPath,
    estimateConvertedSize,
    verifyConvertedWorld,
    type ChunkerRunOptions,
    type ChunkerRunResult,
    type ConversionEvent,
    type SpawnChunker,
} from "./convert.js";

let root = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-convert-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/**
 * A stand-in for the Chunker process.
 *
 * Emits the lines it is given, then closes with the given code - which is exactly the
 * surface `ChunkerConversion` reads, so a test written against this is a test of the real
 * parsing rather than of a mock's shape.
 */
function fakeSpawn(options: {
    stdout?: string[];
    stderr?: string[];
    code?: number | null;
    signal?: NodeJS.Signals | null;
    onKill?: (child: EventEmitter) => void;
}): SpawnChunker {
    return () => {
        const child = new EventEmitter() as EventEmitter & {
            stdout: Readable;
            stderr: Readable;
            exitCode: number | null;
            kill(signal?: NodeJS.Signals): boolean;
        };
        child.stdout = Readable.from([(options.stdout ?? []).map((l) => `${l}\n`).join("")]);
        child.stderr = Readable.from([(options.stderr ?? []).map((l) => `${l}\n`).join("")]);
        child.exitCode = null;
        child.kill = () => {
            options.onKill?.(child);
            return true;
        };
        setTimeout(() => {
            child.exitCode = options.code ?? 0;
            child.emit("close", options.code ?? 0, options.signal ?? null);
        }, 0);
        return child as never;
    };
}

const RUN_OPTIONS = {
    javaExecutable: "/jdk/bin/java",
    jarPath: "/data/chunker/chunker-cli-1.19.1.jar",
    inputDirectory: "/worlds/MyWorld",
    outputDirectory: "/worlds/MyWorld (Java)",
} as const;

describe("the command line", () => {
    it("is the one Chunker's README documents", () => {
        const args = new ChunkerConversion(RUN_OPTIONS).arguments();

        expect(args).toEqual([
            "-jar",
            RUN_OPTIONS.jarPath,
            "-i",
            RUN_OPTIONS.inputDirectory,
            "-f",
            DEFAULT_JAVA_TARGET,
            "-o",
            RUN_OPTIONS.outputDirectory,
        ]);
    });

    it("never passes --keepOriginalNBT, which would make every conversion a no-op", () => {
        // Chunker refuses it outright when input and output formats differ - which for
        // Bedrock-to-Java is always - and refuses by calling System.exit(0), so the app
        // would report a cheerful success over an empty folder.
        const args = new ChunkerConversion({
            ...RUN_OPTIONS,
            jvmArgs: RECOMMENDED_JVM_ARGS,
        }).arguments();
        expect(args).not.toContain("-k");
        expect(args).not.toContain("--keepOriginalNBT");
        expect(args[0]).toBe("-XX:+ExitOnOutOfMemoryError");
    });

    it("recommends no heap ceiling, because one would imply the leak is handled", () => {
        // Chunker's memory use grows without bound on larger worlds, so an -Xmx does not
        // decide whether the conversion succeeds - only when it fails, and a larger one
        // makes the landing worse. Shipping a number here would tell every reader of this
        // code that the problem was dealt with.
        expect(RECOMMENDED_JVM_ARGS.some((arg) => arg.startsWith("-Xmx"))).toBe(false);
        expect(RECOMMENDED_JVM_ARGS.some((arg) => arg.startsWith("-Xms"))).toBe(false);
        // What it does carry makes the failure recognisable rather than preventing it.
        expect(RECOMMENDED_JVM_ARGS).toContain("-XX:+ExitOnOutOfMemoryError");
    });
});

describe("reading Chunker's output", () => {
    it("follows progress, editions and completion", async () => {
        const events: ConversionEvent[] = [];
        const run = new ChunkerConversion({
            ...RUN_OPTIONS,
            onEvent: (event) => events.push(event),
            spawn: fakeSpawn({
                stdout: [
                    "Converting from Bedrock 1.21.30 to Java 1.21.4",
                    "0.00%",
                    "42.50%",
                    "100.00%",
                    "Conversion complete! Took 0h 3m 12s 40ms",
                ],
            }),
        });

        const result = await run.start();

        expect(result.exitCode).toBe(0);
        expect(result.completeLineSeen).toBe(true);
        expect(result.sourceEdition).toBe("Bedrock 1.21.30");
        expect(result.targetEdition).toBe("Java 1.21.4");
        expect(result.lastPercent).toBe(100);
        expect(events.filter((e) => e.kind === "progress")).toHaveLength(3);
    });

    it("reads a comma decimal separator, which a non-English JVM prints", async () => {
        // Chunker formats with printf("%.2f%%") in the JVM's default locale. A parser that
        // only accepts a dot reports zero progress for an entire conversion on a machine
        // set to French or German, and the bar simply never moves.
        const run = new ChunkerConversion({
            ...RUN_OPTIONS,
            spawn: fakeSpawn({ stdout: ["37,25%", "Conversion complete!"] }),
        });

        const result = await run.start();

        expect(result.lastPercent).toBeCloseTo(37.25, 2);
    });

    it("notices the compaction phase, so a bar stuck at 100% is explained", async () => {
        const events: ConversionEvent[] = [];
        await new ChunkerConversion({
            ...RUN_OPTIONS,
            onEvent: (event) => events.push(event),
            spawn: fakeSpawn({
                stdout: ["100.00%", "Compacting world, this may take a while...", "Conversion complete!"],
            }),
        }).start();

        expect(events).toContainEqual({ kind: "phase", phase: "compacting" });
    });

    it("catches the failure that exits zero", async () => {
        const result = await new ChunkerConversion({
            ...RUN_OPTIONS,
            spawn: fakeSpawn({
                stderr: ["Failed to find suitable reader for the world."],
                code: 0,
            }),
        }).start();

        // Exit zero, no complete line, and a captured reason. All three matter.
        expect(result.exitCode).toBe(0);
        expect(result.completeLineSeen).toBe(false);
        expect(result.silentFailure).toContain("Failed to find suitable reader");
    });

    it("spots an OutOfMemoryError in a stack trace, whatever the exit code says", async () => {
        const result = await new ChunkerConversion({
            ...RUN_OPTIONS,
            spawn: fakeSpawn({
                stdout: ["12.00%", "48.00%"],
                stderr: [
                    "Failed with exception",
                    "java.lang.OutOfMemoryError: Java heap space",
                    "\tat com.hivemc.chunker.conversion.WorldConverter.convert(WorldConverter.java:214)",
                ],
                code: 1,
            }),
        }).start();

        // Exit 1, not 12 - the code alone says only "an exception happened".
        expect(result.exitCode).toBe(1);
        expect(result.outOfMemory).toContain("OutOfMemoryError");
    });

    it("spots the JVM's own ExitOnOutOfMemoryError notice", async () => {
        const result = await new ChunkerConversion({
            ...RUN_OPTIONS,
            spawn: fakeSpawn({
                stdout: ["30.00%"],
                stderr: ["Terminating due to java.lang.OutOfMemoryError: Java heap space"],
                code: 3,
            }),
        }).start();

        expect(result.outOfMemory).toContain("Terminating due to");
    });

    it("spots a collector making no progress, which is what a leak looks like at the end", async () => {
        const result = await new ChunkerConversion({
            ...RUN_OPTIONS,
            spawn: fakeSpawn({ stderr: ["GC overhead limit exceeded"], code: 1 }),
        }).start();

        expect(result.outOfMemory).toContain("GC overhead limit exceeded");
    });

    it("does not see memory trouble in an ordinary run", async () => {
        const result = await new ChunkerConversion({
            ...RUN_OPTIONS,
            spawn: fakeSpawn({ stdout: ["50.00%", "Conversion complete!"] }),
        }).start();

        expect(result.outOfMemory).toBeNull();
    });

    it("does not reject when the process cannot be spawned at all", async () => {
        const result = await new ChunkerConversion({
            ...RUN_OPTIONS,
            spawn: () => {
                throw new Error("ENOENT: no java there");
            },
        }).start();

        expect(result.exitCode).toBeNull();
        expect(result.diagnostics.join(" ")).toContain("ENOENT");
    });
});

describe("verifying what was written", () => {
    it("accepts a directory that really holds a Java world", async () => {
        const world = join(root, "out");
        await mkdir(join(world, "region"), { recursive: true });
        await writeFile(join(world, "level.dat"), "");
        await writeFile(join(world, "region", "r.0.0.mca"), "");

        await expect(verifyConvertedWorld(world)).resolves.toMatchObject({
            ok: true,
            regionFiles: 1,
        });
    });

    it("rejects a level.dat with no terrain, which is what a killed conversion leaves", async () => {
        // The case that matters: BlueMap would render this as a completely blank map
        // rather than fail, so nothing downstream would ever notice.
        const world = join(root, "half");
        await mkdir(world, { recursive: true });
        await writeFile(join(world, "level.dat"), "");

        const check = await verifyConvertedWorld(world);

        expect(check.ok).toBe(false);
        expect(check.reason).toContain("no terrain");
    });

    it("rejects a directory with no level.dat", async () => {
        await mkdir(join(root, "empty"), { recursive: true });
        const check = await verifyConvertedWorld(join(root, "empty"));
        expect(check.ok).toBe(false);
        expect(check.reason).toContain("no level.dat");
    });
});

/** A stub run that writes a convincing Java world into wherever it is pointed. */
function succeedingRun(overrides: Partial<ChunkerRunResult> = {}) {
    return (options: ChunkerRunOptions) => ({
        cancel: () => undefined,
        async start(): Promise<ChunkerRunResult> {
            await mkdir(join(options.outputDirectory, "region"), { recursive: true });
            await writeFile(join(options.outputDirectory, "level.dat"), "");
            await writeFile(join(options.outputDirectory, "region", "r.0.0.mca"), "");
            return { ...baseResult(), completeLineSeen: true, ...overrides };
        },
    });
}

function baseResult(): ChunkerRunResult {
    return {
        exitCode: 0,
        signal: null,
        cancelled: false,
        completeLineSeen: false,
        silentFailure: null,
        outOfMemory: null,
        sourceEdition: "Bedrock 1.21.30",
        targetEdition: "Java 1.21.4",
        lastPercent: 0,
        diagnostics: [],
        durationMs: 5,
    };
}

describe("a whole conversion", () => {
    it("puts the world at the final path only once it is verified", async () => {
        const output = join(root, "MyWorld (Java)");

        const outcome = await convertBedrockWorld({
            ...RUN_OPTIONS,
            outputDirectory: output,
            run: succeedingRun(),
        });

        expect(outcome.ok).toBe(true);
        if (!outcome.ok) throw new Error("unreachable");
        expect(outcome.outputDirectory).toBe(output);
        expect(outcome.regionFiles).toBe(1);
        expect(existsSync(join(output, "level.dat"))).toBe(true);

        // And the staging name is gone, rather than left beside the world.
        expect(existsSync(`${output}${STAGING_SUFFIX}`)).toBe(false);
    });

    it("never writes into the world it is reading", async () => {
        const input = join(root, "MyWorld");
        await mkdir(input, { recursive: true });
        await writeFile(join(input, "level.dat"), "original");
        const before = await readdir(input);

        await convertBedrockWorld({
            ...RUN_OPTIONS,
            inputDirectory: input,
            outputDirectory: join(root, "MyWorld (Java)"),
            run: succeedingRun(),
        });

        expect(await readdir(input)).toEqual(before);
    });

    describe("cancelled", () => {
        it("cleans up after itself and leaves nothing at the world's path", async () => {
            const output = join(root, "Cancelled (Java)");

            const outcome = await convertBedrockWorld({
                ...RUN_OPTIONS,
                outputDirectory: output,
                run: (options) => ({
                    cancel: () => undefined,
                    async start(): Promise<ChunkerRunResult> {
                        // Half a world on disk, exactly as an interrupted conversion leaves.
                        await mkdir(join(options.outputDirectory, "region"), { recursive: true });
                        await writeFile(join(options.outputDirectory, "level.dat"), "");
                        return { ...baseResult(), cancelled: true, exitCode: null, signal: "SIGINT" };
                    },
                }),
            });

            expect(outcome.ok).toBe(false);
            if (outcome.ok) throw new Error("unreachable");
            expect(outcome.code).toBe("cancelled");
            expect(outcome.cleanedUp).toBe(true);
            expect(outcome.message).toContain("never modified");

            // Neither the world's path nor the staging path survives. A cancelled
            // conversion that left either would offer somebody a broken world to render.
            expect(existsSync(output)).toBe(false);
            expect(existsSync(`${output}${STAGING_SUFFIX}`)).toBe(false);
        });

        it("reaches the running process through onStart", async () => {
            const cancel = vi.fn();
            let started: { cancel(): void } | null = null;

            await convertBedrockWorld({
                ...RUN_OPTIONS,
                outputDirectory: join(root, "x"),
                onStart: (handle) => {
                    started = handle;
                },
                run: () => ({
                    cancel,
                    async start(): Promise<ChunkerRunResult> {
                        // Cancelled while it is running, which is when a person presses it.
                        started?.cancel();
                        return { ...baseResult(), cancelled: true };
                    },
                }),
            });

            expect(cancel).toHaveBeenCalledOnce();
        });
    });

    describe("failed", () => {
        it("leaves nothing that looks like a converted world", async () => {
            const output = join(root, "Failed (Java)");

            const outcome = await convertBedrockWorld({
                ...RUN_OPTIONS,
                outputDirectory: output,
                run: (options) => ({
                    cancel: () => undefined,
                    async start(): Promise<ChunkerRunResult> {
                        // A level.dat and no terrain - the shape that would otherwise render
                        // as a perfectly blank map instead of reporting a failure.
                        await mkdir(options.outputDirectory, { recursive: true });
                        await writeFile(join(options.outputDirectory, "level.dat"), "");
                        return { ...baseResult(), exitCode: 1, diagnostics: ["java.lang.RuntimeException"] };
                    },
                }),
            });

            expect(outcome.ok).toBe(false);
            if (outcome.ok) throw new Error("unreachable");
            expect(outcome.code).toBe("chunker-failed");
            expect(existsSync(output)).toBe(false);
            expect(existsSync(`${output}${STAGING_SUFFIX}`)).toBe(false);
        });

        it("refuses a run that exited zero without finishing", async () => {
            const output = join(root, "Silent (Java)");

            const outcome = await convertBedrockWorld({
                ...RUN_OPTIONS,
                outputDirectory: output,
                run: () => ({
                    cancel: () => undefined,
                    start: async (): Promise<ChunkerRunResult> => ({
                        ...baseResult(),
                        exitCode: 0,
                        silentFailure: "Failed to find suitable reader for the world.",
                    }),
                }),
            });

            expect(outcome.ok).toBe(false);
            if (outcome.ok) throw new Error("unreachable");
            expect(outcome.code).toBe("unreadable-input");
            expect(existsSync(output)).toBe(false);
        });

        it("refuses a run that exited zero and wrote nothing at all", async () => {
            const output = join(root, "Empty (Java)");

            const outcome = await convertBedrockWorld({
                ...RUN_OPTIONS,
                outputDirectory: output,
                run: () => ({
                    cancel: () => undefined,
                    start: async (): Promise<ChunkerRunResult> => ({
                        ...baseResult(),
                        exitCode: 0,
                        completeLineSeen: true,
                    }),
                }),
            });

            expect(outcome.ok).toBe(false);
            if (outcome.ok) throw new Error("unreachable");
            expect(outcome.code).toBe("incomplete-output");
            expect(existsSync(output)).toBe(false);
        });

        describe("running out of memory, which is the expected ending on a big world", () => {
            const oomOutcome = async (result: Partial<ChunkerRunResult>, sourceBytes?: number) =>
                await convertBedrockWorld({
                    ...RUN_OPTIONS,
                    outputDirectory: join(root, `Oom-${String(Math.random()).slice(2)} (Java)`),
                    ...(sourceBytes === undefined ? {} : { sourceBytes }),
                    run: () => ({
                        cancel: () => undefined,
                        start: async (): Promise<ChunkerRunResult> => ({
                            ...baseResult(),
                            ...result,
                        }),
                    }),
                });

            it("is recognised from Chunker's own exit code 12", async () => {
                const outcome = await oomOutcome({ exitCode: EXIT_OUT_OF_MEMORY });
                expect(outcome).toMatchObject({ ok: false, code: "out-of-memory" });
            });

            it("is recognised from a stack trace on a worker thread, which exits 1", async () => {
                // The path that actually happens. Chunker's catch(OutOfMemoryError) only
                // covers its main thread; a worker-thread failure goes through
                // exceptionally(...) and exits 1, so a classifier keyed on 12 alone would
                // report this as a generic crash.
                const outcome = await oomOutcome({
                    exitCode: 1,
                    outOfMemory: "java.lang.OutOfMemoryError: Java heap space",
                });
                expect(outcome).toMatchObject({ ok: false, code: "out-of-memory" });
            });

            it("is recognised from a process the operating system killed outright", async () => {
                // No exit code, no signal, real progress made: what an OS out-of-memory
                // killer leaves behind on a machine driven into paging.
                const outcome = await oomOutcome({
                    exitCode: null,
                    signal: null,
                    lastPercent: 61.5,
                });
                expect(outcome).toMatchObject({ ok: false, code: "out-of-memory" });
            });

            it("does not mistake a failure to spawn for one", async () => {
                // No progress was ever made, so nothing ran to exhaust anything.
                const outcome = await oomOutcome({
                    exitCode: null,
                    signal: null,
                    lastPercent: 0,
                    diagnostics: ["spawn java ENOENT"],
                });
                expect(outcome).toMatchObject({ ok: false, code: "spawn-failed" });
            });

            it("does not mistake a cancellation for one", async () => {
                const outcome = await oomOutcome({
                    cancelled: true,
                    exitCode: null,
                    signal: null,
                    lastPercent: 44,
                });
                expect(outcome).toMatchObject({ ok: false, code: "cancelled" });
            });

            it("says it is a known limitation of the converter, and never suggests a bigger heap", async () => {
                const outcome = await oomOutcome(
                    { exitCode: EXIT_OUT_OF_MEMORY },
                    1_500_000_000,
                );

                expect(outcome.ok).toBe(false);
                if (outcome.ok) throw new Error("unreachable");
                expect(outcome.message).toContain("known to do on worlds this size");
                expect(outcome.message).toContain("limitation of the converter");
                // Sized against the world in front of them rather than a generic sentence.
                expect(outcome.message).toContain("1.4 GB");
                // The honesty requirement: more memory is a delay, not a fix, so the message
                // must not send somebody to repeat a twenty-minute failure with a bigger number.
                expect(outcome.message).toContain("does not fix it");
                expect(outcome.message).not.toMatch(/-Xmx|larger heap|more memory does help/);
            });

            it("still leaves nothing that looks like a world", async () => {
                const output = join(root, "OomCleanup (Java)");
                const outcome = await convertBedrockWorld({
                    ...RUN_OPTIONS,
                    outputDirectory: output,
                    run: (o) => ({
                        cancel: () => undefined,
                        async start(): Promise<ChunkerRunResult> {
                            await mkdir(o.outputDirectory, { recursive: true });
                            await writeFile(join(o.outputDirectory, "level.dat"), "");
                            return { ...baseResult(), exitCode: 1, outOfMemory: "OutOfMemoryError" };
                        },
                    }),
                });

                expect(outcome).toMatchObject({ ok: false, code: "out-of-memory" });
                expect(existsSync(output)).toBe(false);
                expect(existsSync(`${output}${STAGING_SUFFIX}`)).toBe(false);
            });
        });

        it("names a command line this app built wrongly as this app's fault", async () => {
            const outcome = await convertBedrockWorld({
                ...RUN_OPTIONS,
                outputDirectory: join(root, "Usage (Java)"),
                run: () => ({
                    cancel: () => undefined,
                    start: async (): Promise<ChunkerRunResult> => ({
                        ...baseResult(),
                        exitCode: EXIT_USAGE,
                        diagnostics: ["Invalid value 'JAVA_9_9'"],
                    }),
                }),
            });

            expect(outcome.ok).toBe(false);
            if (outcome.ok) throw new Error("unreachable");
            expect(outcome.code).toBe("bad-invocation");
            expect(outcome.message).toContain("JAVA_9_9");
        });
    });

    it("clears a staging directory an earlier crashed attempt left behind", async () => {
        const output = join(root, "Retry (Java)");
        const staging = `${output}${STAGING_SUFFIX}`;
        await mkdir(join(staging, "region"), { recursive: true });
        await writeFile(join(staging, "stale.txt"), "from a previous attempt");

        const outcome = await convertBedrockWorld({
            ...RUN_OPTIONS,
            outputDirectory: output,
            run: succeedingRun(),
        });

        expect(outcome.ok).toBe(true);
        // Converting into the leftovers would have produced a directory that passes
        // verification while being a mixture of two conversions.
        expect(existsSync(join(output, "stale.txt"))).toBe(false);
    });
});

describe("what the person is told beforehand", () => {
    it("puts the copy beside the original, never inside it", () => {
        const path = convertedWorldPath(join("/saves", "MyWorld"));
        expect(path).toBe(join("/saves", "MyWorld (Java)"));
        expect(path.startsWith(join("/saves", "MyWorld") + "/")).toBe(false);
    });

    it("estimates a size range, and invents nothing when nothing was measured", () => {
        expect(estimateConvertedSize(1_000_000)).toEqual({ low: 1_000_000, high: 2_000_000 });
        expect(estimateConvertedSize(null)).toBeNull();
        expect(estimateConvertedSize(0)).toBeNull();
    });
});
