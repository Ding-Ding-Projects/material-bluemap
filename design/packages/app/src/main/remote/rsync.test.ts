/**
 * The transfer that can be carried on, and the honest sentence when it cannot be used.
 *
 * No rsync, no scp and no host: a small fake stands in for the remote filesystem and keeps
 * track of how many bytes each copy actually moved, so "an interrupted transfer resumes
 * and skips what already arrived" is asserted as a number rather than as the presence of a
 * flag. A flag assertion would still pass on the day somebody added `--whole-file`.
 */

import { describe, expect, it } from "vitest";
import type { CommandOutput, CommandRunner } from "../runtime/command.js";
import {
    chooseTransfer,
    probeRsync,
    rsyncArguments,
    rsyncShellCommand,
    rsyncTransfer,
    withScpFallback,
} from "./rsync.js";
import { TransferError, type FileTransfer } from "./transfer.js";
import { fakeRunner, fakeTransfer, output, testTarget } from "./fakes.js";

const OPTIONS = { target: testTarget(), knownHostsFile: "/app/known_hosts" };

/** `rsync --version`'s real first line, which is what the probe reads. */
function version(number: string): CommandOutput {
    return output({ stdout: `rsync  version ${number}  protocol version 31\n` });
}

const NOT_INSTALLED = output({ ok: false, spawnError: "ENOENT" });
const NOT_ON_THE_HOST = output({
    ok: false,
    exitCode: 127,
    stderr: "bash: line 1: rsync: command not found",
});

/* -------------------------------------------------------------------------- */

/**
 * A remote filesystem that remembers partial files.
 *
 * The whole point of the feature in twenty lines: a destination holds however many bytes
 * arrived last time, and a copy either appends the rest (rsync, with `--append-verify`) or
 * writes the file again from zero (everything else). `moved` is what the assertions read.
 */
function fakeHost(sourceBytes: number): {
    readonly runner: CommandRunner;
    readonly moved: number[];
    present(path: string, bytes: number): void;
} {
    const files = new Map<string, number>();
    const moved: number[] = [];
    return {
        moved,
        present(path, bytes): void {
            files.set(path, bytes);
        },
        runner: (command, args) => {
            if (command !== "rsync") return Promise.resolve(output());
            const destination = args.at(-1) ?? "";
            const resumable = args.includes("--append-verify") && args.includes("--partial");
            const already = resumable ? (files.get(destination) ?? 0) : 0;
            moved.push(sourceBytes - already);
            files.set(destination, sourceBytes);
            return Promise.resolve(output());
        },
    };
}

/* -------------------------------------------------------------------------- */

describe("the command rsync is given", () => {
    it("carries the three flags that make an interrupted copy resumable", () => {
        const args = rsyncArguments(OPTIONS);
        expect(args).toContain("-a");
        expect(args).toContain("--partial");
        // `--append-verify` rather than `--append`: it checksums the part that is already
        // there before appending, so a fragment of a file that has since changed is re-sent
        // whole rather than producing a file that is half one version and half another.
        expect(args).toContain("--append-verify");
        expect(args).not.toContain("--append");
        expect(args).not.toContain("--whole-file");
    });

    it("hands rsync the same ssh, with the same security options, as everything else", () => {
        const shell = rsyncShellCommand(OPTIONS);
        expect(shell).toContain("BatchMode=yes");
        expect(shell).toContain("PasswordAuthentication=no");
        expect(shell).toContain("StrictHostKeyChecking=yes");
        expect(shell).toContain("-p 2222");
    });

    it("quotes a known_hosts path with a space in it, which Windows always has", () => {
        // The application data directory on Windows is `...\Worldlens\`, and rsync
        // splits the remote-shell string itself. An unquoted space there is two arguments.
        const shell = rsyncShellCommand({
            ...OPTIONS,
            knownHostsFile: "C:\\Users\\me\\AppData\\Roaming\\Worldlens\\known_hosts",
        });
        expect(shell).toContain('"UserKnownHostsFile=');
    });
});

describe("looking for rsync", () => {
    it("reports it available only when both machines have it, and names both versions", async () => {
        const runner = fakeRunner([
            { when: /^rsync --version/, answer: version("3.2.7") },
            { when: /^ssh .*rsync/, answer: version("3.1.3") },
        ]);
        const support = await probeRsync({ ...OPTIONS, runner: runner.runner });
        expect(support.available).toBe(true);
        expect(support.localVersion).toBe("3.2.7");
        expect(support.remoteVersion).toBe("3.1.3");
        expect(support.message).toContain("carries on from where it stopped");
    });

    it("says which machine is missing it, rather than one sentence for both cases", async () => {
        // "rsync is not available" sends somebody to install it on the machine that has it.
        const hostless = fakeRunner([
            { when: /^rsync --version/, answer: version("3.2.7") },
            { when: /^ssh /, answer: NOT_ON_THE_HOST },
        ]);
        const remoteMissing = await probeRsync({ ...OPTIONS, runner: hostless.runner });
        expect(remoteMissing.available).toBe(false);
        expect(remoteMissing.message).toContain("renderer@render.example has no rsync");

        const local = fakeRunner([
            { when: /^rsync --version/, answer: NOT_INSTALLED },
            { when: /^ssh /, answer: version("3.2.7") },
        ]);
        const localMissing = await probeRsync({ ...OPTIONS, runner: local.runner });
        expect(localMissing.message).toContain("this computer has no rsync");
    });

    it("states what falling back costs, rather than only that it fell back", async () => {
        const runner = fakeRunner([{ when: /.*/, answer: NOT_INSTALLED }]);
        const support = await probeRsync({ ...OPTIONS, runner: runner.runner });
        expect(support.message).toContain("starts that file again from the beginning");
        expect(support.message).toContain("Installing rsync on both machines");
    });
});

describe("resuming a transfer", () => {
    it("sends only what did not arrive last time", async () => {
        const host = fakeHost(1_000);
        const transfer = rsyncTransfer({
            ...OPTIONS,
            runner: host.runner,
            shell: fakeTransfer(),
        });

        // A first attempt that was cut off after 600 bytes, then the same copy again.
        host.present("renderer@render.example:'/stage/render/worlds/overworld'", 600);
        await transfer.uploadDirectory("C:\\saves\\world", "/stage/render/worlds/overworld");

        expect(host.moved).toEqual([400]);
    });

    it("moves the whole file again without those flags, which is what scp always does", async () => {
        // Pins the meaning of the fake, so the assertion above is a statement about the
        // flags rather than about a host that would have answered 400 either way.
        const host = fakeHost(1_000);
        host.present("renderer@render.example:'/stage/render/worlds/overworld'", 600);
        await host.runner("rsync", ["-a", "renderer@render.example:'/stage/render/worlds/overworld'"]);
        expect(host.moved).toEqual([1_000]);
    });

    it("names the destination exactly, so a copy cannot land one level too deep", async () => {
        const runner = fakeRunner([{ when: /.*/, answer: output() }]);
        const shell = fakeTransfer();
        const transfer = rsyncTransfer({ ...OPTIONS, runner: runner.runner, shell });

        await transfer.uploadDirectory("C:\\local\\config", "/stage/render/config");
        // The source carries a trailing slash - rsync copies its *contents* - and the
        // destination is created and named. Without both, `config` lands inside `config`.
        const args = runner.calls[0]?.args ?? [];
        expect(args.at(-2)).toBe("C:\\local\\config/");
        expect(args.at(-1)).toBe("renderer@render.example:'/stage/render/config'");
        expect(shell.log).toContain("mkdir /stage/render/config");
    });

    it("delegates the guarded remote delete rather than writing a second one", async () => {
        // `rm -rf` with an unexpected value is the most destructive command this app can
        // issue. There is one of it, in `transfer.ts`, with its guard and its tests.
        const shell = fakeTransfer();
        const transfer = rsyncTransfer({ ...OPTIONS, runner: fakeRunner([]).runner, shell });
        await transfer.removeRemoteDirectory("/stage/render");
        expect(shell.log).toContain("rm /stage/render");
    });

    it("stops when the render was cancelled, rather than finishing the copy first", async () => {
        const controller = new AbortController();
        controller.abort();
        const runner = fakeRunner([{ when: /.*/, answer: output() }]);
        const transfer = rsyncTransfer({ ...OPTIONS, runner: runner.runner, shell: fakeTransfer() });
        await expect(
            transfer.uploadFile("a", "/stage/b", { signal: controller.signal }),
        ).rejects.toThrow();
        expect(runner.calls).toEqual([]);
    });
});

describe("choosing, and falling back where anybody can see it", () => {
    it("uses scp when rsync is missing, and logs the reason before a byte moves", async () => {
        const scp = fakeTransfer();
        const choice = await chooseTransfer({
            ...OPTIONS,
            scpTransfer: scp,
            probe: () =>
                Promise.resolve({
                    available: false,
                    localVersion: null,
                    remoteVersion: null,
                    message: "Sending with scp, because neither machine has rsync.",
                }),
        });

        expect(choice.kind).toBe("scp");
        expect(choice.resumable).toBe(false);
        expect(choice.message).toContain("neither machine has rsync");

        await choice.transfer.uploadFile("a", "/stage/b");
        expect(scp.log).toContain("upload-file a -> /stage/b");
    });

    it("uses rsync when both machines have it, and says an interruption is survivable", async () => {
        const choice = await chooseTransfer({
            ...OPTIONS,
            runner: fakeRunner([{ when: /.*/, answer: output() }]).runner,
            scpTransfer: fakeTransfer(),
            probe: () =>
                Promise.resolve({
                    available: true,
                    localVersion: "3.2.7",
                    remoteVersion: "3.2.7",
                    message: "Sending with rsync, so an interrupted transfer carries on.",
                }),
        });
        expect(choice.kind).toBe("rsync");
        expect(choice.resumable).toBe(true);
    });

    it("completes the copy through scp when rsync fails, and says what that costs", async () => {
        const lines: string[] = [];
        const scp = fakeTransfer();
        const broken: FileTransfer = {
            ...scp,
            uploadDirectory: () =>
                Promise.reject(new TransferError("Sending C:\\saves\\world failed.", "rsync: -e", 1)),
        };

        const transfer = withScpFallback(broken, scp, (line) => lines.push(line));
        await transfer.uploadDirectory("C:\\saves\\world", "/stage/render/worlds/overworld");

        expect(scp.log).toContain("upload-dir C:\\saves\\world -> /stage/render/worlds/overworld");
        expect(lines.join("\n")).toContain("scp is being used for it instead");
        expect(lines.join("\n")).toContain("starts again from the beginning");
    });

    it("never retries a copy the render cancelled, because that would start a second upload", async () => {
        const controller = new AbortController();
        controller.abort();
        const scp = fakeTransfer();
        const broken: FileTransfer = {
            ...scp,
            uploadDirectory: () => Promise.reject(new Error("aborted")),
        };
        const transfer = withScpFallback(broken, scp);

        await expect(
            transfer.uploadDirectory("C:\\saves\\world", "/stage/x", { signal: controller.signal }),
        ).rejects.toThrow();
        expect(scp.log).toEqual([]);
    });
});
