/**
 * The catalogue's own integrity, checked against the source that consumes it.
 *
 * `appCopy.ts` is three hundred and thirty strings of prose in two languages, and prose is
 * exactly the kind of thing that passes review and is wrong. The failures this file is
 * built to catch are the ones that look fine in a diff:
 *
 *  - a level that drops a `{placeholder}`, so the path, the count or the map id renders as
 *    nothing and the sentence still reads like a sentence;
 *  - a level that invents a placeholder the call site never passes, which vue-i18n renders
 *    as empty for the same reason and with the same silence;
 *  - a playful rewrite that stops saying the delete cannot be undone, or that the
 *    already-rendered tiles are not deleted, or that a value is kept out of the logs;
 *  - five "levels" that are five copies of one string, so a slider that is wired to nothing
 *    still looks wired.
 *
 * The placeholder checks read the *call sites*, not a hand-written list. The English
 * fallback in the third argument of `t()` is the definition of which values that key is
 * given, so it is the only honest source of truth for what a translation of it must keep.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
    APP_FIXED,
    APP_VOICED,
    FACTS,
    appCopyKeys,
    appFixedKeys,
    appVoicedKeys,
    type AppCopyKey,
} from "./appCopy.js";

const LANGUAGES = ["en", "yue"] as const;

/** Every string in the catalogue, with enough context for a failure to name it. */
function everyString(): { key: string; language: string; level: number; text: string }[] {
    const all: { key: string; language: string; level: number; text: string }[] = [];
    for (const key of appVoicedKeys()) {
        for (const language of LANGUAGES) {
            APP_VOICED[key][language].forEach((text, index) => {
                all.push({ key, language, level: index + 1, text });
            });
        }
    }
    for (const key of appFixedKeys()) {
        for (const language of LANGUAGES) {
            all.push({ key, language, level: 0, text: APP_FIXED[key][language] });
        }
    }
    return all;
}

const PLACEHOLDER = /\{\s*([A-Za-z_$][\w$]*)\s*\}/g;

function placeholdersIn(text: string): Set<string> {
    PLACEHOLDER.lastIndex = 0;
    const found = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = PLACEHOLDER.exec(text)) !== null) found.add(match[1] as string);
    return found;
}

function sorted(values: Iterable<string>): string[] {
    return [...values].sort();
}

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

describe("the catalogue's shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of appVoicedKeys()) {
            expect(APP_VOICED[key].en, key).toHaveLength(5);
            expect(APP_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere", () => {
        for (const entry of everyString()) {
            expect(entry.text.trim(), `${entry.key} ${entry.language} L${entry.level}`).not.toBe(
                "",
            );
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const entry of everyString()) {
            expect(entry.text, `${entry.key} ${entry.language} L${entry.level}`).not.toContain("—");
        }
    });

    it("keys nothing twice across the two tiers", () => {
        const keys = appCopyKeys();
        expect(new Set(keys).size).toBe(keys.length);
    });
});

/* -------------------------------------------------------------------------- */
/* The slider is wired to something                                           */
/* -------------------------------------------------------------------------- */

describe("the levels are levels", () => {
    /**
     * Level 1 has to be fully professional and level 5 maximally playful, so an entry whose
     * two ends are byte identical is an entry the slider does nothing to. Levels 1 and 2 are
     * allowed to match each other, and frequently do: there is genuinely one way to write a
     * professional sentence, and inventing a difference for the sake of the test would make
     * the copy worse to prove a point.
     */
    it("reads differently at level 1 and at level 5, in both languages", () => {
        for (const key of appVoicedKeys()) {
            for (const language of LANGUAGES) {
                const strings = APP_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of appVoicedKeys()) {
            for (let level = 0; level < 5; level++) {
                expect(APP_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(
                    APP_VOICED[key].yue[level],
                );
            }
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Facts: placeholders                                                        */
/* -------------------------------------------------------------------------- */

describe("no level drops a value out of a sentence", () => {
    it("uses the same placeholders at every level, in both languages", () => {
        for (const key of appVoicedKeys()) {
            const expected = sorted(placeholdersIn(APP_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                APP_VOICED[key][language].forEach((text, index) => {
                    expect(
                        sorted(placeholdersIn(text)),
                        `${key} ${language} L${index + 1}`,
                    ).toEqual(expected);
                });
            }
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Facts: what the call site actually passes                                  */
/* -------------------------------------------------------------------------- */

/** `packages/ui/src`, two levels above this file. */
const sourceRoot = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(dir: string): string[] {
    const found: string[] = [];
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
        else if (name.endsWith(".ts") || name.endsWith(".vue")) found.push(path);
    }
    return found;
}

/** The index of the closing quote of the literal opening at `start`, or -1. */
function endOfString(text: string, start: number): number {
    const quote = text[start];
    for (let i = start + 1; i < text.length; i++) {
        const ch = text[i];
        if (ch === "\\") {
            i++;
            continue;
        }
        if (ch === quote) return i;
        if (quote !== "`" && ch === "\n") return -1;
    }
    return -1;
}

/**
 * Every `t("<catalogue key>", ...)` and `markers/i18nHelpers.ts`'s `tx("<key>", ...)` /
 * `tp("<key>", ...)` in the package, with the placeholders its English fallback carries.
 *
 * The fallback is the last string literal in the call. For `t(key, fallback)` and
 * `t(key, vars, fallback)` that is the same thing this comment always said. `tx` and `tp`
 * put their fallback second rather than last -- `tx(key, fallback, values?)` -- but their
 * `values`/count argument is never a string literal itself in this codebase, so "the last
 * string literal in the call" still lands on the fallback for both shapes without needing
 * two code paths. Test files are skipped: a test may legitimately call a key with a
 * fabricated fallback to prove a point about resolution, and that is not a statement about
 * which values the product passes.
 */
function callSitePlaceholders(): Map<string, Set<string>> {
    const catalogue = new Set<string>(appCopyKeys());
    const byKey = new Map<string, Set<string>>();
    const call = /(?<![\w$.])\$?t[xp]?\s*\(\s*(["'])([A-Za-z0-9_.\-]+)\1\s*,/g;

    for (const file of sourceFiles(sourceRoot)) {
        if (file.endsWith(".test.ts")) continue;
        const text = readFileSync(file, "utf8");
        call.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = call.exec(text)) !== null) {
            const key = match[2] as string;
            if (!catalogue.has(key)) continue;

            // Walk to the end of the call, collecting the string literals inside it. The
            // fallback is the last one, whether the call passes named arguments or not.
            const literals: string[] = [];
            let depth = 1;
            for (let i = match.index + match[0].length; i < text.length && depth > 0; i++) {
                const ch = text[i] as string;
                if (ch === '"' || ch === "'" || ch === "`") {
                    const end = endOfString(text, i);
                    if (end === -1) break;
                    literals.push(text.slice(i + 1, end));
                    i = end;
                } else if (ch === "(" || ch === "[" || ch === "{") depth++;
                else if (ch === ")" || ch === "]" || ch === "}") depth--;
            }

            const fallback = literals.at(-1) ?? "";
            const found = byKey.get(key) ?? new Set<string>();
            for (const name of placeholdersIn(fallback)) found.add(name);
            byKey.set(key, found);
        }
    }
    return byKey;
}

describe("the catalogue answers the call sites it claims to answer", () => {
    const sites = callSitePlaceholders();

    it("finds a call site for every key in the catalogue", () => {
        const orphans = appCopyKeys().filter((key) => !sites.has(key));
        expect(
            orphans,
            "a catalogue entry with no call site translates nothing. Either the key is " +
                "misspelled or the surface stopped using it.",
        ).toEqual([]);
    });

    it("carries exactly the placeholders the call site passes", () => {
        const wrong: string[] = [];
        for (const [key, expected] of sites) {
            const mine = placeholdersIn(
                (APP_VOICED as Record<string, { en: readonly string[] } | undefined>)[key]?.en[0] ??
                    (APP_FIXED as Record<string, { en: string } | undefined>)[key]?.en ??
                    "",
            );
            const a = sorted(expected);
            const b = sorted(mine);
            if (a.join() !== b.join()) {
                wrong.push(
                    `${key}: call site passes [${a.join(", ")}], catalogue has [${b.join(", ")}]`,
                );
            }
        }
        expect(
            wrong,
            "vue-i18n renders a named argument the message never mentions as nothing at " +
                "all, and a placeholder the call site does not pass the same way. Either " +
                "way a fact leaves the sentence without leaving a gap in it.",
        ).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* Facts: the ones that are words rather than values                          */
/* -------------------------------------------------------------------------- */

describe("no level stops saying what the message is for", () => {
    it("keeps every required literal at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of appVoicedKeys()) {
            const required = FACTS[key];
            for (const language of LANGUAGES) {
                APP_VOICED[key][language].forEach((text, index) => {
                    for (const fact of required[language]) {
                        if (!text.includes(fact)) {
                            missing.push(`${key} ${language} L${index + 1} lost "${fact}"`);
                        }
                    }
                });
            }
        }
        expect(
            missing,
            "the funny level styles the voice and never the facts. A level that stops " +
                "naming what was deleted, or that the delete cannot be undone, is a broken " +
                "warning rather than a funny one.",
        ).toEqual([]);
    });

    it("names a fact for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = appVoicedKeys().filter((key: AppCopyKey) => {
            const entry = FACTS[key as keyof typeof FACTS] as
                { en: readonly string[]; yue: readonly string[] } | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});
