import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dockerWorldFingerprint, fingerprintsEqual, localWorldFingerprint, remoteWorldFingerprint } from "./change.js";
import type { DockerWorldCandidate } from "./resolve.js";
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

let workDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mb-dockerworld-change-"));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

function candidate(route: DockerWorldCandidate["route"], hostPath: string | null): DockerWorldCandidate {
    return { route, containerId: null, containerName: null, volumeName: null, containerPath: "/x", hostPath, running: false };
}

describe("localWorldFingerprint", () => {
    it("reads only .mca files, by size and modification time, and ignores everything else", async () => {
        await mkdir(join(workDir, "region"), { recursive: true });
        await writeFile(join(workDir, "level.dat"), "not a region file");
        await writeFile(join(workDir, "region", "r.0.0.mca"), "abcdefgh");

        const fingerprint = await localWorldFingerprint(workDir);
        expect(fingerprint.regions).toHaveLength(1);
        expect(fingerprint.regions[0]?.path).toBe(join("region", "r.0.0.mca"));
        expect(fingerprint.regions[0]?.bytes).toBe(8);
    });

    it("is unaffected by directory order - two fingerprints of the same content compare equal", async () => {
        await mkdir(join(workDir, "region"), { recursive: true });
        await writeFile(join(workDir, "region", "r.0.0.mca"), "aaaa");
        await writeFile(join(workDir, "region", "r.1.0.mca"), "bbbb");

        const first = await localWorldFingerprint(workDir);
        const second = await localWorldFingerprint(workDir);
        expect(fingerprintsEqual(first, second)).toBe(true);
    });

    it("changes when a region file's size changes", async () => {
        await mkdir(join(workDir, "region"), { recursive: true });
        await writeFile(join(workDir, "region", "r.0.0.mca"), "aaaa");
        const before = await localWorldFingerprint(workDir);

        await writeFile(join(workDir, "region", "r.0.0.mca"), "a much longer region file than before");
        const after = await localWorldFingerprint(workDir);
        expect(fingerprintsEqual(before, after)).toBe(false);
    });
});

describe("remoteWorldFingerprint", () => {
    it("parses `find -exec stat --format` output into region entries", async () => {
        const runner: CommandRunner = () =>
            Promise.resolve(
                output({
                    ok: true,
                    exitCode: 0,
                    stdout: "/srv/mc/world/region/r.0.0.mca:8123:1735689600\n/srv/mc/world/region/r.1.0.mca:4096:1735689700\n",
                }),
            );
        const fingerprint = await remoteWorldFingerprint(runner, "/srv/mc/world");
        expect(fingerprint.regions).toEqual([
            { path: join("region", "r.0.0.mca"), bytes: 8123, modifiedAt: 1735689600 },
            { path: join("region", "r.1.0.mca"), bytes: 4096, modifiedAt: 1735689700 },
        ]);
    });

    it("returns an empty fingerprint rather than throwing when the remote command fails", async () => {
        const runner: CommandRunner = () => Promise.resolve(output({ exitCode: 1, stderr: "no such file or directory" }));
        const fingerprint = await remoteWorldFingerprint(runner, "/gone");
        expect(fingerprint.regions).toEqual([]);
    });
});

describe("dockerWorldFingerprint", () => {
    it("is null for a container-copy candidate - there is no cheap vantage point", async () => {
        const result = await dockerWorldFingerprint(candidate("container-copy", null));
        expect(result).toBeNull();
    });

    it("is null for a volume-copy candidate", async () => {
        const result = await dockerWorldFingerprint(candidate("volume-copy", null));
        expect(result).toBeNull();
    });

    it("reads the local filesystem for a bind-direct candidate", async () => {
        await mkdir(join(workDir, "region"), { recursive: true });
        await writeFile(join(workDir, "region", "r.0.0.mca"), "aaaa");
        const result = await dockerWorldFingerprint(candidate("bind-direct", workDir));
        expect(result?.regions).toHaveLength(1);
    });

    it("uses the given runner for a remote bind-direct candidate", async () => {
        const runner: CommandRunner = () =>
            Promise.resolve(output({ ok: true, exitCode: 0, stdout: "/srv/world/region/r.0.0.mca:10:1735689600\n" }));
        const result = await dockerWorldFingerprint(candidate("bind-direct", "/srv/world"), { runner, remote: true });
        expect(result?.regions).toHaveLength(1);
    });

    it("is null when remote is requested with no runner to ask", async () => {
        const result = await dockerWorldFingerprint(candidate("bind-direct", "/srv/world"), { remote: true });
        expect(result).toBeNull();
    });
});
