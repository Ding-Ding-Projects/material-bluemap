/**
 * Where a project's history lives, and how a config folder is matched to it.
 *
 * ## The repository is never inside the user's folder
 *
 * This is the rule the whole module is arranged around, and it is worth stating why,
 * because "put a `.git` in it, that is what git is for" is the obvious design and it is
 * wrong here.
 *
 * A BlueMap config folder belongs to the person, not to this editor. It very often already
 * sits inside something of theirs - a server directory that is itself a git repository, a
 * synchronised folder, a directory their own tooling walks. Creating a `.git` inside it
 * changes what every one of those sees: their `git status` starts reporting a nested
 * repository, their backup tool starts copying an object store, their deployment script
 * starts skipping a directory it now reads as a submodule. None of that was asked for, and
 * an editor that quietly does it has reached outside the thing it was given.
 *
 * So the history is a **separate repository beside the application's own data**, holding a
 * mirror of the config files. Nothing at all is written into the folder the user chose,
 * except by an explicit restore, which writes config files and only config files.
 *
 * ```
 * <userData>/config-history/
 *   projects.json                 the folder -> repository mapping
 *   <slug>-<hash>/                one repository per project
 *     .git/
 *     core.conf                   a mirror, not the user's file
 *     maps/overworld.conf
 * ```
 *
 * ## Why the identifier is derived and also recorded
 *
 * {@link projectId} is a pure function of the folder path, so a project finds its own
 * history again even if `projects.json` is lost, corrupted, or restored from a backup that
 * predates it. The file is still written, because the derived id is one-way: without it
 * there is no way to list what histories exist or to show the user which folder a
 * repository belongs to, and a directory of unlabelled hashes is not something anybody can
 * clean up safely.
 *
 * Paths are compared case-insensitively on Windows, where `C:\Maps` and `c:\maps` are the
 * same directory and hashing them separately would silently start a second history halfway
 * through somebody's work.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** The directory inside the application's data folder that holds every history. */
export const HISTORY_DIRECTORY = "config-history";

/** The mapping file's name inside that directory. */
export const INDEX_FILE = "projects.json";

/** Current shape of {@link INDEX_FILE}, so a future change can migrate rather than guess. */
export const INDEX_VERSION = 1;

/** How many characters of the path hash go into a repository's directory name. */
const HASH_LENGTH = 16;

export interface HistoryProject {
    readonly id: string;
    /** The config folder this history belongs to, absolute, exactly as it was given. */
    readonly folder: string;
    /** Absolute path of the repository. Always inside the history root. */
    readonly repository: string;
    /** ISO 8601, when this folder was first snapshotted. */
    readonly firstSeen: string;
    /** ISO 8601 of the newest snapshot, or null when none has been taken yet. */
    readonly lastSnapshot: string | null;
}

export interface HistoryIndex {
    readonly version: number;
    readonly projects: readonly HistoryProject[];
}

/** The application's history root, beside its data rather than inside a user's folder. */
export function historyRoot(dataDir: string): string {
    return join(dataDir, HISTORY_DIRECTORY);
}

/**
 * A readable prefix for the repository directory, from the folder's own last segment.
 *
 * Purely so a person looking in the history root can tell which repository is which. It is
 * lossy on purpose - lower case, ASCII letters, digits and dashes - because this becomes a
 * directory name on three platforms and the folder it came from may be named in any script
 * at all. The hash after it is what actually distinguishes two projects.
 */
export function folderSlug(folder: string): string {
    const segments = folder.replace(/[\\/]+$/, "").split(/[\\/]/);
    const last = segments[segments.length - 1] ?? "";
    const slug = last
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24);
    return slug === "" ? "config" : slug;
}

/**
 * The stable identifier for a config folder's history.
 *
 * Derived rather than allocated, so it survives the mapping file being lost. The path is
 * lower-cased on Windows only: a case-insensitive file system makes `C:\Maps` and `c:\maps`
 * one directory, and giving them two histories would split a person's record in half at the
 * moment they typed a path differently. Elsewhere they really are two directories and
 * folding them would merge two projects into one, which is the worse mistake of the two.
 */
export function projectId(folder: string, platform: NodeJS.Platform = process.platform): string {
    const normalised = folder.replace(/[\\/]+$/, "");
    const keyed = platform === "win32" ? normalised.toLowerCase().replace(/\//g, "\\") : normalised;
    const hash = createHash("sha256").update(keyed, "utf8").digest("hex").slice(0, HASH_LENGTH);
    return `${folderSlug(folder)}-${hash}`;
}

/** Where the repository for a folder lives. Pure: it creates nothing. */
export function repositoryPath(dataDir: string, folder: string, platform?: NodeJS.Platform): string {
    return join(historyRoot(dataDir), projectId(folder, platform));
}

/* -------------------------------------------------------------------------- */
/* The mapping file                                                           */
/* -------------------------------------------------------------------------- */

/** An empty index, which is also what an unreadable one degrades to. */
export function emptyIndex(): HistoryIndex {
    return { version: INDEX_VERSION, projects: [] };
}

/**
 * Reads the mapping, treating every failure as "there is no mapping yet".
 *
 * That is the right degradation and not laziness. The mapping is a convenience: every
 * repository can still be found from its folder by {@link projectId}, so a corrupt file
 * costs a listing, not a history. Refusing to snapshot because a JSON file has a stray
 * comma in it would turn a cosmetic problem into data loss.
 */
export async function readIndex(dataDir: string): Promise<HistoryIndex> {
    const path = join(historyRoot(dataDir), INDEX_FILE);
    let text: string;
    try {
        text = await readFile(path, "utf8");
    } catch {
        return emptyIndex();
    }

    try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== "object" || parsed === null) return emptyIndex();
        const record = parsed as { projects?: unknown };
        if (!Array.isArray(record.projects)) return emptyIndex();

        const projects: HistoryProject[] = [];
        for (const entry of record.projects) {
            if (typeof entry !== "object" || entry === null) continue;
            const row = entry as Record<string, unknown>;
            const id = typeof row["id"] === "string" ? row["id"] : null;
            const folder = typeof row["folder"] === "string" ? row["folder"] : null;
            const repository = typeof row["repository"] === "string" ? row["repository"] : null;
            if (id === null || folder === null || repository === null) continue;
            projects.push({
                id,
                folder,
                repository,
                firstSeen: typeof row["firstSeen"] === "string" ? row["firstSeen"] : new Date(0).toISOString(),
                lastSnapshot: typeof row["lastSnapshot"] === "string" ? row["lastSnapshot"] : null,
            });
        }
        return { version: INDEX_VERSION, projects };
    } catch {
        return emptyIndex();
    }
}

/**
 * Writes the mapping through a temporary file and a rename.
 *
 * A rename is atomic on every platform this ships to, so a crash mid-write leaves the old
 * mapping rather than half of the new one. Truncating in place would make the one file
 * that says which history belongs to whom the most likely file in the application to end
 * up empty.
 */
export async function writeIndex(dataDir: string, index: HistoryIndex): Promise<void> {
    const root = historyRoot(dataDir);
    await mkdir(root, { recursive: true });
    const target = join(root, INDEX_FILE);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, `${JSON.stringify(index, null, 4)}\n`, "utf8");
    await rename(temporary, target);
}

/**
 * Records that a folder has a history, or updates when it was last snapshotted.
 *
 * Never rejects. The mapping is the convenience described above, and a snapshot that was
 * genuinely committed must not be reported as failed because a listing file could not be
 * written afterwards.
 */
export async function rememberProject(
    dataDir: string,
    folder: string,
    at: string | null,
    platform?: NodeJS.Platform,
): Promise<HistoryProject> {
    const id = projectId(folder, platform);
    const repository = repositoryPath(dataDir, folder, platform);
    const now = new Date().toISOString();

    const index = await readIndex(dataDir);
    const existing = index.projects.find((project) => project.id === id);
    const project: HistoryProject = {
        id,
        folder,
        repository,
        firstSeen: existing?.firstSeen ?? now,
        lastSnapshot: at ?? existing?.lastSnapshot ?? null,
    };

    const projects = [...index.projects.filter((entry) => entry.id !== id), project].sort((left, right) =>
        left.folder.localeCompare(right.folder),
    );

    try {
        await writeIndex(dataDir, { version: INDEX_VERSION, projects });
    } catch {
        // Deliberately swallowed. See the doc comment: the record of the snapshot is the
        // commit, and this file only makes the set of histories listable.
    }
    return project;
}
