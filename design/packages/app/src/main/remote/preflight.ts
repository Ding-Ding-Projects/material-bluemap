/**
 * Proving a remote host can actually do the job, before anything is promised or sent.
 *
 * A render is gigabytes of upload and hours of compute. Discovering at the end of the
 * upload that the host has no Docker is not a slow failure, it is a wasted evening on a
 * domestic connection. So every question is asked first, in the order that makes each
 * answer meaningful, and each one has its **own** sentence.
 *
 * ```
 * 1  ssh          can this app reach the host and sign in at all?
 * 2  host key     is the machine answering the machine that answered last time?   (inside 1)
 * 3  docker       is there a Docker there, and is its daemon running?
 * 4  disk         is there room under the work directory for this world and its tiles?
 * ```
 *
 * The order is not cosmetic. Asking about Docker before the connection works reports
 * "Docker is not installed" for a host that is simply switched off - which sends somebody
 * to install software on a machine that was never the problem. Every check below therefore
 * runs only when the one before it passed, and the report says which one stopped.
 *
 * ## The Docker check is the local one, run somewhere else
 *
 * `runtime/docker.ts` already distinguishes not-installed, daemon-unreachable, refused and
 * unusable, with a sentence for each. It takes its command runner as a parameter, so this
 * hands it one that runs on the other machine (`ssh.ts`) and gets the same five states back
 * for the remote host. There is one Docker classifier in this repository, and it is that
 * one - a second would drift, and the state it got wrong would be the one nobody tested.
 */

import { execFileCommandRunner, type CommandRunner } from "../runtime/command.js";
import { probeDocker, type DockerReport } from "../runtime/docker.js";
import * as failures from "./failure.js";
import type { RemoteFailure } from "./failure.js";
import { describeOffers, recordedFor, scanHostKeys } from "./hostkey.js";
import type { HostKeyOffer, HostKeyOptions } from "./hostkey.js";
import {
    classifySshOutput,
    firstLine,
    quoteForRemoteShell,
    sshCommandRunner,
    sshScriptArguments,
    type SshOptionsInput,
} from "./ssh.js";
import { describeTarget, type RemoteTarget } from "./target.js";

export type PreflightStage = "ssh" | "host-key" | "docker" | "disk";

export interface PreflightCheck {
    readonly stage: PreflightStage;
    readonly ok: boolean;
    /** One sentence, naming the state and the next thing to do. */
    readonly message: string;
    readonly detail: string | null;
}

export interface PreflightReport {
    readonly ok: boolean;
    readonly target: string;
    readonly checks: readonly PreflightCheck[];
    /** Why it stopped, or null when everything passed. */
    readonly failure: RemoteFailure | null;
    /**
     * The keys the host is offering, when the host key was the thing that stopped it.
     *
     * Present so the interface can put fingerprints in front of a person. Empty in every
     * other case, including a refusal for a *changed* key - see `hostkey.ts` for why that
     * one is never offered as a choice.
     */
    readonly hostKeys: readonly HostKeyOffer[];
    readonly docker: DockerReport | null;
    /** Free bytes under the work directory, when it got far enough to ask. */
    readonly freeBytes: number | null;
    /** The work directory with `~` resolved, which is what a container mount needs. */
    readonly workDir: string | null;
}

export interface PreflightOptions extends SshOptionsInput, HostKeyOptions {
    readonly ssh?: string;
    readonly runner?: CommandRunner;
    /**
     * Bytes the render is expected to need there.
     *
     * The world's own size plus room for its tiles. Zero skips the check rather than
     * passing it: a caller that does not know the size should say so, not guess.
     */
    readonly requiredBytes?: number;
    readonly timeoutMs?: number;
}

/**
 * Runs every check, in order, and stops at the first failure.
 *
 * Never rejects. Every outcome - including "ssh is not installed on this computer" - is a
 * report the settings screen renders, and a rejection would arrive at the renderer as a
 * bare `Error` with a stack in it.
 */
export async function preflight(
    target: RemoteTarget,
    options: PreflightOptions,
): Promise<PreflightReport> {
    const runner = options.runner ?? execFileCommandRunner;
    const ssh = options.ssh ?? "ssh";
    const name = describeTarget(target);
    const checks: PreflightCheck[] = [];

    const stop = (
        failure: RemoteFailure,
        extra: Partial<PreflightReport> = {},
    ): PreflightReport => ({
        ok: false,
        target: name,
        checks,
        failure,
        hostKeys: [],
        docker: null,
        freeBytes: null,
        workDir: null,
        ...extra,
    });

    /* 1 & 2: the connection, and the host key inside it. --------------------- */

    // `printf %s "$HOME"` rather than `true`: it proves the connection *and* resolves the
    // work directory in one round trip. A tilde cannot be expanded by a container mount, so
    // this answer is what every path downstream is built from.
    const connect = await runner(
        ssh,
        sshScriptArguments(options, 'printf %s "$HOME"'),
        options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs },
    );
    const outcome = classifySshOutput(connect);
    const said = firstLine(connect.stderr);

    if (outcome !== "ok") {
        if (outcome === "ssh-missing") {
            checks.push({
                stage: "ssh",
                ok: false,
                message: `There is no '${ssh}' on this computer.`,
                detail: null,
            });
            return stop(failures.sshMissing(ssh));
        }
        if (outcome === "host-key-changed") {
            const recorded = await recordedFor(target, options.knownHostsFile);
            checks.push({
                stage: "host-key",
                ok: false,
                message: `${name} offered a different host key from the one recorded for it.`,
                detail: recorded.length === 0 ? said : describeOffers(recorded),
            });
            // Deliberately no `hostKeys`: there is no button, so there is nothing to show
            // a fingerprint *for*. Offering one here is offering somebody a way to accept a
            // key that has just changed under them.
            return stop(failures.hostKeyChanged(name, said));
        }
        if (outcome === "host-key-unknown") {
            const scanned = await scanHostKeys(target, options);
            checks.push({
                stage: "host-key",
                ok: false,
                message: `${name} offered a host key this app has not seen before.`,
                detail: describeOffers(scanned.offers),
            });
            if (scanned.offers.length === 0) {
                return stop(failures.hostKeyUnavailable(name, scanned.detail ?? said));
            }
            return stop(failures.hostKeyUnknown(name, describeOffers(scanned.offers)), {
                hostKeys: scanned.offers,
            });
        }
        if (outcome === "auth-refused") {
            checks.push({
                stage: "ssh",
                ok: false,
                message: `${name} refused the key.`,
                detail: said,
            });
            return stop(failures.authRefused(name, said));
        }
        if (outcome === "unreachable") {
            checks.push({
                stage: "ssh",
                ok: false,
                message: `${name} did not answer.`,
                detail: said,
            });
            return stop(failures.unreachable(name, said));
        }
        checks.push({
            stage: "ssh",
            ok: false,
            message: `${name} answered, and the check command failed.`,
            detail: said,
        });
        return stop(failures.remoteCommandFailed(name, "The connection check", connect.exitCode, said));
    }

    const home = connect.stdout.trim();
    const workDir = resolveWorkDir(target.workDir, home);
    checks.push({
        stage: "ssh",
        ok: true,
        message: `Signed in to ${name} with a key. No password was offered or asked for.`,
        detail: null,
    });
    checks.push({
        stage: "host-key",
        ok: true,
        message: `${target.host} presented a host key this app already trusts.`,
        detail: null,
    });

    /* 3: Docker, classified by the same code that classifies it locally. ------ */

    const remote = sshCommandRunner({
        ...options,
        ssh,
        ...(options.runner === undefined ? {} : { runner: options.runner }),
    });
    const docker = await probeDocker({
        docker: target.docker,
        runner: remote,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });

    if (docker.status !== "available") {
        // The status comes from the shared classifier; the *sentence* is rewritten here,
        // because `runtime/docker.ts` says "this account's PATH", which is true of this
        // computer and misleading about a machine on the other end of a wire.
        const detail = docker.detail;
        checks.push({
            stage: "docker",
            ok: false,
            message: remoteDockerMessage(docker, name, target.docker),
            detail,
        });
        const failure =
            docker.status === "not-installed"
                ? failures.dockerMissing(name, detail)
                : docker.status === "daemon-unreachable"
                  ? failures.dockerDaemonDown(name, detail)
                  : docker.status === "refused"
                    ? failures.dockerRefused(name, detail)
                    : failures.dockerUnusable(name, docker.message, detail);
        return stop(failure, { docker });
    }

    checks.push({
        stage: "docker",
        ok: true,
        message: remoteDockerMessage(docker, name, target.docker),
        detail: null,
    });

    /* 4: room to work. ------------------------------------------------------- */

    const quoted = quoteForRemoteShell(workDir);
    // `mkdir -p` first, because `df` on a directory that does not exist yet answers about
    // nothing. This is the only thing preflight writes, it is one empty directory, and it
    // is the directory the render was going to create a moment later anyway.
    const space = await runner(
        ssh,
        sshScriptArguments(options, `mkdir -p ${quoted} && df -Pk ${quoted}`),
        options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs },
    );
    const freeBytes = readDfAvailableBytes(space.stdout);

    if (!space.ok || freeBytes === null) {
        const detail = firstLine(space.stderr);
        checks.push({
            stage: "disk",
            ok: false,
            message: `${workDir} could not be created or measured on ${name}.`,
            detail,
        });
        return stop(
            failures.remoteCommandFailed(name, `Preparing ${workDir}`, space.exitCode, detail),
            { docker, workDir },
        );
    }

    const required = options.requiredBytes ?? 0;
    if (required > 0 && freeBytes < required) {
        checks.push({
            stage: "disk",
            ok: false,
            message: `${workDir} has ${humanBytes(freeBytes)} free and this render needs about ${humanBytes(required)}.`,
            detail: null,
        });
        return stop(failures.notEnoughDisk(name, workDir, freeBytes, required), {
            docker,
            freeBytes,
            workDir,
        });
    }

    checks.push({
        stage: "disk",
        ok: true,
        message: `${workDir} has ${humanBytes(freeBytes)} free.`,
        detail: null,
    });

    return {
        ok: true,
        target: name,
        checks,
        failure: null,
        hostKeys: [],
        docker,
        freeBytes,
        workDir,
    };
}

/** `~/x` against a resolved home. Anything already absolute is left exactly as it is. */
export function resolveWorkDir(workDir: string, home: string): string {
    if (workDir === "~") return home === "" ? workDir : home;
    if (!workDir.startsWith("~/")) return workDir;
    const tail = workDir.slice(2);
    // An empty `$HOME` would silently turn `~/renders` into `/renders`, which is a
    // directory at the root of the remote filesystem that the account cannot create.
    return home === "" ? workDir : `${home.replace(/\/+$/, "")}/${tail}`;
}

/**
 * The `Available` column of `df -Pk`, in bytes.
 *
 * `-P` is what makes this parseable at all: without it, `df` wraps a long device name onto
 * its own line and the numbers land on the next one, so a naive reader takes the *device*
 * as the size. `-k` fixes the unit at 1024-byte blocks rather than whatever `BLOCKSIZE` or
 * `DF_BLOCK_SIZE` happens to be set to in that account's environment.
 */
export function readDfAvailableBytes(stdout: string): number | null {
    const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== "");
    const data = lines.at(-1);
    if (data === undefined || /^Filesystem\b/i.test(data)) return null;
    const columns = data.split(/\s+/);
    // Filesystem, 1024-blocks, Used, Available, Capacity, Mounted-on
    const available = columns[3];
    if (available === undefined || !/^\d+$/.test(available)) return null;
    return Number.parseInt(available, 10) * 1024;
}

/** Docker's state, said about a machine that is not this one. */
function remoteDockerMessage(docker: DockerReport, target: string, binary: string): string {
    const version = docker.clientVersion === null ? "Docker" : `Docker ${docker.clientVersion}`;
    switch (docker.status) {
        case "available":
            return `${version} is installed on ${target} and its daemon${
                docker.serverVersion === null ? "" : ` (${docker.serverVersion})`
            } is running.`;
        case "not-installed":
            return `There is no '${binary}' command on ${target}.`;
        case "daemon-unreachable":
            return `${version} is installed on ${target}, and its daemon is not running.`;
        case "refused":
            return `${version} is installed on ${target}, and that account may not talk to its daemon.`;
        default:
            return `${version} on ${target} answered with something this app does not recognise.`;
    }
}

function humanBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit++;
    }
    return `${unit === 0 ? String(value) : value.toFixed(1)} ${units[unit] ?? "B"}`;
}
