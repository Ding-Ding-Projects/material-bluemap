/**
 * A transfer that can be interrupted and carried on, instead of one that starts again.
 *
 * ## The problem `scp` has, stated exactly
 *
 * `scp` has no notion of a partial file. A copy that stops at nine gigabytes of ten leaves
 * a nine-gigabyte file the next copy overwrites from byte zero. For a world folder on a
 * domestic connection that is not an inconvenience, it is the difference between a render
 * that happens and one that never does: every dropped connection costs the whole upload,
 * and the upload is longer than the interval between dropped connections.
 *
 * `transfer.ts` already says that its shape is a decision - that `scp`, a tar stream and a
 * fake are interchangeable behind {@link FileTransfer}. This is that door being used.
 *
 * ## Why `rsync`, and the three flags that matter
 *
 * ```
 * -a                  archive: recurse, keep times and permissions
 * --partial           keep a file that was cut off, instead of deleting it
 * --append-verify     carry a partial file on from where it stopped, after
 *                     checksumming the part that is already there
 * -e "<ssh ...>"      the same ssh, with the same security options as everything else
 * ```
 *
 * `--partial` alone only *keeps* the fragment; `--append-verify` is what makes the next run
 * use it. It reads the bytes already at the destination, checksums them against the same
 * range of the source, and appends only if they match - so a fragment from a file that has
 * since changed is re-sent whole rather than producing a file that is half one version and
 * half another. That verification is the reason plain `--append` is not used here: `--append`
 * trusts the fragment, and a world folder is exactly the kind of source that gets edited
 * between two attempts.
 *
 * ## Falling back, out loud
 *
 * rsync is not everywhere. Windows does not ship it, a minimal server image often does not
 * have it, and it has to be present on **both** ends because the protocol runs a copy of
 * itself on each. So it is detected rather than assumed - locally and remotely, separately,
 * because "you have it and the server does not" and "the server has it and you do not" are
 * different sentences with different fixes.
 *
 * When it is missing, or when a transfer through it fails for a reason that is about rsync
 * rather than about the file, the copy is made with `scp` instead and **the log says so, in
 * a sentence that names what is being given up**. A transfer that quietly degrades to
 * restart-from-zero is worse than one that never offered to resume, because somebody
 * planning around a resumable upload has no way to find out it is not one.
 *
 * ### The `-e` string is the sharp edge, and it is why the fallback is at use time
 *
 * rsync takes the remote shell as **one string** and splits it itself. This app's known
 * hosts file lives under the application data directory, which on Windows is
 * `...\Material BlueMap\known_hosts` - a path with a space in it. Whether a given rsync
 * build honours the quotes around that is a property of that build, not something that can
 * be decided here, so it is not decided here: the words are quoted, and a failure is caught
 * and answered with `scp` and an explanation rather than with a refusal.
 */

import type { CommandOutput, CommandRunner } from "../runtime/command.js";
import { execFileCommandRunner } from "../runtime/command.js";
import {
    firstLine,
    quoteForRemoteShell,
    remoteCommandLine,
    scpRemotePath,
    sshArguments,
    sshSecurityOptions,
    type SshOptionsInput,
} from "./ssh.js";
import { parentOf, TransferError, type FileTransfer, type TransferOptions } from "./transfer.js";

/** Which tool a render's files actually moved through. Reported, never assumed. */
export type TransferKind = "rsync" | "scp";

export interface RsyncSupport {
    /** True when both ends have rsync and a resumable copy will be attempted. */
    readonly available: boolean;
    /** The local rsync's version, when it answered. */
    readonly localVersion: string | null;
    /** The remote rsync's version, when it answered. */
    readonly remoteVersion: string | null;
    /**
     * One sentence naming what will be used and what that means for an interruption.
     *
     * Always populated, including on the happy path: somebody who sent forty gigabytes
     * needs to know whether stopping it costs them the forty gigabytes.
     */
    readonly message: string;
}

export interface RsyncOptions extends SshOptionsInput {
    /** The local `rsync` binary. A parameter so a test can name one that does not exist. */
    readonly rsync?: string;
    readonly ssh?: string;
    readonly runner?: CommandRunner;
}

/** `rsync --version` prints `rsync  version 3.2.7  protocol version 31` on its first line. */
const VERSION = /rsync\s+version\s+([^\s]+)/i;

function versionFrom(output: CommandOutput): string | null {
    if (!output.ok) return null;
    const match = VERSION.exec(output.stdout);
    return match?.[1] ?? null;
}

/**
 * The remote-shell string rsync is given.
 *
 * Every word that contains whitespace is wrapped in double quotes, which is the only form
 * an rsync build that understands quoting at all understands. See the note at the top about
 * why this is not treated as a guarantee.
 */
export function rsyncShellCommand(options: RsyncOptions): string {
    const words = [
        options.ssh ?? "ssh",
        ...sshSecurityOptions(options),
        "-p",
        String(options.target.port),
    ];
    return words.map((word) => (/\s/.test(word) ? `"${word}"` : word)).join(" ");
}

/**
 * The whole argv, minus the source and destination.
 *
 * `--` is not used and cannot be: rsync needs its paths to keep their `host:` prefix
 * meaning. Every path this builds comes from a validated work directory or a local
 * workspace, and the remote half is single-quoted for the remote shell exactly as `scp`'s
 * is, because rsync hands its remote half to a login shell for the same reason `scp` does.
 */
export function rsyncArguments(options: RsyncOptions, extra: readonly string[] = []): string[] {
    return [
        "-a",
        // Keep the fragment when a copy is cut off, and carry it on next time after
        // checksumming what is already there. Together these are the whole feature.
        "--partial",
        "--append-verify",
        // Quiet, for the reason `scp -q` is quiet: rsync's progress meter is drawn with
        // carriage returns and would fill a log with one unreadable line. Progress for the
        // person comes from the orchestrator's own events.
        "--quiet",
        "-e",
        rsyncShellCommand(options),
        ...extra,
    ];
}

/**
 * Asks both ends whether rsync is there. Never rejects.
 *
 * Two questions, asked separately and reported separately. A single "rsync is not
 * available" would send somebody to install it on the machine that already has it.
 */
export async function probeRsync(options: RsyncOptions): Promise<RsyncSupport> {
    const runner = options.runner ?? execFileCommandRunner;
    const rsync = options.rsync ?? "rsync";
    const ssh = options.ssh ?? "ssh";
    const host = `${options.target.user}@${options.target.host}`;

    const local = versionFrom(await runner(rsync, ["--version"], {}));
    const remote = versionFrom(
        await runner(ssh, [...sshArguments(options), remoteCommandLine([rsync, "--version"])], {}),
    );

    if (local !== null && remote !== null) {
        return {
            available: true,
            localVersion: local,
            remoteVersion: remote,
            message:
                `Sending with rsync ${local} here and ${remote} on ${host}, so a transfer that is ` +
                "interrupted carries on from where it stopped rather than starting again.",
        };
    }

    const missing =
        local === null && remote === null
            ? `neither this computer nor ${host} has rsync`
            : local === null
              ? "this computer has no rsync"
              : `${host} has no rsync`;

    return {
        available: false,
        localVersion: local,
        remoteVersion: remote,
        message:
            `Sending with scp, because ${missing}. scp cannot carry a partial file on, so a ` +
            "transfer that is interrupted starts that file again from the beginning. Installing " +
            "rsync on both machines is what changes that.",
    };
}

export interface RsyncTransferOptions extends RsyncOptions {
    /**
     * Where `mkdir -p` and the guarded `rm -rf` come from.
     *
     * Delegated rather than rewritten. The remote delete is the single most destructive
     * command this app can issue and it already has its guard, tested, in `transfer.ts`; a
     * second copy of it here would be a second thing to get wrong on somebody's server.
     */
    readonly shell: FileTransfer;
}

/**
 * A {@link FileTransfer} over rsync.
 *
 * Note the trailing-slash discipline, which is rsync's one genuine trap. `rsync -a src
 * dst` copies `src` *into* `dst`; `rsync -a src/ dst` copies its *contents* into `dst`. The
 * contract this interface states is "copies a local directory so that it **becomes**
 * `remotePath`", so the source always carries the slash and the destination is named
 * exactly - the same ambiguity `scp` has, resolved the same way and for the same reason: a
 * render that looks for its config one directory too high.
 */
export function rsyncTransfer(options: RsyncTransferOptions): FileTransfer {
    const runner = options.runner ?? execFileCommandRunner;
    const rsync = options.rsync ?? "rsync";

    const copy = async (
        args: readonly string[],
        what: string,
        transfer?: TransferOptions,
    ): Promise<void> => {
        transfer?.signal?.throwIfAborted();
        const output = await runner(rsync, [...rsyncArguments(options, args)], {});
        report(output, what, transfer);
    };

    return {
        makeRemoteDirectory: (remotePath, transfer) =>
            options.shell.makeRemoteDirectory(remotePath, transfer),
        removeRemoteDirectory: (remotePath, transfer) =>
            options.shell.removeRemoteDirectory(remotePath, transfer),

        async uploadFile(localPath, remotePath, transfer): Promise<void> {
            await options.shell.makeRemoteDirectory(parentOf(remotePath), transfer);
            await copy(
                [localPath, scpRemotePath(options.target, remotePath)],
                `Sending ${localPath}`,
                transfer,
            );
        },

        async uploadDirectory(localPath, remotePath, transfer): Promise<void> {
            // The destination is created rather than only its parent: with a trailing slash
            // on the source, rsync writes the contents *into* the named destination, and a
            // destination that does not exist yet is created for a single copy but not for
            // one that is being resumed into.
            await options.shell.makeRemoteDirectory(remotePath, transfer);
            await copy(
                [withTrailingSlash(localPath), scpRemotePath(options.target, remotePath)],
                `Sending ${localPath}`,
                transfer,
            );
        },

        async downloadDirectory(remotePath, localPath, transfer): Promise<void> {
            // No trailing slash on the remote source here, deliberately: the caller's
            // contract for a download is that `<remotePath>` lands *inside* `localPath`,
            // which is what the orchestrator relies on to produce `web/maps`.
            await copy(
                [remoteSource(options, remotePath), localPath],
                `Fetching ${remotePath}`,
                transfer,
            );
        },
    };
}

/** `user@host:'/quoted/remote/path'`, the form rsync takes, quoted for the remote shell. */
function remoteSource(options: RsyncOptions, remotePath: string): string {
    return `${options.target.user}@${options.target.host}:${quoteForRemoteShell(remotePath)}`;
}

function withTrailingSlash(path: string): string {
    return path.endsWith("/") || path.endsWith("\\") ? path : `${path}/`;
}

function report(output: CommandOutput, what: string, transfer?: TransferOptions): void {
    for (const line of `${output.stdout}\n${output.stderr}`.split(/\r?\n/)) {
        const text = line.trim();
        if (text !== "") transfer?.onLine?.(text);
    }
    if (output.spawnError !== null) {
        throw new TransferError(
            `${what} could not be started (${output.spawnError}).`,
            firstLine(output.stderr),
            null,
        );
    }
    if (!output.ok) {
        throw new TransferError(`${what} failed.`, firstLine(output.stderr), output.exitCode);
    }
}

/* -------------------------------------------------------------------------- */
/* Choosing, and falling back where anybody can see it                        */
/* -------------------------------------------------------------------------- */

export interface TransferChoice {
    readonly transfer: FileTransfer;
    readonly kind: TransferKind;
    /** What the log is told before a single byte moves. */
    readonly message: string;
    /** Whether an interrupted copy of one file can be carried on. */
    readonly resumable: boolean;
}

export interface ChooseTransferOptions extends RsyncOptions {
    /** The `scp` implementation to use, and to fall back to. */
    readonly scpTransfer: FileTransfer;
    /** Injected so a test can answer as either state without either binary. */
    readonly probe?: (options: RsyncOptions) => Promise<RsyncSupport>;
    /** Told which tool was actually used for each copy, including a fallback. */
    readonly onLine?: (line: string) => void;
}

/**
 * Picks the resumable transfer when both ends can do it, and says which was picked.
 *
 * The returned transfer is wrapped so that a *later* rsync failure still completes the
 * copy: the same operation is retried through `scp`, and the wrapper announces the swap
 * and what it costs. Without that, the sharpest edge in this file - rsync's own parsing of
 * the remote-shell string - would turn a working upload into a failed render on exactly the
 * machines where the paths have spaces in them.
 */
export async function chooseTransfer(options: ChooseTransferOptions): Promise<TransferChoice> {
    const support = await (options.probe ?? probeRsync)(options);
    if (!support.available) {
        return {
            transfer: options.scpTransfer,
            kind: "scp",
            resumable: false,
            message: support.message,
        };
    }

    const resumable = rsyncTransfer({ ...options, shell: options.scpTransfer });
    return {
        transfer: withScpFallback(resumable, options.scpTransfer, options.onLine),
        kind: "rsync",
        resumable: true,
        message: support.message,
    };
}

/**
 * Runs each operation through rsync, and through `scp` when rsync would not.
 *
 * Deliberately not silent, and deliberately not a refusal. A person whose render died
 * because rsync could not parse a path with a space in it is owed the render, not a lesson;
 * a person whose forty-gigabyte upload is no longer resumable is owed the sentence saying
 * so before they rely on it.
 *
 * A cancellation is **never** retried. `AbortSignal.throwIfAborted` is how a cancelled
 * render stops transferring, and re-running the same copy through `scp` because the render
 * was cancelled would be a cancel button that starts a second upload.
 */
export function withScpFallback(
    resumable: FileTransfer,
    fallback: FileTransfer,
    onLine?: (line: string) => void,
): FileTransfer {
    const attempt = async <T>(
        what: string,
        first: () => Promise<T>,
        second: () => Promise<T>,
        signal: AbortSignal | undefined,
    ): Promise<T> => {
        try {
            return await first();
        } catch (error) {
            if (signal?.aborted === true) throw error;
            if (isAbort(error)) throw error;
            onLine?.(
                `rsync could not ${what} (${describe(error)}), so scp is being used for it instead. ` +
                    "scp cannot carry a partial file on, so if this one is interrupted it starts " +
                    "again from the beginning.",
            );
            return await second();
        }
    };

    return {
        makeRemoteDirectory: (remotePath, transfer) =>
            fallback.makeRemoteDirectory(remotePath, transfer),
        removeRemoteDirectory: (remotePath, transfer) =>
            fallback.removeRemoteDirectory(remotePath, transfer),

        uploadFile: (localPath, remotePath, transfer) =>
            attempt(
                `send ${localPath}`,
                () => resumable.uploadFile(localPath, remotePath, transfer),
                () => fallback.uploadFile(localPath, remotePath, transfer),
                transfer?.signal,
            ),

        uploadDirectory: (localPath, remotePath, transfer) =>
            attempt(
                `send ${localPath}`,
                () => resumable.uploadDirectory(localPath, remotePath, transfer),
                () => fallback.uploadDirectory(localPath, remotePath, transfer),
                transfer?.signal,
            ),

        downloadDirectory: (remotePath, localPath, transfer) =>
            attempt(
                `fetch ${remotePath}`,
                () => resumable.downloadDirectory(remotePath, localPath, transfer),
                () => fallback.downloadDirectory(remotePath, localPath, transfer),
                transfer?.signal,
            ),
    };
}

/** An abort is the render being cancelled, never a reason to try a different tool. */
function isAbort(error: unknown): boolean {
    return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
