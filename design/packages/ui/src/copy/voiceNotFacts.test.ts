/**
 * The test the whole feature exists to pass.
 *
 * Everything else about three language modes and two funny sliders is presentation. This
 * is the safety property: at every level, in every mode, a message that reports damage,
 * risk or failure still names the thing it happened to. The contract states it as a
 * sentence and it is worth restating as one, because it is the sentence that decides
 * whether the sliders are a feature or a liability:
 *
 *   A warning nobody can act on is a broken warning, not a funny one.
 *
 * So each representative message below is rendered fifteen times: five levels across three
 * modes, through the real `vue-i18n` with the real named arguments its real call site
 * passes. Every rendering is checked to still contain the concrete facts -- the path, the
 * folder, the count, the storage name, the word that says the action cannot be undone --
 * and the fifteen renderings are checked against each other to prove the wording genuinely
 * moved rather than the slider being decorative.
 *
 * Rendered, not resolved. The catalogue's own integrity is checked next door in
 * `appCopy.test.ts` by reading the strings; this file goes through `t()` because the
 * failure mode that shipped once in this package already was a message format eating its
 * own placeholder, which no amount of reading the catalogue would have caught.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";

import { mergeVoiceInto } from "./appVoice.js";
import {
    LANGUAGE_MODES,
    FUNNY_LEVELS,
    setFunnyLevel,
    setLanguageMode,
    reloadSetupLanguage,
    type FunnyLevel,
    type LanguageMode,
} from "../components/setup/setupI18n.js";
import { memoryStorage, setSetupStorage } from "../components/setup/setupPrefs.js";

/** The locale everything is merged into here. Which one it is does not matter. */
const LOCALE = "en";

/**
 * Deliberately unannotated. `ReturnType<typeof createI18n>` is the union of the legacy and
 * composition instances, and `global.t` on that union has no single callable signature, so
 * naming the type is what makes the calls below stop compiling. Inference from
 * `legacy: false` narrows it correctly.
 */
function freshI18n() {
    return createI18n({
        legacy: false,
        locale: LOCALE,
        fallbackLocale: LOCALE,
        silentFallbackWarn: true,
        // The one deliberate difference from `i18n.ts`: the missing-key warning is the
        // expected outcome of the fallback test below, and a suite whose passing run prints
        // a warning trains everybody reading it to ignore warnings.
        missingWarn: false,
        messages: {},
    });
}

/**
 * One rendered message, for one mode at one level in each language.
 *
 * Both sliders are moved to the same level rather than only the one the mode reads,
 * because a message that changed when the *other* language's slider moved would be a
 * genuine bug and this is the cheapest place it would show up: bilingual mode renders both,
 * so a leak in either direction lands in the string this returns.
 */
function render(
    key: string,
    args: Record<string, string | number>,
    fallback: string,
    mode: LanguageMode,
    level: FunnyLevel,
): string {
    setLanguageMode(mode);
    setFunnyLevel("en", level);
    setFunnyLevel("yue", level);

    const i18n = freshI18n();
    mergeVoiceInto(i18n as never, LOCALE);
    return i18n.global.t(key, args, fallback) as string;
}

interface Representative {
    /** What it is, for a failure message that has to be readable at four in the morning. */
    readonly what: string;
    readonly key: string;
    readonly args: Record<string, string | number>;
    /** The English fallback exactly as the call site writes it. */
    readonly fallback: string;
    /** Substrings that must survive every level, whichever language is showing. */
    readonly always: readonly string[];
    /** Substrings that must survive every level while English is on screen. */
    readonly whenEnglish: readonly string[];
    /** Substrings that must survive every level while Cantonese is on screen. */
    readonly whenCantonese: readonly string[];
}

/**
 * A destructive warning and an error, chosen because they are the two shapes that hurt.
 *
 * The delete warning carries a path, a consequence and an irreversibility, and it is the
 * message a playful rewrite is most tempted to shorten. The world-folder error carries a
 * path and the name of the file that was looked for, and it is the message somebody reads
 * when they are already annoyed, which is the worst moment to be told something charming
 * and unactionable. The save report is here as the third shape: two counts and a folder,
 * where the failure would be a number quietly rendering as nothing.
 */
const REPRESENTATIVES: readonly Representative[] = [
    {
        what: "the destructive warning shown before a map config file is deleted",
        key: "config.maps.deleteAction",
        args: { path: "maps/overworld.conf" },
        fallback:
            "This deletes {path} from the config folder when you save. It cannot be undone from here.",
        always: ["maps/overworld.conf"],
        whenEnglish: ["config folder", "undo"],
        whenCantonese: ["設定資料夾", "復原"],
    },
    {
        what: "the warning that a delete leaves already-rendered tiles behind",
        key: "config.maps.deleteTiles",
        args: { storage: "file-tiles" },
        fallback:
            'Already-rendered tiles in storage "{storage}" are NOT deleted. BlueMap leaves them where they are; remove them yourself if you want the space back.',
        always: ["file-tiles", "BlueMap"],
        whenEnglish: ["NOT deleted"],
        whenCantonese: ["唔會刪"],
    },
    {
        what: "the warning that deleting a storage stops the maps that name it",
        key: "config.storages.deleteBreaks",
        args: { maps: "overworld, nether" },
        fallback:
            "These maps name this storage and will stop loading until you point them somewhere else: {maps}",
        always: ["overworld, nether"],
        whenEnglish: ["stop loading"],
        whenCantonese: ["載入唔到"],
    },
    {
        what: "the error shown when a chosen folder is not a Minecraft world",
        key: "world.folder.noLevelDat",
        args: { folder: "D:\\games\\saves\\Sky Island" },
        fallback: "There is no level.dat in {folder}, so it is not a Minecraft world.",
        always: ["D:\\games\\saves\\Sky Island", "level.dat", "Minecraft"],
        whenEnglish: [],
        whenCantonese: [],
    },
    {
        what: "the report of what was written and deleted when a config folder is saved",
        key: "config.shell.saved",
        args: { writes: 7, deletes: 2, folder: "C:\\bluemap\\config" },
        fallback: "Wrote {writes} files and deleted {deletes} in {folder}.",
        always: ["7", "2", "C:\\bluemap\\config"],
        whenEnglish: [],
        whenCantonese: [],
    },
];

beforeEach(() => {
    // A store per test, so nothing a previous test wrote decides what this one renders.
    setSetupStorage(memoryStorage());
    reloadSetupLanguage();
});

describe.each(REPRESENTATIVES)("$what", (subject: Representative) => {
    it.each(LANGUAGE_MODES)("keeps every fact in %s mode, at all five levels", (mode) => {
        const lost: string[] = [];

        for (const level of FUNNY_LEVELS) {
            const text = render(subject.key, subject.args, subject.fallback, mode, level);

            const required = [
                ...subject.always,
                ...(mode === "yue" ? [] : subject.whenEnglish),
                ...(mode === "en" ? [] : subject.whenCantonese),
            ];
            for (const fact of required) {
                if (!text.includes(fact)) lost.push(`level ${level}: lost "${fact}" from ${text}`);
            }

            // A placeholder that survived into the rendered text means vue-i18n was not
            // given that named argument, which reads as a bug rather than as copy.
            if (/\{[A-Za-z_$][\w$]*\}/.test(text)) {
                lost.push(`level ${level}: unresolved placeholder in ${text}`);
            }
        }

        expect(
            lost,
            "the funny level styles the voice and never the facts: the message must still " +
                "name what happened, what it affects and what the options are.",
        ).toEqual([]);
    });

    it.each(LANGUAGE_MODES)("actually changes wording across the levels in %s mode", (mode) => {
        const rendered = FUNNY_LEVELS.map((level) =>
            render(subject.key, subject.args, subject.fallback, mode, level),
        );

        // Level 1 is fully professional and level 5 is maximum playfulness. Equal ends mean
        // a slider that moves and changes nothing, which is worse than no slider at all
        // because it looks like a setting.
        expect(rendered[0], "level 1 and level 5 read the same").not.toBe(rendered[4]);

        // Three distinct wordings out of five. Levels 1 and 2 are allowed to match, and
        // often should: there is one way to write a professional sentence, and inventing a
        // difference to satisfy a counter would make the copy worse.
        expect(
            new Set(rendered).size,
            `only ${new Set(rendered).size} distinct wordings`,
        ).toBeGreaterThanOrEqual(3);
    });
});

/* -------------------------------------------------------------------------- */
/* The two sliders are two settings                                           */
/* -------------------------------------------------------------------------- */

describe("the English level and the Cantonese level do not touch each other", () => {
    const subject = REPRESENTATIVES[0] as Representative;

    function renderBilingual(funnyEn: FunnyLevel, funnyYue: FunnyLevel): string {
        setLanguageMode("bilingual");
        setFunnyLevel("en", funnyEn);
        setFunnyLevel("yue", funnyYue);
        const i18n = freshI18n();
        mergeVoiceInto(i18n as never, LOCALE);
        return i18n.global.t(subject.key, subject.args, subject.fallback) as string;
    }

    it("moves only the English half when the English slider moves", () => {
        const [before, after] = [renderBilingual(1, 1), renderBilingual(5, 1)];
        const [beforeEn, beforeYue] = before.split("\n");
        const [afterEn, afterYue] = after.split("\n");

        expect(afterEn).not.toBe(beforeEn);
        expect(afterYue).toBe(beforeYue);
    });

    it("moves only the Cantonese half when the Cantonese slider moves", () => {
        const [before, after] = [renderBilingual(1, 1), renderBilingual(1, 5)];
        const [beforeEn, beforeYue] = before.split("\n");
        const [afterEn, afterYue] = after.split("\n");

        expect(afterYue).not.toBe(beforeYue);
        expect(afterEn).toBe(beforeEn);
    });

    it("still carries the path in both halves at every combination of the two levels", () => {
        for (const funnyEn of FUNNY_LEVELS) {
            for (const funnyYue of FUNNY_LEVELS) {
                const halves = renderBilingual(funnyEn, funnyYue).split("\n");
                expect(halves, `English ${funnyEn}, Cantonese ${funnyYue}`).toHaveLength(2);
                for (const half of halves) {
                    expect(half, `English ${funnyEn}, Cantonese ${funnyYue}`).toContain(
                        "maps/overworld.conf",
                    );
                }
            }
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Fallback: a key the catalogue does not carry                               */
/* -------------------------------------------------------------------------- */

describe("a key the catalogue does not carry", () => {
    /*
     * The key here is deliberately synthetic. This assertion used to name a real one,
     * `config.maps.storagesAvailable`, which was true right up until somebody voiced the
     * config screen and then failed for the best possible reason: the catalogue had grown
     * over it. A test whose subject is "a key that is missing" cannot use a key anybody
     * might reasonably add, or it goes red every time the work it is meant to support
     * succeeds -- and the obvious repair, swapping in whichever key is still missing today,
     * just resets the same trap for the next person.
     *
     * `absent.` is a namespace no surface uses and none will, so the property under test
     * stays the property under test: a key with nothing on the other side of the call falls
     * through to the English string in the third argument, with its named arguments
     * interpolated, even in Cantonese mode. That is what makes the catalogue safe to grow
     * one surface at a time instead of all at once.
     */
    it("still renders its English fallback, with its arguments interpolated", () => {
        setLanguageMode("yue");
        const i18n = freshI18n();
        mergeVoiceInto(i18n as never, LOCALE);

        expect(
            i18n.global.t(
                "absent.surface.storagesAvailable",
                { list: "file-tiles, sql" },
                "Storages available: {list}",
            ),
        ).toBe("Storages available: file-tiles, sql");
    });
});
