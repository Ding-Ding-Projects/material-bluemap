/**
 * Where a download lives on disk.
 *
 * The same shape `render/workspace.ts` uses, and for the same reason: one directory per
 * download, everything it produces inside it, so an abandoned or failed attempt is one
 * folder somebody can delete rather than files scattered through the storage directory.
 *
 * ```
 * <storageDir>/downloads/<downloadId>/
 *   parts/          the .001, .002, ... and the .parts.json exactly as published
 *   <name>          the rejoined archive, written only after every part verified
 *   content/        what the archive unpacked into
 *   download.json   what was fetched, from where, and how it ended
 * ```
 *
 * The parts are kept after a successful download rather than deleted, because a world
 * that has to be re-extracted should not have to be re-downloaded. `pruneParts` exists
 * for the caller that would rather have the disk space back.
 */

import { createHash } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface DownloadWorkspace {
    readonly downloadId: string;
    /** `<storageDir>/downloads/<downloadId>`, absolute. */
    readonly root: string;
    /** `<root>/parts` - the published parts and the manifest, untouched. */
    readonly partsDir: string;
    /** `<root>/content` - where the archive was unpacked. */
    readonly contentDir: string;
    /** `<root>/download.json` - the provenance record. */
    readonly recordFile: string;
}

export const DOWNLOADS_DIRECTORY = "downloads";

export function downloadWorkspace(storageDir: string, downloadId: string): DownloadWorkspace {
    const root = resolve(storageDir, DOWNLOADS_DIRECTORY, downloadId);
    return {
        downloadId,
        root,
        partsDir: join(root, "parts"),
        contentDir: join(root, "content"),
        recordFile: join(root, "download.json"),
    };
}

/** The rejoined archive's path inside a workspace. */
export function archivePath(workspace: DownloadWorkspace, fileName: string): string {
    return join(workspace.root, fileName);
}

/**
 * A stable id for one asset of one release.
 *
 * Stable, so an interrupted download of the same thing resumes into the same folder
 * instead of starting a second copy beside the first. The readable half is for the
 * person looking at the folder; the hash is what keeps two releases that both publish
 * `world.zip` apart.
 */
export function downloadIdFor(owner: string, repo: string, tag: string, asset: string): string {
    const digest = createHash("sha256")
        .update(`${owner}/${repo}@${tag}#${asset}`.toLowerCase())
        .digest("hex")
        .slice(0, 12);
    const leaf = slug(asset);
    return leaf.length > 0 ? `${leaf}-${digest}` : digest;
}

function slug(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
}

/** Every download workspace already on disk. A listing, never an index file. */
export async function listDownloadIds(storageDir: string): Promise<string[]> {
    try {
        const entries = await readdir(join(resolve(storageDir), DOWNLOADS_DIRECTORY), {
            withFileTypes: true,
        });
        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch {
        return [];
    }
}

/** Throws away the downloaded parts, keeping the rejoined archive and its content. */
export async function pruneParts(workspace: DownloadWorkspace): Promise<void> {
    await rm(workspace.partsDir, { recursive: true, force: true });
}
