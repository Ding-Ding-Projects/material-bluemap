/**
 * Recording that a Java world is a conversion, so a map rendered from it can say so.
 *
 * A converted world is indistinguishable from a native Java world by inspection - that is
 * the whole point of the conversion, and it is also the problem. Six months later, looking
 * at a map with an odd gap where a village should be, there is nothing on disk to say the
 * world was ever Bedrock, which version of Chunker translated it, or that entities and
 * structure data were documented as not surviving the trip. The difference is
 * unattributable, which is exactly the state `render/provenance.ts` was written to prevent
 * for the rendering engine, applied one step earlier in the chain.
 *
 * So a conversion writes {@link CONVERSION_RECORD_FILE} into the world it produced, and
 * {@link conversionProvenance} turns that record into the small object a render record
 * carries. The file lives *inside* the converted world rather than beside it, because a
 * world folder gets moved, copied and renamed, and a sidecar that stays behind is a record
 * of nothing. Minecraft and BlueMap both ignore files they do not recognise, so an extra
 * JSON file in a world folder is inert.
 *
 * ## Nothing here is inferred
 *
 * Every field is something that was observed during the conversion that wrote it. Where a
 * fact was not established - Chunker reported no version, the source world had no readable
 * name - the field is null, and readers are expected to render "not recorded" rather than
 * a guess. A provenance record that invents its own contents is worse than no record, since
 * its whole value is that it can be trusted without checking.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FIDELITY_NOTES, type FidelityNote } from "./fidelity.js";

/** Bumped when the shape below changes incompatibly. */
export const CONVERSION_RECORD_VERSION = 1;

/** The file written into every world this app converts. */
export const CONVERSION_RECORD_FILE = "bedrock-conversion.json";

export interface ConversionRecord {
    readonly recordVersion: number;
    /** Always `chunker` today; named so a second converter would be distinguishable. */
    readonly converter: "chunker";
    /** Chunker's version, or null when it could not be established. */
    readonly converterVersion: string | null;
    /** The jar that ran, absolute, so "which build was that" has an answer. */
    readonly converterPath: string | null;
    /** The JVM that ran it. Chunker needs Java 17 or newer. */
    readonly javaVersion: string | null;
    /** The Bedrock world this came from, absolute, exactly as it was read. */
    readonly sourceWorld: string;
    /** The source world's name from `levelname.txt`, when it had one. */
    readonly sourceName: string | null;
    /** What Chunker said it was reading, e.g. `Bedrock 1.21.30`. Null when it did not say. */
    readonly sourceEdition: string | null;
    /** What Chunker said it was writing, e.g. `Java 1.21.4`. */
    readonly targetEdition: string | null;
    /** The format identifier this app asked for, e.g. `JAVA_1_21_4`. */
    readonly targetFormat: string;
    readonly convertedAt: string;
    readonly durationMs: number | null;
    readonly regionFiles: number | null;
    /**
     * The fidelity notes in force at the time of the conversion.
     *
     * Copied in rather than referenced, because this file has to keep meaning the same
     * thing when the app's own list is later edited. A record that pointed at whatever the
     * current build happens to say would silently restate a *later* version's limitations
     * as though they had been shown to the person who ran *this* conversion.
     */
    readonly knownLosses: readonly FidelityNote[];
    readonly appVersion: string | null;
}

/** What a render record would carry to say its world was converted. */
export interface ConversionProvenance {
    readonly converter: "chunker";
    readonly converterVersion: string | null;
    readonly sourceEdition: string | null;
    readonly targetEdition: string | null;
    readonly sourceWorld: string;
    readonly convertedAt: string;
}

export interface BuildConversionRecordOptions {
    readonly converterVersion: string | null;
    readonly converterPath: string | null;
    readonly javaVersion: string | null;
    readonly sourceWorld: string;
    readonly sourceName?: string | null;
    readonly sourceEdition?: string | null;
    readonly targetEdition?: string | null;
    readonly targetFormat: string;
    readonly durationMs?: number | null;
    readonly regionFiles?: number | null;
    readonly appVersion?: string | null;
    /** Injected in tests so a record has a stable timestamp to assert on. */
    readonly now?: () => Date;
}

export function buildConversionRecord(options: BuildConversionRecordOptions): ConversionRecord {
    return {
        recordVersion: CONVERSION_RECORD_VERSION,
        converter: "chunker",
        converterVersion: options.converterVersion,
        converterPath: options.converterPath,
        javaVersion: options.javaVersion,
        sourceWorld: options.sourceWorld,
        sourceName: options.sourceName ?? null,
        sourceEdition: options.sourceEdition ?? null,
        targetEdition: options.targetEdition ?? null,
        targetFormat: options.targetFormat,
        convertedAt: (options.now?.() ?? new Date()).toISOString(),
        durationMs: options.durationMs ?? null,
        regionFiles: options.regionFiles ?? null,
        knownLosses: FIDELITY_NOTES,
        appVersion: options.appVersion ?? null,
    };
}

/** The path a world's conversion record lives at. */
export function conversionRecordPath(worldDirectory: string): string {
    return join(worldDirectory, CONVERSION_RECORD_FILE);
}

/**
 * Writes the record into a converted world.
 *
 * Staged and renamed, like `render/provenance.ts` writes its own: a crash halfway through
 * would otherwise leave a truncated file that parses as a *different* record than the one
 * intended, and for this file that means misattributing a world's origin.
 */
export async function writeConversionRecord(
    worldDirectory: string,
    record: ConversionRecord,
): Promise<void> {
    const path = conversionRecordPath(worldDirectory);
    await mkdir(worldDirectory, { recursive: true });
    const staging = `${path}.writing`;
    await writeFile(staging, `${JSON.stringify(record, null, 4)}\n`, "utf8");
    await rename(staging, path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Reads a conversion record back, or null when there is none to read.
 *
 * A missing file is the ordinary answer for a native Java world and is not a failure. An
 * unreadable or malformed one is also null rather than a partial record: the value of this
 * file is that what it says can be relied on, so half of one is worth nothing.
 */
export async function readConversionRecord(
    worldDirectory: string,
): Promise<ConversionRecord | null> {
    let raw: string;
    try {
        raw = await readFile(conversionRecordPath(worldDirectory), "utf8");
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
    if (parsed.recordVersion !== CONVERSION_RECORD_VERSION) return null;
    if (parsed.converter !== "chunker") return null;

    const sourceWorld = readString(parsed.sourceWorld);
    const convertedAt = readString(parsed.convertedAt);
    const targetFormat = readString(parsed.targetFormat);
    if (sourceWorld === null || convertedAt === null || targetFormat === null) return null;

    return {
        recordVersion: CONVERSION_RECORD_VERSION,
        converter: "chunker",
        converterVersion: readString(parsed.converterVersion),
        converterPath: readString(parsed.converterPath),
        javaVersion: readString(parsed.javaVersion),
        sourceWorld,
        sourceName: readString(parsed.sourceName),
        sourceEdition: readString(parsed.sourceEdition),
        targetEdition: readString(parsed.targetEdition),
        targetFormat,
        convertedAt,
        durationMs: readNumber(parsed.durationMs),
        regionFiles: readNumber(parsed.regionFiles),
        knownLosses: Array.isArray(parsed.knownLosses)
            ? (parsed.knownLosses.filter(isFidelityNote) as FidelityNote[])
            : [],
        appVersion: readString(parsed.appVersion),
    };
}

function isFidelityNote(value: unknown): value is FidelityNote {
    return (
        isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.title === "string" &&
        typeof value.detail === "string"
    );
}

/** The subset a render record carries, so a map can say where its world came from. */
export function conversionProvenance(record: ConversionRecord): ConversionProvenance {
    return {
        converter: record.converter,
        converterVersion: record.converterVersion,
        sourceEdition: record.sourceEdition,
        targetEdition: record.targetEdition,
        sourceWorld: record.sourceWorld,
        convertedAt: record.convertedAt,
    };
}

/** A one-line description for a map's details surface. */
export function describeConversion(record: ConversionRecord): string {
    const version = record.converterVersion === null ? "" : ` ${record.converterVersion}`;
    const from = record.sourceEdition ?? "Bedrock Edition";
    const to = record.targetEdition ?? record.targetFormat;
    return `Converted from ${from} to ${to} by Chunker${version}`;
}
