import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { WebServer, type PortProbe } from "./webserver.js";
import { planDockerLaunch, planLocalLaunch } from "./plan.js";
import type { EngineChildProcess, SpawnEngine } from "./process.js";

function fakeChild(options: {
    readonly stdout?: readonly string[];
    readonly exitCode?: number | null;
    readonly closes?: boolean;
}): EngineChildProcess {
    const emitter = new EventEmitter();
    const child = emitter as unknown as EngineChildProcess & { exitCode: number | null };
    Object.assign(child, {
        stdout: Readable.from(options.stdout ?? []),
        stderr: Readable.from([]),
        exitCode: null,
        kill(signal: string): boolean {
            emitter.emit("close", options.exitCode ?? null, signal);
            return true;
        },
    });
    if (options.closes !== false) setTimeout(() => emitter.emit("close", options.exitCode ?? 1, null), 0);
    return child;
}

const LOCAL = planLocalLaunch({
    role: "web-server",
    javaExecutable: "/opt/jdk/bin/java",
    jarPath: "/opt/app/cli.jar",
    configDir: "/srv/render/config",
    cwd: "/srv/render",
    port: 8123,
});

const DOCKER = planDockerLaunch({
    role: "web-server",
    containerName: "material-bluemap-web-test",
    jarPath: "/opt/app/cli.jar",
    hostConfigDir: "/srv/render/config-container",
    hostDataDir: "/srv/render/data",
    hostWebRoot: "/srv/render/web",
    worlds: [],
    cwd: "/srv/render",
    publish: { hostPort: 8123, containerPort: 8100 },
    mountOptions: { platform: "linux", home: "/home/somebody" },
});

/** A probe that says "nothing yet" a few times and then "there it is". */
function answersAfter(attempts: number): { probe: PortProbe; seen: { host: string; port: number }[] } {
    const seen: { host: string; port: number }[] = [];
    let count = 0;
    const probe: PortProbe = (host, port) => {
        seen.push({ host, port });
        count += 1;
        return Promise.resolve(count > attempts);
    };
    return { probe, seen };
}

const immediately = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("starting the map web server", () => {
    it("reports a URL only after connecting to it, on a host address", async () => {
        const { probe, seen } = answersAfter(2);
        const spawn: SpawnEngine = () => fakeChild({ closes: false });
        const server = new WebServer({ launch: LOCAL, spawn, probe, delay: immediately });

        const start = await server.start();
        expect(start.ok).toBe(true);
        expect(start.ok === true && start.url).toBe("http://127.0.0.1:8123/");
        expect(seen.every((attempt) => attempt.host === "127.0.0.1" && attempt.port === 8123)).toBe(true);
        server.stop();
    });

    it("probes the published host port for a container, never the container's own", async () => {
        const { probe, seen } = answersAfter(0);
        const server = new WebServer({
            launch: DOCKER,
            spawn: () => fakeChild({ closes: false }),
            probe,
            delay: immediately,
            stopContainer: () => Promise.resolve(),
        });
        const start = await server.start();
        expect(start.ok === true && start.url).toBe("http://127.0.0.1:8123/");
        expect(seen[0]?.port).toBe(8123);
        server.stop();
    });

    it("reports the engine's own exit when it stops before answering", async () => {
        const probe: PortProbe = () => Promise.resolve(false);
        const server = new WebServer({
            launch: LOCAL,
            spawn: () =>
                fakeChild({
                    stdout: [
                        "[12:45:50 ERROR] BlueMap failed to bind to the configured address.\n",
                    ],
                    exitCode: 1,
                }),
            probe,
            delay: immediately,
        });

        const start = await server.start();
        expect(start.ok).toBe(false);
        if (start.ok) return;
        expect(start.reason).toContain("stopped before it answered");
        expect(start.reason).toContain("exit code 1");
        expect(start.result?.exitCode).toBe(1);
    });

    it("gives up honestly when the port never answers and the process never ends", async () => {
        let clock = 0;
        const server = new WebServer({
            launch: LOCAL,
            spawn: () => fakeChild({ closes: false }),
            probe: () => Promise.resolve(false),
            delay: async () => {
                clock += 1_000;
                await immediately();
            },
            now: () => clock,
            readyTimeoutMs: 3_000,
            pollMs: 10,
        });

        const start = await server.start();
        expect(start.ok).toBe(false);
        expect(start.ok === false && start.reason).toContain("did not answer");
        expect(start.ok === false && start.result).toBeNull();
        server.stop();
    });

    it("refuses to invent a URL for a launch with no published port", async () => {
        const noPort = planLocalLaunch({
            role: "web-server",
            javaExecutable: "/opt/jdk/bin/java",
            jarPath: "/opt/app/cli.jar",
            configDir: "/srv/render/config",
            cwd: "/srv/render",
        });
        const server = new WebServer({ launch: noPort, spawn: () => fakeChild({}), probe: () => Promise.resolve(true) });
        const start = await server.start();
        expect(start.ok).toBe(false);
        expect(start.ok === false && start.reason).toContain("without a port to publish");
    });

    it("says a missing program could not be started rather than that the port is quiet", async () => {
        const server = new WebServer({
            launch: LOCAL,
            spawn: () => {
                const error = new Error("spawn java ENOENT") as Error & { code: string };
                error.code = "ENOENT";
                throw error;
            },
            probe: () => Promise.resolve(false),
            delay: immediately,
        });
        const start = await server.start();
        expect(start.ok === false && start.reason).toContain("not found");
    });

    it("stops a container through the daemon", async () => {
        const stopped: string[] = [];
        const server = new WebServer({
            launch: DOCKER,
            spawn: () => fakeChild({ closes: false }),
            probe: () => Promise.resolve(true),
            delay: immediately,
            stopContainer: async (name) => {
                stopped.push(name);
                await Promise.resolve();
            },
        });
        await server.start();
        server.stop();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(stopped).toEqual(["material-bluemap-web-test"]);
    });
});
