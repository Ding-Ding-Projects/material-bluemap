/**
 * Every world inside a `saves` folder, with the facts somebody chooses one by.
 *
 * The wizard's first step used to be a path field and nothing else, which asks the person
 * to know where Minecraft keeps its saves and to type it correctly. This is the other
 * half: hand it a `saves` folder and it reports the worlds in it, each with its real name,
 * when it was last played, the version it was last opened with, what kind of game it is,
 * which dimensions have terrain, and how much disk it occupies.
 *
 * ## What is a world, and what is quietly not
 *
 * A subdirectory is a world when it contains a `level.dat`. Anything else in a `saves`
 * folder - a stray `screenshots` copy, a backup archive, an editor's scratch directory -
 * is left out entirely, because listing it would offer somebody a render that cannot
 * start.
 *
 * A directory that *does* have a `level.dat` is always listed, even when that file turns
 * out to be unreadable. It keeps its folder name, its dimensions and its size, and
 * carries the reason the rest is missing, so a world with one corrupt file is something
 * the person can see and reason about rather than a world that mysteriously vanished from
 * a list they know it should be in.
 *
 * ## Cost
 *
 * Reading a saves folder must stay cheap enough to do on every visit to step one, and a
 * mature world holds tens of thousands of files. Three things keep it bounded: the
 * structural read is `inspect.ts`, which counts region files from directory entries and
 * never stats one; the `level.dat` read skips the dimension registry rather than decoding
 * it; and the size walk stops at {@link MAX_SIZE_ENTRIES} files and says so, so the
 * reported size is either complete or honestly labelled as a floor.
 */

import { lstat, opendir } from "node:fs/promises";
import { join } from "node:path";
import { inspectWorldFolder } from "./inspect.js";
import { readLevelDat, type MinecraftGameMode } from "./levelDat.js";

/** Most worlds reported from one folder. A `saves` directory with more is not a saves directory. */
export const MAX_WORLDS = 512;

/**
 * Most files stat-ed while measuring one world.
 *
 * Past this the size is reported as incomplete and the interface says "at least", because
 * a number that is quietly a fraction of the truth is worse than one that admits it.
 */
export const MAX_SIZE_ENTRIES = 20_000;

/** How deep the size walk follows a world's own directory tree. */
const MAX_SIZE_DEPTH = 8;

export interface MinecraftWorldSummary {
    /** Which mounted folder this world was found in. */
    readonly folderId: string;
    /** The world folder, absolute. This is what the wizard renders. */
    readonly path: string;
    /** The folder's own name on disk, which is often not the world's name. */
    readonly directoryName: string;
    /** `LevelName`, or null when it could not be read. Never the folder name in disguise. */
    readonly name: string | null;
    /** Milliseconds since the epoch, or null when the world has never recorded one. */
    readonly lastPlayed: number | null;
    readonly versionName: string | null;
    readonly snapshot: boolean | null;
    readonly gameMode: MinecraftGameMode | null;
    readonly hardcore: boolean | null;
    readonly cheats: boolean | null;
    /** Decimal text, because a 64-bit seed does not survive a JavaScript number. */
    readonly seed: string | null;
    /**
     * Region-file counts keyed by directory, exactly as `inspect.ts` reports them.
     *
     * Handed over raw so the interface can run its own `dimensionsIn` over it. Naming the
     * dimensions here as well would be a second table of Minecraft's dimension layout,
     * and two tables of the same thing drift.
     */
    readonly regionFiles: Readonly<Record<string, number>>;
    /** Sum of file sizes under the world folder, or null when nothing could be measured. */
    readonly sizeBytes: number | null;
    /** False when {@link MAX_SIZE_ENTRIES} stopped the walk, so the size is a floor. */
    readonly sizeComplete: boolean;
    /** Why the details are missing, when they are. Null when `level.dat` read cleanly. */
    readonly detailsError: string | null;
}

export interface SavesScan {
    readonly folderId: string;
    readonly savesPath: string;
    readonly worlds: readonly MinecraftWorldSummary[];
    /** True when {@link MAX_WORLDS} stopped the listing before the folder ran out. */
    readonly truncated: boolean;
}

/**
 * Reads a `saves` folder.
 *
 * Rejects only when the folder itself cannot be opened, which the caller turns into a
 * per-folder message rather than a failure of the whole list: one unplugged drive must
 * not take the worlds on every other drive off the screen with it.
 */
export async function scanSavesFolder(savesPath: string, folderId: string): Promise<SavesScan> {
    const names: string[] = [];
    let truncated = false;

    const dir = await opendir(savesPath);
    for await (const child of dir) {
        // `isDirectory` is false for a symbolic link, because a directory read never
        // follows one. Only real directories are descended into, which is the same guard
        // `inspect.ts` relies on and for the same reason.
        if (!child.isDirectory()) continue;
        if (names.length >= MAX_WORLDS) {
            truncated = true;
            break;
        }
        names.push(child.name);
    }

    const worlds: MinecraftWorldSummary[] = [];
    for (const name of names) {
        const world = await readWorld(join(savesPath, name), name, folderId);
        if (world !== null) worlds.push(world);
    }

    return { folderId, savesPath, worlds, truncated };
}

/**
 * One candidate directory, or null when it is not a world at all.
 *
 * The `level.dat` check comes first and is one `lstat`, so a `saves` folder holding a
 * dozen non-world directories costs a dozen stats rather than a dozen tree walks.
 */
async function readWorld(
    path: string,
    directoryName: string,
    folderId: string,
): Promise<MinecraftWorldSummary | null> {
    const levelDat = join(path, "level.dat");
    const stats = await lstat(levelDat).catch(() => null);
    if (stats === null || !stats.isFile()) return null;

    let details = null as Awaited<ReturnType<typeof readLevelDat>> | null;
    let detailsError: string | null = null;
    try {
        details = await readLevelDat(levelDat);
    } catch (error) {
        detailsError = error instanceof Error ? error.message : String(error);
    }

    // A world whose structure cannot be read still lists. The dimension chips are simply
    // absent, which reads as "not known yet" rather than as "this world has no terrain".
    const listing = await inspectWorldFolder(path).catch(() => null);
    const size = await measureFolder(path);

    return {
        folderId,
        path,
        directoryName,
        name: details?.levelName ?? null,
        lastPlayed: details?.lastPlayed ?? null,
        versionName: details?.versionName ?? null,
        snapshot: details?.snapshot ?? null,
        gameMode: details?.gameMode ?? null,
        hardcore: details?.hardcore ?? null,
        cheats: details?.cheats ?? null,
        seed: details?.seed ?? null,
        regionFiles: listing?.regionFiles ?? {},
        sizeBytes: size.bytes,
        sizeComplete: size.complete,
        detailsError,
    };
}

/**
 * How much disk a world occupies, as the sum of its file sizes.
 *
 * The sum of logical file sizes rather than allocated blocks, which is the number every
 * file manager shows and the one a person compares against the free space on a drive. It
 * is bounded twice - by depth and by the number of files stat-ed - and reports which
 * bound it hit, so the interface can say "at least" instead of stating a fraction as if
 * it were the whole.
 *
 * A subdirectory that cannot be read contributes nothing and does not fail the walk: half
 * a world's size is still a useful comparison between rows, and a permission error deep
 * inside one save should not blank the size of every save beside it.
 */
async function measureFolder(root: string): Promise<{ bytes: number | null; complete: boolean }> {
    let bytes = 0;
    let seen = 0;
    let complete = true;
    let measuredAnything = false;

    const walk = async (directory: string, depth: number): Promise<void> => {
        if (depth > MAX_SIZE_DEPTH) {
            complete = false;
            return;
        }
        let dir;
        try {
            dir = await opendir(directory);
        } catch {
            complete = false;
            return;
        }
        const subdirectories: string[] = [];
        for await (const child of dir) {
            if (seen >= MAX_SIZE_ENTRIES) {
                complete = false;
                break;
            }
            if (child.isDirectory()) {
                subdirectories.push(join(directory, child.name));
                continue;
            }
            if (!child.isFile()) continue; // A link contributes its target's bytes to its target.
            seen += 1;
            const stats = await lstat(join(directory, child.name)).catch(() => null);
            if (stats === null) {
                complete = false;
                continue;
            }
            bytes += stats.size;
            measuredAnything = true;
        }
        for (const subdirectory of subdirectories) {
            if (seen >= MAX_SIZE_ENTRIES) {
                complete = false;
                return;
            }
            await walk(subdirectory, depth + 1);
        }
    };

    await walk(root, 0);
    return { bytes: measuredAnything ? bytes : null, complete };
}
