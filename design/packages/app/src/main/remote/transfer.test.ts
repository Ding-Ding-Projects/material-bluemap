/**
 * The commands `scp` is actually given, and the guards around the one that deletes.
 *
 * No `scp`, no `ssh` and no host: every invocation goes through a fake runner, which is
 * what makes the destructive path testable at all. A `rm -rf` guard that is only ever
 * exercised against a real server is a guard nobody exercises.
 */

import { describe, expect, it } from "vitest";
import { TransferError, parentOf, scpTransfer } from "./transfer.js";
import { fakeRunner, output, testTarget } from "./fakes.js";

const OPTIONS = { target: testTarget(), knownHostsFile: "/app/known_hosts" };

function transfer(answer = output()) {
    const runner = fakeRunner([{ when: /.*/, answer }]);
    return { runner, subject: scpTransfer({ ...OPTIONS, runner: runner.runner }) };
}

describe("uploading", () => {
    it("creates the destination's parent first, so the copy cannot land one level too deep", async () => {
        // `scp -r local/config host:/stage/config` either *becomes* `/stage/config` or
        // lands inside it as `/stage/config/config`, depending on whether the destination
        // already exists. That ambiguity is how a render looks for its config in the wrong
        // place, so the parent is created and the destination is named explicitly.
        const { runner, subject } = transfer();
        await subject.uploadDirectory("C:\\local\\config", "/stage/render/config");

        expect(runner.calls[0]?.command).toBe("ssh");
        expect(runner.calls[0]?.args.at(-1)).toBe("mkdir -p '/stage/render'");
        expect(runner.calls[1]?.command).toBe("scp");
        expect(runner.calls[1]?.args).toContain("-r");
        expect(runner.calls[1]?.args.at(-1)).toBe("renderer@render.example:'/stage/render/config'");
    });

    it("uses scp's uppercase port flag", async () => {
        const { runner, subject } = transfer();
        await subject.uploadFile("C:\\local\\cli.jar", "/stage/render/cli.jar");
        expect(runner.calls[0]?.args).toContain("-P");
        expect(runner.calls[0]?.args).toContain("2222");
    });

    it("carries the same security options every other connection carries", async () => {
        const { runner, subject } = transfer();
        await subject.uploadFile("C:\\local\\cli.jar", "/stage/render/cli.jar");
        const line = runner.calls[0]?.args.join(" ") ?? "";
        expect(line).toContain("BatchMode=yes");
        expect(line).toContain("PasswordAuthentication=no");
        expect(line).toContain("StrictHostKeyChecking=yes");
    });

    it("reports a failure with the tool's own words kept apart from the sentence", async () => {
        const { subject } = transfer(
            output({ ok: false, exitCode: 1, stderr: "scp: /stage: Permission denied" }),
        );
        await expect(subject.uploadFile("a", "/stage/b")).rejects.toBeInstanceOf(TransferError);
        await expect(subject.uploadFile("a", "/stage/b")).rejects.toMatchObject({
            detail: "scp: /stage: Permission denied",
            exitCode: 1,
        });
    });

    it("reports a missing scp as a missing scp rather than as a failed copy", async () => {
        const { subject } = transfer(output({ ok: false, spawnError: "ENOENT" }));
        await expect(subject.uploadFile("a", "/stage/b")).rejects.toThrow(/could not be started/);
    });

    it("stops when the render was cancelled, rather than finishing the upload first", async () => {
        const controller = new AbortController();
        controller.abort();
        const { runner, subject } = transfer();
        await expect(
            subject.uploadFile("a", "/stage/b", { signal: controller.signal }),
        ).rejects.toThrow();
        expect(runner.calls).toEqual([]);
    });
});

describe("downloading", () => {
    it("names the remote source quoted and the local destination as it is", async () => {
        const { runner, subject } = transfer();
        await subject.downloadDirectory("/stage/render/web/maps", "C:\\renders\\x\\web");
        const args = runner.calls[0]?.args ?? [];
        expect(args.at(-2)).toBe("renderer@render.example:'/stage/render/web/maps'");
        expect(args.at(-1)).toBe("C:\\renders\\x\\web");
    });
});

describe("removing a remote directory", () => {
    it("guards the rm on the remote side as well as on this one", async () => {
        const { runner, subject } = transfer();
        await subject.removeRemoteDirectory("/stage/render");
        const script = runner.calls[0]?.args.at(-1) ?? "";
        // `rm -rf` with an empty or unexpected variable is the single most destructive
        // command a script can run. The caller's path is already validated; this is the
        // second lock on the same door, because the cost of it being wrong is a server.
        expect(script).toContain("case '/stage/render' in /|/*/..*|\"\") exit 9;; esac");
        expect(script).toContain("rm -rf '/stage/render'");
    });

    it("quotes a path with a space rather than deleting two directories", async () => {
        const { runner, subject } = transfer();
        await subject.removeRemoteDirectory("/stage/a b");
        expect(runner.calls[0]?.args.at(-1)).toContain("rm -rf '/stage/a b'");
    });
});

describe("parentOf", () => {
    it("reads a POSIX remote path as text rather than with the host's path grammar", () => {
        expect(parentOf("/a/b/c")).toBe("/a/b");
        expect(parentOf("/a/b/c/")).toBe("/a/b");
        expect(parentOf("/a")).toBe("/");
        expect(parentOf("/")).toBe("/");
    });
});
