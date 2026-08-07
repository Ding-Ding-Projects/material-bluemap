/**
 * Where a render runs, and what happens when the place it was asked for is not there.
 *
 * A separate file from `orchestrator.test.ts` on purpose. That one is the proof the local
 * path works end to end, and it is the path that must not move; leaving it untouched is
 * how a regression in it stays visible as a failure in *its* file rather than as a
 * conflict in a file about containers.
 *
 * **No Docker anywhere.** The daemon is a probe function that returns whatever state a
 * test wants, `docker run` is a fake spawn that runs a Node script instead, and `docker
 * stop` is a function that records the name it was given. A test that needed a daemon
 * would be a test that never ran on the machine where the container path breaks.
 */

import { spawn as nodeSpawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DockerReport } from "../runtime/docker.js";
import { ContainerHandoffStore, handoffFile } from "../runtime/handoff.js";
import type { SpawnEngine } from "../runtime/process.js";
import { RenderOrchestrator } from "./orchestrator.js";
import type { RenderEvent, RenderRequest, ResolvedEngine } from "./orchestrator.js";
import { readRenderRecord } from "./provenance.js";
import { resumeRequestFor } from "./resume.js";
import { newRenderSession } from "./session.js";
import { renderWorkspace } from "./workspace.js";

let root = "";
let storageDir = "";
let worldDir = "";

const RENDER_ID = "runtime-under-test";

const ENGINE: ResolvedEngine = {
    engine: "upstream-java",
    engineVersion: "5.22-27",
    enginePath: "/jars/cli-5.22-27-shadow.jar",
    javaExecutable: "/jdk/bin/java",
    javaVersion: "25.0.3",
};

const DOCKER_UP: DockerReport = {
    status: "available",
    clientVersion: "27.4.0",
    serverVersion: "27.4.0",
    message: "Docker 27.4.0 is installed and its daemon (27.4.0) is running.",
    detail: null,
};

/**
 * The common failure, and the one a generic "Docker is unavailable" would hide: Docker
 * Desktop is installed and simply not started.
 */
const DAEMON_DOWN: DockerReport = {
    status: "daemon-unreachable",
    clientVersion: "27.4.0",
    serverVersion: null,
    message: "Docker 27.4.0 is installed, but its daemon is not running. Start Docker and try again.",
    detail: "error during connect: open //./pipe/dockerDesktopLinuxEngine",
};

const COMPLETE_RENDER = [
    "[12:35:08 INFO] Loading resources...",
    "[12:35:09 INFO] Resources loaded.",
    "[12:35:09 INFO] Loading map 'overworld'...",
    "[12:35:09 INFO] Start updating 1 maps ...",
    "[12:35:19 INFO] updating map 'overworld': 100.0%",
    "[12:35:19 INFO] Your maps are now all up-to-date!",
    "[12:35:19 INFO] Stopped.",
];

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-runtime-"));
    storageDir = join(root, "maps");
    worldDir = join(root, "world");
    await mkdir(worldDir, { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

function request(overrides: Partial<RenderRequest> = {}): RenderRequest {
    return {
        maps: [{ id: "overworld", world: worldDir, name: "Overworld" }],
        renderId: RENDER_ID,
        ...overrides,
    };
}

/** A stand-in engine: prints the lines a real render prints, then leaves. */
async function fakeEngine(
    lines: readonly string[],
    options: { readonly sleepMs?: number } = {},
): Promise<string> {
    const script = join(root, `fake-${String(Math.random()).slice(2)}.mjs`);
    const body = [`const lines = ${JSON.stringify(lines)};`, "for (const line of lines) process.stdout.write(line + '\\n');"];
    body.push(
        options.sleepMs === undefined
            ? "process.exit(0);"
            : `setTimeout(() => process.exit(0), ${String(options.sleepMs)});`,
    );
    await writeFile(script, body.join("\n"), "utf8");
    return script;
}

/**
 * Runs the script instead of whatever was asked for, and keeps the command verbatim.
 *
 * The recorded command is the whole point for the container tests: it is the `docker run`
 * this application would really have issued, argument for argument.
 */
function spawnScript(script: string, seen: string[][], before?: () => void): SpawnEngine {
    return (command, args, options) => {
        before?.();
        seen.push([command, ...args]);
        return nodeSpawn(process.execPath, [script], {
            cwd: options.cwd,
            env: options.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
    };
}

/** Every value that followed a `-v`, which is every bind mount. */
function mountSpecs(command: readonly string[]): string[] {
    const specs: string[] = [];
    for (const [index, argument] of command.entries()) {
        if (argument !== "-v") continue;
        const spec = command[index + 1];
        if (spec !== undefined) specs.push(spec);
    }
    return specs;
}

/* -------------------------------------------------------------------------- */
/* Local is the default, and stays the default                                */
/* -------------------------------------------------------------------------- */

describe("the default runtime", () => {
    it("renders locally when the request names no runtime, and never asks about Docker", async () => {
        const script = await fakeEngine(COMPLETE_RENDER);
        const local: string[][] = [];
        const containers: string[][] = [];
        let probed = 0;

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: spawnScript(script, local),
            spawnEngine: spawnScript(script, containers),
            probeDocker: () => {
                probed += 1;
                return Promise.resolve(DOCKER_UP);
            },
        });

        const result = await orchestrator.render(request());

        expect(result.ok).toBe(true);
        expect(local).toHaveLength(1);
        expect(containers).toHaveLength(0);
        // The JVM, directly, exactly as before: no `docker`, no shell, no wrapper.
        expect(local[0]?.[0]).toBe(ENGINE.javaExecutable);
        // Not even the question. A default that probes for Docker is a default that
        // pauses on a machine with a broken `docker` on its PATH.
        expect(probed).toBe(0);

        const workspace = renderWorkspace(storageDir, RENDER_ID);
        expect(existsSync(workspace.configDir)).toBe(true);
        expect(existsSync(workspace.containerConfigDir)).toBe(false);
    }, 20_000);

    it("renders locally when local is asked for by name", async () => {
        const script = await fakeEngine(COMPLETE_RENDER);
        const local: string[][] = [];
        const containers: string[][] = [];

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: spawnScript(script, local),
            spawnEngine: spawnScript(script, containers),
            probeDocker: () => Promise.resolve(DOCKER_UP),
        });

        const result = await orchestrator.render(request({ runtime: "local" }));

        expect(result.ok).toBe(true);
        expect(local).toHaveLength(1);
        expect(containers).toHaveLength(0);

        // The record says so, which is how anybody can tell months later.
        const record = await readRenderRecord(renderWorkspace(storageDir, RENDER_ID).recordFile);
        expect(record?.runtime).toBe("local");
        // And the JVM that ran is named, because locally this application knows it.
        expect(record?.javaVersion).toBe("25.0.3");
    }, 20_000);

    it("refuses a runtime it does not have rather than rounding it down to local", async () => {
        const local: string[][] = [];
        const script = await fakeEngine(COMPLETE_RENDER);

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: spawnScript(script, local),
        });

        const result = await orchestrator.render(
            request({ runtime: "kubernetes" as unknown as "docker" }),
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("invalid-request");
        expect(result.failure.message).toContain("kubernetes");
        expect(local).toHaveLength(0);
    });
});

/* -------------------------------------------------------------------------- */
/* Docker plans a real container                                              */
/* -------------------------------------------------------------------------- */

describe("a container render", () => {
    it("starts a docker run with the mounts, the image and the engine arguments", async () => {
        const script = await fakeEngine(COMPLETE_RENDER);
        const containers: string[][] = [];
        const local: string[][] = [];

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawn: spawnScript(script, local),
            spawnEngine: spawnScript(script, containers),
            probeDocker: () => Promise.resolve(DOCKER_UP),
        });

        const result = await orchestrator.render(request({ runtime: "docker", jvmArgs: ["-Xmx4096m"] }));

        expect(result.ok).toBe(true);
        expect(local).toHaveLength(0);
        expect(containers).toHaveLength(1);

        const command = containers[0] ?? [];
        expect(command[0]).toBe("docker");
        expect(command[1]).toBe("run");
        expect(command).toContain("--rm");
        // `--init` is what makes `docker stop`'s SIGTERM reach the JVM at all.
        expect(command).toContain("--init");
        // Named, because a name is what `docker stop` and a person reading `docker ps` use.
        expect(command[command.indexOf("--name") + 1]).toContain("worldlens");

        const specs = mountSpecs(command);
        // The world, read-only. A render reads chunks and writes tiles; nothing about it
        // should be able to write into somebody's save.
        expect(specs.some((spec) => spec.endsWith(":/worlds/overworld:ro"))).toBe(true);
        expect(specs.some((spec) => spec.endsWith(":/bluemap/cli.jar:ro"))).toBe(true);
        expect(specs.some((spec) => spec.endsWith(":/bluemap/config"))).toBe(true);
        expect(specs.some((spec) => spec.endsWith(":/bluemap/data"))).toBe(true);
        expect(specs.some((spec) => spec.endsWith(":/bluemap/web"))).toBe(true);
        // Five and no more. Every extra bind mount is a hole in the isolation Docker is
        // being used for.
        expect(specs).toHaveLength(5);

        expect(command).toContain("eclipse-temurin:25-jre");

        // The engine's own arguments, in the container's own paths, with the heap ceiling
        // before `-jar` where a JVM reads it - anything after it is an argument to BlueMap
        // and is silently ignored.
        const java = command.indexOf("java");
        expect(command.slice(java)).toEqual([
            "java",
            "-Xmx4096m",
            "-jar",
            "/bluemap/cli.jar",
            "-c",
            "/bluemap/config",
            "-r",
            "-s",
        ]);
        // And *not* as a Docker memory limit, which is a different control with a
        // different failure: `-m` kills the container with exit 137 and no message.
        expect(command).not.toContain("-m");

        const workspace = renderWorkspace(storageDir, RENDER_ID);
        // The config a container reads names the container's paths, and is written into a
        // folder of its own so a later local render does not read Linux paths.
        const mapConf = await readFile(join(workspace.containerConfigDir, "maps", "overworld.conf"), "utf8");
        expect(mapConf).toContain('"/worlds/overworld"');
        const coreConf = await readFile(join(workspace.containerConfigDir, "core.conf"), "utf8");
        expect(coreConf).toContain('"/bluemap/data"');
        expect(existsSync(workspace.configDir)).toBe(false);

        // Every bind mount's host side exists before `docker run`. A missing source is not
        // an error to Docker: it creates the directory, on Linux owned by root, and the
        // tiles then land in a folder the person's own account cannot delete.
        expect(existsSync(workspace.containerConfigDir)).toBe(true);
        expect(existsSync(workspace.dataDir)).toBe(true);
        expect(existsSync(workspace.storageRoot)).toBe(true);
    }, 20_000);

    it("reports the same events a local render reports, and records the runtime", async () => {
        const script = await fakeEngine(COMPLETE_RENDER);
        const events: RenderEvent[] = [];

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawnEngine: spawnScript(script, []),
            probeDocker: () => Promise.resolve(DOCKER_UP),
            onEvent: (event) => events.push(event),
        });

        const result = await orchestrator.render(request({ runtime: "docker" }));
        expect(result.ok).toBe(true);

        const kinds = events.map((event) => event.type);
        expect(kinds).toContain("started");
        expect(kinds).toContain("phase");
        expect(kinds).toContain("progress");
        expect(kinds).toContain("finished");
        expect(kinds).not.toContain("failed");

        // The progress a container reports is the progress the same tracker read, so it
        // is the same shape, down to the percentage.
        const progress = events.find((event) => event.type === "progress");
        expect(progress?.type === "progress" && progress.task.percent).toBe(100);

        const record = await readRenderRecord(renderWorkspace(storageDir, RENDER_ID).recordFile);
        expect(record?.runtime).toBe("docker");
        expect(record?.outcome).toBe("finished");
        // No Java version: the JVM that ran was the image's, and naming this machine's
        // JDK beside container-rendered tiles would be a confident wrong answer.
        expect(record?.javaVersion).toBeNull();
    }, 20_000);
});

/* -------------------------------------------------------------------------- */
/* A refusal, never a quiet local render                                      */
/* -------------------------------------------------------------------------- */

describe("when Docker cannot take a container", () => {
    it("fails with the daemon's own reason and spawns nothing at all", async () => {
        const script = await fakeEngine(COMPLETE_RENDER);
        const local: string[][] = [];
        const containers: string[][] = [];
        const events: RenderEvent[] = [];
        let engineResolved = 0;

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => {
                engineResolved += 1;
                return Promise.resolve(ENGINE);
            },
            spawn: spawnScript(script, local),
            spawnEngine: spawnScript(script, containers),
            probeDocker: () => Promise.resolve(DAEMON_DOWN),
            onEvent: (event) => events.push(event),
        });

        const result = await orchestrator.render(request({ runtime: "docker" }));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("docker-unavailable");
        // The real reason, not a generic one. Somebody who has closed Docker Desktop is
        // told to start it rather than sent to install software they already have.
        expect(result.failure.message).toContain("its daemon is not running");
        expect(result.failure.message).toContain("27.4.0");
        expect(result.failure.detail).toContain("dockerDesktopLinuxEngine");

        // The whole point: no local render happened instead.
        expect(local).toHaveLength(0);
        expect(containers).toHaveLength(0);
        // And nothing was built or probed on the way to the refusal.
        expect(engineResolved).toBe(0);
        expect(existsSync(storageDir)).toBe(false);

        expect(events.filter((event) => event.type === "failed")).toHaveLength(1);
        expect(events.some((event) => event.type === "started")).toBe(false);
    });

    it("treats a probe that explodes as a refusal too", async () => {
        const containers: string[][] = [];
        const script = await fakeEngine(COMPLETE_RENDER);

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawnEngine: spawnScript(script, containers),
            probeDocker: () => Promise.reject(new Error("the probe itself fell over")),
        });

        const result = await orchestrator.render(request({ runtime: "docker" }));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("docker-unavailable");
        expect(result.failure.detail).toContain("the probe itself fell over");
        expect(containers).toHaveLength(0);
    });

    it("refuses a folder that may not be shared, and creates nothing", async () => {
        const containers: string[][] = [];
        const script = await fakeEngine(COMPLETE_RENDER);

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            spawnEngine: spawnScript(script, containers),
            probeDocker: () => Promise.resolve(DOCKER_UP),
            // The world folder chosen one level too high: the home directory itself.
            home: worldDir,
        });

        const result = await orchestrator.render(request({ runtime: "docker" }));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("container-mount-refused");
        expect(result.failure.message).toContain("home folder");
        expect(containers).toHaveLength(0);
        // A refusal that had already built a workspace would leave a directory behind for
        // a render that never happened.
        expect(existsSync(storageDir)).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/* The note that outlives the application                                     */
/* -------------------------------------------------------------------------- */

describe("the container handoff record", () => {
    it("is on disk before the container starts, and gone after it ends", async () => {
        const script = await fakeEngine(COMPLETE_RENDER);
        const store = new ContainerHandoffStore({ storageDir });
        const record = handoffFile(storageDir, RENDER_ID);
        let atSpawn: string | null = null;

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            containers: store,
            probeDocker: () => Promise.resolve(DOCKER_UP),
            // Read synchronously, from inside the spawn itself. Sampling it from the test
            // after a sleep would prove nothing about the ordering: the run is over in
            // milliseconds and the record is deliberately removed when it ends, so a late
            // read finds nothing whether the write came first or not.
            spawnEngine: spawnScript(script, [], () => {
                atSpawn = existsSync(record) ? readFileSync(record, "utf8") : null;
            }),
        });

        const result = await orchestrator.render(request({ runtime: "docker" }));
        expect(result.ok).toBe(true);

        const written: unknown = atSpawn === null ? null : JSON.parse(atSpawn);
        const presentAtSpawn = written !== null;

        // The whole reason it is written first: the application can be killed in the gap
        // between the write and the container starting, and a container with no record
        // beside it keeps rendering into a folder nobody is watching.
        expect(presentAtSpawn).toBe(true);
        expect((written as { containerName?: string } | null)?.containerName).toContain(
            "worldlens",
        );
        expect((written as { status?: string } | null)?.status).toBe("running");
        // Enough to find the container, read it, stop it, and know where its output goes.
        expect((written as { storageRoot?: string } | null)?.storageRoot).toBe(
            renderWorkspace(storageDir, RENDER_ID).storageRoot,
        );

        // Removed rather than marked finished: a finished record is a row in the offer
        // list saying "nothing to do here", and a list of those is a list nobody reads.
        expect(existsSync(record)).toBe(false);
    }, 20_000);

    it("is cleared even when the render fails", async () => {
        const script = await fakeEngine(["[12:35:09 INFO] Start updating 0 maps ...", "[12:35:09 INFO] Your maps are now all up-to-date!"]);
        const store = new ContainerHandoffStore({ storageDir });

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            containers: store,
            probeDocker: () => Promise.resolve(DOCKER_UP),
            spawnEngine: spawnScript(script, []),
        });

        const result = await orchestrator.render(request({ runtime: "docker" }));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        // Exit zero and "up-to-date" with nothing scheduled is not a render, and it is
        // classified by the same rule in both modes.
        expect(result.failure.code).toBe("no-maps-rendered");
        expect(existsSync(handoffFile(storageDir, RENDER_ID))).toBe(false);
    }, 20_000);
});

/* -------------------------------------------------------------------------- */
/* Carrying an interrupted render on keeps it where it was                    */
/* -------------------------------------------------------------------------- */

describe("resuming", () => {
    function session(runtime?: "local" | "docker") {
        return newRenderSession({
            renderId: RENDER_ID,
            maps: [{ id: "overworld", world: worldDir }],
            configDir: join(root, "config"),
            outputRoot: join(root, "web"),
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: null,
            startedAt: "2026-08-04T10:00:00.000Z",
            ownerInstance: "a-previous-launch",
            ...(runtime === undefined ? {} : { runtime }),
        });
    }

    it("carries a container render on in a container", () => {
        expect(resumeRequestFor(session("docker")).runtime).toBe("docker");
    });

    it("leaves the mode unstated for a session written before the field existed", () => {
        // Unstated is local, which is what every one of those renders was. Naming it here
        // would be inventing a fact; leaving it out lets the default speak.
        expect(resumeRequestFor(session()).runtime).toBeUndefined();
    });
});

/* -------------------------------------------------------------------------- */
/* Cancelling asks the daemon                                                 */
/* -------------------------------------------------------------------------- */

describe("cancelling a container render", () => {
    it("asks the daemon to stop the container by name", async () => {
        const script = await fakeEngine(COMPLETE_RENDER.slice(0, 4), { sleepMs: 30_000 });
        const stopped: string[] = [];
        const events: RenderEvent[] = [];

        const orchestrator = new RenderOrchestrator({
            storageDir,
            hasConsent: () => true,
            resolveEngine: () => Promise.resolve(ENGINE),
            probeDocker: () => Promise.resolve(DOCKER_UP),
            spawnEngine: spawnScript(script, []),
            stopContainer: (name) => {
                stopped.push(name);
                return Promise.resolve();
            },
            onEvent: (event) => events.push(event),
        });

        const started = orchestrator.render(request({ runtime: "docker" }));
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(orchestrator.activeRenderIds()).toEqual([RENDER_ID]);
        expect(orchestrator.cancel(RENDER_ID)).toBe(true);

        const result = await started;

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.code).toBe("cancelled");
        // The daemon, by name - not the `docker run` client. Killing the client stops the
        // watching and leaves the container rendering with nothing holding a handle to it.
        expect(stopped).toEqual([expect.stringContaining("worldlens")]);

        // Cancellation is its own event, never a red failure banner.
        expect(events.some((event) => event.type === "cancelled")).toBe(true);
        expect(events.some((event) => event.type === "failed")).toBe(false);

        const record = await readRenderRecord(renderWorkspace(storageDir, RENDER_ID).recordFile);
        expect(record?.outcome).toBe("cancelled");
        expect(record?.runtime).toBe("docker");
    }, 20_000);
});
