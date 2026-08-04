/**
 * Asking the daemon what became of a container, and reading one that is still going.
 *
 * ## Reattaching is a launch, not a second reporting path
 *
 * The single rule this folder is built under is that there is one way a render's output is
 * read. `EngineProcess` spawns something, `RenderOutputTracker` reads its lines, and every
 * phase, progress line, warning and banner comes out the same end whether the something
 * was a JVM, a `docker run`, or an `ssh` carrying one. Reattaching keeps that rule by
 * being another {@link EngineLaunch}: the command is `docker logs --follow`, and everything
 * downstream is the code that already exists.
 *
 * ```
 * docker run   ...        the container's stdout, copied through by the client
 * ssh host docker run ... the same, over a wire
 * docker logs -f <name>   the same, read back out of the daemon afterwards
 * ```
 *
 * `--tail all` is deliberate rather than incidental. It replays the container's whole
 * output from the first line, so a render the app missed two hours of does not resume with
 * a bar at zero and no map names: the tracker sees `Loading map 'overworld'`, sees every
 * progress line since, and arrives at the current percentage the same way it would have if
 * the app had been watching all along. Replaying costs a few thousand lines of parsing and
 * buys a progress bar that is not a lie.
 *
 * ## What `docker logs` cannot tell you, said plainly
 *
 * Its exit code is the *client's*, not the container's. A `docker logs -f` that returns 0
 * means the log ended, which happens both when a render finished and when it died. So a
 * reattached run is judged the way a render is really judged: by whether the engine said
 * `Your maps are now all up-to-date!`. That is the same test the orchestrators already
 * apply as a second opinion; here it is the only one, and this comment is where that is
 * written down rather than left to be rediscovered.
 *
 * ## And what `--rm` costs, which is real
 *
 * Containers are started with `--rm` so that a machine nobody is watching - and especially
 * a shared render host - does not accumulate dead containers. The price is paid exactly
 * here: a container that finished while the app was closed has been **removed**, taking
 * its logs and its exit status with it. What it wrote is still on disk, because the output
 * folder is a bind mount rather than anything inside the container, so the tiles are
 * collectable and are collected. What is not recoverable is the answer to "did it finish?",
 * and {@link decideReattach} says so in a sentence rather than guessing at a green tick.
 */

import type { CommandOutput, CommandRunner } from "./command.js";
import type { ContainerHandoff } from "./handoff.js";

/**
 * What the daemon says about a container.
 *
 * `absent` and `exited` are kept apart even though both mean "not running now", because
 * they are different sentences: one is Docker having tidied up after a finished render,
 * the other is a container sitting there with an exit code somebody can still read.
 */
export type ContainerState = "running" | "exited" | "absent" | "unknown";

export interface ContainerInspection {
    readonly name: string;
    readonly state: ContainerState;
    /** Docker's own status word - `running`, `paused`, `exited` - when it gave one. */
    readonly status: string | null;
    /** The container's exit code, when it is still around to have one. */
    readonly exitCode: number | null;
    /** Whatever the daemon said, when it said something worth keeping. */
    readonly detail: string | null;
}

/**
 * `docker inspect` with a format that answers both halves in one line.
 *
 * Two fields joined by a character that cannot appear in either, rather than two calls: a
 * container can exit between them, and a status read before an exit code that is read
 * after is a pair of facts about two different moments.
 */
export function inspectArguments(name: string): string[] {
    return ["inspect", "--format", "{{.State.Status}}|{{.State.ExitCode}}", name];
}

/** The client that streams a container's whole output, from its first line. */
export function attachArguments(name: string): string[] {
    return ["logs", "--follow", "--tail", "all", name];
}

/**
 * Every container whose name this app would have chosen.
 *
 * `-a` so a container that has already exited is listed too, and `--filter name=` because
 * Docker matches that as a substring. The answer is a list of names and nothing else;
 * what state each is in is asked separately, so this never has to depend on the columns a
 * particular Docker version prints.
 */
export function listArguments(prefix: string): string[] {
    return ["ps", "-a", "--no-trunc", "--filter", `name=${prefix}`, "--format", "{{.Names}}"];
}

/** Docker's wording when the name is not one it has. Both spellings are in the wild. */
const NO_SUCH_CONTAINER = /no such (?:object|container)|error: no such/i;

/**
 * Reads one `docker inspect` result. Pure, so every state is testable without a daemon.
 *
 * A daemon that is *down* is deliberately not reported as `absent`. "The container is
 * gone" and "the machine that knows about the container did not answer" have opposite
 * consequences: the first means collect the output and move on, the second means the
 * render may well still be going and must not be written off. So an unrecognised failure
 * is `unknown`, and the caller is expected to say so rather than assume.
 */
export function readInspection(name: string, output: CommandOutput): ContainerInspection {
    const said = firstLine(`${output.stderr}\n${output.stdout}`);

    if (output.spawnError !== null) {
        return {
            name,
            state: "unknown",
            status: null,
            exitCode: null,
            detail:
                output.spawnError === "ENOENT"
                    ? "There is no docker command to ask."
                    : `docker could not be started (${output.spawnError}).`,
        };
    }

    if (!output.ok) {
        if (NO_SUCH_CONTAINER.test(`${output.stderr}\n${output.stdout}`)) {
            return { name, state: "absent", status: null, exitCode: null, detail: said };
        }
        return { name, state: "unknown", status: null, exitCode: null, detail: said };
    }

    const line = output.stdout.trim().split(/\r?\n/)[0] ?? "";
    const [status = "", code = ""] = line.split("|");
    const exitCode = Number.parseInt(code, 10);
    const word = status.trim().toLowerCase();
    if (word === "") {
        return { name, state: "unknown", status: null, exitCode: null, detail: said };
    }

    // `exited` and `dead` are the two that are over. Everything else the daemon has a word
    // for - created, running, restarting, paused, removing - is a container that still
    // exists, which is what decides whether there is anything to attach to.
    const finished = word === "exited" || word === "dead";
    return {
        name,
        state: finished ? "exited" : "running",
        status: word,
        exitCode: finished && Number.isFinite(exitCode) ? exitCode : null,
        detail: null,
    };
}

export interface InspectOptions {
    readonly docker?: string;
    readonly runner: CommandRunner;
    readonly timeoutMs?: number;
}

/** Asks the daemon about one container. Never rejects. */
export async function inspectContainer(
    name: string,
    options: InspectOptions,
): Promise<ContainerInspection> {
    const output = await options.runner(
        options.docker ?? "docker",
        inspectArguments(name),
        options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs },
    );
    return readInspection(name, output);
}

/** Every container this app named that the daemon still knows about. Never rejects. */
export async function listAppContainers(
    prefix: string,
    options: InspectOptions,
): Promise<string[]> {
    const output = await options.runner(options.docker ?? "docker", listArguments(prefix), {});
    if (!output.ok) return [];
    return output.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== "");
}

/**
 * What to do about a record, given what the daemon said.
 *
 * - `attach` - the container is still going. Read it and report it as a running render.
 * - `collect` - it is over. Whatever it wrote is on disk; bring it home and finish.
 * - `unknown` - the daemon did not answer. Nothing is assumed and nothing is thrown away.
 */
export type ReattachAction = "attach" | "collect" | "unknown";

export interface ReattachDecision {
    readonly action: ReattachAction;
    readonly renderId: string;
    readonly containerName: string;
    /** One sentence. Facts only; the interface styles it. */
    readonly message: string;
    /**
     * True when the honest answer is "start it again".
     *
     * Offered rather than done. Silently restarting hours of rendering because an app was
     * reopened is not a favour, which is the same reason `render/resume.ts` gives for
     * offering rather than acting.
     */
    readonly suggestRestart: boolean;
}

function mapNames(mapIds: readonly string[]): string {
    if (mapIds.length === 0) return "a map";
    if (mapIds.length === 1) return `'${String(mapIds[0])}'`;
    if (mapIds.length === 2) return `'${String(mapIds[0])}' and '${String(mapIds[1])}'`;
    return `${String(mapIds.length)} maps`;
}

/**
 * Decides what a record and an inspection mean together. Pure.
 *
 * `where` is the machine in words - `this computer`, or `renderer@host:2222` - so every
 * sentence below names which daemon it is talking about. On a setup with both a local and
 * a remote render going, "the container is gone" without that is a sentence that sends
 * somebody to look on the wrong machine.
 */
export function decideReattach(
    record: ContainerHandoff,
    inspection: ContainerInspection,
    where: string,
): ReattachDecision {
    const maps = mapNames(record.mapIds);
    const base = { renderId: record.renderId, containerName: record.containerName };

    switch (inspection.state) {
        case "running":
            return {
                ...base,
                action: "attach",
                suggestRestart: false,
                message:
                    `The render of ${maps} is still going in container '${record.containerName}' on ` +
                    `${where}: the app closed, the daemon carried on. Picking it up rather than ` +
                    "starting a second one beside it.",
            };
        case "exited":
            return {
                ...base,
                action: "collect",
                suggestRestart: inspection.exitCode !== null && inspection.exitCode !== 0,
                message:
                    `Container '${record.containerName}' on ${where} finished while the app was ` +
                    `closed${inspection.exitCode === null ? "" : ` (exit code ${String(inspection.exitCode)})`}. ` +
                    "The tiles it wrote are still where it wrote them, so they are collected now.",
            };
        case "absent":
            return {
                ...base,
                action: "collect",
                // Not a restart: whether it finished is unknown, and re-running an already
                // finished render costs one pass that renders nothing. Suggesting one for
                // every reopened app would be suggesting one every time.
                suggestRestart: false,
                message:
                    `Container '${record.containerName}' is no longer on ${where} - it is removed ` +
                    "the moment it ends, which is what '--rm' does, and its exit status went with " +
                    "it. What it wrote is on disk and is collected now; nothing here can say " +
                    "whether it got to the end, so run the render again if you need that " +
                    "confirmed. It will only redo what is missing.",
            };
        default:
            return {
                ...base,
                action: "unknown",
                suggestRestart: false,
                message:
                    `${where} could not say what became of container '${record.containerName}'` +
                    `${inspection.detail === null ? "" : `: ${inspection.detail}`}. The render of ` +
                    `${maps} may well still be going, so nothing is collected and nothing is ` +
                    "thrown away. Try again once that machine answers.",
            };
    }
}

/** One line, so a daemon that answers in paragraphs does not become the whole screen. */
function firstLine(text: string): string | null {
    const line = text
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find((entry) => entry.length > 0);
    return line === undefined || line === "" ? null : line;
}
