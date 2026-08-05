/**
 * `pathField.ts`'s own integrity, checked directly rather than through the merged catalogue.
 *
 * Registration in `surfaces/index.ts` happens in a later phase, so this module is not yet
 * reachable through `APP_VOICED`/`APP_FIXED`/`FACTS` or exercised by `appCopy.test.ts` /
 * `catalogueCoverage.test.ts`. This file holds it to the same shape those would, the way
 * `project.test.ts` and `world.test.ts` do for their own surfaces.
 */

import { describe, expect, it } from "vitest";

import { PATHFIELD_FACTS, PATHFIELD_FIXED, PATHFIELD_VOICED } from "./pathField.js";

const LANGUAGES = ["en", "yue"] as const;

type VoicedKey = keyof typeof PATHFIELD_VOICED;
type FixedKey = keyof typeof PATHFIELD_FIXED;

const voicedKeys = Object.keys(PATHFIELD_VOICED) as VoicedKey[];
const fixedKeys = Object.keys(PATHFIELD_FIXED) as FixedKey[];

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

describe("pathField.ts: shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys) {
            expect(PATHFIELD_VOICED[key].en, key).toHaveLength(5);
            expect(PATHFIELD_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere, voiced or fixed", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                PATHFIELD_VOICED[key][language].forEach((text, index) => {
                    expect(text.trim(), `${key} ${language} L${index + 1}`).not.toBe("");
                });
            }
        }
        for (const key of fixedKeys) {
            for (const language of LANGUAGES) {
                expect(PATHFIELD_FIXED[key][language].trim(), `${key} ${language}`).not.toBe("");
            }
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                PATHFIELD_VOICED[key][language].forEach((text, index) => {
                    expect(text, `${key} ${language} L${index + 1}`).not.toContain("—");
                });
            }
        }
        for (const key of fixedKeys) {
            for (const language of LANGUAGES) {
                expect(PATHFIELD_FIXED[key][language], `${key} ${language}`).not.toContain("—");
            }
        }
    });

    it("keys nothing twice across the two tiers", () => {
        const overlap = voicedKeys.filter((key) => (fixedKeys as string[]).includes(key));
        expect(overlap).toEqual([]);
    });
});

describe("pathField.ts: the levels are levels", () => {
    it("reads differently at level 1 and at level 5, in both languages", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                const strings = PATHFIELD_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys) {
            for (let level = 0; level < 5; level++) {
                expect(PATHFIELD_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(
                    PATHFIELD_VOICED[key].yue[level],
                );
            }
        }
    });
});

describe("pathField.ts: no level drops a value out of a sentence", () => {
    it("uses the same placeholders at every level, in both languages", () => {
        for (const key of voicedKeys) {
            const expected = sorted(placeholdersIn(PATHFIELD_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                PATHFIELD_VOICED[key][language].forEach((text, index) => {
                    expect(sorted(placeholdersIn(text)), `${key} ${language} L${index + 1}`).toEqual(
                        expected,
                    );
                });
            }
        }
    });

    it("carries {field} in every voiced level, so the message always names the field", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                PATHFIELD_VOICED[key][language].forEach((text, index) => {
                    expect(text, `${key} ${language} L${index + 1}`).toContain("{field}");
                });
            }
        }
    });
});

describe("pathField.ts: no level stops saying what the message is for", () => {
    it("keeps every required literal at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of voicedKeys) {
            const required = PATHFIELD_FACTS[key];
            for (const language of LANGUAGES) {
                PATHFIELD_VOICED[key][language].forEach((text, index) => {
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
                "naming that this needs the desktop app, or that typing still works, is a " +
                "broken explanation rather than a funny one.",
        ).toEqual([]);
    });

    it("names a fact for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = voicedKeys.filter((key) => {
            const entry = PATHFIELD_FACTS[key] as
                | { en: readonly string[]; yue: readonly string[] }
                | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});

describe("pathField.ts: the fixed labels name the field, never a bare 'Browse'", () => {
    it("builds an unambiguous accessible name once {field} is filled in", () => {
        const filled = PATHFIELD_FIXED["pathField.browse.aria"].en.replace("{field}", "world folder");
        expect(filled).toBe("Browse for world folder");
        expect(filled).not.toBe("Browse");
    });
});
