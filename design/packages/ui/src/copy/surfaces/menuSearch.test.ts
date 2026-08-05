/**
 * `menuSearch.ts`'s own integrity, checked directly rather than through the merged
 * catalogue.
 *
 * `appCopy.test.ts` proves these properties for every surface once a module is spread into
 * `APP_VOICED`/`APP_FIXED`/`FACTS` -- but `menuSearch.ts` is deliberately not registered
 * there yet (see this module's own header comment). This file holds it to the same shape the
 * merged catalogue requires anyway, exactly as `tabGroupPicker.test.ts` and `project.test.ts`
 * do for their own not-yet-registered surfaces.
 *
 * Mirrors the checks in `../appCopy.test.ts` and `./tabGroupPicker.test.ts`, narrowed to this
 * module's own keys.
 */

import { describe, expect, it } from "vitest";

import { MENUSEARCH_FACTS, MENUSEARCH_FIXED, MENUSEARCH_VOICED } from "./menuSearch.js";

const LANGUAGES = ["en", "yue"] as const;

type VoicedKey = keyof typeof MENUSEARCH_VOICED;
type FixedKey = keyof typeof MENUSEARCH_FIXED;

const voicedKeys = Object.keys(MENUSEARCH_VOICED) as VoicedKey[];
const fixedKeys = Object.keys(MENUSEARCH_FIXED) as FixedKey[];

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

describe("menuSearch.ts: shape", () => {
    it("declares at least one key of each kind, so this is a real surface", () => {
        expect(voicedKeys.length).toBeGreaterThan(0);
        expect(fixedKeys.length).toBeGreaterThan(0);
    });

    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys) {
            expect(MENUSEARCH_VOICED[key].en, key).toHaveLength(5);
            expect(MENUSEARCH_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere, voiced or fixed", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                MENUSEARCH_VOICED[key][language].forEach((text, index) => {
                    expect(text.trim(), `${key} ${language} L${index + 1}`).not.toBe("");
                });
            }
        }
        for (const key of fixedKeys) {
            for (const language of LANGUAGES) {
                expect(MENUSEARCH_FIXED[key][language].trim(), `${key} ${language}`).not.toBe("");
            }
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                MENUSEARCH_VOICED[key][language].forEach((text, index) => {
                    expect(text, `${key} ${language} L${index + 1}`).not.toContain("—");
                });
            }
        }
        for (const key of fixedKeys) {
            for (const language of LANGUAGES) {
                expect(MENUSEARCH_FIXED[key][language], `${key} ${language}`).not.toContain("—");
            }
        }
    });

    it("keys nothing twice across the two tiers", () => {
        const overlap = voicedKeys.filter((key) => (fixedKeys as string[]).includes(key));
        expect(overlap).toEqual([]);
    });
});

describe("menuSearch.ts: the levels are levels", () => {
    it("reads differently at level 1 and at level 5, in both languages", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                const strings = MENUSEARCH_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys) {
            for (let level = 0; level < 5; level++) {
                expect(MENUSEARCH_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(
                    MENUSEARCH_VOICED[key].yue[level],
                );
            }
        }
    });
});

describe("menuSearch.ts: no level drops a value out of a sentence", () => {
    it("uses the same placeholders at every level, in both languages", () => {
        for (const key of voicedKeys) {
            const expected = sorted(placeholdersIn(MENUSEARCH_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                MENUSEARCH_VOICED[key][language].forEach((text, index) => {
                    expect(sorted(placeholdersIn(text)), `${key} ${language} L${index + 1}`).toEqual(
                        expected,
                    );
                });
            }
        }
    });
});

describe("menuSearch.ts: no level stops saying what the message is for", () => {
    it("keeps every required literal at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of voicedKeys) {
            const required = MENUSEARCH_FACTS[key];
            for (const language of LANGUAGES) {
                MENUSEARCH_VOICED[key][language].forEach((text, index) => {
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
                "saying to clear the search, or that the rest come back once it is cleared, " +
                "is a broken filter rather than a funny one.",
        ).toEqual([]);
    });

    it("names a fact for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = voicedKeys.filter((key) => {
            const entry = MENUSEARCH_FACTS[key] as
                | { en: readonly string[]; yue: readonly string[] }
                | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});

describe("menuSearch.ts: filter matches the platform convention", () => {
    it("carries the exact same wording tabs.menu.filter already uses", () => {
        // Not a coincidence: a reader who has met one of this application's context-menu
        // filters should meet the same label on every other one.
        expect(MENUSEARCH_FIXED["menuSearch.filter"].en).toBe("Filter these commands");
    });
});
