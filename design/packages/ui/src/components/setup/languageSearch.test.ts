/**
 * The language section is findable by the words that are on screen.
 *
 * The settings surface matches a query against a section's title, its explanation and the
 * values it is currently showing. A section that publishes nothing is invisible to that
 * search while being perfectly visible on the page, which is the worst combination: the
 * user can see the setting, types its name, and is told there are no matches.
 *
 * The specific thing checked here is that the labels follow the *current* mode and levels
 * rather than being a fixed English list. A Cantonese profile searching in Cantonese has to
 * find the row it is looking at.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { languageSearchLabels } from "./languageSearch.js";
import { reloadSetupLanguage, setFunnyLevel, setLanguageMode } from "./setupI18n.js";
import { memoryStorage, setSetupStorage } from "./setupPrefs.js";

/** How the settings surface matches: every published value, joined and folded. */
function findable(query: string): boolean {
    return languageSearchLabels().join("\n").toLowerCase().includes(query.toLowerCase());
}

beforeEach(() => {
    setSetupStorage(memoryStorage());
    reloadSetupLanguage();
});

describe("what the language section can be found by", () => {
    it("finds it by the words an English reader would type", () => {
        setLanguageMode("en");
        for (const query of ["language", "funny", "Cantonese", "reset"]) {
            expect(findable(query), query).toBe(true);
        }
    });

    it("finds it by the words a Cantonese reader would type", () => {
        setLanguageMode("yue");
        for (const query of ["語言", "搞笑程度", "廣東話", "還原"]) {
            expect(findable(query), query).toBe(true);
        }
    });

    it("finds it by either language's words in bilingual mode", () => {
        setLanguageMode("bilingual");
        expect(findable("funny")).toBe(true);
        expect(findable("搞笑程度")).toBe(true);
    });

    it("publishes the level a slider is actually on, by number and by name", () => {
        setLanguageMode("en");
        setFunnyLevel("en", 5);
        setFunnyLevel("yue", 1);

        // A level's name is written in the language whose level it labels, whatever the
        // mode is, because that is how it is rendered on the panel: the Cantonese slider's
        // "完全正經" is announced with `lang="zh-HK"` beside it. Searching has to agree with
        // what is on screen, so the Cantonese level publishes its Cantonese name here even
        // while the surrounding interface is English.
        expect(findable("5 Maximum playfulness")).toBe(true);
        expect(findable("1 完全正經")).toBe(true);
        expect(findable("3 Balanced")).toBe(false);
    });

    it("names the disclosure, so somebody searching for what the level affects lands here", () => {
        setLanguageMode("en");
        expect(findable("errors and warnings")).toBe(true);
    });

    it("publishes no empty value, which would match every query", () => {
        for (const mode of ["en", "yue", "bilingual"] as const) {
            setLanguageMode(mode);
            for (const label of languageSearchLabels()) {
                expect(label.trim(), mode).not.toBe("");
            }
        }
    });
});
