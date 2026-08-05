/**
 * The multi-account catalogue, checked directly, before anything registers it.
 *
 * `accounts.ts` is not yet spread into `SURFACE_VOICED` / `SURFACE_FIXED` / `SURFACE_FACTS`
 * - see the header note in `accounts.ts` for why - so `appCopy.test.ts` and
 * `catalogueCoverage.test.ts` cannot see this module at all. This file applies the same
 * integrity checks directly to `ACCOUNTS_VOICED`, `ACCOUNTS_FIXED` and `ACCOUNTS_FACTS` by
 * importing them straight from `./accounts.js`, mirroring what `panels.test.ts` does for
 * the panel resize/move catalogue and what `palette.test.ts` does for the command palette.
 */

import { describe, expect, it } from "vitest";

import { ACCOUNTS_FACTS, ACCOUNTS_FIXED, ACCOUNTS_VOICED } from "./accounts.js";

type VoicedKey = keyof typeof ACCOUNTS_VOICED;
type FixedKey = keyof typeof ACCOUNTS_FIXED;

const LANGUAGES = ["en", "yue"] as const;

function voicedKeys(): VoicedKey[] {
    return Object.keys(ACCOUNTS_VOICED) as VoicedKey[];
}

function fixedKeys(): FixedKey[] {
    return Object.keys(ACCOUNTS_FIXED) as FixedKey[];
}

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

describe("the accounts catalogue's shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys()) {
            expect(ACCOUNTS_VOICED[key].en, key).toHaveLength(5);
            expect(ACCOUNTS_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere, voiced or fixed", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                ACCOUNTS_VOICED[key][language].forEach((text, index) => {
                    expect(text.trim(), `${key} ${language} L${index + 1}`).not.toBe("");
                });
            }
        }
        for (const key of fixedKeys()) {
            for (const language of LANGUAGES) {
                expect(ACCOUNTS_FIXED[key][language].trim(), `${key} ${language}`).not.toBe("");
            }
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                for (const text of ACCOUNTS_VOICED[key][language]) {
                    expect(text, `${key} ${language}`).not.toContain("—");
                }
            }
        }
        for (const key of fixedKeys()) {
            for (const language of LANGUAGES) {
                expect(ACCOUNTS_FIXED[key][language], key).not.toContain("—");
            }
        }
    });

    it("keys nothing twice across the two tiers", () => {
        const keys = [...voicedKeys(), ...fixedKeys()];
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("never quotes a token, which is the one rule this surface shares with github.ts", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                for (const text of ACCOUNTS_VOICED[key][language]) {
                    expect(text.toLowerCase(), `${key} ${language}`).not.toMatch(/\bghp_|ghu_|ghs_/);
                }
            }
        }
    });
});

/* -------------------------------------------------------------------------- */
/* The slider is wired to something                                           */
/* -------------------------------------------------------------------------- */

describe("the levels are levels", () => {
    it("reads differently at level 1 and at level 5, in both languages", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                const strings = ACCOUNTS_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys()) {
            for (let level = 0; level < 5; level++) {
                expect(ACCOUNTS_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(
                    ACCOUNTS_VOICED[key].yue[level],
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
            const expected = sorted(placeholdersIn(ACCOUNTS_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                ACCOUNTS_VOICED[key][language].forEach((text, index) => {
                    expect(sorted(placeholdersIn(text)), `${key} ${language} L${index + 1}`).toEqual(
                        expected,
                    );
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
            const required = ACCOUNTS_FACTS[key];
            for (const language of LANGUAGES) {
                ACCOUNTS_VOICED[key][language].forEach((text, index) => {
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
            const entry = ACCOUNTS_FACTS[key] as
                | { en: readonly string[]; yue: readonly string[] }
                | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* The two removal outcomes may never be confused for one another             */
/* -------------------------------------------------------------------------- */

describe("removing the active account tells the truth about what replaced it", () => {
    it("never lets the fallback and the fully-signed-out messages share wording", () => {
        for (let level = 0; level < 5; level++) {
            for (const language of LANGUAGES) {
                expect(
                    ACCOUNTS_VOICED["settings.github.accounts.removedFallback"][language][level],
                ).not.toBe(ACCOUNTS_VOICED["settings.github.accounts.removedNone"][language][level]);
            }
        }
    });
});
