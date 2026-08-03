/**
 * Tests for where the token lives between launches.
 *
 * The assertion that matters most is a negative one: that nothing ever writes the token
 * to disk in a form anybody can read. It is checked by looking at the bytes of the file
 * rather than by trusting the code path, because the failure being guarded against is
 * precisely a code path that looks right.
 *
 * The second is the refusal. On a machine with no credential store it would be very easy
 * to fall back to a plain file so that "sign-in works everywhere", and that fallback
 * would be indistinguishable to the person from real protection. So the store refuses,
 * says why, and writes nothing at all - which is what these tests hold it to.
 *
 * Electron is never imported here. `safeStorage` arrives as a parameter, so the store is
 * exercised with an encryption that can be made to be unavailable, to throw, and to fail
 * to decrypt, none of which is reachable through the real one.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TokenStore } from "./storage.js";
import type { SafeStorageLike, StoredCredential } from "./storage.js";

const TOKEN = `ghu_${"q".repeat(36)}`;
const REFRESH_TOKEN = `ghr_${"r".repeat(36)}`;

/**
 * A stand-in for the platform credential store.
 *
 * The "encryption" is a reversible transform, which is exactly the point: it is
 * obviously not protection, so a test that passes because the token happened to survive
 * in readable form would fail loudly here instead.
 */
function fakeSafeStorage(
    options: { available?: boolean; encryptThrows?: boolean; decryptThrows?: boolean } = {},
): SafeStorageLike {
    return {
        isEncryptionAvailable: () => options.available ?? true,
        encryptString: (plainText) => {
            if (options.encryptThrows === true) throw new Error("no keyring");
            return Buffer.from(`enc:${Buffer.from(plainText, "utf8").toString("base64")}`, "utf8");
        },
        decryptString: (encrypted) => {
            if (options.decryptThrows === true) throw new Error("wrong key");
            const text = encrypted.toString("utf8");
            if (!text.startsWith("enc:")) throw new Error("not our ciphertext");
            return Buffer.from(text.slice(4), "base64").toString("utf8");
        },
    };
}

const META: Omit<StoredCredential, "storedAt"> = {
    kind: "github-app",
    login: "octocat",
    userId: 583231,
    scopes: [],
    scopesReported: false,
    clientId: "Iv23liPCatYTLpipKJYS",
    expiresAt: "2026-08-03T20:00:00.000Z",
    refreshTokenExpiresAt: "2027-02-03T20:00:00.000Z",
};

let directory: string;
let file: string;

beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "material-bluemap-github-"));
    file = join(directory, "github-credential.json");
});

afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
});

describe("TokenStore", () => {
    it("round-trips both secrets and the metadata", () => {
        const store = new TokenStore({ file, safeStorage: fakeSafeStorage() });

        const saved = store.save({ token: TOKEN, refreshToken: REFRESH_TOKEN }, META);
        expect(saved.ok).toBe(true);

        const read = store.read();
        expect(read.ok).toBe(true);
        if (!read.ok) return;
        expect(read.secret.token).toBe(TOKEN);
        expect(read.secret.refreshToken).toBe(REFRESH_TOKEN);
        expect(read.record.login).toBe("octocat");
        expect(read.record.kind).toBe("github-app");
        expect(read.record.expiresAt).toBe("2026-08-03T20:00:00.000Z");
    });

    it("never writes either secret in a readable form", () => {
        const store = new TokenStore({ file, safeStorage: fakeSafeStorage() });
        store.save({ token: TOKEN, refreshToken: REFRESH_TOKEN }, META);

        const onDisk = readFileSync(file, "utf8");
        expect(onDisk).not.toContain(TOKEN);
        expect(onDisk).not.toContain(REFRESH_TOKEN);
        // The account name is deliberately in the clear: it is not a credential, and
        // keeping it readable is what lets the app say who is signed in at startup
        // without decrypting anything.
        expect(onDisk).toContain("octocat");
    });

    it("refuses to persist at all when there is no credential store", () => {
        const store = new TokenStore({ file, safeStorage: fakeSafeStorage({ available: false }) });

        const saved = store.save({ token: TOKEN, refreshToken: null }, META);

        expect(saved.ok).toBe(false);
        if (saved.ok) return;
        expect(saved.code).toBe("encryption-unavailable");
        expect(saved.message).toContain("nowhere safe");
        // Not "wrote it anyway, differently". Nothing was written.
        expect(existsSync(file)).toBe(false);
        expect(store.metadata()).toBeNull();
    });

    it("reports an encryption that fails without putting the token in the message", () => {
        const store = new TokenStore({
            file,
            safeStorage: fakeSafeStorage({ encryptThrows: true }),
        });

        const saved = store.save({ token: TOKEN, refreshToken: null }, META);

        expect(saved.ok).toBe(false);
        if (saved.ok) return;
        expect(saved.code).toBe("write-failed");
        expect(saved.message).not.toContain(TOKEN);
        expect(existsSync(file)).toBe(false);
    });

    it("leaves no staging file behind", () => {
        const store = new TokenStore({ file, safeStorage: fakeSafeStorage() });
        store.save({ token: TOKEN, refreshToken: null }, META);

        expect(existsSync(`${file}.writing`)).toBe(false);
    });

    it("reads the account without decrypting anything", () => {
        const store = new TokenStore({
            file,
            safeStorage: fakeSafeStorage(),
        });
        store.save({ token: TOKEN, refreshToken: REFRESH_TOKEN }, META);

        // A store whose decryption always throws still answers this, which is what makes
        // "signed in as octocat" free at startup.
        const readOnly = new TokenStore({
            file,
            safeStorage: fakeSafeStorage({ decryptThrows: true }),
        });
        expect(readOnly.metadata()?.login).toBe("octocat");
        expect(readOnly.read().ok).toBe(false);
    });

    it("treats an unreadable file as nobody being signed in", () => {
        writeFileSync(file, "{ this is not json", "utf8");
        const store = new TokenStore({ file, safeStorage: fakeSafeStorage() });

        expect(store.metadata()).toBeNull();
        const read = store.read();
        expect(read.ok).toBe(false);
        if (read.ok) return;
        expect(read.code).toBe("absent");
    });

    it("reports a credential it cannot decrypt as one to replace", () => {
        const store = new TokenStore({ file, safeStorage: fakeSafeStorage() });
        store.save({ token: TOKEN, refreshToken: null }, META);

        const other = new TokenStore({
            file,
            safeStorage: fakeSafeStorage({ decryptThrows: true }),
        });
        const read = other.read();

        expect(read.ok).toBe(false);
        if (read.ok) return;
        expect(read.code).toBe("decrypt-failed");
        expect(read.message).toContain("Sign in again");
    });

    it("still reads a credential written before refresh tokens existed", () => {
        // Version 1 encrypted the bare token rather than a JSON blob. Somebody updating
        // the app should not be silently signed out by the format change.
        const safeStorage = fakeSafeStorage();
        writeFileSync(
            file,
            JSON.stringify({
                version: 2,
                kind: "oauth-app",
                login: "octocat",
                userId: 1,
                scopes: ["public_repo"],
                scopesReported: true,
                storedAt: "2026-01-01T00:00:00.000Z",
                clientId: "Ov1",
                ciphertext: safeStorage.encryptString(TOKEN).toString("base64"),
            }),
            "utf8",
        );

        const read = new TokenStore({ file, safeStorage }).read();

        expect(read.ok).toBe(true);
        if (!read.ok) return;
        expect(read.secret.token).toBe(TOKEN);
        expect(read.secret.refreshToken).toBeNull();
    });

    it("clears what it wrote", () => {
        const store = new TokenStore({ file, safeStorage: fakeSafeStorage() });
        store.save({ token: TOKEN, refreshToken: null }, META);

        expect(store.clear()).toBe(true);
        expect(existsSync(file)).toBe(false);
        expect(store.metadata()).toBeNull();
        // Clearing again is not an error, it is just nothing to do.
        expect(store.clear()).toBe(false);
    });
});
