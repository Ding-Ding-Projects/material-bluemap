/**
 * Detection, proven against folders built on disk rather than against hand-written
 * listings.
 *
 * The fixtures go through the real `inspectWorldFolder`, because the thing worth proving
 * is that the two halves agree: a listing shape invented here could satisfy
 * `detectBedrockWorld` perfectly while the reader never produces it. Nothing in this file
 * needs Chunker, a JVM, or a real Bedrock world - a Bedrock world's *shape* is a few empty
 * files, and its shape is the whole of what detection reads.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inspectWorldFolder } from "../world/inspect.js";
import { detectBedrockWorld, readBedrockLevelName } from "./detect.js";

let root = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-bedrock-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/** A Bedrock world, laid out the way the game lays one out. */
async function makeBedrockWorld(
    path: string,
    options: { name?: string | null; database?: boolean } = {},
): Promise<string> {
    await mkdir(path, { recursive: true });
    // Little-endian NBT behind an 8-byte header. The bytes do not matter here; only that
    // a file by this name exists, which is what makes both editions look alike at a glance.
    await writeFile(join(path, "level.dat"), Buffer.alloc(64));
    await writeFile(join(path, "level.dat_old"), Buffer.alloc(64));
    if (options.name !== null) {
        await writeFile(join(path, "levelname.txt"), options.name ?? "My Bedrock World", "utf8");
    }
    if (options.database !== false) {
        const db = join(path, "db");
        await mkdir(db, { recursive: true });
        await writeFile(join(db, "CURRENT"), "MANIFEST-000001\n");
        await writeFile(join(db, "MANIFEST-000001"), "");
        await writeFile(join(db, "000003.log"), "");
        await writeFile(join(db, "000005.ldb"), "");
    }
    return path;
}

/** A Java world, laid out the way Minecraft lays one out. */
async function makeJavaWorld(path: string, regions = 3): Promise<string> {
    await mkdir(join(path, "region"), { recursive: true });
    await writeFile(join(path, "level.dat"), "");
    await writeFile(join(path, "session.lock"), "");
    for (let index = 0; index < regions; index += 1) {
        await writeFile(join(path, "region", `r.0.${String(index)}.mca`), "");
    }
    return path;
}

describe("a Bedrock world", () => {
    it("is detected and named as Bedrock rather than reported as not a world", async () => {
        const world = await makeBedrockWorld(join(root, "MyWorld"), { name: "Survival Island" });

        const detection = detectBedrockWorld(await inspectWorldFolder(world));

        expect(detection.bedrock).toBe(true);
        expect(detection.confidence).toBe("certain");
        expect(detection.markers).toMatchObject({
            levelDat: true,
            levelNameFile: true,
            database: true,
        });
        expect(detection.markers.databaseFiles).toBeGreaterThan(0);

        // The sentence is the whole point of this half of the feature: it must name the
        // edition and the next step, not merely decline to render.
        expect(detection.explanation).toContain("Bedrock Edition");
        expect(detection.explanation).toContain("converted to Java Edition");

        expect(await readBedrockLevelName(world)).toBe("Survival Island");
    });

    it("is still detected when its db folder cannot be counted, via levelname.txt", async () => {
        const world = await makeBedrockWorld(join(root, "Unreadable"));
        // A listing that found the directory but counted nothing in it - what an
        // unreadable or permission-denied `db` produces.
        const listing = { ...(await inspectWorldFolder(world)), leveldbFiles: null };

        const detection = detectBedrockWorld(listing);

        expect(detection.bedrock).toBe(true);
        expect(detection.confidence).toBe("certain");
    });

    it("is reported as only likely when nothing corroborates the db folder", async () => {
        const world = await makeBedrockWorld(join(root, "Bare"), { name: null });
        const listing = { ...(await inspectWorldFolder(world)), leveldbFiles: null };

        const detection = detectBedrockWorld(listing);

        expect(detection.bedrock).toBe(true);
        expect(detection.confidence).toBe("likely");
        expect(detection.explanation).toContain("looks like");
    });

    it("trims the trailing newline Bedrock sometimes writes into levelname.txt", async () => {
        const world = await makeBedrockWorld(join(root, "Newline"), { name: "Trailing\r\n" });
        expect(await readBedrockLevelName(world)).toBe("Trailing");
    });

    it("reports no name rather than the folder name when levelname.txt is missing", async () => {
        const world = await makeBedrockWorld(join(root, "Nameless"), { name: null });
        expect(await readBedrockLevelName(world)).toBeNull();
    });
});

describe("a Java world", () => {
    it("is never reported as Bedrock, and its listing is unchanged", async () => {
        const world = await makeJavaWorld(join(root, "survival"));

        const listing = await inspectWorldFolder(world);
        const detection = detectBedrockWorld(listing);

        expect(detection.bedrock).toBe(false);
        expect(detection.confidence).toBeNull();
        expect(detection.explanation).toBe("");

        // The additive field must not have disturbed anything a Java world already reported.
        expect(listing.regionFiles["region"]).toBe(3);
        expect(listing.entries.some((entry) => entry.path === "level.dat")).toBe(true);
        // No `db` directory means nothing was opened and nothing was counted.
        expect(listing.leveldbFiles).toBeNull();
    });

    it("stays Java even when something unrelated has parked a db folder beside it", async () => {
        // The exact false positive worth guarding: a mod, a datapack or a backup tool
        // leaving a directory called `db` in a world that renders perfectly well today.
        const world = await makeJavaWorld(join(root, "modded"));
        await mkdir(join(world, "db"), { recursive: true });
        await writeFile(join(world, "db", "000001.ldb"), "");

        const detection = detectBedrockWorld(await inspectWorldFolder(world));

        expect(detection.bedrock).toBe(false);
    });

    it("stays Java when it is new enough to have no terrain yet", async () => {
        const world = await makeJavaWorld(join(root, "fresh"), 0);
        await mkdir(join(world, "db"), { recursive: true });

        const detection = detectBedrockWorld(await inspectWorldFolder(world));

        // An empty `region` directory is a Java world that has not generated chunks. Routing
        // it to a converter would be wrong in a way its owner could not diagnose.
        expect(detection.bedrock).toBe(false);
    });
});

describe("a folder that is neither", () => {
    it("is not reported as Bedrock just because it holds a db folder", async () => {
        const folder = join(root, "notes");
        await mkdir(join(folder, "db"), { recursive: true });
        await writeFile(join(folder, "db", "shopping-list.txt"), "");

        const detection = detectBedrockWorld(await inspectWorldFolder(folder));

        expect(detection.bedrock).toBe(false);
        // A folder of ordinary files is not a LevelDB database, and the count says so.
        expect(detection.markers.databaseFiles).toBe(0);
    });

    it("does not read a child world's level.dat as its own", async () => {
        // A `saves` directory holding Bedrock worlds. The chosen folder is not itself a
        // world, and `inspect.ts` reports `<child>/level.dat` markers for the ones inside.
        const saves = join(root, "minecraftWorlds");
        await makeBedrockWorld(join(saves, "WorldA"));

        const detection = detectBedrockWorld(await inspectWorldFolder(saves));

        expect(detection.bedrock).toBe(false);
        expect(detection.markers.levelDat).toBe(false);
    });
});
