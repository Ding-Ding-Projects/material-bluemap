/**
 * Names that say nothing.
 *
 * The point of the private render path is that a public repository's files, workflow
 * runs and logs reveal nothing about the private side. Encryption handles the contents.
 * It does not handle the names, and names are where this sort of arrangement usually
 * leaks: an asset called `smp-survival-world.tar.gz.001` in a public run's log tells
 * anybody reading it what the private repository is about, what the world is called, and
 * often enough what to search for to find the rest.
 *
 * So every identifier that appears anywhere public is a keyed hash. Keyed, not plain:
 * a plain SHA-256 of a short name is trivially reversed with a wordlist, and world names
 * are exactly the kind of short guessable string that falls to one. HMAC with the same
 * secret that encrypts the payload means an identifier can be recomputed by anyone who
 * holds the key and by nobody else.
 *
 * These are identifiers, not credentials: publishing one reveals nothing, but it also
 * proves nothing, so nothing may authenticate on the strength of one.
 */

import { createHmac } from "node:crypto";

/** Distinguishes these digests from any other use of the same key. */
const PROJECT_ID_CONTEXT = "material-bluemap/private-transport/project-id/1";

/**
 * How much of the digest is used.
 *
 * Sixteen bytes is 128 bits, which is far beyond what a collision would need to be
 * implausible here, and it produces a 32-character name that is still readable in a
 * directory listing. Truncating a MAC to a fixed length is a standard construction.
 */
const PROJECT_ID_BYTES = 16;

/**
 * An opaque, stable identifier for something on the private side.
 *
 * The label - a world name, a shard number, a repository - never leaves the private
 * side; only this digest does. The same label and key always produce the same id, so a
 * later job can recompute the name of an asset it needs to fetch without anybody having
 * written that name down anywhere public.
 */
export function deriveProjectId(key: Buffer, label: string): string {
    return createHmac("sha256", key)
        .update(`${PROJECT_ID_CONTEXT}|${label}`, "utf8")
        .digest("hex")
        .slice(0, PROJECT_ID_BYTES * 2);
}

/** The manifest's file name for a payload. */
export function manifestAssetName(projectId: string): string {
    return `${projectId}.manifest.bin`;
}

/**
 * One part's file name.
 *
 * The index is in the clear and padded so the parts sort in order. That is a deliberate
 * exception to the rule above: an ordinal reveals only how many pieces something was cut
 * into, which the file count reveals anyway, and hiding it would mean downloading every
 * asset to find out which one is next.
 */
export function partAssetName(projectId: string, index: number): string {
    return `${projectId}.${String(index).padStart(4, "0")}.bin`;
}

/** Everything belonging to a payload, for a glob-style download. */
export function assetPattern(projectId: string): string {
    return `${projectId}.*`;
}

/**
 * A tag for a release that exists only to move data between two jobs.
 *
 * Derived like everything else, and suffixed with the run identifier so two runs of the
 * same world never collide over one staging release - which would have one run deleting
 * the other's assets halfway through.
 */
export function stagingTag(key: Buffer, label: string, runId: string): string {
    return `t-${deriveProjectId(key, `${label}|staging|${runId}`)}`;
}
