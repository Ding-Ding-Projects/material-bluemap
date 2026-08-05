import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { candidateMounts, livenessWarning, remoteDirectoryExists, resolveContainerMount, resolveVolume } from "./resolve.js";
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

function fakeDocker(handler: (args: readonly string[]) => CommandOutput): CommandRunner {
    return (command, args) => {
        if (args[0] === "version") {
            return Promise.resolve(
                output({ ok: true, exitCode: 0, stdout: JSON.stringify({ Client: { Version: "27.4.0" }, Server: { Version: "27.4.0" } }) }),
            );
        }
        return Promise.resolve(handler(args));
    };
}

function containerJson(mounts: readonly { Type: string; Source: string; Name?: string; Destination: string; RW: boolean }[], running = false): string {
    return JSON.stringify([
        { Id: "abc123", Name: "/mc-server", Config: { Image: "x" }, State: { Running: running, StartedAt: "0001-01-01T00:00:00Z", Status: running ? "running" : "exited" }, Mounts: mounts },
    ]);
}

let workDir = "";

describe("resolveContainerMount", () => {
    it("refuses a destination the container has no mount at", async () => {
        const runner = fakeDocker(() => output({ ok: true, exitCode: 0, stdout: containerJson([]) }));
        const result = await resolveContainerMount("abc123", "/data/world", { runner });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("invalid-request");
    });

    it("routes bind-direct when the host path is directly reachable", async () => {
        const runner = fakeDocker(() =>
            output({ ok: true, exitCode: 0, stdout: containerJson([{ Type: "bind", Source: "/srv/mc/world", Destination: "/data/world", RW: false }]) }),
        );
        const result = await resolveContainerMount("abc123", "/data/world", {
            runner,
            directoryExists: (path) => Promise.resolve(path === "/srv/mc/world"),
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.route).toBe("bind-direct");
            expect(result.value.hostPath).toBe("/srv/mc/world");
        }
    });

    it("falls back to container-copy when the reported host path is not reachable", async () => {
        // Exactly the Docker Desktop case: `.Source` names a path inside the VM.
        const runner = fakeDocker(() =>
            output({ ok: true, exitCode: 0, stdout: containerJson([{ Type: "bind", Source: "/run/desktop/mnt/host/c/mc/world", Destination: "/data/world", RW: false }]) }),
        );
        const result = await resolveContainerMount("abc123", "/data/world", {
            runner,
            directoryExists: () => Promise.resolve(false),
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.route).toBe("container-copy");
            expect(result.value.hostPath).toBeNull();
            expect(result.value.containerId).toBe("abc123");
        }
    });

    it("routes a named-volume mount through container-copy when its mountpoint is not host-readable", async () => {
        const runner = fakeDocker(() =>
            output({
                ok: true,
                exitCode: 0,
                stdout: containerJson([{ Type: "volume", Source: "/var/lib/docker/volumes/mc-world/_data", Name: "mc-world", Destination: "/data/world", RW: false }]),
            }),
        );
        const result = await resolveContainerMount("abc123", "/data/world", {
            runner,
            directoryExists: () => Promise.resolve(false),
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.route).toBe("container-copy");
            expect(result.value.volumeName).toBe("mc-world");
        }
    });

    it("carries the running flag through to the candidate", async () => {
        const runner = fakeDocker(() =>
            output({ ok: true, exitCode: 0, stdout: containerJson([{ Type: "bind", Source: "/srv/mc/world", Destination: "/data/world", RW: false }], true) }),
        );
        const result = await resolveContainerMount("abc123", "/data/world", { runner, directoryExists: () => Promise.resolve(true) });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.running).toBe(true);
    });

    it("reports a container that does not exist", async () => {
        const runner = fakeDocker(() => output({ exitCode: 1, stderr: "Error: No such container: ghost" }));
        const result = await resolveContainerMount("ghost", "/data/world", { runner });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("not-found");
    });
});

describe("resolveVolume", () => {
    it("reports a volume that does not exist", async () => {
        const runner = fakeDocker(() => output({ exitCode: 1, stderr: "Error: No such volume: nope" }));
        const result = await resolveVolume("nope", { runner });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.code).toBe("not-found");
    });

    it("always routes through volume-copy - a mountpoint is never trusted as directly readable", async () => {
        const runner = fakeDocker(() =>
            output({ ok: true, exitCode: 0, stdout: JSON.stringify([{ Name: "mc-world", Driver: "local", Mountpoint: "/var/lib/docker/volumes/mc-world/_data" }]) }),
        );
        const result = await resolveVolume("mc-world", { runner });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.route).toBe("volume-copy");
            expect(result.value.hostPath).toBeNull();
            expect(result.value.containerId).toBeNull();
            expect(result.value.running).toBe(false);
        }
    });
});

describe("livenessWarning", () => {
    it("is null for a candidate that is not running", () => {
        expect(
            livenessWarning({ route: "bind-direct", containerId: "a", containerName: "mc", volumeName: null, containerPath: "/x", hostPath: "/x", running: false }),
        ).toBeNull();
    });

    it("names the container and the torn-region-file risk when running", () => {
        const warning = livenessWarning({
            route: "bind-direct",
            containerId: "a",
            containerName: "mc-server",
            volumeName: null,
            containerPath: "/x",
            hostPath: "/x",
            running: true,
        });
        expect(warning).toContain("mc-server");
        expect(warning).toContain("torn region file");
    });
});

describe("candidateMounts", () => {
    it("keeps bind and volume mounts and drops tmpfs", () => {
        const mounts = candidateMounts({
            id: "a",
            name: "mc",
            image: "x",
            status: "running",
            running: true,
            startedAt: null,
            mounts: [
                { type: "bind", source: "/a", volumeName: null, destination: "/data", readOnly: false },
                { type: "volume", source: "/b", volumeName: "v", destination: "/logs", readOnly: false },
                { type: "tmpfs", source: "", volumeName: null, destination: "/tmp", readOnly: false },
            ],
        });
        expect(mounts.map((m) => m.type)).toEqual(["bind", "volume"]);
    });
});

describe("remoteDirectoryExists", () => {
    it("runs `test -d` through the given runner", async () => {
        let seen: { command: string; args: readonly string[] } | null = null;
        const runner: CommandRunner = (command, args) => {
            seen = { command, args };
            return Promise.resolve(output({ ok: true, exitCode: 0 }));
        };
        const exists = remoteDirectoryExists(runner);
        expect(await exists("/srv/mc/world")).toBe(true);
        expect(seen).toEqual({ command: "test", args: ["-d", "/srv/mc/world"] });
    });

    it("is false when the remote command fails", async () => {
        const runner: CommandRunner = () => Promise.resolve(output({ ok: false, exitCode: 1 }));
        expect(await remoteDirectoryExists(runner)("/nope")).toBe(false);
    });
});

describe("directoryExists default (local fs)", () => {
    it("resolveContainerMount reads the real filesystem when no directoryExists override is given", async () => {
        workDir = await mkdtemp(join(tmpdir(), "mb-dockerworld-resolve-"));
        try {
            const worldDir = join(workDir, "world");
            await mkdir(worldDir, { recursive: true });
            const runner = fakeDocker(() =>
                output({ ok: true, exitCode: 0, stdout: containerJson([{ Type: "bind", Source: worldDir, Destination: "/data/world", RW: false }]) }),
            );
            const result = await resolveContainerMount("abc123", "/data/world", { runner });
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.value.route).toBe("bind-direct");
        } finally {
            await rm(workDir, { recursive: true, force: true });
        }
    });
});
