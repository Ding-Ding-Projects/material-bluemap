import { describe, expect, it } from "vitest";

import { FIXED, VOICED } from "./strings.js";

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
});
