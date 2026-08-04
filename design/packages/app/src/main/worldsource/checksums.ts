/**
 * Reading a `SHA256SUMS` file, which is how most of the world publishes a digest.
 *
 * This project's own split format carries a `<name>.parts.json` with a digest for every
 * part and one for the whole file. Nothing else does. What a backup script, a server
 * operator or a `sha256sum > SHA256SUMS` pipeline actually produces looks like this:
 *
 * ```
 * f9ae56e9...522d  andyville-world-20260804-160001.zip.part.0000
 * 32d21c07...83f6  andyville-world-20260804-160001.zip.part.0001
 * ```
 *
 * A world published that way is unusable to a reader that only understands the manifest,
 * which is the gap this file exists to close. Both GNU coreutils' format and BSD's
 * `SHA256 (file) = digest` are read, because both are in the wild and a reader that
 * silently skips the one it does not know reports a release with no checksums at all -
 * and "no checksums" is the state in which an unverified world gets rendered.
 *
 * ## Why the names are validated
 *
 * Every name in this file is resolved against the directory the parts were downloaded
 * into. A line naming `../../../.ssh/authorized_keys` would otherwise send a verification
 * read, and later a join, outside that directory. The same rule the parts manifest
 * applies is applied here, for the same reason: nothing that is not a plain file name is
 * accepted, at all, ever.
 */

/** A file that does not parse as a list of digests. Carries which file, and why. */
export class ChecksumFileError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ChecksumFileError";
    }
}

export interface ChecksumEntry {
    /** A plain file name, as published. */
    readonly name: string;
    /** Lowercase hex SHA-256. */
    readonly sha256: string;
}

/**
 * The asset names this recognises as a checksum list.
 *
 * A closed set rather than a pattern. A pattern wide enough to catch every spelling also
 * catches `sha256sums-of-the-old-release.txt`, and verifying a world against the wrong
 * list is worse than not finding one: it fails loudly for the right reason with the wrong
 * evidence, and sends somebody re-downloading files that were never bad.
 */
export const CHECKSUM_ASSET_NAMES: readonly string[] = [
    "SHA256SUMS",
    "SHA256SUMS.txt",
    "sha256sums",
    "sha256sums.txt",
    "SHASUMS256.txt",
    "checksums.txt",
    "CHECKSUMS.txt",
];

/** True for an asset name that is a checksum list. Case-sensitive on purpose. */
export function isChecksumAssetName(name: string): boolean {
    return CHECKSUM_ASSET_NAMES.includes(name);
}

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

/** GNU coreutils: `<digest><space><space|asterisk><name>`. The `*` means binary mode. */
const GNU_LINE = /^([0-9a-fA-F]{64})[ \t]+[ *]?(.+)$/;

/** BSD: `SHA256 (name) = <digest>`. */
const BSD_LINE = /^SHA256\s*\((.+)\)\s*=\s*([0-9a-fA-F]{64})$/;

/**
 * A name that can only ever mean a file in one directory.
 *
 * No separator of either flavour, no drive letter, no `.` or `..`, no NUL. Windows and
 * POSIX disagree about which separator matters, so both are refused everywhere rather
 * than asking the host which one it believes in - this app runs on Windows and reads
 * files written on Linux, so the host's opinion is the wrong one either way.
 */
function isPlainFileName(value: string): boolean {
    if (value.length === 0) return false;
    if (value === "." || value === "..") return false;
    if (value.includes("/") || value.includes("\\") || value.includes("\0")) return false;
    return !/^[a-zA-Z]:/.test(value);
}

/**
 * Parses a checksum list. Throws {@link ChecksumFileError} rather than returning a
 * partial one.
 *
 * A partial parse is the dangerous outcome here: skipping the two lines that did not
 * match leaves a map of digests that looks complete, and the parts those lines named are
 * then joined unverified. Every line has to be a digest line or a comment, or the file is
 * refused and named.
 *
 * `source` appears in every message. A release with a broken checksum list nearly always
 * has several files in play, and a complaint that does not say which one it is about
 * sends the reader through all of them.
 */
export function parseChecksums(text: string, source: string): ChecksumEntry[] {
    const entries: ChecksumEntry[] = [];
    const seen = new Set<string>();
    const lines = text.split(/\r?\n/);

    for (let index = 0; index < lines.length; index++) {
        const raw = lines[index] ?? "";
        const line = raw.trim();
        if (line === "" || line.startsWith("#")) continue;

        const gnu = GNU_LINE.exec(line);
        const bsd = gnu === null ? BSD_LINE.exec(line) : null;
        const digest = gnu?.[1] ?? bsd?.[2];
        const name = (gnu?.[2] ?? bsd?.[1])?.trim();

        const position = `${source} line ${String(index + 1)}`;
        if (digest === undefined || name === undefined) {
            throw new ChecksumFileError(
                `${position} is neither a checksum nor a comment: ${JSON.stringify(line)}.`,
            );
        }
        if (!HEX_SHA256.test(digest)) {
            throw new ChecksumFileError(`${position} does not carry a SHA-256.`);
        }
        if (!isPlainFileName(name)) {
            throw new ChecksumFileError(
                `${position} names ${JSON.stringify(name)}, which is not a plain file name. ` +
                    "A checksum list only ever names files beside itself.",
            );
        }
        // Two digests for one name is not a duplicate to be deduplicated, it is a file
        // whose correct digest is unknowable. Refusing is the only honest answer.
        if (seen.has(name)) {
            throw new ChecksumFileError(`${source} lists ${name} twice, with no way to say which is right.`);
        }
        seen.add(name);
        entries.push({ name, sha256: digest.toLowerCase() });
    }

    if (entries.length === 0) {
        throw new ChecksumFileError(`${source} lists no checksums at all.`);
    }
    return entries;
}

/** The parsed list as a lookup, for checking a part by the name it was published under. */
export function checksumsByName(entries: readonly ChecksumEntry[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const entry of entries) map.set(entry.name, entry.sha256);
    return map;
}
