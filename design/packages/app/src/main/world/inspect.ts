/**
 * Reading a folder well enough to say whether it is a Minecraft world.
 *
 * The wizard in `packages/ui/.../world/worldFolder.ts` decides *what a folder is* - a
 * world, the `saves` directory holding several, the `region` directory from inside one,
 * a dimension folder one level too deep - and it decides all of that from a listing.
 * This module is the listing, and nothing else: it reads, counts, and reports. Every
 * judgement about what was found is made on the other side, where it can be tested
 * against all four wrong folders without a file system.
 *
 * ## What is read, and what deliberately is not
 *
 * A mature world holds tens of thousands of files, so this never walks a tree. It reads
 * the chosen folder itself, and then opens exactly the places a region directory can be
 * in a world Minecraft wrote:
 *
 * ```
 * <world>/region                          the overworld
 * <world>/DIM-1/region                    the nether
 * <world>/DIM1/region                     the end
 * <world>/dimensions/<namespace>/<name>/region   a datapack or mod dimension
 * ```
 *
 * Plus one `lstat` per immediate subdirectory looking for a `level.dat`, which is the
 * only way "this is the saves folder, and it holds Bastion and Creative Test" can be
 * said instead of the useless "there is no level.dat here".
 *
 * ## The dimension that is not inside the folder at all
 *
 * Spigot, Paper and their derivatives do not keep the nether and the end nested inside
 * the overworld's own folder. Loading a world server-side splits it into three sibling
 * folders next to each other - `world`, `world_nether`, `world_the_end` by default -
 * and the nether and end chunks still live at `DIM-1/region` and `DIM1/region` *inside
 * those sibling folders*, because that is where the vanilla world-loading code always
 * put them; only the folder that contains them moved. `MCAWorld.resolveDimensionFolder`
 * in vendored upstream (`core/.../world/mca/MCAWorld.java`) is what a server itself
 * asks for a dimension's folder, and it is handed the sibling's own path as `worldFolder`
 * for the nether and the end - upstream never searches for the sibling itself, because a
 * running Bukkit server already knows each world's real folder from its own API. This
 * reader has no server to ask, so it looks for the two conventional sibling names beside
 * the chosen folder, the way a person renders a Spigot server's saves without one.
 *
 * Two directories, tried by their exact name first and, only if neither exists,
 * resolved case-insensitively from a single bounded listing of the parent - never more.
 * A sibling only counts once it has both its own `level.dat` and real region files
 * under `DIM-1/region` or `DIM1/region`; either missing and it is not reported, which is
 * what stops an unrelated `worldedit_nether` scratch folder from being read as a
 * dimension. Only asked when the chosen folder is itself a world: a `saves` folder or a
 * `region` folder picked by mistake has no sibling worth finding.
 *
 * ## Region files are counted, never listed
 *
 * `.mca` files are counted while the directory is being read and are left out of
 * `entries` entirely. Their names answer no question the wizard asks, and a world with
 * forty thousand of them would move megabytes across the bridge to compute a number.
 * Counting happens from the directory entry itself - nothing here stats a region file.
 *
 * ## Trusting the renderer with a path
 *
 * The renderer chooses the folder, so the folder is untrusted input. A relative path is
 * refused outright rather than resolved against whatever directory the app was started
 * in. Below the chosen folder, only real directories are descended: every name comes
 * from a directory read, and a symbolic link is never followed, so this cannot be turned
 * into a reader for a directory somebody did not choose. The depth is fixed and small,
 * which is what stops it becoming a file-system crawler in the first place.
 *
 * ## What a failure deeper down does
 *
 * Only the chosen folder rejects. A region directory that cannot be read is left out of
 * `regionFiles` rather than reported as zero - "unknown" and "empty" are different
 * answers, and a zero would send somebody to load the world in Minecraft to generate
 * terrain that is already there. A partial reading still answers the question the
 * wizard asked, which is what the *chosen* folder is; refusing the whole listing over
 * one unreadable subfolder would replace a mostly-correct answer with none.
 */

import { lstat, opendir } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";

/** One file or directory found inside the chosen folder. */
export interface WorldFolderEntry {
    /** Relative to the folder that was read, forward slashes, no leading `./`. */
    readonly path: string;
    readonly directory: boolean;
}

/**
 * A dimension a Spigot/Paper-style server split into its own sibling folder rather than
 * nesting it inside the chosen one - see the file's own header comment.
 */
export interface ServerSiblingDimension {
    /** The sibling's own folder, absolute. This is what BlueMap has to be told `world` is. */
    readonly worldFolder: string;
    /** Region files under its `DIM-1/region` or `DIM1/region`, counted the same way as everywhere else here. */
    readonly regionFiles: number;
}

/**
 * A shallow reading of a folder somebody picked.
 *
 * `entries` carries the chosen folder's own children (minus the region files), a
 * `<child>/level.dat` marker for every immediate subdirectory that has one, and the
 * region directories that were found. `regionFiles` is keyed by the directory holding
 * them relative to the chosen folder - `region`, `DIM-1/region` - and the empty key is
 * the chosen folder itself, which is how "you picked the region directory" is
 * recognised.
 */
export interface WorldFolderListing {
    /** The folder that was read, absolute and exactly as it was given. */
    readonly folder: string;
    readonly entries: readonly WorldFolderEntry[];
    readonly regionFiles: Readonly<Record<string, number>>;
    /**
     * LevelDB files counted under a `db` directory, or null when there was none to count.
     *
     * This is the one fact that separates a Bedrock Edition world from a Java one that
     * happens to have a folder called `db` beside it; `bedrock/detect.ts` is what turns it
     * into a verdict. Null covers both "there is no `db` directory here" and "there is one
     * and it could not be read", for the same reason `regionFiles` omits a directory it
     * could not open: zero would state as fact that the database is empty, and an empty
     * chunk database is a different and much more alarming thing than an unread one.
     *
     * Costs nothing for a Java world. The directory is only opened when a real `db`
     * directory was found in the listing, which no Minecraft-written Java world has.
     */
    readonly leveldbFiles: number | null;
    /**
     * The nether and/or the end, when a Spigot/Paper-style server split them into
     * sibling folders beside this one instead of nesting them inside it. Keyed
     * `"nether"` / `"the_end"`. Empty when this folder already holds its own `DIM-1`
     * or `DIM1`, when this folder is not itself a world, or when neither sibling exists.
     */
    readonly serverSiblings: Readonly<Record<string, ServerSiblingDimension>>;
}

/** The file that makes a folder a world. Compared lower-cased; emitted lower-case. */
const LEVEL_DAT = "level.dat";

/** The directory name every dimension keeps its region files in. */
const REGION = "region";

/** Where a datapack or mod dimension lives, since 1.16. */
const DIMENSIONS = "dimensions";

/** Where a Bedrock Edition world keeps its LevelDB chunk database. */
const LEVELDB = "db";

/** The two dimension folders Minecraft writes beside the overworld. */
const VANILLA_DIMENSIONS = ["DIM-1", "DIM1"] as const;

/**
 * The conventional sibling names a Spigot/Paper-style server splits a world into, and
 * which vanilla dimension folder each one keeps its region files under - see the file
 * header. `world` stays `world`; only the nether and the end ever move to a sibling.
 */
const SERVER_SIBLINGS: readonly { readonly key: string; readonly suffix: string; readonly dimension: string }[] = [
    { key: "nether", suffix: "_nether", dimension: "DIM-1" },
    { key: "the_end", suffix: "_the_end", dimension: "DIM1" },
];

/**
 * Caps, so a folder that is not a world cannot turn this into a crawler.
 *
 * They are generous enough that no real world or `saves` directory reaches one. A
 * `level.dat` at the top is always reported even past {@link MAX_ENTRIES}, because it is
 * the single fact the whole judgement turns on and losing it to a cap would report a
 * world as not being one.
 */
export const MAX_ENTRIES = 2048;
export const MAX_WORLD_PROBES = 512;
export const MAX_DIMENSION_NAMESPACES = 256;
export const MAX_CUSTOM_DIMENSIONS = 256;

/**
 * Reads a folder shallowly, so the wizard can say whether it is a world.
 *
 * Rejects when the chosen folder cannot be read, rather than returning an empty
 * listing: "no `level.dat` here" and "this folder does not exist" are different answers,
 * and reporting the first when the second is true sends somebody looking for a file
 * rather than for a typo in the path.
 */
export async function inspectWorldFolder(folder: string): Promise<WorldFolderListing> {
    const root = requireAbsoluteFolder(folder);

    const entries: WorldFolderEntry[] = [];
    const regionFiles: Record<string, number> = {};
    const directories: string[] = [];
    let hasLevelDat = false;
    let rootRegionFiles = 0;

    // Opened rather than read whole: a `region` directory picked by mistake holds tens
    // of thousands of names, and streaming them keeps the memory this uses the size of
    // what it decides to keep rather than the size of the folder.
    let chosen;
    try {
        chosen = await opendir(root);
    } catch (error) {
        throw unreadable(root, error);
    }

    try {
        for await (const child of chosen) {
            // `isDirectory` is false for a symbolic link, because a directory read never
            // follows one. That is the whole of the escape guard: only names that are
            // really directories here are ever descended into below.
            const directory = child.isDirectory();

            if (!directory && isRegionFile(child.name)) {
                // Counted, never listed. See the note at the top of the file.
                rootRegionFiles += 1;
                continue;
            }

            if (directory && directories.length < MAX_WORLD_PROBES) directories.push(child.name);

            const levelDat = !directory && child.name.toLowerCase() === LEVEL_DAT;
            if (levelDat) hasLevelDat = true;
            if (levelDat || entries.length < MAX_ENTRIES) {
                entries.push({ path: child.name, directory });
            }
        }
    } catch (error) {
        throw unreadable(root, error);
    }

    // Always present, even at zero: the empty key means the chosen folder itself, and
    // it is what tells the wizard somebody picked a `region` directory by mistake.
    regionFiles[""] = rootRegionFiles;

    // The key is the canonical spelling rather than the one on disk. Windows opens
    // `Region` and `region` as the same directory, and the wizard's dimension table is
    // keyed by the names Minecraft writes, so a folder that differs only in case has to
    // arrive under the name the table knows or its dimension silently disappears.
    const region = findDirectory(directories, REGION);
    if (region !== null) {
        const count = await countRegionFiles(join(root, region));
        if (count !== null) regionFiles[REGION] = count;
    }

    for (const dimension of VANILLA_DIMENSIONS) {
        const found = findDirectory(directories, dimension);
        if (found === null) continue;
        const path = join(root, found, REGION);
        if (!(await isRealDirectory(path))) continue;
        const count = await countRegionFiles(path);
        if (count === null) continue;
        const key = `${dimension}/${REGION}`;
        regionFiles[key] = count;
        entries.push({ path: key, directory: true });
    }

    const dimensions = findDirectory(directories, DIMENSIONS);
    if (dimensions !== null) {
        await readCustomDimensions(join(root, dimensions), entries, regionFiles);
    }

    // A Bedrock world's chunk database. Only opened when a real `db` directory is
    // actually here, so a Java world - which never has one - pays nothing for this.
    let leveldbFiles: number | null = null;
    const database = findDirectory(directories, LEVELDB);
    if (database !== null) {
        leveldbFiles = await countLevelDbFiles(join(root, database));
    }

    // Only worth asking when this is not itself a world. A `level.dat` at the top
    // settles the question, and the wizard never looks at these markers once it has one.
    if (!hasLevelDat) await probeWorldsInside(root, directories, entries);

    // Only worth asking the other way around too: a folder that is not itself a world
    // has no sibling worth finding, and every sibling probe below is a directory read a
    // `saves` folder or a `region` folder picked by mistake would pay for nothing.
    const serverSiblings = hasLevelDat ? await readServerSiblings(root) : {};

    return { folder: root, entries, regionFiles, leveldbFiles, serverSiblings };
}

/**
 * The nether and/or the end, when a Spigot/Paper-style server split them into sibling
 * folders beside this one - see the file's own header comment for why they are looked
 * for by name rather than nested inside the chosen folder.
 *
 * Read-only, and bounded to at most two sibling folders and, only when neither exact
 * name exists, one extra listing of the parent to resolve one case-insensitively. A
 * `level.dat` inside the candidate is required before its region files are even looked
 * at, which is what keeps an unrelated `worldedit_nether` scratch folder from being
 * mistaken for this world's own nether.
 */
async function readServerSiblings(root: string): Promise<Record<string, ServerSiblingDimension>> {
    const result: Record<string, ServerSiblingDimension> = {};

    const parent = dirname(root);
    const base = basename(root);
    if (parent === root || base === "") return result;

    // Read once, only if an exact-case match misses, and shared between both siblings.
    let parentNames: string[] | null = null;

    for (const sibling of SERVER_SIBLINGS) {
        const wantedName = `${base}${sibling.suffix}`;
        let siblingRoot = join(parent, wantedName);

        if (!(await isRealDirectory(siblingRoot))) {
            if (parentNames === null) parentNames = await listDirectories(parent, MAX_WORLD_PROBES);
            const found = findDirectory(parentNames, wantedName);
            if (found === null) continue;
            siblingRoot = join(parent, found);
            if (!(await isRealDirectory(siblingRoot))) continue;
        }

        const levelDatStats = await lstat(join(siblingRoot, LEVEL_DAT)).catch(() => null);
        if (levelDatStats === null || !levelDatStats.isFile()) continue;

        const regionPath = join(siblingRoot, sibling.dimension, REGION);
        if (!(await isRealDirectory(regionPath))) continue;
        const count = await countRegionFiles(regionPath);
        if (count === null) continue;

        result[sibling.key] = { worldFolder: siblingRoot, regionFiles: count };
    }

    return result;
}

/**
 * `dimensions/<namespace>/<name>/region`, which is where a datapack dimension lives.
 *
 * Two levels exactly, and both bounded. A namespace holds a handful of dimensions in
 * every world that has any, so the caps are there for a folder that is not a world at
 * all rather than for one that is.
 */
async function readCustomDimensions(
    dimensionsRoot: string,
    entries: WorldFolderEntry[],
    regionFiles: Record<string, number>,
): Promise<void> {
    let found = 0;
    for (const namespace of await listDirectories(dimensionsRoot, MAX_DIMENSION_NAMESPACES)) {
        const namespaceRoot = join(dimensionsRoot, namespace);
        for (const name of await listDirectories(namespaceRoot, MAX_CUSTOM_DIMENSIONS)) {
            if (found >= MAX_CUSTOM_DIMENSIONS) return;
            const path = join(namespaceRoot, name, REGION);
            if (!(await isRealDirectory(path))) continue;
            const count = await countRegionFiles(path);
            if (count === null) continue;
            const key = `${DIMENSIONS}/${namespace}/${name}/${REGION}`;
            regionFiles[key] = count;
            entries.push({ path: key, directory: true });
            found += 1;
        }
    }
}

/**
 * A `<child>/level.dat` marker for every subdirectory that has one.
 *
 * This is what turns "there is no level.dat in saves" into "that folder holds several
 * worlds rather than being one: Bastion, Creative Test". One `lstat` per subdirectory,
 * and the subdirectory is already known to be a real directory rather than a link, so
 * nothing here follows a path out of the chosen folder.
 */
async function probeWorldsInside(
    root: string,
    directories: readonly string[],
    entries: WorldFolderEntry[],
): Promise<void> {
    for (const name of directories) {
        const stats = await lstat(join(root, name, LEVEL_DAT)).catch(() => null);
        if (stats === null || stats.isDirectory()) continue;
        entries.push({ path: `${name}/${LEVEL_DAT}`, directory: false });
    }
}

/**
 * How many `.mca` files a directory holds, or null when it could not be read.
 *
 * Counted from the directory entries themselves - no file here is ever stat-ed, opened
 * or named in the result. Null rather than zero for a failure, because "unknown" and
 * "there is no terrain yet" lead somebody to two different places.
 */
async function countRegionFiles(directory: string): Promise<number | null> {
    let count = 0;
    try {
        const dir = await opendir(directory);
        for await (const entry of dir) {
            if (entry.isDirectory()) continue;
            if (isRegionFile(entry.name)) count += 1;
        }
    } catch {
        return null;
    }
    return count;
}

/**
 * How many LevelDB files a `db` directory holds, or null when it could not be read.
 *
 * Counted from the directory entries, never stat-ed, exactly like the region-file count
 * above and for the same reason: a mature Bedrock world's database is thousands of files
 * and none of their names answers a question anybody asks here.
 *
 * The count stops at the first file that proves the point. This is a yes-or-no question -
 * "is there a real chunk database in here" - and reading forty thousand directory entries
 * to answer it with a bigger number would make opening a world list visibly slower for a
 * fact nothing displays.
 */
async function countLevelDbFiles(directory: string): Promise<number | null> {
    let count = 0;
    try {
        const dir = await opendir(directory);
        for await (const entry of dir) {
            if (entry.isDirectory()) continue;
            if (!isLevelDbFile(entry.name)) continue;
            count += 1;
            break;
        }
    } catch {
        return null;
    }
    return count;
}

/**
 * The file names LevelDB actually writes: the manifest, the current-manifest pointer, the
 * write-ahead logs and the sorted tables.
 *
 * Named individually rather than counting every file in the directory, because the point
 * of the count is to distinguish a chunk database from an unrelated folder that happens to
 * be called `db`. A folder of a person's own notes would otherwise read as a Bedrock world.
 */
function isLevelDbFile(name: string): boolean {
    const lower = name.toLowerCase();
    return (
        lower.endsWith(".ldb") ||
        lower.endsWith(".sst") ||
        lower.endsWith(".log") ||
        lower === "current" ||
        lower.startsWith("manifest-")
    );
}

/** The subdirectories of a directory, bounded, and empty when it could not be read. */
async function listDirectories(directory: string, limit: number): Promise<string[]> {
    const found: string[] = [];
    try {
        const dir = await opendir(directory);
        for await (const entry of dir) {
            if (!entry.isDirectory()) continue;
            found.push(entry.name);
            if (found.length >= limit) break;
        }
    } catch {
        return found;
    }
    return found;
}

/**
 * True for a real directory at this exact path.
 *
 * `lstat` rather than `stat`, so a symbolic link is not a directory here however
 * inviting its name is. A world whose `region` is a link to another disk is read as
 * having none, which is the safe way round: the alternative is a folder somebody chose
 * being able to point this at one they did not.
 */
async function isRealDirectory(path: string): Promise<boolean> {
    const stats = await lstat(path).catch(() => null);
    return stats !== null && stats.isDirectory();
}

/** Exact name first, then case-insensitively, which is what Windows would have opened. */
function findDirectory(directories: readonly string[], name: string): string | null {
    for (const directory of directories) if (directory === name) return directory;
    const lower = name.toLowerCase();
    for (const directory of directories) if (directory.toLowerCase() === lower) return directory;
    return null;
}

function isRegionFile(name: string): boolean {
    return name.length > 4 && name.toLowerCase().endsWith(".mca");
}

/**
 * The chosen folder, or an error saying why it is unusable.
 *
 * A relative path is refused here rather than resolved. The wizard already refuses one,
 * but the main process cannot take the renderer's word for that: resolving it would
 * read whatever happens to sit beside the process, which is a folder nobody chose.
 *
 * Returned exactly as it was given, only trimmed. `resolve()` would rewrite a path like
 * `/srv/world` onto the current drive on Windows, and every message the wizard builds
 * from this - "go up one level and choose C:\\srv instead" - would then name a folder
 * the person has never seen.
 */
function requireAbsoluteFolder(folder: string): string {
    const trimmed = folder.trim();
    if (trimmed === "") {
        throw new Error("No folder was given, so there was nothing to read.");
    }
    if (!isAbsolute(trimmed)) {
        throw new Error(
            `${trimmed} is not a full path, so where it points depends on where the app was ` +
                `started. Choose the folder again, or give a path that starts from a drive ` +
                `letter or from the root of the file system.`,
        );
    }
    return trimmed;
}

/**
 * Why a folder could not be read, in words somebody can act on.
 *
 * The folder and the reason, and nothing else. The system's own message repeats the
 * path and adds the syscall, which tells the person nothing they can use.
 */
function unreadable(folder: string, error: unknown): Error {
    const code = errorCode(error);
    switch (code) {
        case "ENOENT":
            return new Error(`There is no folder at ${folder}.`);
        case "ENOTDIR":
            return new Error(`${folder} is a file, not a folder.`);
        case "EACCES":
        case "EPERM":
            return new Error(`${folder} could not be read: this account is not allowed to open it.`);
        case "ELOOP":
            return new Error(`${folder} could not be read: it is a link that points at itself.`);
        case "EMFILE":
        case "ENFILE":
            return new Error(`${folder} could not be read: too many files are open right now.`);
        default:
            return new Error(
                code === null
                    ? `${folder} could not be read.`
                    : `${folder} could not be read (${code}).`,
            );
    }
}

function errorCode(error: unknown): string | null {
    if (typeof error !== "object" || error === null || !("code" in error)) return null;
    const code = (error as { readonly code?: unknown }).code;
    return typeof code === "string" ? code : null;
}
