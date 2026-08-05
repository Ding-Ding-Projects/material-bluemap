/**
 * Deciding, cheaply, whether a world has changed since it was last uploaded.
 *
 * The point of this file is one sentence in the feature's contract: **a re-sync of an
 * unchanged world must not upload it again.** Uploading twenty gigabytes a second time
 * costs an evening of somebody's bandwidth and buys nothing, and it is exactly what a
 * naive "press the button, it uploads" loop does.
 *
 * ## Lives here so it has exactly one implementation
 *
 * This started in the desktop app's `main/cirender/` and moved here so the **scheduled
 * render workflow** could call the exact same function through this package's CLI, rather
 * than a second, hand-rolled "has it changed" check growing up beside it in
 * `render-actions`. `app/src/main/cirender/fingerprint.ts` now only re-exports what is
 * defined here; every caller, in the desktop app or in a GitHub Actions job, runs one
 * function. See `../cli.ts`'s `fingerprint` command and `../schedule/` for the scheduled
 * side of that reuse.
 *
 * ## Why this is not the archive's digest
 *
 * The authoritative digest of what was uploaded is the archive's SHA-256, which the
 * backup runner computes and reports in its summary, and which this feature records. But
 * getting it means packing the whole world - reading every byte and writing every byte -
 * which on a large world is most of the cost of the upload itself. Paying that to find
 * out whether an upload is needed defeats the saving.
 *
 * So this is a **change detector**, not a content digest: one `readdir`/`stat` pass over
 * the tree, hashing each file's relative path, its size and its modification time. That
 * is the same evidence every incremental build system in existence runs on, and it is
 * cheap enough to run before every sync.
 *
 * ## What it can miss, stated plainly
 *
 * A file edited and then restored to exactly its previous size *and* its previous
 * modification time reads as unchanged. Minecraft does not do that - it rewrites a region
 * file and the filesystem stamps it - so in practice the miss needs somebody to forge an
 * mtime deliberately. The escape hatch is not a cleverer hash: it is that a person can
 * force a fresh upload, and the sync surface offers exactly that. A cheap detector with a
 * documented blind spot and a manual override is honest; a "digest" that is really a size
 * comparison is not.
 *
 * ## Links are counted, never followed
 *
 * A symbolic link inside a world is recorded by its own name and skipped, matching what
 * the desktop app's `main/backup/archive.ts` does when it packs. Following one would
 * fingerprint whatever happens to be at the other end - which is somewhere else on this
 * computer, and is not part of the world about to be published.
 */

import { createHash } from "node:crypto";
import { opendir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

/** The fingerprint format, so a change in what is hashed invalidates old records. */
export const WORLD_FINGERPRINT_VERSION = 1;

export interface WorldFingerprint {
    readonly version: number;
    /** `v1:<64 hex>`. Compared as a whole string; never parsed apart. */
    readonly digest: string;
    readonly files: number;
    readonly bytes: number;
    /** Entries that were seen and deliberately not hashed, with the reason. */
    readonly skipped: readonly { readonly name: string; readonly reason: string }[];
}

export class FingerprintError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "FingerprintError";
    }
}

/**
 * Walks a folder once and reduces it to one comparable string.
 *
 * The entries are sorted by their **UTF-8 bytes** before hashing, for the reason
 * `archive.ts` sorts the same way: a machine set to Turkish orders `I` differently from
 * one set to English, and a fingerprint that depends on the operating system's locale
 * would report a world as changed simply because it was opened on another computer.
 *
 * `mtimeMs` is rounded to whole milliseconds before it is hashed. Different filesystems
 * carry different timestamp resolutions, and a float that differs in its last bits
 * between two stats of the same untouched file would make every world look changed.
 */
export async function fingerprintWorld(
    folder: string,
    signal?: AbortSignal,
): Promise<WorldFingerprint> {
    const root = resolve(folder);
    const stats = await stat(root).catch(() => null);
    if (stats === null || !stats.isDirectory()) {
        throw new FingerprintError(`${root} is not a folder, so it cannot be checked for changes.`);
    }

    const entries: { name: string; bytes: number; mtimeMs: number }[] = [];
    const skipped: { name: string; reason: string }[] = [];
    let bytes = 0;

    const walk = async (directory: string): Promise<void> => {
        signal?.throwIfAborted();
        const handle = await opendir(directory);
        for await (const item of handle) {
            signal?.throwIfAborted();
            const path = join(directory, item.name);
            const name = relative(root, path).split(sep).join("/");
            if (item.isSymbolicLink()) {
                skipped.push({
                    name,
                    reason: "It is a link, and a link is not followed when the world is packed.",
                });
                continue;
            }
            if (item.isDirectory()) {
                await walk(path);
                continue;
            }
            if (!item.isFile()) {
                skipped.push({ name, reason: "It is not an ordinary file." });
                continue;
            }
            const fileStats = await stat(path).catch(() => null);
            if (fileStats === null) {
                skipped.push({ name, reason: "It could not be read." });
                continue;
            }
            entries.push({ name, bytes: fileStats.size, mtimeMs: Math.round(fileStats.mtimeMs) });
            bytes += fileStats.size;
        }
    };

    await walk(root);
    entries.sort((left, right) =>
        Buffer.compare(Buffer.from(left.name, "utf8"), Buffer.from(right.name, "utf8")),
    );

    const hash = createHash("sha256");
    for (const entry of entries) {
        hash.update(`${entry.name} ${String(entry.bytes)} ${String(entry.mtimeMs)}\n`, "utf8");
    }

    return {
        version: WORLD_FINGERPRINT_VERSION,
        digest: `v${String(WORLD_FINGERPRINT_VERSION)}:${hash.digest("hex")}`,
        files: entries.length,
        bytes,
        skipped,
    };
}

/**
 * True when a fresh fingerprint says the world is the same one that was last uploaded.
 *
 * A null or empty recorded fingerprint is **not** a match. "Nothing was recorded" and
 * "nothing changed" are opposite answers, and confusing them would skip the first upload
 * a world ever needs and then dispatch a render against an asset that does not exist.
 */
export function isUnchanged(recorded: string | null, fresh: WorldFingerprint): boolean {
    return typeof recorded === "string" && recorded.length > 0 && recorded === fresh.digest;
}
