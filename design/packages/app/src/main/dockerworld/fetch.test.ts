import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DockerWorldFetcher, dockerWorldFetchId } from "./fetch.js";
import type { DockerWorldEvent } from "./fetch.js";
import type { CommandOutput, CommandRunner } from "../runtime/command.js";

function output(partial: Partial<CommandOutput>): CommandOutput {
    return {
        ok: partial.ok ?? false,
        exitCode: partial.exitCode ?? null,
        stdout: partial.stdout ?? "",
        stderr: partial.stderr ?? "",
        spawnError: partial.spawnError ?? null,
    };
}

const DOCKER_VERSION_OK = output({
    ok: true,
    exitCode: 0,
    stdout: JSON.stringify({ Client: { Version: "27.4.0" }, Server: { Version: "27.4.0" } }),
});

async function writeFixtureWorld(dir: string): Promise<void> {
    await mkdir(join(dir, "region"), { recursive: true });
    await writeFile(join(dir, "level.dat"), "a real level.dat, or close enough for a test");
    await writeFile(join(dir, "region", "r.0.0.mca"), "region bytes");
}

function containerJson(
    mounts: readonly { Type: string; Source: string; Name?: string; Destination: string; RW: boolean }[],
    running: boolean,
): string {
    return JSON.stringify([
        {
            Id: "abc123",
            Name: "/mc-server",
            Config: { Image: "itzg/minecraft-server" },
            State: { Running: running, StartedAt: running ? "2026-08-04T00:00:00Z" : "0001-01-01T00:00:00Z", Status: running ? "running" : "exited" },
            Mounts: mounts,
        },
    ]);
}

let workDir = "";
let destination = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mb-dockerworld-fetch-"));
    destination = join(workDir, "destination");
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

describe("no Docker daemon", () => {
    it("fails inspect() and fetch() without touching the destination", async () => {
        const runner: CommandRunner = () =>
            Promise.resolve(output({ exitCode: 1, stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?" }));
        const fetcher = new DockerWorldFetcher({ runner });

        const result = await fetcher.fetch({ source: { kind: "container", containerId: "abc123", mountDestination: "/data/world" }, destination });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("daemon-unreachable");
    });
});

describe("permission denied", () => {
    it("reports 'refused' rather than 'daemon-unreachable'", async () => {
        const runner: CommandRunner = () =>
            Promise.resolve(output({ exitCode: 1, stderr: "Got permission denied while trying to connect to the Docker daemon socket" }));
        const fetcher = new DockerWorldFetcher({ runner });

        const result = await fetcher.fetch({ source: { kind: "volume", volumeName: "mc-world" }, destination });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("refused");
    });
});

describe("volume not found", () => {
    it("reports not-found rather than a generic failure", async () => {
        const runner: CommandRunner = (command, args) => {
            if (args[0] === "version") return Promise.resolve(DOCKER_VERSION_OK);
            return Promise.resolve(output({ exitCode: 1, stderr: "Error: No such volume: mystery" }));
        };
        const fetcher = new DockerWorldFetcher({ runner });
        const result = await fetcher.fetch({ source: { kind: "volume", volumeName: "mystery" }, destination });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("not-found");
    });
});

describe("a stopped container's bind-mounted world", () => {
    it("fetches successfully with no acknowledgement needed - the safe, common case", async () => {
        const worldDir = join(workDir, "world");
        await writeFixtureWorld(worldDir);

        const runner: CommandRunner = (command, args) => {
            if (args[0] === "version") return Promise.resolve(DOCKER_VERSION_OK);
            if (args[0] === "inspect") {
                return Promise.resolve(
                    output({
                        ok: true,
                        exitCode: 0,
                        stdout: containerJson([{ Type: "bind", Source: worldDir, Destination: "/data/world", RW: false }], false),
                    }),
                );
            }
            return Promise.resolve(output({ exitCode: 1, stderr: "unexpected call" }));
        };

        const events: DockerWorldEvent[] = [];
        const fetcher = new DockerWorldFetcher({ runner, onEvent: (event) => events.push(event) });
        const result = await fetcher.fetch({ source: { kind: "container", containerId: "abc123", mountDestination: "/data/world" }, destination });

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.filesCopied).toBeGreaterThan(0);
        expect(await readFile(join(destination, "level.dat"), "utf8")).toContain("level.dat");
        expect(events.some((event) => event.type === "started")).toBe(true);
        expect(events.some((event) => event.type === "finished")).toBe(true);
        expect(events.some((event) => event.type === "log" && event.level === "warning")).toBe(false);
    });
});

describe("a running container's bind-mounted world", () => {
    function runnerFor(worldDir: string): CommandRunner {
        return (command, args) => {
            if (args[0] === "version") return Promise.resolve(DOCKER_VERSION_OK);
            if (args[0] === "inspect") {
                return Promise.resolve(
                    output({
                        ok: true,
                        exitCode: 0,
                        stdout: containerJson([{ Type: "bind", Source: worldDir, Destination: "/data/world", RW: false }], true),
                    }),
                );
            }
            return Promise.resolve(output({ exitCode: 1, stderr: "unexpected call" }));
        };
    }

    it("refuses to read it without acknowledgement, and never writes to the destination", async () => {
        const worldDir = join(workDir, "world");
        await writeFixtureWorld(worldDir);
        const fetcher = new DockerWorldFetcher({ runner: runnerFor(worldDir) });

        const result = await fetcher.fetch({ source: { kind: "container", containerId: "abc123", mountDestination: "/data/world" }, destination });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.code).toBe("live-world-not-acknowledged");
            expect(result.failure.message).toContain("mc-server");
        }
        await expect(readFile(join(destination, "level.dat"))).rejects.toThrow();
    });

    it("proceeds and warns when the risk is explicitly accepted", async () => {
        const worldDir = join(workDir, "world");
        await writeFixtureWorld(worldDir);
        const events: DockerWorldEvent[] = [];
        const fetcher = new DockerWorldFetcher({ runner: runnerFor(worldDir), onEvent: (event) => events.push(event) });

        const result = await fetcher.fetch({
            source: { kind: "container", containerId: "abc123", mountDestination: "/data/world" },
            destination,
            acknowledgeLiveRisk: true,
        });
        expect(result.ok).toBe(true);
        const warning = events.find((event) => event.type === "log" && event.level === "warning");
        expect(warning).toBeDefined();
        if (warning?.type === "log") expect(warning.message).toContain("torn region file");
    });
});

describe("a copied-out path that is not a world", () => {
    it("reports not-a-world rather than a bare validation error", async () => {
        const notAWorld = join(workDir, "not-a-world");
        await mkdir(notAWorld, { recursive: true });
        await writeFile(join(notAWorld, "readme.txt"), "just some files, no level.dat here");

        const runner: CommandRunner = (command, args) => {
            if (args[0] === "version") return Promise.resolve(DOCKER_VERSION_OK);
            if (args[0] === "inspect") {
                return Promise.resolve(
                    output({ ok: true, exitCode: 0, stdout: containerJson([{ Type: "bind", Source: notAWorld, Destination: "/data/world", RW: false }], false) }),
                );
            }
            return Promise.resolve(output({ exitCode: 1, stderr: "unexpected call" }));
        };

        const fetcher = new DockerWorldFetcher({ runner });
        const result = await fetcher.fetch({ source: { kind: "container", containerId: "abc123", mountDestination: "/data/world" }, destination });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("not-a-world");
    });
});

describe("a container-copy route (host path not directly reachable)", () => {
    /** Simulates `docker cp` by writing the fixture world into whatever staging path was named. */
    function runnerWithFakeCp(): CommandRunner {
        return (command, args) => {
            if (args[0] === "version") return Promise.resolve(DOCKER_VERSION_OK);
            if (args[0] === "inspect") {
                return Promise.resolve(
                    output({
                        ok: true,
                        exitCode: 0,
                        // A path that certainly does not exist on this test machine, so
                        // `resolve.ts`'s default local directoryExists check answers false
                        // and the fetch takes the container-copy route.
                        stdout: containerJson([{ Type: "bind", Source: "/this/path/does/not/exist/on/this/machine", Destination: "/data/world", RW: false }], false),
                    }),
                );
            }
            if (args[0] === "cp") {
                const staging = args[2] as string;
                return writeFixtureWorld(staging).then(() => output({ ok: true, exitCode: 0 }));
            }
            return Promise.resolve(output({ exitCode: 1, stderr: "unexpected call" }));
        };
    }

    it("stages through `docker cp` and places the result into the destination", async () => {
        const fetcher = new DockerWorldFetcher({ runner: runnerWithFakeCp() });
        const result = await fetcher.fetch({ source: { kind: "container", containerId: "abc123", mountDestination: "/data/world" }, destination });
        expect(result.ok).toBe(true);
        expect(await readFile(join(destination, "level.dat"), "utf8")).toContain("level.dat");
    });

    it("cleans up its own staging directory afterwards", async () => {
        let stagingPath: string | null = null;
        const runner: CommandRunner = (command, args) => {
            if (args[0] === "version") return Promise.resolve(DOCKER_VERSION_OK);
            if (args[0] === "inspect") {
                return Promise.resolve(
                    output({ ok: true, exitCode: 0, stdout: containerJson([{ Type: "bind", Source: "/nope", Destination: "/data/world", RW: false }], false) }),
                );
            }
            if (args[0] === "cp") {
                stagingPath = args[2] as string;
                return writeFixtureWorld(stagingPath).then(() => output({ ok: true, exitCode: 0 }));
            }
            return Promise.resolve(output({ exitCode: 1 }));
        };
        const fetcher = new DockerWorldFetcher({ runner });
        await fetcher.fetch({ source: { kind: "container", containerId: "abc123", mountDestination: "/data/world" }, destination });
        if (stagingPath === null) throw new Error("the fake 'cp' handler never ran");
        await expect(readFile(join(stagingPath, "level.dat"))).rejects.toThrow();
    });
});

describe("a volume-copy route", () => {
    it("stages through the disposable-container idiom and places the result into the destination", async () => {
        const runner: CommandRunner = (command, args) => {
            if (args[0] === "version") return Promise.resolve(DOCKER_VERSION_OK);
            if (args[0] === "volume" && args[1] === "inspect") {
                return Promise.resolve(
                    output({ ok: true, exitCode: 0, stdout: JSON.stringify([{ Name: "mc-world", Driver: "local", Mountpoint: "/var/lib/docker/volumes/mc-world/_data" }]) }),
                );
            }
            if (args[0] === "run") {
                const bindArg = args.find((entry) => entry.includes(":/mb-staging"));
                const staging = bindArg?.split(":/mb-staging")[0] ?? null;
                if (staging === null) return Promise.resolve(output({ exitCode: 1, stderr: "no staging bind found" }));
                return writeFixtureWorld(staging).then(() => output({ ok: true, exitCode: 0 }));
            }
            return Promise.resolve(output({ exitCode: 1, stderr: "unexpected call" }));
        };
        const fetcher = new DockerWorldFetcher({ runner });
        const result = await fetcher.fetch({ source: { kind: "volume", volumeName: "mc-world" }, destination });
        expect(result.ok).toBe(true);
        expect(await readFile(join(destination, "level.dat"), "utf8")).toContain("level.dat");
    });
});

describe("cancellation", () => {
    it("reports 'cancelled' and leaves the destination without the copy it interrupted", async () => {
        const worldDir = join(workDir, "world");
        await writeFixtureWorld(worldDir);

        const runner: CommandRunner = (command, args) => {
            if (args[0] === "version") return Promise.resolve(DOCKER_VERSION_OK);
            if (args[0] === "inspect") {
                return Promise.resolve(
                    output({ ok: true, exitCode: 0, stdout: containerJson([{ Type: "bind", Source: "/nope-not-reachable", Destination: "/data/world", RW: false }], false) }),
                );
            }
            if (args[0] === "cp") {
                const staging = args[2] as string;
                // Slow enough that the test below can call cancel() before it resolves.
                return new Promise((resolve) => {
                    setTimeout(() => {
                        writeFixtureWorld(staging).then(() => resolve(output({ ok: true, exitCode: 0 })));
                    }, 40);
                });
            }
            return Promise.resolve(output({ exitCode: 1 }));
        };

        const fetcher = new DockerWorldFetcher({ runner });
        const source = { kind: "container" as const, containerId: "abc123", mountDestination: "/data/world" };
        const fetchId = dockerWorldFetchId(source);

        const pending = fetcher.fetch({ source, destination });
        // Give `fetch()` a tick to register the id in `active` before cancelling it.
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(fetcher.activeFetchIds()).toContain(fetchId);
        expect(fetcher.cancel(fetchId)).toBe(true);

        const result = await pending;
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("cancelled");
        expect(fetcher.cancel(fetchId)).toBe(false);
        await expect(readFile(join(destination, "level.dat"))).rejects.toThrow();
    });
});
