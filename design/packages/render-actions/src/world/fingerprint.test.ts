/**
 * The change detector, which is the only thing standing between a re-sync and a second
 * twenty-gigabyte upload.
 *
 * The tests that matter are the ones proving it notices: a file added, a file grown, a
 * file rewritten with the same length. The last of those is the case a size-only
 * comparison would miss entirely, which is why the mtime is in the hash.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FingerprintError, fingerprintWorld, isUnchanged } from "./fingerprint.js";

let workDir = "";
let world = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-fingerprint-"));
    world = join(workDir, "world");
    await mkdir(join(world, "region"), { recursive: true });
    await writeFile(join(world, "level.dat"), "level");
    await writeFile(join(world, "region", "r.0.0.mca"), "aaaa");
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

describe("an untouched world hashes the same twice", () => {
    it("gives the same digest for two reads of the same tree", async () => {
        const first = await fingerprintWorld(world);
        const second = await fingerprintWorld(world);
        expect(second.digest).toBe(first.digest);
        expect(first.files).toBe(2);
        expect(first.bytes).toBe("level".length + "aaaa".length);
        expect(first.digest.startsWith("v1:")).toBe(true);
    });
});

describe("a changed world hashes differently", () => {
    it("notices a file that was added", async () => {
        const before = await fingerprintWorld(world);
        await writeFile(join(world, "region", "r.0.1.mca"), "bbbb");
        expect((await fingerprintWorld(world)).digest).not.toBe(before.digest);
    });

    it("notices a file that was removed", async () => {
        const before = await fingerprintWorld(world);
        await rm(join(world, "region", "r.0.0.mca"));
        expect((await fingerprintWorld(world)).digest).not.toBe(before.digest);
    });

    it("notices a file that grew", async () => {
        const before = await fingerprintWorld(world);
        await writeFile(join(world, "region", "r.0.0.mca"), "aaaabbbb");
        expect((await fingerprintWorld(world)).digest).not.toBe(before.digest);
    });

    it("notices a rewrite that kept the same length, which a size check would miss", async () => {
        const before = await fingerprintWorld(world);
        const path = join(world, "region", "r.0.0.mca");
        await writeFile(path, "zzzz");
        // The write already moves the mtime; forcing it a second apart removes any
        // dependence on the filesystem's timestamp resolution, which on some volumes is
        // coarse enough for two writes in one test to land on the same stamp.
        const later = new Date(Date.now() + 60_000);
        await utimes(path, later, later);

        const after = await fingerprintWorld(world);
        expect(after.digest).not.toBe(before.digest);
        expect(after.bytes).toBe(before.bytes);
    });

    it("notices a file that moved, even with identical contents", async () => {
        const before = await fingerprintWorld(world);
        await rm(join(world, "region", "r.0.0.mca"));
        await writeFile(join(world, "region", "r.1.1.mca"), "aaaa");
        expect((await fingerprintWorld(world)).digest).not.toBe(before.digest);
    });
});

describe("isUnchanged refuses to confuse 'nothing recorded' with 'nothing changed'", () => {
    it("is false for a null recording, which is a world that has never been uploaded", async () => {
        const fresh = await fingerprintWorld(world);
        expect(isUnchanged(null, fresh)).toBe(false);
        expect(isUnchanged("", fresh)).toBe(false);
    });

    it("is true only for the exact same digest", async () => {
        const fresh = await fingerprintWorld(world);
        expect(isUnchanged(fresh.digest, fresh)).toBe(true);
        expect(isUnchanged(`${fresh.digest}0`, fresh)).toBe(false);
    });
});

describe("refusals", () => {
    it("refuses a path that is not a folder rather than answering for one", async () => {
        await expect(fingerprintWorld(join(world, "level.dat"))).rejects.toBeInstanceOf(FingerprintError);
        await expect(fingerprintWorld(join(workDir, "nothing-here"))).rejects.toBeInstanceOf(FingerprintError);
    });
});
