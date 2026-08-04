/**
 * Whether a world carries a project, for the list somebody picks a world from.
 *
 * `world/catalog.ts` already reports every world in a `saves` folder with the facts a person
 * chooses one by - its real name, when it was last played, how big it is. The one fact it
 * cannot report is whether this app has been set up for that world before, because a project
 * is this app's own file and `world/` deliberately knows nothing about it.
 *
 * ## Why this is a separate function rather than a field on the catalogue
 *
 * The catalogue takes a `saves` folder and answers with worlds; this takes a world folder
 * and answers with one fact. Keeping them apart means `world/` did not have to change at
 * all, the scan stays as cheap as it was, and the interface decides when it wants the extra
 * read - which matters, because a `saves` folder with forty worlds is forty more `lstat`
 * calls it may not want during the first paint.
 *
 * ## An unreadable project is still a project
 *
 * A world whose project file exists but cannot be parsed reports `present: true` with a null
 * name and the reason beside it. That is the honest state and it is the useful one: the list
 * can say "has a project (damaged)" and offer to look at it, where reporting `present:
 * false` would tell somebody their settings are gone when the file is sitting right there.
 */

import { describeReadFailure } from "./describe.js";
import { checkWorldFolder, readProject } from "./file.js";

/**
 * How many world folders one discovery call will look at.
 *
 * A `saves` folder is capped at 512 worlds by `world/catalog.ts`, so this is that number:
 * anything beyond it did not come from a scan and is not a list somebody is looking at.
 */
export const MAX_DISCOVERED_WORLDS = 512;

/** What a world's row needs to know about the project inside it. */
export interface ProjectPresence {
    /** The world folder that was looked in, exactly as it was given. */
    readonly worldFolder: string;
    /** Where the project file would be. Present whether or not there is one. */
    readonly path: string;
    /** True when the file is there, whether or not this build could read it. */
    readonly present: boolean;
    /** What the person called the project, or null when it could not be read. */
    readonly name: string | null;
    /** The project's stable id, which survives renames. Null when it could not be read. */
    readonly id: string | null;
    /** How many maps it holds, or null when it could not be read. */
    readonly mapCount: number | null;
    /** ISO 8601 of the last save, or null when it could not be read. */
    readonly updatedAt: string | null;
    /** True when the project was written by the guide and never opened in the editor. */
    readonly fromWizard: boolean | null;
    /** One sentence for the user when there is a file that would not open. Null otherwise. */
    readonly problem: string | null;
}

/** A world with no project at all, which is not a failure and is said plainly. */
function absent(worldFolder: string, path: string, problem: string | null): ProjectPresence {
    return {
        worldFolder,
        path,
        present: false,
        name: null,
        id: null,
        mapCount: null,
        updatedAt: null,
        fromWizard: null,
        problem,
    };
}

/**
 * Whether one world folder carries a project, and what it is called.
 *
 * Never rejects. A world list is built from many of these and one unreadable folder - an
 * unplugged drive, a permission the user does not have - must report itself on its own row
 * rather than take every other world off the screen with it.
 */
export async function discoverProject(worldFolder: unknown): Promise<ProjectPresence> {
    const checked = checkWorldFolder(worldFolder);
    if (!checked.ok) {
        return absent(typeof worldFolder === "string" ? worldFolder : "", "", checked.reason);
    }

    const read = await readProject(checked.folder);
    if (read.ok) {
        return {
            worldFolder: checked.folder,
            path: read.path,
            present: true,
            name: read.project.name,
            id: read.project.id,
            mapCount: read.project.maps.length,
            updatedAt: read.project.updatedAt,
            fromWizard: read.project.fromWizard,
            problem: null,
        };
    }

    if (read.failure.kind === "absent") {
        return absent(checked.folder, read.path, null);
    }

    // The file is there and would not open. Everything the row would have shown is null, and
    // the sentence beside it says which of the several reasons this was.
    return {
        worldFolder: checked.folder,
        path: read.path,
        present: true,
        name: null,
        id: null,
        mapCount: null,
        updatedAt: null,
        fromWizard: null,
        problem: describeReadFailure(read.failure, read.path),
    };
}

/**
 * The same answer for a whole scanned folder at once.
 *
 * Sequential rather than parallel on purpose. These are small reads and the list they
 * decorate is already on screen, so there is nothing to gain from starting five hundred file
 * handles at once on a drive that may be a network share - which is the case where doing so
 * is not merely wasteful but visibly slower.
 */
export async function discoverProjects(worldFolders: readonly unknown[]): Promise<readonly ProjectPresence[]> {
    const found: ProjectPresence[] = [];
    for (const folder of worldFolders.slice(0, MAX_DISCOVERED_WORLDS)) {
        found.push(await discoverProject(folder));
    }
    return found;
}
