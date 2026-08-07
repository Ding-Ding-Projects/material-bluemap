import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { EngineProcess, type EngineChildProcess, type SpawnEngine } from "./process.js";
import { planDockerLaunch, planLocalLaunch, type EngineLaunch } from "./plan.js";
import type { RenderSignal } from "../render/progress.js";

/**
 * A child process that prints what it is told and then closes.
 *
 * Real enough for the whole reading path - both streams, line splitting, the close event -
 * without spawning anything, which is what lets the Docker path be exercised on a machine
 * with no Docker.
 */
function fakeChild(options: {
    readonly stdout?: readonly string[];
    readonly stderr?: readonly string[];
    readonly exitCode?: number | null;
    /** When false, the child stays open until `kill` is called. */
    readonly closes?: boolean;
}): EngineChildProcess & { readonly killed: string[] } {
    const emitter = new EventEmitter();
    const killed: string[] = [];
    const child = emitter as unknown as EngineChildProcess & { killed: string[]; exitCode: number | null };
    const stdout = Readable.from(options.stdout ?? []);
    const stderr = Readable.from(options.stderr ?? []);
    Object.assign(child, {
        stdout,
        stderr,
        killed,
        exitCode: null,
        kill(signal: string): boolean {
            killed.push(signal);
            emitter.emit("close", options.exitCode ?? null, signal);
            return true;
        },
    });
    if (options.closes !== false) {
        // After the streams have been consumed, which is what a real process does.
        setTimeout(() => emitter.emit("close", options.exitCode ?? 0, null), 0);
    }
    return child as EngineChildProcess & { readonly killed: string[] };
}

const LOCAL: EngineLaunch = planLocalLaunch({
    role: "render",
    javaExecutable: "/opt/jdk/bin/java",
    jarPath: "/opt/app/cli.jar",
    configDir: "/srv/render/config",
    cwd: "/srv/render",
});

const DOCKER: EngineLaunch = planDockerLaunch({
    role: "render",
    containerName: "worldlens-render-test",
    jarPath: "/opt/app/cli.jar",
    hostConfigDir: "/srv/render/config-container",
    hostDataDir: "/srv/render/data",
    hostWebRoot: "/srv/render/web",
    worlds: [{ mapId: "overworld", hostPath: "/srv/saves/world" }],
    cwd: "/srv/render",
    mountOptions: { platform: "linux", home: "/home/somebody" },
});

const RENDER_LOG = [
    "[12:45:50 INFO] Loading resources...\n",
    "[12:45:52 INFO] Loading map 'overworld'...\n",
    "[12:45:53 INFO] Start updating 1 maps ...\n",
    "[12:46:03 INFO] updating map 'overworld': 25.663% (ETA: 47 seconds)\n",
    "[12:47:11 INFO] Your maps are now all up-to-date!\n",
];

describe("running the engine", () => {
    it("reads the same progress out of a local run and a containerised one", async () => {
        const results = [];
        for (const launch of [LOCAL, DOCKER]) {
            const signals: RenderSignal[] = [];
            const spawn: SpawnEngine = () => fakeChild({ stdout: RENDER_LOG });
            const run = new EngineProcess({
                launch,
                spawn,
                onSignal: (signal) => signals.push(signal),
            });
            const result = await run.start();
            results.push({ result, signals });
        }

        for (const { result, signals } of results) {
            expect(result.exitCode).toBe(0);
            expect(result.upToDate).toBe(true);
            expect(result.mapsScheduled).toBe(1);
            expect(result.mapsLoaded).toEqual(["overworld"]);
            expect(signals.filter((signal) => signal.kind === "progress")).toHaveLength(1);
            expect(signals.filter((signal) => signal.kind === "phase").length).toBeGreaterThan(0);
        }
        // Not "both produced something", but "both produced the same thing".
        expect(results[0]?.signals).toEqual(results[1]?.signals);
    });

    it("keeps stderr for the repair pass, and records warnings as diagnostics", async () => {
        const spawn: SpawnEngine = () =>
            fakeChild({
                stdout: ["[12:45:50 WARNING] something looks wrong\n"],
                stderr: ["[12:45:51 ERROR] Failed to load world overworld!\n", "\tat de.bluecolored...\n"],
                exitCode: 1,
            });
        const run = new EngineProcess({ launch: LOCAL, spawn });
        const result = await run.start();

        expect(result.exitCode).toBe(1);
        expect(result.diagnostics).toContain("[WARNING] something looks wrong");
        expect(result.diagnostics).toContain("[ERROR] Failed to load world overworld!");
        expect(result.stderr).toEqual([
            "[12:45:51 ERROR] Failed to load world overworld!",
            "\tat de.bluecolored...",
        ]);
    });

    it("reports a spawn failure as a value rather than throwing it", async () => {
        const spawn: SpawnEngine = () => {
            const error = new Error("spawn java ENOENT") as Error & { code: string };
            error.code = "ENOENT";
            throw error;
        };
        const run = new EngineProcess({ launch: LOCAL, spawn });
        const result = await run.start();
        expect(result.spawnError).toBe("ENOENT");
        expect(result.exitCode).toBeNull();
    });

    it("notices the engine refusing for want of the Mojang download", async () => {
        const spawn: SpawnEngine = () =>
            fakeChild({
                stdout: [
                    "[12:45:50 WARNING] You must accept the required file download in order for BlueMap to work!\n",
                ],
                exitCode: 2,
            });
        const result = await new EngineProcess({ launch: LOCAL, spawn }).start();
        expect(result.consentMissing).toBe(true);
    });

    it("collects upstream's setup-problem banner", async () => {
        const spawn: SpawnEngine = () =>
            fakeChild({
                stdout: [
                    "################################\n",
                    "There is a problem with your BlueMap setup!\n",
                    "'/srv/saves/nowhere' does not exist or is no directory!\n",
                    "################################\n",
                ],
                exitCode: 1,
            });
        const result = await new EngineProcess({ launch: LOCAL, spawn }).start();
        expect(result.setupProblems.join("\n")).toContain("does not exist or is no directory");
    });
});

describe("cancelling", () => {
    it("asks the daemon to stop the container, because killing the client would orphan it", async () => {
        const stopped: string[] = [];
        const child = fakeChild({ closes: false, exitCode: 143 });
        const run = new EngineProcess({
            launch: DOCKER,
            spawn: () => child,
            stopContainer: async (name) => {
                stopped.push(name);
                await Promise.resolve();
            },
        });
        const finished = run.start();
        // Let the spawn happen before the cancel arrives, which is the ordinary case.
        await new Promise((resolve) => setTimeout(resolve, 0));
        run.cancel();
        const result = await finished;

        expect(stopped).toEqual(["worldlens-render-test"]);
        expect(result.cancelled).toBe(true);
        expect(run.isCancelled()).toBe(true);
    });

    it("kills nothing by name for a local run, and still ends it", async () => {
        const stopped: string[] = [];
        const child = fakeChild({ closes: false });
        const run = new EngineProcess({
            launch: LOCAL,
            spawn: () => child,
            stopContainer: async (name) => {
                stopped.push(name);
                await Promise.resolve();
            },
        });
        const finished = run.start();
        await new Promise((resolve) => setTimeout(resolve, 0));
        run.cancel();
        const result = await finished;

        expect(stopped).toEqual([]);
        expect(child.killed).toEqual(["SIGINT"]);
        expect(result.cancelled).toBe(true);
    });

    it("is safe before anything has been spawned, and does not then spawn one", async () => {
        let spawned = 0;
        const run = new EngineProcess({
            launch: LOCAL,
            spawn: () => {
                spawned += 1;
                return fakeChild({});
            },
        });
        run.cancel();
        const result = await run.start();
        expect(spawned).toBe(0);
        expect(result.cancelled).toBe(true);
    });

    it("is safe to ask for twice", async () => {
        const child = fakeChild({ closes: false });
        const run = new EngineProcess({ launch: LOCAL, spawn: () => child });
        const finished = run.start();
        await new Promise((resolve) => setTimeout(resolve, 0));
        run.cancel();
        run.cancel();
        await finished;
        expect(child.killed).toEqual(["SIGINT"]);
    });

    it("does not let a failing stop leave the caller waiting", async () => {
        const child = fakeChild({ closes: false });
        const run = new EngineProcess({
            launch: DOCKER,
            spawn: () => child,
            stopContainer: () => Promise.reject(new Error("the daemon went away")),
        });
        const finished = run.start();
        await new Promise((resolve) => setTimeout(resolve, 0));
        run.cancel();
        const result = await finished;
        expect(result.cancelled).toBe(true);
    });
});
