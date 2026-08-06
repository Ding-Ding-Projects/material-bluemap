/**
 * The live Speed control's catalogue, checked directly, the same way `speed.test.ts` checks
 * `speed.ts` -- see that file's own header for why a per-surface module can be checked on its
 * own rather than only through `appCopy.test.ts`'s aggregate scan.
 */

import { describe, expect, it } from "vitest";

import { LIVESPEED_FACTS, LIVESPEED_FIXED, LIVESPEED_VOICED } from "./liveSpeed.js";

type VoicedKey = keyof typeof LIVESPEED_VOICED;
type FixedKey = keyof typeof LIVESPEED_FIXED;

const LANGUAGES = ["en", "yue"] as const;

function voicedKeys(): VoicedKey[] {
    return Object.keys(LIVESPEED_VOICED) as VoicedKey[];
}

function fixedKeys(): FixedKey[] {
    return Object.keys(LIVESPEED_FIXED) as FixedKey[];
}

describe("the live speed catalogue's shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys()) {
            expect(LIVESPEED_VOICED[key].en, key).toHaveLength(5);
            expect(LIVESPEED_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere, voiced or fixed", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                LIVESPEED_VOICED[key][language].forEach((text, index) => {
                    expect(text.trim(), `${key} ${language} L${index + 1}`).not.toBe("");
                });
            }
        }
        for (const key of fixedKeys()) {
            for (const language of LANGUAGES) {
                expect(LIVESPEED_FIXED[key][language].trim(), `${key} ${language}`).not.toBe("");
            }
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                for (const text of LIVESPEED_VOICED[key][language]) {
                    expect(text, `${key} ${language}`).not.toContain("—");
                }
            }
        }
        for (const key of fixedKeys()) {
            for (const language of LANGUAGES) {
                expect(LIVESPEED_FIXED[key][language], key).not.toContain("—");
            }
        }
    });

    it("keys nothing twice across the two tiers", () => {
        const keys = [...voicedKeys(), ...fixedKeys()];
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe("the levels are levels", () => {
    it("reads differently at level 1 and at level 5, in both languages", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                const strings = LIVESPEED_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys()) {
            for (let level = 0; level < 5; level++) {
                expect(LIVESPEED_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(
                    LIVESPEED_VOICED[key].yue[level],
                );
            }
        }
    });

    it("keeps level 1 free of the playful markers level 5 is allowed to use", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                const level1 = LIVESPEED_VOICED[key][language][0];
                expect(level1, `${key} ${language} L1`).not.toMatch(/[!！]/);
            }
        }
    });
});

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
            const expected = sorted(placeholdersIn(LIVESPEED_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                LIVESPEED_VOICED[key][language].forEach((text, index) => {
                    expect(sorted(placeholdersIn(text)), `${key} ${language} L${index + 1}`).toEqual(expected);
                });
            }
        }
    });
});

describe("no level stops naming the real facts", () => {
    it("keeps every required literal at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of voicedKeys()) {
            const required = LIVESPEED_FACTS[key];
            for (const language of LANGUAGES) {
                LIVESPEED_VOICED[key][language].forEach((text, index) => {
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
            "the funny level styles the voice and never the facts: a level that stops naming the " +
                "level number, the route, or the exact settings this dial does and does not touch is " +
                "a broken message rather than a funny one.",
        ).toEqual([]);
    });
});

describe("outcomeApplied and outcomeBlocked never share wording", () => {
    it("keeps the two states distinct at every level, in both languages", () => {
        for (let level = 0; level < 5; level++) {
            for (const language of LANGUAGES) {
                expect(LIVESPEED_VOICED["liveSpeed.outcomeApplied"][language][level]).not.toBe(
                    LIVESPEED_VOICED["liveSpeed.outcomeBlocked"][language][level],
                );
            }
        }
    });
});

describe("the deferred note is never optional", () => {
    it("names thread count, thread priority and the next render at every level", () => {
        for (const language of LANGUAGES) {
            for (const text of LIVESPEED_VOICED["liveSpeed.deferredNote"][language]) {
                for (const fact of LIVESPEED_FACTS["liveSpeed.deferredNote"][language]) {
                    expect(text).toContain(fact);
                }
            }
        }
    });
});
