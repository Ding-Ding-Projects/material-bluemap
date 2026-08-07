/**
 * The wiring: persistence, reactivity, and not breaking anything that already worked.
 *
 * `voiceNotFacts.test.ts` proves the copy is safe. This proves it arrives. Three claims,
 * each of which was a way this could have shipped looking finished and doing nothing:
 *
 *  - the mode and both levels survive a restart, which is the difference between a setting
 *    and a question asked once per launch;
 *  - moving a slider changes what `t()` returns *without* anything else being told to
 *    re-render, because `mergeLocaleMessage` writes into vue-i18n's reactive store;
 *  - merging the catalogue into a locale leaves that locale's own strings alone, because a
 *    translation layer that eats upstream BlueMap's viewer locale would be a regression
 *    dressed as a feature.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";
import { effectScope, nextTick } from "vue";

import {
    BILINGUAL_JOIN,
    MODE_ATTRIBUTE,
    appMessage,
    applyLanguageMode,
    currentLanguageSettings,
    documentLanguageFor,
    installAppVoice,
    mergeVoiceInto,
    voiceMessages,
} from "./appVoice.js";
import { appCopyKeys } from "./appCopy.js";
import {
    reloadSetupLanguage,
    setFunnyLevel,
    setLanguageMode,
} from "../components/setup/setupI18n.js";
import { memoryStorage, setSetupStorage } from "../components/setup/setupPrefs.js";

const LOCALE = "en";

function freshI18n() {
    return createI18n({
        legacy: false,
        locale: LOCALE,
        fallbackLocale: LOCALE,
        silentFallbackWarn: true,
        missingWarn: false,
        messages: {},
    });
}

beforeEach(() => {
    setSetupStorage(memoryStorage());
    reloadSetupLanguage();
});

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

describe("the three settings survive a restart", () => {
    it("reads back the mode and both levels from the store they were written to", () => {
        const store = memoryStorage();
        setSetupStorage(store);
        reloadSetupLanguage();

        setLanguageMode("bilingual");
        setFunnyLevel("en", 1);
        setFunnyLevel("yue", 5);

        // A restart is a new process reading the same store: the module state is discarded
        // and rebuilt from what is on disk, which is exactly what `reloadSetupLanguage`
        // does against a store it did not write in this tick.
        reloadSetupLanguage();

        expect(currentLanguageSettings()).toEqual({
            mode: "bilingual",
            funnyEn: 1,
            funnyYue: 5,
        });
    });

    it("falls back to English at level 3 when the store holds nonsense", () => {
        setSetupStorage(
            memoryStorage({
                "worldlens.language.mode": "klingon",
                "worldlens.language.funny.en": "eleven",
                "worldlens.language.funny.yue": "-4",
            }),
        );
        reloadSetupLanguage();

        expect(currentLanguageSettings()).toEqual({ mode: "en", funnyEn: 3, funnyYue: 1 });
    });
});

/* -------------------------------------------------------------------------- */
/* Reactivity                                                                 */
/* -------------------------------------------------------------------------- */

describe("moving a slider moves the whole application's copy", () => {
    it("re-resolves every call site without anything being re-mounted", async () => {
        const i18n = freshI18n();
        const scope = effectScope();
        scope.run(() => installAppVoice(i18n as never, () => LOCALE));

        const key = "world.folder.noLevelDat";
        const fallback = "There is no level.dat in {folder}, so it is not a Minecraft world.";
        const args = { folder: "D:\\saves\\Home" };

        const atThree = i18n.global.t(key, args, fallback);

        setFunnyLevel("en", 5);
        await nextTick();
        const atFive = i18n.global.t(key, args, fallback);

        expect(atFive).not.toBe(atThree);
        // Both still name the folder and the file, which is the whole point of the exercise.
        for (const text of [atThree, atFive]) {
            expect(text).toContain("D:\\saves\\Home");
            expect(text).toContain("level.dat");
        }

        scope.stop();
    });

    it("stops watching when its scope does, so a test cannot leak into the next one", async () => {
        const i18n = freshI18n();
        const scope = effectScope();
        scope.run(() => installAppVoice(i18n as never, () => LOCALE));
        await nextTick();
        scope.stop();

        const before = i18n.global.t("world.wizard.start", "Render this map");
        setLanguageMode("yue");
        await nextTick();

        expect(i18n.global.t("world.wizard.start", "Render this map")).toBe(before);
    });
});

/* -------------------------------------------------------------------------- */
/* Coexistence with upstream's locales                                        */
/* -------------------------------------------------------------------------- */

describe("merging the catalogue leaves the locale it merges into alone", () => {
    it("keeps upstream's own nested keys resolvable", () => {
        const i18n = freshI18n();
        // The shape `parseHocon` produces from `public/lang/en.conf`: nested objects, and a
        // `maps` object that shares its first path segment with nothing we add.
        i18n.global.setLocaleMessage(LOCALE, {
            menu: { title: "Menu" },
            maps: { title: "Maps", button: "Maps" },
        });
        mergeVoiceInto(i18n as never, LOCALE);

        expect(i18n.global.t("menu.title")).toBe("Menu");
        expect(i18n.global.t("maps.title")).toBe("Maps");
        expect(i18n.global.t("world.wizard.start", "Render this map")).toBe("Render this map");
    });

    it("answers every key it claims, and only those", () => {
        const messages = voiceMessages(currentLanguageSettings());
        expect(Object.keys(messages).sort()).toEqual([...appCopyKeys()].sort());
    });

    it("is idempotent, so a slider dragged across five stops leaves no stale string", () => {
        const i18n = freshI18n();
        for (const level of [1, 2, 3, 4, 5] as const) {
            setFunnyLevel("en", level);
            mergeVoiceInto(i18n as never, LOCALE);
        }
        setFunnyLevel("en", 1);
        mergeVoiceInto(i18n as never, LOCALE);

        expect(i18n.global.t("config.maps.deleteAction", { path: "maps/a.conf" }, "x")).toBe(
            appMessage("config.maps.deleteAction", currentLanguageSettings()).replace(
                "{path}",
                "maps/a.conf",
            ),
        );
    });
});

/* -------------------------------------------------------------------------- */
/* The document attributes                                                    */
/* -------------------------------------------------------------------------- */

describe("what the mode puts on the document", () => {
    it("records the mode for the stylesheet, and does not touch lang", () => {
        const element = {
            attributes: new Map<string, string>(),
            setAttribute(name: string, value: string) {
                this.attributes.set(name, value);
            },
        };
        applyLanguageMode("bilingual", element as unknown as HTMLElement);

        expect(element.attributes.get(MODE_ATTRIBUTE)).toBe("bilingual");
        expect(element.attributes.has("lang")).toBe(false);
    });

    it("leads bilingual with English, and reads Cantonese mode as zh-HK", () => {
        expect(documentLanguageFor("en")).toBe("en");
        expect(documentLanguageFor("bilingual")).toBe("en");
        expect(documentLanguageFor("yue")).toBe("zh-HK");
    });
});

/* -------------------------------------------------------------------------- */
/* Bilingual message shape                                                    */
/* -------------------------------------------------------------------------- */

describe("a bilingual message", () => {
    it("puts the two languages on their own lines, English first", () => {
        setLanguageMode("bilingual");
        const message = appMessage("world.wizard.start", currentLanguageSettings());
        const halves = message.split(BILINGUAL_JOIN);

        expect(halves).toEqual(["Render this map", "開始算呢張圖"]);
    });

    it("puts no separator in either single-language mode", () => {
        for (const mode of ["en", "yue"] as const) {
            setLanguageMode(mode);
            const message = appMessage("world.wizard.start", currentLanguageSettings());
            expect(message, mode).not.toContain(BILINGUAL_JOIN);
        }
    });
});
