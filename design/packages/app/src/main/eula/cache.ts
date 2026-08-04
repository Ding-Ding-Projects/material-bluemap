/**
 * The copy of Mojang's EULA kept in the app's data directory.
 *
 * The point of the cache is not speed. It is that a person who accepted a licence on a
 * connected machine can still read what they accepted on a train, and that the viewer
 * has something to show when Mojang is unreachable. That makes the *timestamp* the most
 * important field in the file rather than an incidental one: a cached document with no
 * fetch time is a document of unknown age, and the viewer would have to describe it as
 * such, which is barely better than having nothing.
 *
 * ## Nothing is trusted on the way back in
 *
 * The file sits in a user-writable directory, is editable by hand, and is written by
 * other versions of this application. So a record that is missing a field, carries the
 * wrong type, names a different document URL, or was written by a schema this build does
 * not know is discarded rather than repaired. Discarding costs one network request;
 * repairing costs showing somebody a licence assembled out of a half-valid file.
 *
 * Written through a staging file and renamed, exactly as `consent.ts` writes the consent
 * record, so an interrupted write cannot leave a truncated document that reads as a
 * shorter licence than the one that was fetched.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Bumped when the stored shape changes in a way an older reader cannot repair. */
export const EULA_CACHE_VERSION = 1;

export interface CachedEula {
    /** The extracted document text, exactly as it will be shown. */
    readonly text: string;
    /** The address it was fetched from, recorded rather than assumed. */
    readonly documentUrl: string;
    /** ISO-8601 UTC. The answer to "how old is what I am reading". */
    readonly fetchedAt: string;
    /** Length of the text, so a truncated file is detectable without reading it twice. */
    readonly characters: number;
}

export function eulaCacheFile(dataDirectory: string): string {
    return join(dataDirectory, "mojang-eula.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The cached document, or null when there is none this build can honestly show.
 *
 * Null rather than a partially populated record: every caller of this describes what it
 * returns to the user as "fetched on such and such a date", and there is no honest
 * sentence to write about a record whose date or text did not survive validation.
 */
export function readCachedEula(dataDirectory: string, documentUrl: string): CachedEula | null {
    let raw: string;
    try {
        raw = readFileSync(eulaCacheFile(dataDirectory), "utf8");
    } catch {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(parsed)) return null;
    if (parsed["version"] !== EULA_CACHE_VERSION) return null;

    const text = parsed["text"];
    const url = parsed["documentUrl"];
    const fetchedAt = parsed["fetchedAt"];
    if (typeof text !== "string" || text.trim().length === 0) return null;
    if (typeof url !== "string" || url !== documentUrl) return null;
    if (typeof fetchedAt !== "string") return null;
    // A timestamp that is not a date is worse than none, because the viewer would print
    // it beside the text as though it meant something.
    if (Number.isNaN(new Date(fetchedAt).getTime())) return null;

    // The stored length is a cheap witness that the text field is whole. A file truncated
    // by a full disk usually still parses as JSON on the next write, and this is what
    // notices that the survivor is not what was saved.
    const characters = parsed["characters"];
    if (typeof characters === "number" && characters !== text.length) return null;

    return { text, documentUrl: url, fetchedAt, characters: text.length };
}

/** Writes the cache atomically. Returns what was written so the caller can report it. */
export function writeCachedEula(dataDirectory: string, document: CachedEula): CachedEula {
    const target = eulaCacheFile(dataDirectory);
    mkdirSync(dirname(target), { recursive: true });
    const staging = `${target}.writing`;
    const payload = {
        version: EULA_CACHE_VERSION,
        text: document.text,
        documentUrl: document.documentUrl,
        fetchedAt: document.fetchedAt,
        characters: document.text.length,
    };
    writeFileSync(staging, `${JSON.stringify(payload, null, 4)}\n`, "utf8");
    renameSync(staging, target);
    return { ...document, characters: document.text.length };
}
