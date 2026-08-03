/**
 * The manifest that turns a pile of numbered files back into one archive.
 *
 * A GitHub release asset is capped at **2 GB per file**. A rendered world is tens of
 * gigabytes of tiles and even a modest world archive goes past the cap, so an oversized
 * asset is published as `<name>.001`, `<name>.002`, ... beside a `<name>.parts.json`
 * that says how to put it back.
 *
 * The manifest is the whole reason a rejoin can be trusted. It carries the original
 * name, the total byte length, the SHA-256 of the whole file, the part size, and a
 * digest for **every part**, so a rejoin can say which of forty files arrived wrong
 * rather than only that the result is not what it should be. A silent bad rejoin
 * produces a corrupt world that surfaces three layers away as a rendering bug, which is
 * a day of debugging in the wrong file; the checks are the point of the format, not
 * decoration on it.
 *
 * ## Why the names are validated so aggressively
 *
 * A manifest is downloaded from the internet, and every part name in it is resolved
 * against the directory the manifest sits in. A part called `../../../.ssh/authorized_keys`
 * would therefore be written outside that directory by a naive join. Nothing here ever
 * accepts a name that is not a plain file name.
 */

/** Bumped only for a change that an older reader could not understand. */
export const PARTS_MANIFEST_VERSION = 1;

/**
 * The hard cap GitHub puts on one release asset: 2 GB.
 *
 * Anything at or under this uploads unchanged. Anything over it is refused outright, so
 * the split is not an optimisation, it is the only way the asset ships at all.
 */
export const GITHUB_ASSET_LIMIT = 2_000_000_000;

/**
 * 1.7 GB per part, a deliberate margin under the 2 GB cap.
 *
 * The margin is not superstition. The cap is enforced on the uploaded object, and a
 * part sized right at the limit leaves nothing for a boundary that is counted in
 * binary rather than decimal gigabytes, or for whatever the upload path adds. 300 MB of
 * headroom costs one extra part every six, and it costs it once, at publish time.
 */
export const DEFAULT_PART_SIZE = 1_700_000_000;

/** `world.zip` becomes `world.zip.parts.json`. */
export const MANIFEST_SUFFIX = ".parts.json";

export interface PartRecord {
    /** 1-based, and equal to the numeric suffix on the part's own file name. */
    readonly index: number;
    /** A plain file name, resolved against the directory the manifest is in. */
    readonly name: string;
    readonly bytes: number;
    /** Lowercase hex SHA-256 of this part alone. */
    readonly sha256: string;
}

export interface PartsManifest {
    readonly version: number;
    /** The name the rejoined file gets back. A plain file name, never a path. */
    readonly file: string;
    /** Total byte length of the original file. */
    readonly bytes: number;
    /** Lowercase hex SHA-256 of the original file, whole. */
    readonly sha256: string;
    /** The size every part but the last one has. */
    readonly partSize: number;
    readonly parts: readonly PartRecord[];
}

/** A manifest that is missing, unreadable, or does not describe a joinable file. */
export class PartsManifestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PartsManifestError";
    }
}

/**
 * Bytes that do not hash to what the manifest said they would.
 *
 * `part` is the record that failed, or null when the whole-file digest is the one that
 * disagreed. Carrying the record rather than only a sentence is what lets a caller
 * re-download exactly the one part that is wrong instead of the other thirty-nine.
 */
export class PartsIntegrityError extends Error {
    readonly part: PartRecord | null;
    readonly expected: string;
    readonly actual: string;

    constructor(message: string, part: PartRecord | null, expected: string, actual: string) {
        super(message);
        this.name = "PartsIntegrityError";
        this.part = part;
        this.expected = expected;
        this.actual = actual;
    }
}

/** `world.zip` -> `world.zip.parts.json`. */
export function manifestNameFor(fileName: string): string {
    return `${fileName}${MANIFEST_SUFFIX}`;
}

/**
 * `world.zip` + 3 -> `world.zip.003`.
 *
 * Zero-padded to three digits so a directory listing sorts into join order. Past 999
 * the number simply gets longer, which sorts wrong in a file manager but is never what
 * the join reads: the manifest lists the parts in order and the join follows the list.
 */
export function partNameFor(fileName: string, index: number): string {
    return `${fileName}.${String(index).padStart(3, "0")}`;
}

/** True for the name of a parts manifest, e.g. `world.zip.parts.json`. */
export function isManifestName(name: string): boolean {
    return name.endsWith(MANIFEST_SUFFIX) && name.length > MANIFEST_SUFFIX.length;
}

/** `world.zip.parts.json` -> `world.zip`. Null when the name is not a manifest name. */
export function fileNameFromManifestName(name: string): string | null {
    if (!isManifestName(name)) return null;
    return name.slice(0, -MANIFEST_SUFFIX.length);
}

const HEX_SHA256 = /^[0-9a-f]{64}$/;

/**
 * A name that can only ever mean a file in one directory.
 *
 * No separators of either flavour, no drive letter, no `.` or `..`, no NUL. Windows and
 * POSIX disagree about which separator matters, so both are refused everywhere rather
 * than asking the host what it thinks.
 */
function isPlainFileName(value: string): boolean {
    if (value.length === 0) return false;
    if (value === "." || value === "..") return false;
    if (value.includes("/") || value.includes("\\") || value.includes("\0")) return false;
    return !/^[a-zA-Z]:/.test(value);
}

/**
 * Reads a manifest out of text, proving every field before anything acts on it.
 *
 * `source` is only used in messages: a manifest that is wrong is nearly always one of
 * several on disk, and a complaint that does not say which file it is about sends the
 * reader looking through all of them.
 */
export function parseManifest(text: string, source: string): PartsManifest {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new PartsManifestError(`${source} is not valid JSON: ${detail}`);
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new PartsManifestError(`${source} is not a parts manifest object.`);
    }

    const record = raw as Record<string, unknown>;
    const version = record["version"];
    if (version !== PARTS_MANIFEST_VERSION) {
        throw new PartsManifestError(
            `${source} is version ${String(version)}; this build understands version ` +
                `${String(PARTS_MANIFEST_VERSION)} only.`,
        );
    }

    const file = record["file"];
    if (typeof file !== "string" || !isPlainFileName(file)) {
        throw new PartsManifestError(
            `${source} names its file as ${JSON.stringify(file)}, which is not a plain file name.`,
        );
    }

    const bytes = record["bytes"];
    if (typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 0) {
        throw new PartsManifestError(`${source} has no usable total byte length.`);
    }

    const sha256 = record["sha256"];
    if (typeof sha256 !== "string" || !HEX_SHA256.test(sha256)) {
        throw new PartsManifestError(`${source} has no usable whole-file SHA-256.`);
    }

    const partSize = record["partSize"];
    if (typeof partSize !== "number" || !Number.isSafeInteger(partSize) || partSize <= 0) {
        throw new PartsManifestError(`${source} has no usable part size.`);
    }

    const rawParts = record["parts"];
    if (!Array.isArray(rawParts) || rawParts.length === 0) {
        throw new PartsManifestError(`${source} lists no parts.`);
    }

    const parts: PartRecord[] = [];
    let total = 0;
    for (let i = 0; i < rawParts.length; i++) {
        const entry = rawParts[i] as unknown;
        const position = `${source} part ${String(i + 1)}`;
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            throw new PartsManifestError(`${position} is not an object.`);
        }
        const part = entry as Record<string, unknown>;
        const index = part["index"];
        if (index !== i + 1) {
            throw new PartsManifestError(
                `${position} is numbered ${String(index)}; parts must be listed in order from 1.`,
            );
        }
        const name = part["name"];
        if (typeof name !== "string" || !isPlainFileName(name)) {
            throw new PartsManifestError(
                `${position} is named ${JSON.stringify(name)}, which is not a plain file name.`,
            );
        }
        const partBytes = part["bytes"];
        if (typeof partBytes !== "number" || !Number.isSafeInteger(partBytes) || partBytes <= 0) {
            throw new PartsManifestError(`${position} has no usable byte length.`);
        }
        if (partBytes > partSize) {
            throw new PartsManifestError(
                `${position} claims ${String(partBytes)} bytes, more than the part size ` +
                    `${String(partSize)}.`,
            );
        }
        const partSha = part["sha256"];
        if (typeof partSha !== "string" || !HEX_SHA256.test(partSha)) {
            throw new PartsManifestError(`${position} has no usable SHA-256.`);
        }
        total += partBytes;
        parts.push({ index: i + 1, name, bytes: partBytes, sha256: partSha });
    }

    if (total !== bytes) {
        throw new PartsManifestError(
            `${source} says the file is ${String(bytes)} bytes but its parts add up to ` +
                `${String(total)}. One of the two numbers is wrong, so neither can be trusted.`,
        );
    }

    return { version: PARTS_MANIFEST_VERSION, file, bytes, sha256, partSize, parts };
}

/**
 * Where each part starts in the rejoined file, plus a final entry at the total length.
 *
 * `offsets.length === parts.length + 1`, which is what lets a resume ask "how far did
 * the last run get" as a single lookup rather than a running sum.
 */
export function partOffsets(manifest: PartsManifest): number[] {
    const offsets: number[] = [];
    let accumulated = 0;
    for (const part of manifest.parts) {
        offsets.push(accumulated);
        accumulated += part.bytes;
    }
    offsets.push(accumulated);
    return offsets;
}
