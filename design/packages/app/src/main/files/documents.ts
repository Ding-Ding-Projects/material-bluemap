/**
 * Where a rendered map tree should live, and why it must not live in OneDrive.
 *
 * A BlueMap render of a mature world is hundreds of thousands of small `.png` files
 * totalling tens of gigabytes. Written into a synced folder, every one of them is a file
 * the sync client uploads, versions, and then re-downloads on the next machine; the render
 * slows to a crawl, the person's cloud quota disappears overnight, and the first they hear
 * of it is a full-drive warning. This is not a hypothetical class of problem - it is the
 * single most common way a Windows user loses an afternoon to a tile renderer.
 *
 * Windows makes this easy to walk into. "Back up your folders" moves the real `Documents`
 * to `%USERPROFILE%\OneDrive\Documents` and leaves the shell folder pointing at the moved
 * copy, so an app that politely asks the operating system for Documents is handed a synced
 * folder without either side mentioning it.
 *
 * So this module asks, notices, and **explains**. The redirect is never silent: the
 * resolution carries a sentence naming what was found and where the maps will go instead,
 * so the setup step and the settings row can show it and the person can override it. An app
 * that quietly writes somewhere other than where the user was told is a worse problem than
 * the one it was avoiding.
 *
 * ## The daft edge case, guarded on purpose
 *
 * A Windows account may be *named* `OneDrive`, which makes the ordinary local Documents
 * folder `C:\Users\OneDrive\Documents`. A naive "does the path contain OneDrive" check
 * redirects that person away from their own real Documents folder, to a path that is
 * exactly the same path, forever. The guard is to look only at the segments *below* the
 * home directory, so the profile's own name is never one of the segments considered.
 *
 * The idea is BlueMapGUI's; the code is not. That repository carries no licence, so nothing
 * was copied from it - only the observation that this trap exists and is worth avoiding.
 */

import { win32 } from "node:path";

/** Electron's `productName`, which is also the leaf of its `userData` directory. */
export const PRODUCT_DIRECTORY = "Material BlueMap";

/**
 * Folder names that mean "this is a sync root".
 *
 * `OneDrive` is the personal spelling; `OneDrive - Contoso` is what a work or school
 * account produces, and both are equally bad places for a tile tree. Matched
 * case-insensitively because the on-disk casing is not guaranteed.
 */
const SYNC_ROOT = /^onedrive(?:$| - )/i;

export type StorageRedirectReason = "onedrive";

export interface DocumentsResolution {
    /** Exactly what the operating system reported, kept so the explanation can name it. */
    readonly reported: string;
    /** The folder that should actually be used. Equal to `reported` when nothing moved. */
    readonly resolved: string;
    readonly redirected: boolean;
    readonly reason: StorageRedirectReason | null;
    /**
     * One plain sentence for the user, or null when there is nothing to explain.
     *
     * Present whenever `redirected` is true, and also when a redirect was *wanted* and
     * could not be made - "your Documents folder is synced and I could not find a local one"
     * is worth saying, because it is the difference between a slow render somebody chose
     * and a slow render that surprised them.
     */
    readonly explanation: string | null;
}

export interface DocumentsInputs {
    /** `app.getPath("documents")`. */
    readonly reported: string;
    /** `app.getPath("home")`. The profile root, used to find the local Documents folder. */
    readonly home: string;
    /** Defaults to `process.platform`. Only Windows has this problem. */
    readonly platform?: NodeJS.Platform | undefined;
    /** Injected so the whole module is testable with no OneDrive and no file system. */
    readonly directoryExists?: ((path: string) => boolean) | undefined;
}

/** Splits a Windows path into its segments, ignoring the drive or share prefix. */
function segmentsBelow(root: string, candidate: string): string[] | null {
    const relative = win32.relative(win32.resolve(root), win32.resolve(candidate));
    // `..` means the candidate is not under the root at all, and an absolute answer means
    // they are on different drives. Either way the profile-name guard cannot be applied,
    // so the caller falls back to looking at the whole path.
    if (relative === "") return [];
    if (relative.startsWith("..") || win32.isAbsolute(relative)) return null;
    return relative.split(/[\\/]+/).filter((segment) => segment !== "");
}

/** True when any of these segments names a sync root. */
function hasSyncRoot(segments: readonly string[]): boolean {
    return segments.some((segment) => SYNC_ROOT.test(segment));
}

/**
 * Decides whether a Documents folder is really a synced one, and what to use instead.
 *
 * Never throws, and never invents a folder: when the local `Documents` cannot be confirmed
 * to exist, the reported path is kept and the explanation says the app is writing into a
 * synced folder. Moving somebody's maps to a directory that is not there would turn a
 * performance problem into a failed render.
 */
export function resolveDocumentsDirectory(inputs: DocumentsInputs): DocumentsResolution {
    const platform = inputs.platform ?? process.platform;
    const reported = inputs.reported.trim();

    const unchanged: DocumentsResolution = {
        reported,
        resolved: reported,
        redirected: false,
        reason: null,
        explanation: null,
    };
    if (platform !== "win32" || reported === "") return unchanged;

    const home = inputs.home.trim();
    // Only the segments below the profile are considered, so an account literally called
    // `OneDrive` is not redirected out of its own Documents folder into itself.
    const below = home === "" ? null : segmentsBelow(home, reported);
    const segments = below ?? reported.split(/[\\/]+/).slice(1).filter((segment) => segment !== "");
    if (!hasSyncRoot(segments)) return unchanged;

    if (home === "") {
        return {
            ...unchanged,
            reason: "onedrive",
            explanation:
                `${reported} is inside a OneDrive folder, so everything written there is uploaded as it is ` +
                "written. A rendered map is hundreds of thousands of small files, which is slow to sync and " +
                "quickly fills a cloud quota. There is no local Documents folder to use instead, so choose a " +
                "folder on this machine yourself.",
        };
    }

    const local = win32.join(win32.resolve(home), "Documents");
    const exists = inputs.directoryExists;
    if (exists !== undefined && !exists(local)) {
        return {
            ...unchanged,
            reason: "onedrive",
            explanation:
                `${reported} is inside a OneDrive folder, so everything written there is uploaded as it is ` +
                `written. A rendered map is hundreds of thousands of small files, which is slow to sync and ` +
                `quickly fills a cloud quota. ${local} does not exist on this machine, so the maps stay where ` +
                "Windows points Documents. Choose a folder on a local drive if you would rather they did not.",
        };
    }

    return {
        reported,
        resolved: local,
        redirected: true,
        reason: "onedrive",
        explanation:
            `Windows points Documents at ${reported}, which is inside OneDrive, so everything written there is ` +
            `uploaded as it is written. A rendered map is hundreds of thousands of small files, which is slow to ` +
            `sync and quickly fills a cloud quota, so maps go in ${local} instead. You can change this to any ` +
            "folder you like.",
    };
}

/**
 * The folder rendered maps go in by default: `<Documents>\Material BlueMap\maps`.
 *
 * Documents rather than `%APPDATA%` because a tile tree is the person's own output and
 * belongs somewhere they can find it, back it up and point a web server at - not inside an
 * application data directory they were never meant to open.
 */
export function defaultMapStorageDirectory(resolution: DocumentsResolution): string {
    return win32.join(resolution.resolved, PRODUCT_DIRECTORY, "maps");
}

/**
 * The same decision, in one call, for the platforms that do not have the problem.
 *
 * Returns null off Windows, so a caller keeps whatever default it already had rather than
 * being handed a Windows-shaped path built by `win32.join` on a machine using `/`.
 */
export function windowsMapStorageDefault(inputs: DocumentsInputs): {
    readonly directory: string;
    readonly resolution: DocumentsResolution;
} | null {
    const platform = inputs.platform ?? process.platform;
    if (platform !== "win32") return null;
    const resolution = resolveDocumentsDirectory(inputs);
    return { directory: defaultMapStorageDirectory(resolution), resolution };
}
