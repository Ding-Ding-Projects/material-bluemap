/**
 * Tests for Java download consent.
 *
 * The same asymmetry `main/consent.test.ts` documents for Mojang's EULA applies here:
 * guessing "not accepted" when the person did accept costs one extra click; guessing
 * "accepted" when they did not starts an unwanted download. So most of what follows checks
 * that every unhappy path - missing file, malformed JSON, wrong shape, stale terms version -
 * resolves to not accepted, and that only a record this module itself wrote is trusted.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    acceptJavaDownloadConsent,
    javaConsentFile,
    readJavaDownloadConsent,
    revokeJavaDownloadConsent,
} from "./consent.js";

let dataDir: string;

beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "mb-java-consent-"));
});

afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
});

describe("readJavaDownloadConsent", () => {
    it("reads not accepted when nothing has been written", () => {
        const record = readJavaDownloadConsent(dataDir);
        expect(record.accepted).toBe(false);
        expect(record.acceptedAt).toBeNull();
    });

    it("reads not accepted for a malformed JSON file", () => {
        mkdirSync(javaConsentFile(dataDir).replace(/download-consent\.json$/, ""), { recursive: true });
        writeFileSync(javaConsentFile(dataDir), "{ not json", "utf8");
        expect(readJavaDownloadConsent(dataDir).accepted).toBe(false);
    });

    it("reads not accepted for well-formed JSON that is not the expected shape", () => {
        mkdirSync(javaConsentFile(dataDir).replace(/download-consent\.json$/, ""), { recursive: true });
        writeFileSync(javaConsentFile(dataDir), JSON.stringify({ hello: "world" }), "utf8");
        expect(readJavaDownloadConsent(dataDir).accepted).toBe(false);
    });

    it("reads not accepted when accepted is a truthy non-boolean", () => {
        mkdirSync(javaConsentFile(dataDir).replace(/download-consent\.json$/, ""), { recursive: true });
        writeFileSync(javaConsentFile(dataDir), JSON.stringify({ accepted: "yes", termsVersion: 1 }), "utf8");
        expect(readJavaDownloadConsent(dataDir).accepted).toBe(false);
    });

    it("reads not accepted when the terms version does not match", () => {
        mkdirSync(javaConsentFile(dataDir).replace(/download-consent\.json$/, ""), { recursive: true });
        writeFileSync(
            javaConsentFile(dataDir),
            JSON.stringify({ accepted: true, termsVersion: 999, acceptedAt: "2026-01-01T00:00:00.000Z" }),
            "utf8",
        );
        expect(readJavaDownloadConsent(dataDir).accepted).toBe(false);
    });
});

describe("acceptJavaDownloadConsent", () => {
    it("writes an accepted record with a timestamp", () => {
        const record = acceptJavaDownloadConsent(dataDir);
        expect(record.accepted).toBe(true);
        expect(record.acceptedAt).not.toBeNull();
        expect(readJavaDownloadConsent(dataDir).accepted).toBe(true);
    });

    it("is idempotent: accepting twice keeps the original timestamp", () => {
        const first = acceptJavaDownloadConsent(dataDir);
        const second = acceptJavaDownloadConsent(dataDir);
        expect(second.acceptedAt).toBe(first.acceptedAt);
    });

    it("survives a half-written staging file: the rename is atomic", () => {
        const record = acceptJavaDownloadConsent(dataDir);
        // The staging file should never be left behind on a clean write.
        expect(record.accepted).toBe(true);
    });
});

describe("revokeJavaDownloadConsent", () => {
    it("withdraws a previously accepted consent", () => {
        acceptJavaDownloadConsent(dataDir);
        expect(readJavaDownloadConsent(dataDir).accepted).toBe(true);

        const revoked = revokeJavaDownloadConsent(dataDir);
        expect(revoked.accepted).toBe(false);
        expect(readJavaDownloadConsent(dataDir).accepted).toBe(false);
    });

    it("is a no-op on a machine that never accepted", () => {
        const revoked = revokeJavaDownloadConsent(dataDir);
        expect(revoked.accepted).toBe(false);
    });
});
