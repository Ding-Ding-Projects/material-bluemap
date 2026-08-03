/**
 * Reads field defaults straight out of upstream's Java config classes.
 *
 * The point of this is that `schema.test.ts` proves the defaults in this package
 * match the ones in `CoreConfig.java` and friends, rather than proving that a
 * number written in one of our files matches the same number written in another
 * of our files. Transcribing defaults by hand and then testing the transcription
 * against itself would pass forever while being wrong.
 *
 * It understands the expressions upstream actually uses for a default and
 * reports anything it cannot resolve, so a field it silently skipped cannot be
 * mistaken for a field it checked. `schema.test.ts` asserts the skipped list.
 */

import { readFileSync } from "node:fs";

/** One `private <type> <name> = <value>;` field, resolved. */
export interface JavaField {
    /** Configurate's key for it: the camelCase name in lower-case-dashed form. */
    readonly key: string;
    readonly javaName: string;
    readonly javaType: string;
    /** The initialiser expression, verbatim. */
    readonly expression: string;
    /** The resolved value, or `undefined` when the expression was not understood. */
    readonly value: unknown;
    readonly resolved: boolean;
}

/** Configurate's `NamingSchemes.LOWER_CASE_DASHED`. */
export function toDashedKey(javaName: string): string {
    return javaName.replace(/([A-Z])/g, (match) => `-${match.toLowerCase()}`);
}

/** Removes line and block comments so they cannot be mistaken for code. */
function stripComments(source: string): string {
    return source.replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (match) => (match.startsWith('"') ? match : " "));
}

/** Splits on commas that are not inside brackets, braces, parens or quotes. */
function splitTopLevel(text: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let quoted = false;
    let current = "";

    for (let index = 0; index < text.length; index++) {
        const char = text[index] as string;

        if (quoted) {
            current += char;
            if (char === "\\") {
                current += text[index + 1] ?? "";
                index++;
            } else if (char === '"') {
                quoted = false;
            }
            continue;
        }

        if (char === '"') {
            quoted = true;
            current += char;
            continue;
        }
        if (char === "(" || char === "[" || char === "{" || char === "<") depth++;
        if (char === ")" || char === "]" || char === "}" || char === ">") depth--;
        if (char === "," && depth === 0) {
            parts.push(current);
            current = "";
            continue;
        }
        current += char;
    }

    if (current.trim().length > 0) parts.push(current);
    return parts;
}

/** Unescapes a Java string literal. */
function javaString(literal: string): string {
    return literal
        .slice(1, -1)
        .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\(.)/g, (_match, char: string) => {
            switch (char) {
                case "n":
                    return "\n";
                case "r":
                    return "\r";
                case "t":
                    return "\t";
                case "b":
                    return "\b";
                case "f":
                    return "\f";
                case "0":
                    return "\0";
                default:
                    return char;
            }
        });
}

const JAVA_CONSTANTS: Record<string, unknown> = {
    "Integer.MIN_VALUE": -2147483648,
    "Integer.MAX_VALUE": 2147483647,
    "Long.MIN_VALUE": Number.MIN_SAFE_INTEGER,
    "Long.MAX_VALUE": Number.MAX_SAFE_INTEGER,
    "Double.MAX_VALUE": 1.7976931348623157e308,
    "Thread.NORM_PRIORITY": 5,
    "Thread.MIN_PRIORITY": 1,
    "Thread.MAX_PRIORITY": 10,
    "Vector2i.ZERO": { x: 0, z: 0 },
    "Vector2d.ZERO": { x: 0, z: 0 },
    "WorldLoaderType.ANVIL": "bluemap:anvil",
};

const EMPTY_COLLECTIONS = /^new\s+(?:ArrayList|LinkedList|HashSet|LinkedHashSet|TreeSet|CombinedMask)<?[^>]*>?\(\)$/;
const EMPTY_MAPS = /^new\s+(?:HashMap|LinkedHashMap|TreeMap|ConcurrentHashMap)<?[^>]*>?\(\)$/;
/** e.g. `Compression.GZIP.getKey().getFormatted()` */
const REGISTRY_KEY = /^([A-Z]\w*)\.([A-Z][A-Z0-9_]*)\.getKey\(\)\.getFormatted\(\)$/;
const PATH_OF = /^Path\.of\((.*)\)$/;

/** Resolves the initialiser expressions upstream actually uses. */
function resolveExpression(expression: string): { value: unknown; resolved: boolean } {
    const text = expression.trim();

    if (text === "null") return { value: null, resolved: true };
    if (text === "true") return { value: true, resolved: true };
    if (text === "false") return { value: false, resolved: true };
    if (/^-?\d+(?:\.\d+)?[fFdDlL]?$/.test(text)) return { value: Number(text.replace(/[fFdDlL]$/, "")), resolved: true };
    if (/^"(?:\\.|[^"\\])*"$/.test(text)) return { value: javaString(text), resolved: true };

    const constant = JAVA_CONSTANTS[text];
    if (constant !== undefined) return { value: constant, resolved: true };

    if (EMPTY_COLLECTIONS.test(text)) return { value: [], resolved: true };
    if (EMPTY_MAPS.test(text)) return { value: {}, resolved: true };

    const registry = REGISTRY_KEY.exec(text);
    if (registry !== null) return { value: `bluemap:${(registry[2] as string).toLowerCase()}`, resolved: true };

    const pathOf = PATH_OF.exec(text);
    if (pathOf !== null) {
        const segments = splitTopLevel(pathOf[1] as string).map((segment) => segment.trim());
        if (segments.every((segment) => /^"(?:\\.|[^"\\])*"$/.test(segment))) {
            return { value: segments.map(javaString).join("/"), resolved: true };
        }
    }

    return { value: undefined, resolved: false };
}

const FIELD = /(?:^|[\s@)])private\s+(?:final\s+)?([A-Za-z_][\w.]*(?:<[^;]*?>)?(?:\[\])?)\s+([A-Za-z_][\s\S]*)$/;

/** Extracts every resolvable `private` field default from a Java class body. */
export function parseJavaFields(classBody: string): JavaField[] {
    const fields: JavaField[] = [];

    for (const rawStatement of stripComments(classBody).split(";")) {
        const statement = rawStatement.replace(/\s+/g, " ").trim();
        if (!statement.includes("private ")) continue;
        // Transient fields are not serialised, so they are not configuration.
        if (statement.includes("transient ")) continue;
        // Skip anything that is a method or a nested type rather than a field.
        if (statement.includes("(") && !statement.includes("=")) continue;

        const match = FIELD.exec(statement);
        if (match === null) continue;

        const javaType = match[1] as string;
        for (const declarator of splitTopLevel(match[2] as string)) {
            const parts = /^\s*([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(declarator);
            if (parts === null) continue;

            const javaName = parts[1] as string;
            const expression = (parts[2] as string).trim();
            const { value, resolved } = resolveExpression(expression);
            fields.push({ key: toDashedKey(javaName), javaName, javaType, expression, value, resolved });
        }
    }

    return fields;
}

/** Returns the body of a named class or interface, brace-matched. */
export function classBody(source: string, declaration: RegExp): string {
    const match = declaration.exec(source);
    if (match === null) throw new Error(`Could not find ${declaration} in the Java source`);

    const open = source.indexOf("{", match.index + match[0].length - 1);
    if (open === -1) throw new Error(`Could not find the body of ${declaration}`);

    let depth = 0;
    for (let index = open; index < source.length; index++) {
        if (source[index] === "{") depth++;
        else if (source[index] === "}") {
            depth--;
            if (depth === 0) return source.slice(open + 1, index);
        }
    }
    throw new Error(`Unbalanced braces after ${declaration}`);
}

/** Reads a Java file and returns the body of its outer class, without nested classes. */
export function outerClassBody(file: string, className: string): string {
    const source = readFileSync(file, "utf8");
    const body = classBody(source, new RegExp(`class\\s+${className}\\b[^{]*`));
    return removeNestedTypes(body);
}

/** Reads the body of a nested static class inside a Java file. */
export function nestedClassBody(file: string, className: string): string {
    return removeNestedTypes(classBody(readFileSync(file, "utf8"), new RegExp(`static\\s+class\\s+${className}\\b[^{]*`)));
}

/** Strips nested class and interface bodies so their fields are not counted twice. */
function removeNestedTypes(body: string): string {
    let result = body;
    for (;;) {
        const match = /(?:static\s+)?(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:class|interface|enum|record)\s+\w+[^{]*\{/.exec(result);
        if (match === null) return result;

        let depth = 0;
        let index = result.indexOf("{", match.index);
        const start = index;
        for (; index < result.length; index++) {
            if (result[index] === "{") depth++;
            else if (result[index] === "}") {
                depth--;
                if (depth === 0) break;
            }
        }
        result = result.slice(0, match.index) + result.slice(Math.min(index + 1, result.length));
        if (start === -1) return result;
    }
}
