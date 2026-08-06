/**
 * The render mask drawing surface's catalogue, checked directly, before anything registers it.
 *
 * `maskDraw.ts` is not spread into `SURFACE_VOICED` / `SURFACE_FIXED` / `SURFACE_FACTS` -- see
 * that file's own header for why -- so `appCopy.test.ts` and `catalogueCoverage.test.ts`
 * cannot see this module at all. This mirrors what `speed.test.ts` does for the Speed dial's
 * catalogue: the same integrity checks, applied directly to `MASKDRAW_VOICED`,
 * `MASKDRAW_FIXED` and `MASKDRAW_FACTS` by importing them straight from `./maskDraw.js`.
 */

import { describe, expect, it } from "vitest";

import { MASKDRAW_FACTS, MASKDRAW_FIXED, MASKDRAW_VOICED } from "./maskDraw.js";

type VoicedKey = keyof typeof MASKDRAW_VOICED;
type FixedKey = keyof typeof MASKDRAW_FIXED;

const LANGUAGES = ["en", "yue"] as const;

function voicedKeys(): VoicedKey[] {
    return Object.keys(MASKDRAW_VOICED) as VoicedKey[];
}

function fixedKeys(): FixedKey[] {
    return Object.keys(MASKDRAW_FIXED) as FixedKey[];
}

describe("the mask-draw catalogue's shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys()) {
            expect(MASKDRAW_VOICED[key].en, key).toHaveLength(5);
            expect(MASKDRAW_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere, voiced or fixed", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                MASKDRAW_VOICED[key][language].forEach((text, index) => {
                    expect(text.trim(), `${key} ${language} L${index + 1}`).not.toBe("");
                });
            }
        }
        for (const key of fixedKeys()) {
            for (const language of LANGUAGES) {
                expect(MASKDRAW_FIXED[key][language].trim(), `${key} ${language}`).not.toBe("");
            }
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                for (const text of MASKDRAW_VOICED[key][language]) {
                    expect(text, `${key} ${language}`).not.toContain("—");
                }
            }
        }
        for (const key of fixedKeys()) {
            for (const language of LANGUAGES) {
                expect(MASKDRAW_FIXED[key][language], key).not.toContain("—");
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
                const strings = MASKDRAW_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys()) {
            for (let level = 0; level < 5; level++) {
                expect(MASKDRAW_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(MASKDRAW_VOICED[key].yue[level]);
            }
        }
    });

    it("keeps level 1 free of the playful markers level 5 is allowed to use", () => {
        for (const key of voicedKeys()) {
            for (const language of LANGUAGES) {
                const level1 = MASKDRAW_VOICED[key][language][0];
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
            const expected = sorted(placeholdersIn(MASKDRAW_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                MASKDRAW_VOICED[key][language].forEach((text, index) => {
                    expect(sorted(placeholdersIn(text)), `${key} ${language} L${index + 1}`).toEqual(expected);
                });
            }
        }
    });
});

describe("the cloud-render fidelity warning never softens into a maybe", () => {
    it("keeps every required fact at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of voicedKeys()) {
            const required = MASKDRAW_FACTS[key];
            for (const language of LANGUAGES) {
                MASKDRAW_VOICED[key][language].forEach((text, index) => {
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
            "the funny level styles the voice and never the facts. A render-mask message that " +
                "stops naming the real numbers, or stops saying 'whole world' for the one path " +
                "that silently ignores an unsupported mask, is a broken warning rather than a " +
                "funny one.",
        ).toEqual([]);
    });

    it("names a fact for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = voicedKeys().filter((key) => {
            const entry = MASKDRAW_FACTS[key] as { en: readonly string[]; yue: readonly string[] } | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });

    it("never confuses the cloud warning with the local reassurance", () => {
        for (let level = 0; level < 5; level++) {
            for (const language of LANGUAGES) {
                expect(MASKDRAW_VOICED["mask.fidelity.cloudUnsupported"][language][level]).not.toBe(
                    MASKDRAW_VOICED["mask.fidelity.local"][language][level],
                );
            }
        }
    });
});
