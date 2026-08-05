import { describe, expect, it } from "vitest";
import {
    inspectContainer,
    inspectVolume,
    listContainers,
    listVolumes,
} from "./inventory.js";
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

/** A runner that answers `docker version` as available and everything else from a queue. */
function fakeDocker(answers: readonly CommandOutput[]): CommandRunner {
    const queue = [...answers];
    const seen: { command: string; args: readonly string[] }[] = [];
    const runner: CommandRunner = (command, args) => {
        seen.push({ command, args });
        if (args[0] === "version") {
            return Promise.resolve(
                output({ ok: true, exitCode: 0, stdout: JSON.stringify({ Client: { Version: "27.4.0" }, Server: { Version: "27.4.0" } }) }),
            );
        }
        const next = queue.shift();
        return Promise.resolve(next ?? output({ ok: false, stderr: "unexpected call" }));
    };
    (runner as unknown as { seen: typeof seen }).seen = seen;
    return runner;
}

describe("listContainers", () => {
    it("reports the daemon being down without listing anything", async () => {
        const runner: CommandRunner = () =>
            Promise.resolve(output({ exitCode: 1, stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?" }));
        const result = await listContainers({ runner });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("daemon-unreachable");
    });

    it("reports a refused socket as permission trouble rather than a missing daemon", async () => {
        const runner: CommandRunner = () =>
            Promise.resolve(output({ exitCode: 1, stderr: "Got permission denied while trying to connect to the Docker daemon socket" }));
        const result = await listContainers({ runner });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("refused");
    });

    it("says Docker is not installed when there is no such command", async () => {
        const runner: CommandRunner = () => Promise.resolve(output({ spawnError: "ENOENT" }));
        const result = await listContainers({ runner });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("not-installed");
    });

    it("parses one JSON object per line and reads running from the status text", async () => {
        const line1 = JSON.stringify({ ID: "abc123", Names: "mc-server", Image: "itzg/minecraft-server", Status: "Up 3 hours" });
        const line2 = JSON.stringify({ ID: "def456", Names: "old-server", Image: "itzg/minecraft-server", Status: "Exited (0) 2 days ago" });
        const runner = fakeDocker([output({ ok: true, exitCode: 0, stdout: `${line1}\n${line2}\n` })]);
        const result = await listContainers({ runner });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toEqual([
            { id: "abc123", name: "mc-server", image: "itzg/minecraft-server", status: "Up 3 hours", running: true },
            { id: "def456", name: "old-server", image: "itzg/minecraft-server", status: "Exited (0) 2 days ago", running: false },
        ]);
    });

    it("skips a stray non-JSON line rather than failing the whole list", async () => {
        const line = JSON.stringify({ ID: "abc123", Names: "mc-server", Image: "x", Status: "Up 1 second" });
        const runner = fakeDocker([output({ ok: true, exitCode: 0, stdout: `a startup warning\n${line}\n` })]);
        const result = await listContainers({ runner });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toHaveLength(1);
    });
});

describe("listVolumes", () => {
    it("parses volume rows", async () => {
        const line = JSON.stringify({ Name: "mc-world", Driver: "local" });
        const runner = fakeDocker([output({ ok: true, exitCode: 0, stdout: `${line}\n` })]);
        const result = await listVolumes({ runner });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toEqual([{ name: "mc-world", driver: "local" }]);
    });

    it("reports the daemon being unreachable", async () => {
        const runner: CommandRunner = () => Promise.resolve(output({ exitCode: 1, stderr: "Cannot connect to the Docker daemon" }));
        const result = await listVolumes({ runner });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("daemon-unreachable");
    });
});

describe("inspectContainer", () => {
    it("reports a container that does not exist", async () => {
        const runner = fakeDocker([output({ exitCode: 1, stderr: "Error: No such container: nope" })]);
        const result = await inspectContainer("nope", { runner });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.code).toBe("not-found");
            expect(result.failure.message).toContain("nope");
        }
    });

    it("reads mounts, running state and the started timestamp", async () => {
        const json = JSON.stringify([
            {
                Id: "abc123",
                Name: "/mc-server",
                Config: { Image: "itzg/minecraft-server" },
                State: { Running: true, StartedAt: "2026-08-04T12:00:00Z", Status: "running" },
                Mounts: [
                    { Type: "bind", Source: "/srv/mc/world", Destination: "/data/world", RW: false },
                    { Type: "volume", Name: "mc-logs", Source: "/var/lib/docker/volumes/mc-logs/_data", Destination: "/data/logs", RW: true },
                ],
            },
        ]);
        const runner = fakeDocker([output({ ok: true, exitCode: 0, stdout: json })]);
        const result = await inspectContainer("abc123", { runner });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.name).toBe("mc-server");
        expect(result.value.running).toBe(true);
        expect(result.value.startedAt).toBe("2026-08-04T12:00:00Z");
        expect(result.value.mounts).toEqual([
            { type: "bind", source: "/srv/mc/world", volumeName: null, destination: "/data/world", readOnly: true },
            { type: "volume", source: "/var/lib/docker/volumes/mc-logs/_data", volumeName: "mc-logs", destination: "/data/logs", readOnly: false },
        ]);
    });

    it("treats the zero time as never started", async () => {
        const json = JSON.stringify([
            { Id: "abc", Name: "/never-run", Config: { Image: "x" }, State: { Running: false, StartedAt: "0001-01-01T00:00:00Z", Status: "created" }, Mounts: [] },
        ]);
        const runner = fakeDocker([output({ ok: true, exitCode: 0, stdout: json })]);
        const result = await inspectContainer("abc", { runner });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.startedAt).toBeNull();
    });
});

describe("inspectVolume", () => {
    it("reports a volume that does not exist", async () => {
        const runner = fakeDocker([output({ exitCode: 1, stderr: "Error: No such volume: mystery" })]);
        const result = await inspectVolume("mystery", { runner });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("not-found");
    });

    it("reads the mountpoint", async () => {
        const json = JSON.stringify([{ Name: "mc-world", Driver: "local", Mountpoint: "/var/lib/docker/volumes/mc-world/_data" }]);
        const runner = fakeDocker([output({ ok: true, exitCode: 0, stdout: json })]);
        const result = await inspectVolume("mc-world", { runner });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.mountpoint).toBe("/var/lib/docker/volumes/mc-world/_data");
    });
});
