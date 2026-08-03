import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DirFileSystem } from "./DirFileSystem.js";
import { PackPath } from "./PackFileSystem.js";
import { ZipFileSystem } from "./ZipFileSystem.js";
import { buildZip } from "./zipTestUtil.js";

const workDir = mkdtempSync(join(tmpdir(), "bluemap-zipfs-"));
let caseCount = 0;

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

/** writes a zip into the work-directory and returns its OS-path */
function zipFile(buffer: Buffer, name = "pack.zip"): string {
    const file = join(workDir, "case-" + caseCount++ + "-" + name);
    writeFileSync(file, buffer);
    return file;
}

/** the zip every "reading" test below opens */
function samplePack(): Buffer {
    return buildZip([
        { name: "pack.mcmeta", data: '{"pack":{"pack_format":15}}' },
        { name: "assets/", data: "" },
        { name: "assets/minecraft/textures/block/stone.png", data: "not-really-a-png" },
        {
            name: "assets/minecraft/blockstates/stone.json",
            data: '{"variants":{"":{"model":"minecraft:block/stone"}}}',
            deflate: true,
        },
        { name: "assets/bluemap/hello.txt", data: "hello", deflate: true },
    ]);
}

describe("ZipFileSystem", () => {
    describe("openFile", () => {
        it("lists the entries of a directory", async () => {
            const fs = await ZipFileSystem.openFile(zipFile(samplePack()));
            try {
                expect((await fs.list("")).sort()).toEqual(["assets", "pack.mcmeta"]);
                expect((await fs.list("assets")).sort()).toEqual(["bluemap", "minecraft"]);
                expect(await fs.list("assets/minecraft")).toEqual(
                    expect.arrayContaining(["blockstates", "textures"]),
                );
            } finally {
                await fs.close();
            }
        });

        it("returns an empty listing for an unknown or non-directory path", async () => {
            const fs = await ZipFileSystem.openFile(zipFile(samplePack()));
            try {
                expect(await fs.list("nope")).toEqual([]);
                expect(await fs.list("pack.mcmeta")).toEqual([]);
            } finally {
                await fs.close();
            }
        });

        it("stats files, implicit and explicit directories", async () => {
            const fs = await ZipFileSystem.openFile(zipFile(samplePack()));
            try {
                expect(await fs.stat("pack.mcmeta")).toEqual({
                    file: true,
                    directory: false,
                    size: '{"pack":{"pack_format":15}}'.length,
                });
                // an explicit "assets/" directory-entry
                expect(await fs.stat("assets")).toEqual({
                    file: false,
                    directory: true,
                    size: 0,
                });
                // a directory that only exists because entries live below it
                expect(await fs.stat("assets/minecraft/textures")).toEqual({
                    file: false,
                    directory: true,
                    size: 0,
                });
                expect(await fs.stat("assets/nothing/here")).toBeNull();
            } finally {
                await fs.close();
            }
        });

        it("normalizes the queried path", async () => {
            const fs = await ZipFileSystem.openFile(zipFile(samplePack()));
            try {
                expect(await fs.stat("/pack.mcmeta")).not.toBeNull();
                expect(await fs.stat("./assets/bluemap/../bluemap/hello.txt")).not.toBeNull();
                expect(await fs.read("assets//bluemap/hello.txt")).toEqual(
                    Buffer.from("hello", "utf-8"),
                );
            } finally {
                await fs.close();
            }
        });

        it("reads stored and deflated entries", async () => {
            const fs = await ZipFileSystem.openFile(zipFile(samplePack()));
            try {
                // stored
                expect((await fs.read("pack.mcmeta")).toString("utf-8")).toBe(
                    '{"pack":{"pack_format":15}}',
                );
                // deflated
                expect((await fs.read("assets/bluemap/hello.txt")).toString("utf-8")).toBe("hello");
            } finally {
                await fs.close();
            }
        });

        it("throws when reading a missing entry", async () => {
            const fs = await ZipFileSystem.openFile(zipFile(samplePack()));
            try {
                await expect(fs.read("assets/nothing.txt")).rejects.toThrow("NoSuchFile");
            } finally {
                await fs.close();
            }
        });

        it("reports the OS-path as its name and has no OS-path for its entries", async () => {
            const osPath = zipFile(samplePack());
            const fs = await ZipFileSystem.openFile(osPath);
            try {
                expect(fs.getName()).toBe(osPath);
                expect(fs.getOsPath("pack.mcmeta")).toBeNull();
            } finally {
                await fs.close();
            }
        });

        it("has exactly one root-directory", async () => {
            const fs = await ZipFileSystem.openFile(zipFile(samplePack()));
            try {
                const roots = fs.getRootDirectories();
                expect(roots).toHaveLength(1);
                expect(roots[0]?.path).toBe("");
                expect(roots[0]?.fileSystem).toBe(fs);
                expect(await roots[0]?.resolve("pack.mcmeta").readText()).toBe(
                    '{"pack":{"pack_format":15}}',
                );
            } finally {
                await fs.close();
            }
        });
    });

    describe("PackPath over a zip", () => {
        it("walks the tree through PackPath", async () => {
            const fs = await ZipFileSystem.openFile(zipFile(samplePack()));
            try {
                const root = new PackPath(fs, "");
                expect(await root.isDirectory()).toBe(true);

                const assets = root.resolve("assets");
                expect(await assets.isDirectory()).toBe(true);
                expect((await assets.list()).map((child) => child.getFileName()).sort()).toEqual([
                    "bluemap",
                    "minecraft",
                ]);

                const hello = assets.resolve("bluemap/hello.txt");
                expect(await hello.isRegularFile()).toBe(true);
                expect(await hello.readText()).toBe("hello");
                expect(root.relativize(hello)).toBe("assets/bluemap/hello.txt");
                expect(hello.toString()).toBe(fs.getName() + "!/assets/bluemap/hello.txt");
            } finally {
                await fs.close();
            }
        });
    });

    describe("fromBuffer", () => {
        it("opens a zip held in memory", async () => {
            const fs = await ZipFileSystem.fromBuffer(samplePack(), "in-memory.zip");
            try {
                expect(fs.getName()).toBe("in-memory.zip");
                expect((await fs.read("pack.mcmeta")).toString("utf-8")).toBe(
                    '{"pack":{"pack_format":15}}',
                );
            } finally {
                await fs.close();
            }
        });

        it("opens a jar nested inside another jar", async () => {
            const inner = buildZip([
                { name: "pack.mcmeta", data: '{"pack":{"pack_format":15}}' },
                { name: "assets/mod/textures/block/thing.png", data: "inner-bytes", deflate: true },
            ]);
            const outer = buildZip([
                { name: "fabric.mod.json", data: '{"jars":[{"file":"META-INF/jars/inner.jar"}]}' },
                // stored, because a zip inside a zip does not compress
                { name: "META-INF/jars/inner.jar", data: inner },
            ]);

            const outerFs = await ZipFileSystem.openFile(zipFile(outer, "outer.jar"));
            try {
                const innerJar = new PackPath(outerFs, "META-INF/jars/inner.jar");
                expect(await innerJar.isRegularFile()).toBe(true);
                // a nested jar has no OS-path, so ZipFileSystem.open goes through the buffer
                expect(outerFs.getOsPath(innerJar.path)).toBeNull();

                const innerFs = await ZipFileSystem.open(innerJar);
                try {
                    expect(innerFs.getName()).toBe(innerJar.toString());
                    expect(await innerFs.list("")).toEqual(
                        expect.arrayContaining(["assets", "pack.mcmeta"]),
                    );
                    expect(
                        (await innerFs.read("assets/mod/textures/block/thing.png")).toString(
                            "utf-8",
                        ),
                    ).toBe("inner-bytes");
                } finally {
                    await innerFs.close();
                }
            } finally {
                await outerFs.close();
            }
        });
    });

    describe("open", () => {
        it("opens an OS-file directly, without buffering it", async () => {
            const osPath = zipFile(samplePack());
            const root = new DirFileSystem(workDir).getRoot();
            const zipPath = new PackPath(root.fileSystem, osPath.substring(workDir.length + 1));

            const fs = await ZipFileSystem.open(zipPath);
            try {
                // the name is the OS-path (openFile), not the "<fs>!/<path>" buffer-form
                expect(fs.getName()).toBe(osPath);
                expect((await fs.read("pack.mcmeta")).toString("utf-8")).toBe(
                    '{"pack":{"pack_format":15}}',
                );
            } finally {
                await fs.close();
            }
        });
    });

    describe("close", () => {
        it("releases the handle, so reading afterwards fails", async () => {
            const fs = await ZipFileSystem.openFile(zipFile(samplePack()));
            expect((await fs.read("pack.mcmeta")).toString("utf-8")).toBe(
                '{"pack":{"pack_format":15}}',
            );

            await fs.close();

            // the index survives (it was read up-front) but the file-handle is gone
            expect(await fs.stat("pack.mcmeta")).not.toBeNull();
            await expect(fs.read("pack.mcmeta")).rejects.toThrow();
        });

        it("lets the zip-file be deleted afterwards", async () => {
            const osPath = zipFile(samplePack());
            const fs = await ZipFileSystem.openFile(osPath);
            await fs.close();

            // on windows an open handle would make this throw EBUSY/EPERM
            expect(() => rmSync(osPath)).not.toThrow();
        });
    });
});
