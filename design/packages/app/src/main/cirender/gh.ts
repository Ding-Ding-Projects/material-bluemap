/**
 * Driving a CI render through the `gh` command-line tool instead of the in-app sign-in.
 *
 * ## Why a second route at all
 *
 * Plenty of people already have `gh` installed and signed in, and it holds credentials the
 * application's own sign-in does not: an enterprise host, a SAML/SSO session already
 * authorised for an organisation, a token with scopes the in-app flow never asked for.
 * Somebody in that position should be able to render a world without signing in to a
 * second thing, and somebody whose in-app token turns out to be short a scope should get a
 * route that works rather than a dead end.
 *
 * This module is only the transport. It has no idea what a render is: it detects `gh`,
 * reports honestly what it found, and turns `gh api` calls into JSON and files.
 *
 * ## Three states, three sentences
 *
 * "gh is not installed", "gh is installed but nobody is signed in" and "gh is ready" are
 * different situations with different remedies, and collapsing them into "gh unavailable"
 * sends half the people to the wrong fix. {@link detectGh} answers all three separately,
 * with the account name when there is one.
 *
 * ## `gh auth login` is never driven from here, and that is a hard-won rule
 *
 * `gh auth login` and `gh auth refresh` **suppress the device-code prompt when stdin is
 * not a terminal**. Spawned from an application they therefore print nothing and hang for
 * ever, and no amount of waiting fixes it. Launching a console to give it a terminal does
 * not rescue it either. So when the fallback needs a sign-in this module says so and names
 * the command for the person to run in their own terminal; the result is then detected on
 * the next probe. Nothing here attempts to drive it.
 *
 * ## Nothing here ever handles, prints or logs a token
 *
 * `gh` holds its own credential in its own store and this module never asks for it:
 * `--show-token` is never passed, no `GH_TOKEN` is set or read, and the only thing taken
 * from `gh auth status` is whether it succeeded and which account it named. Every command
 * is spawned with an argument array and never through a shell, so nothing in a repository
 * name can become part of a command line.
 */

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { ActionsCallError } from "./actions.js";

/** The executable, named once so a test and the real runner cannot drift. */
export const GH_COMMAND = "gh";

/** What the user is told to run when `gh` is installed and signed out. */
export const GH_LOGIN_COMMAND = "gh auth login";

export interface ProcessResult {
    /**
     * False when the executable could not be started at all - it is not on PATH.
     *
     * Distinct from a non-zero exit, which means `gh` ran and refused. The two produce
     * completely different advice, and a runner that reported both as "failed" would make
     * that distinction impossible to recover.
     */
    readonly started: boolean;
    readonly code: number | null;
    readonly stdout: string;
    readonly stderr: string;
}

export interface ProcessRunOptions {
    readonly signal?: AbortSignal | undefined;
    /** Written to the child's stdin and closed. Used for `gh api --input -`. */
    readonly input?: string | undefined;
}

export interface ProcessToFileResult {
    readonly started: boolean;
    readonly code: number | null;
    readonly bytes: number;
    readonly stderr: string;
}

/**
 * How a child process is run.
 *
 * An interface, so every test in this folder runs without `gh` installed. That is not a
 * convenience: the interesting cases are "not installed" and "installed but signed out",
 * and neither can be produced on a machine that has it working.
 */
export interface ProcessRunner {
    run(command: string, args: readonly string[], options?: ProcessRunOptions): Promise<ProcessResult>;
    /** Streams the child's stdout into a file. For an artifact zip, which is binary. */
    runToFile(
        command: string,
        args: readonly string[],
        destination: string,
        options?: ProcessRunOptions,
    ): Promise<ProcessToFileResult>;
}

/**
 * The real one: `spawn`, with an argument array and **never** a shell.
 *
 * `shell: true` would put a repository name, a tag or an asset name onto a command line,
 * where a quote or a semicolon in one becomes part of the command. None of those values
 * is under this application's control - they come from GitHub and from what somebody
 * typed - so the shell is simply never involved.
 */
export function nodeProcessRunner(): ProcessRunner {
    return {
        run(command, args, options): Promise<ProcessResult> {
            return new Promise<ProcessResult>((resolve) => {
                const child = spawn(command, [...args], {
                    shell: false,
                    windowsHide: true,
                    ...(options?.signal === undefined ? {} : { signal: options.signal }),
                });
                let stdout = "";
                let stderr = "";
                let started = true;
                child.stdout?.setEncoding("utf8");
                child.stderr?.setEncoding("utf8");
                child.stdout?.on("data", (chunk: string) => (stdout += chunk));
                child.stderr?.on("data", (chunk: string) => (stderr += chunk));
                child.on("error", (error: NodeJS.ErrnoException) => {
                    // ENOENT is "not on PATH", which is the answer this whole module has to
                    // be able to give. Anything else is reported as a failed run with its
                    // own message rather than being mistaken for a missing executable.
                    if (error.code === "ENOENT") started = false;
                    stderr += error.message;
                    resolve({ started, code: null, stdout, stderr });
                });
                child.on("close", (code) => {
                    resolve({ started, code, stdout, stderr });
                });
                if (options?.input !== undefined) {
                    child.stdin?.end(options.input, "utf8");
                }
            });
        },

        async runToFile(command, args, destination, options): Promise<ProcessToFileResult> {
            await mkdir(dirname(destination), { recursive: true });
            const child = spawn(command, [...args], {
                shell: false,
                windowsHide: true,
                ...(options?.signal === undefined ? {} : { signal: options.signal }),
            });
            let stderr = "";
            let bytes = 0;
            child.stderr?.setEncoding("utf8");
            child.stderr?.on("data", (chunk: string) => (stderr += chunk));

            const failure = new Promise<ProcessToFileResult>((resolve) => {
                child.on("error", (error: NodeJS.ErrnoException) =>
                    resolve({
                        started: error.code !== "ENOENT",
                        code: null,
                        bytes: 0,
                        stderr: `${stderr}${error.message}`,
                    }),
                );
            });

            const stdout = child.stdout;
            if (stdout === null) return await failure;
            stdout.on("data", (chunk: Buffer) => (bytes += chunk.length));

            const finished = (async (): Promise<ProcessToFileResult> => {
                await pipeline(stdout, createWriteStream(destination));
                const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
                return { started: true, code, bytes, stderr };
            })();

            return await Promise.race([finished, failure]);
        },
    };
}

/* -------------------------------------------------------------------------- */
/* Detection                                                                  */
/* -------------------------------------------------------------------------- */

export type GhAvailability = "not-installed" | "signed-out" | "ready";

export interface GhStatus {
    readonly availability: GhAvailability;
    /** `gh version 2.62.0 ...`, first line only, or null when it is not installed. */
    readonly version: string | null;
    /** The account `gh auth status` named, when it named one. Never a token. */
    readonly account: string | null;
    /** The host it is signed in to. `github.com` for nearly everybody. */
    readonly host: string | null;
    /** One sentence naming the situation and what would change it. */
    readonly message: string;
}

const NOT_INSTALLED =
    "The GitHub command-line tool (gh) is not on this computer's PATH, so it cannot be used as a" +
    " route. Install it from cli.github.com, or sign in to GitHub inside this application" +
    " instead.";

/**
 * What `gh` is, on this machine, right now.
 *
 * Two commands, both harmless: `gh --version` proves it is there, and `gh auth status`
 * proves somebody is signed in. `--show-token` is deliberately never passed - the account
 * name is all this needs, and asking for the credential would put it in a pipe for no
 * reason at all.
 */
export async function detectGh(
    runner: ProcessRunner,
    options: { readonly signal?: AbortSignal | undefined } = {},
): Promise<GhStatus> {
    const version = await runner.run(GH_COMMAND, ["--version"], options);
    if (!version.started) {
        return {
            availability: "not-installed",
            version: null,
            account: null,
            host: null,
            message: NOT_INSTALLED,
        };
    }
    if (version.code !== 0) {
        return {
            availability: "not-installed",
            version: null,
            account: null,
            host: null,
            message:
                `${GH_COMMAND} is on PATH but would not report its version` +
                `${firstLine(version.stderr) === "" ? "" : `: ${firstLine(version.stderr)}`}. ` +
                "It cannot be used as a route until that is fixed.",
        };
    }

    const versionText = firstLine(version.stdout) || firstLine(version.stderr) || null;
    // `gh auth status` writes to stdout on current versions and wrote to stderr on older
    // ones. Both are read, because a status that landed on the wrong stream would be
    // reported as "signed out" for somebody who is signed in perfectly well.
    const status = await runner.run(GH_COMMAND, ["auth", "status"], options);
    const combined = `${status.stdout}\n${status.stderr}`;

    if (status.code !== 0) {
        return {
            availability: "signed-out",
            version: versionText,
            account: null,
            host: null,
            message:
                `${GH_COMMAND} is installed but nobody is signed in to it. Run \`${GH_LOGIN_COMMAND}\`` +
                " in a terminal - it has to be run there, because it asks for a code interactively" +
                " and cannot be driven from inside this application - then check again.",
        };
    }

    const account = accountFrom(combined);
    const host = hostFrom(combined);
    return {
        availability: "ready",
        version: versionText,
        account,
        host,
        message:
            account === null
                ? `${GH_COMMAND} is installed and signed in.`
                : `${GH_COMMAND} is signed in as ${account}${host === null ? "" : ` on ${host}`}.`,
    };
}

function firstLine(text: string): string {
    return (text.split(/\r?\n/)[0] ?? "").trim();
}

/** `Logged in to github.com account octocat (keyring)` and the older `as octocat`. */
function accountFrom(text: string): string | null {
    const modern = /Logged in to \S+ account (\S+)/.exec(text);
    if (modern?.[1] !== undefined) return modern[1];
    const legacy = /Logged in to \S+ as (\S+)/.exec(text);
    return legacy?.[1] ?? null;
}

function hostFrom(text: string): string | null {
    const match = /Logged in to (\S+) (?:account|as)/.exec(text);
    return match?.[1] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Calling the API through it                                                 */
/* -------------------------------------------------------------------------- */

export interface GhApiOptions {
    readonly runner: ProcessRunner;
    readonly signal?: AbortSignal | undefined;
    /** Overridable so a test can name a host without one being reachable. */
    readonly host?: string | undefined;
}

function apiArgs(endpoint: string, options: GhApiOptions, extra: readonly string[] = []): string[] {
    const args = ["api", ...extra, "-H", "Accept: application/vnd.github+json"];
    if (options.host !== undefined && options.host.length > 0) args.push("--hostname", options.host);
    args.push(endpoint);
    return args;
}

/**
 * One `gh api` call, answered as parsed JSON.
 *
 * `endpoint` is a path with no leading slash - `repos/o/r/actions/runs/7` - which is what
 * `gh api` takes. It is passed as one argument, never interpolated into a command line.
 */
export async function ghApiJson(endpoint: string, options: GhApiOptions): Promise<unknown> {
    const result = await options.runner.run(GH_COMMAND, apiArgs(endpoint, options), {
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (!result.started) throw new ActionsCallError(NOT_INSTALLED, 0, endpoint);
    if (result.code !== 0) throw ghFailure(result.stderr, endpoint);
    try {
        return JSON.parse(result.stdout);
    } catch {
        throw new ActionsCallError(
            `${GH_COMMAND} answered something that was not JSON for ${endpoint}.`,
            0,
            endpoint,
        );
    }
}

/** A `POST` with a JSON body, for the workflow dispatch. Answers nothing on success. */
export async function ghApiPost(endpoint: string, body: unknown, options: GhApiOptions): Promise<void> {
    const result = await options.runner.run(
        GH_COMMAND,
        apiArgs(endpoint, options, ["-X", "POST", "--input", "-"]),
        {
            input: JSON.stringify(body),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        },
    );
    if (!result.started) throw new ActionsCallError(NOT_INSTALLED, 0, endpoint);
    if (result.code !== 0) throw ghFailure(result.stderr, endpoint);
}

/** A `GET` whose body is written straight to a file. For an artifact zip. */
export async function ghApiToFile(
    endpoint: string,
    destination: string,
    options: GhApiOptions,
): Promise<number> {
    const result = await options.runner.runToFile(GH_COMMAND, apiArgs(endpoint, options), destination, {
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (!result.started) throw new ActionsCallError(NOT_INSTALLED, 0, endpoint);
    if (result.code !== 0) throw ghFailure(result.stderr, endpoint);
    return result.bytes;
}

/**
 * A `gh` refusal turned into the same error type the API route raises.
 *
 * `gh` prints `gh: Not Found (HTTP 404)`, so the status is recoverable and the sync loop's
 * existing handling - 401 means sign in again, 403 means a missing permission - works
 * unchanged for both routes. Without the status every `gh` failure would come back as a
 * generic one, and the two routes would need two sets of advice for the same problem.
 */
function ghFailure(stderr: string, endpoint: string): ActionsCallError {
    const match = /\(HTTP (\d{3})\)/.exec(stderr);
    const status = match?.[1] === undefined ? 0 : Number.parseInt(match[1], 10);
    const said = stderr.trim().split(/\r?\n/).slice(0, 4).join(" ").trim();
    const explanation =
        status === 401
            ? ` The \`${GH_COMMAND}\` sign-in is no longer accepted. Run \`${GH_LOGIN_COMMAND}\` in a terminal.`
            : status === 403
              ? ` The account \`${GH_COMMAND}\` is signed in as may not have permission for this, or the` +
                " organisation needs its SSO authorisation refreshed."
              : status === 404
                ? " Either it does not exist or that account cannot see it; GitHub answers the same" +
                  " way for both."
                : "";
    return new ActionsCallError(
        `${GH_COMMAND} refused ${endpoint}.${explanation}${said === "" ? "" : ` It said: ${said}`}`,
        status,
        endpoint,
    );
}
