import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inspectWorldFolder, type WorldFolderListing } from "./inspect.js";

let root = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-world-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/** `count` region files, named the way Minecraft names them. */
async function regionFiles(directory: string, count: number): Promise<void> {
    await mkdir(directory, { recursive: true });
    for (let index = 0; index < count; index += 1) {
        await writeFile(join(directory, `r.0.${index}.mca`), "");
    }
}

/**
 * A world on disk, laid out the way Minecraft lays one out.
 *
 * The keys of `dimensions` are region directories relative to the world, so the fixture
 * reads as the answer the listing is expected to give.
 */
async function makeWorld(
    path: string,
    dimensions: Readonly<Record<string, number>> = { region: 3 },
): Promise<string> {
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "level.dat"), "");
    await writeFile(join(path, "session.lock"), "");
    await mkdir(join(path, "playerdata"), { recursive: true });
    for (const [directory, count] of Object.entries(dimensions)) {
        await regionFiles(join(path, ...directory.split("/")), count);
    }
    return path;
}

/**
 * What `hasLevelDatAtRoot` in `packages/ui/.../world/worldFolder.ts` does.
 *
 * Restated here rather than imported, because the point of these assertions is that the
 * listing satisfies the wizard's own rules. A helper that drifted from them would pass
 * against itself and fail against the thing that actually reads this.
 */
function hasLevelDat(listing: WorldFolderListing): boolean {
    return listing.entries.some(
        (entry) => entry.path.toLowerCase() === "level.dat" && !entry.directory,
    );
}

/** What `worldsInside` in the wizard does: the two-segment `<world>/level.dat` markers. */
function worldsInside(listing: WorldFolderListing): string[] {
    const names = new Set<string>();
    for (const entry of listing.entries) {
        const parts = entry.path.split("/");
        if (parts.length !== 2) continue;
        if ((parts[1] ?? "").toLowerCase() !== "level.dat") continue;
        names.add(parts[0] ?? "");
    }
    return [...names].sort();
}

function paths(listing: WorldFolderListing): string[] {
    return listing.entries.map((entry) => entry.path).sort();
}

describe("a world folder", () => {
    it("finds level.dat and counts the overworld's region files", async () => {
        const world = await makeWorld(join(root, "survival"));

        const listing = await inspectWorldFolder(world);

        expect(listing.folder).toBe(world);
        expect(hasLevelDat(listing)).toBe(true);
        expect(listing.regionFiles["region"]).toBe(3);
        // The empty key is the chosen folder itself, and a world has no loose `.mca`
        // files in it. It is always present, which is what lets the wizard tell "you
        // picked the region directory" from "this folder has not been read".
        expect(listing.regionFiles[""]).toBe(0);
        expect(listing.entries).toContainEqual({ path: "region", directory: true });
    });

    it("counts region files without listing a single one of them", async () => {
        const world = await makeWorld(join(root, "survival"), { region: 5 });

        const listing = await inspectWorldFolder(world);

        expect(listing.regionFiles["region"]).toBe(5);
        expect(paths(listing).filter((path) => path.endsWith(".mca"))).toEqual([]);
    });

    it("reads the nether and the end under the keys the wizard's table uses", async () => {
        const world = await makeWorld(join(root, "survival"), {
            region: 4,
            "DIM-1/region": 2,
            "DIM1/region": 1,
        });

        const listing = await inspectWorldFolder(world);

        expect(listing.regionFiles["region"]).toBe(4);
        expect(listing.regionFiles["DIM-1/region"]).toBe(2);
        expect(listing.regionFiles["DIM1/region"]).toBe(1);
        // Forward slashes, whatever this platform's separator is: the wizard's dimension
        // table is keyed by these exact strings.
        expect(paths(listing)).toContain("DIM-1/region");
        expect(paths(listing)).toContain("DIM1/region");
    });

    it("keeps an empty dimension folder at zero rather than leaving it out", async () => {
        // Minecraft creates DIM-1 the moment anybody steps through a portal. The wizard
        // drops a dimension with no region files, and it can only do that if it is told
        // the difference between "empty" and "not there".
        const world = await makeWorld(join(root, "survival"), { region: 2, "DIM-1/region": 0 });

        const listing = await inspectWorldFolder(world);

        expect(listing.regionFiles["DIM-1/region"]).toBe(0);
        expect(listing.regionFiles["DIM1/region"]).toBeUndefined();
    });

    it("finds a datapack dimension under dimensions/<namespace>/<name>/region", async () => {
        const world = await makeWorld(join(root, "survival"), {
            region: 1,
            "dimensions/aether/skyland/region": 7,
            "dimensions/zed/last/region": 2,
        });

        const listing = await inspectWorldFolder(world);

        expect(listing.regionFiles["dimensions/aether/skyland/region"]).toBe(7);
        expect(listing.regionFiles["dimensions/zed/last/region"]).toBe(2);
    });

    it("does not probe for worlds inside a folder that is already one", async () => {
        const world = await makeWorld(join(root, "survival"));
        await writeFile(join(world, "playerdata", "level.dat"), "");

        const listing = await inspectWorldFolder(world);

        // A world is a world. Reporting `playerdata/level.dat` would make the wizard's
        // saves-folder rule fire on a folder that has its own level.dat at the top.
        expect(worldsInside(listing)).toEqual([]);
    });
});

describe("the folders people pick by mistake", () => {
    it("names the worlds inside a saves folder", async () => {
        const saves = join(root, "saves");
        await makeWorld(join(saves, "Bastion"), { region: 2 });
        await makeWorld(join(saves, "Creative Test"), { region: 1 });

        const listing = await inspectWorldFolder(saves);

        expect(hasLevelDat(listing)).toBe(false);
        expect(worldsInside(listing)).toEqual(["Bastion", "Creative Test"]);
        // Shallow: the worlds' own region files are one level further down than this
        // reads, and reporting them would describe the saves folder as a world.
        expect(listing.regionFiles["region"]).toBeUndefined();
        expect(listing.regionFiles[""]).toBe(0);
    });

    it("recognises the region folder from inside a world", async () => {
        const world = await makeWorld(join(root, "survival"), { region: 6 });

        const listing = await inspectWorldFolder(join(world, "region"));

        // The empty key, and no level.dat, is exactly what the wizard reads as "that is
        // the region folder; go up one level".
        expect(listing.regionFiles[""]).toBe(6);
        expect(hasLevelDat(listing)).toBe(false);
        expect(listing.entries).toEqual([]);
    });

    it("recognises a dimension folder one level too deep", async () => {
        const world = await makeWorld(join(root, "survival"), { region: 4, "DIM-1/region": 3 });

        const listing = await inspectWorldFolder(join(world, "DIM-1"));

        expect(hasLevelDat(listing)).toBe(false);
        expect(listing.regionFiles["region"]).toBe(3);
        expect(listing.regionFiles[""]).toBe(0);
    });

    it("reads a folder that is not a world at all, and says so by omission", async () => {
        const documents = join(root, "Documents");
        await mkdir(join(documents, "photos"), { recursive: true });
        await writeFile(join(documents, "notes.txt"), "");

        const listing = await inspectWorldFolder(documents);

        expect(hasLevelDat(listing)).toBe(false);
        expect(worldsInside(listing)).toEqual([]);
        expect(paths(listing)).toEqual(["notes.txt", "photos"]);
        expect(listing.regionFiles).toEqual({ "": 0 });
    });
});

describe("staying shallow", () => {
    it("does not walk the tree below the folder it was given", async () => {
        const world = await makeWorld(join(root, "survival"));
        await regionFiles(join(world, "backups", "yesterday", "region"), 9);
        await mkdir(join(world, "playerdata", "deep", "deeper"), { recursive: true });

        const listing = await inspectWorldFolder(world);

        // Only the region directories a world really keeps its dimensions in are opened.
        // A copy of one under `backups/` is neither counted nor listed.
        expect(Object.keys(listing.regionFiles).sort()).toEqual(["", "region"]);
        expect(paths(listing).filter((path) => path.includes("deep"))).toEqual([]);
        expect(paths(listing)).toContain("playerdata");
    });

    it("refuses to follow a symbolic link out of the chosen folder", async ({ skip }) => {
        const outside = join(root, "outside");
        await regionFiles(outside, 12);

        const world = await makeWorld(join(root, "survival"), {});
        try {
            // A junction on Windows, which needs no elevation; a directory link elsewhere.
            await symlink(outside, join(world, "region"), process.platform === "win32" ? "junction" : "dir");
        } catch {
            skip("this platform will not create a symbolic link without elevation");
            return;
        }

        const listing = await inspectWorldFolder(world);

        // The link resolves to a real directory full of region files. Following it would
        // let a folder somebody chose point this at one they did not.
        expect(listing.regionFiles["region"]).toBeUndefined();
        expect(listing.entries).toContainEqual({ path: "region", directory: false });
    });

    it("refuses to follow a linked dimension folder either", async ({ skip }) => {
        const outside = join(root, "outside");
        await regionFiles(join(outside, "region"), 12);

        const world = await makeWorld(join(root, "survival"), { region: 1 });
        try {
            await symlink(outside, join(world, "DIM-1"), process.platform === "win32" ? "junction" : "dir");
        } catch {
            skip("this platform will not create a symbolic link without elevation");
            return;
        }

        const listing = await inspectWorldFolder(world);

        expect(listing.regionFiles["DIM-1/region"]).toBeUndefined();
    });
});

describe("a folder that cannot be read", () => {
    it("refuses a relative path outright, without resolving it", async () => {
        // The wizard already refuses one, but the main process cannot take the
        // renderer's word for that: resolving it would read whatever happens to sit
        // beside the process, which is a folder nobody chose.
        await expect(inspectWorldFolder("world")).rejects.toThrow(/not a full path/);
        await expect(inspectWorldFolder("./saves/world")).rejects.toThrow(/not a full path/);
        await expect(inspectWorldFolder("../world")).rejects.toThrow(/not a full path/);
    });

    it("refuses an empty path", async () => {
        await expect(inspectWorldFolder("   ")).rejects.toThrow(/nothing to read/);
    });

    it("rejects rather than returning an empty listing for a folder that is not there", async () => {
        const missing = join(root, "not-here");

        await expect(inspectWorldFolder(missing)).rejects.toThrow(`There is no folder at ${missing}.`);
    });

    it("says when the path is a file rather than a folder", async () => {
        const file = join(root, "level.dat");
        await writeFile(file, "");

        // Naming the path is the whole point: `unreadableWorld()` in the wizard shows
        // this sentence as the fix line, so it has to say which path was the problem.
        await expect(inspectWorldFolder(file)).rejects.toThrow(`${file} is a file, not a folder.`);
    });
});
