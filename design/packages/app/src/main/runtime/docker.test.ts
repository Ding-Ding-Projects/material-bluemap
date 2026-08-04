import { describe, expect, it } from "vitest";
import { dockerImagePresent, dockerUsable, probeDocker, readDockerVersion } from "./docker.js";
import type { CommandOutput, CommandRunner } from "./command.js";

/** An answer from a `docker` that never runs. */
function output(partial: Partial<CommandOutput>): CommandOutput {
    return {
        ok: partial.ok ?? false,
        exitCode: partial.exitCode ?? null,
        stdout: partial.stdout ?? "",
        stderr: partial.stderr ?? "",
        spawnError: partial.spawnError ?? null,
    };
}

const RUNNING = JSON.stringify({
    Client: { Version: "27.4.0" },
    Server: { Version: "27.4.0" },
});

const CLIENT_ONLY = JSON.stringify({ Client: { Version: "27.4.0" } });

describe("reading `docker version`", () => {
    it("reports an available daemon with both versions", () => {
        const report = readDockerVersion(output({ ok: true, exitCode: 0, stdout: RUNNING }));
        expect(report.status).toBe("available");
        expect(report.clientVersion).toBe("27.4.0");
        expect(report.serverVersion).toBe("27.4.0");
        expect(dockerUsable(report)).toBe(true);
    });

    it("says Docker is not installed when the command is not there", () => {
        const report = readDockerVersion(output({ spawnError: "ENOENT" }));
        expect(report.status).toBe("not-installed");
        expect(report.message).toContain("no 'docker' command");
        expect(dockerUsable(report)).toBe(false);
    });

    it("distinguishes an unstarted daemon from a missing installation, in Docker's Linux wording", () => {
        const report = readDockerVersion(
            output({
                exitCode: 1,
                stdout: CLIENT_ONLY,
                stderr:
                    "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?",
            }),
        );
        expect(report.status).toBe("daemon-unreachable");
        expect(report.clientVersion).toBe("27.4.0");
        expect(report.message).toContain("Docker 27.4.0 is installed");
        expect(report.message).toContain("daemon is not running");
    });

    it("recognises the Windows named-pipe wording as the same state", () => {
        const report = readDockerVersion(
            output({
                exitCode: 1,
                stdout: CLIENT_ONLY,
                stderr:
                    "error during connect: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.",
            }),
        );
        expect(report.status).toBe("daemon-unreachable");
    });

    it("reports a refused socket as a permission problem, not a missing daemon", () => {
        const report = readDockerVersion(
            output({
                exitCode: 1,
                stdout: CLIENT_ONLY,
                stderr: "Got permission denied while trying to connect to the Docker daemon socket",
            }),
        );
        expect(report.status).toBe("refused");
        expect(report.message).toContain("not allowed");
    });

    it("treats exit zero with no server section as a daemon that did not answer", () => {
        const report = readDockerVersion(output({ ok: true, exitCode: 0, stdout: CLIENT_ONLY }));
        expect(report.status).toBe("daemon-unreachable");
    });

    it("reports an unrecognised failure as unusable rather than guessing", () => {
        const report = readDockerVersion(
            output({ exitCode: 125, stdout: "", stderr: "something nobody has seen before" }),
        );
        expect(report.status).toBe("unusable");
        expect(report.detail).toBe("something nobody has seen before");
    });

    it("survives output that is not the JSON it asked for", () => {
        const report = readDockerVersion(output({ ok: true, exitCode: 0, stdout: "Client: 27.4.0" }));
        expect(report.status).toBe("daemon-unreachable");
        expect(report.clientVersion).toBeNull();
    });

    it("reports a launch failure that is not ENOENT as unusable, naming the code", () => {
        const report = readDockerVersion(output({ spawnError: "EACCES" }));
        expect(report.status).toBe("unusable");
        expect(report.message).toContain("EACCES");
    });
});

describe("probing", () => {
    it("asks docker for machine-readable output and never rejects", async () => {
        const seen: { command: string; args: readonly string[] }[] = [];
        const runner: CommandRunner = (command, args) => {
            seen.push({ command, args });
            return Promise.resolve(output({ ok: true, exitCode: 0, stdout: RUNNING }));
        };
        const report = await probeDocker({ runner, docker: "docker" });
        expect(report.status).toBe("available");
        expect(seen[0]?.args).toEqual(["version", "--format", "{{json .}}"]);
    });

    it("uses the command it was given, so a missing binary is a state and not a crash", async () => {
        const runner: CommandRunner = () => Promise.resolve(output({ spawnError: "ENOENT" }));
        const report = await probeDocker({ runner, docker: "not-docker" });
        expect(report.status).toBe("not-installed");
        expect(report.message).toContain("not-docker");
    });

    it("answers whether an image is already here without pulling one", async () => {
        const runner: CommandRunner = (_command, args) =>
            Promise.resolve(output({ ok: args.includes("present:1"), exitCode: 0 }));
        expect(await dockerImagePresent("present:1", { runner })).toBe(true);
        expect(await dockerImagePresent("absent:1", { runner })).toBe(false);
    });
});
