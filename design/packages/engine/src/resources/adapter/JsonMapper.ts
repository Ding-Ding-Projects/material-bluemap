/**
 * Port-specific helper module (no direct upstream file): the gson replacement for the
 * resources-pipeline. Upstream deserializes with a lenient gson instance
 * ({@link ResourcesGson}); this module provides the same building-blocks over plain
 * parsed JSON values:
 *
 * - {@link parse}: gson-lenient parsing (comments, single-quotes, unquoted
 *   names/strings, NaN/Infinity, `=`/`=>` name-separators, `;` separators, omitted
 *   array-values as null)
 * - JsonReader-like token-coercions ({@link nextString}, {@link nextDouble},
 *   {@link nextInt}, {@link nextBoolean})
 * - tolerant structure-access ({@link asObject}, {@link asArray} with
 *   single-value-as-array semantics)
 *
 * Unknown-field tolerance and default-field values are the adapters' concern: they
 * read only the fields they know (like gson's reflective adapter ignores unknown
 * json-members) and keep their field-initializer defaults for absent members.
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export type JsonObject = { [member: string]: JsonValue };

/** upstream: com.google.gson.JsonParseException / MalformedJsonException / IOException */
export class JsonParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "JsonParseError";
    }
}

// #region lenient parser

const LITERAL_END = /[\s{}[\],:;=#/"']/;

class LenientJsonParser {
    private pos = 0;

    constructor(private readonly text: string) {}

    parseSingle(): JsonValue {
        const value = this.parseValue();
        this.skipWhitespaceAndComments();
        if (this.pos < this.text.length)
            throw this.error("Expected EOF but found '" + this.text.charAt(this.pos) + "'");
        return value;
    }

    private parseValue(): JsonValue {
        this.skipWhitespaceAndComments();
        const c = this.peek();
        if (c === "{") return this.parseObject();
        if (c === "[") return this.parseArray();
        if (c === '"' || c === "'") return this.parseQuotedString(c);
        return this.parseLiteral();
    }

    private parseObject(): JsonObject {
        this.expect("{");
        const object: JsonObject = {};

        this.skipWhitespaceAndComments();
        if (this.peek() === "}") {
            this.pos++;
            return object;
        }

        for (;;) {
            // name (quoted, single-quoted or unquoted)
            this.skipWhitespaceAndComments();
            const c = this.peek();
            const name =
                c === '"' || c === "'" ? this.parseQuotedString(c) : this.parseLiteralToken();
            if (name === "") throw this.error("Expected name");

            // name/value separator: ':' or '=' or '=>'
            this.skipWhitespaceAndComments();
            const separator = this.peek();
            if (separator !== ":" && separator !== "=") throw this.error("Expected ':'");
            this.pos++;
            if (separator === "=" && this.peek() === ">") this.pos++;

            // duplicate members: the last value wins (like gson's reflective adapter)
            object[name] = this.parseValue();

            this.skipWhitespaceAndComments();
            const end = this.peek();
            if (end === "}") {
                this.pos++;
                return object;
            }
            if (end !== "," && end !== ";") throw this.error("Unterminated object");
            this.pos++;
            // note: gson rejects a trailing separator before '}' ("Expected name") —
            // the next loop-iteration's empty-name check reproduces that
            this.skipWhitespaceAndComments();
            if (this.peek() === "}") throw this.error("Expected name");
        }
    }

    private parseArray(): JsonValue[] {
        this.expect("[");
        const array: JsonValue[] = [];

        for (;;) {
            this.skipWhitespaceAndComments();
            const c = this.peek();

            if (c === "]") {
                // gson: a ']' right after a separator means an omitted (null) last
                // value; a ']' in an empty array does not
                if (array.length > 0) array.push(null);
                this.pos++;
                return array;
            }

            if (c === "," || c === ";") {
                // omitted value: "unnecessary array separators are interpreted as
                // if null was the omitted value"
                array.push(null);
                this.pos++;
                continue;
            }

            array.push(this.parseValue());

            this.skipWhitespaceAndComments();
            const end = this.peek();
            if (end === "]") {
                this.pos++;
                return array;
            }
            if (end !== "," && end !== ";") throw this.error("Unterminated array");
            this.pos++;
        }
    }

    private parseQuotedString(quote: string): string {
        this.pos++; // opening quote
        let result = "";
        for (;;) {
            if (this.pos >= this.text.length) throw this.error("Unterminated string");
            const c = this.text.charAt(this.pos++);
            if (c === quote) return result;
            if (c === "\\") {
                if (this.pos >= this.text.length) throw this.error("Unterminated escape sequence");
                const escaped = this.text.charAt(this.pos++);
                switch (escaped) {
                    case "u": {
                        const hex = this.text.substring(this.pos, this.pos + 4);
                        if (!/^[0-9a-fA-F]{4}$/.test(hex))
                            throw this.error("Malformed \\uxxxx escape");
                        result += String.fromCharCode(Number.parseInt(hex, 16));
                        this.pos += 4;
                        break;
                    }
                    case "t":
                        result += "\t";
                        break;
                    case "b":
                        result += "\b";
                        break;
                    case "n":
                        result += "\n";
                        break;
                    case "r":
                        result += "\r";
                        break;
                    case "f":
                        result += "\f";
                        break;
                    default:
                        // gson's readEscapeCharacter defaults to the escaped char
                        // itself (\", \', \\, \/, ...)
                        result += escaped;
                }
            } else {
                result += c;
            }
        }
    }

    /** an unquoted value-literal: null / true / false / NaN / Infinity / number / string */
    private parseLiteral(): JsonValue {
        const token = this.parseLiteralToken();
        if (token === "") throw this.error("Expected value");
        switch (token) {
            case "null":
                return null;
            case "true":
                return true;
            case "false":
                return false;
            case "NaN":
                return NaN;
            case "Infinity":
                return Infinity;
            case "-Infinity":
                return -Infinity;
        }
        if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(token)) return Number(token);
        // lenient: an unquoted string
        return token;
    }

    private parseLiteralToken(): string {
        const start = this.pos;
        while (this.pos < this.text.length && !LITERAL_END.test(this.text.charAt(this.pos)))
            this.pos++;
        return this.text.substring(start, this.pos);
    }

    private skipWhitespaceAndComments(): void {
        for (;;) {
            while (this.pos < this.text.length && /\s/.test(this.text.charAt(this.pos))) this.pos++;

            const c = this.text.charAt(this.pos);
            if (c === "#" || (c === "/" && this.text.charAt(this.pos + 1) === "/")) {
                // end-of-line comment
                const lineEnd = this.text.indexOf("\n", this.pos);
                this.pos = lineEnd === -1 ? this.text.length : lineEnd + 1;
            } else if (c === "/" && this.text.charAt(this.pos + 1) === "*") {
                // c-style comment
                const commentEnd = this.text.indexOf("*/", this.pos + 2);
                if (commentEnd === -1) throw this.error("Unterminated comment");
                this.pos = commentEnd + 2;
            } else {
                return;
            }
        }
    }

    private peek(): string {
        return this.text.charAt(this.pos);
    }

    private expect(c: string): void {
        if (this.text.charAt(this.pos) !== c) throw this.error("Expected '" + c + "'");
        this.pos++;
    }

    private error(message: string): JsonParseError {
        return new JsonParseError(message + " at position " + this.pos);
    }
}

/**
 * Parses a json document with gson's lenient semantics (upstream:
 * {@code GsonBuilder#setLenient()} / {@code JsonReader#setLenient(true)}).
 * Strictly valid json takes the fast-path through {@code JSON.parse}.
 */
export function parse(json: string): JsonValue {
    try {
        return JSON.parse(json) as JsonValue;
    } catch {
        return new LenientJsonParser(json).parseSingle();
    }
}

// #endregion
// #region JsonReader-like coercions

function tokenName(json: JsonValue): string {
    if (json === null) return "NULL";
    if (Array.isArray(json)) return "BEGIN_ARRAY";
    switch (typeof json) {
        case "boolean":
            return "BOOLEAN";
        case "number":
            return "NUMBER";
        case "string":
            return "STRING";
        default:
            return "BEGIN_OBJECT";
    }
}

/**
 * upstream: JsonReader#nextString — accepts STRING and NUMBER tokens.
 * (gson returns the raw number-literal; here the parsed number is formatted back,
 * which may differ in spelling — e.g. {@code 1.0} becomes {@code "1"}.)
 */
export function nextString(json: JsonValue): string {
    if (typeof json === "string") return json;
    if (typeof json === "number") return String(json);
    throw new JsonParseError("Expected a string but was " + tokenName(json));
}

/** upstream: JsonReader#nextDouble — accepts NUMBER and parseable STRING tokens. */
export function nextDouble(json: JsonValue): number {
    if (typeof json === "number") return json;
    if (typeof json === "string") {
        const value = json.trim();
        const parsed = Number(value);
        if (value !== "" && !Number.isNaN(parsed)) return parsed;
        if (value === "NaN") return NaN;
        throw new JsonParseError('For input string: "' + json + '"');
    }
    throw new JsonParseError("Expected a double but was " + tokenName(json));
}

/**
 * upstream: JsonReader#nextInt — a double (or number-string) is only accepted when it
 * exactly represents an int.
 */
export function nextInt(json: JsonValue): number {
    const value = nextDouble(json);
    if ((value | 0) !== value) throw new JsonParseError("Expected an int but was " + value);
    return value | 0;
}

/** upstream: JsonReader#nextBoolean — accepts only BOOLEAN tokens. */
export function nextBoolean(json: JsonValue): boolean {
    if (typeof json === "boolean") return json;
    throw new JsonParseError("Expected a boolean but was " + tokenName(json));
}

// #endregion
// #region structure access

export function isJsonObject(json: JsonValue): json is JsonObject {
    return typeof json === "object" && json !== null && !Array.isArray(json);
}

export function isJsonArray(json: JsonValue): json is JsonValue[] {
    return Array.isArray(json);
}

export function asObject(json: JsonValue): JsonObject {
    if (!isJsonObject(json)) throw new JsonParseError("Expected BEGIN_OBJECT but was " + tokenName(json));
    return json;
}

/**
 * Tolerant array-access: a non-array value is treated as a single-element array
 * (the single-value-as-array semantic e.g. blockstate-variants rely on).
 */
export function asArray(json: JsonValue): JsonValue[] {
    if (isJsonArray(json)) return json;
    return [json];
}

// #endregion
