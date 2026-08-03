import { spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliRun } from "./runner.js";
import type { SpawnCli } from "./runner.js";
import type { RenderSignal } from "./progress.js";

/**
 * These run a **real child process**. Asserting that `kill` was called on a mock proves
 * that this code calls `kill`; it does not prove the render stops, which is the only
 * thing a person pressing Cancel cares about. So the stand-in below behaves like the
 * CLI does - it prints BlueMap-shaped progress lines and would run for a minute - and
 * the test proves it was gone long before that minute was up.
 */

let workDir = "";

/**
 * A stand-in for the CLI: prints progress on the same schedule and shape, then, after a
 * minute, writes a marker file and exits 0. The marker is the proof: if it ever appears
 * the process was not killed, it was merely waited out.
 */
async function writeFakeCli(markerPath: string): Promise<string> {
    const script = join(workDir, "fake-cli.mjs");
    await writeFile(
        script,
        [
            "import { writeFileSync } from 'node:fs';",
            "process.stdout.write(\"[12:36:12 INFO] Loading resources...\\n\");",
            "process.stdout.write(\"[12:36:13 INFO] Initializing Storage: 'file' (Type: 'bluemap:file')\\n\");",
            "process.stdout.write(\"[12:36:13 INFO] Loading map 'overworld'...\\n\");",
            "process.stdout.write(\"[12:36:13 INFO] Start updating 1 maps ...\\n\");",
            "let percent = 0;",
            "const ticker = setInterval(() => {",
            "    percent += 3;",
            "    process.stdout.write(`[12:36:23 INFO] updating map 'overworld': ${percent}.5% (ETA: 3 minutes)\\n`);",
            "}, 25);",
            "setTimeout(() => {",
            "    clearInterval(ticker);",
            `    writeFileSync(${JSON.stringify(markerPath)}, 'the render was never cancelled');`,
            "    process.exit(0);",
            "}, 60000);",
            "",
        ].join("\n"),
        "utf8",
    );
    return script;
}

/** Spawns the stand-in wherever the runner asked the CLI to be spawned. */
function spawnFake(script: string, seen: { command: string; args: readonly string[] }[]): SpawnCli {
    return (command, args, options) => {
        seen.push({ command, args });
        return nodeSpawn(process.execPath, [script], {
            cwd: options.cwd,
            env: options.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
    };
}

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-runner-"));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

describe("CliRun arguments", () => {
    it("renders and updates the web settings, and never generates upstream's webapp", () => {
        const run = new CliRun({
            javaExecutable: "/jdk/bin/java",
            jarPath: "/jars/cli-5.22-27-shadow.jar",
            configDir: "/renders/world/config",
            cwd: "/renders/world",
        });
        expect(run.arguments()).toEqual([
            "-jar",
            "/jars/cli-5.22-27-shadow.jar",
            "-c",
            "/renders/world/config",
            "-r",
            "-s",
        ]);
        // -g would unpack upstream's own index.html, its bundle and a sql.php into the
        // web root. This app ships its own viewer and serves neither.
        expect(run.arguments()).not.toContain("-g");
    });

    it("passes the optional flags only when they were asked for", () => {
        const run = new CliRun({
            javaExecutable: "java",
            jarPath: "cli.jar",
            configDir: "config",
            cwd: ".",
            force: true,
            fixEdges: true,
            maps: ["overworld", "nether"],
            jvmArgs: ["-Xmx4G"],
        });
        expect(run.arguments()).toEqual([
            "-Xmx4G",
            "-jar",
            "cli.jar",
            "-c",
            "config",
            "-r",
            "-s",
            "-f",
            "-e",
            "-m",
            "overworld,nether",
        ]);
    });
});

describe("CliRun cancellation", () => {
    it("kills the child, and the child does not finish on its own", async () => {
        const marker = join(workDir, "never-cancelled.txt");
        const script = await writeFakeCli(marker);
        const seen: { command: string; args: readonly string[] }[] = [];

        const progress: number[] = [];
        const run = new CliRun({
            javaExecutable: "/jdk/bin/java",
            jarPath: "/jars/cli-5.22-27-shadow.jar",
            configDir: join(workDir, "config"),
            cwd: workDir,
            spawn: spawnFake(script, seen),
            onSignal: (signal: RenderSignal) => {
                if (signal.kind === "progress") progress.push(signal.progress.percent);
            },
        });

        const startedAt = Date.now();
        const finished = run.start();

        // Cancel only once the child is demonstrably alive and rendering, so the test
        // cannot pass by cancelling something that had not started.
        await new Promise<void>((resolve) => {
            const wait = setInterval(() => {
                if (progress.length >= 2) {
                    clearInterval(wait);
                    resolve();
                }
            }, 10);
        });
        run.cancel();

        const result = await finished;
        const elapsed = Date.now() - startedAt;

        expect(result.cancelled).toBe(true);
        // The stand-in would have run for 60 seconds. Coming back inside five proves
        // the process was ended rather than waited out.
        expect(elapsed).toBeLessThan(5_000);
        expect(existsSync(marker)).toBe(false);
        // The process really is gone: it reports either an exit code or the signal that
        // ended it, and never both null.
        expect(result.exitCode === null && result.signal === null).toBe(false);

        // The run still reports what it saw before it was stopped.
        expect(result.mapsScheduled).toBe(1);
        expect(result.mapsLoaded).toEqual(["overworld"]);
        expect(result.upToDate).toBe(false);
        expect(progress.length).toBeGreaterThanOrEqual(2);

        // The command it was asked to spawn is the one it was configured with.
        expect(seen).toHaveLength(1);
        expect(seen[0]?.command).toBe("/jdk/bin/java");
        expect(seen[0]?.args).toContain("/jars/cli-5.22-27-shadow.jar");
    }, 30_000);

    it("cancelling before the spawn means nothing is ever spawned", async () => {
        let spawned = 0;
        const run = new CliRun({
            javaExecutable: "java",
            jarPath: "cli.jar",
            configDir: "config",
            cwd: workDir,
            spawn: ((command, args, options) => {
                spawned += 1;
                return nodeSpawn(process.execPath, ["-e", ""], {
                    cwd: options.cwd,
                    env: options.env,
                    stdio: ["ignore", "pipe", "pipe"],
                });
            }) satisfies SpawnCli,
        });

        run.cancel();
        const result = await run.start();

        expect(spawned).toBe(0);
        expect(result.cancelled).toBe(true);
        expect(result.exitCode).toBeNull();
    });

    it("cancelling twice, and after the run has ended, is harmless", async () => {
        const run = new CliRun({
            javaExecutable: "java",
            jarPath: "cli.jar",
            configDir: "config",
            cwd: workDir,
            spawn: ((_command, _args, options) => {
                return nodeSpawn(
                    process.execPath,
                    ["-e", "process.stdout.write('[12:00:00 INFO] Stopped.\\n')"],
                    { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] },
                );
            }) satisfies SpawnCli,
        });

        const result = await run.start();
        expect(result.exitCode).toBe(0);

        expect(() => {
            run.cancel();
            run.cancel();
        }).not.toThrow();
    }, 20_000);
});

describe("CliRun output", () => {
    it("reads a whole run and reports what it found", async () => {
        const script = join(workDir, "complete.mjs");
        await writeFile(
            script,
            [
                "const lines = [",
                '    "[12:35:08 INFO] Loading resources...",',
                '    "[12:35:09 INFO] Resources loaded.",',
                "    \"[12:35:09 INFO] Loading map 'overworld'...\",",
                '    "[12:35:09 INFO] Start updating 1 maps ...",',
                "    \"[12:35:19 INFO] updating map 'overworld': 100.0%\",",
                '    "[12:35:19 INFO] Your maps are now all up-to-date!",',
                '    "[12:35:19 INFO] Stopping...",',
                '    "[12:35:19 INFO] Saving...",',
                '    "[12:35:19 INFO] Stopped.",',
                "];",
                "process.stdout.write(lines.join('\\n') + '\\n');",
                "",
            ].join("\n"),
            "utf8",
        );

        const run = new CliRun({
            javaExecutable: "java",
            jarPath: "cli.jar",
            configDir: "config",
            cwd: workDir,
            spawn: ((_command, _args, options) =>
                nodeSpawn(process.execPath, [script], {
                    cwd: options.cwd,
                    env: options.env,
                    stdio: ["ignore", "pipe", "pipe"],
                })) satisfies SpawnCli,
        });

        const result = await run.start();
        expect(result.exitCode).toBe(0);
        expect(result.upToDate).toBe(true);
        expect(result.mapsScheduled).toBe(1);
        expect(result.mapsLoaded).toEqual(["overworld"]);
        expect(result.cancelled).toBe(false);
        expect(result.diagnostics).toEqual([]);
    }, 20_000);

    it("reads warnings from stdout and errors from stderr, where the CLI puts them", async () => {
        const script = join(workDir, "noisy.mjs");
        await writeFile(
            script,
            [
                'process.stdout.write("[12:45:47 WARNING] BlueMap is missing important resources!\\n");',
                'process.stdout.write("[12:45:47 WARNING] You must accept the required file download in order for BlueMap to work!\\n");',
                'process.stderr.write("[12:45:47 ERROR] Failed to serve file\\n");',
                "process.exit(2);",
                "",
            ].join("\n"),
            "utf8",
        );

        const streams: string[] = [];
        const run = new CliRun({
            javaExecutable: "java",
            jarPath: "cli.jar",
            configDir: "config",
            cwd: workDir,
            onSignal: (signal, stream) => {
                if (signal.kind === "log" && signal.line.level === "ERROR") streams.push(stream);
            },
            spawn: ((_command, _args, options) =>
                nodeSpawn(process.execPath, [script], {
                    cwd: options.cwd,
                    env: options.env,
                    stdio: ["ignore", "pipe", "pipe"],
                })) satisfies SpawnCli,
        });

        const result = await run.start();
        expect(result.exitCode).toBe(2);
        expect(result.consentMissing).toBe(true);
        expect(streams).toEqual(["stderr"]);
        expect(result.diagnostics.join("\n")).toContain("Failed to serve file");
    }, 20_000);
});
