/**
 * `world.ts`'s own integrity, checked the same way `appCopy.test.ts` checks the whole
 * catalogue, scoped to this module's own keys rather than the whole merged catalogue.
 * `world.ts` is now registered in `surfaces/index.ts`, so `appCopy.test.ts` and
 * `catalogueCoverage.test.ts` both check these same keys too; this file's value is now in
 * being scoped -- a failure here names the exact module and the exact covered files, rather
 * than pointing at whichever surface the merged catalogue's checks happen to land on.
 * Mirrors `appCopy.test.ts` in shape and scopes every check to this module's own keys and to
 * the ten `components/world` `.vue` files plus the four lower-case helper modules it now
 * covers in full:
 *
 *   InterruptedRenders.vue, MapIdentityStep.vue, MapOptionsStep.vue, MapStorageStep.vue,
 *   MinecraftWorldList.vue, RenderRunPanel.vue, WizardReviewStep.vue, WorldFolderStep.vue,
 *   WorldScreen.vue, WorldWizard.vue, renderRun.ts, resumeOffers.ts, worldCatalog.ts,
 *   worldFolder.ts
 *
 * See `world.ts`'s own doc comment for the two per-file caveats a prior pass left on record
 * and why they no longer apply now that the helper modules are covered too.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { WORLD_FACTS, WORLD_FIXED, WORLD_VOICED } from "./world.js";

const LANGUAGES = ["en", "yue"] as const;

type VoicedKey = keyof typeof WORLD_VOICED;
type FixedKey = keyof typeof WORLD_FIXED;

const voicedKeys = Object.keys(WORLD_VOICED) as VoicedKey[];
const fixedKeys = Object.keys(WORLD_FIXED) as FixedKey[];

/** Every string this module carries, with enough context for a failure to name it. */
function everyString(): { key: string; language: string; level: number; text: string }[] {
    const all: { key: string; language: string; level: number; text: string }[] = [];
    for (const key of voicedKeys) {
        for (const language of LANGUAGES) {
            WORLD_VOICED[key][language].forEach((text, index) => {
                all.push({ key, language, level: index + 1, text });
            });
        }
    }
    for (const key of fixedKeys) {
        for (const language of LANGUAGES) {
            all.push({ key, language, level: 0, text: WORLD_FIXED[key][language] });
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

describe("world.ts: the module's own shape", () => {
    it("gives every voiced entry five levels in both languages", () => {
        for (const key of voicedKeys) {
            expect(WORLD_VOICED[key].en, key).toHaveLength(5);
            expect(WORLD_VOICED[key].yue, key).toHaveLength(5);
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

    it("does not re-answer one of the 15 world keys appCopy.ts already covers", () => {
        // The keys `appCopy.ts` already carries directly (7 voiced + 8 fixed), which this
        // module must never shadow: a duplicate here would either collide on merge or, read
        // on its own, look like the second half re-deciding a tier appCopy.ts already set.
        const alreadyCovered = [
            "world.folder.noLevelDat",
            "world.folder.noRegionData",
            "world.folder.savesFolder",
            "world.run.finishedLine",
            "world.options.someHidden",
            "world.review.carriedNote",
            "world.resume.progressAt",
            "world.folder.title",
            "world.identity.title",
            "world.options.title",
            "world.review.title",
            "world.wizard.back",
            "world.wizard.next",
            "world.wizard.cancel",
            "world.wizard.start",
        ];
        const mine = new Set<string>([...voicedKeys, ...fixedKeys]);
        const collisions = alreadyCovered.filter((key) => mine.has(key));
        expect(collisions).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* The slider is wired to something                                           */
/* -------------------------------------------------------------------------- */

describe("world.ts: the levels are levels", () => {
    it("reads differently at level 1 and at level 5, in both languages", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                const strings = WORLD_VOICED[key][language];
                expect(strings[0], `${key} ${language}`).not.toBe(strings[4]);
            }
        }
    });

    it("says the same thing in a different language, so the two are not copies", () => {
        for (const key of voicedKeys) {
            for (let level = 0; level < 5; level++) {
                expect(WORLD_VOICED[key].en[level], `${key} L${level + 1}`).not.toBe(
                    WORLD_VOICED[key].yue[level],
                );
            }
        }
    });

    it("uses at least three distinct wordings across the five levels", () => {
        for (const key of voicedKeys) {
            for (const language of LANGUAGES) {
                const rendered = WORLD_VOICED[key][language];
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

describe("world.ts: no level drops a value out of a sentence", () => {
    it("uses the same placeholders at every level, in both languages", () => {
        for (const key of voicedKeys) {
            const expected = sorted(placeholdersIn(WORLD_VOICED[key].en[0]));
            for (const language of LANGUAGES) {
                WORLD_VOICED[key][language].forEach((text, index) => {
                    expect(sorted(placeholdersIn(text)), `${key} ${language} L${index + 1}`).toEqual(
                        expected,
                    );
                });
            }
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Facts: what the real call sites in components/world actually pass          */
/* -------------------------------------------------------------------------- */

/** `packages/ui/src/components/world`, the covered files live directly inside it. */
const worldComponentsRoot = fileURLToPath(new URL("../../components/world", import.meta.url));

/**
 * Every `.vue`/`.ts` file in `components/world` that carries its own `world.*` call sites,
 * matched by exact filename. `consentState.ts`, `index.ts`, `wizardModel.ts`,
 * `wizardSteps.ts` and `worldBridge.ts` are deliberately absent: none of them calls `t()`
 * with a `world.*` key of its own, so a scan that included them would find nothing and add
 * no coverage -- see `world.ts`'s own doc comment for the same note.
 */
const COVERED_FILES = new Set([
    "BedrockConversionNote.vue",
    "ContainerOffers.vue",
    "DimensionSelection.vue",
    "InterruptedRenders.vue",
    "MapIdentityStep.vue",
    "MapOptionsStep.vue",
    "MapStorageStep.vue",
    "MinecraftWorldList.vue",
    "RenderRunPanel.vue",
    "WizardReviewStep.vue",
    "WorldFolderStep.vue",
    "WorldScreen.vue",
    "WorldWizard.vue",
    "renderRun.ts",
    "resumeOffers.ts",
    "worldCatalog.ts",
    "worldFolder.ts",
]);

function coveredSourceFiles(): string[] {
    return readdirSync(worldComponentsRoot)
        .filter((name) => COVERED_FILES.has(name))
        .map((name) => join(worldComponentsRoot, name));
}

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
 * Every `t("<key>", ...)` call in the covered files, mapped to the placeholders its
 * English fallback (the call's last string literal) carries. Mirrors
 * `appCopy.test.ts#callSitePlaceholders`, scoped to this module's own source files.
 *
 * `renderRun.ts` builds three families of string as plain `{ key, fallback, ... }` data --
 * `SIGNALS` (`world.console.signal.*`), `phaseText()` (`world.run.phase.*`), and
 * `FailureRemedy.actionKey` (`world.run.fail.*Action`) -- each read later through a
 * *computed* `t(someObject.key, ...)` call in `RenderConsole.vue` or `RenderRunPanel.vue`.
 * That is a property access, never a literal `t("...")` call, so this scan (like
 * `appCopy.test.ts`'s) cannot find a call site for any of the 20 keys in those three
 * families -- and per `world.ts`'s own doc comment, none of them has a catalogue entry
 * either, for that exact reason. There is nothing here for this scan to miss.
 */
function callSitePlaceholders(): Map<string, Set<string>> {
    const catalogue = new Set<string>([...voicedKeys, ...fixedKeys]);
    const byKey = new Map<string, Set<string>>();
    const call = /(?<![\w$.])\$?t\s*\(\s*(["'])([A-Za-z0-9_.\-]+)\1\s*,/g;

    for (const file of coveredSourceFiles()) {
        const text = readFileSync(file, "utf8");

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
            for (const name of placeholdersIn(fallback)) found.add(name);
            byKey.set(key, found);
        }
    }
    return byKey;
}

describe("world.ts: answers the call sites in the covered files", () => {
    const sites = callSitePlaceholders();

    it("finds the covered source files at all, so a broken scan cannot pass as full coverage", () => {
        expect(coveredSourceFiles().length).toBe(COVERED_FILES.size);
    });

    it("finds a call site for every key in this module", () => {
        const orphans = [...voicedKeys, ...fixedKeys].filter((key) => !sites.has(key));
        expect(
            orphans,
            "a catalogue entry with no call site in the covered files translates " +
                "nothing there. Either the key is misspelled or it belongs to a file this " +
                "module does not cover yet.",
        ).toEqual([]);
    });

    it("carries exactly the placeholders the call site passes", () => {
        const wrong: string[] = [];
        for (const [key, expected] of sites) {
            const mine = placeholdersIn(
                (WORLD_VOICED as Record<string, { en: readonly string[] } | undefined>)[key]?.en[0] ??
                    (WORLD_FIXED as Record<string, { en: string } | undefined>)[key]?.en ??
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

/* -------------------------------------------------------------------------- */
/* Facts: the ones that are words rather than values                          */
/* -------------------------------------------------------------------------- */

describe("world.ts: no level stops saying what the message is for", () => {
    it("keeps every required literal at every level, in both languages", () => {
        const missing: string[] = [];
        for (const key of voicedKeys) {
            const required = WORLD_FACTS[key];
            for (const language of LANGUAGES) {
                WORLD_VOICED[key][language].forEach((text, index) => {
                    for (const fact of required[language]) {
                        if (!text.includes(fact)) {
                            missing.push(`${key} ${language} L${index + 1} lost "${fact}"`);
                        }
                    }
                });
            }
        }
        expect(missing).toEqual([]);
    });

    it("names a fact for every voiced key, so nothing is quietly exempt", () => {
        const unguarded = voicedKeys.filter((key) => {
            const entry = WORLD_FACTS[key] as { en: readonly string[]; yue: readonly string[] } | undefined;
            return entry === undefined || entry.en.length === 0 || entry.yue.length === 0;
        });
        expect(unguarded).toEqual([]);
    });
});
