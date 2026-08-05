/**
 * `project.ts`'s own integrity, checked directly rather than through the merged catalogue.
 *
 * `appCopy.test.ts` already proves these properties for every surface once a module is
 * spread into `APP_VOICED`/`APP_FIXED`/`FACTS` -- but it proves them for the *catalogue*,
 * and `catalogueCoverage.test.ts` only asks the catalogue to answer the surfaces named in
 * `COVERED_SURFACES`. `components/project` is not on that list yet (see the file header),
 * so a mistake made here would still pass every test that runs today. This file is what
 * catches it anyway: it imports `PROJECT_VOICED`, `PROJECT_FIXED` and `PROJECT_FACTS`
 * straight from `./project.js`, so it holds this module to the same shape the finished
 * catalogue requires long before `catalogueCoverage.test.ts` is told the surface is done.
 *
 * Mirrors the checks in `../appCopy.test.ts`, narrowed to this module's own keys.
 */

import { describe, expect, it } from "vitest";

import { PROJECT_FACTS, PROJECT_FIXED, PROJECT_VOICED } from "./project.js";

const LANGUAGES = ["en", "yue"] as const;

type VoicedKey = keyof typeof PROJECT_VOICED;
type FixedKey = keyof typeof PROJECT_FIXED;

const voicedKeys = Object.keys(PROJECT_VOICED) as VoicedKey[];
const fixedKeys = Object.keys(PROJECT_FIXED) as FixedKey[];

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

describe("project.ts: shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys) {
            expect(PROJECT_VOICED[key].en, key).toHaveLength(5);
            expect(PROJECT_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere, voiced or fixed", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                PROJECT_VOICED[key][language].forEach((text, index) => {
                    expect(text.trim(), `${key} ${language} L${index + 1}`).not.toBe("");
                });
            }
        }
        for (const key of fixedKeys) {
            for (const language of LANGUAGES) {
                expect(PROJECT_FIXED[key][language].trim(), `${key} ${language}`).not.toBe("");
            }
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                PROJECT_VOICED[key][language].forEach((text, index) => {
                    expect(text, `${key} ${language} L${index + 1}`).not.toContain("—");
                });
            }
        }
        for (const key of fixedKeys) {
            for (const language of LANGUAGES) {
                expect(PROJECT_FIXED[key][language], `${key} ${language}`).not.toContain("—");
            }
        }
    });

    it("keys nothing twice across the two tiers", () => {
        const overlap = voicedKeys.filter((key) => (fixedKeys as string[]).includes(key));
        expect(overlap).toEqual([]);
    });
});

describe("project.ts: the levels are levels", () => {
    it("reads differently at level 1 and at level 5, in both languages", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                const strings = PROJECT_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys) {
            for (let level = 0; level < 5; level++) {
                expect(PROJECT_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(
                    PROJECT_VOICED[key].yue[level],
                );
            }
        }
    });
});

describe("project.ts: no level drops a value out of a sentence", () => {
    it("uses the same placeholders at every level, in both languages", () => {
        for (const key of voicedKeys) {
            const expected = sorted(placeholdersIn(PROJECT_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                PROJECT_VOICED[key][language].forEach((text, index) => {
                    expect(sorted(placeholdersIn(text)), `${key} ${language} L${index + 1}`).toEqual(
                        expected,
                    );
                });
            }
        }
    });
});

describe("project.ts: no level stops saying what the message is for", () => {
    it("keeps every required literal at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of voicedKeys) {
            const required = PROJECT_FACTS[key];
            for (const language of LANGUAGES) {
                PROJECT_VOICED[key][language].forEach((text, index) => {
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
                "naming what was deleted, or that a delete cannot be undone, is a broken " +
                "warning rather than a funny one.",
        ).toEqual([]);
    });

    it("names a fact for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = voicedKeys.filter((key) => {
            const entry = PROJECT_FACTS[key] as
                | { en: readonly string[]; yue: readonly string[] }
                | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});
