/**
 * Handing a render to another machine, and reporting it as if it never left.
 *
 * The promise this file has to keep is narrow and specific: **the interface cannot tell**.
 * A remote render emits `RenderEvent` - the same union `render/orchestrator.ts` emits - so
 * the same progress bar, the same log pane, the same cancel button and the same failure
 * banner work with no knowledge that a network was involved. That is not achieved by
 * copying the event shapes; it is achieved by using them, and by running the container's
 * output through the same `RenderOutputTracker` the local path uses.
 *
 * ## The order of the steps is the design
 *
 * ```
 * 1  preflight     ssh, host key, Docker, disk. Nothing is sent until all four pass.
 * 2  stage         create <workDir>/<renderId>/ on the remote host
 * 3  config        written HERE with CONTAINER paths in it, then uploaded
 * 4  upload        the engine jar, then each world
 * 5  render        ssh -> docker run, output read line by line as it arrives
 * 6  collect       bring <web>/maps home into this render's own workspace
 * 7  clean up      remove <workDir>/<renderId>/ unless the target says to keep it
 * ```
 *
 * Preflight is first for the same reason consent is first in the local orchestrator: a
 * failure that costs nothing must cost nothing. Uploading six gigabytes and *then*
 * discovering the host has no Docker is a wasted evening, and the person would rightly
 * read it as the app not having bothered to look.
 *
 * ## What leaves this machine, said plainly
 *
 * The world folders named in the request, the engine jar, and a config file naming the maps.
 * Nothing else: not a token, not a key, not the app's settings, not any other world. What is
 * left behind afterwards is nothing, unless the target has `keepRemoteFiles` on - and then
 * the interface says so, because a copy of somebody's world sitting on a server is a fact
 * they are entitled to know rather than a detail.
 *
 * ## Cancelling stops the container, not the conversation
 *
 * `EngineProcess` from `runtime/` is what runs the SSH child, and it is given a
 * `stopContainer` that asks the **remote daemon** to stop the container by name. Killing the
 * local `ssh` would end the log and leave the JVM rendering into somebody's disk with
 * nothing holding a handle to it. Cleanup then runs on the way out, so a cancelled render
 * does not leave a staging directory behind either.
 */

import { mkdir, rm } from "node:fs/promises";
import { EngineProcess } from "../runtime/process.js";
import type { EngineLaunch } from "../runtime/plan.js";
import { writeEngineConfig } from "../runtime/config.js";
import { CONTAINER_DATA_DIR, CONTAINER_WEB_ROOT, containerWorldPath } from "../runtime/mounts.js";
import { execFileCommandRunner, type CommandRunner } from "../runtime/command.js";
import type { RenderMapRequest } from "../render/config.js";
import type {
    EngineDescription,
    RenderEvent,
    RenderRequest,
    ResolvedEngine,
} from "../render/orchestrator.js";
import type { RenderPhase, RenderSignal, RenderTaskProgress } from "../render/progress.js";
import { renderIdForWorld, renderWorkspace } from "../render/workspace.js";
import * as failures from "./failure.js";
import type { RemoteFailure } from "./failure.js";
import { preflight, type PreflightOptions, type PreflightReport } from "./preflight.js";
import {
    remoteContainerName,
    remoteDockerRunArguments,
    remotePaths,
    remoteStopArguments,
    remoteWorldPath,
    type RemoteRenderPaths,
} from "./plan.js";
import {
    remoteCommandLine,
    sshArguments,
    type SshOptionsInput,
} from "./ssh.js";
import { scpTransfer, TransferError, type FileTransfer } from "./transfer.js";
import { describeTarget, type RemoteTarget } from "./target.js";

/** What a remote render answers with. The same two shapes a local one answers with. */
export interface RemoteRenderSuccess {
    readonly ok: true;
    readonly renderId: string;
    readonly dataRoot: string;
    readonly mapIds: readonly string[];
    readonly durationMs: number;
    /** Where the tiles landed on this computer. */
    readonly storageRoot: string;
    /** True when the staging directory was deliberately left on the remote host. */
    readonly remoteFilesKept: boolean;
    readonly remoteDirectory: string;
}

export interface RemoteRenderFailureResult {
    readonly ok: false;
    readonly renderId: string;
    readonly failure: RemoteFailure;
}

export type RemoteRenderResult = RemoteRenderSuccess | RemoteRenderFailureResult;

export interface RemoteRenderOrchestratorOptions {
    /** Where renders are written on this computer. A function, because it can be changed. */
    readonly storageDir: string | (() => string);
    /** The engine to send. Only `enginePath` and the versions are used; no JDK is needed here. */
    readonly resolveEngine: () => Promise<ResolvedEngine>;
    /** Whether the Mojang download has been accepted. Read at the moment of the render. */
    readonly hasConsent: () => boolean;
    readonly onEvent?: (event: RenderEvent) => void;
    /** The app's own known_hosts. The only trust store this app ever writes to. */
    readonly knownHostsFile: string;
    /** The person's own file, read as well so keys they already trust need no second decision. */
    readonly userKnownHostsFile?: string | null;
    readonly ssh?: string;
    readonly scp?: string;
    readonly runner?: CommandRunner;
    /** Injected so a test can prove the whole flow with no server and no scp. */
    readonly transfer?: (target: RemoteTarget) => FileTransfer;
    /** Injected so a test can answer as any preflight state. */
    readonly preflight?: (target: RemoteTarget, options: PreflightOptions) => Promise<PreflightReport>;
    /** Injected so a test can drive the container's output without Docker or a network. */
    readonly spawn?: EngineProcessOptionsSpawn;
    readonly now?: () => Date;
}

type EngineProcessOptionsSpawn = NonNullable<ConstructorParameters<typeof EngineProcess>[0]["spawn"]>;

export interface RemoteRenderRequest extends RenderRequest {
    readonly target: RemoteTarget;
    /**
     * Bytes the render is expected to need on the remote disk.
     *
     * Passed to the preflight's disk check. Omitted, the check is skipped rather than
     * guessed at - a made-up requirement either refuses a host that would have worked or
     * passes one that will fill up halfway through.
     */
    readonly requiredBytes?: number;
    /** `--user` for the container, e.g. `1000:1000`. */
    readonly containerUser?: string | null;
    readonly memory?: string | null;
}

interface Active {
    readonly process: EngineProcess | null;
    cancelled: boolean;
    readonly controller: AbortController;
}

export class RemoteRenderOrchestrator {
    private readonly options: RemoteRenderOrchestratorOptions;
    private readonly active = new Map<string, { value: Active }>();

    constructor(options: RemoteRenderOrchestratorOptions) {
        this.options = options;
    }

    activeRenderIds(): string[] {
        return [...this.active.keys()];
    }

    /**
     * Asks a remote render to stop. False when nothing is running under that id.
     *
     * Returns immediately. What actually stops the container is the `stopContainer` handed
     * to {@link EngineProcess}, which asks the remote daemon by name; this only records the
     * intent and aborts anything that is still transferring.
     */
    cancel(renderId: string): boolean {
        const entry = this.active.get(renderId);
        if (entry === undefined) return false;
        entry.value.cancelled = true;
        entry.value.controller.abort();
        entry.value.process?.cancel();
        return true;
    }

    /** Runs one remote render. Never rejects. */
    async render(request: RemoteRenderRequest): Promise<RemoteRenderResult> {
        const target = request.target;
        const name = describeTarget(target);

        const firstMap = request.maps[0];
        if (request.maps.length === 0 || firstMap === undefined) {
            return this.fail("", failures.invalidTarget("A render needs at least one map."));
        }
        if (!this.options.hasConsent()) {
            // Said in the remote vocabulary, because the fix is the same local settings row
            // either way and the person has not left this app.
            return this.fail(
                "",
                failures.invalidTarget(
                    "Rendering needs the Minecraft client files, and the Mojang download has not been " +
                        "accepted. Accept it in Settings and start the render again.",
                ),
            );
        }

        const renderId = request.renderId ?? renderIdForWorld(firstMap.world);
        if (this.active.has(renderId)) {
            return this.fail(
                renderId,
                failures.invalidTarget(`A render of '${renderId}' is already in progress.`),
            );
        }

        const entry = { value: { process: null, cancelled: false, controller: new AbortController() } };
        this.active.set(renderId, entry);
        try {
            return await this.run(renderId, request, target, name, entry);
        } finally {
            this.active.delete(renderId);
        }
    }

    /* ------------------------------------------------------------------ */

    private async run(
        renderId: string,
        request: RemoteRenderRequest,
        target: RemoteTarget,
        name: string,
        entry: { value: Active },
    ): Promise<RemoteRenderResult> {
        const startedAt = Date.now();
        const workspace = renderWorkspace(this.storageDir(), renderId);
        const mapIds = request.maps.map((map) => map.id);
        const sshOptions = this.sshOptions(target);

        let engine: ResolvedEngine;
        try {
            engine = await this.options.resolveEngine();
        } catch (error) {
            return this.fail(renderId, failures.invalidTarget(describe(error)));
        }

        this.emit({
            type: "started",
            renderId,
            mapIds,
            engine: describeEngine(engine),
            at: this.timestamp(),
        });
        this.phase(renderId, "starting");

        /* 1: preflight. Nothing is sent until every check passes. ------------ */

        this.log(renderId, "INFO", `Checking ${name} before anything is sent.`);
        const check = await (this.options.preflight ?? preflight)(target, {
            ...sshOptions,
            ...(this.options.ssh === undefined ? {} : { ssh: this.options.ssh }),
            ...(this.options.runner === undefined ? {} : { runner: this.options.runner }),
            ...(request.requiredBytes === undefined ? {} : { requiredBytes: request.requiredBytes }),
        });
        for (const line of check.checks) {
            this.log(renderId, line.ok ? "INFO" : "WARNING", line.message);
        }
        if (!check.ok || check.workDir === null) {
            return this.fail(
                renderId,
                check.failure ?? failures.remoteCommandFailed(name, "The preflight check", null, null),
            );
        }
        if (entry.value.cancelled) return this.cancelled(renderId);

        const paths = remotePaths(check.workDir, renderId);
        const transfer = (this.options.transfer ?? ((chosen) => this.defaultTransfer(chosen)))(target);
        const transferOptions = {
            signal: entry.value.controller.signal,
            onLine: (line: string) => this.log(renderId, "INFO", line),
        };

        try {
            /* 2 & 3: stage, and write the config with CONTAINER paths in it. */

            await mkdir(workspace.configDir, { recursive: true });
            await mkdir(workspace.storageRoot, { recursive: true });
            await transfer.makeRemoteDirectory(paths.dataDir, transferOptions);
            await transfer.makeRemoteDirectory(paths.storageRoot, transferOptions);

            // Written here, read there. `createEngineDirectories: false` because these
            // paths only exist inside a container: a `mkdir` of `/bluemap/web` on Windows
            // quietly produces `C:\bluemap\web` and the render reports an empty output
            // folder nobody can find.
            await writeEngineConfig({
                hostConfigDir: workspace.configDir,
                engineDataDir: CONTAINER_DATA_DIR,
                engineWebRoot: CONTAINER_WEB_ROOT,
                maps: request.maps.map(withContainerWorld),
                acceptDownload: true,
                createEngineDirectories: false,
                ...(request.renderThreads === undefined ? {} : { renderThreads: request.renderThreads }),
                ...(request.metrics === undefined ? {} : { metrics: request.metrics }),
            });

            /* 4: the jar, then each world. ---------------------------------- */

            this.progress(renderId, "starting", "Sending the engine", 0, mapIds.length + 1);
            await transfer.uploadFile(engine.enginePath, paths.jarPath, transferOptions);
            await transfer.uploadDirectory(workspace.configDir, paths.configDir, transferOptions);

            for (const [index, map] of request.maps.entries()) {
                if (entry.value.cancelled) return await this.cancelledAfter(renderId, target, paths, transfer);
                this.progress(
                    renderId,
                    "starting",
                    `Sending the world for '${map.id}' to ${target.host}`,
                    index + 1,
                    mapIds.length + 1,
                );
                await transfer.uploadDirectory(
                    map.world,
                    remoteWorldPath(paths, map.id),
                    transferOptions,
                );
            }

            if (entry.value.cancelled) return await this.cancelledAfter(renderId, target, paths, transfer);

            /* 5: render. --------------------------------------------------- */

            const container = remoteContainerName(renderId);
            const run = remoteDockerRunArguments({
                target,
                paths,
                containerName: container,
                mapIds,
                ...(request.jvmArgs === undefined ? {} : { jvmArgs: request.jvmArgs }),
                ...(request.force === undefined ? {} : { force: request.force }),
                ...(request.fixEdges === undefined ? {} : { fixEdges: request.fixEdges }),
                ...(request.containerUser === undefined ? {} : { user: request.containerUser }),
                ...(request.memory === undefined ? {} : { memory: request.memory }),
            });

            // An `EngineLaunch` whose command is `ssh`. Everything downstream - the line
            // reader, the phase tracker, the progress parser, the cancellation - is then the
            // code the local path uses, unchanged, which is what makes the promise at the
            // top of this file true rather than aspirational.
            const launch: EngineLaunch = {
                mode: "docker",
                role: "render",
                command: this.options.ssh ?? "ssh",
                args: [...sshArguments(sshOptions), remoteCommandLine(run)],
                cwd: workspace.root,
                mounts: [],
                containerName: container,
                engineConfigDir: "/bluemap/config",
                hostConfigDir: workspace.configDir,
                url: null,
                hostPort: null,
            };

            this.log(renderId, "INFO", `Starting the render container '${container}' on ${name}.`);
            const process = new EngineProcess({
                launch,
                onSignal: (signal) => this.consume(renderId, signal),
                ...(this.options.spawn === undefined ? {} : { spawn: this.options.spawn }),
                stopContainer: async (containerName) => {
                    // The remote daemon, by name. Killing the local ssh would end the log
                    // and leave the container running on somebody else's machine.
                    await this.runCommand(
                        this.options.ssh ?? "ssh",
                        [
                            ...sshArguments(sshOptions),
                            remoteCommandLine(remoteStopArguments(target, containerName)),
                        ],
                    );
                },
            });
            entry.value = { ...entry.value, process };
            if (entry.value.cancelled) process.cancel();

            const result = await process.start();

            if (result.cancelled || entry.value.cancelled) {
                return await this.cancelledAfter(renderId, target, paths, transfer);
            }
            if (result.spawnError !== null) {
                return await this.failAfter(
                    renderId,
                    target,
                    paths,
                    transfer,
                    failures.remoteCommandFailed(
                        name,
                        "The render container",
                        null,
                        result.diagnostics.join("\n") || result.spawnError,
                    ),
                );
            }
            if (result.exitCode !== 0 || !result.upToDate) {
                return await this.failAfter(
                    renderId,
                    target,
                    paths,
                    transfer,
                    failures.renderFailed(
                        name,
                        result.exitCode,
                        result.diagnostics.join("\n") || result.stderr.join("\n") || null,
                    ),
                );
            }

            /* 6: bring the map home. --------------------------------------- */

            this.phase(renderId, "stopping");
            this.log(renderId, "INFO", `Fetching the rendered map back from ${name}.`);
            this.progress(renderId, "stopping", "Fetching the rendered map", 0, 1);
            // Into `web/`, so the copy lands as `web/maps` - the exact layout a local
            // render produces, which is what lets the viewer mount either one.
            await rm(workspace.storageRoot, { recursive: true, force: true });
            await transfer.downloadDirectory(paths.storageRoot, workspace.webRoot, transferOptions);
            this.progress(renderId, "stopping", "Fetching the rendered map", 1, 1);

            /* 7: clean up. -------------------------------------------------- */

            const kept = await this.cleanUp(renderId, target, paths, transfer);

            const durationMs = Date.now() - startedAt;
            this.phase(renderId, "finished");
            this.emit({
                type: "finished",
                renderId,
                dataRoot: workspace.storageRoot,
                mapIds,
                engine: describeEngine(engine),
                durationMs,
                at: this.timestamp(),
            });
            return {
                ok: true,
                renderId,
                dataRoot: workspace.storageRoot,
                storageRoot: workspace.storageRoot,
                mapIds,
                durationMs,
                remoteFilesKept: kept,
                remoteDirectory: paths.root,
            };
        } catch (error) {
            if (entry.value.cancelled) {
                return await this.cancelledAfter(renderId, target, paths, transfer);
            }
            const failure =
                error instanceof TransferError
                    ? failures.transferFailed(name, error.message, error.detail)
                    : failures.remoteCommandFailed(name, "The remote render", null, describe(error));
            return await this.failAfter(renderId, target, paths, transfer, failure);
        }
    }

    /* ------------------------------------------------------------------ */

    /**
     * Removes the staging directory, and says whether it did.
     *
     * Never throws. A cleanup that fails must not turn a finished render into a failed one -
     * the map is already home - so the failure is reported as a warning naming the directory
     * that is still there, which is exactly what somebody needs to remove it by hand.
     */
    private async cleanUp(
        renderId: string,
        target: RemoteTarget,
        paths: RemoteRenderPaths,
        transfer: FileTransfer,
    ): Promise<boolean> {
        if (target.keepRemoteFiles) {
            this.log(
                renderId,
                "WARNING",
                `${paths.root} was left on ${target.host}, including a copy of the world, because ` +
                    "this target is set to keep its remote files.",
            );
            return true;
        }
        try {
            await transfer.removeRemoteDirectory(paths.root);
            this.log(renderId, "INFO", `${paths.root} was removed from ${target.host}.`);
            return false;
        } catch (error) {
            this.log(
                renderId,
                "WARNING",
                `${paths.root} could not be removed from ${target.host} and is still there: ` +
                    `${describe(error)}`,
            );
            return true;
        }
    }

    private async cancelledAfter(
        renderId: string,
        target: RemoteTarget,
        paths: RemoteRenderPaths,
        transfer: FileTransfer,
    ): Promise<RemoteRenderResult> {
        await this.cleanUp(renderId, target, paths, transfer);
        return this.cancelled(renderId);
    }

    private async failAfter(
        renderId: string,
        target: RemoteTarget,
        paths: RemoteRenderPaths,
        transfer: FileTransfer,
        failure: RemoteFailure,
    ): Promise<RemoteRenderResult> {
        await this.cleanUp(renderId, target, paths, transfer);
        return this.fail(renderId, failure);
    }

    private cancelled(renderId: string): RemoteRenderResult {
        this.emit({ type: "cancelled", renderId, at: this.timestamp() });
        return { ok: false, renderId, failure: failures.cancelled() };
    }

    private fail(renderId: string, failure: RemoteFailure): RemoteRenderResult {
        this.emit({ type: "failed", renderId, failure, at: this.timestamp() });
        return { ok: false, renderId, failure };
    }

    private defaultTransfer(target: RemoteTarget): FileTransfer {
        return scpTransfer({
            ...this.sshOptions(target),
            ...(this.options.ssh === undefined ? {} : { ssh: this.options.ssh }),
            ...(this.options.scp === undefined ? {} : { scp: this.options.scp }),
            ...(this.options.runner === undefined ? {} : { runner: this.options.runner }),
        });
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

    private async runCommand(command: string, args: readonly string[]): Promise<void> {
        const runner = this.options.runner ?? execFileCommandRunner;
        await runner(command, args, {});
    }

    private storageDir(): string {
        const value = this.options.storageDir;
        return typeof value === "function" ? value() : value;
    }

    private timestamp(): string {
        return (this.options.now?.() ?? new Date()).toISOString();
    }

    private emit(event: RenderEvent): void {
        this.options.onEvent?.(event);
    }

    private phase(renderId: string, phase: RenderPhase): void {
        this.emit({ type: "phase", renderId, phase, at: this.timestamp() });
    }

    private log(renderId: string, level: "INFO" | "WARNING" | "ERROR", message: string): void {
        this.emit({ type: "log", renderId, level, message, at: this.timestamp() });
    }

    /**
     * A transfer step, reported on the render's own progress channel.
     *
     * The task kind is `unknown` and the description says what is happening in words,
     * because upstream's vocabulary has no name for "sending a world over a wire". The
     * percentage is honest about what it measures: files staged, not bytes moved - `scp`
     * does not tell us the second, and inventing it would be a bar that lies.
     */
    private progress(
        renderId: string,
        phase: RenderPhase,
        description: string,
        done: number,
        total: number,
    ): void {
        const task: RenderTaskProgress = {
            kind: "unknown",
            mapId: null,
            description,
            percent: total <= 0 ? 0 : Math.min(100, (done / total) * 100),
            etaSeconds: null,
            etaText: null,
        };
        this.emit({ type: "progress", renderId, phase, task, at: this.timestamp() });
    }

    /** The container's own output, turned into the events a local render emits. */
    private consume(renderId: string, signal: RenderSignal): void {
        switch (signal.kind) {
            case "log":
                this.emit({
                    type: "log",
                    renderId,
                    level: signal.line.level,
                    message: signal.line.message,
                    at: this.timestamp(),
                });
                break;
            case "phase":
                this.phase(renderId, signal.phase);
                break;
            case "progress":
                this.emit({
                    type: "progress",
                    renderId,
                    phase: "rendering",
                    task: signal.progress,
                    at: this.timestamp(),
                });
                break;
            case "setup-problem":
                this.log(renderId, "ERROR", signal.text);
                break;
            default:
                break;
        }
    }
}

/**
 * The map as the *engine inside the container* will read it.
 *
 * The world path is replaced with the container path, because that is the only path that
 * exists where the config is read. Everything else - the id, the dimension, the name, a
 * supplied HOCON body - travels unchanged and is validated by `runtime/config.ts`, which is
 * the same validation the local path runs.
 */
function withContainerWorld(map: RenderMapRequest): RenderMapRequest {
    return { ...map, world: containerWorldPath(map.id) };
}

function describeEngine(engine: ResolvedEngine): EngineDescription {
    return {
        id: engine.engine,
        label: `BlueMap engine (Java) ${engine.engineVersion} in a container on a remote host`,
        version: engine.engineVersion,
        javaVersion: null,
    };
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
