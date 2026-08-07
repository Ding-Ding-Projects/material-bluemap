/**
 * Mojang download consent.
 *
 * BlueMap textures a map from the real Minecraft client jar, so it cannot render
 * anything until the person running it accepts Mojang's EULA. Upstream expresses
 * that as `accept-download` in `core.conf`, defaulting to false.
 *
 * This module makes the decision **once**. After it is accepted the answer is
 * persisted and never asked again: not on the next render, not on the next launch,
 * not after an update. Re-asking a question somebody has already answered is
 * nagging, and it trains people to click through consent screens without reading
 * them, which defeats the point of having one.
 *
 * What this does NOT do is weaken the gate in the engine. `MinecraftVersion.load`
 * still takes `allowDownload` as a required parameter with no default, so no code
 * path can download a Mojang jar without being handed an explicit answer. This
 * module is only where that answer is remembered.
 */

import { app } from "electron";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** The document being accepted. Stored so a change of terms is detectable. */
export const MOJANG_EULA_URL = "https://account.mojang.com/documents/minecraft_eula";

/** Bumped only if what the user is agreeing to materially changes. */
const CONSENT_TERMS_VERSION = 1;

export interface ConsentRecord {
    readonly accepted: boolean;
    /** ISO-8601 with offset, so "when did I agree to this" has a real answer. */
    readonly acceptedAt: string | null;
    /** The document that was accepted, recorded rather than assumed. */
    readonly documentUrl: string;
    readonly termsVersion: number;
    /** App version at the time, which makes a support question answerable. */
    readonly appVersion: string | null;
}

const UNACCEPTED: ConsentRecord = {
    accepted: false,
    acceptedAt: null,
    documentUrl: MOJANG_EULA_URL,
    termsVersion: CONSENT_TERMS_VERSION,
    appVersion: null,
};

function consentFile(): string {
    return join(app.getPath("userData"), "consent.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * Reads the stored decision.
 *
 * A missing, unreadable or malformed file means "not accepted". It never means
 * "accepted", because the failure mode of guessing wrong in that direction is
 * downloading copyrighted assets on somebody's behalf without their agreement.
 */
export function readConsent(): ConsentRecord {
    let raw: string;
    try {
        raw = readFileSync(consentFile(), "utf8");
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

    // Consent is to a specific document. If the terms have been revised the old
    // answer does not carry over, and this is the one case where asking again is
    // correct rather than nagging.
    if (parsed.termsVersion !== CONSENT_TERMS_VERSION) return UNACCEPTED;
    if (parsed.documentUrl !== MOJANG_EULA_URL) return UNACCEPTED;

    return {
        accepted: true,
        acceptedAt: typeof parsed.acceptedAt === "string" ? parsed.acceptedAt : null,
        documentUrl: MOJANG_EULA_URL,
        termsVersion: CONSENT_TERMS_VERSION,
        appVersion: typeof parsed.appVersion === "string" ? parsed.appVersion : null,
    };
}

/**
 * Environment opt-in, for machines whose operator has already decided.
 *
 * Set `WORLDLENS_ACCEPT_DOWNLOAD=1` and nothing ever asks: not first run,
 * not a render, not after a reinstall. This is for a developer machine, a CI
 * runner, or a server someone administers, where the person setting the variable
 * is the same person the acceptance belongs to.
 *
 * It is deliberately an environment variable and not a build-time default. A
 * shipped installer that pre-accepted on behalf of whoever runs it would be
 * declaring, in their name, that they accepted a licence they were never shown.
 * Upstream defaults `accept-download` to false for exactly that reason, and the
 * decision is not ours to make for a stranger. Setting the variable is a person
 * making it for themselves.
 */
export function acceptedViaEnvironment(): boolean {
    const raw =
        process.env.WORLDLENS_ACCEPT_DOWNLOAD ??
        process.env.MATERIAL_BLUEMAP_ACCEPT_DOWNLOAD;
    if (raw === undefined) return false;
    const value = raw.trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes";
}

/** True once the person has agreed. This is the only question the app should ask. */
export function hasAcceptedDownload(): boolean {
    return acceptedViaEnvironment() || readConsent().accepted;
}

function write(record: ConsentRecord): ConsentRecord {
    const target = consentFile();
    mkdirSync(dirname(target), { recursive: true });
    // Written to a staging file and renamed, so a crash mid-write cannot leave a
    // half-written file that reads as a different answer than the one given.
    const staging = `${target}.writing`;
    writeFileSync(staging, `${JSON.stringify(record, null, 4)}\n`, "utf8");
    renameSync(staging, target);
    return record;
}

/**
 * Records acceptance. Idempotent: calling it again keeps the original timestamp,
 * because the interesting fact is when the person first agreed.
 */
export function acceptDownload(): ConsentRecord {
    const existing = readConsent();
    if (existing.accepted) return existing;

    return write({
        accepted: true,
        acceptedAt: new Date().toISOString(),
        documentUrl: MOJANG_EULA_URL,
        termsVersion: CONSENT_TERMS_VERSION,
        appVersion: app.getVersion(),
    });
}

/**
 * Withdraws consent.
 *
 * Kept because a decision that cannot be reversed is not really a decision. It is
 * reachable from settings, and is never triggered by the app itself.
 */
export function revokeDownloadConsent(): ConsentRecord {
    return write(UNACCEPTED);
}

/* -------------------------------------------------------------------------- */
/* First run                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Where the consent question is asked: once, at first launch, before anybody is
 * in the middle of anything.
 *
 * The alternative is asking when a render is first attempted, which is precisely
 * the wrong moment. The person has already chosen a world, configured a map and
 * pressed a button, and a legal document appearing on top of that reads as an
 * obstacle to get past rather than a decision to make. Asking up front means it
 * is answered while it is the only thing on screen, and never interrupts again.
 *
 * The flag is set when the first-run flow is **completed**, whichever way it was
 * answered. Declining is a real answer and is remembered too, so someone who says
 * no is not asked again at every launch until they give in. If they later want to
 * render, the app says what is missing and points at the setting.
 */
export interface FirstRunState {
    readonly completed: boolean;
    readonly completedAt: string | null;
}

function firstRunFile(): string {
    return join(app.getPath("userData"), "first-run.json");
}

export function readFirstRun(): FirstRunState {
    try {
        const parsed: unknown = JSON.parse(readFileSync(firstRunFile(), "utf8"));
        if (isRecord(parsed) && parsed.completed === true) {
            return {
                completed: true,
                completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : null,
            };
        }
    } catch {
        // Unreadable or absent means it has not run. Showing a setup screen one
        // extra time is a far smaller harm than silently skipping consent.
    }
    return { completed: false, completedAt: null };
}

/**
 * True only on the very first launch, so the shell knows to show setup.
 *
 * An operator who has already answered through the environment is never shown the
 * setup flow at all: there is nothing left to ask them, and showing a consent
 * screen to somebody who has already consented is the nagging this is meant to
 * avoid.
 */
export function needsFirstRun(): boolean {
    if (acceptedViaEnvironment()) return false;
    return !readFirstRun().completed;
}

export function completeFirstRun(): FirstRunState {
    const existing = readFirstRun();
    if (existing.completed) return existing;

    const state: FirstRunState = { completed: true, completedAt: new Date().toISOString() };
    const target = firstRunFile();
    mkdirSync(dirname(target), { recursive: true });
    const staging = `${target}.writing`;
    writeFileSync(staging, `${JSON.stringify(state, null, 4)}\n`, "utf8");
    renameSync(staging, target);
    return state;
}
