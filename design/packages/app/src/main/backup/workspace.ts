/**
 * Where a backup is staged on disk while it is being made.
 *
 * The same shape `render/workspace.ts` and `download/workspace.ts` use, for the same
 * reason: one directory per backup, everything it produces inside it, so an abandoned or
 * failed attempt is one folder somebody can delete rather than a scatter of `.001` files
 * through the storage directory.
 *
 * ```
 * <storageDir>/backups/<backupId>/
 *   <archive>.zip           the packed folder, written once and hashed as it is written
 *   parts/                  the .001, .002, ... and the parts manifest, ready to upload
 *   backup.json             the sidecar, uploaded beside the pointer
 *   <archive>.zip.cheaplfs  the Cheap LFS pointer, uploaded last
 * ```
 *
 * ## The archive is deleted after a successful upload, and the pointer is not
 *
 * The archive is the big thing: a copy of a folder that is still on the disk beside it,
 * so keeping it doubles what the backup costs in space at exactly the moment somebody was
 * trying to make space. Once every part is on the release and verified, the local copy is
 * the redundant one and it goes.
 *
 * What stays is the pointer and the sidecar, a couple of kilobytes together. They are how
 * a person finds their backup again without asking GitHub - which matters most in the
 * situation a backup exists for, when the thing that broke might be the network.
 */

import { createHash } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

export const BACKUPS_DIRECTORY = "backups";

export interface BackupWorkspace {
    readonly backupId: string;
    /** `<storageDir>/backups/<backupId>`, absolute. */
    readonly root: string;
    /** `<root>/parts` - where the split writes, and where the upload reads from. */
    readonly partsDir: string;
    /** `<root>/backup.json` - the sidecar. */
    readonly sidecarFile: string;
}

export function backupWorkspace(storageDir: string, backupId: string): BackupWorkspace {
    const root = resolve(storageDir, BACKUPS_DIRECTORY, backupId);
    return {
        backupId,
        root,
        partsDir: join(root, "parts"),
        sidecarFile: join(root, "backup.json"),
    };
}

/** The staged archive's path inside a workspace. */
export function stagedArchivePath(workspace: BackupWorkspace, archiveName: string): string {
    return join(workspace.root, archiveName);
}

/** The staged pointer's path inside a workspace. */
export function stagedPointerPath(workspace: BackupWorkspace, pointerName: string): string {
    return join(workspace.root, pointerName);
}

/**
 * A stable id for one backup of one thing to one repository at one moment.
 *
 * Stable so an interrupted backup resumes into the same folder rather than packing a
 * second copy of a 20 GB world beside the first. The readable half is for the person
 * looking at the folder in a file manager; the hash keeps two backups of two different
 * worlds that happen to share a name apart.
 */
export function backupIdFor(owner: string, repo: string, tag: string): string {
    const digest = createHash("sha256")
        .update(`${owner}/${repo}@${tag}`.toLowerCase())
        .digest("hex")
        .slice(0, 12);
    const leaf = slug(tag);
    return leaf.length > 0 ? `${leaf}-${digest}` : digest;
}

function slug(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
}

/** Every backup workspace already on disk. A listing, never an index file. */
export async function listBackupIds(storageDir: string): Promise<string[]> {
    try {
        const entries = await readdir(join(resolve(storageDir), BACKUPS_DIRECTORY), {
            withFileTypes: true,
        });
        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch {
        return [];
    }
}

/**
 * Where a restore lives on disk. The same shape `download/workspace.ts` uses for a
 * download, because a restore *is* one: parts fetched from a release, verified against a
 * digest and rejoined. The difference is only which digest a restore checks against - the
 * Cheap LFS pointer rather than a `.parts.json` manifest - so the layout matches on
 * purpose rather than by coincidence.
 *
 * ```
 * <storageDir>/restores/<restoreId>/
 *   parts/            the downloaded parts, plus a manifest translated from the pointer
 *   <archive>          the rejoined archive, written only once every part is verified
 *   content/           what the archive unpacked into
 * ```
 */
export const RESTORES_DIRECTORY = "restores";

export interface RestoreWorkspace {
    readonly restoreId: string;
    /** `<storageDir>/restores/<restoreId>`, absolute. */
    readonly root: string;
    /** `<root>/parts` - downloaded parts and the translated manifest. */
    readonly partsDir: string;
    /** `<root>/content` - where the archive was unpacked. */
    readonly contentDir: string;
}

export function restoreWorkspace(storageDir: string, restoreId: string): RestoreWorkspace {
    const root = resolve(storageDir, RESTORES_DIRECTORY, restoreId);
    return {
        restoreId,
        root,
        partsDir: join(root, "parts"),
        contentDir: join(root, "content"),
    };
}

/** The rejoined archive's path inside a restore workspace. */
export function restoreArchivePath(workspace: RestoreWorkspace, archiveName: string): string {
    return join(workspace.root, archiveName);
}

/**
 * A stable id for one restore of one backup, so a resumed restore continues into the same
 * folder rather than fetching a 20 GB world a second time beside the first.
 */
export function restoreIdFor(owner: string, repo: string, tag: string): string {
    const digest = createHash("sha256")
        .update(`restore:${owner}/${repo}@${tag}`.toLowerCase())
        .digest("hex")
        .slice(0, 12);
    const leaf = slug(tag);
    return leaf.length > 0 ? `${leaf}-${digest}` : digest;
}

/**
 * Throws away the staged archive and its parts, keeping the pointer and the sidecar.
 *
 * Called only after every part is on the release. Called *before* that, it would delete
 * exactly the bytes a resumed upload needs, turning a dropped connection into a full
 * re-pack of the source folder.
 */
export async function pruneStagedPayload(
    workspace: BackupWorkspace,
    archiveName: string,
): Promise<void> {
    await rm(workspace.partsDir, { recursive: true, force: true });
    await rm(stagedArchivePath(workspace, archiveName), { force: true });
}
