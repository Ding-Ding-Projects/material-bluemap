import { describe, expect, it, vi } from "vitest";

import {
    SSH_AUTH_REFUSED,
    SSH_HOST_KEY_CHANGED,
    SSH_HOST_KEY_UNKNOWN,
    SSH_UNREACHABLE,
    fakeRunner,
    fakeTransfer,
    output,
    testTarget,
} from "./fakes.js";
import { TransferError } from "./transfer.js";
import {
    checkRemoteWorldPath,
    connectAndDetectHost,
    diffRemoteWorldSurveys,
    fetchRemoteWorld,
    remoteWorldChanged,
    surveyRemoteWorld,
    type RemoteWorldEntry,
    type RemoteWorldSshOptions,
} from "./worldsource.js";

const KNOWN_HOSTS = "C:/fake/known_hosts";

function baseOptions(runner?: ReturnType<typeof fakeRunner>["runner"]): RemoteWorldSshOptions {
    return { knownHostsFile: KNOWN_HOSTS, ...(runner === undefined ? {} : { runner }) };
}

describe("connectAndDetectHost", () => {
    it("detects a POSIX host from a single uname probe", async () => {
        const fake = fakeRunner([{ when: /uname -s/, answer: output({ stdout: "Linux\n" }) }]);
        const result = await connectAndDetectHost(testTarget(), baseOptions(fake.runner));
        expect(result).toEqual({ ok: true, detection: { kind: "posix", detail: "Linux" } });
        expect(fake.calls).toHaveLength(1);
    });

    it("falls back to a PowerShell probe when uname is not a command, and reports Windows", async () => {
        const fake = fakeRunner([
            { when: /uname -s/, answer: output({ ok: false, exitCode: 127, stderr: "bash: uname: command not found" }) },
            { when: /EncodedCommand/, answer: output({ stdout: "Microsoft Windows NT 10.0.22631.0\n" }) },
        ]);
        const result = await connectAndDetectHost(testTarget(), baseOptions(fake.runner));
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.detection.kind).toBe("windows");
            expect(result.detection.detail).toContain("Microsoft Windows");
        }
        expect(fake.calls).toHaveLength(2);
    });

    it("reports unknown, honestly, when neither probe answers anything usable", async () => {
        const fake = fakeRunner([
            { when: /uname -s/, answer: output({ ok: false, exitCode: 1, stderr: "uname: not found" }) },
            { when: /EncodedCommand/, answer: output({ ok: false, exitCode: 1, stderr: "powershell: not found" }) },
        ]);
        const result = await connectAndDetectHost(testTarget(), baseOptions(fake.runner));
        expect(result).toEqual({ ok: true, detection: { kind: "unknown", detail: "uname: not found" } });
    });

    it("reports an unreachable host as a failure without trying the Windows probe", async () => {
        const fake = fakeRunner([{ when: /uname -s/, answer: SSH_UNREACHABLE }]);
        const result = await connectAndDetectHost(testTarget(), baseOptions(fake.runner));
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.remoteCode).toBe("unreachable");
            expect(result.hostKeys).toEqual([]);
        }
        expect(fake.calls).toHaveLength(1);
    });

    it("refuses a changed host key with no keys offered to accept", async () => {
        const fake = fakeRunner([{ when: /uname -s/, answer: SSH_HOST_KEY_CHANGED }]);
        const result = await connectAndDetectHost(testTarget(), baseOptions(fake.runner));
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.remoteCode).toBe("host-key-changed");
            expect(result.hostKeys).toEqual([]);
        }
    });

    it("scans and offers fingerprints when the host key is merely unknown", async () => {
        const fake = fakeRunner([
            { when: /uname -s/, answer: SSH_HOST_KEY_UNKNOWN },
            {
                when: /^ssh-keyscan /,
                answer: output({ stdout: "render.example ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBogus==\n" }),
            },
        ]);
        const result = await connectAndDetectHost(testTarget(), baseOptions(fake.runner));
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.remoteCode).toBe("host-key-unknown");
            expect(result.hostKeys).toHaveLength(1);
            expect(result.hostKeys[0]?.type).toBe("ssh-ed25519");
        }
    });

    it("reports permission denied as auth-refused, never a password prompt", async () => {
        const fake = fakeRunner([{ when: /uname -s/, answer: SSH_AUTH_REFUSED }]);
        const result = await connectAndDetectHost(testTarget(), baseOptions(fake.runner));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.remoteCode).toBe("auth-refused");
    });

    it("reports a missing local ssh binary without attempting a second probe", async () => {
        const fake = fakeRunner([{ when: /uname -s/, answer: output({ ok: false, spawnError: "ENOENT" }) }]);
        const result = await connectAndDetectHost(testTarget(), baseOptions(fake.runner));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.remoteCode).toBe("ssh-missing");
        expect(fake.calls).toHaveLength(1);
    });
});

describe("checkRemoteWorldPath", () => {
    it("accepts a POSIX absolute path", () => {
        expect(checkRemoteWorldPath("/srv/minecraft/world", "posix")).toEqual({
            ok: true,
            path: "/srv/minecraft/world",
        });
    });

    it("accepts a POSIX path under ~", () => {
        expect(checkRemoteWorldPath("~/server/world", "posix")).toEqual({ ok: true, path: "~/server/world" });
    });

    it("refuses a relative POSIX path", () => {
        expect(checkRemoteWorldPath("server/world", "posix").ok).toBe(false);
    });

    it("refuses a POSIX path with a colon", () => {
        expect(checkRemoteWorldPath("/srv/world:backup", "posix").ok).toBe(false);
    });

    it("refuses a '..' step", () => {
        expect(checkRemoteWorldPath("/srv/../etc", "posix").ok).toBe(false);
    });

    it("accepts a Windows drive-letter path", () => {
        expect(checkRemoteWorldPath("D:\\servers\\world", "windows")).toEqual({
            ok: true,
            path: "D:\\servers\\world",
        });
    });

    it("accepts a Windows UNC path", () => {
        expect(checkRemoteWorldPath("\\\\fileserver\\share\\world", "windows")).toEqual({
            ok: true,
            path: "\\\\fileserver\\share\\world",
        });
    });

    it("refuses a POSIX-shaped path on a Windows host", () => {
        expect(checkRemoteWorldPath("/srv/world", "windows").ok).toBe(false);
    });

    it("refuses an empty path", () => {
        expect(checkRemoteWorldPath("   ", "posix").ok).toBe(false);
    });

    it("refuses a control character", () => {
        expect(checkRemoteWorldPath("/srv/wor\u0007ld", "posix").ok).toBe(false);
    });

    it("treats an unknown host kind as POSIX, the common case", () => {
        expect(checkRemoteWorldPath("/srv/world", "unknown")).toEqual({ ok: true, path: "/srv/world" });
    });
});

describe("surveyRemoteWorld", () => {
    it("parses a POSIX find survey into entries", async () => {
        const fake = fakeRunner([
            {
                when: /find \. -type f/,
                answer: output({
                    stdout: "8934656 1700000000.123456 region/r.0.0.mca\n4096 1700000001.5 level.dat\n",
                }),
            },
        ]);
        const result = await surveyRemoteWorld(testTarget(), "/srv/world", "posix", baseOptions(fake.runner));
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.entries).toEqual([
                { path: "region/r.0.0.mca", size: 8934656, mtimeMs: 1700000000123.456 },
                { path: "level.dat", size: 4096, mtimeMs: 1700000001500 },
            ]);
        }
    });

    it("parses a PowerShell survey into entries with the same shape", async () => {
        const fake = fakeRunner([
            { when: /EncodedCommand/, answer: output({ stdout: "8934656 638500000000000000 region/r.0.0.mca\n" }) },
        ]);
        const result = await surveyRemoteWorld(
            testTarget(),
            "D:\\servers\\world",
            "windows",
            baseOptions(fake.runner),
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.entries).toEqual([
                { path: "region/r.0.0.mca", size: 8934656, mtimeMs: expect.any(Number) as number },
            ]);
            expect(result.entries[0]?.mtimeMs).toBeGreaterThan(0);
        }
    });

    it("refuses to survey a host of unknown kind rather than guessing a shell", async () => {
        const fake = fakeRunner([]);
        const result = await surveyRemoteWorld(testTarget(), "/srv/world", "unknown", baseOptions(fake.runner));
        expect(result.ok).toBe(false);
        expect(fake.calls).toHaveLength(0);
    });

    it("skips a line the survey command could not have produced, rather than throwing", async () => {
        const fake = fakeRunner([
            { when: /find \. -type f/, answer: output({ stdout: "not a survey line\n123 1700000000 ok.txt\n" }) },
        ]);
        const result = await surveyRemoteWorld(testTarget(), "/srv/world", "posix", baseOptions(fake.runner));
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.entries).toEqual([{ path: "ok.txt", size: 123, mtimeMs: 1700000000000 }]);
        }
    });

    it("reports a failed survey command as a remote failure", async () => {
        const fake = fakeRunner([
            {
                when: /find \. -type f/,
                answer: output({ ok: false, exitCode: 1, stderr: "No such file or directory" }),
            },
        ]);
        const result = await surveyRemoteWorld(testTarget(), "/srv/world", "posix", baseOptions(fake.runner));
        expect(result.ok).toBe(false);
    });
});

describe("diffRemoteWorldSurveys / remoteWorldChanged", () => {
    const a: RemoteWorldEntry[] = [
        { path: "region/r.0.0.mca", size: 100, mtimeMs: 1000 },
        { path: "level.dat", size: 10, mtimeMs: 500 },
    ];

    it("finds nothing changed between a survey and itself", () => {
        const changes = diffRemoteWorldSurveys(a, a);
        expect(changes).toEqual({ added: [], changed: [], removed: [], unchanged: 2 });
        expect(remoteWorldChanged(changes)).toBe(false);
    });

    it("finds an added, a changed and an unchanged file", () => {
        const b: RemoteWorldEntry[] = [
            { path: "level.dat", size: 10, mtimeMs: 500 },
            { path: "region/r.0.0.mca", size: 200, mtimeMs: 2000 },
            { path: "region/r.0.1.mca", size: 50, mtimeMs: 900 },
        ];
        const changes = diffRemoteWorldSurveys(a, b);
        expect(changes).toEqual({
            added: ["region/r.0.1.mca"],
            changed: ["region/r.0.0.mca"],
            removed: [],
            unchanged: 1,
        });
        expect(remoteWorldChanged(changes)).toBe(true);
    });

    it("treats a removed file as a change even with nothing else different", () => {
        const kept = a[1];
        if (kept === undefined) throw new Error("fixture is missing its second entry");
        const changes = diffRemoteWorldSurveys(a, [kept]);
        expect(changes.removed).toEqual(["region/r.0.0.mca"]);
        expect(remoteWorldChanged(changes)).toBe(true);
    });
});

describe("fetchRemoteWorld", () => {
    const target = testTarget();

    it("fetches successfully and reports the transfer that was chosen", async () => {
        const transfer = fakeTransfer();
        const lines: string[] = [];
        const result = await fetchRemoteWorld(target, "/srv/world", "C:/local/world", {
            knownHostsFile: KNOWN_HOSTS,
            detect: () => Promise.resolve({ ok: true as const, detection: { kind: "posix" as const, detail: "Linux" } }),
            chooseTransfer: () =>
                Promise.resolve({
                    transfer,
                    kind: "rsync" as const,
                    resumable: true,
                    message: "Sending with rsync 3.2.7 here and 3.2.7 on renderer@render.example:2222.",
                }),
            onLine: (line) => lines.push(line),
        });
        expect(result).toEqual({
            ok: true,
            kind: "posix",
            transfer: "rsync",
            message: expect.stringContaining("rsync") as string,
        });
        expect(transfer.log).toEqual(["download-dir /srv/world -> C:/local/world"]);
        expect(lines[0]).toContain("rsync");
    });

    it("reports a host that never answered without attempting a transfer", async () => {
        const fake = fakeRunner([{ when: /uname -s/, answer: SSH_UNREACHABLE }]);
        const chosen = vi.fn();
        const result = await fetchRemoteWorld(target, "/srv/world", "C:/local/world", {
            knownHostsFile: KNOWN_HOSTS,
            runner: fake.runner,
            chooseTransfer: chosen,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.remoteCode).toBe("unreachable");
        expect(chosen).not.toHaveBeenCalled();
    });

    it("reports a host-key mismatch with fingerprints to compare, and attempts no transfer", async () => {
        const fake = fakeRunner([
            { when: /uname -s/, answer: SSH_HOST_KEY_UNKNOWN },
            {
                when: /^ssh-keyscan /,
                answer: output({ stdout: "render.example ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBogus==\n" }),
            },
        ]);
        const chosen = vi.fn();
        const result = await fetchRemoteWorld(target, "/srv/world", "C:/local/world", {
            knownHostsFile: KNOWN_HOSTS,
            runner: fake.runner,
            chooseTransfer: chosen,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.remoteCode).toBe("host-key-unknown");
            expect(result.hostKeys).toHaveLength(1);
        }
        expect(chosen).not.toHaveBeenCalled();
    });

    it("falls back to scp and says so, for a Windows host with no rsync", async () => {
        const transfer = fakeTransfer();
        const lines: string[] = [];
        const result = await fetchRemoteWorld(target, "D:\\servers\\world", "C:/local/world", {
            knownHostsFile: KNOWN_HOSTS,
            detect: () =>
                Promise.resolve({ ok: true as const, detection: { kind: "windows" as const, detail: "Windows Server 2022" } }),
            chooseTransfer: () =>
                Promise.resolve({
                    transfer,
                    kind: "scp" as const,
                    resumable: false,
                    message:
                        "Sending with scp, because renderer@render.example has no rsync. scp cannot carry a " +
                        "partial file on, so a transfer that is interrupted starts that file again from the " +
                        "beginning.",
                }),
            onLine: (line) => lines.push(line),
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.kind).toBe("windows");
            expect(result.transfer).toBe("scp");
        }
        expect(lines[0]).toContain("scp");
        expect(transfer.log).toEqual(["download-dir D:\\servers\\world -> C:/local/world"]);
    });

    it("reports a partial or interrupted transfer as a transfer failure, without deleting anything locally", async () => {
        const transfer = fakeTransfer();
        transfer.failOn(
            /download-dir/,
            new TransferError("Fetching /srv/world failed.", "rsync: connection unexpectedly closed", 12),
        );
        const result = await fetchRemoteWorld(target, "/srv/world", "C:/local/world", {
            knownHostsFile: KNOWN_HOSTS,
            detect: () => Promise.resolve({ ok: true as const, detection: { kind: "posix" as const, detail: "Linux" } }),
            chooseTransfer: () =>
                Promise.resolve({ transfer, kind: "rsync" as const, resumable: true, message: "Sending with rsync." }),
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.remoteCode).toBe("transfer-failed");
            expect(result.failure.detail).toBe("rsync: connection unexpectedly closed");
        }
        // The fake transfer never records a delete of any kind: a failed fetch leaves the
        // partial local directory exactly where it was, for the next attempt to build on.
        expect(transfer.log.some((line) => line.startsWith("rm "))).toBe(false);
    });

    it("reports permission denied without attempting a transfer", async () => {
        const fake = fakeRunner([{ when: /uname -s/, answer: SSH_AUTH_REFUSED }]);
        const chosen = vi.fn();
        const result = await fetchRemoteWorld(target, "/srv/world", "C:/local/world", {
            knownHostsFile: KNOWN_HOSTS,
            runner: fake.runner,
            chooseTransfer: chosen,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.remoteCode).toBe("auth-refused");
        expect(chosen).not.toHaveBeenCalled();
    });

    it("refuses a remote path in the wrong grammar for the detected host, before choosing a transfer", async () => {
        const chosen = vi.fn();
        const result = await fetchRemoteWorld(target, "/srv/world", "C:/local/world", {
            knownHostsFile: KNOWN_HOSTS,
            detect: () =>
                Promise.resolve({ ok: true as const, detection: { kind: "windows" as const, detail: "Windows Server 2022" } }),
            chooseTransfer: chosen,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.remoteCode).toBe("invalid-target");
        expect(chosen).not.toHaveBeenCalled();
    });

    it("reports cancellation without treating it as a failure", async () => {
        const controller = new AbortController();
        controller.abort();
        const result = await fetchRemoteWorld(target, "/srv/world", "C:/local/world", {
            knownHostsFile: KNOWN_HOSTS,
            signal: controller.signal,
            detect: () => Promise.resolve({ ok: true as const, detection: { kind: "posix" as const, detail: "Linux" } }),
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failure.remoteCode).toBe("cancelled");
    });
});
