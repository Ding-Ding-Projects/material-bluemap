/**
 * The gh command-line tool's account catalogue, checked directly, mirroring what
 * `surfaces/accounts.test.ts` does for `accounts.ts` next door.
 */

import { describe, expect, it } from "vitest";

import { GHCLIACCOUNTS_FACTS, GHCLIACCOUNTS_FIXED, GHCLIACCOUNTS_VOICED } from "./ghCliAccounts.js";

type VoicedKey = keyof typeof GHCLIACCOUNTS_VOICED;
type FixedKey = keyof typeof GHCLIACCOUNTS_FIXED;

const LANGUAGES = ["en", "yue"] as const;

function voicedKeys(): VoicedKey[] {
    return Object.keys(GHCLIACCOUNTS_VOICED) as VoicedKey[];
}

function fixedKeys(): FixedKey[] {
    return Object.keys(GHCLIACCOUNTS_FIXED) as FixedKey[];
}

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

describe("the gh CLI accounts catalogue's shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys()) {
            expect(GHCLIACCOUNTS_VOICED[key].en, key).toHaveLength(5);
            expect(GHCLIACCOUNTS_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere, voiced or fixed", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                GHCLIACCOUNTS_VOICED[key][language].forEach((text, index) => {
                    expect(text.trim(), `${key} ${language} L${index + 1}`).not.toBe("");
                });
            }
        }
        for (const key of fixedKeys()) {
            for (const language of LANGUAGES) {
                expect(GHCLIACCOUNTS_FIXED[key][language].trim(), `${key} ${language}`).not.toBe("");
            }
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                for (const text of GHCLIACCOUNTS_VOICED[key][language]) {
                    expect(text, `${key} ${language}`).not.toContain("—");
                }
            }
        }
        for (const key of fixedKeys()) {
            for (const language of LANGUAGES) {
                expect(GHCLIACCOUNTS_FIXED[key][language], key).not.toContain("—");
            }
        }
    });

    it("keys nothing twice across the two tiers", () => {
        const keys = [...voicedKeys(), ...fixedKeys()];
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("never quotes a token, exactly as the app's own accounts surface never does", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                for (const text of GHCLIACCOUNTS_VOICED[key][language]) {
                    expect(text.toLowerCase(), `${key} ${language}`).not.toMatch(/\bghp_|ghu_|ghs_|gho_/);
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
                const strings = GHCLIACCOUNTS_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys()) {
            for (let level = 0; level < 5; level++) {
                expect(GHCLIACCOUNTS_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(
                    GHCLIACCOUNTS_VOICED[key].yue[level],
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
            const expected = sorted(placeholdersIn(GHCLIACCOUNTS_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                GHCLIACCOUNTS_VOICED[key][language].forEach((text, index) => {
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
            const required = GHCLIACCOUNTS_FACTS[key];
            for (const language of LANGUAGES) {
                GHCLIACCOUNTS_VOICED[key][language].forEach((text, index) => {
                    for (const fact of required[language]) {
                        if (!text.includes(fact)) missing.push(`${key} ${language} L${index + 1} lost "${fact}"`);
                    }
                });
            }
        }
        expect(
            missing,
            "the funny level styles the voice and never the facts. A level that stops naming what " +
                "a message is for is a broken message rather than a funny one.",
        ).toEqual([]);
    });

    it("names a fact for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = voicedKeys().filter((key) => {
            const entry = GHCLIACCOUNTS_FACTS[key] as
                | { en: readonly string[]; yue: readonly string[] }
                | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* The one property this whole surface exists to keep true                   */
/* -------------------------------------------------------------------------- */

describe("the machine-wide switch warning can never be quietly softened away", () => {
    it("keeps 'whole computer' in every English level and its Cantonese equivalent in every yue level", () => {
        for (const text of GHCLIACCOUNTS_VOICED["settings.github.ghCli.switchWarning"].en) {
            expect(text).toContain("whole computer");
        }
        for (const text of GHCLIACCOUNTS_VOICED["settings.github.ghCli.switchWarning"].yue) {
            expect(text).toContain("成部電腦");
        }
    });
});

describe("the two-stores explainer never claims to be one list", () => {
    it("says 'gh' and 'separate' at every level, in both languages", () => {
        for (const text of GHCLIACCOUNTS_VOICED["settings.github.ghCli.explainer"].en) {
            expect(text).toContain("gh");
            expect(text.toLowerCase()).toContain("separate");
        }
        for (const text of GHCLIACCOUNTS_VOICED["settings.github.ghCli.explainer"].yue) {
            expect(text).toContain("gh");
            expect(text).toContain("獨立");
        }
    });
});
