import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { regionDirectoryCandidates } from "./measure.js";

/**
 * Deciding whether what arrived is actually a Minecraft world.
 *
 * A world can turn up here as a directory in the repository, as an extracted zip, or as
 * a release asset, and the common failure in all three cases is the same: the archive
 * had a wrapper folder, so what the workflow is pointing at contains the world rather
 * than being it. Guessing silently would render an empty map; the search below is
 * bounded and reports what it looked at.
 */

/** How deep to look for a nested world folder before giving up. */
const MAX_SEARCH_DEPTH = 3;

export interface WorldLocation {
    /** the directory holding level.dat */
    worldDirectory: string;
    /** the directory holding the requested dimension's region files */
    regionDirectory: string;
    regionFileCount: number;
}

export class WorldValidationError extends Error {
    readonly details: string[];

    constructor(message: string, details: string[]) {
        super(message + (details.length > 0 ? "\n" + details.map((d) => "  - " + d).join("\n") : ""));
        this.name = "WorldValidationError";
        this.details = details;
    }
}

async function isDirectory(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

async function isFile(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
}

/** Directories at or below `root` that hold a `level.dat`, nearest first. */
export async function findWorldDirectories(root: string): Promise<string[]> {
    const found: string[] = [];

    const walk = async (directory: string, depth: number): Promise<void> => {
        if (await isFile(join(directory, "level.dat"))) found.push(directory);
        if (depth >= MAX_SEARCH_DEPTH) return;

        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries)
            if (entry.isDirectory()) await walk(join(directory, entry.name), depth + 1);
    };

    await walk(root, 0);
    return found;
}

async function countRegionFiles(directory: string): Promise<number> {
    if (!(await isDirectory(directory))) return 0;
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".mca")).length;
}

/**
 * Locates and checks the world, or throws with a message that says what was looked for,
 * where, and what was there instead.
 */
export async function locateWorld(root: string, dimension: string): Promise<WorldLocation> {
    if (!(await isDirectory(root)))
        throw new WorldValidationError("The world path is not a directory: " + root, []);

    const candidates = await findWorldDirectories(root);

    if (candidates.length === 0) {
        const listing = await describeDirectory(root);
        throw new WorldValidationError(
            "No level.dat was found at " +
                root +
                " or up to " +
                MAX_SEARCH_DEPTH +
                " directories below it, so this is not a Minecraft world save folder.",
            listing,
        );
    }

    const problems: string[] = [];
    for (const worldDirectory of candidates) {
        for (const regionDirectory of regionDirectoryCandidates(worldDirectory, dimension)) {
            const regionFileCount = await countRegionFiles(regionDirectory);
            if (regionFileCount > 0) return { worldDirectory, regionDirectory, regionFileCount };

            problems.push(
                (await isDirectory(regionDirectory))
                    ? regionDirectory + " exists but holds no .mca region files"
                    : regionDirectory + " does not exist",
            );
        }
    }

    throw new WorldValidationError(
        "Found a world at " +
            candidates[0] +
            " but no region files for dimension '" +
            dimension +
            "'. A world with nothing generated in that dimension has nothing to render.",
        problems,
    );
}

async function describeDirectory(root: string): Promise<string[]> {
    try {
        const entries = await readdir(root, { withFileTypes: true });
        if (entries.length === 0) return [root + " is empty"];
        return entries
            .slice(0, 12)
            .map(
                (entry) =>
                    relative(root, join(root, entry.name)).split(sep).join("/") +
                    (entry.isDirectory() ? "/" : ""),
            );
    } catch {
        return [];
    }
}
