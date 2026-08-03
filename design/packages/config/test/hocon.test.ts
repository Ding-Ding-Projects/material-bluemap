import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteValue, HoconError, parseHocon, resolve, setPlainValue, toHoconValue, writeHocon } from "../src/hocon/index.js";
import { CONFIG_TEMPLATES } from "../src/templates/sources.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(here, "fixtures", "cli-generated");

/** Every file the real Java CLI wrote into a fresh config folder. */
function generatedFixtures(): { name: string; text: string }[] {
    const files: { name: string; text: string }[] = [];
    const walk = (directory: string, prefix: string): void => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                walk(join(directory, entry.name), `${prefix}${entry.name}/`);
                continue;
            }
            files.push({ name: `${prefix}${entry.name}`, text: readFileSync(join(directory, entry.name), "utf8") });
        }
    };
    walk(fixtureRoot, "");
    return files;
}

describe("HOCON round trip", () => {
    // The templates still carry BlueMap's ${...} placeholders, which are also
    // HOCON substitution syntax, so they are not parseable until expanded. Only
    // the ones whose placeholders sit inside quotes or comments can be read raw,
    // which is why the round trip is proven on the *generated* files instead.
    it.each(generatedFixtures())("re-writes $name byte for byte", ({ text }) => {
        expect(writeHocon(parseHocon(text))).toBe(text);
    });

    it.each(generatedFixtures())("re-parses $name to an identical document", ({ text }) => {
        const once = parseHocon(text);
        const twice = parseHocon(writeHocon(once));
        expect(twice).toEqual(once);
    });

    it("keeps every comment and blank line of every generated file", () => {
        for (const { text } of generatedFixtures()) {
            const written = writeHocon(parseHocon(text));
            const commentsIn = text.split("\n").filter((line) => line.trimStart().startsWith("#"));
            const commentsOut = written.split("\n").filter((line) => line.trimStart().startsWith("#"));
            expect(commentsOut).toEqual(commentsIn);
        }
    });
});

describe("HOCON reading", () => {
    it("reads scalars with the types HOCON gives them", () => {
        const document = parseHocon(['a: 1', 'b: "1"', "c: 1.5", "d: true", "e: false", "f: null", "g: bare text", "h: -3"].join("\n"));
        expect(resolve(document)).toEqual({ a: 1, b: "1", c: 1.5, d: true, e: false, f: null, g: "bare text", h: -3 });
    });

    it("expands a path expression into nested objects", () => {
        expect(resolve(parseHocon("log.file: x\nlog.append: true"))).toEqual({ log: { file: "x", append: true } });
    });

    it("merges duplicate object keys the way HOCON does", () => {
        expect(resolve(parseHocon("log { file: a }\nlog { append: true }"))).toEqual({ log: { file: "a", append: true } });
    });

    it("lets a later scalar replace an earlier one", () => {
        expect(resolve(parseHocon("port: 1\nport: 2"))).toEqual({ port: 2 });
    });

    it("accepts = as well as :", () => {
        expect(resolve(parseHocon("port = 8100"))).toEqual({ port: 8100 });
    });

    it("concatenates a quoted and an unquoted piece into one string", () => {
        expect(resolve(parseHocon('a: "x" y'))).toEqual({ a: "x y" });
    });

    it("reads a triple-quoted string", () => {
        expect(resolve(parseHocon('a: """line1\nline2"""'))).toEqual({ a: "line1\nline2" });
    });

    it("treats // as a comment", () => {
        expect(resolve(parseHocon("a: 1 // trailing\n// leading\nb: 2"))).toEqual({ a: 1, b: 2 });
    });
});

describe("HOCON features this editor refuses", () => {
    it("refuses a substitution rather than guessing at it", () => {
        expect(() => parseHocon("a: ${b}")).toThrow(HoconError);
        expect(() => parseHocon("a: ${b}")).toThrow(/substitutions/);
    });

    it("refuses an include", () => {
        expect(() => parseHocon('include "other.conf"')).toThrow(/include/);
    });

    it("refuses list-append", () => {
        expect(() => parseHocon("a += 1")).toThrow(/\+=/);
    });

    it("reports the line and column of a syntax error", () => {
        try {
            parseHocon("a: 1\nb\n");
            expect.unreachable("expected a HoconError");
        } catch (error) {
            expect(error).toBeInstanceOf(HoconError);
            // The key without a separator is on line 2, so that is what is named.
            expect((error as HoconError).line).toBe(2);
            expect((error as HoconError).message).toContain('Expected \':\' or \'=\' after key "b"');
        }
    });

    it("still refuses an unexpanded template, because ${...} is substitution syntax", () => {
        expect(() => parseHocon(CONFIG_TEMPLATES.core)).toThrow(/substitutions/);
    });
});

describe("editing a document", () => {
    const core = readFileSync(join(fixtureRoot, "core.conf"), "utf8");

    it("changes one value and leaves every comment in place", () => {
        const edited = writeHocon(setPlainValue(parseHocon(core), ["accept-download"], true));

        expect(edited).toContain("accept-download: true");
        expect(edited).not.toContain("accept-download: false");
        // Everything else, including all 40-odd comment lines, is untouched.
        expect(edited.split("\n").filter((line) => line.startsWith("#"))).toEqual(core.split("\n").filter((line) => line.startsWith("#")));
        expect(edited.length).toBe(core.length + "true".length - "false".length);
    });

    it("changes a nested value reached through its parent object", () => {
        const edited = setPlainValue(parseHocon(core), ["log", "append"], true);
        expect(resolve(edited)["log"]).toEqual({ file: "data/logs/debug.log", append: true });
        expect(writeHocon(edited)).toContain("  append: true");
    });

    it("adds a missing key directly beneath its commented-out example", () => {
        const webapp = readFileSync(join(fixtureRoot, "webapp.conf"), "utf8");
        const edited = writeHocon(setPlainValue(parseHocon(webapp), ["start-location"], "world:0:16:-32:390:0.1:0.19:0:0:perspective"));

        const lines = edited.split("\n");
        const exampleIndex = lines.findIndex((line) => line.startsWith('#start-location:'));
        expect(exampleIndex).toBeGreaterThan(-1);
        expect(lines[exampleIndex + 1]).toBe('start-location: "world:0:16:-32:390:0.1:0.19:0:0:perspective"');
    });

    it("puts a commented-out core setting back under its own example", () => {
        const lines = writeHocon(setPlainValue(parseHocon(core), ["render-thread-priority"], 3)).split("\n");
        const exampleIndex = lines.indexOf("#render-thread-priority: 1");
        expect(exampleIndex).toBeGreaterThan(-1);
        expect(lines[exampleIndex + 1]).toBe("render-thread-priority: 3");
    });

    it("appends a key that has no commented example, at the end", () => {
        const edited = writeHocon(setPlainValue(parseHocon(core), ["something-upstream-does-not-have"], 3));
        expect(edited.trimEnd().endsWith("something-upstream-does-not-have: 3")).toBe(true);
    });

    it("removes a key but keeps the comments that explain it", () => {
        const edited = writeHocon(deleteValue(parseHocon(core), ["metrics"]));
        expect(edited).not.toMatch(/^metrics:/m);
        expect(edited).toContain("# Default is true");
    });

    it("round-trips an edit: write, re-read, and the change is the only difference", () => {
        const original = parseHocon(core);
        const edited = setPlainValue(original, ["update-cooldown"], 120);
        const reparsed = parseHocon(writeHocon(edited));

        expect(resolve(reparsed)).toEqual({ ...resolve(original), "update-cooldown": 120 });
        expect(writeHocon(reparsed)).toBe(writeHocon(edited));
    });

    it("quotes a value that needs it, and escapes what HOCON reserves", () => {
        const document = setPlainValue(parseHocon("a: 1"), ["b"], 'say "hi"\\now');
        expect(writeHocon(document)).toContain('b: "say \\"hi\\"\\\\now"');
        expect(resolve(parseHocon(writeHocon(document)))["b"]).toBe('say "hi"\\now');
    });

    it("writes a nested object for a structured value", () => {
        const document = setPlainValue(parseHocon("a: 1"), ["start-pos"], { x: 5, z: -7 });
        expect(resolve(parseHocon(writeHocon(document)))["start-pos"]).toEqual({ x: 5, z: -7 });
    });

    it("converts plain values without carrying source text over", () => {
        expect(toHoconValue("x")).toEqual({ type: "string", value: "x" });
        expect(toHoconValue(null)).toEqual({ type: "null" });
        expect(toHoconValue([1, 2])).toEqual({
            type: "array",
            items: [
                { leading: [], value: { type: "number", value: 1 }, trailingComma: false },
                { leading: [], value: { type: "number", value: 2 }, trailingComma: false },
            ],
            trailing: [],
            inline: false,
        });
    });
});
