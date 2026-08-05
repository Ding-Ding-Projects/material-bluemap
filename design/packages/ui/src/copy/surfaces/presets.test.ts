/**
 * `presets.ts`'s own integrity, checked the same shape `world.test.ts` checks its module in:
 * every voiced entry carries five distinct-enough levels in both languages, no level drops
 * a placeholder or a pinned fact out of a sentence, and every key this module carries has a
 * real `t("<key>", ...)` call site in the two components this task's lane touches.
 *
 * This module is deliberately *not* registered in `surfaces/index.ts` yet - the task brief
 * says integration does that - so this file cannot lean on `appCopy.test.ts` or
 * `catalogueCoverage.test.ts` to prove it is wired to anything. It proves that itself,
 * scoped to the three files this task added a `project.presets.*`/`project.fieldDefault.*`
 * call site to: `projectModel.ts` (`presetApplicationLines`, the pure function that turns a
 * `PresetApplication` into the sentences a notification shows), `ProjectMapsPanel.vue` (the
 * preset cards and their apply button) and `ProjectEditor.vue` (the render tab's default
 * indicator).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PRESETS_FACTS, PRESETS_FIXED, PRESETS_VOICED } from "./presets.js";
import { applyPreset, createProject, defaultStamp, PROJECT_PRESETS } from "../../components/project/projectModel.js";

const LANGUAGES = ["en", "yue"] as const;

type VoicedKey = keyof typeof PRESETS_VOICED;
type FixedKey = keyof typeof PRESETS_FIXED;

const voicedKeys = Object.keys(PRESETS_VOICED) as VoicedKey[];
const fixedKeys = Object.keys(PRESETS_FIXED) as FixedKey[];

function everyString(): { key: string; language: string; level: number; text: string }[] {
    const all: { key: string; language: string; level: number; text: string }[] = [];
    for (const key of voicedKeys) {
        for (const language of LANGUAGES) {
            PRESETS_VOICED[key][language].forEach((text, index) => {
                all.push({ key, language, level: index + 1, text });
            });
        }
    }
    for (const key of fixedKeys) {
        for (const language of LANGUAGES) {
            all.push({ key, language, level: 0, text: PRESETS_FIXED[key][language] });
        }
    }
    return all;
}

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

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

describe("presets.ts: the module's own shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys) {
            expect(PRESETS_VOICED[key].en, key).toHaveLength(5);
            expect(PRESETS_VOICED[key].yue, key).toHaveLength(5);
        }
    });

    it("has no empty string anywhere", () => {
        for (const entry of everyString()) {
            expect(entry.text.trim(), `${entry.key} ${entry.language} L${entry.level}`).not.toBe("");
        }
    });

    it("uses no em-dashes, which this project spells as ordinary words", () => {
        for (const entry of everyString()) {
            expect(entry.text, `${entry.key} ${entry.language} L${entry.level}`).not.toContain("—");
        }
    });

    it("keys nothing twice across the two tiers", () => {
        const keys = [...voicedKeys, ...fixedKeys];
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("carries a FACTS entry for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = voicedKeys.filter((key) => {
            const entry = PRESETS_FACTS[key] as { en: readonly string[]; yue: readonly string[] } | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* The slider is wired to something                                           */
/* -------------------------------------------------------------------------- */

describe("presets.ts: the levels are levels", () => {
    it("reads differently at level 1 and at level 5, in both languages", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                const strings = PRESETS_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys) {
            for (let level = 0; level < 5; level++) {
                expect(PRESETS_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(PRESETS_VOICED[key].yue[level]);
            }
        }
    });

    it("uses at least three distinct wordings across the five levels", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                const rendered = PRESETS_VOICED[key][language];
                expect(
                    new Set(rendered).size,
                    `${key} ${language}: only ${new Set(rendered).size} distinct wordings`,
                ).toBeGreaterThanOrEqual(3);
            }
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Facts: placeholders                                                        */
/* -------------------------------------------------------------------------- */

describe("presets.ts: no level drops a value out of a sentence", () => {
    it("uses the same placeholders at every level, in both languages", () => {
        for (const key of voicedKeys) {
            const expected = sorted(placeholdersIn(PRESETS_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                PRESETS_VOICED[key][language].forEach((text, index) => {
                    expect(sorted(placeholdersIn(text)), `${key} ${language} L${index + 1}`).toEqual(expected);
                });
            }
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Facts: the ones that are words rather than values                          */
/* -------------------------------------------------------------------------- */

describe("presets.ts: no level stops saying what the message is for", () => {
    it("keeps every required literal at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of voicedKeys) {
            const required = PRESETS_FACTS[key];
            for (const language of LANGUAGES) {
                PRESETS_VOICED[key][language].forEach((text, index) => {
                    for (const fact of required[language]) {
                        if (!text.includes(fact)) missing.push(`${key} ${language} L${index + 1} lost "${fact}"`);
                    }
                });
            }
        }
        expect(missing).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* Facts: what a preset actually does, cross-checked against applyPreset      */
/* -------------------------------------------------------------------------- */

describe("presets.ts: the description matches what applyPreset actually does", () => {
    it("mentions the file storage on every preset that creates one, not just some of them", () => {
        // `applyPreset` creates the shared `file` storage for *every* preset whenever the
        // project does not already have one - it is not something only overworldOnly and
        // allDimensions do. A description that omits it is a card the user cannot trust:
        // this probes the real function rather than trusting the copy's own claim.
        const missing: string[] = [];
        for (const preset of PROJECT_PRESETS) {
            const project = createProject("Empty", defaultStamp());
            const application = applyPreset(project, preset, { world: "C:/saves/Survival", storageRoot: "C:/renders" });
            if (!application.storageAdded) continue;

            const key = `project.presets.${preset.id}.description` as VoicedKey;
            // Annotated rather than left inferred: `PRESETS_FACTS` is `as const`, so the
            // uninferred type of `PRESETS_FACTS[key]` is a union of the *specific* literal
            // tuples each preset's fact list happens to hold, one per preset. Calling
            // `.includes()` on a union of differently-typed readonly tuples makes `vue-tsc`
            // intersect the parameter types of every member's `includes` overload rather than
            // union them, which collapses to `never` and rejects any string at all -- the
            // `for...of` loop two tests up never hits this because iteration reads the union's
            // element type directly instead of resolving a method's parameter type. Naming the
            // general shape here (the same shape `satisfies` already checked this object
            // against) sidesteps the inference entirely rather than working around the symptom.
            const required: { en: readonly string[]; yue: readonly string[] } = PRESETS_FACTS[key];
            for (const language of LANGUAGES) {
                if (!required[language].includes("file storage")) {
                    missing.push(`${key} ${language}: fact list does not require "file storage"`);
                    continue;
                }
                PRESETS_VOICED[key][language].forEach((text, index) => {
                    if (!text.includes("file storage")) {
                        missing.push(`${key} ${language} L${index + 1}: does not mention "file storage"`);
                    }
                });
            }
        }
        expect(missing).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* This module's own two call sites                                           */
/* -------------------------------------------------------------------------- */

/** `packages/ui/src/components/project`, where this task's two touched files live. */
const projectComponentsRoot = fileURLToPath(new URL("../../components/project", import.meta.url));

const COVERED_FILES = ["projectModel.ts", "ProjectMapsPanel.vue", "ProjectEditor.vue"];

/** The index of the closing quote of the literal opening at `start`, or -1. */
function endOfString(text: string, start: number): number {
    const quote = text[start];
    for (let i = start + 1; i < text.length; i++) {
        const ch = text[i];
        if (ch === "\\") {
            i++;
            continue;
        }
        if (ch === quote) return i;
        if (quote !== "`" && ch === "\n") return -1;
    }
    return -1;
}

/**
 * Every `t("<key>", ...)` call in the two covered files, mapped to the placeholders its
 * English fallback (the call's last string literal) carries. Mirrors `world.test.ts`'s own
 * `callSitePlaceholders`, scoped to this module's own two files.
 */
function callSitePlaceholders(): Map<string, Set<string>> {
    const catalogue = new Set<string>([...voicedKeys, ...fixedKeys]);
    const byKey = new Map<string, Set<string>>();
    const call = /(?<![\w$.])\$?t\s*\(\s*(["'])([A-Za-z0-9_.\-]+)\1\s*,/g;

    for (const name of COVERED_FILES) {
        const text = readFileSync(`${projectComponentsRoot}/${name}`, "utf8");

        call.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = call.exec(text)) !== null) {
            const key = match[2] as string;
            if (!catalogue.has(key)) continue;

            const literals: string[] = [];
            let depth = 1;
            for (let i = match.index + match[0].length; i < text.length && depth > 0; i++) {
                const ch = text[i] as string;
                if (ch === '"' || ch === "'" || ch === "`") {
                    const end = endOfString(text, i);
                    if (end === -1) break;
                    literals.push(text.slice(i + 1, end));
                    i = end;
                } else if (ch === "(" || ch === "[" || ch === "{") depth++;
                else if (ch === ")" || ch === "]" || ch === "}") depth--;
            }

            const fallback = literals.at(-1) ?? "";
            const found = byKey.get(key) ?? new Set<string>();
            for (const name2 of placeholdersIn(fallback)) found.add(name2);
            byKey.set(key, found);
        }
    }
    return byKey;
}

describe("presets.ts: answers the call sites in its two covered files", () => {
    const sites = callSitePlaceholders();

    it("finds a call site for every key this module carries", () => {
        const orphans = [...voicedKeys, ...fixedKeys].filter((key) => !sites.has(key));
        expect(
            orphans,
            "a catalogue entry with no call site translates nothing. Either the key is " +
                "misspelled or the component that should call it was not updated.",
        ).toEqual([]);
    });

    it("carries exactly the placeholders the call site passes", () => {
        const wrong: string[] = [];
        for (const [key, expected] of sites) {
            const mine = placeholdersIn(
                (PRESETS_VOICED as Record<string, { en: readonly string[] } | undefined>)[key]?.en[0] ??
                    (PRESETS_FIXED as Record<string, { en: string } | undefined>)[key]?.en ??
                    "",
            );
            const a = sorted(expected);
            const b = sorted(mine);
            if (a.join() !== b.join()) {
                wrong.push(`${key}: call site passes [${a.join(", ")}], catalogue has [${b.join(", ")}]`);
            }
        }
        expect(wrong).toEqual([]);
    });
});
