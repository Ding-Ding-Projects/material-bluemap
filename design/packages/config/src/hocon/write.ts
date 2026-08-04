/**
 * The HOCON writer.
 *
 * What this emits has to be readable by the real Java CLI, because that is what
 * renders the map. It also has to stay as readable to a person as the file
 * upstream generates, which is why comments, blank lines, inline objects and the
 * exact source text of untouched scalars all survive the trip.
 *
 * Indentation is two spaces per level, matching upstream's own templates, so a
 * file this writer produces and a file BlueMap produces look the same.
 */

import type { HoconArray, HoconDocument, HoconEntry, HoconItem, HoconObject, HoconValue, Trivia } from "./document.js";

const INDENT = "  ";

/** Keys HOCON lets us write bare. Anything else gets quoted. */
const BARE_KEY = /^[A-Za-z0-9_-]+$/;

function quoteString(value: string): string {
    let out = '"';
    for (const char of value) {
        switch (char) {
            case '"':
                out += '\\"';
                break;
            case "\\":
                out += "\\\\";
                break;
            case "\n":
                out += "\\n";
                break;
            case "\r":
                out += "\\r";
                break;
            case "\t":
                out += "\\t";
                break;
            case "\b":
                out += "\\b";
                break;
            case "\f":
                out += "\\f";
                break;
            default: {
                const code = char.codePointAt(0) ?? 0;
                out += code < 0x20 ? `\\u${code.toString(16).padStart(4, "0")}` : char;
            }
        }
    }
    return out + '"';
}

function writeKey(entry: HoconEntry): string {
    if (entry.rawKey.length > 0) return entry.rawKey;
    return entry.segments.map((segment) => (BARE_KEY.test(segment) ? segment : quoteString(segment))).join(".");
}

function writeScalar(value: HoconValue): string {
    switch (value.type) {
        case "string":
            return value.raw ?? quoteString(value.value);
        case "number":
            return value.raw ?? String(value.value);
        case "boolean":
            return value.raw ?? String(value.value);
        case "null":
            return value.raw ?? "null";
        default:
            // Objects and arrays never reach here; writeInlineValue handles them.
            return "";
    }
}

function writeTrivia(trivia: readonly Trivia[], indent: string, lines: string[]): void {
    for (const item of trivia) {
        // A blank line is genuinely blank; indenting it would leave trailing
        // whitespace on an otherwise empty line.
        lines.push(item.kind === "blank" ? "" : indent + item.marker + item.text);
    }
}

function inlineComment(entry: HoconEntry | HoconItem): string {
    return entry.inlineComment === undefined ? "" : ` ${entry.inlineComment.marker}${entry.inlineComment.text}`;
}

function writeInlineValue(value: HoconValue): string {
    if (value.type === "object") {
        const parts = value.entries.map((entry) => {
            const separator = entry.separator === "" ? " " : `${entry.separator} `;
            return `${writeKey(entry)}${separator}${writeInlineValue(entry.value)}`;
        });
        return parts.length === 0 ? "{}" : `{ ${parts.join(", ")} }`;
    }
    if (value.type === "array") {
        const parts = value.items.map((item) => writeInlineValue(item.value));
        return parts.length === 0 ? "[]" : `[${parts.join(", ")}]`;
    }
    return writeScalar(value);
}

function writeObjectBody(object: HoconObject, indent: string, lines: string[]): void {
    for (const entry of object.entries) {
        writeTrivia(entry.leading, indent, lines);

        const key = writeKey(entry);
        const separator = entry.separator === "" ? " " : `${entry.separator} `;
        const comma = entry.trailingComma ? "," : "";

        if ((entry.value.type === "object" || entry.value.type === "array") && !entry.value.inline) {
            const open = entry.value.type === "object" ? "{" : "[";
            const close = entry.value.type === "object" ? "}" : "]";
            lines.push(`${indent}${key}${separator}${open}`);
            if (entry.value.type === "object") {
                writeObjectBody(entry.value, indent + INDENT, lines);
            } else {
                writeArrayBody(entry.value, indent + INDENT, lines);
            }
            lines.push(`${indent}${close}${comma}${inlineComment(entry)}`);
        } else {
            lines.push(`${indent}${key}${separator}${writeInlineValue(entry.value)}${comma}${inlineComment(entry)}`);
        }
    }

    writeTrivia(object.trailing, indent, lines);
}

function writeArrayBody(array: HoconArray, indent: string, lines: string[]): void {
    for (const item of array.items) {
        writeTrivia(item.leading, indent, lines);

        const comma = item.trailingComma ? "," : "";

        if ((item.value.type === "object" || item.value.type === "array") && !item.value.inline) {
            const open = item.value.type === "object" ? "{" : "[";
            const close = item.value.type === "object" ? "}" : "]";
            lines.push(`${indent}${open}`);
            if (item.value.type === "object") {
                writeObjectBody(item.value, indent + INDENT, lines);
            } else {
                writeArrayBody(item.value, indent + INDENT, lines);
            }
            lines.push(`${indent}${close}${comma}${inlineComment(item)}`);
        } else {
            lines.push(`${indent}${writeInlineValue(item.value)}${comma}${inlineComment(item)}`);
        }
    }

    writeTrivia(array.trailing, indent, lines);
}

/** Serialises a document back to HOCON text. */
export function writeHocon(document: HoconDocument): string {
    const lines: string[] = [];

    writeTrivia(document.header, "", lines);

    if (document.root.braced) {
        if (document.root.inline) {
            lines.push(writeInlineValue(document.root));
        } else {
            lines.push("{");
            writeObjectBody(document.root, INDENT, lines);
            lines.push("}");
        }
    } else {
        writeObjectBody(document.root, "", lines);
    }

    writeTrivia(document.trailing, "", lines);

    const text = lines.join(document.lineEnding);
    return document.endsWithNewline ? `${text}${document.lineEnding}` : text;
}
