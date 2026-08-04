/**
 * The note a render leaves behind so a container can be found again after the app dies.
 *
 * ## Why a container needs one at all, when a local render does not
 *
 * `render/session.ts` records a local render so that a *crash* can be detected and the
 * work offered back. A containerised render has the opposite problem. The JVM is not this
 * app's child at all: `docker run` is a client attached to a container the **daemon**
 * owns, and closing the app closes the client. The render carries on. Tiles keep landing
 * in the bind-mounted output folder, the progress lines keep being written to a log
 * nobody is reading, and when the app comes back it has no idea any of it is happening.
 *
 * What is missing is never the work - the work is fine, it is still running - it is the
 * **name**. A container this app started has a name this app chose (`containerName` in
 * `plan.ts`), and knowing that name is the whole difference between reattaching to a
 * render and starting a six-hour one again beside it. This file is where the name is
 * written down, beside the render it belongs to:
 *
 * ```
 * <storageDir>/<renderId>/
 *   render.json      which engine rendered this, and how it ended     (render/provenance.ts)
 *   session.json     what is running right now, and how far it got    (render/session.ts)
 *   container.json   which container is doing it, and where           (this file)
 * ```
 *
 * ## What is in it, and why each field is
 *
 * Enough to find the container, read it, stop it, and know where its output goes -
 * nothing else. The record is written once when the container is started and removed when
 * it ends, so it is never a second copy of the progress that `session.json` already owns.
 * A record and a session that disagreed about how far a render had got would be a bug
 * with no obvious right answer, so there is only ever one of them.
 *
 * The remote half carries the target's own fields rather than a settings key. A record
 * that only named a target id would be unreadable the moment somebody renamed or deleted
 * that target, which is exactly the situation - an app that has been closed and reopened,
 * possibly for days - the record exists to survive.
 *
 * ## Detecting a container this app has lost, and why `ownerInstance` is still the test
 *
 * For the same reason `render/session.ts` gives: not a process id, which is reused, and
 * here not even the container's own existence, because a container that exists may
 * perfectly well be one *this* app instance is watching right now. Each record names the
 * app instance that owns it, fresh on every launch, so a record owned by any other value
 * describes a container whose app is gone. Whether the container is still there is then a
 * separate question, and it is asked of the daemon rather than guessed at; see `attach.ts`.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { EngineDescription } from "../render/orchestrator.js";
import type { RenderEngineId } from "../render/provenance.js";

/** Bumped when the shape below changes incompatibly. An older file reads as absent. */
export const CONTAINER_HANDOFF_VERSION = 1;

/** The file name inside a render's workspace. Beside `session.json`, never inside it. */
export const CONTAINER_HANDOFF_FILE = "container.json";

/**
 * Where the container is: on the daemon on this computer, or on one over SSH.
 *
 * The two are the same problem - a container the app is a mere viewer of - and are handled
 * by the same code. They differ only in which command runner reaches the daemon, which is
 * why this is one field rather than two record types.
 */
export type ContainerMode = "docker" | "remote";

/** Whether the app still believes the container is doing something. */
export type ContainerHandoffStatus = "running" | "finished";

/**
 * The remote host a container is on, in enough detail to reach it again.
 *
 * Structurally a subset of `remote/target.ts`'s `RemoteTarget` plus the two staging paths,
 * restated here rather than imported so `runtime/` does not depend on `remote/` - the
 * dependency runs the other way, and reversing it for one type would make a cycle out of
 * a folder boundary that is otherwise clean.
 *
 * Nothing in it is a secret. `identityFile` is a *path*; this app never reads a key.
 */
export interface RemoteHandoffTarget {
    readonly id: string;
    readonly host: string;
    readonly port: number;
    readonly user: string;
    readonly identityFile: string | null;
    /** The remote `docker` binary, for a host with a wrapper. */
    readonly docker: string;
    /** True when the staging directory is deliberately left behind after a render. */
    readonly keepRemoteFiles: boolean;
    /** `<workDir>/<renderId>` on the remote host. */
    readonly root: string;
    /** `<root>/web/maps`, which is the directory that has to come home. */
    readonly storageRoot: string;
}

export interface ContainerHandoff {
    readonly handoffVersion: number;
    readonly renderId: string;
    /** The name this app gave the container. The whole point of the record. */
    readonly containerName: string;
    readonly mode: ContainerMode;
    readonly mapIds: readonly string[];
    /** The `docker` binary **on this computer**, which is what reaches a local daemon. */
    readonly docker: string;
    /**
     * `<workspace>/web/maps` on this computer: where the tiles end up either way.
     *
     * For a local container it is a bind mount, so the tiles are already there while the
     * render runs. For a remote one it is where the download lands.
     */
    readonly storageRoot: string;
    /** `<workspace>/web`, which is the directory a remote collection copies *into*. */
    readonly webRoot: string;
    /** The working directory to give the reattached client. */
    readonly cwd: string;
    /**
     * What to put in the `started` event when the render is picked up again.
     *
     * Kept because a reattached render has to look exactly like a running one to the
     * interface, and the interface's list shows the engine. Re-resolving it on reattach
     * would report whichever engine the app has *now*, which is not the one that rendered
     * the tiles already on disk.
     */
    readonly engine: EngineDescription;
    readonly startedAt: string;
    readonly updatedAt: string;
    readonly status: ContainerHandoffStatus;
    /** The app instance that owns this record. See the note at the top of the file. */
    readonly ownerInstance: string;
    readonly ownerPid: number | null;
    readonly remote: RemoteHandoffTarget | null;
    /** Set when somebody declines the offer, so it is made once rather than every launch. */
    readonly dismissed: boolean;
}

/** `<storageDir>/<renderId>/container.json`, absolute. */
export function handoffFile(storageDir: string, renderId: string): string {
    return join(resolve(storageDir, renderId), CONTAINER_HANDOFF_FILE);
}

export interface NewHandoffInput {
    readonly renderId: string;
    readonly containerName: string;
    readonly mode: ContainerMode;
    readonly mapIds: readonly string[];
    readonly docker: string;
    readonly storageRoot: string;
    readonly webRoot: string;
    readonly cwd: string;
    readonly engine: EngineDescription;
    readonly startedAt: string;
    readonly ownerInstance: string;
    readonly ownerPid?: number | null;
    readonly remote?: RemoteHandoffTarget | null;
}

export function newContainerHandoff(input: NewHandoffInput): ContainerHandoff {
    return {
        handoffVersion: CONTAINER_HANDOFF_VERSION,
        renderId: input.renderId,
        containerName: input.containerName,
        mode: input.mode,
        mapIds: [...input.mapIds],
        docker: input.docker,
        storageRoot: input.storageRoot,
        webRoot: input.webRoot,
        cwd: input.cwd,
        engine: input.engine,
        startedAt: input.startedAt,
        updatedAt: input.startedAt,
        status: "running",
        ownerInstance: input.ownerInstance,
        ownerPid: input.ownerPid ?? null,
        remote: input.remote ?? null,
        dismissed: false,
    };
}

/**
 * True when the record describes a container this app instance is not watching.
 *
 * Says nothing about whether the container still exists - that is a question for the
 * daemon, and answering it from a file would be answering it from a guess.
 */
export function isHandedOff(record: ContainerHandoff, instanceId: string): boolean {
    return record.status === "running" && record.ownerInstance !== instanceId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function readStrings(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === "string");
}

function readEngine(value: unknown): EngineDescription | null {
    if (!isRecord(value)) return null;
    const id = readString(value["id"]);
    if (id !== "upstream-java" && id !== "typescript") return null;
    return {
        id: id as RenderEngineId,
        label: readString(value["label"]) ?? "BlueMap engine",
        version: readString(value["version"]) ?? "unknown",
        javaVersion: readString(value["javaVersion"]),
    };
}

function readRemote(value: unknown): RemoteHandoffTarget | null {
    if (!isRecord(value)) return null;
    const id = readString(value["id"]);
    const host = readString(value["host"]);
    const user = readString(value["user"]);
    const root = readString(value["root"]);
    const storageRoot = readString(value["storageRoot"]);
    const port = value["port"];
    if (
        id === null ||
        host === null ||
        user === null ||
        root === null ||
        storageRoot === null ||
        typeof port !== "number" ||
        !Number.isSafeInteger(port)
    ) {
        return null;
    }
    return {
        id,
        host,
        port,
        user,
        identityFile: readString(value["identityFile"]),
        docker: readString(value["docker"]) ?? "docker",
        keepRemoteFiles: value["keepRemoteFiles"] === true,
        root,
        storageRoot,
    };
}

/**
 * Reads a record back.
 *
 * A missing, unreadable, truncated or malformed file is **absent**, never a partial
 * answer, for the reason `readRenderSession` gives: this is the read that happens right
 * after a crash, so a half-written file is the exact thing it is likely to meet. A record
 * parsed leniently would carry a real render id and an empty container name, and the app
 * would then go looking for a container called nothing.
 *
 * A `remote` half that will not parse fails the whole record rather than degrading to a
 * local one. A remote record read as local would send `docker stop` to the daemon on
 * *this* computer with a name only the other machine has, which either does nothing or,
 * on a machine that happens to have a container by that name, stops the wrong thing.
 */
export async function readContainerHandoff(path: string): Promise<ContainerHandoff | null> {
    let raw: string;
    try {
        raw = await readFile(path, "utf8");
    } catch {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(parsed)) return null;
    if (parsed["handoffVersion"] !== CONTAINER_HANDOFF_VERSION) return null;

    const renderId = readString(parsed["renderId"]);
    const containerName = readString(parsed["containerName"]);
    const mode = readString(parsed["mode"]);
    const storageRoot = readString(parsed["storageRoot"]);
    const webRoot = readString(parsed["webRoot"]);
    const startedAt = readString(parsed["startedAt"]);
    const ownerInstance = readString(parsed["ownerInstance"]);
    const status = readString(parsed["status"]);
    const engine = readEngine(parsed["engine"]);

    if (
        renderId === null ||
        containerName === null ||
        (mode !== "docker" && mode !== "remote") ||
        storageRoot === null ||
        webRoot === null ||
        startedAt === null ||
        ownerInstance === null ||
        (status !== "running" && status !== "finished") ||
        engine === null
    ) {
        return null;
    }

    const remote = readRemote(parsed["remote"]);
    if (mode === "remote" && remote === null) return null;

    return {
        handoffVersion: CONTAINER_HANDOFF_VERSION,
        renderId,
        containerName,
        mode,
        mapIds: readStrings(parsed["mapIds"]),
        docker: readString(parsed["docker"]) ?? "docker",
        storageRoot,
        webRoot,
        cwd: readString(parsed["cwd"]) ?? webRoot,
        engine,
        startedAt,
        updatedAt: readString(parsed["updatedAt"]) ?? startedAt,
        status,
        ownerInstance,
        ownerPid: typeof parsed["ownerPid"] === "number" ? parsed["ownerPid"] : null,
        remote: mode === "remote" ? remote : null,
        dismissed: parsed["dismissed"] === true,
    };
}

/**
 * Writes a record, staged and renamed.
 *
 * The same shape as `writeRenderSession` on purpose: a rename is atomic on every file
 * system this app runs on, so a reader sees the previous complete file or the new complete
 * file and never the bytes in between. That matters here for a specific reason - the write
 * happens moments before a container is started, which is one of the moments an app is
 * most likely to be killed.
 */
export async function writeContainerHandoff(path: string, record: ContainerHandoff): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const staging = `${path}.writing`;
    await writeFile(staging, `${JSON.stringify(record, null, 4)}\n`, "utf8");
    await rename(staging, path);
}

/** Every record on disk, newest first. A directory walk, for the reason `listRenderIds` gives. */
export async function listContainerHandoffs(storageDir: string): Promise<ContainerHandoff[]> {
    let entries;
    try {
        entries = await readdir(storageDir, { withFileTypes: true });
    } catch {
        return [];
    }

    const records: ContainerHandoff[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const record = await readContainerHandoff(handoffFile(storageDir, entry.name));
        if (record !== null) records.push(record);
    }
    records.sort((left, right) => (left.startedAt < right.startedAt ? 1 : -1));
    return records;
}

export interface ContainerHandoffStoreOptions {
    /**
     * Where renders are written. A function is accepted for the reason the render session
     * store accepts one: the folder can change from the setup step while the app is
     * running, and a value captured at construction would keep writing to the old one.
     */
    readonly storageDir: string | (() => string);
    /** Overridable so a test can pretend to be a previous launch. */
    readonly instanceId?: string;
    readonly now?: () => Date;
}

/**
 * The container records of one app instance.
 *
 * Every method swallows its own write failures, exactly as `RenderSessionStore` does and
 * for the same reason: a record that cannot be written must not fail the render it
 * describes. The cost of losing the note is that a container has to be found by hand;
 * the cost of failing the render is the render.
 */
export class ContainerHandoffStore {
    private readonly options: ContainerHandoffStoreOptions;
    /** Fresh on every launch. A record owned by any other value is from a dead app. */
    readonly instanceId: string;

    constructor(options: ContainerHandoffStoreOptions) {
        this.options = options;
        this.instanceId = options.instanceId ?? randomUUID();
    }

    storageDir(): string {
        const configured = this.options.storageDir;
        return typeof configured === "string" ? configured : configured();
    }

    /** Records that a container is about to be started, and returns what was written. */
    async start(
        input: Omit<NewHandoffInput, "ownerInstance" | "ownerPid" | "startedAt"> & {
            readonly startedAt?: string;
        },
    ): Promise<ContainerHandoff> {
        const record = newContainerHandoff({
            ...input,
            startedAt: input.startedAt ?? this.timestamp(),
            ownerInstance: this.instanceId,
            ownerPid: process.pid,
        });
        await this.put(record);
        return record;
    }

    /**
     * The container has ended and there is nothing left to find.
     *
     * The record is *removed* rather than marked finished. A finished record is a row in
     * the offer list that says "nothing to do here", and a list of those is a list nobody
     * reads. The render's own outcome is already recorded by `session.json` and
     * `render.json`, which is where anybody looking for history should be sent.
     */
    async finish(renderId: string): Promise<void> {
        try {
            await rm(handoffFile(this.storageDir(), renderId), { force: true });
        } catch {
            // Swallowed for the reason in the class comment.
        }
    }

    async read(renderId: string): Promise<ContainerHandoff | null> {
        return await readContainerHandoff(handoffFile(this.storageDir(), renderId));
    }

    async list(): Promise<ContainerHandoff[]> {
        return await listContainerHandoffs(this.storageDir());
    }

    /** Records that the offer was declined, so it is not made again on every launch. */
    async dismiss(renderId: string): Promise<boolean> {
        const record = await this.read(renderId);
        if (record === null || record.dismissed) return false;
        await this.put({ ...record, dismissed: true, updatedAt: this.timestamp() });
        return true;
    }

    /** Writes a record back exactly as given, used when this app adopts one. */
    async put(record: ContainerHandoff): Promise<void> {
        try {
            await writeContainerHandoff(handoffFile(this.storageDir(), record.renderId), record);
        } catch {
            // Swallowed for the reason in the class comment.
        }
    }

    /** Takes ownership of a record, so a second reattach cannot pick up the same one. */
    async adopt(record: ContainerHandoff): Promise<ContainerHandoff> {
        const owned: ContainerHandoff = {
            ...record,
            ownerInstance: this.instanceId,
            ownerPid: process.pid,
            updatedAt: this.timestamp(),
        };
        await this.put(owned);
        return owned;
    }

    private timestamp(): string {
        return (this.options.now?.() ?? new Date()).toISOString();
    }
}
