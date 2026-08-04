/**
 * Cheap LFS **v1** pointers, as the sibling application already defines them.
 *
 * This format is not this project's invention and must not become a second dialect of
 * itself. It is the shipped contract of `desktop-material`, whose
 * `app/src/lib/cheap-lfs/pointer.ts` is the canonical file and whose
 * `docs/features/repository-management/release-backed-cheap-lfs.md` is the design. A
 * pointer is a small piece of readable text that stands in for a large binary: the bytes
 * live as GitHub **release assets**, and the text says which release, which asset, how
 * many bytes, and what it must hash to.
 *
 * ## Why "cheap"
 *
 * Real Git LFS on GitHub is the expensive route. A free account gets **1 GB of LFS
 * storage and 1 GB of bandwidth a month**, restores are metered against that bandwidth,
 * and past it you buy data packs. A rendered map or a Minecraft world is routinely
 * several gigabytes, so one backup exhausts the free tier and every restore is billed
 * again. Release assets are free on a public repository, capped at 2 GB each rather than
 * in total, and this application already ships both halves of the machinery for them:
 * `@material-bluemap/parts` splits and rejoins, and `main/download/` fetches, verifies
 * and unpacks. Git LFS was not forgotten here; it was **rejected on cost**, by name.
 *
 * ## Keep it canonical forever
 *
 * The canonical file says exactly that about the encrypted line, and the same discipline
 * applies to every line. This module therefore **restates** the grammar rather than
 * inventing near-misses of it, and `pointer.test.ts` asserts what this writes against the
 * regular expressions copied verbatim out of that file. Backup-specific facts - what was
 * backed up, when, by which build - do **not** go in a pointer. They go in a separate
 * `backup.json` sidecar asset beside it, so the pointer stays byte-for-byte something the
 * other application's parser accepts.
 *
 * ```
 * version desktop-material/cheap-lfs/v1
 * release-tag mbm-backup-20260804-101500
 * asset-name overworld-backup.zip
 * size 3221225472
 * sha256 9f2c...
 * part 1a2b... 524288000 overworld-backup.zip.001-1a2b3c4d5e6f7a8b
 * part 3c4d... 524288000 overworld-backup.zip.002-3c4d5e6f7a8b9c0d
 * ...
 * ```
 *
 * A file small enough to be one asset omits the part lines entirely and is the original
 * five-line form, byte for byte.
 *
 * ## What this build reads and what it only recognises
 *
 * Writing is deliberately narrow: five head lines and plain `part` lines. Reading accepts
 * those in full, and **recognises** the compressed and encrypted forms (`part-deflate`,
 * `part-encrypted`, `part-encrypted-deflate`) well enough to say so by name instead of
 * reporting a valid pointer as corrupt. Restoring one of those is not implemented here,
 * and {@link readPointer} says which it was rather than returning a bare null - somebody
 * holding an encrypted backup made by the other application needs to be told that this
 * build has no password path, not that their pointer is broken.
 */

/** The marker on the first line of every pointer. Verbatim from the canonical file. */
export const CHEAP_LFS_POINTER_VERSION = "desktop-material/cheap-lfs/v1";

/**
 * The per-part size for anything written from here: **500 MiB**.
 *
 * GitHub caps one asset at 2 GB, and the canonical file records why new writes sit far
 * below that rather than near it: a failed part re-transfers its whole size, so a part
 * near the ceiling turns one dropped connection into gigabytes of repeated upload, and a
 * slow link is far more likely to break before a large part finishes than a small one.
 * 500 MiB keeps a retry cheap and progress fine-grained.
 *
 * This is deliberately *not* `DEFAULT_PART_SIZE` from `@material-bluemap/parts`, which is
 * 1.7 GB and sized for a one-shot publish from a fast runner rather than for a laptop
 * uploading over a home connection.
 */
export const CHEAP_LFS_PART_SIZE_BYTES = 500 * 1024 * 1024;

/**
 * The largest part a *reader* accepts: 2 GiB exactly.
 *
 * Larger than what is written, on purpose. GitHub historically documented the asset cap
 * as 2 GiB and pointers exist in the wild with a part of exactly that size. A parser may
 * widen what it accepts and must never narrow it, or it orphans files somebody has
 * already committed.
 */
export const CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * A pointer is small, but one line per part for a very large file adds up, so the guard
 * is generous rather than tiny. It still bounds the text far below any real payload.
 */
export const CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES = 512 * 1024;

/** The suffix this application gives the pointer asset it uploads beside the parts. */
export const POINTER_ASSET_SUFFIX = ".cheaplfs";

/**
 * A NUL, and a byte-order mark, spelled through `fromCharCode` rather than as escapes.
 *
 * Not superstition: these two are exactly the characters that a copy through an editor,
 * a patch, or a terminal is liable to turn into a *literal* control character in the
 * source. Building them at run time means the file itself stays plain ASCII, so the
 * guards below cannot be silently disarmed by the tooling that moves this file around.
 */
const NUL_CHARACTER = String.fromCharCode(0);
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** One uploaded part of a whole file that was split across release assets. */
export interface CheapLfsPointerPart {
    /** The release asset's name. */
    readonly name: string;
    /** The part's size in *original* bytes. */
    readonly sizeInBytes: number;
    /** Lowercase hex SHA-256 of the part's original bytes. */
    readonly sha256: string;
}

export interface CheapLfsPointer {
    readonly version: string;
    readonly releaseTag: string;
    readonly assetName: string;
    /** The whole file's byte size, which is the sum of every part when it is split. */
    readonly sizeInBytes: number;
    /** The whole file's SHA-256. */
    readonly sha256: string;
    /**
     * Present when the file was split. A single-asset pointer omits this and serializes
     * as the original five-line form, byte for byte.
     */
    readonly parts?: readonly CheapLfsPointerPart[] | undefined;
}

/**
 * Why a pointer could not be read.
 *
 * `unsupported-encoding` is the one that matters to a person: the pointer is valid and
 * this build simply cannot restore it. Everything else means the text is not a pointer.
 */
export type PointerReadFailure =
    | { readonly code: "not-a-pointer"; readonly message: string }
    | { readonly code: "malformed"; readonly message: string }
    | { readonly code: "unsupported-encoding"; readonly message: string };

export type PointerReadResult =
    | { readonly ok: true; readonly pointer: CheapLfsPointer }
    | { readonly ok: false; readonly failure: PointerReadFailure };

const utf8 = new TextEncoder();

/** The exact UTF-8 byte count of the pointer text, which is what the bound is about. */
export function pointerTextSizeInBytes(text: string): number {
    return utf8.encode(text).byteLength;
}

const SHA256_HEX = /^[a-f0-9]{64}$/;
const NON_NEGATIVE_INTEGER = /^(?:0|[1-9][0-9]*)$/;

/**
 * `part <64-hex sha256> <size> <name>`.
 *
 * The digest and the size sit in fixed leading positions precisely so the trailing name
 * may itself contain spaces. Restated from the canonical file rather than reworded.
 */
const PART_LINE = /^([a-f0-9]{64}) (0|[1-9][0-9]*) (.+)$/;

/** The line prefixes this build recognises but cannot restore. */
const UNSUPPORTED_PART_PREFIXES = [
    "part-encrypted-deflate ",
    "part-encrypted ",
    "part-deflate ",
] as const;

/**
 * Serializes a pointer to its canonical `key value` form with a trailing newline.
 *
 * Always a bare newline, never a carriage return pair: the bytes have to be stable
 * whatever platform wrote them, and on the sibling application's side they are committed
 * to Git, where a platform-dependent line ending would make the same pointer two
 * different blobs.
 */
export function serializeCheapLfsPointer(pointer: CheapLfsPointer): string {
    const lines = [
        `version ${pointer.version}`,
        `release-tag ${pointer.releaseTag}`,
        `asset-name ${pointer.assetName}`,
        `size ${String(pointer.sizeInBytes)}`,
        `sha256 ${pointer.sha256}`,
    ];
    if (pointer.parts !== undefined) {
        for (const part of pointer.parts) {
            lines.push(`part ${part.sha256} ${String(part.sizeInBytes)} ${part.name}`);
        }
    }
    return `${lines.join("\n")}\n`;
}

/** The text with a leading byte-order mark taken off, if it had one. */
function withoutByteOrderMark(text: string): string {
    return text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text;
}

/**
 * A cheap first-line probe, for deciding whether an asset is worth a full parse.
 *
 * A NUL anywhere in the prefix is a strong "this is binary" signal and ends it there,
 * which is what keeps a listing from parsing a gigabyte of tiles as text.
 */
export function isCheapLfsPointerText(text: string): boolean {
    if (typeof text !== "string") return false;
    const prefix = text.slice(0, 256);
    if (prefix.includes(NUL_CHARACTER)) return false;
    const firstLine = (withoutByteOrderMark(prefix).split(/\r?\n/, 1)[0] ?? "").trim();
    return firstLine === `version ${CHEAP_LFS_POINTER_VERSION}`;
}

/**
 * Reads pointer text, tolerating a leading BOM, surrounding whitespace and CRLF.
 *
 * The five head fields may appear in any order but each exactly once. Part sizes must sum
 * to the head `size` exactly: a pointer whose parts do not account for every byte of the
 * file is not a pointer that can be verified, and accepting it would push the discovery
 * of that to the end of a multi-gigabyte restore.
 */
export function readPointer(text: string): PointerReadResult {
    if (typeof text !== "string") {
        return refuse("not-a-pointer", "That asset is not pointer text.");
    }
    if (
        text.length > CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES ||
        pointerTextSizeInBytes(text) > CHEAP_LFS_MAXIMUM_POINTER_TEXT_BYTES
    ) {
        return refuse("not-a-pointer", "That text is far too long to be a Cheap LFS pointer.");
    }
    if (text.includes(NUL_CHARACTER)) {
        return refuse("not-a-pointer", "That asset holds binary data rather than pointer text.");
    }

    const allLines = withoutByteOrderMark(text).trim().split(/\r?\n/);

    const headLines: string[] = [];
    const partLines: string[] = [];
    for (const line of allLines) {
        const unsupported = UNSUPPORTED_PART_PREFIXES.find((prefix) => line.startsWith(prefix));
        if (unsupported !== undefined) {
            return refuse(
                "unsupported-encoding",
                `This backup was stored as ${unsupported.trim()} parts. That is a valid Cheap LFS` +
                    " pointer, but this application only reads plain parts: compressed and" +
                    " password-encrypted payloads are written and restored by Desktop Material.",
            );
        }
        if (line.startsWith("part ")) partLines.push(line.slice("part ".length));
        else if (line.startsWith("encryption ")) {
            return refuse(
                "unsupported-encoding",
                "This backup is password-encrypted. This application has no password path for" +
                    " Cheap LFS payloads; Desktop Material restores it.",
            );
        } else headLines.push(line);
    }

    if (headLines.length !== 5) {
        return refuse("malformed", "A Cheap LFS pointer has exactly five head lines.");
    }

    const fields = new Map<string, string>();
    for (const line of headLines) {
        const separator = line.indexOf(" ");
        if (separator <= 0) return refuse("malformed", `"${line}" is not a pointer field.`);
        const key = line.slice(0, separator);
        if (fields.has(key)) return refuse("malformed", `The pointer names ${key} twice.`);
        fields.set(key, line.slice(separator + 1));
    }

    const version = fields.get("version");
    if (version !== CHEAP_LFS_POINTER_VERSION) {
        return refuse("not-a-pointer", "That text does not carry the Cheap LFS v1 version line.");
    }

    const releaseTag = fields.get("release-tag");
    if (releaseTag === undefined || releaseTag.length === 0 || /\s/.test(releaseTag)) {
        return refuse("malformed", "The pointer names no usable release tag.");
    }

    const assetName = fields.get("asset-name");
    if (assetName === undefined || assetName.length === 0) {
        return refuse("malformed", "The pointer names no asset.");
    }

    const sha256 = fields.get("sha256");
    if (sha256 === undefined || !SHA256_HEX.test(sha256)) {
        return refuse("malformed", "The pointer carries no usable whole-file SHA-256.");
    }

    const size = fields.get("size");
    if (size === undefined || !NON_NEGATIVE_INTEGER.test(size)) {
        return refuse("malformed", "The pointer carries no usable byte size.");
    }
    const sizeInBytes = Number(size);
    if (!Number.isSafeInteger(sizeInBytes) || sizeInBytes < 0) {
        return refuse("malformed", "The pointer's byte size is not a whole number of bytes.");
    }

    if (partLines.length === 0) {
        return { ok: true, pointer: { version, releaseTag, assetName, sizeInBytes, sha256 } };
    }

    const parts: CheapLfsPointerPart[] = [];
    let total = 0;
    for (const line of partLines) {
        const match = PART_LINE.exec(line);
        // Measured in UTF-16 code units rather than UTF-8 bytes, exactly as the canonical
        // parser measures it. No string spends fewer bytes than it has code units, so the
        // character bound is the strictly wider of the two, and widening is the only
        // direction a parser is ever allowed to move.
        if (match === null || (match[3] ?? "").length > 255) {
            return refuse("malformed", `"part ${line}" is not a usable part line.`);
        }
        const partSize = Number(match[2]);
        if (
            !Number.isSafeInteger(partSize) ||
            partSize < 0 ||
            partSize > CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES
        ) {
            return refuse("malformed", `A part of ${String(match[2])} bytes is out of bounds.`);
        }
        total += partSize;
        if (!Number.isSafeInteger(total)) {
            return refuse("malformed", "The pointer's parts add up to more bytes than are real.");
        }
        parts.push({ name: match[3] as string, sizeInBytes: partSize, sha256: match[1] as string });
    }

    if (total !== sizeInBytes) {
        return refuse(
            "malformed",
            `The parts add up to ${String(total)} bytes but the pointer says the file is ` +
                `${String(sizeInBytes)}. Something is missing, and a restore from it could not ` +
                "be verified.",
        );
    }

    return { ok: true, pointer: { version, releaseTag, assetName, sizeInBytes, sha256, parts } };
}

/**
 * The canonical signature, for anything that only wants "is this a pointer".
 *
 * Returns null for every refusal, including the recognised-but-unsupported ones, which is
 * why {@link readPointer} exists beside it: null is the right answer to "parse this" and
 * the wrong answer to "why can I not restore this".
 */
export function parseCheapLfsPointer(text: string): CheapLfsPointer | null {
    const read = readPointer(text);
    return read.ok ? read.pointer : null;
}

function refuse(
    code: PointerReadFailure["code"],
    message: string,
): { readonly ok: false; readonly failure: PointerReadFailure } {
    return { ok: false, failure: { code, message } };
}
