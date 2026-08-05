/**
 * Java download consent, in the shape `main/consent.ts` already uses for Mojang's EULA:
 * asked once, remembered forever, never asked again.
 *
 * Downloading a JDK is not the same kind of decision as accepting a licence, so this is a
 * separate small record rather than a second document folded into `consent.ts` - nobody is
 * agreeing to a document here, they are being told what will be fetched, from where, and
 * roughly how big, before it happens. But the shape that makes Mojang's consent work is
 * exactly right for this too: a plain JSON file under the app's own data directory, written
 * through a staging file and a rename so a crash mid-write cannot leave a half-written
 * answer, and a missing or unreadable file always reads as "not agreed" rather than
 * "agreed" - the safe direction, because the cost of guessing wrong here is starting an
 * unwanted download rather than skipping a wanted one.
 *
 * This module takes `dataDir` as a parameter rather than importing `app` from Electron, the
 * same rule the rest of `main/java/` follows so the whole directory keeps running, and
 * keeps being tested, with no Electron runtime at all.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { javaRoot } from "./installation.js";

/** Bumped only if what is being agreed to materially changes. */
const CONSENT_TERMS_VERSION = 1;

export interface JavaDownloadConsentRecord {
    readonly accepted: boolean;
    /** ISO-8601 with offset, so "when did I agree to this" has a real answer. */
    readonly acceptedAt: string | null;
    readonly termsVersion: number;
}

const UNACCEPTED: JavaDownloadConsentRecord = {
    accepted: false,
    acceptedAt: null,
    termsVersion: CONSENT_TERMS_VERSION,
};

/** `<userData>/java/download-consent.json`. */
export function javaConsentFile(dataDir: string): string {
    return join(javaRoot(dataDir), "download-consent.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * Reads the stored decision. A missing, unreadable or malformed file, or one written
 * against an older terms version, all read as "not accepted" - never as "accepted".
 */
export function readJavaDownloadConsent(dataDir: string): JavaDownloadConsentRecord {
    let raw: string;
    try {
        raw = readFileSync(javaConsentFile(dataDir), "utf8");
    } catch {
        return UNACCEPTED;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return UNACCEPTED;
    }
    if (!isRecord(parsed) || parsed.accepted !== true) return UNACCEPTED;
    if (parsed.termsVersion !== CONSENT_TERMS_VERSION) return UNACCEPTED;

    return {
        accepted: true,
        acceptedAt: typeof parsed.acceptedAt === "string" ? parsed.acceptedAt : null,
        termsVersion: CONSENT_TERMS_VERSION,
    };
}

function write(dataDir: string, record: JavaDownloadConsentRecord): JavaDownloadConsentRecord {
    const target = javaConsentFile(dataDir);
    mkdirSync(dirname(target), { recursive: true });
    const staging = `${target}.writing`;
    writeFileSync(staging, `${JSON.stringify(record, null, 4)}\n`, "utf8");
    renameSync(staging, target);
    return record;
}

/**
 * Records acceptance. Idempotent: calling it again keeps the original timestamp, because
 * the interesting fact is when the person first agreed.
 */
export function acceptJavaDownloadConsent(dataDir: string): JavaDownloadConsentRecord {
    const existing = readJavaDownloadConsent(dataDir);
    if (existing.accepted) return existing;
    return write(dataDir, {
        accepted: true,
        acceptedAt: new Date().toISOString(),
        termsVersion: CONSENT_TERMS_VERSION,
    });
}

/** Withdraws consent. Reachable from settings; never triggered by the app itself. */
export function revokeJavaDownloadConsent(dataDir: string): JavaDownloadConsentRecord {
    return write(dataDir, UNACCEPTED);
}
