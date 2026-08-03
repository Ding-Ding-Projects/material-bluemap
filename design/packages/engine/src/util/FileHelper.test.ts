import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { atomicMove, createDirectories, walk } from "./FileHelper.js";

const tempDirs: string[] = [];
afterAll(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "bluemap-filehelper-"));
    tempDirs.push(dir);
    return dir;
}

describe("FileHelper.createDirectories", () => {
    it("creates the whole chain and is a no-op for an existing directory", async () => {
        const root = tempDir();
        const nested = join(root, "a", "b", "c");

        expect(await createDirectories(nested)).toBe(nested);
        expect(existsSync(nested)).toBe(true);

        // second call takes the "already a directory" fast-path and must not throw
        expect(await createDirectories(nested)).toBe(nested);
    });
});

describe("FileHelper.atomicMove", () => {
    it("renames the file (source gone, content preserved)", async () => {
        const root = tempDir();
        const from = join(root, "file.unverified");
        const to = join(root, "file.jar");
        writeFileSync(from, "payload");

        await atomicMove(from, to);

        expect(existsSync(from)).toBe(false);
        expect(readFileSync(to, "utf-8")).toBe("payload");
    });

    it("replaces an existing target", async () => {
        const root = tempDir();
        const from = join(root, "new");
        const to = join(root, "old");
        writeFileSync(from, "new-content");
        writeFileSync(to, "old-content");

        await atomicMove(from, to);

        expect(readFileSync(to, "utf-8")).toBe("new-content");
        expect(existsSync(from)).toBe(false);
    });

    it("ignores a missing source (upstream swallows NoSuchFileException)", async () => {
        const root = tempDir();
        await expect(atomicMove(join(root, "nope"), join(root, "target"))).resolves.toBeUndefined();
        expect(existsSync(join(root, "target"))).toBe(false);
    });
});

describe("FileHelper.walk", () => {
    it("walks the whole tree depth-first, start-path included", async () => {
        const root = tempDir();
        mkdirSync(join(root, "data", "minecraft", "dimension_type"), { recursive: true });
        writeFileSync(join(root, "data", "minecraft", "dimension_type", "overworld.json"), "{}");
        writeFileSync(join(root, "top.txt"), "x");

        const walked = (await walk(root)).map((path) => path.substring(root.length + 1));

        expect(walked[0]).toBe(""); // the start-path itself comes first
        expect(walked).toContain(join("data", "minecraft", "dimension_type", "overworld.json"));
        expect(walked).toContain(join("data", "minecraft"));
        expect(walked).toContain("top.txt");
        // a directory is always visited before its children (pre-order)
        expect(walked.indexOf(join("data", "minecraft"))).toBeLessThan(
            walked.indexOf(join("data", "minecraft", "dimension_type")),
        );
    });

    it("respects maxDepth", async () => {
        const root = tempDir();
        mkdirSync(join(root, "a", "b"), { recursive: true });
        writeFileSync(join(root, "a", "b", "deep.txt"), "x");

        const walked = (await walk(root, 2)).map((path) => path.substring(root.length + 1));

        expect(walked).toContain(join("a", "b"));
        expect(walked).not.toContain(join("a", "b", "deep.txt"));
    });

    it("returns an empty result for a missing start-path", async () => {
        const root = tempDir();
        expect(await walk(join(root, "does-not-exist"))).toEqual([]);
    });

    it("returns just the file for a regular-file start-path", async () => {
        const root = tempDir();
        const file = join(root, "single.txt");
        writeFileSync(file, "x");
        expect(await walk(file)).toEqual([file]);
    });
});
