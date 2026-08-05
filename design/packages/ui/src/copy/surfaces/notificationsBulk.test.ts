/**
 * `notificationsBulk.ts`'s own integrity, checked directly rather than through the merged
 * catalogue.
 *
 * Registration in `surfaces/index.ts` happens in a later phase, so this module is not yet
 * reachable through `APP_VOICED`/`APP_FIXED`/`FACTS` and is not exercised by
 * `appCopy.test.ts` / `catalogueCoverage.test.ts`. This file holds it to the same shape those
 * would, the way `pathField.test.ts`, `project.test.ts` and `world.test.ts` do for their own
 * surfaces.
 */

import { describe, expect, it } from "vitest";

import {
    NOTIFICATIONSBULK_FACTS,
    NOTIFICATIONSBULK_FIXED,
    NOTIFICATIONSBULK_VOICED,
} from "./notificationsBulk.js";

const LANGUAGES = ["en", "yue"] as const;

type VoicedKey = keyof typeof NOTIFICATIONSBULK_VOICED;
type FixedKey = keyof typeof NOTIFICATIONSBULK_FIXED;

const voicedKeys = Object.keys(NOTIFICATIONSBULK_VOICED) as VoicedKey[];
const fixedKeys = Object.keys(NOTIFICATIONSBULK_FIXED) as FixedKey[];

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

describe("notificationsBulk.ts: shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys) {
            expect(NOTIFICATIONSBULK_VOICED[key].en, key).toHaveLength(5);
            expect(NOTIFICATIONSBULK_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere, voiced or fixed", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                NOTIFICATIONSBULK_VOICED[key][language].forEach((text, index) => {
                    expect(text.trim(), `${key} ${language} L${index + 1}`).not.toBe("");
                });
            }
        }
        for (const key of fixedKeys) {
            for (const language of LANGUAGES) {
                expect(NOTIFICATIONSBULK_FIXED[key][language].trim(), `${key} ${language}`).not.toBe("");
            }
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                NOTIFICATIONSBULK_VOICED[key][language].forEach((text, index) => {
                    expect(text, `${key} ${language} L${index + 1}`).not.toContain("—");
                });
            }
        }
        for (const key of fixedKeys) {
            for (const language of LANGUAGES) {
                expect(NOTIFICATIONSBULK_FIXED[key][language], `${key} ${language}`).not.toContain("—");
            }
        }
    });

    it("keys nothing twice across the two tiers", () => {
        const overlap = voicedKeys.filter((key) => (fixedKeys as string[]).includes(key));
        expect(overlap).toEqual([]);
    });
});

describe("notificationsBulk.ts: the levels are levels", () => {
    it("reads differently at level 1 and at level 5, in both languages", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                const strings = NOTIFICATIONSBULK_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys) {
            for (let level = 0; level < 5; level++) {
                expect(NOTIFICATIONSBULK_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(
                    NOTIFICATIONSBULK_VOICED[key].yue[level],
                );
            }
        }
    });
});

describe("notificationsBulk.ts: no level drops a value out of a sentence", () => {
    it("uses the same placeholders at every level, in both languages", () => {
        for (const key of voicedKeys) {
            const expected = sorted(placeholdersIn(NOTIFICATIONSBULK_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                NOTIFICATIONSBULK_VOICED[key][language].forEach((text, index) => {
                    expect(sorted(placeholdersIn(text)), `${key} ${language} L${index + 1}`).toEqual(
                        expected,
                    );
                });
            }
        }
    });

    it("carries {count} in every voiced level, so the number in the preview is never dropped", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                NOTIFICATIONSBULK_VOICED[key][language].forEach((text, index) => {
                    expect(text, `${key} ${language} L${index + 1}`).toContain("{count}");
                });
            }
        }
    });
});

describe("notificationsBulk.ts: no level stops saying what the message is for", () => {
    it("keeps every required literal at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of voicedKeys) {
            const required = NOTIFICATIONSBULK_FACTS[key];
            for (const language of LANGUAGES) {
                NOTIFICATIONSBULK_VOICED[key][language].forEach((text, index) => {
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
            "the funny level styles the voice and never the facts. A level that stops saying " +
                "a dismissed notice is still in the history, that an export matches the active " +
                "filter, that marking as read can sweep in notices nobody picked, or that a " +
                "delete cannot be undone, is a broken explanation rather than a funny one.",
        ).toEqual([]);
    });

    it("names a fact for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = voicedKeys.filter((key) => {
            const entry = NOTIFICATIONSBULK_FACTS[key] as
                | { en: readonly string[]; yue: readonly string[] }
                | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});

describe("notificationsBulk.ts: the delete explanation never loses its irreversibility", () => {
    it("says 'cannot be undone' at every level in English, and its Cantonese equivalent", () => {
        for (const text of NOTIFICATIONSBULK_VOICED["noticeBulk.deleteExplain"].en) {
            expect(text).toContain("cannot be undone");
        }
        for (const text of NOTIFICATIONSBULK_VOICED["noticeBulk.deleteExplain"].yue) {
            expect(text).toContain("冇得復原");
        }
    });
});

describe("notificationsBulk.ts: the fixed labels carry their placeholder through", () => {
    it("builds an unambiguous checkbox name once {summary} is filled in", () => {
        const filled = NOTIFICATIONSBULK_FIXED["noticeBulk.selectRow"].en.replace(
            "{summary}",
            "Save failed",
        );
        expect(filled).toBe("Select: Save failed");
    });

    it("names both scopes of select-all differently, so the label says which one it is", () => {
        expect(NOTIFICATIONSBULK_FIXED["noticeBulk.selectAllVisible"].en).toContain("shown");
        expect(NOTIFICATIONSBULK_FIXED["noticeBulk.selectAllHistory"].en).toContain("history");
        expect(NOTIFICATIONSBULK_FIXED["noticeBulk.selectAllVisible"].en).not.toBe(
            NOTIFICATIONSBULK_FIXED["noticeBulk.selectAllHistory"].en,
        );
    });
});
