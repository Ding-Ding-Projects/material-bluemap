import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryStorage, setSetupStorage } from "../setup/setupPrefs.js";
import {
    reloadSetupLanguage,
    resetSetupLanguage,
    setFunnyLevel,
    setLanguageMode,
    FUNNY_LEVELS,
} from "../setup/setupI18n.js";
import {
    UPDATE_FIXED,
    UPDATE_VOICED,
    updateCantonese,
    updateEnglish,
    updatePair,
    updateString,
    updateText,
    type UpdateVoicedKey,
} from "./updateCopy.js";

beforeEach(() => {
    setSetupStorage(memoryStorage());
    reloadSetupLanguage();
});

afterEach(() => {
    resetSetupLanguage();
});

const voicedKeys = Object.keys(UPDATE_VOICED) as UpdateVoicedKey[];

describe("the catalogue itself", () => {
    it("carries five levels in both languages for every voiced key", () => {
        for (const key of voicedKeys) {
            expect(UPDATE_VOICED[key].en).toHaveLength(5);
            expect(UPDATE_VOICED[key].yue).toHaveLength(5);
            for (const language of ["en", "yue"] as const) {
                for (const text of UPDATE_VOICED[key][language]) {
                    expect(text.trim()).not.toBe("");
                }
            }
        }
    });

    it("keeps the version placeholder at every level, in both languages", () => {
        // The fact travels as `{version}` and is interpolated after the level has chosen
        // the sentence, so there is no level at which the number can be lost or styled.
        for (const key of ["update.banner.readyTitle", "update.status.available"] as const) {
            for (const language of ["en", "yue"] as const) {
                for (const text of UPDATE_VOICED[key][language]) {
                    expect(text).toContain("{version}");
                }
            }
        }
    });

    it("styles the failure copy too, and still says nothing was installed at every level", () => {
        // The rule is voice-not-facts rather than a carve-out for serious categories: a
        // level-5 failure may be funny, and must still say what happened.
        for (const text of UPDATE_VOICED["update.status.failed"].en) {
            expect(text.toLowerCase()).toMatch(/nothing was installed|did not finish/);
        }
        const levels = new Set(UPDATE_VOICED["update.status.failed"].en);
        expect(levels.size).toBeGreaterThan(1);
    });

    it("never lets a funny level reach an action label", () => {
        // Structural rather than a convention: the fixed catalogue has one string per
        // language and `updateString` never consults a level for it.
        for (const level of FUNNY_LEVELS) {
            expect(updateString("update.action.restart", "en", level)).toBe(
                UPDATE_FIXED["update.action.restart"].en,
            );
            expect(updateString("update.action.later", "yue", level)).toBe(
                UPDATE_FIXED["update.action.later"].yue,
            );
        }
    });
});

describe("updateString", () => {
    it("changes with the level, in the language whose level it is", () => {
        const first = updateString("update.status.upToDate", "en", 1);
        const last = updateString("update.status.upToDate", "en", 5);
        expect(first).not.toBe(last);
    });

    it("interpolates the exact version at every level", () => {
        for (const level of FUNNY_LEVELS) {
            setFunnyLevel("en", level);
            const text = updateEnglish("update.banner.readyTitle", { version: "0.2.0-rc.1" });
            expect(text).toContain("0.2.0-rc.1");
            expect(text).not.toContain("{version}");
        }
    });
});

describe("the three language modes", () => {
    it("English mode shows English only", () => {
        setLanguageMode("en");
        const pair = updatePair("update.status.upToDate");
        expect(pair.secondary).toBeNull();
        expect(pair.primary).toBe(updateEnglish("update.status.upToDate"));
    });

    it("Cantonese mode shows Cantonese only", () => {
        setLanguageMode("yue");
        const pair = updatePair("update.status.upToDate");
        expect(pair.secondary).toBeNull();
        expect(pair.primary).toBe(updateCantonese("update.status.upToDate"));
    });

    it("bilingual mode leads with English and keeps Cantonese beneath it", () => {
        setLanguageMode("bilingual");
        const pair = updatePair("update.status.upToDate");
        expect(pair.primary).toBe(updateEnglish("update.status.upToDate"));
        expect(pair.secondary).toBe(updateCantonese("update.status.upToDate"));
    });

    it("joins both languages for an attribute rather than dropping one", () => {
        setLanguageMode("bilingual");
        const flat = updateText("update.action.restart");
        expect(flat).toContain(UPDATE_FIXED["update.action.restart"].en);
        expect(flat).toContain(UPDATE_FIXED["update.action.restart"].yue);
    });

    it("keeps the two levels independent of each other", () => {
        setLanguageMode("bilingual");
        setFunnyLevel("en", 1);
        setFunnyLevel("yue", 5);
        expect(updateEnglish("update.status.upToDate")).toBe(
            updateString("update.status.upToDate", "en", 1),
        );
        expect(updateCantonese("update.status.upToDate")).toBe(
            updateString("update.status.upToDate", "yue", 5),
        );
    });

    it("keeps the version exact in every mode and at every pair of levels", () => {
        for (const mode of ["en", "yue", "bilingual"] as const) {
            setLanguageMode(mode);
            for (const level of FUNNY_LEVELS) {
                setFunnyLevel("en", level);
                setFunnyLevel("yue", level);
                expect(updateText("update.banner.readyTitle", { version: "1.2.3" })).toContain("1.2.3");
            }
        }
    });
});
