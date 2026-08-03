import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Key } from "@material-bluemap/shared";
import { Pack, type Loader } from "./Pack.js";
import { PackVersion } from "./PackVersion.js";
import { DirFileSystem } from "./vfs/DirFileSystem.js";
import type { PackPath } from "./vfs/PackFileSystem.js";
import { buildZip } from "./vfs/zipTestUtil.js";

const workDir = mkdtempSync(join(tmpdir(), "bluemap-pack-"));
let caseCount = 0;

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

/** creates a fresh directory-tree from a `relative path -> content` map */
function tree(files: Record<string, string | Buffer>): string {
    const root = join(workDir, "case-" + caseCount++);
    mkdirSync(root, { recursive: true });
    for (const [relative, content] of Object.entries(files)) {
        const file = join(root, ...relative.split("/"));
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content);
    }
    return root;
}

function rootOf(osDir: string): PackPath {
    return new DirFileSystem(osDir).getRoot();
}

/**
 * Records every root the pack hands to the loader, identified by the content of that
 * root's `id.txt` (so a root inside a mounted zip is identifiable too).
 */
class RecordingLoader implements Loader {
    readonly loaded: string[] = [];
    readonly failFor = new Set<string>();

    async load(root: PackPath): Promise<void> {
        const idFile = root.resolve("id.txt");
        const id = (await idFile.isRegularFile())
            ? (await idFile.readText()).trim()
            : "<" + root.path + ">";
        if (this.failFor.has(id)) throw new Error("loader failed for " + id);
        this.loaded.push(id);
    }
}

class TestPack extends Pack {
    async loadResources(roots: Iterable<PackPath>): Promise<void> {
        for (const root of roots) await this.loadResourcePath(root, this.loader);
    }

    readonly loader = new RecordingLoader();
}

let debugSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
});

afterEach(() => {
    debugSpy.mockRestore();
});

function debugMessages(): string[] {
    return debugSpy.mock.calls.map((call) => String(call[0]));
}

describe("Pack constructor", () => {
    it("keeps the pack-version and defaults enabledFeatures to null", () => {
        const version = new PackVersion(10, 0);
        const pack = new TestPack(version);
        expect(pack.getPackVersion()).toBe(version);
        expect(pack.getEnabledFeatures()).toBeNull();
    });

    it("keeps the given enabled features", () => {
        const features = new Set([Key.parse("minecraft:foo")]);
        expect(new TestPack(new PackVersion(10, 0), features).getEnabledFeatures()).toBe(features);
    });
});

describe("Pack#loadResourcePath overlays", () => {
    it("applies the pack.mcmeta overlays in reverse array-order, then the root", async () => {
        const dir = tree({
            "pack.mcmeta": JSON.stringify({
                pack: { pack_format: 10 },
                overlays: {
                    entries: [
                        { formats: 10, directory: "overlay_a" },
                        { formats: 10, directory: "overlay_b" },
                        { formats: 99, directory: "overlay_wrong_format" },
                        { formats: 10, directory: "overlay_missing" },
                        { formats: 10 },
                    ],
                },
            }),
            "id.txt": "root",
            "overlay_a/id.txt": "a",
            "overlay_b/id.txt": "b",
            "overlay_wrong_format/id.txt": "wrong-format",
        });

        const pack = new TestPack(new PackVersion(10, 0));
        await pack.loadResources([rootOf(dir)]);

        // reverse iteration: the entry without a directory and the one whose directory does
        // not exist are skipped, the 99-only overlay does not include pack-version 10
        expect(pack.loader.loaded).toEqual(["b", "a", "root"]);
    });

    it("uses min_format/max_format overlays when both are present", async () => {
        const dir = tree({
            "pack.mcmeta": JSON.stringify({
                overlays: {
                    entries: [
                        { min_format: [10, 0], max_format: [10, 0], directory: "match" },
                        { min_format: [11, 0], max_format: [11, 0], directory: "no_match" },
                    ],
                },
            }),
            "id.txt": "root",
            "match/id.txt": "match",
            "no_match/id.txt": "no-match",
        });

        const pack = new TestPack(new PackVersion(10, 0));
        await pack.loadResources([rootOf(dir)]);

        expect(pack.loader.loaded).toEqual(["match", "root"]);
    });

    it("swallows a failing overlay and still loads the root", async () => {
        const dir = tree({
            "pack.mcmeta": JSON.stringify({
                overlays: { entries: [{ formats: 10, directory: "overlay_a" }] },
            }),
            "id.txt": "root",
            "overlay_a/id.txt": "a",
        });

        const pack = new TestPack(new PackVersion(10, 0));
        pack.loader.failFor.add("a");
        await pack.loadResources([rootOf(dir)]);

        expect(pack.loader.loaded).toEqual(["root"]);
        expect(debugMessages().some((m) => m.startsWith("Failed to load overlay"))).toBe(true);
    });
});

describe("Pack#loadResourcePath feature gate", () => {
    const mcmeta = JSON.stringify({
        features: { enabled: ["minecraft:foo", "minecraft:bar"] },
        overlays: { entries: [{ formats: 10, directory: "ov" }] },
    });
    const files = { "pack.mcmeta": mcmeta, "id.txt": "root", "ov/id.txt": "ov" };

    it("loads everything when the pack has no feature-gate (enabledFeatures = null)", async () => {
        const pack = new TestPack(new PackVersion(10, 0));
        await pack.loadResources([rootOf(tree(files))]);
        expect(pack.loader.loaded).toEqual(["ov", "root"]);
    });

    it("skips the whole pack when a required feature is not enabled", async () => {
        const pack = new TestPack(
            new PackVersion(10, 0),
            new Set([Key.parse("minecraft:foo"), Key.parse("minecraft:other")]),
        );
        await pack.loadResources([rootOf(tree(files))]);

        // the gate returns before the overlays are applied and before the loader runs
        expect(pack.loader.loaded).toEqual([]);
        expect(
            debugMessages().some(
                (m) =>
                    m.includes("because not all required features") &&
                    m.includes("[minecraft:foo, minecraft:bar]") &&
                    m.includes("[minecraft:foo, minecraft:other]"),
            ),
        ).toBe(true);
    });

    it("loads the pack when every required feature is enabled", async () => {
        const pack = new TestPack(
            new PackVersion(10, 0),
            new Set([Key.parse("minecraft:bar"), Key.parse("minecraft:foo"), Key.parse("x:y")]),
        );
        await pack.loadResources([rootOf(tree(files))]);
        expect(pack.loader.loaded).toEqual(["ov", "root"]);
    });

    it("loads a pack with no declared features even when the gate is set", async () => {
        const dir = tree({ "pack.mcmeta": "{}", "id.txt": "root" });
        const pack = new TestPack(new PackVersion(10, 0), new Set([Key.parse("minecraft:foo")]));
        await pack.loadResources([rootOf(dir)]);
        expect(pack.loader.loaded).toEqual(["root"]);
    });
});

describe("Pack#loadResourcePath nested datapacks", () => {
    it("recurses into data/<namespace>/datapacks/*", async () => {
        const dir = tree({
            "pack.mcmeta": "{}",
            "id.txt": "root",
            "data/ns1/datapacks/dp1/id.txt": "dp1",
            "data/ns1/datapacks/dp2/id.txt": "dp2",
            "data/ns2/other/id.txt": "not-a-datapack",
            "data/ns2/datapacks/dp3/id.txt": "dp3",
        });

        const pack = new TestPack(new PackVersion(10, 0));
        await pack.loadResources([rootOf(dir)]);

        expect(pack.loader.loaded.at(-1)).toBe("root");
        expect(pack.loader.loaded.slice(0, -1).sort()).toEqual(["dp1", "dp2", "dp3"]);
    });

    it("swallows a failing nested datapack but still loads the root", async () => {
        const dir = tree({
            "pack.mcmeta": "{}",
            "id.txt": "root",
            "data/ns1/datapacks/dp1/id.txt": "dp1",
        });

        const pack = new TestPack(new PackVersion(10, 0));
        pack.loader.failFor.add("dp1");
        await pack.loadResources([rootOf(dir)]);

        expect(pack.loader.loaded).toEqual(["root"]);
        expect(debugMessages().some((m) => m.startsWith("Failed to load nested datapack"))).toBe(
            true,
        );
    });
});

describe("Pack#loadResourcePath zip / jar mounting", () => {
    it("mounts a zip and recurses into the nested jars of fabric.mod.json", async () => {
        const innerJar = buildZip([
            { name: "id.txt", data: "inner" },
            { name: "assets/minecraft/whatever.json", data: "{}", deflate: true },
        ]);
        const outerJar = buildZip([
            {
                name: "fabric.mod.json",
                data: JSON.stringify({
                    id: "testmod",
                    jars: [{ file: "META-INF/jars/inner.jar" }, { file: "META-INF/jars/gone.jar" }],
                }),
            },
            { name: "META-INF/jars/inner.jar", data: innerJar },
            { name: "id.txt", data: "outer" },
        ]);
        const dir = tree({ "mod.jar": outerJar });

        const pack = new TestPack(new PackVersion(10, 0));
        await pack.loadResources([rootOf(dir).resolve("mod.jar")]);

        // the nested jar is loaded before the jar that declares it; the missing jar-entry
        // is silently skipped
        expect(pack.loader.loaded).toEqual(["inner", "outer"]);
    });

    it("honours a pack.mcmeta inside the mounted zip", async () => {
        const jar = buildZip([
            {
                name: "pack.mcmeta",
                data: JSON.stringify({
                    overlays: { entries: [{ formats: 10, directory: "overlay" }] },
                }),
            },
            { name: "id.txt", data: "zip-root" },
            { name: "overlay/id.txt", data: "zip-overlay" },
        ]);
        const dir = tree({ "pack.zip": jar });

        const pack = new TestPack(new PackVersion(10, 0));
        await pack.loadResources([rootOf(dir).resolve("pack.zip")]);

        expect(pack.loader.loaded).toEqual(["zip-overlay", "zip-root"]);
    });

    it("swallows a file that is not a readable zip", async () => {
        const dir = tree({ "broken.jar": "definitely not a zip" });

        const pack = new TestPack(new PackVersion(10, 0));
        await pack.loadResources([rootOf(dir).resolve("broken.jar")]);

        expect(pack.loader.loaded).toEqual([]);
        expect(debugMessages().some((m) => m.startsWith("Failed to read '"))).toBe(true);
    });

    it("swallows a broken fabric.mod.json", async () => {
        const dir = tree({ "fabric.mod.json": "{ this is not json", "id.txt": "root" });

        const pack = new TestPack(new PackVersion(10, 0));
        await pack.loadResources([rootOf(dir)]);

        expect(pack.loader.loaded).toEqual(["root"]);
        expect(debugMessages().some((m) => m.startsWith("Failed to read fabric.mod.json"))).toBe(
            true,
        );
    });
});

describe("Pack#loadResourcePath error handling", () => {
    it("falls back to a default PackMeta when pack.mcmeta cannot be parsed", async () => {
        const dir = tree({
            "pack.mcmeta": "{ not valid",
            "id.txt": "root",
        });

        const pack = new TestPack(new PackVersion(10, 0));
        await pack.loadResources([rootOf(dir)]);

        expect(pack.loader.loaded).toEqual(["root"]);
        expect(debugMessages().some((m) => m.startsWith("Failed to read pack.mcmeta"))).toBe(true);
    });

    it("propagates a failure of the root loader (upstream does not wrap it)", async () => {
        const dir = tree({ "pack.mcmeta": "{}", "id.txt": "root" });

        const pack = new TestPack(new PackVersion(10, 0));
        pack.loader.failFor.add("root");

        await expect(pack.loadResources([rootOf(dir)])).rejects.toThrow("loader failed for root");
    });

    it("propagates a missing root (upstream: Path#toRealPath)", async () => {
        const dir = tree({ "id.txt": "root" });

        const pack = new TestPack(new PackVersion(10, 0));
        await expect(pack.loadResources([rootOf(dir).resolve("missing")])).rejects.toThrow(
            "NoSuchFile",
        );
    });

    it("loads a directory without any pack.mcmeta", async () => {
        const dir = tree({ "id.txt": "root" });

        const pack = new TestPack(new PackVersion(10, 0));
        await pack.loadResources([rootOf(dir)]);

        expect(pack.loader.loaded).toEqual(["root"]);
        expect(debugMessages()).toEqual([]);
    });

    it("loads every root handed to loadResources", async () => {
        const a = tree({ "id.txt": "a" });
        const b = tree({ "id.txt": "b" });

        const pack = new TestPack(new PackVersion(10, 0));
        await pack.loadResources([rootOf(a), rootOf(b)]);

        expect(pack.loader.loaded).toEqual(["a", "b"]);
    });
});

describe("Pack.list / Pack.walk", () => {
    const dir = () =>
        tree({
            "a.txt": "a",
            "sub/b.txt": "b",
            "sub/deep/c.txt": "c",
        });

    it("lists the direct children of a directory", async () => {
        const root = rootOf(dir());
        expect((await Pack.list(root)).map((p) => p.getFileName()).sort()).toEqual([
            "a.txt",
            "sub",
        ]);
    });

    it("lists nothing for a file or a missing path", async () => {
        const root = rootOf(dir());
        expect(await Pack.list(root.resolve("a.txt"))).toEqual([]);
        expect(await Pack.list(root.resolve("nope"))).toEqual([]);
    });

    it("walks the whole tree, the start-path included", async () => {
        const root = rootOf(dir());
        expect((await Pack.walk(root)).map((p) => p.path).sort()).toEqual([
            "",
            "a.txt",
            "sub",
            "sub/b.txt",
            "sub/deep",
            "sub/deep/c.txt",
        ]);
    });

    it("walks a single file and nothing at all for a missing path", async () => {
        const root = rootOf(dir());
        expect((await Pack.walk(root.resolve("a.txt"))).map((p) => p.path)).toEqual(["a.txt"]);
        expect(await Pack.walk(root.resolve("nope"))).toEqual([]);
    });
});
