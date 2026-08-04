/**
 * Picking a containerised render back up after the app that started it went away.
 *
 * ## The promise, which is the same promise the remote path makes
 *
 * **The interface cannot tell.** A reattached render emits `RenderEvent` - the same union
 * `render/orchestrator.ts` emits - so it appears in the same list, moves the same bar,
 * writes into the same log pane and is stopped by the same button. That is not achieved by
 * copying the event shapes; it is achieved by using them, and by reading the container's
 * output through the same `EngineProcess` and the same `RenderOutputTracker`. A second
 * reporting path would mean a render one half of the interface could see and the other
 * could not stop.
 *
 * ## What is actually different about a container, and why any of this is needed
 *
 * `render/runner.ts` refuses to put a shell between itself and the JVM so that a killed app
 * cannot leave an orphan. Docker re-creates that orphan by a different route and there is
 * no way to refuse it: `docker run` is a **client**, the daemon owns the container, and the
 * app closing closes the client only. The render carries on into a bind-mounted folder with
 * nobody reading its output.
 *
 * So the app writes the container's name down before it starts one (`handoff.ts`), and on
 * the next launch asks the daemon what became of each name it knows. Three answers, three
 * different things to do, and `attach.ts` turns each into a sentence:
 *
 * ```
 * still running   attach: stream its log from the first line, report it as a live render
 * over           collect: its output is on disk either way; bring it home and finish
 * no answer       neither: the daemon did not speak, so nothing is assumed or discarded
 * ```
 *
 * ## Local and remote are the same problem
 *
 * A container on this computer and a container on a Linux box over SSH differ in exactly
 * one thing: which command runner reaches the daemon, and therefore which `EngineLaunch`
 * streams the log. That is {@link ContainerAccess}, and it is the only thing either mode
 * supplies. Everything else on this page - the decision, the events, the cancellation, the
 * ownership - is written once.
 */

import { stat } from "node:fs/promises";
import type { RenderFailure } from "../render/failure.js";
import type { RenderEvent } from "../render/orchestrator.js";
import type { RenderPhase, RenderSignal } from "../render/progress.js";
import { execFileCommandRunner, type CommandRunner } from "./command.js";
import {
    attachArguments,
    decideReattach,
    inspectContainer,
    listAppContainers,
    type ContainerInspection,
    type ContainerState,
    type ReattachAction,
} from "./attach.js";
import type { ContainerHandoff, ContainerHandoffStore, ContainerMode } from "./handoff.js";
import { stopContainerArguments, type EngineLaunch } from "./plan.js";
import { EngineProcess, type EngineProcessOptions } from "./process.js";

/** The prefix `containerName` is called with for a render this app starts. */
export const CONTAINER_PREFIX = "material-bluemap";

/** What one collection did, or honestly did not do. */
export interface CollectReport {
    readonly ok: boolean;
    /** One sentence for the log. Names the directory when there is one to name. */
    readonly message: string;
}

/**
 * Everything a mode has to supply to have its containers reattached.
 *
 * Four small methods, none of which knows anything about renders. That is the seam: a test
 * hands in an object with four functions and exercises every path on this page - a running
 * container, one that finished while the app was away, one the daemon no longer has, a
 * cancel that reaches a reattached container - with no Docker, no SSH and no network.
 */
export interface ContainerAccess {
    /** The machine in words: `this computer`, or `renderer@host:2222`. */
    describe(): string;
    /** Asks the daemon about one container. Never rejects. */
    inspect(name: string): Promise<ContainerInspection>;
    /** The launch that streams a still-running container's output. */
    attachLaunch(record: ContainerHandoff): EngineLaunch;
    /** Asks the daemon to stop the container, politely. Never rejects. */
    stop(name: string): Promise<void>;
    /** Brings whatever the container wrote onto this computer. Never rejects. */
    collect(record: ContainerHandoff): Promise<CollectReport>;
    /** Removes the staging directory when the mode has one. Never rejects. */
    cleanUp?(record: ContainerHandoff): Promise<CollectReport>;
}

export interface LocalContainerAccessOptions {
    readonly docker?: string;
    readonly runner?: CommandRunner;
    /** Injected so a test can answer for a directory without one existing. */
    readonly exists?: (path: string) => Promise<boolean>;
}

/**
 * A container on the daemon on this computer.
 *
 * `collect` copies nothing, and that is the whole point of a bind mount: the container has
 * been writing tiles straight into `<workspace>/web/maps` for the entire render, so there
 * is never anything to fetch. What it does instead is *check*, because "the output folder
 * is not there" is the one case where the honest answer is that this render cannot be
 * carried on - somebody deleted it, or the workspace moved - and reporting a finished
 * render over a missing folder would send them to a viewer with nothing in it.
 */
export function localContainerAccess(options: LocalContainerAccessOptions = {}): ContainerAccess {
    const docker = options.docker ?? "docker";
    const runner = options.runner ?? execFileCommandRunner;
    const exists = options.exists ?? directoryExists;

    return {
        describe: () => "this computer",
        inspect: (name) => inspectContainer(name, { docker, runner }),
        attachLaunch: (record) => ({
            mode: "docker",
            role: "render",
            command: record.docker === "" ? docker : record.docker,
            args: attachArguments(record.containerName),
            cwd: record.cwd,
            mounts: [],
            containerName: record.containerName,
            engineConfigDir: "/bluemap/config",
            hostConfigDir: record.cwd,
            url: null,
            hostPort: null,
        }),
        async stop(name): Promise<void> {
            await runner(docker, stopContainerArguments(name), {});
        },
        async collect(record): Promise<CollectReport> {
            if (await exists(record.storageRoot)) {
                return {
                    ok: true,
                    message: `The tiles are in ${record.storageRoot}, where the container wrote them.`,
                };
            }
            return {
                ok: false,
                message:
                    `${record.storageRoot} is not there, so there is nothing of this render left to ` +
                    "pick up. The folder was removed, or the map storage directory was changed " +
                    "since it started. Rendering it again is the only way forward, and it will " +
                    "start from nothing.",
            };
        },
    };
}

/**
 * The local daemon's list of this app's containers, ready to hand to the reattacher.
 *
 * A function rather than the reattacher calling `listAppContainers` itself, because the
 * reattacher must never assume there *is* a local daemon: a build configured only for a
 * remote host would otherwise report "docker is not installed" as a scan failure on every
 * launch, which is a warning about a thing nobody asked for.
 */
export function localContainerList(
    options: LocalContainerAccessOptions & { readonly prefix?: string } = {},
): () => Promise<readonly string[]> {
    const runner = options.runner ?? execFileCommandRunner;
    const prefix = options.prefix ?? CONTAINER_PREFIX;
    return async () =>
        await listAppContainers(prefix, {
            runner,
            ...(options.docker === undefined ? {} : { docker: options.docker }),
        });
}

async function directoryExists(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

/* -------------------------------------------------------------------------- */
/* What the interface is offered                                              */
/* -------------------------------------------------------------------------- */

/**
 * One container this app started and is no longer watching.
 *
 * Plain data, because it crosses IPC. It carries the decision as a code *and* as a
 * sentence, the same way `render/failure.ts` splits the two: an interface that matches on
 * prose breaks the first time a sentence is improved.
 */
export interface ContainerOffer {
    readonly renderId: string;
    readonly containerName: string;
    readonly mode: ContainerMode;
    /** The machine in words, so a person with two renders knows which one this is. */
    readonly where: string;
    readonly mapIds: readonly string[];
    readonly startedAt: string;
    readonly state: ContainerState;
    readonly action: ReattachAction;
    /** True when {@link ContainerReattacher.resume} will act rather than refuse. */
    readonly canResume: boolean;
    /** True when the honest advice is to start the render again instead. */
    readonly suggestRestart: boolean;
    readonly message: string;
}

/** A container named the way this app names them, with no record beside it. */
export interface StrayContainer {
    readonly containerName: string;
    readonly where: string;
    readonly message: string;
}

export interface ContainerScan {
    readonly offers: readonly ContainerOffer[];
    /**
     * Containers this app clearly started, whose record is gone.
     *
     * Reported rather than acted on, and never stopped automatically. Without the record
     * there is no way to know which render a container belongs to or where its output was
     * going, so the only honest thing is to name it and let a person decide.
     */
    readonly strays: readonly StrayContainer[];
}

export type ReattachRefusalCode =
    | "no-record"
    | "already-running"
    | "no-access"
    | "daemon-silent"
    | "nothing-to-collect";

export type ReattachResult =
    | {
          readonly ok: true;
          readonly renderId: string;
          readonly action: "attached" | "collected";
          readonly dataRoot: string;
          readonly message: string;
      }
    | {
          readonly ok: false;
          readonly renderId: string;
          readonly code: ReattachRefusalCode;
          readonly message: string;
      };

export interface ContainerReattacherOptions {
    readonly store: ContainerHandoffStore;
    /**
     * How each record's daemon is reached, or null when this build cannot reach it.
     *
     * A function of the record rather than a single object, because one app can hold both
     * a local container and one on a remote host, and they are reached differently. Null
     * is an honest answer and is reported as one: a remote record in a build with no
     * remote support is a render that exists and cannot be picked up from here.
     */
    readonly access: (record: ContainerHandoff) => ContainerAccess | null;
    readonly onEvent?: (event: RenderEvent) => void;
    /** The prefix every container this app starts is named with. */
    readonly prefix?: string;
    /**
     * How the local daemon is asked which of this app's containers it holds.
     *
     * Separate from {@link access} because it is a question about *no particular record* -
     * it is precisely how a container whose record is gone is noticed - so there is no
     * record to hand an access factory. Omitted, strays are simply not looked for, which
     * is the right answer for a build with no local daemon rather than an error.
     */
    readonly listContainers?: () => Promise<readonly string[]>;
    /** Injected so a test can drive a container's output without Docker or a network. */
    readonly spawn?: EngineProcessOptions["spawn"];
    readonly now?: () => Date;
}

interface Live {
    readonly process: EngineProcess;
}

/**
 * Finds and resumes containerised renders this app is no longer watching.
 *
 * Safe to call `scan()` on every launch and again whenever somebody asks: it asks the
 * daemon, it does not act, and it is the same question either way. `resume()` is the one
 * that acts, and it is never called on the app's behalf - see the note in
 * `render/resume.ts` about why an offer is an offer.
 */
export class ContainerReattacher {
    private readonly options: ContainerReattacherOptions;
    private readonly live = new Map<string, Live>();

    constructor(options: ContainerReattacherOptions) {
        this.options = options;
    }

    /** The renders this reattacher is currently driving. */
    activeRenderIds(): string[] {
        return [...this.live.keys()];
    }

    /**
     * Asks the daemon about every container this app wrote a record for. Never rejects.
     *
     * Reconciles nothing on disk, deliberately. The record is the only evidence that a
     * container was started at all, and a scan that pruned records it could not confirm
     * would delete exactly the note needed the next time the daemon *is* answering.
     */
    async scan(): Promise<ContainerScan> {
        const offers: ContainerOffer[] = [];
        const claimed = new Set<string>();

        for (const record of await this.options.store.list()) {
            claimed.add(record.containerName);
            if (record.status !== "running" || record.dismissed) continue;
            if (this.live.has(record.renderId)) continue;
            if (record.ownerInstance === this.options.store.instanceId) continue;

            const access = this.options.access(record);
            if (access === null) {
                offers.push({
                    renderId: record.renderId,
                    containerName: record.containerName,
                    mode: record.mode,
                    where: record.remote === null ? "this computer" : hostOf(record),
                    mapIds: record.mapIds,
                    startedAt: record.startedAt,
                    state: "unknown",
                    action: "unknown",
                    canResume: false,
                    suggestRestart: false,
                    message:
                        `Container '${record.containerName}' was started on ${hostOf(record)} and ` +
                        "this build has no way to reach that daemon, so it cannot be picked up " +
                        "from here. It may still be rendering.",
                });
                continue;
            }

            const inspection = await access.inspect(record.containerName);
            const decision = decideReattach(record, inspection, access.describe());
            offers.push({
                renderId: record.renderId,
                containerName: record.containerName,
                mode: record.mode,
                where: access.describe(),
                mapIds: record.mapIds,
                startedAt: record.startedAt,
                state: inspection.state,
                action: decision.action,
                canResume: decision.action !== "unknown",
                suggestRestart: decision.suggestRestart,
                message: decision.message,
            });
        }

        return { offers, strays: await this.strays(claimed) };
    }

    /**
     * Picks one render back up. Never rejects.
     *
     * Every outcome here is something the interface has to show, which is the reason
     * `render()` returns a value rather than throwing and the reason this does too.
     */
    async resume(renderId: string): Promise<ReattachResult> {
        if (this.live.has(renderId)) {
            return {
                ok: false,
                renderId,
                code: "already-running",
                message: "That render is already being watched. Watch it rather than picking it up twice.",
            };
        }

        const record = await this.options.store.read(renderId);
        if (record === null || record.status !== "running") {
            return {
                ok: false,
                renderId,
                code: "no-record",
                message:
                    "There is no note of a container for that render, so there is nothing to " +
                    "reattach to. Starting it again will render only what is missing.",
            };
        }

        const access = this.options.access(record);
        if (access === null) {
            return {
                ok: false,
                renderId,
                code: "no-access",
                message:
                    `Container '${record.containerName}' is on ${hostOf(record)} and this build has ` +
                    "no way to reach that daemon.",
            };
        }

        const inspection = await access.inspect(record.containerName);
        const decision = decideReattach(record, inspection, access.describe());
        if (decision.action === "unknown") {
            // Nothing is adopted and nothing is removed. A record dropped here would be
            // the one piece of evidence that a still-running render exists.
            return { ok: false, renderId, code: "daemon-silent", message: decision.message };
        }

        const owned = await this.options.store.adopt(record);
        this.emit({
            type: "started",
            renderId,
            mapIds: owned.mapIds,
            engine: owned.engine,
            at: this.timestamp(),
        });
        this.log(renderId, "INFO", decision.message);

        return decision.action === "attach"
            ? await this.attach(owned, access)
            : await this.collect(owned, access, "collected");
    }

    /**
     * Stops a reattached render. False when this reattacher is not driving that id.
     *
     * The same cancel the interface already has: what actually stops the container is the
     * `stopContainer` handed to {@link EngineProcess}, which asks the daemon by name.
     * Killing the `docker logs` client would only stop the *reading*, and the render would
     * carry on exactly as it did when the app closed - the failure this whole file exists
     * to undo, re-created by the cancel button.
     */
    cancel(renderId: string): boolean {
        const entry = this.live.get(renderId);
        if (entry === undefined) return false;
        entry.process.cancel();
        return true;
    }

    /** Records that an offer was declined, so it is not made again on every launch. */
    async dismiss(renderId: string): Promise<boolean> {
        return await this.options.store.dismiss(renderId);
    }

    /* ------------------------------------------------------------------ */

    private async attach(record: ContainerHandoff, access: ContainerAccess): Promise<ReattachResult> {
        const startedAt = Date.now();
        this.phase(record.renderId, "rendering");

        const process = new EngineProcess({
            launch: access.attachLaunch(record),
            onSignal: (signal) => this.consume(record.renderId, signal),
            ...(this.options.spawn === undefined ? {} : { spawn: this.options.spawn }),
            stopContainer: async (name) => {
                await access.stop(name);
            },
        });
        this.live.set(record.renderId, { process });

        let result;
        try {
            result = await process.start();
        } finally {
            this.live.delete(record.renderId);
        }

        if (result.cancelled) {
            await access.cleanUp?.(record);
            await this.options.store.finish(record.renderId);
            this.emit({ type: "cancelled", renderId: record.renderId, at: this.timestamp() });
            return {
                ok: true,
                renderId: record.renderId,
                action: "attached",
                dataRoot: record.storageRoot,
                message: "The render was stopped, and the container with it.",
            };
        }

        // The client's exit code is the *client's*. Whether the render finished is decided
        // by what the engine said, which is the only thing that means it: see the note in
        // `attach.ts` about what `docker logs` cannot tell you.
        if (!result.upToDate) {
            await this.options.store.finish(record.renderId);
            const failure = clientFailure(
                `The render in container '${record.containerName}' on ${access.describe()} stopped ` +
                    "without the engine saying its maps were up to date. What it had already " +
                    "rendered is on disk; running it again will carry on from there rather than " +
                    "start over.",
                result.diagnostics.join("\n") || result.stderr.join("\n") || null,
            );
            this.emit({ type: "failed", renderId: record.renderId, failure, at: this.timestamp() });
            return {
                ok: false,
                renderId: record.renderId,
                code: "nothing-to-collect",
                message: failure.message,
            };
        }

        return await this.collect(record, access, "attached", Date.now() - startedAt);
    }

    /**
     * Brings the output home and reports the render as finished.
     *
     * A collection that finds nothing is a **failure**, not a quiet success. The one thing
     * worse than losing a render is telling somebody it is on their disk when it is not.
     */
    private async collect(
        record: ContainerHandoff,
        access: ContainerAccess,
        action: "attached" | "collected",
        durationMs = 0,
    ): Promise<ReattachResult> {
        this.phase(record.renderId, "stopping");
        const collected = await access.collect(record);
        this.log(record.renderId, collected.ok ? "INFO" : "ERROR", collected.message);

        if (!collected.ok) {
            await this.options.store.finish(record.renderId);
            const failure = clientFailure(collected.message, null);
            this.emit({ type: "failed", renderId: record.renderId, failure, at: this.timestamp() });
            return {
                ok: false,
                renderId: record.renderId,
                code: "nothing-to-collect",
                message: collected.message,
            };
        }

        const cleaned = await access.cleanUp?.(record);
        if (cleaned !== undefined) {
            this.log(record.renderId, cleaned.ok ? "INFO" : "WARNING", cleaned.message);
        }

        await this.options.store.finish(record.renderId);
        this.phase(record.renderId, "finished");
        this.emit({
            type: "finished",
            renderId: record.renderId,
            dataRoot: record.storageRoot,
            mapIds: record.mapIds,
            engine: record.engine,
            durationMs,
            at: this.timestamp(),
        });
        return {
            ok: true,
            renderId: record.renderId,
            action,
            dataRoot: record.storageRoot,
            message: collected.message,
        };
    }

    /**
     * Containers named the way this app names them with no record beside them.
     *
     * Asked only of the local daemon, because a stray is by definition a container whose
     * record is gone, and without a record there is no host to ask. That limit is stated
     * in the documentation rather than papered over by scanning every configured target.
     */
    private async strays(claimed: ReadonlySet<string>): Promise<StrayContainer[]> {
        const list = this.options.listContainers;
        if (list === undefined) return [];

        const names = await list();
        return names
            .filter((name) => !claimed.has(name))
            .map((name) => ({
                containerName: name,
                where: "this computer",
                message:
                    `Container '${name}' on this computer is named the way this app names them and ` +
                    "has no record beside it, so there is no way to say which render it belongs to " +
                    "or where its output was going. Stop it by hand if it is not wanted.",
            }));
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

    private timestamp(): string {
        return (this.options.now?.() ?? new Date()).toISOString();
    }
}

/** `renderer@host:2222`, or `this computer` for a local record. */
function hostOf(record: ContainerHandoff): string {
    const remote = record.remote;
    if (remote === null) return "this computer";
    return `${remote.user}@${remote.host}:${String(remote.port)}`;
}

/**
 * A failure in the shape the interface already renders.
 *
 * `cli-failed` because work was started somewhere and stopped, which is exactly what the
 * code means in `render/failure.ts`. `settings` is null: none of the anchors that file
 * owns is where a container is configured, and a dead link at the moment somebody knows
 * what they want to change is worse than no link.
 */
function clientFailure(message: string, detail: string | null): RenderFailure {
    return { code: "cli-failed", message, settings: null, detail, exitCode: null };
}
