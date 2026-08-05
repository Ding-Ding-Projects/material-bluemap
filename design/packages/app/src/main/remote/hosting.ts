/**
 * Hosting an already-rendered map on a Linux server the person owns, over SSH, in Docker.
 *
 * A remote **render** (`orchestrator.ts`) sends a world, runs it once, brings the tiles
 * home and removes every trace of itself. Hosting is the feature this application did not
 * have before: put a finished map on a server so somebody else can open it, and leave it
 * running.
 *
 * ```
 * 1  preflight     ssh, host key, Docker, disk - exactly `preflight.ts`, reused unchanged
 * 2  stage         (re)create <workDir>/host-<hostingId>/ on the remote host
 * 3  config        written HERE with CONTAINER paths, role "web-server", then uploaded
 * 4  upload        the engine jar, each map's world, and the already-rendered `web/` root
 * 5  replace       any previous container of this name is torn down, so republishing is
 *                  idempotent rather than a "name already in use" refusal
 * 6  serve         `docker run -d --restart unless-stopped ...` - detached, on purpose
 * 7  verify        the published address is genuinely connected to before it is reported
 * 8  record        a durable note of what is running, where, so it can be found again
 * ```
 *
 * ## "Live" is not a claim made on Docker's say-so
 *
 * `docker run -d` reports success the instant the container starts, which is not the same
 * fact as "a browser can reach this map" - the exact distinction `docker-and-local.md`
 * draws for the local web server, and that this module draws for a remote one, with one
 * wrinkle a local server never has: **two different networks can fail**, and the report has
 * to say which one did.
 *
 * - **`bindMode: "public"`** publishes to every interface on the remote host, so this
 *   computer connects to it directly, over the real internet, the same way anybody else
 *   would. {@link RemoteHostingOrchestratorOptions.probe} (default: the same `tcpPortProbe`
 *   the local web server proves itself with) is what does that connecting.
 * - **`bindMode: "loopback"`** publishes only to the remote host's own loopback address,
 *   which this computer cannot reach directly at all - that is the whole point of choosing
 *   it. So the check runs *on the remote host*, over the SSH connection already open for
 *   everything else: a small script asks that machine's own kernel whether something is
 *   listening on `127.0.0.1:<port>`, and the answer travels home over the channel that is
 *   already trusted.
 *
 * Both paths distinguish "the container never bound the port" from "the port is bound and
 * this application's own network cannot reach it" wherever the evidence allows it, the same
 * way `ssh.ts` already distinguishes ssh's own failure from the remote command's.
 *
 * ## What never happens here
 *
 * The same three promises `orchestrator.ts` makes: no password, ever; an unknown host key is
 * a refusal with fingerprints attached, never a silent trust; and a copy of somebody's world
 * sitting on a server is a fact stated out loud, not a detail. Hosting adds one more: a
 * published port is exactly the address the person chose, in exactly the words they were
 * shown before pressing the button - never guessed at, never silently widened.
 */

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { CONTAINER_DATA_DIR, CONTAINER_WEB_ROOT } from "../runtime/mounts.js";
import { execFileCommandRunner, type CommandRunner } from "../runtime/command.js";
import { writeEngineConfig } from "../runtime/config.js";
import { tcpPortProbe, type PortProbe } from "../runtime/webserver.js";
import type { RenderMapRequest } from "../render/config.js";
import type { ResolvedEngine } from "../render/orchestrator.js";
import { renderWorkspace } from "../render/workspace.js";
import * as failures from "./failure.js";
import type { RemoteFailure } from "./failure.js";
import {
    publishBindAddress,
    remoteHostingContainerName,
    remoteHostingTeardownArguments,
    remoteServeDockerRunArguments,
    REMOTE_HOSTING_CONTAINER_PORT,
    type RemoteHostingPublish,
} from "./hostplan.js";
import { remotePaths, remoteWorldPath, type RemoteRenderPaths } from "./plan.js";
import { preflight, type PreflightOptions, type PreflightReport } from "./preflight.js";
import { remoteCommandLine, sshArguments, sshScriptArguments, type SshOptionsInput } from "./ssh.js";
import { chooseTransfer } from "./rsync.js";
import { scpTransfer, TransferError, type FileTransfer } from "./transfer.js";
import { describeTarget, type RemoteTarget } from "./target.js";

/* -------------------------------------------------------------------------- */
/* What crosses                                                               */
/* -------------------------------------------------------------------------- */

export interface RemoteHostRequest {
    readonly target: RemoteTarget;
    /** Stable id for this hosted map. Becomes part of the container name and the record file. */
    readonly hostingId: string;
    /** The render whose `web/` output is being hosted. */
    readonly renderId: string;
    /**
     * The maps being hosted, in the same shape a render request uses.
     *
     * The world is sent again, deliberately: the engine constructs a real `BmMap` on every
     * start, `-w` included, and that construction opens the world's own files whether or
     * not anything is re-rendered (`packages/cli/src/maps.ts`, `buildMaps`). Hosting a map
     * that was already rendered still needs the world it was rendered from.
     */
    readonly maps: readonly RenderMapRequest[];
    readonly publish: RemoteHostingPublish;
    readonly requiredBytes?: number;
    readonly containerUser?: string | null;
    readonly memory?: string | null;
    readonly jvmArgs?: readonly string[];
}

export type RemoteHostingStatus = "running" | "stopped" | "unknown";

/** What this computer remembers about a map it is hosting. */
export interface RemoteHostingRecord {
    readonly version: number;
    readonly hostingId: string;
    readonly renderId: string;
    /**
     * Safe to persist whole: a {@link RemoteTarget} carries a host, a port, an account name
     * and, at most, the *path* to a key file - see `target.ts`'s own doc comment for why
     * that is true by construction rather than by convention.
     */
    readonly target: RemoteTarget;
    readonly containerName: string;
    readonly remoteRoot: string;
    readonly mapIds: readonly string[];
    readonly publish: RemoteHostingPublish;
    readonly status: RemoteHostingStatus;
    /** `http://<host>:<port>/`, present only once a public bind has actually been verified. */
    readonly url: string | null;
    /** True only once the published address answered a real connection. */
    readonly verified: boolean;
    readonly verifiedVia: "network" | "ssh-loopback" | null;
    /** True when the remote staging directory (world included) is left there on purpose. */
    readonly remoteFilesKept: boolean;
    readonly startedAt: string;
    readonly lastCheckedAt: string;
    readonly notes: readonly string[];
}

export type RemoteHostPhase = "preflight" | "staging" | "uploading" | "starting" | "verifying" | "finished";

export type RemoteHostEvent =
    | { readonly type: "started"; readonly hostingId: string; readonly target: string; readonly at: string }
    | { readonly type: "phase"; readonly hostingId: string; readonly phase: RemoteHostPhase; readonly at: string }
    | {
          readonly type: "progress";
          readonly hostingId: string;
          readonly phase: RemoteHostPhase;
          readonly description: string;
          readonly done: number;
          readonly total: number;
          readonly at: string;
      }
    | {
          readonly type: "log";
          readonly hostingId: string;
          readonly level: "INFO" | "WARNING" | "ERROR";
          readonly message: string;
          readonly at: string;
      }
    | {
          readonly type: "finished";
          readonly hostingId: string;
          readonly record: RemoteHostingRecord;
          readonly durationMs: number;
          readonly at: string;
      }
    | { readonly type: "failed"; readonly hostingId: string; readonly failure: RemoteFailure; readonly at: string };

export interface RemoteHostSuccess {
    readonly ok: true;
    readonly hostingId: string;
    readonly record: RemoteHostingRecord;
}

export interface RemoteHostFailureResult {
    readonly ok: false;
    readonly hostingId: string;
    readonly failure: RemoteFailure;
}

export type RemoteHostResult = RemoteHostSuccess | RemoteHostFailureResult;

export interface RemoteHostStopReport {
    readonly hostingId: string;
    readonly target: string;
    readonly containerRemoved: boolean;
    readonly filesRemoved: boolean;
    readonly notes: readonly string[];
}

export type RemoteHostStopResult =
    | { readonly ok: true; readonly report: RemoteHostStopReport }
    | { readonly ok: false; readonly failure: RemoteFailure };

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

export interface RemoteHostingOrchestratorOptions {
    /** Where renders live on this computer. A function, because it can be changed. */
    readonly storageDir: string | (() => string);
    /** Where hosting records live. Never inside a render's own folder. */
    readonly workRoot: string | (() => string);
    /** The engine to send. Only `enginePath` is used; no JDK is needed here. */
    readonly resolveEngine: () => Promise<ResolvedEngine>;
    readonly knownHostsFile: string;
    readonly userKnownHostsFile?: string | null;
    readonly ssh?: string;
    readonly scp?: string;
    readonly rsync?: string;
    readonly runner?: CommandRunner;
    readonly onEvent?: (event: RemoteHostEvent) => void;
    readonly transfer?: (target: RemoteTarget) => FileTransfer;
    readonly preflight?: (target: RemoteTarget, options: PreflightOptions) => Promise<PreflightReport>;
    /** The real network probe, or a fake. Only ever used for a `bindMode: "public"` target. */
    readonly probe?: PortProbe;
    /**
     * Verifies a loopback bind by asking the remote host itself, over the SSH connection
     * already open. Overridable so no test opens a socket or spawns a real `ssh`.
     */
    readonly probeLoopback?: (target: RemoteTarget, sshOptions: SshOptionsInput, port: number) => Promise<boolean>;
    readonly now?: () => Date;
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function sentence(error: unknown): string {
    if (error instanceof Error && error.message.length > 0) return error.message;
    const text = String(error);
    return text.length > 0 ? text : "That request could not be completed, and nothing said why.";
}

/** The map as the engine *inside the container* reads it - the world path replaced. */
function withContainerWorld(map: RenderMapRequest, paths: RemoteRenderPaths): RenderMapRequest {
    return { ...map, world: remoteWorldPath(paths, map.id) };
}

/**
 * Asks a machine already reached over SSH whether something answers on its own loopback.
 *
 * A raw `bash` TCP probe rather than `curl` or `wget`, because neither is guaranteed to be
 * on a minimal server and `/dev/tcp` is a bash builtin with nothing to install. `timeout 5`
 * bounds a connection that never completes; without it a firewall that drops rather than
 * refuses would hang this check for the SSH connection's own timeout.
 */
async function defaultProbeLoopback(
    sshOptions: SshOptionsInput,
    port: number,
    runner: CommandRunner,
    ssh: string,
): Promise<boolean> {
    const script = `timeout 5 bash -c 'exec 3<>/dev/tcp/127.0.0.1/${String(port)}' 2>/dev/null`;
    const result = await runner(ssh, sshScriptArguments(sshOptions, script), {});
    return result.ok;
}

/* -------------------------------------------------------------------------- */
/* The orchestrator                                                           */
/* -------------------------------------------------------------------------- */

export class RemoteHostingOrchestrator {
    private readonly options: RemoteHostingOrchestratorOptions;

    constructor(options: RemoteHostingOrchestratorOptions) {
        this.options = options;
    }

    /**
     * Publishes a map: stages, uploads, (re)starts the container, verifies, and records it.
     *
     * Also what "update" is. There is no separate resume-shaped codepath: a republish tears
     * down whatever container already answers to this name and starts a fresh one, and
     * `rsync`/`scp` only ever move what actually changed. A few seconds of downtime while the
     * old container stops and the new one binds is the honest cost of that simplicity, and
     * it is named as such in the docs rather than hidden behind a promise of zero downtime
     * this module does not keep.
     */
    async host(request: RemoteHostRequest): Promise<RemoteHostResult> {
        const target = request.target;
        const name = describeTarget(target);
        const hostingId = request.hostingId;
        const startedAt = this.clock().getTime();

        const firstMap = request.maps[0];
        if (request.maps.length === 0 || firstMap === undefined) {
            return this.fail(hostingId, failures.invalidTarget("Hosting a map needs at least one map."));
        }

        this.emit({ type: "started", hostingId, target: name, at: this.stamp() });
        this.phase(hostingId, "preflight");

        const sshOptions = this.sshOptions(target);
        const check = await (this.options.preflight ?? preflight)(target, {
            ...sshOptions,
            ...(this.options.ssh === undefined ? {} : { ssh: this.options.ssh }),
            ...(this.options.runner === undefined ? {} : { runner: this.options.runner }),
            ...(request.requiredBytes === undefined ? {} : { requiredBytes: request.requiredBytes }),
        });
        for (const line of check.checks) this.log(hostingId, line.ok ? "INFO" : "WARNING", line.message);
        if (!check.ok || check.workDir === null) {
            return this.fail(
                hostingId,
                check.failure ?? failures.remoteCommandFailed(name, "The preflight check", null, null),
            );
        }

        let engine: ResolvedEngine;
        try {
            engine = await this.options.resolveEngine();
        } catch (error) {
            return this.fail(hostingId, failures.invalidTarget(sentence(error)));
        }

        const paths = remotePaths(check.workDir, `host-${hostingId}`);
        const transfer = await this.pickTransfer(hostingId, target);
        const transferOptions = { onLine: (line: string) => this.log(hostingId, "INFO", line) };
        const mapIds = request.maps.map((map) => map.id);
        const workspace = renderWorkspace(this.storageDir(), request.renderId);
        const containerName = remoteHostingContainerName(hostingId);

        try {
            if (!(await this.exists(workspace.webRoot))) {
                return this.fail(
                    hostingId,
                    failures.invalidTarget(
                        `'${request.renderId}' has no rendered output on this computer at ${workspace.webRoot}. ` +
                            "Render it first, then host it.",
                    ),
                );
            }

            /* stage --------------------------------------------------------- */
            this.phase(hostingId, "staging");
            await transfer.makeRemoteDirectory(paths.dataDir, transferOptions);

            const localConfigDir = await this.localConfigStaging(hostingId);
            await writeEngineConfig({
                hostConfigDir: localConfigDir,
                engineDataDir: CONTAINER_DATA_DIR,
                engineWebRoot: CONTAINER_WEB_ROOT,
                maps: request.maps.map((map) => withContainerWorld(map, paths)),
                acceptDownload: true,
                createEngineDirectories: false,
                webServer: { port: REMOTE_HOSTING_CONTAINER_PORT, ip: "0.0.0.0" },
            });

            /* upload ---------------------------------------------------------- */
            this.phase(hostingId, "uploading");
            const total = request.maps.length + 3;
            let done = 0;

            this.progress(hostingId, "uploading", "Sending the engine", done, total);
            await transfer.uploadFile(engine.enginePath, paths.jarPath, transferOptions);
            done += 1;

            this.progress(hostingId, "uploading", "Sending the config", done, total);
            await transfer.uploadDirectory(localConfigDir, paths.configDir, transferOptions);
            done += 1;

            for (const map of request.maps) {
                this.progress(hostingId, "uploading", `Sending the world for '${map.id}'`, done, total);
                await transfer.uploadDirectory(map.world, remoteWorldPath(paths, map.id), transferOptions);
                done += 1;
            }

            this.progress(hostingId, "uploading", "Sending the rendered map", done, total);
            await transfer.uploadDirectory(workspace.webRoot, paths.webRoot, transferOptions);
            done += 1;

            /* replace + serve ------------------------------------------------ */
            this.phase(hostingId, "starting");
            await this.runCommand(this.options.ssh ?? "ssh", [
                ...sshArguments(sshOptions),
                remoteCommandLine(remoteHostingTeardownArguments(target, containerName)),
            ]);

            const run = remoteServeDockerRunArguments({
                target,
                paths,
                containerName,
                mapIds,
                publish: request.publish,
                ...(request.jvmArgs === undefined ? {} : { jvmArgs: request.jvmArgs }),
                ...(request.containerUser === undefined ? {} : { user: request.containerUser }),
                ...(request.memory === undefined ? {} : { memory: request.memory }),
            });
            const started = await this.runCommand(this.options.ssh ?? "ssh", [
                ...sshArguments(sshOptions),
                remoteCommandLine(run),
            ]);
            if (!started.ok) {
                return this.fail(
                    hostingId,
                    failures.remoteCommandFailed(
                        name,
                        "Starting the hosted map",
                        started.exitCode,
                        started.stderr || started.stdout,
                    ),
                );
            }

            /* verify -------------------------------------------------------- */
            this.phase(hostingId, "verifying");
            const verification = await this.verify(target, sshOptions, request.publish);
            for (const note of verification.notes) this.log(hostingId, "INFO", note);

            const record: RemoteHostingRecord = {
                version: 1,
                hostingId,
                renderId: request.renderId,
                target,
                containerName,
                remoteRoot: paths.root,
                mapIds,
                publish: request.publish,
                status: verification.verified ? "running" : "unknown",
                url: verification.url,
                verified: verification.verified,
                verifiedVia: verification.via,
                remoteFilesKept: true,
                startedAt: this.stampFrom(startedAt),
                lastCheckedAt: this.stamp(),
                notes: verification.notes,
            };
            await this.writeRecord(record);

            const durationMs = this.clock().getTime() - startedAt;
            this.phase(hostingId, "finished");
            this.emit({ type: "finished", hostingId, record, durationMs, at: this.stamp() });
            return { ok: true, hostingId, record };
        } catch (error) {
            const failure =
                error instanceof TransferError
                    ? failures.transferFailed(name, error.message, error.detail)
                    : failures.remoteCommandFailed(name, "Hosting this map", null, sentence(error));
            return this.fail(hostingId, failure);
        }
    }

    /** Re-checks whether an already-hosted map still answers, without transferring anything. */
    async refresh(hostingId: string): Promise<RemoteHostingRecord | null> {
        const saved = await this.readRecord(hostingId);
        if (saved === null) return null;
        const sshOptions = this.sshOptions(saved.target);
        const verification = await this.verify(saved.target, sshOptions, saved.publish);
        const refreshed: RemoteHostingRecord = {
            ...saved,
            status: verification.verified ? "running" : "unknown",
            url: verification.url,
            verified: verification.verified,
            verifiedVia: verification.via,
            lastCheckedAt: this.stamp(),
            notes: verification.notes,
        };
        await this.writeRecord(refreshed);
        return refreshed;
    }

    /**
     * Stops hosting: the container is torn down, and - unless the target says to keep a copy
     * there for debugging - the whole staging directory, world included, is removed too.
     *
     * The caller is expected to have already put this behind a super-confirmation gate: this
     * method performs the destructive action, it does not decide whether the person meant it.
     */
    async stopHosting(hostingId: string): Promise<RemoteHostStopResult> {
        const saved = await this.readRecord(hostingId);
        if (saved === null) {
            return {
                ok: false,
                failure: failures.invalidTarget(`There is no record of a hosted map called '${hostingId}'.`),
            };
        }
        const target = saved.target;
        const name = describeTarget(target);
        const notes: string[] = [];
        try {
            const sshOptions = this.sshOptions(target);
            const teardown = await this.runCommand(this.options.ssh ?? "ssh", [
                ...sshArguments(sshOptions),
                remoteCommandLine(remoteHostingTeardownArguments(target, saved.containerName)),
            ]);
            const containerRemoved = teardown.ok || /No such container/i.test(teardown.stderr);
            if (!containerRemoved) {
                return {
                    ok: false,
                    failure: failures.remoteCommandFailed(
                        name,
                        "Stopping the hosted map",
                        teardown.exitCode,
                        teardown.stderr,
                    ),
                };
            }

            let filesRemoved = false;
            if (target.keepRemoteFiles) {
                notes.push(
                    `${saved.remoteRoot} was left on ${target.host}, including a copy of the world, ` +
                        "because this target is set to keep its remote files.",
                );
            } else {
                const transfer = await this.pickTransfer(hostingId, target);
                try {
                    await transfer.removeRemoteDirectory(saved.remoteRoot);
                    filesRemoved = true;
                    notes.push(`${saved.remoteRoot} was removed from ${target.host}.`);
                } catch (error) {
                    notes.push(
                        `${saved.remoteRoot} could not be removed from ${target.host} and is still there: ${sentence(error)}`,
                    );
                }
            }

            await this.deleteRecord(hostingId);
            return {
                ok: true,
                report: { hostingId, target: name, containerRemoved, filesRemoved, notes },
            };
        } catch (error) {
            return {
                ok: false,
                failure: failures.remoteCommandFailed(name, "Stopping the hosted map", null, sentence(error)),
            };
        }
    }

    async records(): Promise<RemoteHostingRecord[]> {
        const root = this.workRoot();
        let names: string[];
        try {
            names = (await readdir(root, { withFileTypes: true }))
                .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
                .map((entry) => entry.name.replace(/\.json$/, ""));
        } catch {
            return [];
        }
        const found: RemoteHostingRecord[] = [];
        for (const name of names) {
            const record = await this.readRecord(name);
            if (record !== null) found.push(record);
        }
        return found.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
    }

    async readRecord(hostingId: string): Promise<RemoteHostingRecord | null> {
        try {
            const parsed: unknown = JSON.parse(await readFile(this.recordPath(hostingId), "utf8"));
            if (typeof parsed !== "object" || parsed === null) return null;
            return parsed as RemoteHostingRecord;
        } catch {
            return null;
        }
    }

    /* ------------------------------------------------------------------ */
    /* Verification                                                       */
    /* ------------------------------------------------------------------ */

    private async verify(
        target: RemoteTarget,
        sshOptions: SshOptionsInput,
        publish: RemoteHostingPublish,
    ): Promise<{ verified: boolean; url: string | null; via: "network" | "ssh-loopback" | null; notes: string[] }> {
        const notes: string[] = [];
        if (publish.bindMode === "public") {
            const probe = this.options.probe ?? tcpPortProbe;
            const answered = await probe(target.host, publish.hostPort, 5_000);
            if (answered) {
                return {
                    verified: true,
                    url: `http://${target.host}:${String(publish.hostPort)}/`,
                    via: "network",
                    notes: [`Connected to ${target.host}:${String(publish.hostPort)} from this computer.`],
                };
            }
            notes.push(
                `${target.host}:${String(publish.hostPort)} did not answer a connection from this computer. ` +
                    "The container may still be starting, or something between here and there is blocking " +
                    "the port; this is not reported as live until a connection actually succeeds.",
            );
            return { verified: false, url: null, via: null, notes };
        }

        const bindAddress = publishBindAddress(publish);
        const probeLoopback = this.options.probeLoopback ?? this.defaultLoopbackProbe();
        const answered = await probeLoopback(target, sshOptions, publish.hostPort);
        if (answered) {
            notes.push(
                `${target.host} answered on its own loopback (${bindAddress}:${String(publish.hostPort)}), ` +
                    "checked over the same SSH connection. It is not published to the network - reach it " +
                    `with an SSH tunnel, e.g. 'ssh -L ${String(publish.hostPort)}:127.0.0.1:${String(
                        publish.hostPort,
                    )} ${target.user}@${target.host}'.`,
            );
            return { verified: true, url: null, via: "ssh-loopback", notes };
        }
        notes.push(
            `${target.host} did not answer on its own loopback port ${String(publish.hostPort)}, checked ` +
                "over SSH. The container may still be starting.",
        );
        return { verified: false, url: null, via: null, notes };
    }

    private defaultLoopbackProbe(): (target: RemoteTarget, sshOptions: SshOptionsInput, port: number) => Promise<boolean> {
        const runner = this.options.runner ?? execFileCommandRunner;
        const ssh = this.options.ssh ?? "ssh";
        return (_target, sshOptions, port) => defaultProbeLoopback(sshOptions, port, runner, ssh);
    }

    /* ------------------------------------------------------------------ */
    /* Plumbing                                                           */
    /* ------------------------------------------------------------------ */

    private async pickTransfer(hostingId: string, target: RemoteTarget): Promise<FileTransfer> {
        const given = this.options.transfer;
        if (given !== undefined) return given(target);
        const choice = await chooseTransfer({
            ...this.sshOptions(target),
            ...(this.options.ssh === undefined ? {} : { ssh: this.options.ssh }),
            ...(this.options.rsync === undefined ? {} : { rsync: this.options.rsync }),
            ...(this.options.runner === undefined ? {} : { runner: this.options.runner }),
            scpTransfer: scpTransfer({
                ...this.sshOptions(target),
                ...(this.options.ssh === undefined ? {} : { ssh: this.options.ssh }),
                ...(this.options.scp === undefined ? {} : { scp: this.options.scp }),
                ...(this.options.runner === undefined ? {} : { runner: this.options.runner }),
            }),
            onLine: (line) => this.log(hostingId, "WARNING", line),
        });
        this.log(hostingId, "INFO", choice.message);
        return choice.transfer;
    }

    private sshOptions(target: RemoteTarget): SshOptionsInput {
        return {
            target,
            knownHostsFile: this.options.knownHostsFile,
            ...(this.options.userKnownHostsFile === undefined
                ? {}
                : { userKnownHostsFile: this.options.userKnownHostsFile }),
        };
    }

    private async runCommand(command: string, args: readonly string[]) {
        const runner = this.options.runner ?? execFileCommandRunner;
        return runner(command, args, {});
    }

    /** A scratch folder on this machine to build the config in before it is uploaded. */
    private async localConfigStaging(hostingId: string): Promise<string> {
        const dir = join(this.workRoot(), hostingId, "config-staging");
        await mkdir(dir, { recursive: true });
        return dir;
    }

    private storageDir(): string {
        const value = this.options.storageDir;
        return typeof value === "function" ? value() : value;
    }

    private workRoot(): string {
        const value = this.options.workRoot;
        return typeof value === "function" ? value() : value;
    }

    private recordPath(hostingId: string): string {
        return join(this.workRoot(), `${hostingId}.json`);
    }

    private async writeRecord(record: RemoteHostingRecord): Promise<void> {
        await mkdir(this.workRoot(), { recursive: true });
        await writeFile(this.recordPath(record.hostingId), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    }

    private async deleteRecord(hostingId: string): Promise<void> {
        await rm(this.recordPath(hostingId), { force: true });
    }

    private async exists(path: string): Promise<boolean> {
        try {
            await stat(path);
            return true;
        } catch {
            return false;
        }
    }

    private clock(): Date {
        return this.options.now?.() ?? new Date();
    }

    private stamp(): string {
        return this.clock().toISOString();
    }

    private stampFrom(epochMs: number): string {
        return new Date(epochMs).toISOString();
    }

    private emit(event: RemoteHostEvent): void {
        this.options.onEvent?.(event);
    }

    private phase(hostingId: string, phase: RemoteHostPhase): void {
        this.emit({ type: "phase", hostingId, phase, at: this.stamp() });
    }

    private log(hostingId: string, level: "INFO" | "WARNING" | "ERROR", message: string): void {
        this.emit({ type: "log", hostingId, level, message, at: this.stamp() });
    }

    private progress(hostingId: string, phase: RemoteHostPhase, description: string, done: number, total: number): void {
        this.emit({ type: "progress", hostingId, phase, description, done, total, at: this.stamp() });
    }

    private fail(hostingId: string, failure: RemoteFailure): RemoteHostResult {
        this.emit({ type: "failed", hostingId, failure, at: this.stamp() });
        return { ok: false, hostingId, failure };
    }
}
