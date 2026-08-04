/**
 * `backup.json`: what this application knows about a backup that the pointer must not.
 *
 * The Cheap LFS pointer format is canonical and shared with `desktop-material`. It says
 * where the bytes are and what they must hash to, and nothing else, and the canonical
 * file is explicit that it is to stay that way. Adding `kind` or `appVersion` to it would
 * make a pointer this application wrote unreadable by the parser it was copied from,
 * which is the one property this whole feature is trading on.
 *
 * So everything backup-shaped lives here instead, in a **separate release asset** beside
 * the pointer. A reader that only understands pointers ignores it and restores the file
 * anyway; a reader that understands this one gets a list of backups with real names,
 * dates and sizes without downloading a gigabyte to find out what a release holds.
 *
 * ## Why the sidecar is what identifies a backup release
 *
 * A repository has releases in it that this application did not make, and a listing that
 * treated every release as a backup would offer somebody their own installer as something
 * to restore. The presence of an asset named exactly {@link SIDECAR_ASSET_NAME} is what
 * makes a release a backup release, and it is a small enough asset to read for every
 * release in a listing without it costing anything worth measuring.
 */

/** Bumped only for a change an older reader could not understand. */
export const BACKUP_SIDECAR_VERSION = 1;

/** The asset name that marks a release as one of this application's backups. */
export const SIDECAR_ASSET_NAME = "backup.json";

/** The largest sidecar worth reading. Far above any real one; bounds a hostile release. */
export const MAX_SIDECAR_BYTES = 256 * 1024;

export interface BackupSidecar {
    readonly sidecarVersion: number;
    /** `render` or `world`. Free text is refused rather than guessed at. */
    readonly kind: "render" | "world";
    /** The folder's own name as the person sees it, before it was reduced for a tag. */
    readonly label: string;
    /** The archive asset this describes, which is also the pointer's `asset-name`. */
    readonly archive: string;
    /** The pointer asset beside it, so a reader need not guess the suffix. */
    readonly pointer: string;
    /** Whole-archive size and digest, repeated so a listing need not fetch the pointer. */
    readonly bytes: number;
    readonly sha256: string;
    readonly parts: number;
    /** How many ordinary files went in, and how many bytes they were before packing. */
    readonly files: number;
    readonly contentBytes: number;
    readonly createdAt: string;
    /** The build that made it. Null when the application could not say. */
    readonly appVersion: string | null;
    /**
     * The folder it came from, on the machine that made it.
     *
     * Recorded because "which of my three worlds was this" is the question a year-old
     * backup gets asked, and never used as a destination: a restore unpacks into the
     * downloads workspace and the person chooses where it goes from there. A path from
     * another computer is information, not an instruction.
     */
    readonly sourceFolder: string;
    /** Anything the pack deliberately left out, carried forward so it is not forgotten. */
    readonly skipped: readonly { readonly name: string; readonly reason: string }[];
}

/** The exact bytes of the sidecar asset: pretty-printed, UTF-8, newline-terminated. */
export function serializeSidecar(sidecar: BackupSidecar): string {
    return `${JSON.stringify(sidecar, null, 4)}\n`;
}

/**
 * Reads a sidecar back, proving every field before a listing shows any of it.
 *
 * Returns null rather than throwing, and null for anything doubtful. This text comes off
 * the internet, from a release anybody with write access to that repository could have
 * put an asset on; a listing that trusted it would be rendering a stranger's strings as
 * though this application had written them.
 */
export function parseSidecar(text: string): BackupSidecar | null {
    if (text.length > MAX_SIDECAR_BYTES) return null;

    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return null;
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;

    if (record["sidecarVersion"] !== BACKUP_SIDECAR_VERSION) return null;

    const kind = record["kind"];
    if (kind !== "render" && kind !== "world") return null;

    const label = readString(record["label"]);
    const archive = readString(record["archive"]);
    const pointer = readString(record["pointer"]);
    const sha256 = readString(record["sha256"]);
    const createdAt = readString(record["createdAt"]);
    const sourceFolder = readString(record["sourceFolder"]);
    if (
        label === null ||
        archive === null ||
        pointer === null ||
        sha256 === null ||
        createdAt === null ||
        sourceFolder === null
    ) {
        return null;
    }
    if (!/^[0-9a-f]{64}$/.test(sha256)) return null;

    const bytes = readCount(record["bytes"]);
    const parts = readCount(record["parts"]);
    const files = readCount(record["files"]);
    const contentBytes = readCount(record["contentBytes"]);
    if (bytes === null || parts === null || files === null || contentBytes === null) return null;

    return {
        sidecarVersion: BACKUP_SIDECAR_VERSION,
        kind,
        label,
        archive,
        pointer,
        bytes,
        sha256,
        parts,
        files,
        contentBytes,
        createdAt,
        appVersion: readString(record["appVersion"]),
        sourceFolder,
        skipped: readSkipped(record["skipped"]),
    };
}

function readString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function readCount(value: unknown): number | null {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** A malformed skip list is dropped rather than refusing the whole sidecar. */
function readSkipped(value: unknown): readonly { name: string; reason: string }[] {
    if (!Array.isArray(value)) return [];
    const skipped: { name: string; reason: string }[] = [];
    for (const item of value) {
        if (typeof item !== "object" || item === null) continue;
        const entry = item as Record<string, unknown>;
        const name = readString(entry["name"]);
        const reason = readString(entry["reason"]);
        if (name !== null && reason !== null) skipped.push({ name, reason });
    }
    return skipped;
}
