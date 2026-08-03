/**
 * Tests for the Mojang download consent record.
 *
 * The thing being tested here is not really a JSON file. It is the answer to "did this
 * person agree to download Minecraft's client jar", and the two ways of getting it
 * wrong are not equally bad:
 *
 * - guessing **not accepted** when the person did accept costs one extra visit to a
 *   settings row;
 * - guessing **accepted** when they did not, or when the file is corrupt, unreadable or
 *   written by a different version of the app, downloads copyrighted assets from Mojang
 *   in somebody's name, under a licence they were never shown.
 *
 * So most of what follows is the same assertion from different angles: every unhappy
 * path resolves to not accepted, and nothing but a well-formed record that names the
 * exact document and terms version in force is allowed to mean yes. A test suite that
 * only checked the happy path would pass just as happily against a `readConsent` that
 * returned `{ accepted: true }` whenever `JSON.parse` threw.
 *
 * `electron` is mocked because `consent.ts` asks it for `userData` and the app version.
 * Each test gets its own temporary directory, so the records never see each other.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The mock's state. Hoisted, because `vi.mock` is hoisted above the imports and its
 * factory would otherwise close over a binding that does not exist yet.
 */
const electron = vi.hoisted(() => ({ userData: "", version: "0.1.0" }));

vi.mock("electron", () => ({
    app: {
        getPath: (name: string): string => {
            // Nothing in this module asks for any other path. If that changes, a test
            // that silently returned the same directory would hide it.
            if (name !== "userData") throw new Error(`unexpected app.getPath(${name})`);
            return electron.userData;
        },
        getVersion: (): string => electron.version,
    },
}));

import {
    MOJANG_EULA_URL,
    acceptDownload,
    acceptedViaEnvironment,
    completeFirstRun,
    hasAcceptedDownload,
    needsFirstRun,
    readConsent,
    readFirstRun,
    revokeDownloadConsent,
} from "./consent.js";

const ENV_KEY = "MATERIAL_BLUEMAP_ACCEPT_DOWNLOAD";

/** The terms version currently in force. Not exported, so it is restated here. */
const CURRENT_TERMS_VERSION = 1;

let root = "";
let savedEnv: string | undefined;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-consent-"));
    electron.userData = root;
    electron.version = "0.1.0";
    savedEnv = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
});

afterEach(async () => {
    vi.useRealTimers();
    if (savedEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = savedEnv;
    await rm(root, { recursive: true, force: true });
});

const consentPath = (): string => join(root, "consent.json");
const firstRunPath = (): string => join(root, "first-run.json");

/** Puts arbitrary bytes where the record lives, including bytes that are not JSON. */
function writeRaw(path: string, text: string): void {
    mkdirSync(root, { recursive: true });
    writeFileSync(path, text, "utf8");
}

function storedConsent(): Record<string, unknown> {
    return JSON.parse(readFileSync(consentPath(), "utf8")) as Record<string, unknown>;
}

/** A well-formed accepted record, which individual tests then break in one place. */
function validRecord(): Record<string, unknown> {
    return {
        accepted: true,
        acceptedAt: "2026-08-03T10:00:00.000Z",
        documentUrl: MOJANG_EULA_URL,
        termsVersion: CURRENT_TERMS_VERSION,
        appVersion: "0.1.0",
    };
}

/** The same record with one key absent, for the "an old build never wrote it" cases. */
function without(key: string): Record<string, unknown> {
    const record = validRecord();
    delete record[key];
    return record;
}

/* -------------------------------------------------------------------------- */
/* Nothing stored                                                             */
/* -------------------------------------------------------------------------- */

describe("readConsent with nothing stored", () => {
    it("reads a fresh install as not accepted", () => {
        expect(existsSync(consentPath())).toBe(false);
        expect(readConsent()).toEqual({
            accepted: false,
            acceptedAt: null,
            documentUrl: MOJANG_EULA_URL,
            termsVersion: CURRENT_TERMS_VERSION,
            appVersion: null,
        });
        expect(hasAcceptedDownload()).toBe(false);
    });

    it("reads as not accepted when the whole userData directory is missing", () => {
        // The first launch of a freshly installed app, before anything has written
        // anything. `readFileSync` throws ENOENT on the directory rather than the file,
        // which is a different error and must land in the same place.
        electron.userData = join(root, "never", "created");
        expect(readConsent().accepted).toBe(false);
        expect(hasAcceptedDownload()).toBe(false);
    });

    it("does not create the file merely by being asked", () => {
        readConsent();
        readConsent();
        expect(existsSync(consentPath())).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/* Damaged, hostile or foreign records                                        */
/* -------------------------------------------------------------------------- */

describe("readConsent with a file it cannot trust", () => {
    /**
     * Every one of these is a file that exists and does not prove agreement. The
     * assertion is always the same, and the direction is the point: an unreadable
     * record must never be resolved in favour of downloading.
     */
    const untrustworthy: readonly (readonly [string, string])[] = [
        ["empty", ""],
        ["whitespace", "   \n"],
        ["not JSON at all", "accepted = true"],
        ["truncated mid-write", '{\n    "accepted": true,\n    "acceptedAt": "2026-'],
        ["JSON true rather than an object", "true"],
        ["JSON null", "null"],
        ["a number", "1"],
        ["a string that says yes", '"accepted"'],
        ["an array", "[{ \"accepted\": true }]"],
        ["an object with no accepted key", '{ "acceptedAt": "2026-08-03T10:00:00.000Z" }'],
        ["accepted as the string true", '{ "accepted": "true" }'],
        ["accepted as 1", '{ "accepted": 1 }'],
        ["accepted null", '{ "accepted": null }'],
        ["accepted false", '{ "accepted": false }'],
    ];

    for (const [name, text] of untrustworthy) {
        it(`treats ${name} as not accepted rather than throwing`, () => {
            writeRaw(consentPath(), text);
            expect(() => readConsent()).not.toThrow();
            expect(readConsent().accepted).toBe(false);
            expect(hasAcceptedDownload()).toBe(false);
        });
    }

    it("treats an unreadable path as not accepted", () => {
        // A directory where the file should be. `readFileSync` throws EISDIR, which is
        // neither a missing file nor a parse error, and still has to mean no. The same
        // shape covers a permissions failure, which is harder to arrange portably.
        mkdirSync(consentPath(), { recursive: true });
        expect(() => readConsent()).not.toThrow();
        expect(readConsent().accepted).toBe(false);
    });

    it("ignores a staging file left behind by a crash mid-write", () => {
        // `write()` stages to `<file>.writing` and renames. A crash between the two
        // leaves the staging file and no record, and the staging file is not the answer.
        writeRaw(`${consentPath()}.writing`, JSON.stringify(validRecord()));
        expect(readConsent().accepted).toBe(false);
    });

    it("does not overwrite a file it could not read", () => {
        // Reading is not a repair. Someone diagnosing a support question needs the bytes
        // that are actually on disk, not the ones a reader tidied away.
        writeRaw(consentPath(), "accepted = true");
        readConsent();
        expect(readFileSync(consentPath(), "utf8")).toBe("accepted = true");
    });
});

describe("readConsent when the terms have moved", () => {
    it("resets consent when the stored terms version is older", () => {
        writeRaw(consentPath(), JSON.stringify({ ...validRecord(), termsVersion: 0 }));
        expect(readConsent().accepted).toBe(false);
    });

    it("resets consent when the stored terms version is newer", () => {
        // A downgrade, or a record written by a future build. Consent to terms this
        // build cannot show is not consent to the terms it would show.
        writeRaw(consentPath(), JSON.stringify({ ...validRecord(), termsVersion: 99 }));
        expect(readConsent().accepted).toBe(false);
    });

    it("resets consent when the terms version is missing or the wrong type", () => {
        writeRaw(consentPath(), JSON.stringify(without("termsVersion")));
        expect(readConsent().accepted).toBe(false);

        writeRaw(consentPath(), JSON.stringify({ ...validRecord(), termsVersion: "1" }));
        expect(readConsent().accepted).toBe(false);
    });

    it("resets consent when a different document was accepted", () => {
        writeRaw(
            consentPath(),
            JSON.stringify({ ...validRecord(), documentUrl: "https://example.invalid/eula" }),
        );
        expect(readConsent().accepted).toBe(false);
    });

    it("resets consent when the document url is missing", () => {
        writeRaw(consentPath(), JSON.stringify(without("documentUrl")));
        expect(readConsent().accepted).toBe(false);
    });

    it("accepts a valid record and reports what it actually says", () => {
        writeRaw(consentPath(), JSON.stringify(validRecord()));
        expect(readConsent()).toEqual({
            accepted: true,
            acceptedAt: "2026-08-03T10:00:00.000Z",
            documentUrl: MOJANG_EULA_URL,
            termsVersion: CURRENT_TERMS_VERSION,
            appVersion: "0.1.0",
        });
        expect(hasAcceptedDownload()).toBe(true);
    });

    it("keeps the acceptance but drops a timestamp and version it cannot use", () => {
        // The document and the terms version are what consent is *to*, so a mismatch
        // there invalidates it. When it happened and which build was running are
        // provenance: worth recording, not worth re-asking a whole licence over.
        writeRaw(
            consentPath(),
            JSON.stringify({ ...validRecord(), acceptedAt: 1_754_000_000_000, appVersion: 3 }),
        );
        expect(readConsent()).toEqual({
            accepted: true,
            acceptedAt: null,
            documentUrl: MOJANG_EULA_URL,
            termsVersion: CURRENT_TERMS_VERSION,
            appVersion: null,
        });
    });

    it("ignores unknown keys a later version may have added", () => {
        writeRaw(consentPath(), JSON.stringify({ ...validRecord(), somethingNew: "hello" }));
        expect(readConsent().accepted).toBe(true);
    });
});

/* -------------------------------------------------------------------------- */
/* Accepting                                                                  */
/* -------------------------------------------------------------------------- */

describe("acceptDownload", () => {
    it("persists the answer so it survives the next launch", () => {
        const record = acceptDownload();
        expect(record.accepted).toBe(true);
        expect(record.documentUrl).toBe(MOJANG_EULA_URL);
        expect(record.termsVersion).toBe(CURRENT_TERMS_VERSION);
        expect(record.appVersion).toBe("0.1.0");
        expect(record.acceptedAt).not.toBeNull();

        // A separate read, which is what the next launch does.
        expect(readConsent()).toEqual(record);
        expect(hasAcceptedDownload()).toBe(true);
    });

    it("records when the person agreed, as a parseable timestamp", () => {
        const before = Date.now();
        const at = acceptDownload().acceptedAt;
        expect(at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        const parsed = Date.parse(at ?? "");
        expect(Number.isNaN(parsed)).toBe(false);
        expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    });

    it("writes the userData directory when it does not exist yet", () => {
        electron.userData = join(root, "not", "created", "yet");
        expect(acceptDownload().accepted).toBe(true);
        expect(readConsent().accepted).toBe(true);
    });

    it("leaves no staging file behind", () => {
        acceptDownload();
        expect(existsSync(`${consentPath()}.writing`)).toBe(false);
    });

    it("writes JSON a person can read and a parser can round-trip", () => {
        acceptDownload();
        const text = readFileSync(consentPath(), "utf8");
        expect(text.endsWith("\n")).toBe(true);
        expect(text).toContain("\n    ");
        expect(JSON.parse(text)).toEqual(readConsent());
    });

    it("keeps the original timestamp when called again", () => {
        // Idempotence with a purpose: the interesting fact is when the person *first*
        // agreed. Re-stamping it on every launch would quietly erase that.
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-03T10:00:00.000Z"));
        const first = acceptDownload();
        expect(first.acceptedAt).toBe("2026-08-03T10:00:00.000Z");

        vi.setSystemTime(new Date("2027-01-01T00:00:00.000Z"));
        electron.version = "9.9.9";
        const second = acceptDownload();

        expect(second).toEqual(first);
        expect(storedConsent()["acceptedAt"]).toBe("2026-08-03T10:00:00.000Z");
        // The app version did not move either, which proves the file was not rewritten
        // rather than merely rewritten with the same clock reading.
        expect(storedConsent()["appVersion"]).toBe("0.1.0");
    });

    it("replaces a record it could not trust rather than reporting one it cannot read", () => {
        writeRaw(consentPath(), "{ this is not json");
        const record = acceptDownload();
        expect(record.accepted).toBe(true);
        expect(record.acceptedAt).not.toBeNull();
        expect(readConsent().accepted).toBe(true);
    });

    it("re-accepts after the terms version has moved past the stored one", () => {
        writeRaw(consentPath(), JSON.stringify({ ...validRecord(), termsVersion: 0 }));
        const record = acceptDownload();
        expect(record.termsVersion).toBe(CURRENT_TERMS_VERSION);
        expect(record.acceptedAt).not.toBe("2026-08-03T10:00:00.000Z");
    });
});

/* -------------------------------------------------------------------------- */
/* Revoking                                                                   */
/* -------------------------------------------------------------------------- */

describe("revokeDownloadConsent", () => {
    it("withdraws an acceptance and says so on disk", () => {
        acceptDownload();
        const record = revokeDownloadConsent();

        expect(record).toEqual({
            accepted: false,
            acceptedAt: null,
            documentUrl: MOJANG_EULA_URL,
            termsVersion: CURRENT_TERMS_VERSION,
            appVersion: null,
        });
        expect(readConsent().accepted).toBe(false);
        expect(hasAcceptedDownload()).toBe(false);
        expect(storedConsent()["accepted"]).toBe(false);
    });

    it("really clears the record rather than hiding it", () => {
        // If revoking left the old timestamp behind, the next acceptance would report a
        // date from before the withdrawal, which is a false statement about consent.
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-03T10:00:00.000Z"));
        acceptDownload();

        revokeDownloadConsent();

        vi.setSystemTime(new Date("2026-09-09T09:09:09.000Z"));
        expect(acceptDownload().acceptedAt).toBe("2026-09-09T09:09:09.000Z");
    });

    it("is safe to call when nothing was ever accepted", () => {
        expect(() => revokeDownloadConsent()).not.toThrow();
        expect(readConsent().accepted).toBe(false);
    });

    it("is repeatable", () => {
        acceptDownload();
        revokeDownloadConsent();
        expect(revokeDownloadConsent().accepted).toBe(false);
        expect(readConsent().accepted).toBe(false);
    });

    it("can be reversed, which is what makes it a decision", () => {
        acceptDownload();
        revokeDownloadConsent();
        expect(acceptDownload().accepted).toBe(true);
        expect(hasAcceptedDownload()).toBe(true);
    });
});

/* -------------------------------------------------------------------------- */
/* The environment opt-in                                                     */
/* -------------------------------------------------------------------------- */

describe("acceptedViaEnvironment", () => {
    const yes = ["1", "true", "yes", "TRUE", "Yes", " true ", "\tYES\n"];
    const no = ["", "0", "false", "no", "off", "maybe", " ", "2", "true-ish"];

    for (const value of yes) {
        it(`treats ${JSON.stringify(value)} as an operator saying yes`, () => {
            process.env[ENV_KEY] = value;
            expect(acceptedViaEnvironment()).toBe(true);
            expect(hasAcceptedDownload()).toBe(true);
        });
    }

    for (const value of no) {
        it(`does not treat ${JSON.stringify(value)} as consent`, () => {
            process.env[ENV_KEY] = value;
            expect(acceptedViaEnvironment()).toBe(false);
            expect(hasAcceptedDownload()).toBe(false);
        });
    }

    it("is false when the variable is not set at all", () => {
        expect(acceptedViaEnvironment()).toBe(false);
    });

    it("does not forge a stored record", () => {
        // The variable answers the question for this process. It is not a claim that
        // somebody sat in front of the app and agreed, so the record stays empty and
        // the settings row keeps telling the truth about what is on disk.
        process.env[ENV_KEY] = "1";
        expect(hasAcceptedDownload()).toBe(true);
        expect(readConsent().accepted).toBe(false);
        expect(existsSync(consentPath())).toBe(false);
    });

    it("does not override a stored acceptance in the unsafe direction", () => {
        acceptDownload();
        process.env[ENV_KEY] = "0";
        // The variable is an opt-in, not an opt-out: setting it to 0 says nothing, and
        // the person's own stored yes is still the answer.
        expect(acceptedViaEnvironment()).toBe(false);
        expect(hasAcceptedDownload()).toBe(true);
    });
});

/* -------------------------------------------------------------------------- */
/* First run                                                                  */
/* -------------------------------------------------------------------------- */

describe("first run", () => {
    it("is needed on a fresh install", () => {
        expect(readFirstRun()).toEqual({ completed: false, completedAt: null });
        expect(needsFirstRun()).toBe(true);
    });

    it("completes once and is never needed again", () => {
        const state = completeFirstRun();
        expect(state.completed).toBe(true);
        expect(state.completedAt).not.toBeNull();
        expect(needsFirstRun()).toBe(false);
        expect(readFirstRun()).toEqual(state);
    });

    it("completes when consent was accepted", () => {
        acceptDownload();
        completeFirstRun();
        expect(needsFirstRun()).toBe(false);
        expect(hasAcceptedDownload()).toBe(true);
    });

    it("completes when consent was declined, so nobody is asked twice", () => {
        // Declining is an answer. If completion were tied to acceptance, the person who
        // said no would meet the same licence at every launch until they gave in, which
        // is the nagging the whole design exists to avoid.
        completeFirstRun();
        expect(needsFirstRun()).toBe(false);
        expect(hasAcceptedDownload()).toBe(false);
        expect(readConsent().accepted).toBe(false);
    });

    it("completes when consent was accepted and then withdrawn during setup", () => {
        acceptDownload();
        revokeDownloadConsent();
        completeFirstRun();
        expect(needsFirstRun()).toBe(false);
        expect(hasAcceptedDownload()).toBe(false);
    });

    it("keeps the original completion time when called again", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-03T10:00:00.000Z"));
        const first = completeFirstRun();

        vi.setSystemTime(new Date("2027-01-01T00:00:00.000Z"));
        expect(completeFirstRun()).toEqual(first);
        expect(readFirstRun().completedAt).toBe("2026-08-03T10:00:00.000Z");
    });

    it("shows setup again when the flag is unreadable", () => {
        // The safe direction is the opposite one here. Showing a setup screen an extra
        // time is a small annoyance; skipping it silently means the consent question is
        // never asked at all.
        writeRaw(firstRunPath(), "{ half written");
        expect(readFirstRun()).toEqual({ completed: false, completedAt: null });
        expect(needsFirstRun()).toBe(true);
    });

    it("shows setup again when the flag says it did not complete", () => {
        writeRaw(firstRunPath(), JSON.stringify({ completed: false, completedAt: null }));
        expect(needsFirstRun()).toBe(true);
    });

    it("does not trust a non-boolean completed flag", () => {
        writeRaw(firstRunPath(), JSON.stringify({ completed: "true", completedAt: "yesterday" }));
        expect(readFirstRun().completed).toBe(false);
    });

    it("keeps the completion but drops a timestamp it cannot use", () => {
        writeRaw(firstRunPath(), JSON.stringify({ completed: true, completedAt: 17 }));
        expect(readFirstRun()).toEqual({ completed: true, completedAt: null });
        expect(needsFirstRun()).toBe(false);
    });

    it("leaves no staging file behind", () => {
        completeFirstRun();
        expect(existsSync(`${firstRunPath()}.writing`)).toBe(false);
    });

    it("never shows setup to an operator who answered through the environment", () => {
        process.env[ENV_KEY] = "1";
        expect(needsFirstRun()).toBe(false);
        // The flag itself is untouched: nothing was completed, because nothing was shown.
        expect(readFirstRun().completed).toBe(false);
        expect(existsSync(firstRunPath())).toBe(false);
    });

    it("is a separate record from consent", () => {
        // Two files, two questions. Completing setup must not imply an acceptance, and
        // an acceptance must not imply the flow was shown.
        completeFirstRun();
        expect(existsSync(firstRunPath())).toBe(true);
        expect(existsSync(consentPath())).toBe(false);
        expect(hasAcceptedDownload()).toBe(false);
    });
});
