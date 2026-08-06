/**
 * `dependencies.ts`'s own integrity, checked directly rather than through the merged
 * catalogue - the same shape `notificationsBulk.test.ts` holds its own module to.
 *
 * This module IS registered in `surfaces/index.ts`, unlike `notificationsBulk.ts`
 * (`components/settings` is a finished surface in `catalogueCoverage.test.ts`, and every
 * `t()` key `DependencyInstallerPanel.vue`/`dependencyModel.ts` render has to resolve
 * there), so `appCopy.test.ts` and `catalogueCoverage.test.ts` already exercise it through
 * the merged catalogue. This file additionally holds it to its own, narrower shape: every
 * placeholder present at every level, and every pinned fact surviving every level.
 */

import { describe, expect, it } from "vitest";

import { DEPENDENCIES_FACTS, DEPENDENCIES_FIXED, DEPENDENCIES_VOICED } from "./dependencies.js";

const LANGUAGES = ["en", "yue"] as const;

type VoicedKey = keyof typeof DEPENDENCIES_VOICED;
type FixedKey = keyof typeof DEPENDENCIES_FIXED;

const voicedKeys = Object.keys(DEPENDENCIES_VOICED) as VoicedKey[];
const fixedKeys = Object.keys(DEPENDENCIES_FIXED) as FixedKey[];

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

describe("dependencies.ts: shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys) {
            expect(DEPENDENCIES_VOICED[key].en, key).toHaveLength(5);
            expect(DEPENDENCIES_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere, voiced or fixed", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                DEPENDENCIES_VOICED[key][language].forEach((text, index) => {
                    expect(text.trim(), `${key} ${language} L${index + 1}`).not.toBe("");
                });
            }
        }
        for (const key of fixedKeys) {
            for (const language of LANGUAGES) {
                expect(DEPENDENCIES_FIXED[key][language].trim(), `${key} ${language}`).not.toBe("");
            }
        }
    });

    it("keeps the same placeholders at every level, in both languages - none dropped, none invented", () => {
        const mismatched: string[] = [];
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                const levels = DEPENDENCIES_VOICED[key][language];
                const wanted = sorted(placeholdersIn(levels[0]));
                levels.forEach((text, index) => {
                    const got = sorted(placeholdersIn(text));
                    if (got.join(",") !== wanted.join(",")) {
                        mismatched.push(`${key} ${language} L${index + 1}: expected [${wanted}], got [${got}]`);
                    }
                });
            }
        }
        expect(mismatched).toEqual([]);
    });
});

describe("dependencies.ts: no level stops saying what the message is for", () => {
    it("keeps every required literal at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of voicedKeys) {
            const required = DEPENDENCIES_FACTS[key];
            for (const language of LANGUAGES) {
                DEPENDENCIES_VOICED[key][language].forEach((text, index) => {
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
            "the funny level styles the voice and never the facts. A level that stops naming " +
                "the real exit code, the real package id, or that a cancellation did not finish, " +
                "is a broken explanation rather than a funny one.",
        ).toEqual([]);
    });

    it("names a fact for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = voicedKeys.filter((key) => {
            const entry = DEPENDENCIES_FACTS[key] as
                | { en: readonly string[]; yue: readonly string[] }
                | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});

describe("dependencies.ts: the destructive-looking outcomes stay honest", () => {
    it("declinedElevation says plainly that nothing was installed, at every level", () => {
        for (const text of DEPENDENCIES_VOICED["dependencies.outcome.declinedElevation"].en) {
            expect(text).toContain("Nothing was installed");
        }
        for (const text of DEPENDENCIES_VOICED["dependencies.outcome.declinedElevation"].yue) {
            expect(text).toContain("冇裝到嘢");
        }
    });

    it("cancelled never reads as a success at any level", () => {
        for (const text of DEPENDENCIES_VOICED["dependencies.outcome.cancelled"].en) {
            expect(text.toLowerCase()).not.toContain("installed");
            expect(text.toLowerCase()).toContain("cancel");
        }
    });
});
