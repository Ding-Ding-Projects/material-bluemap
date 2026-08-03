import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { UnsafeEntryError, extractZip, safeEntryPath } from "./extract.js";
import { buildZip } from "./zipTestUtil.js";

let workDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-extract-"));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

async function archive(entries: Parameters<typeof buildZip>[0]): Promise<string> {
    const path = join(workDir, "archive.zip");
    await writeFile(path, buildZip(entries));
    return path;
}

describe("safeEntryPath", () => {
    const root = resolve("/tmp/destination");

    it("accepts an ordinary relative entry", () => {
        expect(safeEntryPath(root, "world/region/r.0.0.mca")).toBe(
            resolve(root, "world/region/r.0.0.mca"),
        );
    });

    it("refuses an entry that climbs out with ..", () => {
        expect(safeEntryPath(root, "../escaped.txt")).toBeNull();
        expect(safeEntryPath(root, "world/../../escaped.txt")).toBeNull();
    });

    it("refuses an absolute entry, in either separator", () => {
        expect(safeEntryPath(root, "/etc/passwd")).toBeNull();
        expect(safeEntryPath(root, "\\Windows\\System32\\drivers\\etc\\hosts")).toBeNull();
        expect(safeEntryPath(root, "C:/Windows/System32/config")).toBeNull();
    });

    it("refuses a backslash climb, which normalises to nothing on POSIX", () => {
        expect(safeEntryPath(root, "..\\..\\escaped.txt")).toBeNull();
    });

    it("refuses an empty name and one carrying a NUL", () => {
        expect(safeEntryPath(root, "")).toBeNull();
        expect(safeEntryPath(root, "world\0.txt")).toBeNull();
    });

    it("does not accept a sibling directory that merely shares a prefix", () => {
        expect(safeEntryPath(root, "../destination-elsewhere/file")).toBeNull();
    });
});

describe("extractZip", () => {
    it("unpacks files and directories", async () => {
        const path = await archive([
            { name: "world/" },
            { name: "world/level.dat", content: Buffer.from("level") },
            { name: "world/region/r.0.0.mca", content: Buffer.from("region bytes") },
        ]);
        const destination = join(workDir, "out");

        const result = await extractZip(path, destination);

        expect(result.entries).toBe(2);
        expect(result.bytes).toBe("level".length + "region bytes".length);
        expect(await readFile(join(destination, "world", "level.dat"), "utf8")).toBe("level");
        expect(await readFile(join(destination, "world", "region", "r.0.0.mca"), "utf8")).toBe(
            "region bytes",
        );
    });

    it("creates intermediate directories the archive never declared", async () => {
        const path = await archive([{ name: "a/b/c/d.txt", content: Buffer.from("deep") }]);
        const destination = join(workDir, "out");

        await extractZip(path, destination);

        expect(await readFile(join(destination, "a", "b", "c", "d.txt"), "utf8")).toBe("deep");
    });

    it("refuses an archive with an escaping entry, before writing any of it", async () => {
        const path = await archive([
            { name: "innocent.txt", content: Buffer.from("harmless") },
            { name: "../escaped.txt", content: Buffer.from("hostile") },
        ]);
        const destination = join(workDir, "out");

        await expect(extractZip(path, destination)).rejects.toBeInstanceOf(UnsafeEntryError);

        // The forty innocent entries in front of the hostile one must not be written
        // either: an extractor that stops half way has still done what it was told.
        await expect(stat(join(destination, "innocent.txt"))).rejects.toThrow();
        await expect(stat(join(workDir, "escaped.txt"))).rejects.toThrow();
    });

    it("refuses a symbolic link", async () => {
        const path = await archive([
            { name: "link", content: Buffer.from("/etc/passwd"), symlink: true },
        ]);

        const error = await extractZip(path, join(workDir, "out")).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(UnsafeEntryError);
        expect((error as UnsafeEntryError).message).toContain("symbolic link");
    });

    it("reports progress by uncompressed bytes", async () => {
        const path = await archive([
            { name: "one.bin", content: Buffer.alloc(100, 1) },
            { name: "two.bin", content: Buffer.alloc(300, 2) },
        ]);
        const percents: number[] = [];

        await extractZip(path, join(workDir, "out"), {
            onProgress: (progress) => percents.push(Math.round(progress.percent)),
        });

        expect(percents).toEqual([25, 100]);
    });

    it("can be cancelled", async () => {
        const path = await archive([
            { name: "one.bin", content: Buffer.alloc(10, 1) },
            { name: "two.bin", content: Buffer.alloc(10, 2) },
        ]);
        const controller = new AbortController();

        const failed = extractZip(path, join(workDir, "out"), {
            signal: controller.signal,
            onProgress: () => controller.abort(),
        });

        await expect(failed).rejects.toThrow();
    });
});
