import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../stores/appSettingsHistorySync.js", () => ({ recordAppSetting: vi.fn() }));
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

import { memoryStorage, setSetupStorage, setupStorage } from "./setupPrefs.js";
import {
    FUNNY_LEVELS,
    LANGUAGE_MODES,
    cantonese,
    documentLanguage,
    english,
    flat,
    funnyLevel,
    langAttr,
    languageMode,
    levelName,
    pair,
    reloadSetupLanguage,
    resetSetupLanguage,
    setFunnyLevel,
    setLanguageMode,
    type FunnyLevel,
} from "./setupI18n.js";
import { VOICED, exactKeys, voicedKeys } from "./setupStrings.js";

beforeEach(() => {
    setSetupStorage(memoryStorage());
    reloadSetupLanguage();
});

describe("defaults", () => {
    it("starts in English at level 3 in both languages", () => {
        expect(languageMode()).toBe("en");
        expect(funnyLevel("en")).toBe(3);
        expect(funnyLevel("yue")).toBe(3);
    });

    it("restores a stored choice", () => {
        setSetupStorage(
            memoryStorage({
                "material-bluemap.language.mode": "bilingual",
                "material-bluemap.language.funny.en": "1",
                "material-bluemap.language.funny.yue": "5",
            }),
        );
        reloadSetupLanguage();
        expect(languageMode()).toBe("bilingual");
        expect(funnyLevel("en")).toBe(1);
        expect(funnyLevel("yue")).toBe(5);
    });

    it("ignores a stored value that is not a mode", () => {
        setSetupStorage(memoryStorage({ "material-bluemap.language.mode": "klingon" }));
        reloadSetupLanguage();
        expect(languageMode()).toBe("en");
    });

    it("clamps a stored level that is out of range", () => {
        setSetupStorage(
            memoryStorage({
                "material-bluemap.language.funny.en": "99",
                "material-bluemap.language.funny.yue": "-4",
            }),
        );
        reloadSetupLanguage();
        expect(funnyLevel("en")).toBe(5);
        expect(funnyLevel("yue")).toBe(1);
    });
});

describe("persistence", () => {
    it("writes the mode and both levels", () => {
        setLanguageMode("yue");
        setFunnyLevel("en", 2);
        setFunnyLevel("yue", 4);
        const storage = setupStorage();
        expect(storage.read("material-bluemap.language.mode")).toBe("yue");
        expect(storage.read("material-bluemap.language.funny.en")).toBe("2");
        expect(storage.read("material-bluemap.language.funny.yue")).toBe("4");
    });

    it("resets to English at level 3", () => {
        setLanguageMode("bilingual");
        setFunnyLevel("en", 5);
        resetSetupLanguage();
        expect(languageMode()).toBe("en");
        expect(funnyLevel("en")).toBe(3);
        expect(funnyLevel("yue")).toBe(3);
        expect(setupStorage().read("material-bluemap.language.mode")).toBeNull();
    });
});

describe("the two funny levels are independent", () => {
    it("moves English copy without touching Cantonese copy", () => {
        setFunnyLevel("en", 1);
        setFunnyLevel("yue", 1);
        const baselineYue = cantonese("welcome.heading");

        setFunnyLevel("en", 5);
        expect(english("welcome.heading")).toBe(VOICED["welcome.heading"].en[4]);
        expect(cantonese("welcome.heading")).toBe(baselineYue);
    });

    it("moves Cantonese copy without touching English copy", () => {
        setFunnyLevel("en", 2);
        setFunnyLevel("yue", 2);
        const baselineEn = english("welcome.heading");

        setFunnyLevel("yue", 5);
        expect(cantonese("welcome.heading")).toBe(VOICED["welcome.heading"].yue[4]);
        expect(english("welcome.heading")).toBe(baselineEn);
    });

    it("reads every voiced entry at every level in both languages", () => {
        for (const level of FUNNY_LEVELS) {
            setFunnyLevel("en", level);
            setFunnyLevel("yue", level);
            for (const key of voicedKeys()) {
                expect(english(key), `${key} en level ${level}`).toBe(
                    VOICED[key].en[level - 1],
                );
                expect(cantonese(key), `${key} yue level ${level}`).toBe(
                    VOICED[key].yue[level - 1],
                );
            }
        }
    });
});

describe("the funny level never touches the consent facts", () => {
    it("produces byte identical text at every level, in both languages", () => {
        const baseline = new Map<string, { en: string; yue: string }>();
        setFunnyLevel("en", 1);
        setFunnyLevel("yue", 1);
        for (const key of exactKeys()) {
            baseline.set(key, { en: english(key), yue: cantonese(key) });
        }

        for (const level of FUNNY_LEVELS) {
            setFunnyLevel("en", level);
            setFunnyLevel("yue", level);
            for (const key of exactKeys()) {
                const expected = baseline.get(key);
                expect(english(key), `${key} en at level ${level}`).toBe(expected?.en);
                expect(cantonese(key), `${key} yue at level ${level}`).toBe(expected?.yue);
            }
        }
    });

    it("shows the same consent facts in every language mode", () => {
        for (const mode of LANGUAGE_MODES) {
            setLanguageMode(mode);
            const text = pair("consent.ifDecline");
            // The English sentence is present in English and bilingual modes; Cantonese
            // mode shows the Cantonese one. Neither mode drops the fact.
            expect(text.primary.length).toBeGreaterThan(0);
            if (mode === "bilingual") expect(text.secondary).not.toBeNull();
        }
    });
});

describe("language modes", () => {
    it("English mode shows English only", () => {
        setLanguageMode("en");
        const text = pair("action.accept");
        expect(text.primary).toBe("Accept");
        expect(text.secondary).toBeNull();
    });

    it("Cantonese mode shows Cantonese only", () => {
        setLanguageMode("yue");
        const text = pair("action.accept");
        expect(text.primary).toBe("接受");
        expect(text.secondary).toBeNull();
    });

    it("bilingual mode keeps English prominent and Cantonese secondary", () => {
        setLanguageMode("bilingual");
        const text = pair("action.accept");
        expect(text.primary).toBe("Accept");
        expect(text.secondary).toBe("接受");
    });

    it("joins both languages for an attribute rather than dropping one", () => {
        setLanguageMode("bilingual");
        expect(flat("action.accept")).toBe("Accept / 接受");
    });

    it("labels each language for a screen reader", () => {
        expect(langAttr("en")).toBe("en");
        expect(langAttr("yue")).toBe("zh-HK");
        expect(documentLanguage("en")).toBe("en");
        expect(documentLanguage("yue")).toBe("zh-HK");
        // Bilingual leads with English, so the Cantonese runs carry their own lang.
        expect(documentLanguage("bilingual")).toBe("en");
    });
});

describe("interpolation", () => {
    it("substitutes values", () => {
        setLanguageMode("en");
        expect(flat("setup.progress", { step: 2, total: 3 })).toBe("Step 2 of 3");
    });

    it("leaves an unresolved placeholder visible rather than printing undefined", () => {
        setLanguageMode("en");
        expect(flat("setup.progress", { step: 2 })).toBe("Step 2 of {total}");
    });

    it("interpolates both languages in bilingual mode", () => {
        setLanguageMode("bilingual");
        const text = pair("setup.progress", { step: 1, total: 3 });
        expect(text.primary).toBe("Step 1 of 3");
        expect(text.secondary).toBe("第 1 步，共 3 步");
    });
});

describe("level names", () => {
    it("names all five levels in the language whose level they label", () => {
        for (const level of FUNNY_LEVELS) {
            expect(levelName(level, "en").trim()).toBeTruthy();
            expect(levelName(level, "yue").trim()).toBeTruthy();
        }
        expect(levelName(1, "en")).toBe("Fully serious");
        expect(levelName(5, "en")).toBe("Maximum playfulness");
    });

    it("clamps a level handed in from outside the range", () => {
        setFunnyLevel("en", 9 as FunnyLevel);
        expect(funnyLevel("en")).toBe(5);
        setFunnyLevel("en", 0 as FunnyLevel);
        expect(funnyLevel("en")).toBe(1);
    });
});

describe("mirroring into the application-settings history", () => {
    beforeEach(() => {
        vi.mocked(recordAppSetting).mockClear();
    });

    it("mirrors the language mode under the languageMode key", () => {
        setLanguageMode("yue");
        expect(recordAppSetting).toHaveBeenCalledTimes(1);
        expect(recordAppSetting).toHaveBeenCalledWith("languageMode", "yue");
    });

    it("mirrors the English funny level under its own key, never the Cantonese one", () => {
        setFunnyLevel("en", 2);
        expect(recordAppSetting).toHaveBeenCalledTimes(1);
        expect(recordAppSetting).toHaveBeenCalledWith("funnyLevelEn", 2);
    });

    it("mirrors the Cantonese funny level under its own key, never the English one", () => {
        setFunnyLevel("yue", 4);
        expect(recordAppSetting).toHaveBeenCalledTimes(1);
        expect(recordAppSetting).toHaveBeenCalledWith("funnyLevelYue", 4);
    });
});
