/**
 * The one place in this application that runs `git`.
 *
 * Everything above it - the snapshotter, the restorer, the pruner - is written against
 * {@link GitRunner}, which is a function taking a list of arguments and answering with an
 * exit code and two streams. That indirection buys three things that matter enough to be
 * worth the extra type:
 *
 *  1. **A test can be honest about a machine with no git on it.** Handing the layer a
 *     runner that answers `spawnError: "ENOENT"` reproduces exactly what a user without
 *     git sees, with no need to rename a binary on the machine running the suite.
 *  2. **A test can make a history write fail** on demand, which is how the rule that a
 *     failed history write must never fail the user's save is proved rather than asserted.
 *  3. **Nothing above this file has to know about `child_process`**, so the interesting
 *     logic - what a change should be called, which revisions survive a prune - is plain
 *     data in and plain data out.
 *
 * ## It never rejects
 *
 * {@link runGit} resolves for every outcome, including the ones that would ordinarily
 * throw: git missing, git killed, git exiting non-zero. That is deliberate and it is the
 * structural half of the contract that says a history failure must not become the user's
 * failure. A layer that rejects makes "carry on anyway" a discipline every caller has to
 * remember; a layer that answers `ok: false` makes it the only thing a caller can do.
 *
 * ## Isolation from the machine's own git configuration
 *
 * A history repository belongs to this application, not to the person's git setup, and a
 * global `gitconfig` is full of settings that would quietly break one: `commit.gpgsign`
 * needs a key this process cannot unlock, `core.autocrlf` rewrites every line ending on
 * the way in and out, `core.hooksPath` points at scripts nobody asked to run here, and
 * `user.name` may be absent entirely, which makes every commit fail with a message about
 * telling git who you are.
 *
 * So every invocation carries its own configuration:
 *
 *  - `GIT_CONFIG_GLOBAL` points at a file that does not exist, and `GIT_CONFIG_NOSYSTEM`
 *    turns off the system one. Git 2.32 and later then read no configuration but the
 *    repository's own, which this module wrote. An older git ignores the first of those
 *    and merely falls back to being un-isolated, which is a worse history rather than a
 *    broken one.
 *  - {@link BASE_CONFIG} restates the settings that must hold whatever the machine says.
 *  - Hooks are skipped at the commit itself with `--no-verify`, because `core.hooksPath`
 *    can also be set per-repository by something else on the machine.
 *  - `GIT_TERMINAL_PROMPT=0` and an empty `GIT_ASKPASS` mean a git that decides it wants a
 *    credential fails immediately instead of blocking the main process forever on a prompt
 *    nobody can see. Nothing here talks to a network, so wanting one is already a bug; the
 *    point is that the bug is a failed call rather than a hung application.
 */

import { execFile } from "node:child_process";
import { join } from "node:path";

/** How long any single git call may take before it is killed. */
export const GIT_TIMEOUT_MS = 30_000;

/** Cap on a single call's output, so a pathological repository cannot exhaust memory. */
export const GIT_MAX_BUFFER = 16 * 1024 * 1024;

/**
 * The identity every snapshot is committed under.
 *
 * Deliberately not the person's own. A history repository is a record of what the
 * application did on their behalf, it is never pushed anywhere, and stamping their real
 * name and address into hundreds of automatic commits would put their email address in a
 * file they did not know existed.
 */
export const HISTORY_AUTHOR_NAME = "Material BlueMap";
export const HISTORY_AUTHOR_EMAIL = "history@material-bluemap.invalid";

/**
 * Configuration forced on every invocation, whatever the machine believes.
 *
 * `core.autocrlf` and `core.safecrlf` are the two that would corrupt a config file rather
 * than merely annoy: a snapshot taken with autocrlf on, restored on a machine with it off,
 * gives the user back a file whose every line ending changed. `gc.auto=0` keeps git from
 * deciding to repack in the middle of a save.
 */
export const BASE_CONFIG: readonly string[] = [
    "-c",
    `user.name=${HISTORY_AUTHOR_NAME}`,
    "-c",
    `user.email=${HISTORY_AUTHOR_EMAIL}`,
    "-c",
    "commit.gpgsign=false",
    "-c",
    "tag.gpgsign=false",
    "-c",
    "core.autocrlf=false",
    "-c",
    "core.safecrlf=false",
    "-c",
    "core.quotePath=false",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "gc.auto=0",
    "-c",
    "advice.detachedHead=false",
];

export interface GitCommandOptions {
    /** The repository to run in. Always absolute. */
    readonly cwd: string;
    /** Extra environment, merged over this process's own. */
    readonly env?: Readonly<Record<string, string>>;
    /** Written to git's standard input and then closed. */
    readonly stdin?: string;
}

/**
 * What a git invocation did.
 *
 * `ok` is true only for exit code zero. `spawnError` is set when git never ran at all,
 * which is the case that matters most here: it is what a machine with no git installed
 * produces, and it is a completely different sentence to the user than a git that ran and
 * refused.
 */
export interface GitResult {
    readonly ok: boolean;
    /** Null when git never ran, or was killed by a signal. */
    readonly code: number | null;
    readonly stdout: string;
    readonly stderr: string;
    /** The spawn failure's code (`ENOENT`, `EACCES`, ...), or null when git ran. */
    readonly spawnError: string | null;
}

export type GitRunner = (args: readonly string[], options: GitCommandOptions) => Promise<GitResult>;

/**
 * The environment a history repository is operated in.
 *
 * `gitConfigNone` is a path that is never created. Git reads a missing configuration file
 * as an empty one, so pointing `GIT_CONFIG_GLOBAL` at it is how a per-user configuration
 * is switched off without touching it.
 */
export function isolationEnv(historyRoot: string): Record<string, string> {
    return {
        GIT_CONFIG_GLOBAL: join(historyRoot, "no-global-gitconfig"),
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "",
        SSH_ASKPASS: "",
        GIT_OPTIONAL_LOCKS: "0",
        // A pager attached to a process with no terminal waits forever for a reader.
        GIT_PAGER: "cat",
        PAGER: "cat",
        // Git's own messages are parsed nowhere in this module, but a locale-dependent
        // message in a log or a notification is one nobody can search for.
        LC_ALL: "C",
    };
}

/**
 * Runs git once and reports what happened, never rejecting.
 *
 * The command is `execFile` rather than a shell, so an argument is an argument: a config
 * folder called `C:\Users\me\my maps & things` cannot become two arguments and a shell
 * operator, and there is no quoting rule for a caller to get wrong.
 */
export const runGit: GitRunner = (args, options) =>
    new Promise<GitResult>((resolve) => {
        const child = execFile(
            "git",
            [...args],
            {
                cwd: options.cwd,
                env: { ...process.env, ...(options.env ?? {}) },
                timeout: GIT_TIMEOUT_MS,
                maxBuffer: GIT_MAX_BUFFER,
                windowsHide: true,
                encoding: "utf8",
            },
            (error, stdout, stderr) => {
                if (error === null) {
                    resolve({ ok: true, code: 0, stdout, stderr, spawnError: null });
                    return;
                }
                // `execFile` reports a non-zero exit and a failure to start the same way,
                // and they are not the same thing at all: one means git looked at the
                // repository and said no, the other means there is no git here.
                const failure = error as NodeJS.ErrnoException & { code?: number | string };
                const raw = failure.code;
                const spawnError = typeof raw === "string" ? raw : null;
                const code = typeof raw === "number" ? raw : null;
                resolve({ ok: false, code, stdout, stderr, spawnError });
            },
        );

        if (options.stdin !== undefined) {
            child.stdin?.end(options.stdin);
        }
    });

/** What this machine can do about history, and why when the answer is nothing. */
export interface GitAvailability {
    readonly available: boolean;
    /** e.g. `2.45.1`, exactly as git printed it. Null when git did not run. */
    readonly version: string | null;
    /** One sentence for the user. Null when git is there. */
    readonly reason: string | null;
}

/** The version out of `git version 2.45.1.windows.1`. */
export function parseGitVersion(output: string): string | null {
    const match = /git version (\S+)/.exec(output.trim());
    return match?.[1] ?? null;
}

/**
 * Whether git is on this machine, asked by running it.
 *
 * A path check would not do. `git` being on `PATH` is not evidence it can start: an entry
 * left behind by an uninstall, a wrapper script pointing at a deleted install and a shim
 * that needs a runtime that is not there all pass a path check and all fail the moment
 * something tries to snapshot a folder. Running `git --version` costs a few milliseconds
 * and answers the question that was actually asked.
 *
 * The reason is written for somebody who has never heard of git and does not have to care:
 * it says what the application cannot do, and that everything else still works.
 */
export async function probeGit(run: GitRunner, cwd: string): Promise<GitAvailability> {
    const result = await run(["--version"], { cwd });

    if (result.spawnError === "ENOENT") {
        return {
            available: false,
            version: null,
            reason:
                "Git is not installed on this machine, so the editor cannot keep a version " +
                "history of your config folders. Everything else works as usual; installing " +
                "Git turns history on with no other change.",
        };
    }
    if (result.spawnError !== null) {
        return {
            available: false,
            version: null,
            reason:
                `Git could not be started on this machine (${result.spawnError}), so the editor ` +
                `cannot keep a version history of your config folders. Everything else works as usual.`,
        };
    }
    if (!result.ok) {
        return {
            available: false,
            version: null,
            reason:
                "Git is installed but would not report its version, so the editor cannot keep " +
                "a version history of your config folders. Everything else works as usual.",
        };
    }

    const version = parseGitVersion(result.stdout);
    if (version === null) {
        return {
            available: false,
            version: null,
            reason:
                "Git answered with something this application did not recognise as a version, " +
                "so history is switched off rather than run against an unknown git.",
        };
    }
    return { available: true, version, reason: null };
}
