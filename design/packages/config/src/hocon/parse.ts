/**
 * A HOCON reader for the subset BlueMap's configuration actually uses.
 *
 * Upstream reads these files with Configurate's `HoconConfigurationLoader`,
 * which is typesafe-config underneath. Full HOCON is a large language and most
 * of it never appears in a BlueMap config, so this parser covers the part that
 * does and refuses the rest loudly rather than guessing:
 *
 *   supported   root object without braces, nested objects, arrays, `:` and `=`
 *               separators, optional commas, newline-separated entries, `#` and
 *               `//` comments, quoted strings with escapes, triple-quoted
 *               strings, unquoted strings, value concatenation, path
 *               expressions (`a.b: 1`), numbers, `true`/`false`, `null`, and
 *               duplicate-key merging
 *
 *   refused     `include`, substitutions (`${...}` and `${?...}`), and `+=`
 *
 * Those three are refused because silently mishandling them would corrupt
 * somebody's config. The refusal names the feature and the line, so the app can
 * say which file has to keep being edited by hand.
 *
 * Comments are preserved but never interpreted. Help text in the GUI comes from
 * the field metadata, which lifts upstream's template comments once, rather than
 * from whatever happens to be written above a key in a particular file.
 *
 * See this package's `README.md` for the full statement of what is and is not
 * modelled.
 */

import {
    HoconError,
    type HoconArray,
    type HoconDocument,
    type HoconEntry,
    type HoconItem,
    type HoconObject,
    type HoconValue,
    type Trivia,
} from "./document.js";

/** Characters HOCON reserves, which therefore need quoting. */
const UNQUOTED_FORBIDDEN = new Set(["$", '"', "{", "}", "[", "]", ":", "=", ",", "+", "#", "`", "^", "?", "!", "@", "*", "&", "\\"]);

interface InlineComment {
    readonly marker: "#" | "//";
    readonly text: string;
}

class Parser {
    private readonly text: string;
    private pos = 0;
    /** Newlines seen since the last piece of content, for blank-line detection. */
    private pendingNewlines = 0;

    constructor(text: string) {
        // A byte-order mark would otherwise become part of the first key.
        this.text = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    }

    parseDocument(): HoconDocument {
        let header: Trivia[] = [];
        let root: HoconObject;

        // Peek past leading trivia to find out whether the root is braced. For a
        // braced root those comments are a file header; for the brace-less root
        // every BlueMap config uses, they belong to the first entry so that the
        // writer puts them back exactly where they were.
        const save = this.pos;
        const probe: Trivia[] = [];
        this.skipTrivia(probe);
        if (this.peek() === "{") {
            header = probe;
            root = this.parseBracedObject();
        } else {
            this.pos = save;
            this.pendingNewlines = 0;
            root = this.parseObjectBody(false);
        }

        const trailing: Trivia[] = [];
        this.skipTrivia(trailing);
        if (!this.eof()) this.fail(`Unexpected ${JSON.stringify(this.peek())} after the end of the root object`);

        return { header, root, trailing, endsWithNewline: this.text.endsWith("\n") };
    }

    // ---- character helpers -------------------------------------------------

    private eof(): boolean {
        return this.pos >= this.text.length;
    }

    private peek(offset = 0): string {
        return this.text[this.pos + offset] ?? "";
    }

    private startsWith(literal: string): boolean {
        return this.text.startsWith(literal, this.pos);
    }

    /** Consumes `count` characters of real content, ending any run of newlines. */
    private take(count: number): void {
        this.pos += count;
        this.pendingNewlines = 0;
    }

    private fail(message: string, at = this.pos): never {
        let line = 1;
        let column = 1;
        for (let i = 0; i < at && i < this.text.length; i++) {
            if (this.text[i] === "\n") {
                line++;
                column = 1;
            } else {
                column++;
            }
        }
        throw new HoconError(message, line, column);
    }

    // ---- trivia ------------------------------------------------------------

    /** Consumes whitespace, newlines and comments, recording them in `into`. */
    private skipTrivia(into: Trivia[]): void {
        while (!this.eof()) {
            const char = this.peek();

            if (char === " " || char === "\t" || char === "\f") {
                this.pos++;
                continue;
            }

            if (char === "\r" || char === "\n") {
                if (char === "\r" && this.peek(1) === "\n") this.pos++;
                this.pos++;
                this.pendingNewlines++;
                // The first newline just ends a line; every one after that is a
                // blank line the writer has to put back.
                if (this.pendingNewlines >= 2) into.push({ kind: "blank" });
                continue;
            }

            if (char === "#" || (char === "/" && this.peek(1) === "/")) {
                const marker = char === "#" ? "#" : "//";
                this.pos += marker.length;
                const start = this.pos;
                while (!this.eof() && this.peek() !== "\n" && this.peek() !== "\r") this.pos++;
                into.push({ kind: "comment", marker, text: this.text.slice(start, this.pos) });
                this.pendingNewlines = 0;
                continue;
            }

            return;
        }
    }

    /** Consumes spaces and tabs only, for places where a newline is significant. */
    private skipInlineSpace(): void {
        while (this.peek() === " " || this.peek() === "\t") this.pos++;
    }

    /** Reads a comment sitting on the same line as the value just parsed. */
    private takeInlineComment(): InlineComment | undefined {
        this.skipInlineSpace();
        const char = this.peek();
        if (char !== "#" && !(char === "/" && this.peek(1) === "/")) return undefined;

        const marker = char === "#" ? "#" : "//";
        this.pos += marker.length;
        const start = this.pos;
        while (!this.eof() && this.peek() !== "\n" && this.peek() !== "\r") this.pos++;
        return { marker, text: this.text.slice(start, this.pos) };
    }

    // ---- objects and arrays ------------------------------------------------

    private parseBracedObject(): HoconObject {
        const start = this.pos;
        this.take(1); // consume '{'
        const body = this.parseObjectBody(true);
        const inline = !this.text.slice(start, this.pos).includes("\n");
        return { ...body, inline, braced: true };
    }

    private parseObjectBody(braced: boolean): HoconObject {
        const start = this.pos;
        const entries: HoconEntry[] = [];
        let pending: Trivia[] = [];

        for (;;) {
            this.skipTrivia(pending);

            if (this.eof()) {
                if (braced) this.fail("Unexpected end of file: a '{' was never closed", start);
                break;
            }

            if (this.peek() === "}") {
                if (!braced) this.fail("Unexpected '}'");
                this.take(1);
                break;
            }

            if (!braced && this.peek() === "]") this.fail("Unexpected ']'");

            entries.push(this.parseEntry(pending));
            pending = [];
        }

        return { type: "object", entries, trailing: pending, inline: false, braced };
    }

    private parseEntry(leading: Trivia[]): HoconEntry {
        this.guardUnsupported();

        const keyStart = this.pos;
        const segments = this.parseKeyPath();
        const rawKey = this.text.slice(keyStart, this.pos).trimEnd();
        this.pendingNewlines = 0;

        this.skipInlineSpace();

        let separator: ":" | "=" | "";
        const char = this.peek();
        if (char === ":" || char === "=") {
            separator = char;
            this.take(1);
        } else if (char === "{") {
            separator = "";
        } else if (char === "+" && this.peek(1) === "=") {
            this.fail("HOCON list-append ('+=') is not supported by this editor; that file has to be edited by hand");
        } else {
            this.fail(`Expected ':' or '=' after key ${JSON.stringify(rawKey)}`);
        }

        const value = this.parseValue();

        this.skipInlineSpace();
        let trailingComma = false;
        if (this.peek() === ",") {
            this.take(1);
            trailingComma = true;
        }

        const inlineComment = this.takeInlineComment();

        const entry: HoconEntry = { segments, rawKey, leading, separator, value, trailingComma };
        return inlineComment === undefined ? entry : { ...entry, inlineComment };
    }

    /** Reads `a`, `"a"`, or a path expression such as `a.b."c d"`. */
    private parseKeyPath(): string[] {
        const segments: string[] = [];

        for (;;) {
            if (this.peek() === '"') {
                segments.push(this.parseQuotedString().value);
            } else {
                const start = this.pos;
                let segment = "";
                while (!this.eof()) {
                    const char = this.peek();
                    if (char === "." || char === ":" || char === "=" || char === "{" || char === "\n" || char === "\r") break;
                    // Leave `+=` for parseEntry to refuse by name, rather than
                    // reporting an unhelpful "'+' is not allowed in a key".
                    if (char === "+" && this.peek(1) === "=") break;
                    if (char === " " || char === "\t") {
                        // A space inside an unquoted key is legal, but the space
                        // before the separator is not part of the key.
                        const spaceStart = this.pos;
                        this.skipInlineSpace();
                        const next = this.peek();
                        if (this.eof() || next === ":" || next === "=" || next === "{" || next === "." || next === "\n" || next === "\r") break;
                        if (next === "+" && this.peek(1) === "=") break;
                        segment += this.text.slice(spaceStart, this.pos);
                        continue;
                    }
                    if (UNQUOTED_FORBIDDEN.has(char)) this.fail(`Character ${JSON.stringify(char)} is not allowed in an unquoted key`);
                    segment += char;
                    this.pos++;
                }
                if (segment.length === 0) this.fail("Expected a configuration key", start);
                segments.push(segment);
            }

            if (this.peek() === ".") {
                this.pos++;
                continue;
            }
            return segments;
        }
    }

    private parseValue(): HoconValue {
        this.skipInlineSpace();
        this.guardUnsupported();

        const char = this.peek();
        if (char === "{") return this.parseBracedObject();
        if (char === "[") return this.parseArray();
        if (this.eof() || char === "\n" || char === "\r") this.fail("Expected a value");
        return this.parseConcatenation();
    }

    private parseArray(): HoconArray {
        const start = this.pos;
        this.take(1); // consume '['

        const items: HoconItem[] = [];
        let pending: Trivia[] = [];

        for (;;) {
            this.skipTrivia(pending);

            if (this.eof()) this.fail("Unexpected end of file: a '[' was never closed", start);

            if (this.peek() === "]") {
                this.take(1);
                break;
            }

            const value = this.parseValue();

            this.skipInlineSpace();
            let trailingComma = false;
            if (this.peek() === ",") {
                this.take(1);
                trailingComma = true;
            }

            const inlineComment = this.takeInlineComment();
            const item: HoconItem = { leading: pending, value, trailingComma };
            items.push(inlineComment === undefined ? item : { ...item, inlineComment });
            pending = [];
        }

        const inline = !this.text.slice(start, this.pos).includes("\n");
        return { type: "array", items, trailing: pending, inline };
    }

    // ---- scalars -----------------------------------------------------------

    private parseTripleQuotedString(): { value: string; raw: string } {
        const start = this.pos;
        this.take(3);
        const contentStart = this.pos;
        for (;;) {
            if (this.eof()) this.fail('Unexpected end of file inside a """ string', start);
            if (this.startsWith('"""')) break;
            this.pos++;
        }
        const value = this.text.slice(contentStart, this.pos);
        this.take(3);
        // A run of extra quotes at the end belongs to the string in HOCON.
        while (this.peek() === '"') this.take(1);
        return { value, raw: this.text.slice(start, this.pos) };
    }

    private parseQuotedString(): { value: string; raw: string } {
        const start = this.pos;
        this.take(1); // consume '"'
        let value = "";

        for (;;) {
            if (this.eof()) this.fail("Unexpected end of file inside a quoted string", start);
            const char = this.peek();

            if (char === "\n" || char === "\r") this.fail("A quoted string may not span a line break", start);

            if (char === '"') {
                this.take(1);
                return { value, raw: this.text.slice(start, this.pos) };
            }

            if (char === "\\") {
                this.pos++;
                const escape = this.peek();
                this.pos++;
                switch (escape) {
                    case '"':
                        value += '"';
                        break;
                    case "\\":
                        value += "\\";
                        break;
                    case "/":
                        value += "/";
                        break;
                    case "b":
                        value += "\b";
                        break;
                    case "f":
                        value += "\f";
                        break;
                    case "n":
                        value += "\n";
                        break;
                    case "r":
                        value += "\r";
                        break;
                    case "t":
                        value += "\t";
                        break;
                    case "u": {
                        const hex = this.text.slice(this.pos, this.pos + 4);
                        if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("Malformed \\u escape in a quoted string");
                        value += String.fromCharCode(parseInt(hex, 16));
                        this.pos += 4;
                        break;
                    }
                    default:
                        this.fail(`Unknown escape sequence "\\${escape}" in a quoted string`);
                }
                continue;
            }

            value += char;
            this.pos++;
        }
    }

    /**
     * Reads a value up to the end of its line, honouring HOCON's rule that
     * adjacent quoted and unquoted pieces concatenate into a single string.
     */
    private parseConcatenation(): HoconValue {
        const start = this.pos;
        let value = "";
        let sawQuoted = false;
        let sawUnquoted = false;
        let trailingSpace = "";

        for (;;) {
            if (this.eof()) break;
            const char = this.peek();

            if (char === "\n" || char === "\r") break;
            if (char === "," || char === "}" || char === "]") break;
            if (char === "#" || (char === "/" && this.peek(1) === "/")) break;

            if (char === " " || char === "\t") {
                trailingSpace += char;
                this.pos++;
                continue;
            }

            this.guardUnsupported();

            if (char === '"') {
                value += trailingSpace;
                trailingSpace = "";
                value += this.startsWith('"""') ? this.parseTripleQuotedString().value : this.parseQuotedString().value;
                sawQuoted = true;
                continue;
            }

            if (UNQUOTED_FORBIDDEN.has(char)) this.fail(`Character ${JSON.stringify(char)} has to be quoted to appear in a value`);

            value += trailingSpace;
            trailingSpace = "";
            value += char;
            sawUnquoted = true;
            this.take(1);
        }

        // Whitespace between the value and whatever ended it is not part of it.
        this.pos -= trailingSpace.length;
        const raw = this.text.slice(start, this.pos);

        if (raw.length === 0) this.fail("Expected a value", start);
        this.pendingNewlines = 0;

        // Only a value with no quoted part can be a number, a boolean or null.
        // `"1"` is the string "1"; `1` is the number 1.
        if (!sawQuoted && sawUnquoted) {
            if (raw === "true") return { type: "boolean", value: true, raw };
            if (raw === "false") return { type: "boolean", value: false, raw };
            if (raw === "null") return { type: "null", raw };
            if (/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)) {
                return { type: "number", value: Number(raw), raw };
            }
        }

        return { type: "string", value, raw };
    }

    /** Refuses the HOCON features this editor deliberately does not implement. */
    private guardUnsupported(): void {
        if (this.peek() === "$" && this.peek(1) === "{") {
            this.fail(
                "HOCON substitutions (${...}) are not supported by this editor, because resolving one wrongly would corrupt the file; that file has to be edited by hand",
            );
        }
        if (this.startsWith("include") && /^include[\s"(]/.test(this.text.slice(this.pos, this.pos + 8))) {
            this.fail("HOCON 'include' is not supported by this editor; that file has to be edited by hand");
        }
    }
}

/** Parses HOCON text into a document that keeps its comments and layout. */
export function parseHocon(text: string): HoconDocument {
    return new Parser(text).parseDocument();
}
