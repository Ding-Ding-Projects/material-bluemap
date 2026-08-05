/**
 * The Speed dial's catalogue, checked directly, before anything registers it.
 *
 * `speed.ts` is not spread into `SURFACE_VOICED` / `SURFACE_FIXED` / `SURFACE_FACTS` -- see
 * that file's own header for why -- so `appCopy.test.ts` and `catalogueCoverage.test.ts`
 * cannot see this module at all. This mirrors what `accounts.test.ts` does for the
 * multi-account catalogue: the same integrity checks, applied directly to `SPEED_VOICED`,
 * `SPEED_FIXED` and `SPEED_FACTS` by importing them straight from `./speed.js`.
 */

import { describe, expect, it } from "vitest";

import { SPEED_FACTS, SPEED_FIXED, SPEED_VOICED } from "./speed.js";

type VoicedKey = keyof typeof SPEED_VOICED;
type FixedKey = keyof typeof SPEED_FIXED;

const LANGUAGES = ["en", "yue"] as const;

function voicedKeys(): VoicedKey[] {
    return Object.keys(SPEED_VOICED) as VoicedKey[];
}

function fixedKeys(): FixedKey[] {
    return Object.keys(SPEED_FIXED) as FixedKey[];
}

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

describe("the speed catalogue's shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys()) {
            expect(SPEED_VOICED[key].en, key).toHaveLength(5);
            expect(SPEED_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere, voiced or fixed", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                SPEED_VOICED[key][language].forEach((text, index) => {
                    expect(text.trim(), `${key} ${language} L${index + 1}`).not.toBe("");
                });
            }
        }
        for (const key of fixedKeys()) {
            for (const language of LANGUAGES) {
                expect(SPEED_FIXED[key][language].trim(), `${key} ${language}`).not.toBe("");
            }
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                for (const text of SPEED_VOICED[key][language]) {
                    expect(text, `${key} ${language}`).not.toContain("—");
                }
            }
        }
        for (const key of fixedKeys()) {
            for (const language of LANGUAGES) {
                expect(SPEED_FIXED[key][language], key).not.toContain("—");
            }
        }
    });

    it("keys nothing twice across the two tiers", () => {
        const keys = [...voicedKeys(), ...fixedKeys()];
        expect(new Set(keys).size).toBe(keys.length);
    });
});

/* -------------------------------------------------------------------------- */
/* Level 1 is fully professional, and level 5 actually differs                */
/* -------------------------------------------------------------------------- */

describe("the levels are levels", () => {
    it("reads differently at level 1 and at level 5, in both languages", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                const strings = SPEED_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys()) {
            for (let level = 0; level < 5; level++) {
                expect(SPEED_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(SPEED_VOICED[key].yue[level]);
            }
        }
    });

    it("keeps level 1 free of the playful markers level 5 is allowed to use", () => {
        // A loose proxy for "fully professional": level 1 never reaches for the exclamation
        // marks and ellipses the higher levels lean on for personality.
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                const level1 = SPEED_VOICED[key][language][0];
                expect(level1, `${key} ${language} L1`).not.toMatch(/[!！]/);
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
            const expected = sorted(placeholdersIn(SPEED_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                SPEED_VOICED[key][language].forEach((text, index) => {
                    expect(sorted(placeholdersIn(text)), `${key} ${language} L${index + 1}`).toEqual(expected);
                });
            }
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Facts: what a rewrite may never drop                                       */
/* -------------------------------------------------------------------------- */

describe("no level stops naming render-thread-count and render-thread-priority", () => {
    it("keeps every required literal at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of voicedKeys()) {
            const required = SPEED_FACTS[key];
            for (const language of LANGUAGES) {
                SPEED_VOICED[key][language].forEach((text, index) => {
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
            "the funny level styles the voice and never the facts. A level that stops naming " +
                "the two raw settings it writes, or the numbers it writes them to, is a broken " +
                "message rather than a funny one.",
        ).toEqual([]);
    });

    it("names a fact for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = voicedKeys().filter((key) => {
            const entry = SPEED_FACTS[key] as { en: readonly string[]; yue: readonly string[] } | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* The Custom state and the applied state may never be confused for one other */
/* -------------------------------------------------------------------------- */

describe("Custom and applied never share wording", () => {
    it("keeps speed.custom and speed.applied distinct at every level, in both languages", () => {
        for (let level = 0; level < 5; level++) {
            for (const language of LANGUAGES) {
                expect(SPEED_VOICED["speed.custom"][language][level]).not.toBe(
                    SPEED_VOICED["speed.applied"][language][level],
                );
            }
        }
    });

    it("says 'Nothing here' only in the Custom state, never in the applied state", () => {
        for (const language of LANGUAGES) {
            const appliedMarker = language === "en" ? "Nothing here" : "呢度冇改過佢哋";
            for (const text of SPEED_VOICED["speed.applied"][language]) {
                expect(text).not.toContain(appliedMarker);
            }
        }
    });
});
