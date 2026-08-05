/**
 * Language modes and funny levels for the first-run flow and its settings row.
 *
 * Three modes (English, playful Hong Kong Cantonese, bilingual) and two entirely
 * separate funny levels, one per language, all persisted. The English level never
 * touches Cantonese copy and the Cantonese level never touches English copy: they are
 * two settings that happen to sit beside each other, not one setting with two labels.
 *
 * The state is a module-level `reactive`, not a component's own, because the same three
 * values drive the setup dialog and the consent row in Settings. Two copies of a
 * persisted preference is how a slider in one surface stops agreeing with the slider in
 * the other.
 *
 * **What the level may never change.** `EXACT` keys carry the consent facts, and
 * `raw()` resolves them from a single string per language with the level not consulted
 * at all. There is no code path in this module through which a funny level can reach
 * them, which is deliberate: the voice around a licence may be as silly as somebody
 * wants, and what they are agreeing to may not move a comma.
 */

import { computed, reactive, type ComputedRef } from "vue";
import {
    EXACT,
    FIXED,
    VOICED,
    isVoicedKey,
    type FixedKey,
    type StringKey,
} from "./setupStrings.js";
import { readInt, readOneOf, setupStorage } from "./setupPrefs.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

export const LANGUAGE_MODES = ["en", "yue", "bilingual"] as const;
export type LanguageMode = (typeof LANGUAGE_MODES)[number];

export const FUNNY_LEVELS = [1, 2, 3, 4, 5] as const;
export type FunnyLevel = (typeof FUNNY_LEVELS)[number];

export type TranslationVars = Readonly<Record<string, string | number>>;

export interface TextPair {
    /** The prominent label. English in bilingual mode. */
    readonly primary: string;
    /** The compact secondary label, or null when only one language is showing. */
    readonly secondary: string | null;
}

const MODE_KEY = "material-bluemap.language.mode";
const FUNNY_EN_KEY = "material-bluemap.language.funny.en";
const FUNNY_YUE_KEY = "material-bluemap.language.funny.yue";

interface SetupI18nState {
    mode: LanguageMode;
    funnyEn: FunnyLevel;
    funnyYue: FunnyLevel;
}

function clampLevel(value: number): FunnyLevel {
    return Math.min(5, Math.max(1, Math.round(value))) as FunnyLevel;
}

function loadState(): SetupI18nState {
    return {
        mode: readOneOf<LanguageMode>(MODE_KEY, LANGUAGE_MODES, "en"),
        funnyEn: clampLevel(readInt(FUNNY_EN_KEY, 3, 1, 5)),
        funnyYue: clampLevel(readInt(FUNNY_YUE_KEY, 3, 1, 5)),
    };
}

const state = reactive<SetupI18nState>(loadState());

/** Re-reads the persisted values. Tests call it after swapping the backing store. */
export function reloadSetupLanguage(): void {
    Object.assign(state, loadState());
}

export function languageMode(): LanguageMode {
    return state.mode;
}

export function funnyLevel(language: "en" | "yue"): FunnyLevel {
    return language === "en" ? state.funnyEn : state.funnyYue;
}

export function setLanguageMode(mode: LanguageMode): void {
    state.mode = mode;
    setupStorage().write(MODE_KEY, mode);
    // Fire-and-forget mirror into the main process's own settings history, on top of the
    // write above - see `appSettingsHistorySync.ts`'s own doc comment.
    recordAppSetting("languageMode", mode);
    applyDocumentLanguage();
}

export function setFunnyLevel(language: "en" | "yue", level: FunnyLevel): void {
    const clamped = clampLevel(level);
    if (language === "en") {
        state.funnyEn = clamped;
        setupStorage().write(FUNNY_EN_KEY, String(clamped));
        recordAppSetting("funnyLevelEn", clamped);
    } else {
        state.funnyYue = clamped;
        setupStorage().write(FUNNY_YUE_KEY, String(clamped));
        recordAppSetting("funnyLevelYue", clamped);
    }
}

/** Back to the defaults: English, level 3 in both languages. */
export function resetSetupLanguage(): void {
    const storage = setupStorage();
    storage.remove(MODE_KEY);
    storage.remove(FUNNY_EN_KEY);
    storage.remove(FUNNY_YUE_KEY);
    state.mode = "en";
    state.funnyEn = 3;
    state.funnyYue = 3;
    applyDocumentLanguage();
}

function interpolate(template: string, vars: TranslationVars): string {
    if (Object.keys(vars).length === 0) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
        const value = vars[name];
        // An unresolved placeholder stays visible rather than becoming "undefined", so a
        // missing value reads as the bug it is instead of as copy somebody wrote.
        return value === undefined ? whole : String(value);
    });
}

/**
 * The string for one language, before interpolation.
 *
 * `EXACT` and `FIXED` fall through to the same one-string-per-language lookup. The
 * level is read only for a `VOICED` key, which is the whole guarantee this module makes.
 */
function raw(key: StringKey, language: "en" | "yue"): string {
    if (isVoicedKey(key)) {
        const entry = VOICED[key];
        const level = language === "en" ? state.funnyEn : state.funnyYue;
        const strings = language === "en" ? entry.en : entry.yue;
        return strings[level - 1] ?? strings[2];
    }
    const fixed = Object.prototype.hasOwnProperty.call(FIXED, key)
        ? FIXED[key as FixedKey]
        : EXACT[key as keyof typeof EXACT];
    return fixed[language];
}

/** The English string at the current English level, whatever the mode is. */
export function english(key: StringKey, vars: TranslationVars = {}): string {
    return interpolate(raw(key, "en"), vars);
}

/** The Cantonese string at the current Cantonese level, whatever the mode is. */
export function cantonese(key: StringKey, vars: TranslationVars = {}): string {
    return interpolate(raw(key, "yue"), vars);
}

/**
 * The prominent label plus the compact secondary label. Bilingual mode keeps English
 * prominent and puts Cantonese beneath it in a smaller style, so both are present
 * without the control growing sideways.
 */
export function pair(key: StringKey, vars: TranslationVars = {}): TextPair {
    if (state.mode === "en") return { primary: english(key, vars), secondary: null };
    if (state.mode === "yue") return { primary: cantonese(key, vars), secondary: null };
    return { primary: english(key, vars), secondary: cantonese(key, vars) };
}

/**
 * A flat string, for the places that can only hold one: an `aria-label`, a `title`, a
 * placeholder. Bilingual mode joins the two rather than dropping one, because an
 * accessible name that silently loses a language is worse than a long one.
 */
export function flat(key: StringKey, vars: TranslationVars = {}): string {
    const both = pair(key, vars);
    return both.secondary === null ? both.primary : `${both.primary} / ${both.secondary}`;
}

/** The display name of a funny level, in the language whose level it labels. */
export function levelName(level: FunnyLevel, language: "en" | "yue"): string {
    return raw(`language.level.${level}` as FixedKey, language);
}

/**
 * The `lang` attribute for a run of text, so a screen reader switches voice per fragment
 * rather than reading Cantonese through an English synthesiser or the reverse.
 */
export function langAttr(language: "en" | "yue"): string {
    return language === "en" ? "en" : "zh-HK";
}

/**
 * Bilingual pages lead with English, so the document language is English and the
 * Cantonese fragments carry `lang="zh-HK"` themselves.
 */
export function documentLanguage(mode: LanguageMode = state.mode): string {
    return mode === "yue" ? "zh-HK" : "en";
}

function applyDocumentLanguage(): void {
    const root = globalThis.document?.documentElement;
    if (!root) return;
    root.dataset.setupLanguage = state.mode;
}

/* -------------------------------------------------------------------------- */
/* Composable                                                                 */
/* -------------------------------------------------------------------------- */

export interface SetupI18n {
    readonly mode: ComputedRef<LanguageMode>;
    readonly funnyEn: ComputedRef<FunnyLevel>;
    readonly funnyYue: ComputedRef<FunnyLevel>;
    /** Prominent plus secondary label, for anything rendered as an element. */
    pair(key: StringKey, vars?: TranslationVars): TextPair;
    /** One flat string, for an attribute. */
    t(key: StringKey, vars?: TranslationVars): string;
    setMode(mode: LanguageMode): void;
    setFunny(language: "en" | "yue", level: FunnyLevel): void;
    levelName(level: FunnyLevel, language: "en" | "yue"): string;
}

export function useSetupI18n(): SetupI18n {
    return {
        mode: computed(() => state.mode),
        funnyEn: computed(() => state.funnyEn),
        funnyYue: computed(() => state.funnyYue),
        // These read `state` inside a render function, so Vue tracks them and the whole
        // dialog re-renders in place when a slider moves. No key needs re-binding.
        pair: (key, vars = {}) => pair(key, vars),
        t: (key, vars = {}) => flat(key, vars),
        setMode: setLanguageMode,
        setFunny: setFunnyLevel,
        levelName,
    };
}
