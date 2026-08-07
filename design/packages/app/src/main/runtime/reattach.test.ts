/**
 * Picking a containerised render back up, in every state a container can be found in.
 *
 * No Docker, no SSH, no network and no daemon: `ContainerAccess` is four functions and a
 * fake child process supplies the log, which is what makes the interesting cases testable
 * at all. Every one of them - a container still running when the app starts, one that
 * finished while it was away, one the daemon no longer has, and a cancel that reaches a
 * reattached container - only happens on a machine that has just come back from a crash,
 * and a path that can only be exercised there is a path nobody exercises.
 */

import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RenderEvent } from "../render/orchestrator.js";
import type { ContainerInspection } from "./attach.js";
import {
    ContainerHandoffStore,
    handoffFile,
    newContainerHandoff,
    writeContainerHandoff,
    type ContainerHandoff,
} from "./handoff.js";
import type { EngineChildProcess, SpawnEngine } from "./process.js";
import {
    ContainerReattacher,
    localContainerAccess,
    type CollectReport,
    type ContainerAccess,
} from "./reattach.js";

let storageDir = "";

const RENDER_LOG = [
    "[12:45:52 INFO] Loading map 'overworld'...\n",
    "[12:45:53 INFO] Start updating 1 maps ...\n",
    "[12:46:03 INFO] updating map 'overworld': 25.663% (ETA: 47 seconds)\n",
    "[12:47:11 INFO] Your maps are now all up-to-date!\n",
];

const UNFINISHED_LOG = [
    "[12:45:52 INFO] Loading map 'overworld'...\n",
    "[12:46:03 INFO] updating map 'overworld': 25.663% (ETA: 47 seconds)\n",
];

/** A child that prints what it is told and then closes, exactly as `docker logs -f` does. */
function fakeChild(options: {
    readonly stdout?: readonly string[];
    readonly closes?: boolean;
}): EngineChildProcess & { readonly killed: string[] } {
    const emitter = new EventEmitter();
    const killed: string[] = [];
    const child = emitter as unknown as EngineChildProcess & {
        killed: string[];
        exitCode: number | null;
    };
    Object.assign(child, {
        stdout: Readable.from(options.stdout ?? []),
        stderr: Readable.from([]),
        killed,
        exitCode: null,
        kill(signal: string): boolean {
            killed.push(signal);
            emitter.emit("close", null, signal);
            return true;
        },
    });
    if (options.closes !== false) setTimeout(() => emitter.emit("close", 0, null), 0);
    return child as EngineChildProcess & { readonly killed: string[] };
}

function record(overrides: Partial<ContainerHandoff> = {}): ContainerHandoff {
    return {
        ...newContainerHandoff({
            renderId: "world-abc123",
            containerName: "worldlens-world-abc123",
            mode: "docker",
            mapIds: ["overworld"],
            docker: "docker",
            storageRoot: join(storageDir, "world-abc123", "web", "maps"),
            webRoot: join(storageDir, "world-abc123", "web"),
            cwd: join(storageDir, "world-abc123"),
            engine: {
                id: "upstream-java",
                label: "BlueMap engine (Java) 5.22-27 in a container",
                version: "5.22-27",
                javaVersion: null,
            },
            startedAt: "2026-08-04T10:00:00.000Z",
            // Not this app instance: the app that started it is gone, which is the whole
            // situation under test.
            ownerInstance: "a-dead-app",
        }),
        ...overrides,
    };
}

interface FakeAccess extends ContainerAccess {
    readonly stopped: string[];
    readonly collected: string[];
}

function fakeAccess(options: {
    readonly state: ContainerInspection["state"];
    readonly exitCode?: number | null;
    readonly collect?: CollectReport;
    readonly where?: string;
}): FakeAccess {
    const stopped: string[] = [];
    const collected: string[] = [];
    return {
        stopped,
        collected,
        describe: () => options.where ?? "this computer",
        inspect: (name) =>
            Promise.resolve({
                name,
                state: options.state,
                status: options.state,
                exitCode: options.exitCode ?? null,
                detail: options.state === "unknown" ? "the daemon is not running" : null,
            }),
        attachLaunch: (held) => ({
            mode: "docker",
            role: "render",
            command: "docker",
            args: ["logs", "--follow", "--tail", "all", held.containerName],
            cwd: held.cwd,
            mounts: [],
            containerName: held.containerName,
            engineConfigDir: "/bluemap/config",
            hostConfigDir: held.cwd,
            url: null,
            hostPort: null,
        }),
        stop(name): Promise<void> {
            stopped.push(name);
            return Promise.resolve();
        },
        collect(held): Promise<CollectReport> {
            collected.push(held.containerName);
            return Promise.resolve(
                options.collect ?? { ok: true, message: "The tiles are where the container wrote them." },
            );
        },
    };
}

function reattacher(options: {
    readonly access: ContainerAccess | null;
    readonly spawn?: SpawnEngine;
    readonly listContainers?: () => Promise<readonly string[]>;
}): { subject: ContainerReattacher; events: RenderEvent[]; store: ContainerHandoffStore } {
    const events: RenderEvent[] = [];
    const store = new ContainerHandoffStore({ storageDir, instanceId: "this-app" });
    const subject = new ContainerReattacher({
        store,
        access: () => options.access,
        onEvent: (event) => events.push(event),
        ...(options.spawn === undefined ? {} : { spawn: options.spawn }),
        ...(options.listContainers === undefined ? {} : { listContainers: options.listContainers }),
    });
    return { subject, events, store };
}

/**
 * Waits for the reattach to have actually spawned its reader.
 *
 * `resume` reads a record, asks the daemon and takes ownership before anything is running,
 * so a single tick is a race rather than a wait - and a race that passes on a fast machine
 * and fails on a loaded CI runner is worse than no test.
 */
async function untilRunning(subject: ContainerReattacher): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        if (subject.activeRenderIds().length > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
}

beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "mbm-reattach-"));
});

afterEach(async () => {
    await rm(storageDir, { recursive: true, force: true });
});

describe("scanning at launch", () => {
    it("offers a container that is still running when the app starts", async () => {
        await writeContainerHandoff(handoffFile(storageDir, "world-abc123"), record());
        const { subject } = reattacher({ access: fakeAccess({ state: "running" }) });

        const scan = await subject.scan();
        expect(scan.offers).toHaveLength(1);
        expect(scan.offers[0]?.action).toBe("attach");
        expect(scan.offers[0]?.canResume).toBe(true);
        expect(scan.offers[0]?.message).toContain("still going");
    });

    it("never offers a render this app instance is already running", async () => {
        // The record's owner is this instance, so the container is one this app is
        // watching right now. Offering to pick it up would offer a second reader of the
        // same log and a second entry in the same list.
        await writeContainerHandoff(
            handoffFile(storageDir, "world-abc123"),
            record({ ownerInstance: "this-app" }),
        );
        const { subject } = reattacher({ access: fakeAccess({ state: "running" }) });
        expect((await subject.scan()).offers).toEqual([]);
    });

    it("does not offer a record somebody has already declined", async () => {
        await writeContainerHandoff(
            handoffFile(storageDir, "world-abc123"),
            record({ dismissed: true }),
        );
        const { subject } = reattacher({ access: fakeAccess({ state: "running" }) });
        expect((await subject.scan()).offers).toEqual([]);
    });

    it("names a container with no record instead of stopping it", async () => {
        // Without a record there is nothing to say which render it belongs to or where its
        // output was going, so the only honest thing is to name it.
        const { subject } = reattacher({
            access: fakeAccess({ state: "running" }),
            listContainers: () => Promise.resolve(["worldlens-something-else"]),
        });
        const scan = await subject.scan();
        expect(scan.strays).toHaveLength(1);
        expect(scan.strays[0]?.message).toContain("no record beside it");
    });

    it("reports a record this build cannot reach rather than pretending it is gone", async () => {
        await writeContainerHandoff(handoffFile(storageDir, "world-abc123"), record());
        const { subject } = reattacher({ access: null });
        const scan = await subject.scan();
        expect(scan.offers[0]?.canResume).toBe(false);
        expect(scan.offers[0]?.message).toContain("may still be rendering");
    });
});

describe("a container that is still running", () => {
    it("reports it exactly as a running render, on the same events", async () => {
        await writeContainerHandoff(handoffFile(storageDir, "world-abc123"), record());
        const access = fakeAccess({ state: "running" });
        const { subject, events } = reattacher({
            access,
            spawn: () => fakeChild({ stdout: RENDER_LOG }),
        });

        const result = await subject.resume("world-abc123");
        expect(result.ok).toBe(true);

        // The whole promise of this module in one assertion: a reattached render produces
        // the same event union a local one does, so the same list, bar and cancel button
        // work with no knowledge that the app was ever closed.
        expect(events.map((event) => event.type)).toContain("started");
        expect(events.map((event) => event.type)).toContain("progress");
        expect(events.map((event) => event.type)).toContain("finished");
        const progress = events.find((event) => event.type === "progress");
        expect(progress?.type === "progress" && progress.task.percent).toBeCloseTo(25.663, 3);
        expect(access.collected).toEqual(["worldlens-world-abc123"]);
    });

    it("removes the note once the run is over, so the offer is not made again", async () => {
        await writeContainerHandoff(handoffFile(storageDir, "world-abc123"), record());
        const { subject, store } = reattacher({
            access: fakeAccess({ state: "running" }),
            spawn: () => fakeChild({ stdout: RENDER_LOG }),
        });
        await subject.resume("world-abc123");
        expect(await store.read("world-abc123")).toBeNull();
    });

    it("reports a log that ended without the engine finishing as a failure, not a success", async () => {
        // `docker logs -f` exits 0 when the log ends, which happens both when a render
        // finished and when it died. Only the engine's own last line means it finished.
        await writeContainerHandoff(handoffFile(storageDir, "world-abc123"), record());
        const { subject, events } = reattacher({
            access: fakeAccess({ state: "running" }),
            spawn: () => fakeChild({ stdout: UNFINISHED_LOG }),
        });

        const result = await subject.resume("world-abc123");
        expect(result.ok).toBe(false);
        const failed = events.find((event) => event.type === "failed");
        expect(failed?.type === "failed" && failed.failure.message).toContain("up to date");
    });

    it("refuses to pick the same render up twice", async () => {
        await writeContainerHandoff(handoffFile(storageDir, "world-abc123"), record());
        const child = fakeChild({ stdout: RENDER_LOG, closes: false });
        const { subject } = reattacher({ access: fakeAccess({ state: "running" }), spawn: () => child });

        const first = subject.resume("world-abc123");
        await untilRunning(subject);
        const second = await subject.resume("world-abc123");
        expect(second.ok).toBe(false);
        expect(second.ok === false && second.code).toBe("already-running");

        subject.cancel("world-abc123");
        await first;
    });
});

describe("a container that finished while the app was away", () => {
    it("collects its output rather than throwing it away, and finishes the render", async () => {
        await writeContainerHandoff(handoffFile(storageDir, "world-abc123"), record());
        const access = fakeAccess({ state: "exited", exitCode: 0 });
        const { subject, events } = reattacher({ access });

        const result = await subject.resume("world-abc123");
        expect(result.ok).toBe(true);
        expect(result.ok === true && result.action).toBe("collected");
        expect(access.collected).toEqual(["worldlens-world-abc123"]);
        expect(events.map((event) => event.type)).toContain("finished");
    });

    it("collects from one the daemon no longer has, and says its exit status went with it", async () => {
        await writeContainerHandoff(handoffFile(storageDir, "world-abc123"), record());
        const access = fakeAccess({ state: "absent" });
        const { subject, events } = reattacher({ access });

        const result = await subject.resume("world-abc123");
        expect(result.ok).toBe(true);
        expect(access.collected).toEqual(["worldlens-world-abc123"]);
        const log = events.find((event) => event.type === "log" && event.message.includes("--rm"));
        expect(log).toBeDefined();
    });

    it("calls a collection that found nothing a failure rather than a quiet success", async () => {
        // The one thing worse than losing a render is telling somebody it is on their disk.
        await writeContainerHandoff(handoffFile(storageDir, "world-abc123"), record());
        const { subject, events } = reattacher({
            access: fakeAccess({
                state: "absent",
                collect: { ok: false, message: "That folder is not there any more." },
            }),
        });

        const result = await subject.resume("world-abc123");
        expect(result.ok).toBe(false);
        expect(events.some((event) => event.type === "finished")).toBe(false);
        expect(events.some((event) => event.type === "failed")).toBe(true);
    });
});

describe("a daemon that did not answer", () => {
    it("keeps the record, collects nothing, and says which machine went quiet", async () => {
        await writeContainerHandoff(handoffFile(storageDir, "world-abc123"), record());
        const access = fakeAccess({ state: "unknown", where: "renderer@render.example:2222" });
        const { subject, store } = reattacher({ access });

        const result = await subject.resume("world-abc123");
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe("daemon-silent");
        expect(result.message).toContain("renderer@render.example:2222");
        expect(access.collected).toEqual([]);
        // The record is the only evidence a still-running render exists. Dropping it here
        // would lose the render the next time the daemon *is* answering.
        expect(await store.read("world-abc123")).not.toBeNull();
    });
});

describe("cancelling a reattached container", () => {
    it("asks the daemon to stop it, because killing the reader would only stop the reading", async () => {
        await writeContainerHandoff(handoffFile(storageDir, "world-abc123"), record());
        const access = fakeAccess({ state: "running" });
        const child = fakeChild({ stdout: UNFINISHED_LOG, closes: false });
        const { subject, events } = reattacher({ access, spawn: () => child });

        const running = subject.resume("world-abc123");
        await untilRunning(subject);
        expect(subject.activeRenderIds()).toEqual(["world-abc123"]);
        expect(subject.cancel("world-abc123")).toBe(true);
        const result = await running;

        expect(access.stopped).toEqual(["worldlens-world-abc123"]);
        expect(result.ok).toBe(true);
        // A cancelled render is cancelled, never a failure with a code.
        expect(events.some((event) => event.type === "cancelled")).toBe(true);
        expect(events.some((event) => event.type === "failed")).toBe(false);
    });

    it("answers false for a render it is not driving", () => {
        const { subject } = reattacher({ access: fakeAccess({ state: "running" }) });
        expect(subject.cancel("nothing-like-this")).toBe(false);
    });
});

describe("refusals", () => {
    it("says there is nothing to reattach to when no record exists", async () => {
        const { subject } = reattacher({ access: fakeAccess({ state: "running" }) });
        const result = await subject.resume("world-abc123");
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe("no-record");
        expect(result.message).toContain("only what is missing");
    });
});

describe("a container on this computer", () => {
    it("collects nothing, because a bind mount has been writing the tiles all along", async () => {
        const access = localContainerAccess({
            runner: () =>
                Promise.resolve({ ok: true, exitCode: 0, stdout: "", stderr: "", spawnError: null }),
            exists: () => Promise.resolve(true),
        });
        const report = await access.collect(record());
        expect(report.ok).toBe(true);
        expect(report.message).toContain("where the container wrote them");
    });

    it("refuses honestly when the output folder somebody deleted is not there", async () => {
        const access = localContainerAccess({
            runner: () =>
                Promise.resolve({ ok: true, exitCode: 0, stdout: "", stderr: "", spawnError: null }),
            exists: () => Promise.resolve(false),
        });
        const report = await access.collect(record());
        expect(report.ok).toBe(false);
        expect(report.message).toContain("start from nothing");
    });

    it("stops a container by asking the daemon, with the grace period the JVM needs", async () => {
        const calls: string[][] = [];
        const access = localContainerAccess({
            runner: (command, args) => {
                calls.push([command, ...args]);
                return Promise.resolve({
                    ok: true,
                    exitCode: 0,
                    stdout: "",
                    stderr: "",
                    spawnError: null,
                });
            },
        });
        await access.stop("worldlens-world-abc123");
        expect(calls[0]).toEqual([
            "docker",
            "stop",
            "--time",
            "8",
            "worldlens-world-abc123",
        ]);
    });
});
