/**
 * Moving the world there and the map back.
 *
 * `scp` rather than a library, for the same reason `ssh` is used rather than a library: it
 * uses the person's agent and their config, and this app never touches key material. It is
 * also, honestly, the slow part - `scp -r` opens a channel per file and a world is tens of
 * thousands of small region files - and the documentation says so rather than pretending
 * otherwise.
 *
 * ## What is an interface here, and why
 *
 * {@link FileTransfer} exists so that not one test in this folder needs a server. The
 * orchestrator asks for "put this directory there" and "bring that directory back"; whether
 * that is `scp`, a tar stream, or a fake that records what it was asked for is a decision
 * one layer down. The failure this prevents is the usual one: a cancellation path, a
 * cleanup path and a partial-transfer path that are only ever exercised against real
 * hardware, and therefore never exercised.
 */

import { execFileCommandRunner, type CommandOutput, type CommandRunner } from "../runtime/command.js";
import { firstLine, quoteForRemoteShell, scpArguments, scpRemotePath, sshScriptArguments, type SshOptionsInput } from "./ssh.js";
import type { RemoteTarget } from "./target.js";

export interface TransferOptions {
    /** Abort in flight. A cancelled render must stop transferring, not just stop listening. */
    readonly signal?: AbortSignal;
    /** Called with each line the transfer tool printed, for the log. */
    readonly onLine?: (line: string) => void;
}

/** What went wrong, with the tool's own words kept apart from the sentence. */
export class TransferError extends Error {
    readonly detail: string | null;
    readonly exitCode: number | null;

    constructor(message: string, detail: string | null, exitCode: number | null) {
        super(message);
        this.name = "TransferError";
        this.detail = detail;
        this.exitCode = exitCode;
    }
}

export interface FileTransfer {
    /** Copies a local directory so that it *becomes* `remotePath`. */
    uploadDirectory(localPath: string, remotePath: string, options?: TransferOptions): Promise<void>;
    uploadFile(localPath: string, remotePath: string, options?: TransferOptions): Promise<void>;
    /** Copies a remote directory so that it *becomes* `localPath`. */
    downloadDirectory(remotePath: string, localPath: string, options?: TransferOptions): Promise<void>;
    /** Creates a directory on the remote host, parents included. */
    makeRemoteDirectory(remotePath: string, options?: TransferOptions): Promise<void>;
    /** Removes a remote directory and everything under it. */
    removeRemoteDirectory(remotePath: string, options?: TransferOptions): Promise<void>;
}

export interface ScpTransferOptions extends SshOptionsInput {
    readonly scp?: string;
    readonly ssh?: string;
    readonly runner?: CommandRunner;
}

/**
 * The real thing, over `scp` and `ssh`.
 *
 * Note the shape of every copy: the *parent* is created first and the source is copied
 * **into** it under the name the destination should have. `scp -r local/config
 * host:/stage/config` behaves differently depending on whether `/stage/config` already
 * exists - it either becomes it or lands inside it as `/stage/config/config` - and that
 * ambiguity is how a render ends up looking for its config one directory too high. So the
 * destination's parent is created and the copy names the destination explicitly.
 */
export function scpTransfer(options: ScpTransferOptions): FileTransfer {
    const runner = options.runner ?? execFileCommandRunner;
    const scp = options.scp ?? "scp";
    const ssh = options.ssh ?? "ssh";
    const target: RemoteTarget = options.target;

    const shell = async (script: string, what: string, transfer?: TransferOptions): Promise<void> => {
        transfer?.signal?.throwIfAborted();
        const output = await runner(ssh, sshScriptArguments(options, script), {});
        report(output, what, transfer);
    };

    const copy = async (
        args: readonly string[],
        what: string,
        transfer?: TransferOptions,
    ): Promise<void> => {
        transfer?.signal?.throwIfAborted();
        // `-q` because scp's progress meter is drawn with carriage returns and would fill
        // a log with a single unreadable line. Progress for the person comes from the
        // orchestrator's own events, which know how many things there are to send.
        const output = await runner(scp, [...scpArguments(options, ["-q", ...args])], {});
        report(output, what, transfer);
    };

    return {
        async makeRemoteDirectory(remotePath, transfer): Promise<void> {
            await shell(
                `mkdir -p ${quoteForRemoteShell(remotePath)}`,
                `Creating ${remotePath}`,
                transfer,
            );
        },

        async removeRemoteDirectory(remotePath, transfer): Promise<void> {
            // Guarded on the remote side as well as on this one. `rm -rf` with an empty or
            // unexpected variable is the single most destructive command a script can run,
            // and the caller's path has already been validated - this is the second lock on
            // the same door, because the cost of it being wrong is somebody's server.
            const quoted = quoteForRemoteShell(remotePath);
            await shell(
                `case ${quoted} in /|/*/..*|"") exit 9;; esac; rm -rf ${quoted}`,
                `Removing ${remotePath}`,
                transfer,
            );
        },

        async uploadFile(localPath, remotePath, transfer): Promise<void> {
            await copy(
                [localPath, scpRemotePath(target, remotePath)],
                `Sending ${localPath}`,
                transfer,
            );
        },

        async uploadDirectory(localPath, remotePath, transfer): Promise<void> {
            await this.makeRemoteDirectory(parentOf(remotePath), transfer);
            await copy(
                ["-r", localPath, scpRemotePath(target, remotePath)],
                `Sending ${localPath}`,
                transfer,
            );
        },

        async downloadDirectory(remotePath, localPath, transfer): Promise<void> {
            await copy(
                ["-r", scpRemotePath(target, remotePath), localPath],
                `Fetching ${remotePath}`,
                transfer,
            );
        },
    };
}

/** `/a/b/c` -> `/a/b`. `/a` -> `/`. Text, not `node:path`: this is a POSIX remote path. */
export function parentOf(remotePath: string): string {
    const trimmed = remotePath.replace(/\/+$/, "");
    const cut = trimmed.lastIndexOf("/");
    if (cut <= 0) return "/";
    return trimmed.slice(0, cut);
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
