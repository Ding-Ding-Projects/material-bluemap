/**
 * The panel resize/move catalogue, checked directly, before anything registers it.
 *
 * `panels.ts` is not yet spread into `SURFACE_VOICED` / `SURFACE_FIXED` / `SURFACE_FACTS` -
 * see the header note in `panels.ts` for why - so `appCopy.test.ts` and
 * `catalogueCoverage.test.ts` cannot see this module at all. This file applies the same
 * integrity checks directly to `PANELS_VOICED`, `PANELS_FIXED` and `PANELS_FACTS` by
 * importing them straight from `./panels.js`, mirroring what `palette.test.ts` does for the
 * command palette's own not-yet-registered catalogue.
 */

import { describe, expect, it } from "vitest";

import { PANELS_FACTS, PANELS_FIXED, PANELS_VOICED } from "./panels.js";

type VoicedKey = keyof typeof PANELS_VOICED;
type FixedKey = keyof typeof PANELS_FIXED;

const LANGUAGES = ["en", "yue"] as const;

function voicedKeys(): VoicedKey[] {
    return Object.keys(PANELS_VOICED) as VoicedKey[];
}

function fixedKeys(): FixedKey[] {
    return Object.keys(PANELS_FIXED) as FixedKey[];
}

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

describe("the panels catalogue's shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys()) {
            expect(PANELS_VOICED[key].en, key).toHaveLength(5);
            expect(PANELS_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere, voiced or fixed", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                PANELS_VOICED[key][language].forEach((text, index) => {
                    expect(text.trim(), `${key} ${language} L${index + 1}`).not.toBe("");
                });
            }
        }
        for (const key of fixedKeys()) {
            for (const language of LANGUAGES) {
                expect(PANELS_FIXED[key][language].trim(), `${key} ${language}`).not.toBe("");
            }
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                for (const text of PANELS_VOICED[key][language]) {
                    expect(text, `${key} ${language}`).not.toContain("—");
                }
            }
        }
        for (const key of fixedKeys()) {
            for (const language of LANGUAGES) {
                expect(PANELS_FIXED[key][language], key).not.toContain("—");
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
                const strings = PANELS_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys()) {
            for (let level = 0; level < 5; level++) {
                expect(PANELS_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(
                    PANELS_VOICED[key].yue[level],
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
            const expected = sorted(placeholdersIn(PANELS_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                PANELS_VOICED[key][language].forEach((text, index) => {
                    expect(sorted(placeholdersIn(text)), `${key} ${language} L${index + 1}`).toEqual(expected);
                });
            }
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Facts: what a rewrite may never drop                                       */
/* -------------------------------------------------------------------------- */

describe("no level stops saying what the message is for", () => {
    it("keeps every required literal at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of voicedKeys()) {
            const required = PANELS_FACTS[key];
            for (const language of LANGUAGES) {
                PANELS_VOICED[key][language].forEach((text, index) => {
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
                "naming what a message is for is a broken message rather than a funny one.",
        ).toEqual([]);
    });

    it("names a fact for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = voicedKeys().filter((key) => {
            const entry = PANELS_FACTS[key] as
                | { en: readonly string[]; yue: readonly string[] }
                | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* Every key carries the {title} a panel is named by                          */
/* -------------------------------------------------------------------------- */

describe("every string that names a panel actually names it", () => {
    it("carries a {title} placeholder in every voiced key", () => {
        for (const key of voicedKeys()) {
            expect(placeholdersIn(PANELS_VOICED[key].en[0]).has("title"), key).toBe(true);
        }
    });

    it("carries a {title} placeholder in every handle's accessible name", () => {
        for (const key of ["panels.resize.left", "panels.resize.right", "panels.resize.top", "panels.resize.bottom", "panels.resize.corner", "panels.move.handle"] as const) {
            expect(placeholdersIn(PANELS_FIXED[key].en).has("title"), key).toBe(true);
            expect(placeholdersIn(PANELS_FIXED[key].yue).has("title"), key).toBe(true);
        }
    });
});
