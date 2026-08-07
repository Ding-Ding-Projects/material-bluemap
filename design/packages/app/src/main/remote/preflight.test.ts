/**
 * The four checks, and the promise that each failure has its own fix in it.
 *
 * No SSH client, no `ssh-keyscan`, no Docker and no server: every command goes through a
 * fake runner that answers the way the real tools would. The cases that matter most are the
 * two the task exists to distinguish - "cannot reach the host" and "Docker is not installed
 * there" - because collapsing them sends somebody to install software on a machine that was
 * never the problem.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preflight, readDfAvailableBytes, resolveWorkDir } from "./preflight.js";
import {
    DOCKER_AVAILABLE,
    DOCKER_NOT_FOUND,
    SSH_AUTH_REFUSED,
    SSH_HOST_KEY_CHANGED,
    SSH_HOST_KEY_UNKNOWN,
    SSH_UNREACHABLE,
    df,
    fakeRunner,
    output,
    testTarget,
} from "./fakes.js";

let workDir = "";
let knownHostsFile = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-remote-"));
    knownHostsFile = join(workDir, "known_hosts");
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

/** A real ed25519 host key blob, so its fingerprint is a real SHA-256 of real bytes. */
const HOST_KEY = "AAAAC3NzaC1lZDI1NTE5AAAAIJ7Zt5cQKJhX0m0bZ0m2Q2K1nZ8xY6fW3Vd1aJ9kLm2p";
const KEYSCAN = output({
    stdout: `# render.example:2222 SSH-2.0-OpenSSH_9.6\n[render.example]:2222 ssh-ed25519 ${HOST_KEY}\n`,
});

function options(runner: ReturnType<typeof fakeRunner>, requiredBytes?: number) {
    return {
        target: testTarget(),
        knownHostsFile,
        runner: runner.runner,
        ...(requiredBytes === undefined ? {} : { requiredBytes }),
    };
}

/** The happy path's answers, in the order preflight asks for them. */
function healthyRunner(available = 900_000_000) {
    return fakeRunner([
        { when: /printf %s/, answer: output({ stdout: "/home/renderer" }) },
        { when: /docker' 'version/, answer: DOCKER_AVAILABLE },
        { when: /df -Pk/, answer: df(available) },
    ]);
}

describe("a host that is fine", () => {
    it("passes all four checks and resolves the work directory", async () => {
        const runner = healthyRunner();
        const report = await preflight(testTarget({ workDir: "~/renders" }), options(runner));

        expect(report.ok).toBe(true);
        expect(report.checks.map((check) => check.stage)).toEqual([
            "ssh",
            "host-key",
            "docker",
            "disk",
        ]);
        expect(report.checks.every((check) => check.ok)).toBe(true);
        // A container bind mount cannot expand a tilde, so this is the path everything
        // downstream is built from.
        expect(report.workDir).toBe("/home/renderer/renders");
        expect(report.freeBytes).toBe(900_000_000 * 1024);
    });

    it("says out loud that no password was offered", async () => {
        const report = await preflight(testTarget(), options(healthyRunner()));
        expect(report.checks[0]?.message).toContain("No password was offered or asked for");
    });
});

describe("a host that cannot be reached", () => {
    it("says so, and never mentions Docker", async () => {
        const runner = fakeRunner([{ when: /ssh/, answer: SSH_UNREACHABLE }]);
        const report = await preflight(testTarget(), options(runner));

        expect(report.ok).toBe(false);
        expect(report.failure?.remoteCode).toBe("unreachable");
        expect(report.failure?.message).toContain("did not answer");
        // Asking about Docker first would report "Docker is not installed" for a machine
        // that is simply switched off.
        expect(report.checks.some((check) => check.stage === "docker")).toBe(false);
        expect(runner.text()).not.toContain("docker");
    });

    it("nothing was spawned, so the failure reads as a request that cannot be carried out", async () => {
        const runner = fakeRunner([{ when: /ssh/, answer: SSH_UNREACHABLE }]);
        const report = await preflight(testTarget(), options(runner));
        expect(report.failure?.code).toBe("invalid-request");
        expect(report.failure?.exitCode).toBeNull();
    });

    it("reports a missing local ssh as a missing local ssh", async () => {
        const runner = fakeRunner([
            { when: /ssh/, answer: output({ ok: false, spawnError: "ENOENT" }) },
        ]);
        const report = await preflight(testTarget(), options(runner));
        expect(report.failure?.remoteCode).toBe("ssh-missing");
        expect(report.failure?.message).toContain("no 'ssh' command on this computer");
    });

    it("reports a refused key as a key problem with the fix on the key", async () => {
        const runner = fakeRunner([{ when: /ssh/, answer: SSH_AUTH_REFUSED }]);
        const report = await preflight(testTarget(), options(runner));
        expect(report.failure?.remoteCode).toBe("auth-refused");
        expect(report.failure?.message).toContain("never sends a password");
    });
});

describe("the host key", () => {
    it("refuses an unknown key and hands back fingerprints to compare", async () => {
        const runner = fakeRunner([
            { when: /printf %s/, answer: SSH_HOST_KEY_UNKNOWN },
            { when: /ssh-keyscan/, answer: KEYSCAN },
        ]);
        const report = await preflight(testTarget(), options(runner));

        expect(report.failure?.remoteCode).toBe("host-key-unknown");
        expect(report.hostKeys).toHaveLength(1);
        expect(report.hostKeys[0]?.type).toBe("ssh-ed25519");
        expect(report.hostKeys[0]?.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
        // Nothing was sent and nothing was trusted.
        expect(runner.text()).not.toContain("docker");
    });

    it("refuses a changed key with no fingerprint to accept", async () => {
        await writeFile(
            knownHostsFile,
            `[render.example]:2222 ssh-ed25519 ${HOST_KEY}\n`,
            "utf8",
        );
        const runner = fakeRunner([{ when: /printf %s/, answer: SSH_HOST_KEY_CHANGED }]);
        const report = await preflight(testTarget(), options(runner));

        expect(report.failure?.remoteCode).toBe("host-key-changed");
        // No button, so no fingerprint to put on one. A rebuilt server and an intercepted
        // connection look identical from here.
        expect(report.hostKeys).toEqual([]);
        expect(report.failure?.message).toContain("has to be removed deliberately");
        // And it did not even scan, because a scan is evidence for a decision that is not
        // being offered.
        expect(runner.text()).not.toContain("ssh-keyscan");
    });

    it("says so when the host will not offer a key at all", async () => {
        const runner = fakeRunner([
            { when: /printf %s/, answer: SSH_HOST_KEY_UNKNOWN },
            { when: /ssh-keyscan/, answer: output({ stderr: "connection closed" }) },
        ]);
        const report = await preflight(testTarget(), options(runner));
        expect(report.failure?.remoteCode).toBe("host-key-unavailable");
    });
});

describe("Docker on the remote host", () => {
    it("reports it missing, distinctly from the host being unreachable", async () => {
        const runner = fakeRunner([
            { when: /printf %s/, answer: output({ stdout: "/home/renderer" }) },
            { when: /docker' 'version/, answer: DOCKER_NOT_FOUND },
        ]);
        const report = await preflight(testTarget(), options(runner));

        expect(report.ok).toBe(false);
        expect(report.failure?.remoteCode).toBe("docker-missing");
        expect(report.docker?.status).toBe("not-installed");
        // The sentence is about the other machine, not about "this account's PATH".
        expect(report.failure?.message).toContain("has no 'docker' command");
        expect(report.failure?.message).toContain("renderer@render.example:2222");
        // The connection itself was fine, and the report says so.
        expect(report.checks.find((check) => check.stage === "ssh")?.ok).toBe(true);
        // Nothing was measured or created, because there was no point.
        expect(runner.text()).not.toContain("df -Pk");
    });

    it("tells a stopped daemon apart from a missing install", async () => {
        const runner = fakeRunner([
            { when: /printf %s/, answer: output({ stdout: "/home/renderer" }) },
            {
                when: /docker' 'version/,
                answer: output({
                    ok: false,
                    exitCode: 1,
                    stdout: JSON.stringify({ Client: { Version: "27.4.0" } }),
                    stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock.",
                }),
            },
        ]);
        const report = await preflight(testTarget(), options(runner));
        expect(report.failure?.remoteCode).toBe("docker-daemon-down");
        expect(report.failure?.message).toContain("its daemon is not running");
    });

    it("tells a refused daemon apart from both of those", async () => {
        const runner = fakeRunner([
            { when: /printf %s/, answer: output({ stdout: "/home/renderer" }) },
            {
                when: /docker' 'version/,
                answer: output({
                    ok: false,
                    exitCode: 1,
                    stdout: JSON.stringify({ Client: { Version: "27.4.0" } }),
                    stderr: "permission denied while trying to connect to the Docker daemon socket",
                }),
            },
        ]);
        const report = await preflight(testTarget(), options(runner));
        expect(report.failure?.remoteCode).toBe("docker-refused");
        expect(report.failure?.message).toContain("docker group");
    });
});

describe("disk space", () => {
    it("refuses a host that is too full, with both numbers in the sentence", async () => {
        const runner = healthyRunner(1_000_000);
        const report = await preflight(testTarget(), options(runner, 8_000_000_000));

        expect(report.ok).toBe(false);
        expect(report.failure?.remoteCode).toBe("not-enough-disk");
        expect(report.freeBytes).toBe(1_000_000 * 1024);
        expect(report.failure?.message).toMatch(/1\.0 GB free/);
        expect(report.failure?.message).toMatch(/8\.0 GB/);
    });

    it("skips the check rather than passing it when nobody said how much is needed", async () => {
        const report = await preflight(testTarget(), options(healthyRunner(1)));
        expect(report.ok).toBe(true);
    });

    it("reports a work directory it could not create", async () => {
        const runner = fakeRunner([
            { when: /printf %s/, answer: output({ stdout: "/home/renderer" }) },
            { when: /docker' 'version/, answer: DOCKER_AVAILABLE },
            {
                when: /df -Pk/,
                answer: output({ ok: false, exitCode: 1, stderr: "mkdir: Permission denied" }),
            },
        ]);
        const report = await preflight(testTarget(), options(runner));
        expect(report.failure?.remoteCode).toBe("remote-command-failed");
        expect(report.failure?.detail).toContain("Permission denied");
    });
});

describe("readDfAvailableBytes", () => {
    it("reads the Available column of a -P row and converts from 1K blocks", () => {
        expect(readDfAvailableBytes(df(2_048).stdout)).toBe(2_048 * 1024);
    });

    it("answers null for a header with no data, rather than guessing", () => {
        expect(
            readDfAvailableBytes("Filesystem 1024-blocks Used Available Capacity Mounted on\n"),
        ).toBeNull();
        expect(readDfAvailableBytes("")).toBeNull();
        expect(readDfAvailableBytes("something else entirely\n")).toBeNull();
    });
});

describe("resolveWorkDir", () => {
    it("expands a tilde against the resolved home", () => {
        expect(resolveWorkDir("~/renders", "/home/renderer")).toBe("/home/renderer/renders");
        expect(resolveWorkDir("~", "/home/renderer")).toBe("/home/renderer");
    });

    it("leaves an absolute path exactly as it is", () => {
        expect(resolveWorkDir("/srv/worldlens", "/home/renderer")).toBe(
            "/srv/worldlens",
        );
    });

    it("does not turn ~/renders into /renders when the home is empty", () => {
        // That would be a directory at the root of the remote filesystem that the account
        // cannot create, reported as a permission problem nobody could explain.
        expect(resolveWorkDir("~/renders", "")).toBe("~/renders");
    });
});
