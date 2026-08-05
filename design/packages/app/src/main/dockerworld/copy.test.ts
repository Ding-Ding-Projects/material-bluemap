import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyRemoteBindMount, dockerCopyToStaging, localIncrementalCopy, volumeCopyToStaging } from "./copy.js";
import type { CommandOutput, CommandRunner } from "../runtime/command.js";
import type { FileTransfer, TransferOptions } from "../remote/transfer.js";

function output(partial: Partial<CommandOutput>): CommandOutput {
    return {
        ok: partial.ok ?? false,
        exitCode: partial.exitCode ?? null,
        stdout: partial.stdout ?? "",
        stderr: partial.stderr ?? "",
        spawnError: partial.spawnError ?? null,
    };
}

let workDir = "";
let source = "";
let destination = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mb-dockerworld-copy-"));
    source = join(workDir, "source");
    destination = join(workDir, "destination");
    await mkdir(source, { recursive: true });
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

describe("localIncrementalCopy", () => {
    it("copies every file, nested directories included", async () => {
        await mkdir(join(source, "region"), { recursive: true });
        await writeFile(join(source, "level.dat"), "level");
        await writeFile(join(source, "region", "r.0.0.mca"), "region-bytes");

        const result = await localIncrementalCopy(source, destination);
        expect(result).toEqual({ filesCopied: 2, filesUnchanged: 0 });
        expect(await readFile(join(destination, "level.dat"), "utf8")).toBe("level");
        expect(await readFile(join(destination, "region", "r.0.0.mca"), "utf8")).toBe("region-bytes");
    });

    it("touches nothing on a second run when nothing changed", async () => {
        await writeFile(join(source, "level.dat"), "level");
        await localIncrementalCopy(source, destination);
        const before = await stat(join(destination, "level.dat"));

        const result = await localIncrementalCopy(source, destination);
        expect(result).toEqual({ filesCopied: 0, filesUnchanged: 1 });
        const after = await stat(join(destination, "level.dat"));
        expect(after.mtimeMs).toBe(before.mtimeMs);
    });

    it("re-copies a file whose size changed", async () => {
        await writeFile(join(source, "level.dat"), "level");
        await localIncrementalCopy(source, destination);

        await writeFile(join(source, "level.dat"), "a longer level file than before");
        const result = await localIncrementalCopy(source, destination);
        expect(result).toEqual({ filesCopied: 1, filesUnchanged: 0 });
        expect(await readFile(join(destination, "level.dat"), "utf8")).toBe("a longer level file than before");
    });

    it("re-copies a same-size file whose modification time moved well outside the tolerance window", async () => {
        await writeFile(join(source, "region.mca"), "aaaaaaaaaa");
        await localIncrementalCopy(source, destination);

        const future = new Date(Date.now() + 60_000);
        await writeFile(join(source, "region.mca"), "bbbbbbbbbb");
        await utimes(join(source, "region.mca"), future, future);

        const result = await localIncrementalCopy(source, destination);
        expect(result).toEqual({ filesCopied: 1, filesUnchanged: 0 });
        expect(await readFile(join(destination, "region.mca"), "utf8")).toBe("bbbbbbbbbb");
    });

    it("never deletes a file the destination has that the source no longer does", async () => {
        await writeFile(join(source, "level.dat"), "level");
        await localIncrementalCopy(source, destination);
        await writeFile(join(destination, "leftover.txt"), "still here");

        await rm(join(source, "level.dat"));
        await writeFile(join(source, "new-file.dat"), "new");
        const result = await localIncrementalCopy(source, destination);

        expect(result.filesCopied).toBe(1);
        // The stale file is untouched - this copy never removes anything.
        expect(await readFile(join(destination, "leftover.txt"), "utf8")).toBe("still here");
        expect(await readFile(join(destination, "level.dat"), "utf8")).toBe("level");
    });

    it("reports progress as it goes and a final callback with no current file", async () => {
        await writeFile(join(source, "a.mca"), "a");
        await writeFile(join(source, "b.mca"), "b");
        const seen: { filesDone: number; filesTotal: number; currentFile: string | null }[] = [];
        await localIncrementalCopy(source, destination, (progress) => seen.push(progress));
        expect(seen.at(-1)).toEqual({ filesDone: 2, filesTotal: 2, currentFile: null });
        expect(seen.some((entry) => entry.currentFile !== null)).toBe(true);
    });

    it("honours an already-aborted signal before copying anything", async () => {
        await writeFile(join(source, "level.dat"), "level");
        const controller = new AbortController();
        controller.abort();
        await expect(localIncrementalCopy(source, destination, undefined, controller.signal)).rejects.toThrow();
    });
});

function fakeRunner(handler: (command: string, args: readonly string[]) => CommandOutput): CommandRunner {
    return (command, args) => Promise.resolve(handler(command, args));
}

describe("dockerCopyToStaging", () => {
    it("copies the contents of the container path into staging, with a trailing '/.'", async () => {
        let seen: { command: string; args: readonly string[] } | null = null;
        const runner = fakeRunner((command, args) => {
            seen = { command, args };
            return output({ ok: true, exitCode: 0 });
        });
        const failure = await dockerCopyToStaging("abc123", "/data/world", "/tmp/staging", { runner });
        expect(failure).toBeNull();
        expect(seen).toEqual({ command: "docker", args: ["cp", "abc123:/data/world/.", "/tmp/staging"] });
    });

    it("reports Docker not being installed", async () => {
        const runner = fakeRunner(() => output({ spawnError: "ENOENT" }));
        const failure = await dockerCopyToStaging("abc123", "/data/world", "/tmp/staging", { runner });
        expect(failure?.code).toBe("not-installed");
    });

    it("reports a copy failure with Docker's own words", async () => {
        const runner = fakeRunner(() => output({ exitCode: 1, stderr: "Error: No such container:path: abc123:/data/world" }));
        const failure = await dockerCopyToStaging("abc123", "/data/world", "/tmp/staging", { runner });
        expect(failure?.code).toBe("copy-failed");
        expect(failure?.detail).toContain("No such container:path");
    });
});

describe("volumeCopyToStaging", () => {
    it("runs a disposable container binding the volume read-only and the staging path read-write", async () => {
        let seen: readonly string[] = [];
        const runner = fakeRunner((command, args) => {
            seen = args;
            return output({ ok: true, exitCode: 0 });
        });
        const failure = await volumeCopyToStaging("mc-world", "/tmp/staging", { runner });
        expect(failure).toBeNull();
        expect(seen).toContain("-v");
        expect(seen).toContain("mc-world:/mb-source:ro");
        expect(seen).toContain("/tmp/staging:/mb-staging");
        expect(seen).toContain("cp -a /mb-source/. /mb-staging/");
    });

    it("uses a caller-supplied image instead of the render default", async () => {
        let seen: readonly string[] = [];
        const runner = fakeRunner((command, args) => {
            seen = args;
            return output({ ok: true, exitCode: 0 });
        });
        await volumeCopyToStaging("mc-world", "/tmp/staging", { runner, image: "alpine:3" });
        expect(seen).toContain("alpine:3");
    });

    it("reports a failed helper container run", async () => {
        const runner = fakeRunner(() => output({ exitCode: 125, stderr: "docker: Error response from daemon." }));
        const failure = await volumeCopyToStaging("mc-world", "/tmp/staging", { runner });
        expect(failure?.code).toBe("copy-failed");
    });
});

describe("copyRemoteBindMount", () => {
    it("creates the destination and downloads through the given transfer", async () => {
        const calls: { remotePath: string; localPath: string; options?: TransferOptions }[] = [];
        const transfer: FileTransfer = {
            uploadDirectory: () => Promise.reject(new Error("not used")),
            uploadFile: () => Promise.reject(new Error("not used")),
            downloadDirectory: (remotePath, localPath, options) => {
                calls.push({ remotePath, localPath, ...(options === undefined ? {} : { options }) });
                return Promise.resolve();
            },
            makeRemoteDirectory: () => Promise.reject(new Error("not used")),
            removeRemoteDirectory: () => Promise.reject(new Error("not used")),
        };

        await copyRemoteBindMount(transfer, "/srv/mc/world", destination);
        expect(calls).toHaveLength(1);
        expect(calls[0]?.remotePath).toBe("/srv/mc/world");
        expect(calls[0]?.localPath).toBe(destination);
        expect((await stat(destination)).isDirectory()).toBe(true);
    });
});
