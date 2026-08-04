/**
 * Reading a repository's backups back out of its releases.
 *
 * A repository holds releases this application made and releases it did not, and a
 * listing that could not tell them apart would offer somebody their own installer as
 * something to restore. Two assets decide it:
 *
 * - `backup.json`, the sidecar, which says what was backed up, when, and how big it is;
 * - `<archive>.cheaplfs`, the Cheap LFS pointer, which is uploaded **last** and is
 *   therefore the completion marker.
 *
 * A release with both is a finished backup. A release with parts and no pointer is an
 * upload that stopped, and it is reported as exactly that rather than hidden, because
 * somebody looking for a backup they thought they made needs to be told it did not
 * finish - and told that carrying on with it is the cheap option, since the parts already
 * up are still there.
 *
 * ## Both small assets are fetched, and nothing else is
 *
 * Listing ten backups costs twenty small requests and no payload at all: the sidecar and
 * the pointer are a few kilobytes each and the parts are never touched. A release whose
 * `backup.json` is bigger than the bound is skipped without being read, because these are
 * assets that anybody with write access to that repository could have replaced.
 */

import { MAX_SIDECAR_BYTES, SIDECAR_ASSET_NAME, parseSidecar } from "./sidecar.js";
import type { BackupSidecar } from "./sidecar.js";
import {
    CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES,
    POINTER_ASSET_SUFFIX,
    readPointer,
} from "./pointer.js";
import type { CheapLfsPointer } from "./pointer.js";
import { listReleases, readTextAsset } from "./github.js";
import type { BackupRelease, GitHubCallOptions, ReleaseAssetInfo } from "./github.js";

/** One backup found on a repository. */
export interface BackupListing {
    readonly tag: string;
    readonly name: string;
    readonly releaseUrl: string;
    readonly createdAt: string;
    /** The archive's name, which is what a restore downloads. */
    readonly archive: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly parts: number;
    readonly kind: "render" | "world";
    readonly label: string;
    readonly files: number;
    readonly contentBytes: number;
    readonly appVersion: string | null;
    readonly sourceFolder: string;
    /**
     * False when the release carries parts but no pointer: an upload that stopped.
     *
     * Listed rather than hidden, and never restorable. Without the pointer there is no
     * whole-file digest to check a rejoin against, so "restore this" would mean "trust
     * whatever arrives", which is the one thing this format exists to make unnecessary.
     */
    readonly complete: boolean;
    /** Set when the release is a backup this build understands but cannot restore. */
    readonly unsupported: string | null;
}

/**
 * Every finished or half-finished backup on a repository, newest first.
 *
 * `onProblem` hears about a release that looked like a backup and could not be read.
 * Reported rather than thrown, because one unreadable release must not empty the list:
 * somebody with nine good backups and one corrupted sidecar needs the nine.
 */
export async function listBackups(
    owner: string,
    repo: string,
    options: GitHubCallOptions & {
        readonly maxPages?: number;
        readonly onProblem?: (tag: string, message: string) => void;
    },
): Promise<readonly BackupListing[]> {
    const releases = await listReleases(owner, repo, options);
    const listings: BackupListing[] = [];

    for (const release of releases) {
        const sidecarAsset = release.assets.find((asset) => asset.name === SIDECAR_ASSET_NAME);
        if (sidecarAsset === undefined) continue;

        const listing = await readBackupRelease(release, sidecarAsset, options);
        if (listing === null) {
            options.onProblem?.(
                release.tag,
                `The backup tagged ${release.tag} has a ${SIDECAR_ASSET_NAME} this build could ` +
                    "not read, so it is not listed. Nothing was changed on the release.",
            );
            continue;
        }
        listings.push(listing);
    }

    return listings;
}

/** One release, read into a listing, or null when its sidecar is not readable. */
async function readBackupRelease(
    release: BackupRelease,
    sidecarAsset: ReleaseAssetInfo,
    options: GitHubCallOptions,
): Promise<BackupListing | null> {
    const sidecarText = await readTextAsset(sidecarAsset, MAX_SIDECAR_BYTES, options);
    if (sidecarText === null) return null;
    const sidecar = parseSidecar(sidecarText);
    if (sidecar === null) return null;

    const pointerAsset = release.assets.find(
        (asset) => asset.name === sidecar.pointer && asset.name.endsWith(POINTER_ASSET_SUFFIX),
    );

    let pointer: CheapLfsPointer | null = null;
    let unsupported: string | null = null;
    if (pointerAsset !== undefined) {
        const text = await readTextAsset(
            pointerAsset,
            CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES,
            options,
        );
        if (text !== null) {
            const read = readPointer(text);
            if (read.ok) pointer = read.pointer;
            else if (read.failure.code === "unsupported-encoding") unsupported = read.failure.message;
        }
    }

    return toListing(release, sidecar, pointer, unsupported);
}

/**
 * The listing a release turns into, with the pointer preferred over the sidecar.
 *
 * Both carry the size, the digest and the part count, and the pointer is the one that
 * matters: it is the file a restore actually verifies against, and the sidecar is a
 * convenience copy. When they disagree the pointer wins and the disagreement is not
 * hidden - `complete` is only true when there is a pointer at all.
 */
export function toListing(
    release: BackupRelease,
    sidecar: BackupSidecar,
    pointer: CheapLfsPointer | null,
    unsupported: string | null,
): BackupListing {
    return {
        tag: release.tag,
        name: release.name,
        releaseUrl: release.htmlUrl,
        createdAt: sidecar.createdAt !== "" ? sidecar.createdAt : release.createdAt,
        archive: pointer?.assetName ?? sidecar.archive,
        bytes: pointer?.sizeInBytes ?? sidecar.bytes,
        sha256: pointer?.sha256 ?? sidecar.sha256,
        parts: pointer?.parts?.length ?? sidecar.parts,
        kind: sidecar.kind,
        label: sidecar.label,
        files: sidecar.files,
        contentBytes: sidecar.contentBytes,
        appVersion: sidecar.appVersion,
        sourceFolder: sidecar.sourceFolder,
        complete: pointer !== null,
        unsupported,
    };
}
