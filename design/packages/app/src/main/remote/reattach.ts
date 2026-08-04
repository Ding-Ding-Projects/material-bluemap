/**
 * Reaching a container on somebody else's machine after this app was closed.
 *
 * ## What survives a closed app, and what does not
 *
 * A remote render is a `docker run` on a Linux box, started through `ssh`. Closing the app
 * closes the `ssh`, which closes the client - and the daemon on the other machine, which
 * owns the container, is never told. The render carries on. Tiles keep landing in
 * `<workDir>/<renderId>/web/maps` on that host, and this app, having lost the only thing
 * holding a handle to it, would previously have offered to send the whole world again.
 *
 * Everything needed to find it again is one name and one host, and `runtime/handoff.ts`
 * writes both down before the container starts. This file is the four small operations
 * that name makes possible - ask, read, stop, fetch - expressed as the same
 * {@link ContainerAccess} the local daemon implements, so `runtime/reattach.ts` never
 * learns that a network is involved.
 *
 * ## The record is re-validated, every time
 *
 * The host, port, user and key path in a record end up in an `ssh` argument, exactly as
 * they do when a target is first typed - and a record is a **file**, which means an older
 * build, a hand edit or a restored backup can have put anything in it. So it goes back
 * through `validateTarget` before a single argument is built. A record that does not
 * validate does not silently fall back to something; it produces an access whose every
 * answer is the refusal and its reason, which is what puts the sentence in front of a
 * person instead of an unexplained failure.
 *
 * ## Three things that genuinely cannot be resumed, and what is said about each
 *
 * - **the host key changed.** Refused, with no button, exactly as a fresh connection would
 *   be. A rebuilt server and an intercepted one are indistinguishable from here.
 * - **the staging directory is gone.** Somebody cleaned up, or `keepRemoteFiles` was off
 *   and a previous run removed it. There is nothing to fetch and the render has to be run
 *   again; that is said, rather than a finished render being reported over an empty folder.
 * - **the container was removed.** `--rm` does this the moment it ends. Its output is still
 *   on the host's disk, so it is fetched; its exit status is not, so nothing here claims
 *   to know whether it finished.
 */

import {
    inspectArguments,
    attachArguments,
    readInspection,
    type ContainerInspection,
} from "../runtime/attach.js";
import { execFileCommandRunner, type CommandRunner } from "../runtime/command.js";
import type { ContainerHandoff, RemoteHandoffTarget } from "../runtime/handoff.js";
import type { EngineLaunch } from "../runtime/plan.js";
import type { CollectReport, ContainerAccess } from "../runtime/reattach.js";
import * as failures from "./failure.js";
import { remoteStopArguments } from "./plan.js";
import { chooseTransfer } from "./rsync.js";
import {
    classifySshOutput,
    firstLine,
    remoteCommandLine,
    sshArguments,
    type SshOptionsInput,
    type SshOutcome,
} from "./ssh.js";
import { scpTransfer, type FileTransfer } from "./transfer.js";
import { describeTarget, validateTarget, type RemoteTarget } from "./target.js";

export interface RemoteContainerAccessOptions {
    /** The app's own known_hosts. The only trust store this app ever writes to. */
    readonly knownHostsFile: string;
    /** The person's own file, read as well, so keys they already trust need no second decision. */
    readonly userKnownHostsFile?: string | null;
    readonly ssh?: string;
    readonly scp?: string;
    readonly rsync?: string;
    readonly runner?: CommandRunner;
    /** Injected so a test can prove the whole flow with no ssh, no scp and no rsync. */
    readonly transfer?: (target: RemoteTarget) => Promise<{
        readonly transfer: FileTransfer;
        readonly message: string;
    }>;
}

/**
 * Rebuilds the target a record describes, through the same validation a typed one gets.
 *
 * `image` and `workDir` are filled with values that are never used for a reattach - no
 * container is being *started* - but they are supplied rather than left out because
 * `validateTarget` is the one gate every field passes through, and a version of it that
 * accepted a partial target would be a second, weaker gate.
 */
export function targetFromRecord(remote: RemoteHandoffTarget): RemoteTarget | null {
    const checked = validateTarget({
        id: remote.id,
        label: `${remote.user}@${remote.host}`,
        host: remote.host,
        port: remote.port,
        user: remote.user,
        identityFile: remote.identityFile,
        workDir: remote.root,
        docker: remote.docker,
        keepRemoteFiles: remote.keepRemoteFiles,
    });
    return checked.ok ? checked.target : null;
}

/** The sentence for an `ssh` failure that is about the connection rather than the command. */
function sshRefusal(target: string, outcome: SshOutcome, detail: string | null): string {
    switch (outcome) {
        case "ssh-missing":
            return failures.sshMissing("ssh").message;
        case "host-key-changed":
            return failures.hostKeyChanged(target, detail).message;
        case "host-key-unknown":
            return failures.hostKeyUnknown(target, detail).message;
        case "auth-refused":
            return failures.authRefused(target, detail).message;
        default:
            return failures.unreachable(target, detail).message;
    }
}

/**
 * An access that refuses everything, with the reason.
 *
 * Returned instead of null so the reason travels. `runtime/reattach.ts` turns an `unknown`
 * inspection into a sentence naming the machine and the detail, which is how "that host
 * key is not the one recorded" reaches the screen rather than being flattened into "the
 * daemon did not answer".
 */
function refusing(where: string, reason: string): ContainerAccess {
    return {
        describe: () => where,
        inspect: (name) =>
            Promise.resolve({
                name,
                state: "unknown" as const,
                status: null,
                exitCode: null,
                detail: reason,
            }),
        attachLaunch: () => {
            // Unreachable in practice: `runtime/reattach.ts` never attaches on `unknown`.
            // Throwing rather than returning a launch that would run something is the
            // safer half of "unreachable in practice".
            throw new Error(reason);
        },
        stop: () => Promise.resolve(),
        collect: () => Promise.resolve({ ok: false, message: reason }),
    };
}

/**
 * A container on a remote daemon, reached over SSH.
 *
 * Never rejects from any method, including the ones that talk to a network. Every failure
 * here is something the interface has to show beside a render, and an exception would have
 * to be turned back into this shape by the one caller there is.
 */
export function remoteContainerAccess(
    record: ContainerHandoff,
    options: RemoteContainerAccessOptions,
): ContainerAccess {
    const remote = record.remote;
    if (remote === null) {
        return refusing("this computer", "That record does not name a remote host.");
    }

    const where = `${remote.user}@${remote.host}:${String(remote.port)}`;
    const target = targetFromRecord(remote);
    if (target === null) {
        return refusing(
            where,
            `The note about container '${record.containerName}' on ${where} does not describe a ` +
                "host this app is willing to build an ssh command from, so it cannot be reached. " +
                "The render has to be started again.",
        );
    }

    const runner = options.runner ?? execFileCommandRunner;
    const ssh = options.ssh ?? "ssh";
    const sshOptions: SshOptionsInput = {
        target,
        knownHostsFile: options.knownHostsFile,
        ...(options.userKnownHostsFile === undefined
            ? {}
            : { userKnownHostsFile: options.userKnownHostsFile }),
    };
    const name = describeTarget(target);

    const chooseFileTransfer =
        options.transfer ??
        (async (chosen: RemoteTarget) => {
            const scp = scpTransfer({
                target: chosen,
                knownHostsFile: options.knownHostsFile,
                ...(options.userKnownHostsFile === undefined
                    ? {}
                    : { userKnownHostsFile: options.userKnownHostsFile }),
                ...(options.ssh === undefined ? {} : { ssh: options.ssh }),
                ...(options.scp === undefined ? {} : { scp: options.scp }),
                ...(options.runner === undefined ? {} : { runner: options.runner }),
            });
            const choice = await chooseTransfer({
                target: chosen,
                knownHostsFile: options.knownHostsFile,
                ...(options.userKnownHostsFile === undefined
                    ? {}
                    : { userKnownHostsFile: options.userKnownHostsFile }),
                ...(options.ssh === undefined ? {} : { ssh: options.ssh }),
                ...(options.rsync === undefined ? {} : { rsync: options.rsync }),
                ...(options.runner === undefined ? {} : { runner: options.runner }),
                scpTransfer: scp,
            });
            return { transfer: choice.transfer, message: choice.message };
        });

    return {
        describe: () => name,

        async inspect(containerName): Promise<ContainerInspection> {
            const output = await runner(
                ssh,
                [
                    ...sshArguments(sshOptions),
                    remoteCommandLine([target.docker, ...inspectArguments(containerName)]),
                ],
                {},
            );
            const outcome = classifySshOutput(output);
            if (outcome !== "ok" && outcome !== "remote-failed") {
                // `ssh` failing is not the container being gone. Reporting a changed host
                // key or a dead host as "no such container" would collect an empty output
                // folder and call a running render finished.
                return {
                    name: containerName,
                    state: "unknown",
                    status: null,
                    exitCode: null,
                    detail: sshRefusal(name, outcome, firstLine(output.stderr)),
                };
            }
            return readInspection(containerName, output);
        },

        /**
         * An `EngineLaunch` whose command is `ssh`, exactly as the orchestrator's is.
         *
         * Everything downstream - the line reader, the phase tracker, the progress parser,
         * the cancellation - is then the code the local path uses, unchanged, which is what
         * makes a reattached remote render indistinguishable from a running local one.
         */
        attachLaunch(): EngineLaunch {
            return {
                mode: "docker",
                role: "render",
                command: ssh,
                args: [
                    ...sshArguments(sshOptions),
                    remoteCommandLine([target.docker, ...attachArguments(record.containerName)]),
                ],
                cwd: record.cwd,
                mounts: [],
                containerName: record.containerName,
                engineConfigDir: "/bluemap/config",
                hostConfigDir: record.cwd,
                url: null,
                hostPort: null,
            };
        },

        async stop(containerName): Promise<void> {
            // The remote daemon, by name. Killing the local ssh would end the reading and
            // leave the container running on somebody else's machine - which is the exact
            // situation this whole file exists to get out of.
            await runner(
                ssh,
                [
                    ...sshArguments(sshOptions),
                    remoteCommandLine(remoteStopArguments(target, containerName)),
                ],
                {},
            );
        },

        async collect(): Promise<CollectReport> {
            let transfer: FileTransfer;
            let how: string;
            try {
                const chosen = await chooseFileTransfer(target);
                transfer = chosen.transfer;
                how = chosen.message;
            } catch (error) {
                return { ok: false, message: describe(error) };
            }

            try {
                await transfer.downloadDirectory(remote.storageRoot, record.webRoot);
            } catch (error) {
                return {
                    ok: false,
                    message:
                        `${remote.storageRoot} could not be fetched from ${name}: ${describe(error)}. ` +
                        "If the staging directory was removed there, the tiles are gone with it and " +
                        "the render has to be started again.",
                };
            }
            return {
                ok: true,
                message: `${how} The map was fetched from ${remote.storageRoot} on ${name}.`,
            };
        },

        /**
         * Removes the staging directory, and says whether it did.
         *
         * Never fails the render: the map is already home by the time this runs, so a
         * cleanup that could not happen is a warning naming the directory that is still
         * there - which is exactly what somebody needs to remove it by hand.
         */
        async cleanUp(): Promise<CollectReport> {
            if (target.keepRemoteFiles) {
                return {
                    ok: false,
                    message:
                        `${remote.root} was left on ${target.host}, including a copy of the world, ` +
                        "because this target is set to keep its remote files.",
                };
            }
            try {
                const chosen = await chooseFileTransfer(target);
                await chosen.transfer.removeRemoteDirectory(remote.root);
                return { ok: true, message: `${remote.root} was removed from ${target.host}.` };
            } catch (error) {
                return {
                    ok: false,
                    message:
                        `${remote.root} could not be removed from ${target.host} and is still ` +
                        `there: ${describe(error)}`,
                };
            }
        },
    };
}

/**
 * The access factory an app hands the reattacher: local for a local record, SSH otherwise.
 *
 * One function rather than two registrations, because one app can hold both kinds at once
 * and the reattacher decides per record rather than per session.
 */
export function containerAccessFor(options: {
    readonly local: ContainerAccess;
    readonly remote: RemoteContainerAccessOptions;
}): (record: ContainerHandoff) => ContainerAccess {
    return (record) =>
        record.mode === "remote" ? remoteContainerAccess(record, options.remote) : options.local;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
