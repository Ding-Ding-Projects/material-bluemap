/**
 * A dependency-free parser for the HOCON subset that BlueMap's `.conf` files use.
 *
 * Upstream BlueMap parses these with a JVM HOCON library; the webapp port previously used
 * the `hocon-parser` npm package, which resolves `${...}` substitutions with `eval`. The
 * Electron shell ships a deliberately strict CSP (`script-src 'self'`, no `unsafe-eval`),
 * so that call is refused at runtime and the whole UI fails to render. The viewer also
 * parses `.conf` files served by a *remote* BlueMap server, so precompiling the bundled
 * locales to JSON would not have been enough.
 *
 * This parser therefore contains **no dynamic code execution of any kind**: no `eval`, no
 * `new Function`, no `setTimeout(string)`, no `import()`. It is a plain tokenizer plus a
 * recursive-descent parser that only ever produces data. Anything it does not understand
 * throws a {@link HoconParseError} instead of being executed or silently ignored.
 *
 * Supported subset:
 * - objects, braced (`{ ... }`) or as an unbraced document root
 * - `key = value`, `key : value`, and `key { ... }` (object value without a separator)
 * - dotted-path keys (`a.b.c = 1`) expanding into nested objects
 * - duplicate keys merging the HOCON way: later wins, and two objects deep-merge
 * - quoted strings with escapes, triple-quoted multi-line strings, unquoted strings
 * - numbers, `true`, `false`, `null`
 * - arrays, with newline or comma separated elements
 * - comments: `#` to end of line, and `//` to end of line
 * - string concatenation of adjacent value parts on one line (`a: "x" y "z"`)
 *
 * Deliberately unsupported, and rejected with an error rather than guessed at:
 * - `${...}` substitutions (the feature the replaced parser used `eval` for)
 * - `include` directives, `+=` self-referential appends
 *
 * The parser is bounded: input length and nesting depth are capped, every loop consumes at
 * least one character before it can iterate again, and no regular expression it uses can
 * backtrack, so a malformed or hostile `.conf` fails fast instead of hanging or blowing the
 * stack.
 */

/** Maximum object/array nesting depth accepted by default. */
export const HOCON_DEFAULT_MAX_DEPTH = 64;

/** Maximum input length accepted by default, in UTF-16 code units (4 MiB). */
export const HOCON_DEFAULT_MAX_INPUT_LENGTH = 4 * 1024 * 1024;

export interface HoconParseOptions {
    /** Maximum object/array nesting depth. Defaults to {@link HOCON_DEFAULT_MAX_DEPTH}. */
    maxDepth?: number;
    /** Maximum input length. Defaults to {@link HOCON_DEFAULT_MAX_INPUT_LENGTH}. */
    maxInputLength?: number;
}

/** Thrown for any input that is not valid data in the supported HOCON subset. */
export class HoconParseError extends Error {
    /** 1-based line the problem was found on. */
    readonly line: number;
    /** 1-based column the problem was found on. */
    readonly column: number;

    constructor(message: string, line: number, column: number) {
        super(`${message} (line ${line}, column ${column})`);
        this.name = "HoconParseError";
        this.line = line;
        this.column = column;
    }
}

/**
 * Parses a HOCON document into plain data.
 *
 * @throws {HoconParseError} if the input is malformed, exceeds the size or depth caps, or
 *     uses a HOCON feature outside the supported subset.
 */
export function parseHocon(text: string, options: HoconParseOptions = {}): Record<string, unknown> {
    const maxInputLength = options.maxInputLength ?? HOCON_DEFAULT_MAX_INPUT_LENGTH;
    if (text.length > maxInputLength) {
        throw new HoconParseError(
            `input is too large: ${text.length} characters exceeds the limit of ${maxInputLength}`,
            1,
            1,
        );
    }
    return new HoconParser(text, options.maxDepth ?? HOCON_DEFAULT_MAX_DEPTH).parseDocument();
}

/**
 * Numbers are recognised with a single anchored pattern whose quantifiers are disjoint and
 * non-nested, so it cannot backtrack: every character is consumed by exactly one branch.
 */
const NUMBER_PATTERN = /^-?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;

type ValuePart =
    | {
          readonly kind: "string";
          readonly gap: string;
          readonly text: string;
          readonly quoted: boolean;
      }
    | { readonly kind: "container"; readonly gap: string; readonly value: unknown };

class HoconParser {
    private readonly text: string;
    private readonly maxDepth: number;
    private pos = 0;

    constructor(text: string, maxDepth: number) {
        this.text = text;
        this.maxDepth = maxDepth >= 1 ? maxDepth : 1;
    }

    parseDocument(): Record<string, unknown> {
        this.skipWhitespaceAndComments();
        let result: Record<string, unknown>;
        if (this.peek() === "{") {
            this.pos++;
            result = this.readObjectBody(1, true);
        } else {
            // HOCON allows the document root to omit its braces.
            result = this.readObjectBody(1, false);
        }
        this.skipWhitespaceAndComments();
        if (!this.isEof()) {
            throw this.error(`unexpected '${this.peek()}' after the end of the document`);
        }
        return result;
    }

    // ---------------------------------------------------------------- structure

    private readObjectBody(depth: number, braced: boolean): Record<string, unknown> {
        this.checkDepth(depth);
        const obj: Record<string, unknown> = {};
        for (;;) {
            this.skipWhitespaceAndComments();
            if (this.isEof()) {
                if (braced) throw this.error("unterminated object: expected '}'");
                return obj;
            }
            const c = this.peek();
            if (c === "}") {
                if (!braced) throw this.error("unexpected '}' outside an object");
                this.pos++;
                return obj;
            }
            if (c === ",") {
                // Tolerate leading, doubled and trailing element separators.
                this.pos++;
                continue;
            }

            const path = this.readKeyPath();
            this.skipInlineSpaceAndComments();
            const separator = this.peek();
            let value: unknown;
            if (separator === ":" || separator === "=") {
                this.pos++;
                this.skipInlineSpaceAndComments();
                if (this.isEof() || isLineTerminator(this.peek())) {
                    throw this.error(`expected a value after '${separator}'`);
                }
                value = this.readValue(depth);
            } else if (separator === "{") {
                this.pos++;
                value = this.readObjectBody(depth + 1, true);
            } else {
                const found = separator === "" ? "<end of input>" : separator;
                throw this.error(
                    `expected ':', '=' or '{' after key '${path.join(".")}' but found '${found}'`,
                );
            }

            assignPath(obj, path, value);

            this.skipInlineSpaceAndComments();
            if (this.peek() === ",") this.pos++;
        }
    }

    private readArrayBody(depth: number): unknown[] {
        this.checkDepth(depth);
        const array: unknown[] = [];
        for (;;) {
            this.skipWhitespaceAndComments();
            if (this.isEof()) throw this.error("unterminated array: expected ']'");
            const c = this.peek();
            if (c === "]") {
                this.pos++;
                return array;
            }
            if (c === ",") {
                this.pos++;
                continue;
            }
            array.push(this.readValue(depth));
            this.skipInlineSpaceAndComments();
            if (this.peek() === ",") this.pos++;
        }
    }

    /**
     * Reads a key, which may be a dotted path. Quoted segments are taken literally, so
     * `"a.b" = 1` is a single key containing a dot while `a.b = 1` is a nested object.
     */
    private readKeyPath(): string[] {
        const segments: string[] = [];
        for (;;) {
            if (this.peek() === '"') {
                segments.push(this.readStringLiteral());
            } else {
                const raw = this.readUnquotedRun(true).trim();
                if (raw === "") {
                    const found = this.isEof() ? "<end of input>" : this.peek();
                    throw this.error(`expected a key but found '${found}'`);
                }
                segments.push(raw);
            }
            if (this.peek() !== ".") return segments;
            this.pos++;
        }
    }

    // -------------------------------------------------------------------- values

    /**
     * Reads everything up to the next value terminator (a line break, `,`, `}`, `]`, a
     * comment, or end of input). Adjacent parts on one line concatenate into a string, the
     * way HOCON specifies.
     */
    private readValue(depth: number): unknown {
        const parts: ValuePart[] = [];
        for (;;) {
            const gapStart = this.pos;
            this.skipInlineSpace();
            const gap = this.text.slice(gapStart, this.pos);
            if (this.atValueTerminator()) {
                // Leave the trailing run of spaces for the caller rather than eating it.
                this.pos = gapStart;
                break;
            }

            const c = this.peek();
            if (c === "{") {
                this.pos++;
                parts.push({ kind: "container", gap, value: this.readObjectBody(depth + 1, true) });
            } else if (c === "[") {
                this.pos++;
                parts.push({ kind: "container", gap, value: this.readArrayBody(depth + 1) });
            } else if (c === '"') {
                parts.push({ kind: "string", gap, text: this.readStringLiteral(), quoted: true });
            } else if (c === "$") {
                throw this.error(
                    "HOCON substitutions (${...}) are not supported: resolving them is what " +
                        "required eval, which this app's content security policy forbids",
                );
            } else {
                const raw = this.readUnquotedRun(false);
                if (raw === "") throw this.error(`unexpected '${c}' in a value`);
                parts.push({ kind: "string", gap, text: raw, quoted: false });
            }
        }

        const first = parts[0];
        if (first === undefined) throw this.error("expected a value");

        if (parts.length === 1) {
            if (first.kind === "container") return first.value;
            return first.quoted ? first.text : coerceUnquoted(first.text.trim());
        }

        let out = "";
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i]!;
            if (part.kind === "container") {
                throw this.error("an object or array value cannot be concatenated with text");
            }
            // Only the final unquoted run can carry trailing spaces; `trimEnd` is linear,
            // where a /\s+$/ replace would be quadratic on a long run of spaces.
            const text = part.quoted || i !== parts.length - 1 ? part.text : part.text.trimEnd();
            out += (i === 0 ? "" : part.gap) + text;
        }
        return out;
    }

    private readStringLiteral(): string {
        if (this.text.startsWith('"""', this.pos)) return this.readMultilineString();
        return this.readQuotedString();
    }

    private readQuotedString(): string {
        const openPos = this.pos;
        this.pos++;
        let out = "";
        for (;;) {
            if (this.isEof()) {
                throw this.errorAt(openPos, "unterminated string: expected a closing '\"'");
            }
            const c = this.peek();
            if (c === '"') {
                this.pos++;
                return out;
            }
            if (isLineTerminator(c)) {
                throw this.errorAt(
                    openPos,
                    'unterminated string: a quoted string may not span lines (use """ for a multi-line string)',
                );
            }
            if (c === "\\") {
                this.pos++;
                out += this.readEscape();
                continue;
            }
            out += c;
            this.pos++;
        }
    }

    private readEscape(): string {
        if (this.isEof()) throw this.error("unterminated escape sequence");
        const c = this.peek();
        this.pos++;
        switch (c) {
            case "n":
                return "\n";
            case "t":
                return "\t";
            case "r":
                return "\r";
            case "b":
                return "\b";
            case "f":
                return "\f";
            case '"':
                return '"';
            case "\\":
                return "\\";
            case "/":
                return "/";
            case "u": {
                const hex = this.text.slice(this.pos, this.pos + 4);
                if (hex.length !== 4 || !isHexDigits(hex)) {
                    throw this.error("invalid \\u escape: expected four hexadecimal digits");
                }
                this.pos += 4;
                return String.fromCharCode(Number.parseInt(hex, 16));
            }
            default:
                // Lenient, matching the parser this replaces: an unrecognised escape yields
                // the escaped character itself. BlueMap's fr.conf writes \' inside strings.
                return c;
        }
    }

    private readMultilineString(): string {
        const openPos = this.pos;
        this.pos += 3;
        const contentStart = this.pos;
        const firstClose = this.text.indexOf('"""', this.pos);
        if (firstClose < 0) {
            throw this.errorAt(openPos, 'unterminated multi-line string: expected a closing """');
        }
        // In a run of more than three quotes only the last three close the string.
        let close = firstClose;
        while (this.text.charAt(close + 3) === '"') close++;
        this.pos = close + 3;
        return this.text.slice(contentStart, close);
    }

    /**
     * Reads a run of unquoted characters. Everything HOCON reserves ends the run, so a
     * reserved character can never be swallowed into a value by accident.
     */
    private readUnquotedRun(isKey: boolean): string {
        const start = this.pos;
        while (!this.isEof()) {
            const c = this.peek();
            if (isLineTerminator(c)) break;
            if (c === "#") break;
            if (c === "/" && this.text.charAt(this.pos + 1) === "/") break;
            if (c === '"' || c === "$") break;
            if (c === "{" || c === "}" || c === "[" || c === "]") break;
            if (c === "," || c === ":" || c === "=") break;
            if (isKey && c === ".") break;
            this.pos++;
        }
        return this.text.slice(start, this.pos);
    }

    // ------------------------------------------------------------------ scanning

    private isEof(): boolean {
        return this.pos >= this.text.length;
    }

    /** Returns the character at the cursor, or `""` at end of input. */
    private peek(): string {
        return this.text.charAt(this.pos);
    }

    private atCommentStart(): boolean {
        const c = this.peek();
        return c === "#" || (c === "/" && this.text.charAt(this.pos + 1) === "/");
    }

    private atValueTerminator(): boolean {
        if (this.isEof()) return true;
        const c = this.peek();
        if (isLineTerminator(c) || c === "," || c === "}" || c === "]") return true;
        return this.atCommentStart();
    }

    /** Skips spaces and tabs but never a line break: a line break ends a value. */
    private skipInlineSpace(): void {
        while (!this.isEof() && isInlineSpace(this.peek())) this.pos++;
    }

    private skipInlineSpaceAndComments(): void {
        for (;;) {
            this.skipInlineSpace();
            if (!this.atCommentStart()) return;
            this.skipComment();
        }
    }

    private skipWhitespaceAndComments(): void {
        for (;;) {
            while (!this.isEof() && isWhitespace(this.peek())) this.pos++;
            if (!this.atCommentStart()) return;
            this.skipComment();
        }
    }

    private skipComment(): void {
        while (!this.isEof() && !isLineTerminator(this.peek())) this.pos++;
    }

    // -------------------------------------------------------------------- limits

    private checkDepth(depth: number): void {
        if (depth > this.maxDepth) {
            throw this.error(`nesting is too deep: exceeded the maximum depth of ${this.maxDepth}`);
        }
    }

    // -------------------------------------------------------------------- errors

    private error(message: string): HoconParseError {
        return this.errorAt(this.pos, message);
    }

    private errorAt(pos: number, message: string): HoconParseError {
        let line = 1;
        let column = 1;
        const end = Math.min(pos, this.text.length);
        for (let i = 0; i < end; i++) {
            if (this.text.charCodeAt(i) === 10) {
                line++;
                column = 1;
            } else {
                column++;
            }
        }
        return new HoconParseError(message, line, column);
    }
}

// ------------------------------------------------------------------ character sets

function isInlineSpace(c: string): boolean {
    return c === " " || c === "\t" || c === "\f" || c === "\v" || c === "\u00A0" || c === "\uFEFF";
}

function isLineTerminator(c: string): boolean {
    return c === "\n" || c === "\r";
}

function isWhitespace(c: string): boolean {
    return isInlineSpace(c) || isLineTerminator(c);
}

function isHexDigits(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        const isDigit = code >= 0x30 && code <= 0x39;
        const isUpper = code >= 0x41 && code <= 0x46;
        const isLower = code >= 0x61 && code <= 0x66;
        if (!isDigit && !isUpper && !isLower) return false;
    }
    return true;
}

// ---------------------------------------------------------------------- data model

function coerceUnquoted(raw: string): unknown {
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw === "null") return null;
    if (NUMBER_PATTERN.test(raw)) {
        const value = Number(raw);
        if (Number.isFinite(value)) return value;
    }
    return raw;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads an own property. Plain member access would happily return inherited values such as
 * `Object.prototype.constructor` for a document whose key is `constructor`.
 */
function getOwn(target: Record<string, unknown>, key: string): unknown {
    return Object.prototype.hasOwnProperty.call(target, key) ? target[key] : undefined;
}

/**
 * Defines an own data property. Plain assignment would invoke the `__proto__` setter for a
 * remote document containing `"__proto__" : { ... }`, letting it reach every other object in
 * the app. `defineProperty` writes a real own property instead, so such a key stays data.
 */
function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
    Object.defineProperty(target, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
    });
}

function assignPath(root: Record<string, unknown>, path: readonly string[], value: unknown): void {
    let target = root;
    for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i]!;
        const existing = getOwn(target, segment);
        if (isPlainObject(existing)) {
            target = existing;
        } else {
            const created: Record<string, unknown> = {};
            setOwn(target, segment, created);
            target = created;
        }
    }

    const last = path[path.length - 1]!;
    const existing = getOwn(target, last);
    if (isPlainObject(existing) && isPlainObject(value)) {
        // HOCON duplicate-key rule: later wins, but two objects deep-merge.
        deepMerge(existing, value);
    } else {
        setOwn(target, last, value);
    }
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const key of Object.keys(source)) {
        const incoming = getOwn(source, key);
        const existing = getOwn(target, key);
        if (isPlainObject(existing) && isPlainObject(incoming)) {
            deepMerge(existing, incoming);
        } else {
            setOwn(target, key, incoming);
        }
    }
}
