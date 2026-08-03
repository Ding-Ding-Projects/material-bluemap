/**
 * Validating a configuration file, and saying what is wrong with it.
 *
 * Configurate's object mapper drops a key it does not recognise without a word,
 * so a typo like `render-treads: 8` reads as "BlueMap ignored my setting and I
 * have no idea why". This layer keeps that permissiveness — nothing here refuses
 * a file the Java CLI would load — but reports every dropped key, every legacy
 * key, and every value outside a range upstream recommends.
 */

import { HoconError, type HoconDocument, parseHocon, resolve } from "./hocon/index.js";
import type { ConfigFileId } from "./meta.js";
import { knownPaths, leafPaths, readPath, type ConfigFileDescriptor } from "./schema/descriptor.js";

export type ConfigIssueSeverity = "error" | "warning";

export type ConfigIssueKind =
    /** A key nothing in the schema recognises. BlueMap silently ignores it. */
    | "unknown-key"
    /** A key that used to be valid. BlueMap refuses to start. */
    | "legacy-key"
    /** A value the schema rejects. */
    | "invalid-value"
    /** A value outside a range upstream recommends but does not enforce. */
    | "advisory"
    /** The file is not valid HOCON, or uses a feature this editor refuses. */
    | "hocon";

export interface ConfigIssue {
    readonly severity: ConfigIssueSeverity;
    readonly kind: ConfigIssueKind;
    /** Dotted path inside the file, or the empty string for the file itself. */
    readonly path: string;
    readonly message: string;
    readonly file?: ConfigFileId;
}

export interface ConfigParseResult<T> {
    /** True when there are no `error` issues. Warnings do not make it false. */
    readonly ok: boolean;
    /** The validated value, or `null` when validation failed. */
    readonly value: T | null;
    readonly issues: readonly ConfigIssue[];
}

export interface ConfigTextParseResult<T> extends ConfigParseResult<T> {
    /** The document, kept so an edit can be written back without losing comments. */
    readonly document: HoconDocument | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectUnknown<T>(descriptor: ConfigFileDescriptor<T>, input: unknown, issues: ConfigIssue[]): void {
    const known = knownPaths(descriptor);
    const leaves = leafPaths(descriptor);
    const legacy = new Map(descriptor.legacyKeys.map((entry) => [entry.key, entry.message]));

    const walk = (value: unknown, prefix: string): void => {
        if (!isRecord(value)) return;

        for (const key of Object.keys(value)) {
            const path = prefix === "" ? key : `${prefix}.${key}`;

            const legacyMessage = legacy.get(path);
            if (legacyMessage !== undefined) {
                issues.push({ severity: "error", kind: "legacy-key", path, message: legacyMessage, file: descriptor.id });
                continue;
            }

            if (leaves.has(path)) continue;

            if (!known.has(path)) {
                issues.push({
                    severity: "warning",
                    kind: "unknown-key",
                    path,
                    message: `BlueMap does not know the setting "${path}" and ignores it. Check the spelling, or delete the line.`,
                    file: descriptor.id,
                });
                continue;
            }

            walk(value[key], path);
        }
    };

    walk(input, "");
}

function checkAdvisories<T>(descriptor: ConfigFileDescriptor<T>, value: T, issues: ConfigIssue[]): void {
    for (const field of descriptor.fields) {
        const advisory = field.advisory;
        if (advisory === undefined) continue;

        const actual = readPath(value, field.segments);
        if (actual === null || actual === undefined) continue;

        if (Array.isArray(actual)) {
            if (advisory.min !== undefined && actual.length < advisory.min) {
                issues.push({ severity: "warning", kind: "advisory", path: field.path, message: advisory.note, file: descriptor.id });
            }
            continue;
        }

        if (advisory.oneOf !== undefined) {
            if (!advisory.oneOf.includes(actual as string | number)) {
                issues.push({ severity: "warning", kind: "advisory", path: field.path, message: advisory.note, file: descriptor.id });
            }
            continue;
        }

        if (typeof actual !== "number") continue;
        if ((advisory.min !== undefined && actual < advisory.min) || (advisory.max !== undefined && actual > advisory.max)) {
            issues.push({ severity: "warning", kind: "advisory", path: field.path, message: advisory.note, file: descriptor.id });
        }
    }
}

/** Validates the plain value a HOCON file resolved to. */
export function validateConfigValue<T>(descriptor: ConfigFileDescriptor<T>, input: unknown): ConfigParseResult<T> {
    const issues: ConfigIssue[] = [];
    collectUnknown(descriptor, input, issues);

    const parsed = descriptor.schema.safeParse(input ?? {});
    if (!parsed.success) {
        for (const issue of parsed.error.issues) {
            issues.push({
                severity: "error",
                kind: "invalid-value",
                path: issue.path.map(String).join("."),
                message: issue.message,
                file: descriptor.id,
            });
        }
        return { ok: false, value: null, issues };
    }

    checkAdvisories(descriptor, parsed.data, issues);

    return { ok: !issues.some((issue) => issue.severity === "error"), value: parsed.data, issues };
}

/** Parses a config file's text and validates it, keeping the document for editing. */
export function parseConfigText<T>(descriptor: ConfigFileDescriptor<T>, text: string): ConfigTextParseResult<T> {
    let document: HoconDocument;
    try {
        document = parseHocon(text);
    } catch (error) {
        const message = error instanceof HoconError ? error.message : String(error);
        return { ok: false, value: null, document: null, issues: [{ severity: "error", kind: "hocon", path: "", message, file: descriptor.id }] };
    }

    const result = validateConfigValue(descriptor, resolve(document));
    return { ...result, document };
}
