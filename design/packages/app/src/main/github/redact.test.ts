/**
 * Tests for keeping credentials out of everything the app says.
 *
 * The pattern-based half is the interesting one. Redacting the secrets this process
 * happens to know is easy and insufficient: the token that most needs removing is often
 * one nobody registered - pasted into the wrong field, belonging to another tool, or
 * carried in an error raised by a library that was handed it once. So anything shaped
 * like a GitHub credential goes too, whether or not this code was told about it.
 */

import { describe, expect, it } from "vitest";
import { REDACTED, describeError, redactSecrets } from "./redact.js";

describe("redactSecrets", () => {
    it("removes a known secret everywhere it appears", () => {
        const secret = "a-very-long-secret-value";
        const text = `failed with ${secret} while retrying ${secret}`;

        expect(redactSecrets(text, [secret])).toBe(
            `failed with ${REDACTED} while retrying ${REDACTED}`,
        );
    });

    it("removes anything credential-shaped even when nobody said it was a secret", () => {
        const text = `Authorization: Bearer ghp_${"a".repeat(36)} rejected`;

        const redacted = redactSecrets(text, []);

        expect(redacted).not.toContain("ghp_");
        expect(redacted).toContain(REDACTED);
    });

    it("covers every prefix GitHub issues", () => {
        for (const prefix of ["ghp", "gho", "ghu", "ghs", "ghr"]) {
            const value = `${prefix}_${"b".repeat(36)}`;
            expect(redactSecrets(value, [])).toBe(REDACTED);
        }
        expect(redactSecrets(`github_pat_${"c".repeat(40)}`, [])).toBe(REDACTED);
    });

    it("leaves short strings alone rather than mangling the message", () => {
        // A "secret" this short is far more likely to be a word that appears in ordinary
        // text than a credential, and replacing it would hide what actually happened.
        expect(redactSecrets("could not open the file", ["file"])).toBe("could not open the file");
    });

    it("ignores nulls and undefined in the secret list", () => {
        expect(redactSecrets("nothing to do here", [null, undefined])).toBe("nothing to do here");
    });
});

describe("describeError", () => {
    it("uses an Error's message, redacted", () => {
        const token = `ghp_${"d".repeat(36)}`;
        const described = describeError(new Error(`refused: ${token}`), [token]);

        expect(described).toBe(`refused: ${REDACTED}`);
    });

    it("handles a thrown string and a thrown object", () => {
        expect(describeError("plain failure")).toBe("plain failure");
        expect(describeError({ code: "ENOTFOUND" })).toContain("ENOTFOUND");
    });

    it("does not fall over on something that cannot be stringified", () => {
        const circular: Record<string, unknown> = {};
        circular["self"] = circular;

        expect(() => describeError(circular)).not.toThrow();
    });
});
