/**
 * Where the token lives between launches.
 *
 * The only acceptable answer on a desktop machine is the operating system's own
 * credential store: DPAPI on Windows, the Keychain on macOS, libsecret on Linux.
 * Electron's `safeStorage` is the one interface to all three, so that is what this uses,
 * and the ciphertext is what lands on disk.
 *
 * The rule that matters most here is the refusal. `safeStorage.isEncryptionAvailable()`
 * returns false on a Linux desktop with no secret service running, and it would be very
 * easy - and completely wrong - to fall back to writing the token in a plain file so
 * that "sign-in works everywhere". A plaintext token in a predictable path under the
 * user profile is readable by every process running as that user, backed up by whatever
 * syncs that folder, and indistinguishable to the person from a token that is properly
 * protected. So this refuses, says why, and lets the session carry on in memory for as
 * long as the app is open.
 *
 * The write itself is staged and renamed, the same shape `consent.ts` uses, so a crash
 * halfway through cannot leave a truncated file that decrypts to nothing.
 */

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { TokenSource } from "./config.js";

/**
 * The part of Electron's `safeStorage` this module uses.
 *
 * Declared rather than imported so the store can be tested without Electron, and so the
 * one place that depends on Electron stays `ipc.ts`.
 */
export interface SafeStorageLike {
    isEncryptionAvailable(): boolean;
    encryptString(plainText: string): Buffer;
    decryptString(encrypted: Buffer): string;
}

/** Bumped if the envelope's shape changes in a way an older reader would misread. */
const CREDENTIAL_FORMAT_VERSION = 2;

export type CredentialKind = TokenSource;

/**
 * The secret half, all of which is encrypted together.
 *
 * The refresh token is as sensitive as the access token - it is what mints new ones - so
 * it goes inside the same encrypted blob rather than beside it. Encrypting one and not
 * the other would be the kind of half-measure that reads as protection and is not.
 */
export interface StoredSecret {
    readonly token: string;
    /** Null for a token that does not expire, which is the normal OAuth App case. */
    readonly refreshToken: string | null;
}

/**
 * What is stored beside the ciphertext.
 *
 * The account name, the scope list and the two expiry times are not credentials. Keeping
 * them in the clear means the interface can say "signed in as someone, until this
 * evening" at startup without decrypting anything, which on macOS is the difference
 * between a silent launch and a Keychain prompt nobody asked for. Neither token is here.
 */
export interface StoredCredential {
    readonly kind: CredentialKind;
    readonly login: string;
    readonly userId: number | null;
    readonly scopes: readonly string[];
    readonly scopesReported: boolean;
    /** ISO-8601, so "since when" has a real answer. */
    readonly storedAt: string;
    /** The application the token was issued to, for the revocation link. Null for a PAT. */
    readonly clientId: string | null;
    /**
     * When the access token dies, or null when it does not.
     *
     * Null is a fact rather than a gap: an OAuth App token has no expiry, and recording
     * one would make the app refresh something that has no refresh token.
     */
    readonly expiresAt: string | null;
    /** When the refresh token itself dies, after which only a new sign-in helps. */
    readonly refreshTokenExpiresAt: string | null;
}

export type SaveResult =
    | { readonly ok: true; readonly record: StoredCredential }
    | {
          readonly ok: false;
          readonly code: "encryption-unavailable" | "write-failed";
          readonly message: string;
      };

export type ReadResult =
    | { readonly ok: true; readonly secret: StoredSecret; readonly record: StoredCredential }
    | {
          readonly ok: false;
          readonly code: "absent" | "unreadable" | "encryption-unavailable" | "decrypt-failed";
          readonly message: string;
      };

export const ENCRYPTION_UNAVAILABLE_MESSAGE =
    "This computer has no working credential store, so there is nowhere safe to keep a" +
    " GitHub token. Signing in still works for as long as the app is open, but you will" +
    " have to sign in again next time. On Linux this usually means no secret service is" +
    " running: installing gnome-keyring or kwallet fixes it.";

export interface TokenStoreOptions {
    /** Absolute path of the credential file. */
    readonly file: string;
    readonly safeStorage: SafeStorageLike;
}

export class TokenStore {
    readonly #file: string;
    readonly #safeStorage: SafeStorageLike;

    constructor(options: TokenStoreOptions) {
        this.#file = options.file;
        this.#safeStorage = options.safeStorage;
    }

    /** True when the operating system can actually protect a secret for this user. */
    encryptionAvailable(): boolean {
        try {
            return this.#safeStorage.isEncryptionAvailable();
        } catch {
            // A credential store that throws on the question is one that cannot be relied
            // on for the answer, which is the same as not having one.
            return false;
        }
    }

    /**
     * Writes the token, or refuses and says why.
     *
     * There is deliberately no `force` parameter. A caller that could ask for the token
     * to be written in the clear is a caller that eventually does.
     */
    save(secret: StoredSecret, meta: Omit<StoredCredential, "storedAt">): SaveResult {
        if (!this.encryptionAvailable()) {
            return {
                ok: false,
                code: "encryption-unavailable",
                message: ENCRYPTION_UNAVAILABLE_MESSAGE,
            };
        }

        let ciphertext: Buffer;
        try {
            // Both secrets in one blob, so there is exactly one thing to protect and
            // exactly one thing to fail to protect.
            ciphertext = this.#safeStorage.encryptString(
                JSON.stringify({ token: secret.token, refreshToken: secret.refreshToken }),
            );
        } catch {
            return {
                ok: false,
                code: "write-failed",
                // Deliberately not the underlying error: it is the one error message in
                // this file with the plaintext anywhere near it.
                message:
                    "The credential store refused to encrypt the token, so nothing was" +
                    " written. You are signed in for as long as this app is open.",
            };
        }

        const record: StoredCredential = { ...meta, storedAt: new Date().toISOString() };
        const envelope = {
            version: CREDENTIAL_FORMAT_VERSION,
            ...record,
            ciphertext: ciphertext.toString("base64"),
        };

        try {
            mkdirSync(dirname(this.#file), { recursive: true });
            const staging = `${this.#file}.writing`;
            // 0o600 where the platform honours it. Windows ignores the mode and inherits
            // the ACL of the user profile directory, which is already user-only.
            writeFileSync(staging, `${JSON.stringify(envelope, null, 4)}\n`, {
                encoding: "utf8",
                mode: 0o600,
            });
            renameSync(staging, this.#file);
        } catch {
            return {
                ok: false,
                code: "write-failed",
                message:
                    "The token could not be written to disk, so you will have to sign in" +
                    " again next time this app starts.",
            };
        }

        return { ok: true, record };
    }

    /**
     * The stored account, without decrypting anything.
     *
     * Used for "who is signed in" at startup. Null when there is nothing stored or the
     * file cannot be understood; a broken file is treated as no file, because the only
     * alternative is refusing to start.
     */
    metadata(): StoredCredential | null {
        const envelope = this.#readEnvelope();
        return envelope === null ? null : envelope.record;
    }

    /** The token itself. Decrypts, so it is called when something is about to be done. */
    read(): ReadResult {
        const envelope = this.#readEnvelope();
        if (envelope === null) {
            return { ok: false, code: "absent", message: "Nobody is signed in on this computer." };
        }

        if (!this.encryptionAvailable()) {
            return {
                ok: false,
                code: "encryption-unavailable",
                message: ENCRYPTION_UNAVAILABLE_MESSAGE,
            };
        }

        let plaintext: string;
        try {
            plaintext = this.#safeStorage.decryptString(Buffer.from(envelope.ciphertext, "base64"));
        } catch {
            return {
                ok: false,
                code: "decrypt-failed",
                message:
                    "The stored GitHub token could not be decrypted on this computer. This" +
                    " happens when the credential store has been reset, or the file was" +
                    " copied from another machine. Sign in again to replace it.",
            };
        }

        const secret = parseSecret(plaintext);
        if (secret === null) {
            return {
                ok: false,
                code: "unreadable",
                message: "The stored GitHub token was empty. Sign in again to replace it.",
            };
        }

        return { ok: true, secret, record: envelope.record };
    }

    /** Removes the stored credential. True when there was one to remove. */
    clear(): boolean {
        const existed = this.metadata() !== null;
        try {
            rmSync(this.#file, { force: true });
        } catch {
            return false;
        }
        try {
            rmSync(`${this.#file}.writing`, { force: true });
        } catch {
            // A leftover staging file is untidy, not dangerous: it is never read.
        }
        return existed;
    }

    #readEnvelope(): { record: StoredCredential; ciphertext: string } | null {
        let raw: string;
        try {
            raw = readFileSync(this.#file, "utf8");
        } catch {
            return null;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return null;
        }
        if (typeof parsed !== "object" || parsed === null) return null;

        const envelope = parsed as Record<string, unknown>;
        if (envelope["version"] !== CREDENTIAL_FORMAT_VERSION) return null;

        const ciphertext = envelope["ciphertext"];
        const login = envelope["login"];
        const kind = envelope["kind"];
        if (typeof ciphertext !== "string" || ciphertext === "") return null;
        if (typeof login !== "string" || login === "") return null;
        if (kind !== "github-app" && kind !== "oauth-app" && kind !== "personal-access-token")
            return null;

        const scopes = Array.isArray(envelope["scopes"])
            ? envelope["scopes"].filter((scope): scope is string => typeof scope === "string")
            : [];

        return {
            ciphertext,
            record: {
                kind,
                login,
                userId: typeof envelope["userId"] === "number" ? envelope["userId"] : null,
                scopes,
                scopesReported: envelope["scopesReported"] === true,
                storedAt:
                    typeof envelope["storedAt"] === "string"
                        ? envelope["storedAt"]
                        : new Date(0).toISOString(),
                clientId: typeof envelope["clientId"] === "string" ? envelope["clientId"] : null,
                expiresAt: typeof envelope["expiresAt"] === "string" ? envelope["expiresAt"] : null,
                refreshTokenExpiresAt:
                    typeof envelope["refreshTokenExpiresAt"] === "string"
                        ? envelope["refreshTokenExpiresAt"]
                        : null,
            },
        };
    }
}

/**
 * Reads the decrypted blob.
 *
 * Version 1 of this file encrypted the bare token, so a plaintext that is not JSON is
 * read as exactly that rather than rejected. It costs three lines and saves somebody
 * being silently signed out by an update.
 */
function parseSecret(plaintext: string): StoredSecret | null {
    if (plaintext === "") return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(plaintext);
    } catch {
        return { token: plaintext, refreshToken: null };
    }

    if (typeof parsed !== "object" || parsed === null) return null;
    const blob = parsed as Record<string, unknown>;
    const token = blob["token"];
    if (typeof token !== "string" || token === "") return null;

    return {
        token,
        refreshToken:
            typeof blob["refreshToken"] === "string" && blob["refreshToken"] !== ""
                ? blob["refreshToken"]
                : null,
    };
}
