/**
 * The HOCON document model.
 *
 * This is deliberately *not* a plain JavaScript object. Upstream's config files
 * are mostly documentation: the comments in them are the only place several of
 * these settings are explained. If the app parses a file into an object and
 * writes it back, every one of those comments is gone and the file BlueMap
 * generated stops being readable. So the document keeps entry order, comments,
 * blank lines, whether a value was written inline, and the exact source text of
 * every scalar, and the writer puts all of it back.
 *
 * {@link resolve} flattens a document into the plain value the schema layer
 * validates. That direction throws information away on purpose.
 */

/** A comment line or a blank line between entries. */
export type Trivia =
    | { readonly kind: "blank" }
    | {
          readonly kind: "comment";
          /** HOCON allows both comment markers; whichever was used is kept. */
          readonly marker: "#" | "//";
          /** Everything after the marker, verbatim, without the line ending. */
          readonly text: string;
      };

export interface HoconString {
    readonly type: "string";
    readonly value: string;
    /**
     * Exact source text including quotes and escapes. Present only while the
     * value is untouched; any edit drops it so the writer re-quotes properly.
     */
    readonly raw?: string;
}

export interface HoconNumber {
    readonly type: "number";
    readonly value: number;
    readonly raw?: string;
}

export interface HoconBoolean {
    readonly type: "boolean";
    readonly value: boolean;
    readonly raw?: string;
}

export interface HoconNull {
    readonly type: "null";
    readonly raw?: string;
}

export interface HoconArray {
    readonly type: "array";
    readonly items: readonly HoconItem[];
    /** Comments and blank lines after the last item, before the `]`. */
    readonly trailing: readonly Trivia[];
    /** True when the whole array was written on one line. */
    readonly inline: boolean;
}

export interface HoconObject {
    readonly type: "object";
    readonly entries: readonly HoconEntry[];
    /** Comments and blank lines after the last entry, before the `}`. */
    readonly trailing: readonly Trivia[];
    /** True when the whole object was written on one line. */
    readonly inline: boolean;
    /**
     * False only for the root object of a file written without braces, which is
     * how every BlueMap config file is written.
     */
    readonly braced: boolean;
}

export type HoconValue = HoconString | HoconNumber | HoconBoolean | HoconNull | HoconArray | HoconObject;

export interface HoconEntry {
    /**
     * Path segments. A HOCON path expression such as `log.file: x` produces two
     * segments on one entry rather than a nested object.
     */
    readonly segments: readonly string[];
    /** The key exactly as written, including any quoting. */
    readonly rawKey: string;
    /** Comments and blank lines that appear immediately above this entry. */
    readonly leading: readonly Trivia[];
    /** `:` or `=`, or the empty string for the `key { ... }` shorthand. */
    readonly separator: ":" | "=" | "";
    readonly value: HoconValue;
    /** True when a comma followed the value. */
    readonly trailingComma: boolean;
    /** A comment on the same line as the value, if any. */
    readonly inlineComment?: { readonly marker: "#" | "//"; readonly text: string };
}

export interface HoconItem {
    readonly leading: readonly Trivia[];
    readonly value: HoconValue;
    readonly trailingComma: boolean;
    readonly inlineComment?: { readonly marker: "#" | "//"; readonly text: string };
}

export interface HoconDocument {
    /**
     * Comments and blank lines before the root object. For a BlueMap config
     * this is the `## BlueMap ##` banner at the top of the file.
     */
    readonly header: readonly Trivia[];
    readonly root: HoconObject;
    /** Comments and blank lines after everything else in the file. */
    readonly trailing: readonly Trivia[];
    readonly endsWithNewline: boolean;
    /** The file's original line ending, kept so a Windows save does not rewrite every line. */
    readonly lineEnding: "\n" | "\r\n";
}

/** Thrown when a file cannot be parsed, or uses a HOCON feature we do not support. */
export class HoconError extends Error {
    /** 1-based line number. */
    readonly line: number;
    /** 1-based column number. */
    readonly column: number;

    constructor(message: string, line: number, column: number) {
        super(`${message} (line ${line}, column ${column})`);
        this.name = "HoconError";
        this.line = line;
        this.column = column;
    }
}

/** A plain value produced by {@link resolve}. */
export type PlainValue = string | number | boolean | null | PlainValue[] | { [key: string]: PlainValue };

function isPlainObject(value: PlainValue): value is { [key: string]: PlainValue } {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * HOCON's object merge: a later object value for the same key merges into the
 * earlier one key by key, and any other value type replaces it outright.
 */
function merge(existing: PlainValue | undefined, incoming: PlainValue): PlainValue {
    if (existing === undefined) return incoming;
    if (!isPlainObject(existing) || !isPlainObject(incoming)) return incoming;

    const merged: { [key: string]: PlainValue } = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
        merged[key] = merge(merged[key], value);
    }
    return merged;
}

function resolveValue(value: HoconValue): PlainValue {
    switch (value.type) {
        case "string":
            return value.value;
        case "number":
            return value.value;
        case "boolean":
            return value.value;
        case "null":
            return null;
        case "array":
            return value.items.map((item) => resolveValue(item.value));
        case "object":
            return resolveObject(value);
    }
}

function resolveObject(object: HoconObject): { [key: string]: PlainValue } {
    const result: { [key: string]: PlainValue } = {};

    for (const entry of object.entries) {
        const resolved = resolveValue(entry.value);

        // Walk the path expression, creating intermediate objects as we go.
        let cursor = result;
        for (let i = 0; i < entry.segments.length - 1; i++) {
            const segment = entry.segments[i] as string;
            const existing = cursor[segment];
            if (existing !== undefined && isPlainObject(existing)) {
                cursor = existing;
            } else {
                const created: { [key: string]: PlainValue } = {};
                cursor[segment] = created;
                cursor = created;
            }
        }

        const last = entry.segments[entry.segments.length - 1] as string;
        cursor[last] = merge(cursor[last], resolved);
    }

    return result;
}

/**
 * Flattens a document into the plain value the schema layer validates.
 *
 * Duplicate keys merge the way HOCON says they do, and path expressions expand
 * into nested objects. Comments and formatting are dropped here, which is why
 * the app never round-trips through this function: it edits the document.
 */
export function resolve(document: HoconDocument): { [key: string]: PlainValue } {
    return resolveObject(document.root);
}
