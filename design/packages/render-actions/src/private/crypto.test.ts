/**
 * Tests for the encryption underneath the private render path.
 *
 * Nearly all of these are about refusal, because that is what authenticated encryption
 * buys and it is the part that is easy to get subtly wrong. Encryption that round-trips
 * is easy; encryption that **refuses** a payload somebody altered is the whole reason
 * this is AES-GCM rather than AES-CBC, and a test suite that only proved the round trip
 * would pass just as happily against a version that never checked the tag at all.
 *
 * Each test therefore breaks something specific - a byte of ciphertext, a byte of the
 * tag, the header, the key - and asserts that nothing comes back rather than that
 * something different does.
 */

import { describe, expect, it } from "vitest";
import {
    HEADER_BYTES,
    IV_BYTES,
    MAGIC_BYTES,
    PrivateCryptoError,
    TAG_BYTES,
    generateKey,
    keyFromEnvironment,
    parseKey,
    seal,
    unseal,
} from "./crypto.js";

/** Where the associated data starts in a sealed file, derived rather than hard-coded. */
const AAD_AT = HEADER_BYTES + IV_BYTES + TAG_BYTES;

const AAD = "material-bluemap/private-transport/1|abcdef|part|0|11";
const PLAINTEXT = Buffer.from("hello world", "utf8");

/** Flips one bit at `offset`, in place. The smallest change a tag has to catch. */
function flipBit(buffer: Buffer, offset: number, mask = 0x01): void {
    buffer.writeUInt8(buffer.readUInt8(offset) ^ mask, offset);
}

describe("parseKey", () => {
    it("takes a 32-byte key as hex or base64", () => {
        const key = generateKey();

        expect(parseKey(key.toString("hex")).equals(key)).toBe(true);
        expect(parseKey(key.toString("base64")).equals(key)).toBe(true);
        expect(parseKey(`  ${key.toString("hex")}  `).equals(key)).toBe(true);
    });

    it("refuses a key that is not there rather than inventing one", () => {
        for (const value of [undefined, null, "", "   "]) {
            expect(() => parseKey(value)).toThrow(PrivateCryptoError);
        }
        expect(() => parseKey(undefined)).toThrow(/refuses to run without one/);
    });

    it("refuses a key of the wrong length instead of silently weakening itself", () => {
        // A 16-byte key would encrypt perfectly well, and halve the strength of the whole
        // arrangement without anything saying so. The value arrives from a secret store
        // where a truncated paste is entirely plausible.
        expect(() => parseKey("00".repeat(16))).toThrow(PrivateCryptoError);
        expect(() => parseKey("00".repeat(64))).toThrow(/must be 32 bytes/);
        expect(() => parseKey("not a key at all!")).toThrow(/must be 32 bytes/);
    });

    it("never repeats the key back in an error", () => {
        const nearlyRight = "00".repeat(31);
        try {
            parseKey(nearlyRight);
            expect.unreachable("should have refused");
        } catch (error) {
            expect((error as Error).message).not.toContain(nearlyRight);
        }
    });
});

describe("keyFromEnvironment", () => {
    it("names the variable that is missing", () => {
        expect(() => keyFromEnvironment("PRIVATE_WORLD_KEY", {})).toThrow(/PRIVATE_WORLD_KEY/);
    });

    it("reads a key that is there", () => {
        const key = generateKey();
        const read = keyFromEnvironment("PRIVATE_WORLD_KEY", {
            PRIVATE_WORLD_KEY: key.toString("hex"),
        });

        expect(read.equals(key)).toBe(true);
    });
});

describe("seal and unseal", () => {
    it("round-trips", () => {
        const key = generateKey();

        expect(unseal(key, AAD, seal(key, AAD, PLAINTEXT)).equals(PLAINTEXT)).toBe(true);
    });

    it("round-trips an empty block and a large one", () => {
        const key = generateKey();
        const large = Buffer.alloc(1024 * 1024, 7);

        expect(unseal(key, AAD, seal(key, AAD, Buffer.alloc(0))).length).toBe(0);
        expect(unseal(key, AAD, seal(key, AAD, large)).equals(large)).toBe(true);
    });

    it("never writes the plaintext into the sealed bytes", () => {
        const key = generateKey();
        const secret = Buffer.from("the-world-is-called-something", "utf8");

        const sealed = seal(key, AAD, secret);

        expect(sealed.includes(secret)).toBe(false);
    });

    it("uses a fresh IV every time, so the same input never seals to the same bytes", () => {
        // Reusing an IV with the same key is the one mistake that breaks GCM outright.
        const key = generateKey();

        const first = seal(key, AAD, PLAINTEXT);
        const second = seal(key, AAD, PLAINTEXT);

        expect(first.equals(second)).toBe(false);
    });

    it("refuses a payload whose ciphertext was altered", () => {
        const key = generateKey();
        const sealed = seal(key, AAD, PLAINTEXT);
        // One bit, in the last byte, where a truncation check would never look.
        flipBit(sealed, sealed.length - 1);

        expect(() => unseal(key, AAD, sealed)).toThrow(PrivateCryptoError);
        try {
            unseal(key, AAD, sealed);
        } catch (error) {
            expect((error as PrivateCryptoError).code).toBe("authentication-failed");
            expect((error as Error).message).toContain("stops here");
        }
    });

    it("refuses a payload whose tag was altered", () => {
        const key = generateKey();
        const sealed = seal(key, AAD, PLAINTEXT);
        // The tag sits after the magic, version, aad length and IV.
        flipBit(sealed, HEADER_BYTES + IV_BYTES, 0xff);

        expect(() => unseal(key, AAD, sealed)).toThrow(/failed its authentication check/);
    });

    it("refuses a payload sealed with a different key", () => {
        const sealed = seal(generateKey(), AAD, PLAINTEXT);

        expect(() => unseal(generateKey(), AAD, sealed)).toThrow(/failed its authentication check/);
    });

    it("refuses a genuine part that is being passed off as a different one", () => {
        // This is the reordering and replay case: the bytes are real, they were sealed
        // with the right key, and they are simply not the part the caller asked for.
        const key = generateKey();
        const sealed = seal(key, "…|part|3|11", PLAINTEXT);

        expect(() => unseal(key, "…|part|7|11", sealed)).toThrow(/but/);
        try {
            unseal(key, "…|part|7|11", sealed);
        } catch (error) {
            expect((error as PrivateCryptoError).code).toBe("unexpected-header");
        }
    });

    it("refuses a header rewritten to match altered expectations", () => {
        const key = generateKey();
        const sealed = seal(key, "…|part|3|11", PLAINTEXT);

        // Rewrite the stored associated data in place so it *looks* like part 7. The
        // header is authenticated, so this breaks the tag rather than fooling anybody.
        sealed.write("…|part|7|11", AAD_AT, "utf8");

        expect(() => unseal(key, "…|part|7|11", sealed)).toThrow(/failed its authentication check/);
    });

    it("refuses something that is not a sealed payload at all", () => {
        const key = generateKey();
        // Long enough to get past the length check, so it is the magic that refuses it.
        // A zip downloaded into the wrong directory is a likelier mistake than a forgery.
        const notOurs = Buffer.concat([Buffer.from("PK", "latin1"), Buffer.alloc(200, 9)]);

        expect(() => unseal(key, AAD, notOurs)).toThrow(/not a sealed payload/);
    });

    it("refuses a truncated payload", () => {
        const key = generateKey();
        const sealed = seal(key, AAD, PLAINTEXT);

        expect(() => unseal(key, AAD, sealed.subarray(0, 12))).toThrow(/too short/);
        expect(() => unseal(key, AAD, sealed.subarray(0, sealed.length - 4))).toThrow(
            PrivateCryptoError,
        );
    });

    it("refuses a format version it does not understand", () => {
        const key = generateKey();
        const sealed = seal(key, AAD, PLAINTEXT);
        sealed.writeUInt8(99, MAGIC_BYTES);

        expect(() => unseal(key, AAD, sealed)).toThrow(/format version 99/);
    });
});
