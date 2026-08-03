/**
 * The encryption underneath the private render path.
 *
 * The arrangement this serves: somebody's world lives in a private repository, private
 * Actions minutes are expensive, and public ones are free. So the rendering happens on a
 * public runner, and everything that crosses to the public side is encrypted first, with
 * a key that only ever exists as an Actions secret.
 *
 * AES-256-GCM, and the authentication tag is the point rather than a detail. Without
 * authenticated encryption a payload can be altered in transit and will still decrypt -
 * into different bytes, which then get fed to a renderer as if they were a world. GCM's
 * tag makes that a refusal instead of a silent substitution, so every failure to
 * authenticate stops the run.
 *
 * Three properties are worth naming, because each one is a real attack this shape
 * prevents rather than a box to tick:
 *
 * - **Every part carries its own key stream position.** A fresh random 96-bit IV per
 *   part, never a counter derived from the index, so nothing can reuse an IV with the
 *   same key - the one mistake that breaks GCM outright and exposes the plaintext.
 * - **The associated data binds a part to its place.** A part's index and length are
 *   authenticated but not encrypted, so swapping part 3 for part 7, or replaying an
 *   older part 3 of a different payload, breaks the tag rather than producing a payload
 *   that reassembles into something plausible.
 * - **The header travels with the ciphertext.** It is written into the file and checked
 *   against what the reader expects, so rewriting the header to match altered content
 *   fails the tag too.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/** `MBMSEAL\x01`. Eight bytes, so a file that is not one of these is refused immediately. */
const MAGIC = Buffer.from("MBMSEAL\u0001", "latin1");

/** Bumped only if the envelope's layout changes. An older reader refuses a newer file. */
const FORMAT_VERSION = 1;

/** AES-256. Nothing else is accepted: a shorter key is a configuration mistake, not an option. */
export const KEY_BYTES = 32;

/** 96 bits, which is the size GCM is defined for and the only one this writes. */
export const IV_BYTES = 12;

/** The full 128-bit tag. Truncating it weakens the only guarantee this whole file exists for. */
export const TAG_BYTES = 16;

/** Magic, version and the associated data's length. Exported so tests can aim at a byte. */
export const MAGIC_BYTES = MAGIC.length;
export const HEADER_BYTES = MAGIC_BYTES + 1 + 2;

export type PrivateCryptoFailureCode =
    | "missing-key"
    | "malformed-key"
    | "not-a-sealed-file"
    | "unsupported-version"
    | "truncated"
    | "unexpected-header"
    | "authentication-failed";

/**
 * Every failure in this module, as one type.
 *
 * Thrown rather than returned because there is exactly one correct response to all of
 * them - stop - and a caller that has to remember to check a boolean is a caller that
 * eventually renders an unauthenticated payload.
 */
export class PrivateCryptoError extends Error {
    readonly code: PrivateCryptoFailureCode;

    constructor(code: PrivateCryptoFailureCode, message: string) {
        super(message);
        this.name = "PrivateCryptoError";
        this.code = code;
    }
}

/**
 * Reads the key from a string, in hex or base64.
 *
 * Deliberately strict about the length. A 16-byte key would encrypt perfectly well and
 * quietly halve the strength of the whole arrangement, and the value arrives from an
 * Actions secret where a truncated paste is entirely plausible.
 *
 * The key itself never appears in any message this throws, and neither does its length,
 * beyond saying what was expected.
 */
export function parseKey(value: string | undefined | null): Buffer {
    if (value === undefined || value === null || value.trim() === "") {
        throw new PrivateCryptoError(
            "missing-key",
            "No encryption key was provided. The private render path refuses to run without" +
                " one rather than falling back to moving the world in the clear.",
        );
    }

    const trimmed = value.trim();
    let key: Buffer | null = null;

    if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === KEY_BYTES * 2) {
        key = Buffer.from(trimmed, "hex");
    } else if (/^[A-Za-z0-9+/=_-]+$/.test(trimmed)) {
        const decoded = Buffer.from(trimmed, "base64");
        if (decoded.length === KEY_BYTES) key = decoded;
    }

    if (key === null || key.length !== KEY_BYTES) {
        throw new PrivateCryptoError(
            "malformed-key",
            `The encryption key must be ${KEY_BYTES} bytes, given as ${KEY_BYTES * 2} hex` +
                " characters or as base64. It was neither, so nothing was encrypted or" +
                " decrypted. Generate one with: openssl rand -hex 32",
        );
    }

    return key;
}

/** Reads the key out of an environment variable, naming the variable when it is not there. */
export function keyFromEnvironment(
    variable: string,
    environment: Readonly<Record<string, string | undefined>> = process.env,
): Buffer {
    const raw = environment[variable];
    if (raw === undefined || raw.trim() === "") {
        throw new PrivateCryptoError(
            "missing-key",
            `${variable} is not set. The private render path refuses to run without a key` +
                " rather than falling back to moving the world in the clear.",
        );
    }
    return parseKey(raw);
}

/** A fresh 32-byte key, for the documentation to point at and for tests to use. */
export function generateKey(): Buffer {
    return randomBytes(KEY_BYTES);
}

/**
 * Encrypts one block, binding `aad` to it.
 *
 * The layout, which `unseal` reads back:
 *
 * ```
 * magic      8 bytes   MBMSEAL\x01
 * version    1 byte
 * aad length 2 bytes   big endian
 * iv        12 bytes
 * tag       16 bytes
 * aad        n bytes   UTF-8, authenticated but not encrypted
 * ciphertext rest
 * ```
 *
 * The associated data is stored in the clear on purpose: a reader needs to know which
 * part it is holding before it can decide whether it wants it, and putting it inside the
 * ciphertext would mean decrypting an unverified file to find out. It is authenticated,
 * so it cannot be changed without breaking the tag.
 */
export function seal(key: Buffer, aad: string, plaintext: Buffer): Buffer {
    const iv = randomBytes(IV_BYTES);
    const aadBytes = Buffer.from(aad, "utf8");

    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aadBytes);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    const header = Buffer.alloc(MAGIC.length + 1 + 2);
    MAGIC.copy(header, 0);
    header.writeUInt8(FORMAT_VERSION, MAGIC.length);
    header.writeUInt16BE(aadBytes.length, MAGIC.length + 1);

    return Buffer.concat([header, iv, tag, aadBytes, ciphertext]);
}

/**
 * Decrypts one block, refusing anything that does not authenticate.
 *
 * `expectedAad` is required rather than optional. Verifying the tag proves the file was
 * made by somebody holding the key; it does not prove the file is the one that was asked
 * for. Requiring the caller to say which part it wanted turns "this decrypts" into "this
 * is part 4 of this payload", which is the claim the caller actually depends on.
 */
export function unseal(key: Buffer, expectedAad: string, sealed: Buffer): Buffer {
    const minimum = MAGIC.length + 1 + 2 + IV_BYTES + TAG_BYTES;
    if (sealed.length < minimum) {
        throw new PrivateCryptoError(
            "truncated",
            "The sealed payload is too short to be one. It was probably cut off in transit;" +
                " nothing was decrypted.",
        );
    }

    if (!sealed.subarray(0, MAGIC.length).equals(MAGIC)) {
        throw new PrivateCryptoError(
            "not-a-sealed-file",
            "That file is not a sealed payload. Nothing was decrypted.",
        );
    }

    const version = sealed.readUInt8(MAGIC.length);
    if (version !== FORMAT_VERSION) {
        throw new PrivateCryptoError(
            "unsupported-version",
            `The sealed payload is format version ${version}; this build understands` +
                ` ${FORMAT_VERSION}. Nothing was decrypted.`,
        );
    }

    const aadLength = sealed.readUInt16BE(MAGIC.length + 1);
    const ivAt = MAGIC.length + 1 + 2;
    const tagAt = ivAt + IV_BYTES;
    const aadAt = tagAt + TAG_BYTES;
    const ciphertextAt = aadAt + aadLength;

    if (sealed.length < ciphertextAt) {
        throw new PrivateCryptoError(
            "truncated",
            "The sealed payload's header runs past the end of the file. Nothing was decrypted.",
        );
    }

    const storedAad = sealed.subarray(aadAt, ciphertextAt);
    const expectedBytes = Buffer.from(expectedAad, "utf8");

    // Checked before the tag so the error says which part arrived rather than only that
    // something did not authenticate. Constant time because it costs nothing to do here
    // and the alternative is a habit that eventually gets applied to the tag itself.
    if (storedAad.length !== expectedBytes.length || !timingSafeEqual(storedAad, expectedBytes)) {
        throw new PrivateCryptoError(
            "unexpected-header",
            `The sealed payload says it is "${storedAad.toString("utf8").slice(0, 200)}" but` +
                ` "${expectedAad}" was expected. Nothing was decrypted.`,
        );
    }

    const decipher = createDecipheriv("aes-256-gcm", key, sealed.subarray(ivAt, tagAt));
    decipher.setAAD(storedAad);
    decipher.setAuthTag(sealed.subarray(tagAt, aadAt));

    try {
        return Buffer.concat([decipher.update(sealed.subarray(ciphertextAt)), decipher.final()]);
    } catch {
        // `final()` is where GCM checks the tag. Reaching here means the ciphertext, the
        // header or the tag was altered, or the key is the wrong one. All four are
        // refusals: the alternative is handing a renderer bytes nobody vouched for.
        throw new PrivateCryptoError(
            "authentication-failed",
            "The sealed payload failed its authentication check. It was altered in transit," +
                " or it was sealed with a different key. Nothing was decrypted and the run" +
                " stops here.",
        );
    }
}
