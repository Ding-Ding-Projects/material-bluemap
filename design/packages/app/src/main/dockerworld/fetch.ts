/**
 * Getting a world out of Docker and into a folder this app can render.
 *
 * Ties `resolve.ts` (which mount, which route) to `copy.ts` (how the bytes actually move)
 * and adds the two things neither of those owns: the running-container safety gate, and
 * cancellation. Every outcome is a value - the fetcher never rejects, matching
 * `worldsource/fetcher.ts`'s own promise and for the same reason: a bare `Error` with a
 * stack in it gives an interface nothing to show a person.
 *
 * ## Local daemon vs. a remote one over SSH
 *
 * Nothing here spawns `ssh` or knows what a `RemoteTarget` is - that stays the SSH render
 * lane's own concern. What this module takes instead is the *result* of that lane's work:
 * a {@link CommandRunner} (local by default, or `sshCommandRunner(...)` for a remote host)
 * and, when `remote` is true, a {@link FileTransfer} (rsync-when-available, scp otherwise)
 * to bring bytes back. That is the same seam `runtime/docker.ts` already proved out for
 * reading a remote daemon's *state*; this reuses it for reading a remote daemon's *data*.
 *
 * ## What a cancellation leaves behind
 *
 * Whatever was already written to `destination` stays there. Every copy in this module is
 * additive-only (see `copy.ts`), so a cancelled fetch never corrupts existing good data -
 * it simply leaves the destination partially updated, exactly where the next fetch's
 * incremental comparison will pick back up. A staging directory this fetch created for
 * itself is still removed on the way out, cancelled or not: it holds nothing a person asked
 * to keep.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { locateWorld, WorldValidationError } from "@material-bluemap/render-actions";
import { execFileCommandRunner, type CommandRunner } from "../runtime/command.js";
import type { FileTransfer } from "../remote/transfer.js";
import * as failures from "./failure.js";
import type { DockerWorldFailure } from "./failure.js";
import { copyRemoteBindMount, dockerCopyToStaging, localIncrementalCopy, volumeCopyToStaging } from "./copy.js";
import { livenessWarning, remoteDirectoryExists, resolveContainerMount, resolveVolume } from "./resolve.js";
import type { DockerWorldCandidate } from "./resolve.js";

export type DockerSourceRequest =
    | { readonly kind: "container"; readonly containerId: string; readonly mountDestination: string }
    | { readonly kind: "volume"; readonly volumeName: string };

export interface DockerWorldFetchRequest {
    readonly source: DockerSourceRequest;
    /** The local folder the world lands in. Created if it does not exist. */
    readonly destination: string;
    /**
     * True to fetch a live world anyway, having read {@link DockerWorldCandidate.running}'s
     * warning. False or omitted refuses - see `failure.ts`'s `liveWorldNotAcknowledged`.
     */
    readonly acknowledgeLiveRisk?: boolean;
    /** The world's dimension, for the post-copy world check. Defaults to the overworld. */
    readonly dimension?: string;
}

export type DockerWorldEvent =
    | { readonly type: "started"; readonly fetchId: string; readonly route: string; readonly at: string }
    | { readonly type: "log"; readonly fetchId: string; readonly level: "info" | "warning"; readonly message: string; readonly at: string }
    | { readonly type: "finished"; readonly fetchId: string; readonly filesCopied: number; readonly filesUnchanged: number; readonly at: string }
    | { readonly type: "failed"; readonly fetchId: string; readonly failure: DockerWorldFailure; readonly at: string }
    | { readonly type: "cancelled"; readonly fetchId: string; readonly at: string };

export type DockerWorldFetchResult =
    | { readonly ok: true; readonly fetchId: string; readonly filesCopied: number; readonly filesUnchanged: number }
    | { readonly ok: false; readonly fetchId: string; readonly failure: DockerWorldFailure };

export interface DockerWorldFetcherOptions {
    /** Local by default. Pass `sshCommandRunner(...)` to reach a remote Linux Docker host. */
    readonly runner?: CommandRunner;
    /**
     * True when `runner` reaches a remote host rather than this machine.
     *
     * A separate flag rather than inferred from "a runner was given": a test, or a caller
     * that simply wants to name its own local `docker` binary, hands in a `runner` that is
     * still local, and inferring "remote" from its mere presence would demand a
     * `FileTransfer` and a staging path neither of them has any use for.
     */
    readonly remote?: boolean;
    /** How bytes come back from a remote host. Required whenever `remote` is true. */
    readonly transfer?: FileTransfer;
    /**
     * Where `docker cp`/the helper container stage, on the side `runner` executes on.
     *
     * Required for a container or volume copy when `runner` is remote - this module will
     * not invent a path on somebody else's server. Local fetches default to a temp
     * directory of their own, cleaned up whether the fetch succeeds or fails.
     */
    readonly stagingPath?: string;
    readonly docker?: string;
    readonly image?: string;
    readonly onEvent?: (event: DockerWorldEvent) => void;
    readonly now?: () => Date;
}

export class DockerWorldFetcher {
    private readonly options: DockerWorldFetcherOptions;
    private readonly active = new Map<string, AbortController>();

    constructor(options: DockerWorldFetcherOptions = {}) {
        this.options = options;
    }

    activeFetchIds(): string[] {
        return [...this.active.keys()];
    }

    cancel(fetchId: string): boolean {
        const controller = this.active.get(fetchId);
        if (controller === undefined) return false;
        controller.abort();
        return true;
    }

    /** What this source offers, and whether it is safe to read right now - without copying anything. */
    async inspect(source: DockerSourceRequest): Promise<{ readonly ok: true; readonly candidate: DockerWorldCandidate } | { readonly ok: false; readonly failure: DockerWorldFailure }> {
        const resolved =
            source.kind === "container"
                ? await resolveContainerMount(source.containerId, source.mountDestination, this.resolveOptions())
                : await resolveVolume(source.volumeName, this.resolveOptions());
        return resolved.ok ? { ok: true, candidate: resolved.value } : { ok: false, failure: resolved.failure };
    }

    async fetch(request: DockerWorldFetchRequest): Promise<DockerWorldFetchResult> {
        const fetchId = dockerWorldFetchId(request.source);
        if (this.active.has(fetchId)) {
            return this.fail(fetchId, failures.invalidRequest(`A fetch of '${fetchId}' is already running.`));
        }

        const resolved = await this.inspect(request.source);
        if (!resolved.ok) return this.fail(fetchId, resolved.failure);
        const candidate = resolved.candidate;

        const warning = livenessWarning(candidate);
        if (warning !== null && request.acknowledgeLiveRisk !== true) {
            return this.fail(fetchId, failures.liveWorldNotAcknowledged(candidate.containerName ?? "The container"));
        }

        const controller = new AbortController();
        this.active.set(fetchId, controller);
        try {
            return await this.run(fetchId, request, candidate, warning, controller);
        } finally {
            this.active.delete(fetchId);
        }
    }

    private async run(
        fetchId: string,
        request: DockerWorldFetchRequest,
        candidate: DockerWorldCandidate,
        warning: string | null,
        controller: AbortController,
    ): Promise<DockerWorldFetchResult> {
        this.emit({ type: "started", fetchId, route: candidate.route, at: this.timestamp() });
        if (warning !== null) {
            this.emit({ type: "log", fetchId, level: "warning", message: warning, at: this.timestamp() });
        }

        let staging: string | null = null;
        try {
            const result = await this.copy(fetchId, request, candidate, controller, (path) => {
                staging = path;
            });
            controller.signal.throwIfAborted();

            // Proves the destination is actually a Minecraft world. A `WorldValidationError`
            // here is caught below and reported as `not-a-world` rather than left to surface
            // as an unrelated exception three steps downstream, in the render itself.
            await locateWorld(request.destination, request.dimension ?? "overworld");

            this.emit({
                type: "finished",
                fetchId,
                filesCopied: result.filesCopied,
                filesUnchanged: result.filesUnchanged,
                at: this.timestamp(),
            });
            return { ok: true, fetchId, filesCopied: result.filesCopied, filesUnchanged: result.filesUnchanged };
        } catch (error) {
            if (controller.signal.aborted) {
                this.emit({ type: "cancelled", fetchId, at: this.timestamp() });
                return { ok: false, fetchId, failure: failures.cancelled() };
            }
            const failure = this.describe(error, request.destination);
            return this.fail(fetchId, failure);
        } finally {
            if (staging !== null && this.options.stagingPath === undefined) {
                await rm(staging, { recursive: true, force: true }).catch(() => undefined);
            }
        }
    }

    private async copy(
        fetchId: string,
        request: DockerWorldFetchRequest,
        candidate: DockerWorldCandidate,
        controller: AbortController,
        onStaging: (path: string) => void,
    ): Promise<{ readonly filesCopied: number; readonly filesUnchanged: number }> {
        const remote = this.options.remote === true;

        if (candidate.route === "bind-direct") {
            if (candidate.hostPath === null) {
                throw new Error("resolve.ts promised a host path for a bind-direct route and did not supply one.");
            }
            if (remote) {
                const transfer = this.options.transfer;
                if (transfer === undefined) {
                    throw copyFailure("A remote Docker host was given without a way to bring files back.");
                }
                this.emit({ type: "log", fetchId, level: "info", message: `Fetching ${candidate.hostPath} directly.`, at: this.timestamp() });
                await copyRemoteBindMount(transfer, candidate.hostPath, request.destination, undefined, controller.signal);
                // A remote transfer does not report a copied/unchanged split the way the
                // local incremental copy does - rsync and scp both report lines, not counts
                // this module can total honestly. Reporting zero for both would read as
                // "nothing happened"; reporting an unknown split plainly is more honest than
                // inventing a number.
                return { filesCopied: -1, filesUnchanged: -1 };
            }
            this.emit({ type: "log", fetchId, level: "info", message: `Fetching ${candidate.hostPath} directly.`, at: this.timestamp() });
            return await localIncrementalCopy(candidate.hostPath, request.destination, undefined, controller.signal);
        }

        const staging = await this.stagingDirectory(fetchId);
        onStaging(staging);
        const runner = this.runnerFor();
        const docker = this.options.docker;

        const readFailure =
            candidate.route === "container-copy"
                ? await dockerCopyToStaging(candidate.containerId as string, candidate.containerPath, staging, {
                      runner,
                      ...(docker === undefined ? {} : { docker }),
                  })
                : await volumeCopyToStaging(candidate.volumeName as string, staging, {
                      runner,
                      ...(docker === undefined ? {} : { docker }),
                      ...(this.options.image === undefined ? {} : { image: this.options.image }),
                  });
        if (readFailure !== null) throw new StagedFailure(readFailure);
        controller.signal.throwIfAborted();

        this.emit({ type: "log", fetchId, level: "info", message: `Placing ${staging} into ${request.destination}.`, at: this.timestamp() });

        if (remote) {
            const transfer = this.options.transfer;
            if (transfer === undefined) throw copyFailure("A remote Docker host was given without a way to bring files back.");
            await copyRemoteBindMount(transfer, staging, request.destination, undefined, controller.signal);
            return { filesCopied: -1, filesUnchanged: -1 };
        }
        return await localIncrementalCopy(staging, request.destination, undefined, controller.signal);
    }

    private async stagingDirectory(fetchId: string): Promise<string> {
        if (this.options.stagingPath !== undefined) return this.options.stagingPath;
        if (this.options.remote === true) {
            throw copyFailure(
                "A remote Docker host needs an explicit staging directory on that host; none was given.",
            );
        }
        return await mkdtemp(join(tmpdir(), `mb-dockerworld-${sanitise(fetchId)}-`));
    }

    private resolveOptions(): { readonly runner?: CommandRunner; readonly docker?: string; readonly directoryExists?: (path: string) => Promise<boolean> } {
        const runner = this.options.runner;
        const remote = this.options.remote === true;
        return {
            ...(runner === undefined ? {} : { runner }),
            ...(this.options.docker === undefined ? {} : { docker: this.options.docker }),
            ...(remote && runner !== undefined ? { directoryExists: remoteDirectoryExists(runner) } : {}),
        };
    }

    private runnerFor(): CommandRunner {
        return this.options.runner ?? execFileCommandRunner;
    }

    private emit(event: DockerWorldEvent): void {
        this.options.onEvent?.(event);
    }

    private timestamp(): string {
        return (this.options.now?.() ?? new Date()).toISOString();
    }

    private fail(fetchId: string, failure: DockerWorldFailure): DockerWorldFetchResult {
        this.emit({ type: "failed", fetchId, failure, at: this.timestamp() });
        return { ok: false, fetchId, failure };
    }

    private describe(error: unknown, destination: string): DockerWorldFailure {
        if (error instanceof StagedFailure) return error.failure;
        if (error instanceof CopyFailure) return failures.copyFailed(error.message);
        if (error instanceof WorldValidationError) return failures.notAWorld(destination, error.message);
        const message = error instanceof Error ? error.message : String(error);
        return failures.copyFailed("The copy failed.", message);
    }
}

/** A thin `Error` carrying an already-typed {@link DockerWorldFailure}, so `describe` can recover it exactly. */
class StagedFailure extends Error {
    readonly failure: DockerWorldFailure;
    constructor(failure: DockerWorldFailure) {
        super(failure.message);
        this.name = "StagedFailure";
        this.failure = failure;
    }
}

class CopyFailure extends Error {}

function copyFailure(message: string): CopyFailure {
    return new CopyFailure(message);
}

/** The stable id a fetch of this source is tracked under - deterministic, so a caller can compute it before starting one. */
export function dockerWorldFetchId(source: DockerSourceRequest): string {
    return source.kind === "container" ? `container:${source.containerId}:${source.mountDestination}` : `volume:${source.volumeName}`;
}

function sanitise(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60);
}
