/**
 * `tabGroupPicker.ts`'s own integrity, checked directly rather than through the merged
 * catalogue.
 *
 * `appCopy.test.ts` proves these properties for every surface once a module is spread into
 * `APP_VOICED`/`APP_FIXED`/`FACTS` -- but `tabGroupPicker.ts` is deliberately not registered
 * there yet (see this module's own header comment). This file holds it to the same shape the
 * merged catalogue requires anyway, exactly as `project.test.ts` and `pathField.test.ts` do
 * for their own not-yet-registered surfaces.
 *
 * Mirrors the checks in `../appCopy.test.ts` and `./project.test.ts`, narrowed to this
 * module's own keys.
 */

import { describe, expect, it } from "vitest";

import { TABGROUPPICKER_FACTS, TABGROUPPICKER_FIXED, TABGROUPPICKER_VOICED } from "./tabGroupPicker.js";

const LANGUAGES = ["en", "yue"] as const;

type VoicedKey = keyof typeof TABGROUPPICKER_VOICED;
type FixedKey = keyof typeof TABGROUPPICKER_FIXED;

const voicedKeys = Object.keys(TABGROUPPICKER_VOICED) as VoicedKey[];
const fixedKeys = Object.keys(TABGROUPPICKER_FIXED) as FixedKey[];

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

describe("tabGroupPicker.ts: shape", () => {
    it("declares at least one key of each kind, so this is a real surface", () => {
        expect(voicedKeys.length).toBeGreaterThan(0);
        expect(fixedKeys.length).toBeGreaterThan(0);
    });

    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys) {
            expect(TABGROUPPICKER_VOICED[key].en, key).toHaveLength(5);
            expect(TABGROUPPICKER_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere, voiced or fixed", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                TABGROUPPICKER_VOICED[key][language].forEach((text, index) => {
                    expect(text.trim(), `${key} ${language} L${index + 1}`).not.toBe("");
                });
            }
        }
        for (const key of fixedKeys) {
            for (const language of LANGUAGES) {
                expect(TABGROUPPICKER_FIXED[key][language].trim(), `${key} ${language}`).not.toBe("");
            }
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                TABGROUPPICKER_VOICED[key][language].forEach((text, index) => {
                    expect(text, `${key} ${language} L${index + 1}`).not.toContain("—");
                });
            }
        }
        for (const key of fixedKeys) {
            for (const language of LANGUAGES) {
                expect(TABGROUPPICKER_FIXED[key][language], `${key} ${language}`).not.toContain("—");
            }
        }
    });

    it("keys nothing twice across the two tiers", () => {
        const overlap = voicedKeys.filter((key) => (fixedKeys as string[]).includes(key));
        expect(overlap).toEqual([]);
    });
});

describe("tabGroupPicker.ts: the levels are levels", () => {
    it("reads differently at level 1 and at level 5, in both languages", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                const strings = TABGROUPPICKER_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys) {
            for (let level = 0; level < 5; level++) {
                expect(TABGROUPPICKER_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(
                    TABGROUPPICKER_VOICED[key].yue[level],
                );
            }
        }
    });
});

describe("tabGroupPicker.ts: no level drops a value out of a sentence", () => {
    it("uses the same placeholders at every level, in both languages", () => {
        for (const key of voicedKeys) {
            const expected = sorted(placeholdersIn(TABGROUPPICKER_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                TABGROUPPICKER_VOICED[key][language].forEach((text, index) => {
                    expect(sorted(placeholdersIn(text)), `${key} ${language} L${index + 1}`).toEqual(
                        expected,
                    );
                });
            }
        }
    });
});

describe("tabGroupPicker.ts: no level stops saying what the message is for", () => {
    it("keeps every required literal at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of voicedKeys) {
            const required = TABGROUPPICKER_FACTS[key];
            for (const language of LANGUAGES) {
                TABGROUPPICKER_VOICED[key][language].forEach((text, index) => {
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
                "naming which group the tab would join, how many tabs are already there, or " +
                "that a search matched nothing, is a broken picker rather than a funny one.",
        ).toEqual([]);
    });

    it("names a fact for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = voicedKeys.filter((key) => {
            const entry = TABGROUPPICKER_FACTS[key] as
                | { en: readonly string[]; yue: readonly string[] }
                | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});

describe("tabGroupPicker.ts: the rowName facts are the interpolated values", () => {
    it("pins the {group} and {count} placeholders themselves, not paraphrases of them", () => {
        expect(TABGROUPPICKER_FACTS["tabGroupPicker.rowName"].en).toEqual(
            expect.arrayContaining(["{group}", "{count}"]),
        );
        expect(TABGROUPPICKER_FACTS["tabGroupPicker.rowName"].yue).toEqual(
            expect.arrayContaining(["{group}", "{count}"]),
        );
    });
});

describe("tabGroupPicker.ts: menuEntry matches the platform convention", () => {
    it("ends with the ellipsis that marks a command opening a further surface", () => {
        expect(TABGROUPPICKER_FIXED["tabGroupPicker.menuEntry"].en.endsWith("...")).toBe(true);
        expect(TABGROUPPICKER_FIXED["tabGroupPicker.menuEntry"].yue.endsWith("...")).toBe(true);
    });
});
