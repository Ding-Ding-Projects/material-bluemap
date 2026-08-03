/**
 * Splitting and rejoining, checked the only way that means anything: by comparing the
 * bytes that came out with the bytes that went in.
 *
 * The part size here is a few kilobytes rather than 1.7 GB. The arithmetic is the same
 * at both scales and a test that needed nineteen gigabytes of scratch space would never
 * be run.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PartsIntegrityError, PartsManifestError } from "./manifest.js";
import { joinParts, readManifest } from "./join.js";
import { splitFile } from "./split.js";
import type { SplitPerformed } from "./split.js";
import { sha256File } from "./hash.js";

let workDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-parts-"));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

/** Deterministic-ish content that is not compressible into an accidental pattern. */
function bytes(length: number, seed: number): Buffer {
    const buffer = Buffer.allocUnsafe(length);
    let state = seed >>> 0;
    for (let i = 0; i < length; i++) {
        // xorshift32: cheap, and unlike a counter it makes a swapped or duplicated part
        // visible rather than accidentally identical to its neighbour.
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        buffer[i] = state & 0xff;
    }
    return buffer;
}

async function writeSource(name: string, content: Buffer): Promise<string> {
    const path = join(workDir, name);
    await writeFile(path, content);
    return path;
}

function sha256(content: Buffer): string {
    return createHash("sha256").update(content).digest("hex");
}

function performed(result: Awaited<ReturnType<typeof splitFile>>): SplitPerformed {
    if (!result.split) throw new Error("expected the file to have been split");
    return result;
}

describe("splitFile", () => {
    it("splits into several parts and records each one's digest", async () => {
        const content = bytes(10_000, 1);
        const source = await writeSource("world.zip", content);

        const result = performed(await splitFile(source, { partSize: 3_000 }));

        expect(result.manifest.parts).toHaveLength(4);
        expect(result.manifest.bytes).toBe(10_000);
        expect(result.manifest.sha256).toBe(sha256(content));
        expect(result.manifest.parts.map((part) => part.name)).toEqual([
            "world.zip.001",
            "world.zip.002",
            "world.zip.003",
            "world.zip.004",
        ]);
        expect(result.manifest.parts.map((part) => part.bytes)).toEqual([3_000, 3_000, 3_000, 1_000]);
        for (const part of result.manifest.parts) {
            const onDisk = await readFile(join(workDir, part.name));
            expect(onDisk.byteLength).toBe(part.bytes);
            expect(sha256(onDisk)).toBe(part.sha256);
        }
        expect(result.manifestPath).toBe(join(workDir, "world.zip.parts.json"));
    });

    it("writes a manifest that reads back exactly as it was written", async () => {
        const source = await writeSource("world.zip", bytes(5_000, 2));
        const result = performed(await splitFile(source, { partSize: 1_024 }));

        expect(await readManifest(result.manifestPath)).toEqual(result.manifest);
    });

    it("passes a file smaller than the part size through untouched", async () => {
        const content = bytes(500, 3);
        const source = await writeSource("small.zip", content);

        const result = await splitFile(source, { partSize: 4_096 });

        expect(result.split).toBe(false);
        expect(result.bytes).toBe(500);
        // Nothing else was written: no parts, and above all no manifest that a publish
        // step would then attach beside an asset that was never split.
        expect(await readdir(workDir)).toEqual(["small.zip"]);
    });

    it("passes a file of exactly the part size through untouched", async () => {
        const source = await writeSource("exact.zip", bytes(4_096, 4));

        const result = await splitFile(source, { partSize: 4_096 });

        expect(result.split).toBe(false);
        expect(await readdir(workDir)).toEqual(["exact.zip"]);
    });

    it("splits a file one byte over the part size into two parts", async () => {
        const content = bytes(4_097, 5);
        const source = await writeSource("over.zip", content);

        const result = performed(await splitFile(source, { partSize: 4_096 }));

        expect(result.manifest.parts.map((part) => part.bytes)).toEqual([4_096, 1]);
        const second = await readFile(join(workDir, "over.zip.002"));
        expect(second.byteLength).toBe(1);
        expect(second[0]).toBe(content[4_096]);
    });

    it("writes parts and the manifest to a chosen directory", async () => {
        const source = await writeSource("world.zip", bytes(9_000, 6));
        const outDir = join(workDir, "release", "assets");

        const result = performed(await splitFile(source, { partSize: 4_000, outDir }));

        expect(result.manifestPath).toBe(join(outDir, "world.zip.parts.json"));
        expect((await readdir(outDir)).sort()).toEqual([
            "world.zip.001",
            "world.zip.002",
            "world.zip.003",
            "world.zip.parts.json",
        ]);
    });

    it("reports progress that ends at the full byte count", async () => {
        const source = await writeSource("world.zip", bytes(9_000, 7));
        const seen: number[] = [];

        await splitFile(source, { partSize: 2_000, onProgress: (p) => seen.push(p.bytesDone) });

        expect(seen).toEqual([2_000, 4_000, 6_000, 8_000, 9_000]);
    });

    it("refuses a part size that is not a positive whole number", async () => {
        const source = await writeSource("world.zip", bytes(100, 8));
        await expect(splitFile(source, { partSize: 0 })).rejects.toThrow(RangeError);
    });
});

describe("joinParts", () => {
    it("rejoins byte-identically", async () => {
        const content = bytes(20_001, 11);
        const source = await writeSource("world.zip", content);
        const result = performed(await splitFile(source, { partSize: 2_048 }));
        expect(result.manifest.parts.length).toBeGreaterThan(5);

        const outDir = join(workDir, "joined");
        const joined = await joinParts(result.manifestPath, { outDir });

        expect(joined.bytes).toBe(content.byteLength);
        expect(joined.sha256).toBe(sha256(content));
        expect(joined.reusedParts).toBe(0);
        expect(await readFile(joined.path)).toEqual(content);
        expect(await sha256File(joined.path)).toBe(sha256(content));
    });

    it("reports progress that reaches every part", async () => {
        const source = await writeSource("world.zip", bytes(10_000, 12));
        const result = performed(await splitFile(source, { partSize: 2_500 }));
        const done: number[] = [];

        await joinParts(result.manifestPath, {
            outDir: join(workDir, "joined"),
            onProgress: (p) => done.push(p.partsDone),
        });

        expect(done).toEqual([0, 1, 2, 3, 4]);
    });

    it("names the part that is wrong when one is corrupted", async () => {
        const content = bytes(12_000, 13);
        const source = await writeSource("world.zip", content);
        const result = performed(await splitFile(source, { partSize: 2_000 }));

        // One byte, in the middle of part three. The kind of damage a truncated
        // download or a bad disk produces, and the kind a length check never sees.
        const partPath = join(workDir, "world.zip.003");
        const part = await readFile(partPath);
        part[500] = part[500] === undefined ? 0 : (part[500] + 1) & 0xff;
        await writeFile(partPath, part);

        const outDir = join(workDir, "joined");
        const error = await joinParts(result.manifestPath, { outDir }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(PartsIntegrityError);
        const integrity = error as PartsIntegrityError;
        expect(integrity.message).toContain("Part 3 of 6");
        expect(integrity.message).toContain("world.zip.003");
        expect(integrity.part?.index).toBe(3);
        expect(integrity.actual).not.toBe(integrity.expected);
    });

    it("names a part that is missing altogether", async () => {
        const source = await writeSource("world.zip", bytes(9_000, 14));
        const result = performed(await splitFile(source, { partSize: 2_000 }));
        await rm(join(workDir, "world.zip.004"));

        const error = await joinParts(result.manifestPath, { outDir: join(workDir, "joined") }).catch(
            (e: unknown) => e,
        );

        expect(error).toBeInstanceOf(PartsIntegrityError);
        expect((error as PartsIntegrityError).message).toContain("world.zip.004");
        expect((error as PartsIntegrityError).message).toContain("is missing");
    });

    it("names a part whose length is wrong", async () => {
        const source = await writeSource("world.zip", bytes(9_000, 15));
        const result = performed(await splitFile(source, { partSize: 2_000 }));
        await truncate(join(workDir, "world.zip.002"), 1_999);

        const error = await joinParts(result.manifestPath, { outDir: join(workDir, "joined") }).catch(
            (e: unknown) => e,
        );

        expect(error).toBeInstanceOf(PartsIntegrityError);
        expect((error as PartsIntegrityError).message).toContain("world.zip.002");
        expect((error as PartsIntegrityError).message).toContain("1999");
    });

    it("keeps the parts it had already verified when a later one is corrupt", async () => {
        const source = await writeSource("world.zip", bytes(12_000, 16));
        const result = performed(await splitFile(source, { partSize: 2_000 }));
        const partPath = join(workDir, "world.zip.004");
        const part = await readFile(partPath);
        part[0] = part[0] === undefined ? 0 : (part[0] + 1) & 0xff;
        await writeFile(partPath, part);
        const outDir = join(workDir, "joined");

        await expect(joinParts(result.manifestPath, { outDir })).rejects.toBeInstanceOf(
            PartsIntegrityError,
        );

        // Rolled back to the end of part three, not left holding a corrupt part four.
        const partial = await stat(join(outDir, "world.zip"));
        expect(partial.size).toBe(6_000);
    });

    it("resumes an interrupted rejoin from the last complete part", async () => {
        const content = bytes(20_000, 17);
        const source = await writeSource("world.zip", content);
        const result = performed(await splitFile(source, { partSize: 2_000 }));
        const outDir = join(workDir, "joined");

        // What an interrupted run leaves behind: three whole parts and half of a
        // fourth, because the process died in the middle of a write.
        await mkdir(outDir, { recursive: true });
        await writeFile(join(outDir, "world.zip"), content.subarray(0, 6_000 + 900));

        const seen: number[] = [];
        const joined = await joinParts(result.manifestPath, {
            outDir,
            onProgress: (p) => seen.push(p.partsDone),
        });

        expect(joined.reusedParts).toBe(3);
        // The fractional part four was discarded rather than trusted, and the join
        // restarted at the byte after part three.
        expect(seen[0]).toBe(3);
        expect(joined.sha256).toBe(sha256(content));
        expect(await readFile(joined.path)).toEqual(content);
    });

    it("re-copies a prefix whose bytes do not match the parts that claim them", async () => {
        const content = bytes(20_000, 18);
        const source = await writeSource("world.zip", content);
        const result = performed(await splitFile(source, { partSize: 2_000 }));
        const outDir = join(workDir, "joined");
        await joinParts(result.manifestPath, { outDir });

        // Damage the second part of an otherwise complete output, then truncate it so
        // the join treats it as an interrupted run. The prefix scan must notice that
        // part two is not what it claims and start again from there.
        const damaged = Buffer.from(content.subarray(0, 8_000));
        damaged[2_500] = ((damaged[2_500] ?? 0) + 1) & 0xff;
        await writeFile(join(outDir, "world.zip"), damaged);

        const joined = await joinParts(result.manifestPath, { outDir });

        expect(joined.reusedParts).toBe(1);
        expect(joined.sha256).toBe(sha256(content));
        expect(await readFile(joined.path)).toEqual(content);
    });

    it("deletes the rejoined file when the whole-file digest disagrees", async () => {
        const source = await writeSource("world.zip", bytes(6_000, 19));
        const result = performed(await splitFile(source, { partSize: 2_000 }));

        // Every part still matches its own digest; only the whole-file digest is wrong.
        // No per-part check can catch this, which is exactly why the second check exists.
        const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as {
            sha256: string;
        };
        manifest.sha256 = "0".repeat(64);
        await writeFile(result.manifestPath, JSON.stringify(manifest));

        const outDir = join(workDir, "joined");
        const error = await joinParts(result.manifestPath, { outDir }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(PartsIntegrityError);
        expect((error as PartsIntegrityError).message).toContain("has been deleted");
        await expect(stat(join(outDir, "world.zip"))).rejects.toThrow();
    });

    it("can be cancelled", async () => {
        const source = await writeSource("world.zip", bytes(20_000, 20));
        const result = performed(await splitFile(source, { partSize: 1_000 }));
        const controller = new AbortController();

        const failed = joinParts(result.manifestPath, {
            outDir: join(workDir, "joined"),
            onProgress: (p) => {
                if (p.partsDone >= 3) controller.abort();
            },
            signal: controller.signal,
        });

        await expect(failed).rejects.toThrow();
    });
});

describe("manifest validation", () => {
    async function rejectManifest(mutate: (manifest: Record<string, unknown>) => void): Promise<unknown> {
        const source = await writeSource("world.zip", bytes(6_000, 21));
        const result = performed(await splitFile(source, { partSize: 2_000 }));
        const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as Record<
            string,
            unknown
        >;
        mutate(manifest);
        await writeFile(result.manifestPath, JSON.stringify(manifest));
        return await joinParts(result.manifestPath, { outDir: join(workDir, "joined") }).catch(
            (e: unknown) => e,
        );
    }

    it("refuses a part name that points outside the manifest's directory", async () => {
        const error = await rejectManifest((manifest) => {
            const parts = manifest["parts"] as Record<string, unknown>[];
            const first = parts[0];
            if (first !== undefined) first["name"] = "../escaped.bin";
        });
        expect(error).toBeInstanceOf(PartsManifestError);
        expect((error as PartsManifestError).message).toContain("plain file name");
    });

    it("refuses a file name that is a path", async () => {
        const error = await rejectManifest((manifest) => {
            manifest["file"] = "sub/dir/world.zip";
        });
        expect(error).toBeInstanceOf(PartsManifestError);
    });

    it("refuses a manifest whose parts do not add up to its stated length", async () => {
        const error = await rejectManifest((manifest) => {
            manifest["bytes"] = 99;
        });
        expect(error).toBeInstanceOf(PartsManifestError);
        expect((error as PartsManifestError).message).toContain("add up to");
    });

    it("refuses a manifest from a future version", async () => {
        const error = await rejectManifest((manifest) => {
            manifest["version"] = 2;
        });
        expect(error).toBeInstanceOf(PartsManifestError);
    });

    it("refuses parts that are listed out of order", async () => {
        const error = await rejectManifest((manifest) => {
            const parts = manifest["parts"] as unknown[];
            parts.reverse();
        });
        expect(error).toBeInstanceOf(PartsManifestError);
        expect((error as PartsManifestError).message).toContain("in order");
    });

    it("says which file is unreadable rather than only that something is", async () => {
        const missing = join(workDir, "nowhere.zip.parts.json");
        const error = await joinParts(missing).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(PartsManifestError);
        expect((error as PartsManifestError).message).toContain("nowhere.zip.parts.json");
    });
});

describe("a real round trip", () => {
    it("survives content that is not a repeating pattern", async () => {
        const content = randomBytes(300_000);
        const source = await writeSource("random.bin", content);

        const result = performed(await splitFile(source, { partSize: 65_536 }));
        const joined = await joinParts(result.manifestPath, { outDir: join(workDir, "joined") });

        expect(result.manifest.parts).toHaveLength(5);
        expect(await readFile(joined.path)).toEqual(content);
        expect(joined.sha256).toBe(sha256(content));
    });
});
