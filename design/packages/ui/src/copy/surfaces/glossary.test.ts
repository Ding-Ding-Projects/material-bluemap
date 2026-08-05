/**
 * `glossary.ts`'s own integrity, checked directly rather than through the merged catalogue -
 * the same shape `pathField.test.ts` holds `pathField.ts` to.
 */

import { describe, expect, it } from "vitest";

import { GLOSSARY_FACTS, GLOSSARY_FIXED, GLOSSARY_VOICED } from "./glossary.js";
import { GLOSSARY_TERMS } from "../../components/glossary/glossaryTerms.js";

const LANGUAGES = ["en", "yue"] as const;

type VoicedKey = keyof typeof GLOSSARY_VOICED;
type FixedKey = keyof typeof GLOSSARY_FIXED;

const voicedKeys = Object.keys(GLOSSARY_VOICED) as VoicedKey[];
const fixedKeys = Object.keys(GLOSSARY_FIXED) as FixedKey[];

describe("glossary.ts: shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys) {
            expect(GLOSSARY_VOICED[key].en, key).toHaveLength(5);
            expect(GLOSSARY_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere, voiced or fixed", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                GLOSSARY_VOICED[key][language].forEach((text, index) => {
                    expect(text.trim(), `${key} ${language} L${index + 1}`).not.toBe("");
                });
            }
        }
        for (const key of fixedKeys) {
            for (const language of LANGUAGES) {
                expect(GLOSSARY_FIXED[key][language].trim(), `${key} ${language}`).not.toBe("");
            }
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                GLOSSARY_VOICED[key][language].forEach((text, index) => {
                    expect(text, `${key} ${language} L${index + 1}`).not.toContain("—");
                });
            }
        }
        for (const key of fixedKeys) {
            for (const language of LANGUAGES) {
                expect(GLOSSARY_FIXED[key][language], `${key} ${language}`).not.toContain("—");
            }
        }
    });

    it("keys nothing twice across the two tiers", () => {
        const overlap = voicedKeys.filter((key) => (fixedKeys as string[]).includes(key));
        expect(overlap).toEqual([]);
    });

    it("has one voiced definition for every term glossaryTerms.ts declares, and nothing extra", () => {
        const termKeys = Object.values(GLOSSARY_TERMS)
            .map((meta) => meta.key)
            .sort();
        expect([...voicedKeys].sort()).toEqual(termKeys);
    });
});

describe("glossary.ts: the levels are levels", () => {
    it("reads differently at level 1 and at level 5, in both languages", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                const strings = GLOSSARY_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys) {
            for (let level = 0; level < 5; level++) {
                expect(GLOSSARY_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(
                    GLOSSARY_VOICED[key].yue[level],
                );
            }
        }
    });
});

describe("glossary.ts: no level drops a fact out of the sentence", () => {
    it("keeps every required literal at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of voicedKeys) {
            const required = GLOSSARY_FACTS[key];
            for (const language of LANGUAGES) {
                GLOSSARY_VOICED[key][language].forEach((text, index) => {
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
            "the funny level styles the voice and never the facts. A definition that stops " +
                "naming the technical fact it exists to pin is a broken definition, not a " +
                "funny one.",
        ).toEqual([]);
    });

    it("names at least one fact for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = voicedKeys.filter((key) => {
            const entry = GLOSSARY_FACTS[key] as
                | { en: readonly string[]; yue: readonly string[] }
                | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});

describe("glossary.ts: the fixed aria template names the term, never a bare question", () => {
    it("builds an unambiguous accessible name once {term} is filled in", () => {
        const filled = GLOSSARY_FIXED["glossary.term.aria"].en.replace("{term}", "storage");
        expect(filled).toBe('What does "storage" mean?');
    });
});
