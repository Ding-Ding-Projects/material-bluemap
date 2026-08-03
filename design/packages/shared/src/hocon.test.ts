import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    HOCON_DEFAULT_MAX_DEPTH,
    HOCON_DEFAULT_MAX_INPUT_LENGTH,
    HoconParseError,
    parseHocon,
} from "./hocon.js";

const LANG_DIR = new URL("../../ui/public/lang/", import.meta.url);
const BASELINE_URL = new URL("../test-fixtures/hocon-locale-baseline.json", import.meta.url);

/**
 * Exactly what `hocon-parser@1.0.1` returned for every bundled locale, captured before that
 * dependency was removed. The replacement parser is proved against it rather than against a
 * fresh hand-written expectation, so "the new parser agrees with the shipped one" stays a
 * real assertion instead of a restatement of the new parser's own behaviour.
 */
const baseline = JSON.parse(readFileSync(BASELINE_URL, "utf8")) as Record<
    string,
    Record<string, unknown>
>;

const localeFiles = readdirSync(LANG_DIR)
    .filter((name) => name.endsWith(".conf"))
    .sort();

/**
 * Line endings are normalised because this repository checks out with `text=auto`, so the
 * same `.conf` file is CRLF on a Windows working tree and LF on a Linux CI runner. The parser
 * preserves line endings verbatim inside multi-line strings, which is correct, and that makes
 * the parsed value platform-dependent. The baseline was captured on one platform, so without
 * this every locale carrying a multi-line block passes locally and fails in CI. Normalising
 * both sides compares what the files actually say rather than which machine read them.
 */
function readLocale(file: string): string {
    return readFileSync(new URL(file, LANG_DIR), "utf8").replace(/\r\n?/g, "\n");
}

/**
 * The two locales below indent with U+00A0 NO-BREAK SPACE instead of a plain space.
 * `hocon-parser` did not treat U+00A0 as whitespace, so a no-break space sitting between the
 * last value of a block and that block's `}` was read as the start of a new key. Its `}`
 * branch returns that pending key *instead of the object it just parsed*, so the whole block
 * collapsed into the indent string. In `id.conf` every indent is a no-break space, which is
 * why 24 of its 25 top-level entries were lost; `zh-CN.conf` has exactly one, as trailing
 * whitespace after `chunkBorders.button`.
 *
 * The replacement parser treats U+00A0 as whitespace and parses both files correctly, so
 * these are the only two files whose output deliberately differs from the baseline. The
 * divergence is asserted below rather than tolerated: the set of differing paths is pinned,
 * and each one must be a whitespace-only string in the baseline against a real object now.
 */
const LOCALES_HOCON_PARSER_CORRUPTED: Record<string, readonly string[]> = {
    "id.conf": [
        "menu",
        "map",
        "maps",
        "markers",
        "settings",
        "goFullscreen",
        "resetCamera",
        "updateMap",
        "lighting",
        "resolution",
        "mapControls",
        "freeFlightControls",
        "renderDistance",
        "theme",
        "chunkBorders",
        "debug",
        "resetAllSettings",
        "players",
        "compass",
        "screenshot",
        "controls",
        "language",
        "blockTooltip",
        "info",
    ],
    "zh-CN.conf": ["chunkBorders"],
};

describe("parseHocon: equivalence with the hocon-parser package it replaces", () => {
    it("has a baseline covering all 30 bundled locale files", () => {
        expect(localeFiles).toHaveLength(30);
        expect(Object.keys(baseline).sort()).toEqual(localeFiles);
    });

    const equivalentFiles = localeFiles.filter((file) => !(file in LOCALES_HOCON_PARSER_CORRUPTED));

    it("has 28 locales that must match hocon-parser exactly", () => {
        expect(equivalentFiles).toHaveLength(28);
    });

    for (const file of equivalentFiles) {
        it(`produces exactly what hocon-parser produced for ${file}`, () => {
            expect(parseHocon(readLocale(file))).toEqual(baseline[file]);
        });
    }

    for (const [file, corruptedKeys] of Object.entries(LOCALES_HOCON_PARSER_CORRUPTED)) {
        it(`repairs the no-break-space blocks hocon-parser dropped from ${file}`, () => {
            const parsed = parseHocon(readLocale(file));
            const old = baseline[file]!;

            // Every key hocon-parser corrupted came back as the indent string it mistook for
            // a key, and now comes back as the object the file actually declares.
            for (const key of corruptedKeys) {
                expect(typeof old[key]).toBe("string");
                expect(String(old[key]).trim()).toBe("");
                expect(parsed[key]).toBeTypeOf("object");
                expect(Object.keys(parsed[key] as Record<string, unknown>).length).toBeGreaterThan(
                    0,
                );
            }

            // ...and nothing else changed: every other key is still byte-for-byte identical.
            const untouched = Object.keys(old).filter((key) => !corruptedKeys.includes(key));
            for (const key of untouched) {
                expect(parsed[key]).toEqual(old[key]);
            }
            expect(Object.keys(parsed).sort()).toEqual(Object.keys(old).sort());
        });
    }

    it("reads the real bundled locales through the public loader shape", () => {
        // settings.conf is the file the app loads first; if this shape is wrong the UI is blank.
        const settings = parseHocon(readLocale("settings.conf")) as {
            default: string;
            useBrowserLanguage: boolean;
            languages: { locale: string; name: string }[];
        };
        expect(settings.default).toBe("en");
        expect(settings.useBrowserLanguage).toBe(true);
        expect(settings.languages).toHaveLength(29);
        expect(settings.languages[0]).toEqual({ locale: "id", name: "Bahasa Indonesia" });
        expect(settings.languages.map((l) => l.locale)).toContain("zh-HK");
    });
});

describe("parseHocon: objects", () => {
    it("parses a braced document root", () => {
        expect(parseHocon('{ a: "x" }')).toEqual({ a: "x" });
    });

    it("parses an unbraced document root", () => {
        expect(parseHocon('a: "x"\nb: "y"')).toEqual({ a: "x", b: "y" });
    });

    it("parses nested objects", () => {
        expect(parseHocon("{ a: { b: { c: 1 } } }")).toEqual({ a: { b: { c: 1 } } });
    });

    it("accepts '=' as well as ':'", () => {
        expect(parseHocon("{ a = 1\n b : 2 }")).toEqual({ a: 1, b: 2 });
    });

    it("accepts an object value with no separator at all", () => {
        expect(parseHocon("{ sort { by { label: 1 } } }")).toEqual({ sort: { by: { label: 1 } } });
    });

    it("accepts newline-separated and comma-separated fields alike", () => {
        expect(parseHocon("{ a: 1, b: 2,\n c: 3,\n }")).toEqual({ a: 1, b: 2, c: 3 });
    });

    it("parses an empty object", () => {
        expect(parseHocon("{ a: {} }")).toEqual({ a: {} });
    });

    it("returns an empty object for empty input", () => {
        expect(parseHocon("")).toEqual({});
        expect(parseHocon("   \n\n  ")).toEqual({});
    });
});

describe("parseHocon: strings", () => {
    it("parses quoted strings", () => {
        expect(parseHocon('a: "hello world"')).toEqual({ a: "hello world" });
    });

    it("keeps reserved characters inside quotes literal", () => {
        expect(parseHocon('a: "x: y = z, {} [] # // $"')).toEqual({ a: "x: y = z, {} [] # // $" });
    });

    it("decodes the standard escapes", () => {
        expect(parseHocon('a: "line1\\nline2\\ttab\\r\\b\\f"')).toEqual({
            a: "line1\nline2\ttab\r\b\f",
        });
        expect(parseHocon('a: "quote:\\" backslash:\\\\ slash:\\/"')).toEqual({
            a: 'quote:" backslash:\\ slash:/',
        });
    });

    it("decodes \\u escapes, including a surrogate pair", () => {
        expect(parseHocon('a: "\\u0041\\u00e9\\u4e2d"')).toEqual({ a: "A\u00e9\u4e2d" });
        expect(parseHocon('a: "\\ud83d\\ude00"')).toEqual({ a: "\u{1f600}" });
    });

    it("rejects a malformed \\u escape rather than guessing", () => {
        expect(() => parseHocon('a: "\\u12"')).toThrow(HoconParseError);
        expect(() => parseHocon('a: "\\uZZZZ"')).toThrow(/four hexadecimal digits/);
    });

    it("passes an unrecognised escape through, as BlueMap's fr.conf needs", () => {
        // fr.conf writes  invertMouseY: "Inverser l\'Y de la Souris"
        expect(parseHocon('a: "l\\\'Y"')).toEqual({ a: "l'Y" });
    });

    it("parses triple-quoted multi-line strings verbatim", () => {
        const text = 'a: """\r\n<p>line # not a comment // nor this</p>\r\n\t"quoted"\r\n"""';
        expect(parseHocon(text)).toEqual({
            a: '\r\n<p>line # not a comment // nor this</p>\r\n\t"quoted"\r\n',
        });
    });

    it("does not decode escapes inside a multi-line string", () => {
        expect(parseHocon('a: """c:\\path\\name"""')).toEqual({ a: "c:\\path\\name" });
    });

    it("closes a multi-line string on the last of a run of quotes", () => {
        expect(parseHocon('a: """say """"')).toEqual({ a: 'say "' });
    });

    it("parses unquoted strings, keeping internal spaces and dropping outer ones", () => {
        expect(parseHocon("a: hello world  \nb: v1.2.3-rc")).toEqual({
            a: "hello world",
            b: "v1.2.3-rc",
        });
    });

    it("concatenates adjacent parts on one line", () => {
        expect(parseHocon('a: "x" y "z"')).toEqual({ a: "x y z" });
    });
});

describe("parseHocon: scalars", () => {
    it("parses booleans and null only when unquoted", () => {
        expect(parseHocon("a: true\nb: false\nc: null")).toEqual({ a: true, b: false, c: null });
        expect(parseHocon('a: "true"\nb: "null"')).toEqual({ a: "true", b: "null" });
    });

    it("parses integers, negatives, decimals and exponents", () => {
        expect(parseHocon("a: 0\nb: 42\nc: -7\nd: 1.5\ne: -0.25\nf: 2e3\ng: 1.5E-2")).toEqual({
            a: 0,
            b: 42,
            c: -7,
            d: 1.5,
            e: -0.25,
            f: 2000,
            g: 0.015,
        });
    });

    it("leaves number-ish text that is not a number as a string", () => {
        expect(parseHocon("a: 1.2.3\nb: 5x\nc: -\nd: 1e")).toEqual({
            a: "1.2.3",
            b: "5x",
            c: "-",
            d: "1e",
        });
    });
});

describe("parseHocon: arrays", () => {
    it("parses comma-separated and newline-separated elements", () => {
        expect(parseHocon("a: [1, 2, 3]")).toEqual({ a: [1, 2, 3] });
        expect(parseHocon("a: [\n 1\n 2\n 3\n]")).toEqual({ a: [1, 2, 3] });
    });

    it("parses an empty array and tolerates a trailing comma", () => {
        expect(parseHocon("a: []\nb: [1,]")).toEqual({ a: [], b: [1] });
    });

    it("parses mixed and nested elements", () => {
        expect(parseHocon('a: ["x", 1, true, null, [2], { k: "v" }]')).toEqual({
            a: ["x", 1, true, null, [2], { k: "v" }],
        });
    });

    it("parses the array-of-objects shape settings.conf uses", () => {
        const text =
            '{ languages: [\n { locale: "id", name: "Bahasa Indonesia" }\n { locale: "cs", name: "\u010ce\u0161tina" }\n] }';
        expect(parseHocon(text)).toEqual({
            languages: [
                { locale: "id", name: "Bahasa Indonesia" },
                { locale: "cs", name: "\u010ce\u0161tina" },
            ],
        });
    });
});

describe("parseHocon: comments", () => {
    it("strips '#' comments to end of line", () => {
        expect(parseHocon("# leading\na: 1 # trailing\n# trailing block")).toEqual({ a: 1 });
    });

    it("strips '//' comments to end of line", () => {
        // ja.conf puts one directly after a value on the same line.
        expect(parseHocon('a: "x" // "y" is too long\n// whole line\nb: 2')).toEqual({
            a: "x",
            b: 2,
        });
    });

    it("does not treat '#' or '//' inside a quoted string as a comment", () => {
        expect(parseHocon('a: "https://example.test/#anchor"')).toEqual({
            a: "https://example.test/#anchor",
        });
    });

    it("does not treat a comment as a value", () => {
        expect(() => parseHocon("a: # nothing here\n")).toThrow(/expected a value/);
    });
});

describe("parseHocon: keys", () => {
    it("expands a dotted path into nested objects", () => {
        expect(parseHocon("a.b.c = 1")).toEqual({ a: { b: { c: 1 } } });
    });

    it("merges dotted paths that share a prefix", () => {
        expect(parseHocon("a.b = 1\na.c = 2")).toEqual({ a: { b: 1, c: 2 } });
    });

    it("keeps a dot inside a quoted key literal", () => {
        expect(parseHocon('"a.b" = 1')).toEqual({ "a.b": 1 });
    });

    it("mixes quoted and unquoted path segments", () => {
        expect(parseHocon('a."b.c".d = 1')).toEqual({ a: { "b.c": { d: 1 } } });
    });

    it("allows spaces inside an unquoted key", () => {
        expect(parseHocon("some key: 1")).toEqual({ "some key": 1 });
    });

    it("rejects an empty key segment", () => {
        expect(() => parseHocon("a..b = 1")).toThrow(HoconParseError);
    });
});

describe("parseHocon: duplicate keys", () => {
    it("lets the later scalar win", () => {
        expect(parseHocon("a: 1\na: 2")).toEqual({ a: 2 });
    });

    it("deep-merges two objects", () => {
        expect(parseHocon("a { b: 1, c: { d: 1 } }\na { c: { e: 2 }, f: 3 }")).toEqual({
            a: { b: 1, c: { d: 1, e: 2 }, f: 3 },
        });
    });

    it("lets a scalar replace an object and an object replace a scalar", () => {
        expect(parseHocon("a: { b: 1 }\na: 2")).toEqual({ a: 2 });
        expect(parseHocon("a: 2\na: { b: 1 }")).toEqual({ a: { b: 1 } });
    });

    it("merges a dotted path into an existing object", () => {
        expect(parseHocon("a { b: 1 }\na.c = 2")).toEqual({ a: { b: 1, c: 2 } });
    });
});

describe("parseHocon: bounds against malformed or hostile input", () => {
    it("throws a HoconParseError, never a RangeError, on absurd nesting", () => {
        const deep = `a: ${"[".repeat(10_000)}${"]".repeat(10_000)}`;
        expect(() => parseHocon(deep)).toThrow(HoconParseError);
        expect(() => parseHocon(deep)).toThrow(/nesting is too deep/);
    });

    it("caps nesting at the documented default depth", () => {
        const nest = (n: number): string => `a: ${"[".repeat(n)}${"]".repeat(n)}`;
        expect(() => parseHocon(nest(HOCON_DEFAULT_MAX_DEPTH - 1))).not.toThrow();
        expect(() => parseHocon(nest(HOCON_DEFAULT_MAX_DEPTH + 1))).toThrow(/nesting is too deep/);
    });

    it("honours a caller-supplied depth cap exactly", () => {
        expect(parseHocon("a: [[1]]", { maxDepth: 3 })).toEqual({ a: [[1]] });
        expect(() => parseHocon("a: [[[1]]]", { maxDepth: 3 })).toThrow(/maximum depth of 3/);
    });

    it("rejects oversized input before parsing it", () => {
        expect(() => parseHocon("a: 1", { maxInputLength: 3 })).toThrow(/input is too large/);
        const huge = " ".repeat(HOCON_DEFAULT_MAX_INPUT_LENGTH + 1);
        expect(() => parseHocon(huge)).toThrow(/input is too large/);
    });

    it("rejects an unterminated quoted string", () => {
        expect(() => parseHocon('a: "no end')).toThrow(/unterminated string/);
        expect(() => parseHocon('a: "no end\nb: 1')).toThrow(/may not span lines/);
    });

    it("rejects an unterminated multi-line string", () => {
        expect(() => parseHocon('a: """no end')).toThrow(/unterminated multi-line string/);
    });

    it("rejects an unterminated object or array", () => {
        expect(() => parseHocon("{ a: 1")).toThrow(/unterminated object/);
        expect(() => parseHocon("a: [1, 2")).toThrow(/unterminated array/);
        expect(() => parseHocon("a: 1 }")).toThrow(HoconParseError);
    });

    it("rejects a missing separator and a missing value", () => {
        expect(() => parseHocon("{ a }")).toThrow(/expected ':', '=' or '\{'/);
        expect(() => parseHocon("a:")).toThrow(/expected a value/);
    });

    it("reports the line and column of the problem", () => {
        try {
            parseHocon("a: 1\nb: 2\nc: [1, 2\n");
            expect.unreachable("should have thrown");
        } catch (error) {
            expect(error).toBeInstanceOf(HoconParseError);
            expect((error as HoconParseError).line).toBe(4);
        }
    });
});

describe("parseHocon: never executes what it parses", () => {
    it("contains no dynamic code construct at all", () => {
        // Comments are stripped first: the file's own documentation names the constructs it
        // avoids, and prose about `eval` must not be able to fail (or pass) this guard.
        const source = readFileSync(new URL("./hocon.ts", import.meta.url), "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/[^\n]*/g, "");
        expect(source).not.toMatch(/\beval\s*\(/);
        expect(source).not.toMatch(/\bnew\s+Function\b/);
        expect(source).not.toMatch(/\bFunction\s*\(/);
        expect(source).not.toMatch(/\bimport\s*\(/);
    });

    it("returns code-looking text as an inert string", () => {
        const parsed = parseHocon(
            [
                'script: "<script>alert(1)</script>"',
                'iife: "(function(){ return 1 })()"',
                'template: "${globalThis.hoconCanary = true}"',
                "bare: alert(1)",
            ].join("\n"),
        );
        expect(parsed).toEqual({
            script: "<script>alert(1)</script>",
            iife: "(function(){ return 1 })()",
            template: "${globalThis.hoconCanary = true}",
            bare: "alert(1)",
        });
    });

    it("rejects an unquoted substitution instead of resolving it", () => {
        // This is the exact construct hocon-parser resolved with eval, which the app's
        // Content Security Policy refuses at runtime.
        expect(() => parseHocon("a = ${java.home}")).toThrow(/substitutions/);
        expect(() => parseHocon("a = ${globalThis.hoconCanary = true}")).toThrow(HoconParseError);
    });

    it("leaves the global scope untouched while parsing a hostile document", () => {
        const globals = globalThis as unknown as Record<string, unknown>;
        delete globals["hoconCanary"];
        parseHocon('a: "${globalThis.hoconCanary = true}"\nb: "process.exit(1)"');
        expect(globals["hoconCanary"]).toBeUndefined();
    });

    it("cannot reach Object.prototype through a __proto__ key", () => {
        const parsed = parseHocon('{ "__proto__": { "polluted": "yes" } }');
        expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(parsed, "__proto__")).toBe(true);
        expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    });

    it("keeps a 'constructor' key as plain data", () => {
        const parsed = parseHocon('{ constructor: { prototype: { polluted: "yes" } } }');
        expect(parsed["constructor"]).toEqual({ prototype: { polluted: "yes" } });
        expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    });
});
