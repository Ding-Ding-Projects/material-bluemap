import { describe, expect, it } from "vitest";

import { FACTS, FIXED, VOICED, type VoicedKey } from "./strings.js";

/**
 * Structural checks on the catalogue itself, not on any one rendered surface.
 *
 * The contract is that every voiced entry reaches all five funny levels, in both
 * languages, with no gaps a resolver would have to paper over at render time. This
 * does not check the *wording* is funnier at level 5 than level 1 - that is a
 * judgement call for whoever writes the copy - only that the shape the resolver
 * depends on is actually there for every entry, so a level can never silently fall
 * through to a blank string.
 */
describe("i18n string catalogue", () => {
    it("gives every voiced entry exactly five non-empty English strings", () => {
        const offenders: string[] = [];
        for (const [key, entry] of Object.entries(VOICED)) {
            if (entry.en.length !== 5) offenders.push(`${key}: ${entry.en.length} English strings`);
            for (const [level, text] of entry.en.entries()) {
                if (text.trim() === "") offenders.push(`${key}: English level ${level + 1} is blank`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("gives every voiced entry exactly five non-empty Cantonese strings", () => {
        const offenders: string[] = [];
        for (const [key, entry] of Object.entries(VOICED)) {
            if (entry.yue.length !== 5) offenders.push(`${key}: ${entry.yue.length} Cantonese strings`);
            for (const [level, text] of entry.yue.entries()) {
                if (text.trim() === "") offenders.push(`${key}: Cantonese level ${level + 1} is blank`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("gives every fixed entry a non-empty string in both languages", () => {
        const offenders: string[] = [];
        for (const [key, entry] of Object.entries(FIXED)) {
            if (entry.en.trim() === "") offenders.push(`${key}: English is blank`);
            if (entry.yue.trim() === "") offenders.push(`${key}: Cantonese is blank`);
        }
        expect(offenders).toEqual([]);
    });

    it("never lets the same key exist in both catalogues, which would make lookup order matter", () => {
        const voicedKeys = new Set(Object.keys(VOICED));
        const collisions = Object.keys(FIXED).filter((key) => voicedKeys.has(key));
        expect(collisions).toEqual([]);
    });

    it("keeps every entry's placeholder set identical across all five funny levels", () => {
        const placeholdersOf = (text: string): string[] =>
            [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string).sort();

        const offenders: string[] = [];
        for (const [key, entry] of Object.entries(VOICED)) {
            for (const language of ["en", "yue"] as const) {
                const strings = entry[language];
                const first = placeholdersOf(strings[0]);
                for (const [level, text] of strings.entries()) {
                    const here = placeholdersOf(text);
                    if (here.join(",") !== first.join(",")) {
                        offenders.push(
                            `${key}.${language} level ${level + 1} has {${here.join(", ")}} but level 1 has {${first.join(", ")}}`,
                        );
                    }
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    /**
     * This project spells a pause as ordinary words, the same rule `packages/ui`'s own
     * `appCopy.test.ts` enforces on its catalogue. Nothing in this file used one before this
     * check existed (verified by hand at the time this test was written), so the ban costs
     * the existing ~700 lines nothing and only stops a new one from arriving unnoticed.
     */
    it("uses no em-dashes, which this project spells as ordinary words", () => {
        const offenders: string[] = [];
        for (const [key, entry] of Object.entries(VOICED)) {
            for (const language of ["en", "yue"] as const) {
                entry[language].forEach((text, index) => {
                    if (text.includes("—")) offenders.push(`${key}.${language} level ${index + 1}`);
                });
            }
        }
        for (const [key, entry] of Object.entries(FIXED)) {
            for (const language of ["en", "yue"] as const) {
                if (entry[language].includes("—")) offenders.push(`${key}.${language}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});

/**
 * `FACTS`' own doc comment in `strings.ts` explains why it is a `Partial` rather than a
 * mandatory map the way `packages/ui/src/copy/appCopy.ts`'s own `FACTS` is: this checks the
 * entries it does name, exactly the way `appCopy.test.ts`'s "no level stops saying what the
 * message is for" does for its own (mandatory) map, so a fact this catalogue does pin cannot
 * quietly drop out of a playful rewrite.
 */
describe("i18n FACTS: a pinned literal cannot drop out of a playful rewrite", () => {
    it("keeps every named fact at every level, in both languages", () => {
        const missing: string[] = [];
        for (const [key, fact] of Object.entries(FACTS) as [VoicedKey, (typeof FACTS)[VoicedKey]][]) {
            if (fact === undefined) continue;
            const entry = VOICED[key];
            for (const language of ["en", "yue"] as const) {
                entry[language].forEach((text, index) => {
                    for (const literal of fact[language]) {
                        if (!text.includes(literal)) {
                            missing.push(`${key}.${language} level ${index + 1} lost "${literal}"`);
                        }
                    }
                });
            }
        }
        expect(missing).toEqual([]);
    });

    it("names at least one fact, so an entry cannot be listed and guard nothing", () => {
        const empty = Object.entries(FACTS)
            .filter(([, fact]) => fact !== undefined && (fact.en.length === 0 || fact.yue.length === 0))
            .map(([key]) => key);
        expect(empty).toEqual([]);
    });

    it("only names real VOICED keys", () => {
        const unknown = Object.keys(FACTS).filter((key) => !(key in VOICED));
        expect(unknown).toEqual([]);
    });
});
