/**
 * This module's own shape, checked in isolation from the shared catalogue it will eventually
 * join. `copy/surfaces/index.ts` and `copy/catalogueCoverage.test.ts` are owned by another lane
 * mid-flight in this repository, so this file proves the same invariants they would check -
 * five levels a side, facts that survive every level, no dropped or invented placeholder -
 * without importing or editing either.
 */

import { describe, expect, it } from "vitest";
import { DOCSVIEWER_FACTS, DOCSVIEWER_FIXED, DOCSVIEWER_VOICED } from "./docsViewer.js";

const LANGUAGES = ["en", "yue"] as const;

describe("DOCSVIEWER_VOICED", () => {
    it("gives every entry five levels in both languages, none empty", () => {
        for (const [key, entry] of Object.entries(DOCSVIEWER_VOICED)) {
            for (const language of LANGUAGES) {
                expect(entry[language], key).toHaveLength(5);
                for (const text of entry[language]) {
                    expect(text.trim(), key).not.toBe("");
                }
            }
        }
    });

    it("has a fact list for every voiced key, and no fact list for a key that does not exist", () => {
        expect(Object.keys(DOCSVIEWER_FACTS).sort()).toEqual(Object.keys(DOCSVIEWER_VOICED).sort());
    });

    it("keeps every fact substring present at every level, in both languages", () => {
        // Case-insensitive: a fact opening a sentence is capitalized at some levels and not
        // others ("No network" vs "...with no network"), and the substance is what a fact
        // guards, not its sentence-initial casing.
        for (const [key, facts] of Object.entries(DOCSVIEWER_FACTS)) {
            const entry = DOCSVIEWER_VOICED[key as keyof typeof DOCSVIEWER_VOICED];
            for (const language of LANGUAGES) {
                for (const text of entry[language]) {
                    for (const fact of facts[language]) {
                        expect(
                            text.toLowerCase(),
                            `${key} ${language}: "${fact}" missing from "${text}"`,
                        ).toContain(fact.toLowerCase());
                    }
                }
            }
        }
    });

    it("uses the same placeholders at every level of an entry", () => {
        const PLACEHOLDER = /\{\s*([A-Za-z_$][\w$]*)\s*\}/g;
        const placeholdersIn = (text: string): Set<string> => {
            PLACEHOLDER.lastIndex = 0;
            const found = new Set<string>();
            let match: RegExpExecArray | null;
            while ((match = PLACEHOLDER.exec(text)) !== null) found.add(match[1] as string);
            return found;
        };
        for (const [key, entry] of Object.entries(DOCSVIEWER_VOICED)) {
            for (const language of LANGUAGES) {
                const levels = entry[language].map(placeholdersIn);
                const first = levels[0];
                for (const [index, placeholders] of levels.entries()) {
                    expect([...placeholders].sort(), `${key} ${language} level ${index + 1}`).toEqual(
                        [...(first ?? new Set())].sort(),
                    );
                }
            }
        }
    });

    it("does not read as five copies of one string", () => {
        for (const [key, entry] of Object.entries(DOCSVIEWER_VOICED)) {
            for (const language of LANGUAGES) {
                const distinct = new Set(entry[language]);
                expect(distinct.size, `${key} ${language}`).toBeGreaterThan(1);
            }
        }
    });
});

describe("DOCSVIEWER_FIXED", () => {
    it("has a non-empty string for both languages", () => {
        for (const [key, entry] of Object.entries(DOCSVIEWER_FIXED)) {
            for (const language of LANGUAGES) {
                expect(entry[language].trim(), key).not.toBe("");
            }
        }
    });
});
