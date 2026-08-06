/**
 * Running a package-manager CLI and reading its output as it arrives.
 *
 * `winget` and `choco` both print their progress line by line rather than all at
 * once, so this is `spawn`, not `execFile` — the caller needs each line the moment
 * it is written, not the whole buffer after the process has already finished.
 *
 * The runner is injectable, the same shape as `java/probe.ts`'s `JavaRunner`, so
 * every test in this directory drives a fake process and never launches a real
 * `winget` or `choco` on the machine running the suite.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export type ProcessStream = "stdout" | "stderr";

/** Called once per line, as it is written, in the order the process wrote it. */
export type ProcessLineListener = (line: string, stream: ProcessStream) => void;

export interface RunProcessOptions {
    readonly command: string;
    readonly args: readonly string[];
    readonly onLine?: ProcessLineListener;
    readonly signal?: AbortSignal;
    readonly cwd?: string;
    /** How long the process is given before it is killed and treated as timed out. */
    readonly timeoutMs?: number;
}

export interface ProcessRunResult {
    /** Null when the process never started, was killed, or timed out. */
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
    /** True when `options.signal` was already aborted, or fired mid-run. */
    readonly aborted: boolean;
    /** True when `timeoutMs` elapsed before the process exited on its own. */
    readonly timedOut: boolean;
    /** Set when the process could not be launched at all (e.g. the binary is missing). */
    readonly launchError: string | null;
}

/** Runs `command` with `args` and reports what happened. Never throws. */
export type RunProcess = (options: RunProcessOptions) => Promise<ProcessRunResult>;

/**
 * Reinterprets a `ProcessRunResult.exitCode` as the signed 32-bit value vendor
 * documentation (winget's `APPINSTALLER_CLI_ERROR_*` HRESULTs, and anything else
 * that names its exit codes as negative constants) actually publishes.
 *
 * On Windows, `GetExitCodeProcess` returns a DWORD — an UNSIGNED 32-bit value —
 * and Node's `child_process` `close` event (see `finish()` above) hands that
 * DWORD through as a JS number with no sign reinterpretation. A tool whose exit
 * codes are HRESULTs documents them signed, e.g. `-1978335135` for `0x8A150061`,
 * but Node delivers `2316632161` for that exact same process — the unsigned
 * reading of the identical bits. A strict `=== -1978335135` against Node's raw
 * value therefore never matches, silently, and every named-outcome branch that
 * depends on it falls through to a generic failure.
 *
 * Every comparison against a documented negative exit-code constant MUST go
 * through this function first, called once where the result crosses in from
 * `RunProcess`, rather than re-deriving both forms at each comparison site — a
 * second form to remember per comparison is a defect waiting to be
 * reintroduced by the next person who adds a branch.
 *
 * `value | 0` is exactly the fix: JS's `ToInt32` abstract operation takes the
 * operand modulo 2**32 and reads the result as signed, which is the inverse of
 * what `GetExitCodeProcess` + Node did to produce the unsigned reading in the
 * first place. Do not "simplify" this away — it looks like a no-op bitwise
 * flourish but it is load-bearing.
 *
 * `null` — a process killed by a signal, or one that never started — is passed
 * through untouched. `null | 0` evaluates to `0`, which would misreport a
 * killed process as a clean successful exit; that case is guarded explicitly.
 */
export function normalizeExitCode(exitCode: number | null): number | null {
    return exitCode === null ? null : exitCode | 0;
}

/**
 * How long a package-manager operation is given before it is treated as hung.
 *
 * Installing Docker Desktop is a large download over a real network connection, so
 * this is generous compared to `java/probe.ts`'s ten-second version probe — that one
 * is asking an already-running JVM one question; this one is fetching tens to
 * hundreds of megabytes.
 */
export const DEFAULT_PROCESS_TIMEOUT_MS = 15 * 60 * 1000;

/** The real runner: an actual child process, with bounded output and a real kill path. */
export const spawnProcessRunner: RunProcess = (options) =>
    new Promise<ProcessRunResult>((resolve) => {
        const stdoutLines: string[] = [];
        const stderrLines: string[] = [];
        let settled = false;
        let timedOut = false;
        let launchError: string | null = null;

        const child = spawn(options.command, [...options.args], {
            windowsHide: true,
            shell: false,
            ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        });

        const timer =
            options.timeoutMs === undefined
                ? null
                : setTimeout(() => {
                      timedOut = true;
                      child.kill();
                  }, options.timeoutMs);

        function finish(exitCode: number | null): void {
            if (settled) return;
            settled = true;
            if (timer !== null) clearTimeout(timer);
            resolve({
                exitCode,
                stdout: stdoutLines.join("\n"),
                stderr: stderrLines.join("\n"),
                aborted: options.signal?.aborted ?? false,
                timedOut,
                launchError,
            });
        }

        const stdoutReader = createInterface({ input: child.stdout });
        stdoutReader.on("line", (line: string) => {
            stdoutLines.push(line);
            options.onLine?.(line, "stdout");
        });

        const stderrReader = createInterface({ input: child.stderr });
        stderrReader.on("line", (line: string) => {
            stderrLines.push(line);
            options.onLine?.(line, "stderr");
        });

        child.on("error", (error) => {
            launchError = error.message;
            finish(null);
        });

        child.on("close", (code) => {
            finish(code);
        });
    });
