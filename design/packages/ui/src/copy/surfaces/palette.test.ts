/**
 * The command palette's own catalogue, checked directly, before anything registers it.
 *
 * `palette.ts` is not yet spread into `SURFACE_VOICED` / `SURFACE_FIXED` / `SURFACE_FACTS` -
 * that wiring, and adding `components/palette` to `catalogueCoverage.test.ts`'s
 * `COVERED_SURFACES`, is the finalize agent's job once every screen in this folder is voiced.
 * Until then `appCopy.test.ts` and `voiceNotFacts.test.ts` cannot see this module at all, so
 * this file applies the same integrity checks directly to `PALETTE_VOICED`, `PALETTE_FIXED`
 * and `PALETTE_FACTS` by importing them straight from `./palette.js`, mirroring what
 * `appCopy.test.ts` does for the whole catalogue:
 *
 *  - every voiced entry has five levels in both languages, none of them empty, none of them
 *    using an em-dash;
 *  - level 1 and level 5 read differently, in both languages, so the sliders are wired to
 *    something rather than five copies of one string;
 *  - a level never drops or invents a `{placeholder}`, checked against the real `t()` call
 *    sites in `components/palette/`, not a hand-kept list of what they pass;
 *  - every voiced key has a `FACTS` entry, and the pinned substrings survive every level in
 *    both languages;
 *  - no key is voiced twice, across the two tiers or against upstream's own bundled locales.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseHocon } from "@worldlens/shared";
import { describe, expect, it } from "vitest";

import { PALETTE_FACTS, PALETTE_FIXED, PALETTE_VOICED } from "./palette.js";

type VoicedKey = keyof typeof PALETTE_VOICED;
type FixedKey = keyof typeof PALETTE_FIXED;

const LANGUAGES = ["en", "yue"] as const;

function voicedKeys(): VoicedKey[] {
    return Object.keys(PALETTE_VOICED) as VoicedKey[];
}

function fixedKeys(): FixedKey[] {
    return Object.keys(PALETTE_FIXED) as FixedKey[];
}

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

describe("the palette catalogue's shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys()) {
            expect(PALETTE_VOICED[key].en, key).toHaveLength(5);
            expect(PALETTE_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere, voiced or fixed", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                PALETTE_VOICED[key][language].forEach((text, index) => {
                    expect(text.trim(), `${key} ${language} L${index + 1}`).not.toBe("");
                });
            }
        }
        for (const key of fixedKeys()) {
            for (const language of LANGUAGES) {
                expect(PALETTE_FIXED[key][language].trim(), `${key} ${language}`).not.toBe("");
            }
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                for (const text of PALETTE_VOICED[key][language]) {
                    expect(text, `${key} ${language}`).not.toContain("—");
                }
            }
        }
        for (const key of fixedKeys()) {
            for (const language of LANGUAGES) {
                expect(PALETTE_FIXED[key][language], key).not.toContain("—");
            }
        }
    });

    it("keys nothing twice across the two tiers", () => {
        const keys = [...voicedKeys(), ...fixedKeys()];
        expect(new Set(keys).size).toBe(keys.length);
    });
});

/* -------------------------------------------------------------------------- */
/* The slider is wired to something                                           */
/* -------------------------------------------------------------------------- */

describe("the levels are levels", () => {
    it("reads differently at level 1 and at level 5, in both languages", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                const strings = PALETTE_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys()) {
            for (let level = 0; level < 5; level++) {
                expect(PALETTE_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(
                    PALETTE_VOICED[key].yue[level],
                );
            }
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Facts: placeholders stay in step across levels and languages               */
/* -------------------------------------------------------------------------- */

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

describe("no level drops a value out of a sentence", () => {
    it("uses the same placeholders at every level, in both languages", () => {
        for (const key of voicedKeys()) {
            const expected = sorted(placeholdersIn(PALETTE_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                PALETTE_VOICED[key][language].forEach((text, index) => {
                    expect(sorted(placeholdersIn(text)), `${key} ${language} L${index + 1}`).toEqual(
                        expected,
                    );
                });
            }
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Facts: what the real call sites in components/palette/ actually pass       */
/* -------------------------------------------------------------------------- */

/** `packages/ui/src/components/palette`, resolved from this file's own location. */
const paletteComponentRoot = fileURLToPath(
    new URL("../../components/palette", import.meta.url),
);

function paletteSourceFiles(dir: string): string[] {
    const found: string[] = [];
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) found.push(...paletteSourceFiles(path));
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
 * Every `t("<key>", ...)` call in `components/palette/`, with the placeholders its English
 * fallback (the call's last string literal) carries. Mirrors `appCopy.test.ts`'s scanner,
 * narrowed to this one folder so a concurrent edit elsewhere in the package cannot make this
 * file flicker.
 */
function paletteCallSitePlaceholders(): Map<string, Set<string>> {
    const call = /(?<![\w$.])\$?t\s*\(\s*(["'])([A-Za-z0-9_.\-]+)\1\s*,/g;
    const byKey = new Map<string, Set<string>>();

    for (const file of paletteSourceFiles(paletteComponentRoot)) {
        if (file.endsWith(".test.ts")) continue;
        const text = readFileSync(file, "utf8");
        call.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = call.exec(text)) !== null) {
            const key = match[2] as string;

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

describe("the palette catalogue answers the call sites it claims to answer", () => {
    const sites = paletteCallSitePlaceholders();

    it("finds a call site under components/palette/ for every key it carries", () => {
        const catalogue = new Set<string>([...voicedKeys(), ...fixedKeys()]);
        const orphans = [...catalogue].filter((key) => !sites.has(key));
        expect(
            orphans,
            "a catalogue entry with no call site under components/palette/ translates " +
                "nothing there. Either the key is misspelled or it belongs to a different " +
                "surface's module.",
        ).toEqual([]);
    });

    it("carries exactly the placeholders the call site passes", () => {
        const wrong: string[] = [];
        for (const [key, expected] of sites) {
            const voiced = (PALETTE_VOICED as Record<string, { en: readonly string[] } | undefined>)[
                key
            ];
            const fixed = (PALETTE_FIXED as Record<string, { en: string } | undefined>)[key];
            if (voiced === undefined && fixed === undefined) continue; // not ours to answer

            const mine = placeholdersIn(voiced?.en[0] ?? fixed?.en ?? "");
            const a = sorted(expected);
            const b = sorted(mine);
            if (a.join() !== b.join()) {
                wrong.push(`${key}: call site passes [${a.join(", ")}], catalogue has [${b.join(", ")}]`);
            }
        }
        expect(
            wrong,
            "vue-i18n renders a named argument the message never mentions as nothing at " +
                "all, and a placeholder the call site does not pass the same way.",
        ).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* Facts: the ones that are words rather than values                          */
/* -------------------------------------------------------------------------- */

describe("no level stops saying what the message is for", () => {
    it("keeps every required literal at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of voicedKeys()) {
            const required = PALETTE_FACTS[key];
            for (const language of LANGUAGES) {
                PALETTE_VOICED[key][language].forEach((text, index) => {
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
                "naming what a row is or what choosing it does is a broken description " +
                "rather than a funny one.",
        ).toEqual([]);
    });

    it("names a fact for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = voicedKeys().filter((key) => {
            const entry = PALETTE_FACTS[key] as
                | { en: readonly string[]; yue: readonly string[] }
                | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* Never answer a key upstream BlueMap's viewer already translates            */
/* -------------------------------------------------------------------------- */

/** Every dotted key any bundled viewer locale defines, via the app's own HOCON parser. */
function upstreamViewerKeys(): Set<string> {
    const langDir = fileURLToPath(new URL("../../../public/lang", import.meta.url));
    const keys = new Set<string>();

    const walk = (node: unknown, path: string): void => {
        if (typeof node !== "object" || node === null || Array.isArray(node)) {
            if (path !== "") keys.add(path);
            return;
        }
        for (const [name, value] of Object.entries(node as Record<string, unknown>)) {
            walk(value, path === "" ? name : `${path}.${name}`);
        }
    };

    for (const name of readdirSync(langDir)) {
        if (!name.endsWith(".conf") || name === "settings.conf") continue;
        walk(parseHocon(readFileSync(join(langDir, name), "utf8")), "");
    }
    return keys;
}

describe("never answers a key upstream BlueMap's viewer already translates", () => {
    it("finds real upstream keys at all, so a broken scan cannot pass as a clean check", () => {
        // `catalogueCoverage.test.ts` sees roughly eighty of these; anything near zero means
        // the lang directory moved or the parser broke, not that upstream stopped existing.
        expect(upstreamViewerKeys().size).toBeGreaterThan(30);
    });

    it("carries no key that public/lang/*.conf already defines", () => {
        const upstream = upstreamViewerKeys();
        const stolen = [...voicedKeys(), ...fixedKeys()].filter((key) => upstream.has(key));
        expect(
            stolen,
            "the catalogue merges on top of the loaded locale, so an entry for one of " +
                "these replaces upstream's real translation with ours in every bundled " +
                "language.",
        ).toEqual([]);
    });
});
