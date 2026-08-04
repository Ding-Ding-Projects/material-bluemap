/**
 * The fakes every test in this folder runs against.
 *
 * There is no SSH client, no `scp`, no Docker daemon and no server anywhere in these tests,
 * and that is a requirement rather than an achievement: a cancellation path, a cleanup path
 * and a "the host has no Docker" path that can only be exercised against real hardware are
 * paths that are never exercised. Every module in `remote/` therefore takes its command
 * runner, its file transfer and its preflight as parameters, and this file is what gets
 * handed in.
 *
 * Deliberately not a `.test.ts`: it is fixture code several test files share, and vitest
 * would otherwise try to run it as a suite with no tests in it.
 */

import type { CommandOutput, CommandRunner } from "../runtime/command.js";
import type { FileTransfer, TransferOptions } from "./transfer.js";
import type { RemoteTarget } from "./target.js";

/** A `CommandOutput` with every field set, so nothing is accidentally undefined. */
export function output(partial: Partial<CommandOutput> = {}): CommandOutput {
    return {
        ok: partial.ok ?? true,
        exitCode: partial.exitCode ?? (partial.ok === false ? 1 : 0),
        stdout: partial.stdout ?? "",
        stderr: partial.stderr ?? "",
        spawnError: partial.spawnError ?? null,
    };
}

export interface RecordedCommand {
    readonly command: string;
    readonly args: readonly string[];
}

export interface FakeRunner {
    readonly runner: CommandRunner;
    readonly calls: RecordedCommand[];
    /** Every argv joined, for a cheap "did it ever say this" assertion. */
    text(): string;
}

/**
 * A runner that answers from a table of matchers.
 *
 * Matched in order, first match wins, so a test can put the specific case first and a
 * catch-all last. An unmatched command is a **failure of the test**, reported as such
 * rather than silently succeeding - a fake that answers "fine" to a command nobody
 * anticipated is how a test passes for a code path that does not work.
 */
export function fakeRunner(
    table: readonly { readonly when: RegExp; readonly answer: CommandOutput }[],
): FakeRunner {
    const calls: RecordedCommand[] = [];
    return {
        calls,
        text(): string {
            return calls.map((call) => `${call.command} ${call.args.join(" ")}`).join("\n");
        },
        runner: (command, args) => {
            calls.push({ command, args: [...args] });
            const line = `${command} ${args.join(" ")}`;
            for (const entry of table) {
                if (entry.when.test(line)) return Promise.resolve(entry.answer);
            }
            return Promise.resolve(
                output({
                    ok: false,
                    exitCode: 127,
                    stderr: `the fake runner was not told what to answer for: ${line}`,
                }),
            );
        },
    };
}

export interface FakeTransfer extends FileTransfer {
    /** Every operation, in order, as `verb local -> remote`. */
    readonly log: string[];
    /** Make the next matching operation throw, to prove a failure path. */
    failOn(pattern: RegExp, error: Error): void;
}

export function fakeTransfer(): FakeTransfer {
    const log: string[] = [];
    const failures: { pattern: RegExp; error: Error }[] = [];

    const record = (line: string, options?: TransferOptions): void => {
        options?.signal?.throwIfAborted();
        log.push(line);
        const index = failures.findIndex((entry) => entry.pattern.test(line));
        if (index >= 0) {
            const [entry] = failures.splice(index, 1);
            if (entry !== undefined) throw entry.error;
        }
    };

    return {
        log,
        failOn(pattern: RegExp, error: Error): void {
            failures.push({ pattern, error });
        },
        uploadDirectory(localPath, remotePath, options): Promise<void> {
            record(`upload-dir ${localPath} -> ${remotePath}`, options);
            return Promise.resolve();
        },
        uploadFile(localPath, remotePath, options): Promise<void> {
            record(`upload-file ${localPath} -> ${remotePath}`, options);
            return Promise.resolve();
        },
        downloadDirectory(remotePath, localPath, options): Promise<void> {
            record(`download-dir ${remotePath} -> ${localPath}`, options);
            return Promise.resolve();
        },
        makeRemoteDirectory(remotePath, options): Promise<void> {
            record(`mkdir ${remotePath}`, options);
            return Promise.resolve();
        },
        removeRemoteDirectory(remotePath, options): Promise<void> {
            record(`rm ${remotePath}`, options);
            return Promise.resolve();
        },
    };
}

/** A valid target, so a test that is about something else does not have to build one. */
export function testTarget(overrides: Partial<RemoteTarget> = {}): RemoteTarget {
    return {
        id: "render-box",
        label: "the render box",
        host: "render.example",
        port: 2222,
        user: "renderer",
        identityFile: null,
        workDir: "/srv/material-bluemap",
        image: "eclipse-temurin:25-jre",
        docker: "docker",
        keepRemoteFiles: false,
        ...overrides,
    };
}

/** `docker version --format {{json .}}` from a host where everything is fine. */
export const DOCKER_AVAILABLE = output({
    stdout: JSON.stringify({ Client: { Version: "27.4.0" }, Server: { Version: "27.4.0" } }),
});

/** What a remote shell says when `docker` is not installed on it. */
export const DOCKER_NOT_FOUND = output({
    ok: false,
    exitCode: 127,
    stderr: "bash: line 1: docker: command not found",
});

/** What OpenSSH says when the host is simply not there. */
export const SSH_UNREACHABLE = output({
    ok: false,
    exitCode: 255,
    stderr: "ssh: connect to host render.example port 2222: Connection timed out",
});

/** What OpenSSH says the first time it meets a host, with StrictHostKeyChecking=yes. */
export const SSH_HOST_KEY_UNKNOWN = output({
    ok: false,
    exitCode: 255,
    stderr:
        "No ED25519 host key is known for [render.example]:2222 and you have requested strict checking.\n" +
        "Host key verification failed.",
});

/** OpenSSH's banner when a recorded key and the offered key disagree. */
export const SSH_HOST_KEY_CHANGED = output({
    ok: false,
    exitCode: 255,
    stderr:
        "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n" +
        "@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\n" +
        "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n" +
        "IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!\n" +
        "Host key verification failed.",
});

export const SSH_AUTH_REFUSED = output({
    ok: false,
    exitCode: 255,
    stderr: "renderer@render.example: Permission denied (publickey).",
});

/** `df -Pk`, in the exact shape `-P` guarantees: one row, six columns. */
export function df(availableKilobytes: number): CommandOutput {
    return output({
        stdout:
            "Filesystem     1024-blocks      Used Available Capacity Mounted on\n" +
            `/dev/sda1        961302016 100000000 ${String(availableKilobytes)}      12% /\n`,
    });
}
