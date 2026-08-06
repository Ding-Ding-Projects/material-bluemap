/**
 * Running a short command and reading what it said.
 *
 * Everything in this directory that asks a question of the machine - is Docker there,
 * is its daemon reachable, is `opencode` installed - goes through this one type. The
 * runner is a parameter everywhere it is used, which is the whole point: not one test in
 * `runtime/` or `repair/` needs Docker installed, a daemon running, or a coding agent on
 * PATH, because every one of them hands in a function that answers the way the real
 * binary would.
 *
 * Nothing here ever throws. A missing binary is an answer - `spawnError: "ENOENT"` - and
 * turning it into an exception would make every caller wrap the same call in the same
 * try/catch and turn the same exception back into the same value. The failure that
 * prevents is the one caller who forgets, and shows somebody a stack trace because
 * Docker was not installed.
 */

import { execFile } from "node:child_process";

export interface CommandOutput {
    /** True when the process ran and exited 0. */
    readonly ok: boolean;
    /** The exit code, or null when the process never ran or was killed by a signal. */
    readonly exitCode: number | null;
    readonly stdout: string;
    readonly stderr: string;
    /**
     * Why the launch itself failed - `ENOENT`, `EACCES` - or null when it ran.
     *
     * Kept apart from `exitCode` because "docker is not installed" and "docker ran and
     * refused" are different sentences with different fixes, and a caller that only sees
     * a non-zero result cannot tell them apart.
     */
    readonly spawnError: string | null;
}

export interface CommandOptions {
    readonly timeoutMs?: number;
    readonly env?: NodeJS.ProcessEnv;
    /** Cancels the child process without waiting for its ordinary timeout. */
    readonly signal?: AbortSignal;
}

/** Runs `command` with `args` and reports what came back. Never rejects. */
export type CommandRunner = (
    command: string,
    args: readonly string[],
    options?: CommandOptions,
) => Promise<CommandOutput>;

/**
 * How long a probe is given before it counts as a failure.
 *
 * `docker version` answers in well under a second when the daemon is up. When the daemon
 * is starting, or a stale VM socket is being retried, it can sit there indefinitely -
 * and a settings screen that never renders because a Docker probe is still waiting is
 * worse than one that says the daemon did not answer in fifteen seconds.
 */
export const COMMAND_TIMEOUT_MS = 15_000;

/** Enough for a version banner or an agent's reply; far short of a log file. */
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export const execFileCommandRunner: CommandRunner = (command, args, options) =>
    new Promise<CommandOutput>((resolve) => {
        execFile(
            command,
            [...args],
            {
                timeout: options?.timeoutMs ?? COMMAND_TIMEOUT_MS,
                maxBuffer: MAX_OUTPUT_BYTES,
                // No shell anywhere on this path. Every argument below is built from a
                // path or an identifier this app produced, but a shell would still turn a
                // world folder called `my world & rm -rf` into two commands.
                windowsHide: true,
                ...(options?.env === undefined ? {} : { env: options.env }),
                ...(options?.signal === undefined ? {} : { signal: options.signal }),
            },
            (error, stdout, stderr) => {
                const out = typeof stdout === "string" ? stdout : "";
                const err = typeof stderr === "string" ? stderr : "";
                if (error === null) {
                    resolve({ ok: true, exitCode: 0, stdout: out, stderr: err, spawnError: null });
                    return;
                }
                // `execFile` puts an exit code in `code` as a number and a spawn failure
                // in the same field as a string. Reading the type is the only way to tell
                // "exited 125" from "there is no such binary".
                const code: unknown = (error as { readonly code?: unknown }).code;
                resolve({
                    ok: false,
                    exitCode: typeof code === "number" ? code : null,
                    stdout: out,
                    stderr: err === "" && typeof code !== "string" ? error.message : err,
                    spawnError: typeof code === "string" ? code : null,
                });
            },
        );
    });
