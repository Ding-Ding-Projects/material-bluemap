/**
 * What may be backed up, checked against real folders.
 *
 * The refusals are the point of this file. Picking the folder *above* a world is the
 * single most common way a backup goes wrong, and it goes wrong expensively: without this
 * check, an hour is spent packing the wrong tree and the mistake shows up as a restore
 * that produces a folder Minecraft will not open.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveNameFor, inspectBackupSource, releaseTagFor } from "./source.js";
import { serializeCheapLfsPointer } from "./pointer.js";

let workDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-backup-source-"));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

async function makeWorld(name: string): Promise<string> {
    const root = join(workDir, name);
    await mkdir(join(root, "region"), { recursive: true });
    await writeFile(join(root, "level.dat"), "level");
    await writeFile(join(root, "region", "r.0.0.mca"), "region");
    return root;
}

async function makeRender(name: string): Promise<string> {
    const root = join(workDir, name);
    await mkdir(join(root, "web", "maps"), { recursive: true });
    await writeFile(join(root, "render.json"), "{}");
    await writeFile(join(root, "web", "maps", "tile.png"), "png");
    return root;
}

describe("inspecting a world folder", () => {
    it("accepts one with a level.dat and counts what it holds", async () => {
        const root = await makeWorld("overworld");
        const inspected = await inspectBackupSource("world", root);
        expect(inspected.ok).toBe(true);
        if (!inspected.ok) return;
        expect(inspected.source.kind).toBe("world");
        expect(inspected.source.label).toBe("overworld");
        expect(inspected.source.files).toBe(2);
        expect(inspected.source.bytes).toBe("level".length + "region".length);
    });

    it("refuses the folder above a world, and says what it looked for", async () => {
        await makeWorld("saves/overworld");
        const inspected = await inspectBackupSource("world", join(workDir, "saves"));
        expect(inspected.ok).toBe(false);
        if (inspected.ok) return;
        expect(inspected.failure.code).toBe("not-a-world");
        expect(inspected.failure.message).toContain("level.dat");
        expect(inspected.failure.message).toContain("one level below");
    });

    it("refuses a file, and a folder that is not there at all", async () => {
        await writeFile(join(workDir, "world.zip"), "not a folder");
        const file = await inspectBackupSource("world", join(workDir, "world.zip"));
        expect(file.ok ? "" : file.failure.code).toBe("not-a-folder");

        const missing = await inspectBackupSource("world", join(workDir, "nowhere"));
        expect(missing.ok ? "" : missing.failure.code).toBe("unreadable");
    });
});

describe("inspecting a render folder", () => {
    it("accepts a workspace with render.json beside its web folder", async () => {
        const root = await makeRender("mymap-abc123");
        const inspected = await inspectBackupSource("render", root);
        expect(inspected.ok).toBe(true);
        if (!inspected.ok) return;
        expect(inspected.source.renderRecordPath).toBe(join(root, "render.json"));
    });

    it("accepts a web folder with no render.json, because an older render has none", async () => {
        const root = join(workDir, "old-render");
        await mkdir(join(root, "web"), { recursive: true });
        await writeFile(join(root, "web", "settings.json"), "{}");
        const inspected = await inspectBackupSource("render", root);
        expect(inspected.ok).toBe(true);
        expect(inspected.ok ? inspected.source.renderRecordPath : "x").toBeNull();
    });

    it("refuses an ordinary folder that is neither", async () => {
        const root = join(workDir, "documents");
        await mkdir(root, { recursive: true });
        await writeFile(join(root, "notes.txt"), "hello");
        const inspected = await inspectBackupSource("render", root);
        expect(inspected.ok ? "" : inspected.failure.code).toBe("not-a-render");
    });
});

describe("an empty folder is refused whichever kind it claims to be", () => {
    it("says why an empty backup is worse than none", async () => {
        const root = join(workDir, "hollow");
        await mkdir(join(root, "web"), { recursive: true });
        await writeFile(join(root, "render.json"), "{}");
        await rm(join(root, "render.json"));
        await mkdir(join(root, "web", "maps"), { recursive: true });

        const inspected = await inspectBackupSource("render", root);
        expect(inspected.ok ? "" : inspected.failure.code).toBe("empty");
        expect(inspected.ok ? "" : inspected.failure.message).toContain("looks like");
    });
});

describe("naming", () => {
    const at = new Date("2026-08-04T10:15:00.000Z");

    it("names an archive readably, with a UTC stamp that sorts", () => {
        expect(archiveNameFor("world", "Overworld", at)).toBe("world-overworld-20260804T101500Z.zip");
    });

    it("reduces a label to something a tag, a file name and a URL all accept", () => {
        expect(archiveNameFor("world", "My World (1.20)!", at)).toBe(
            "world-my-world-1-20-20260804T101500Z.zip",
        );
        expect(releaseTagFor("world", "My World (1.20)!", at)).toBe(
            "mbm-backup-world-my-world-1-20-20260804T101500Z",
        );
    });

    it("produces a tag with no whitespace, which the pointer grammar requires", () => {
        const tag = releaseTagFor("render", "  spaced   out  ", at);
        expect(tag).not.toMatch(/\s/);
        const text = serializeCheapLfsPointer({
            version: "desktop-material/cheap-lfs/v1",
            releaseTag: tag,
            assetName: archiveNameFor("render", "  spaced   out  ", at),
            sizeInBytes: 1,
            sha256: "a".repeat(64),
        });
        expect(text.split("\n")[1]).toBe(`release-tag ${tag}`);
    });

    it("falls back to a usable name when a label reduces to nothing", () => {
        expect(archiveNameFor("world", "！！！", at)).toBe("world-backup-20260804T101500Z.zip");
    });
});
