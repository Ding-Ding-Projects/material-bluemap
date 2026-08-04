/**
 * Where the language mode and the two funny levels reach the rest of the application.
 *
 * `appCopy.ts` holds the words. This turns them into a `vue-i18n` message set for
 * whichever mode and levels are active, merges that set into the locale the application
 * is already using, and re-merges it every time either slider moves or the mode changes.
 *
 * ## Why merging rather than a locale of its own
 *
 * The obvious design is a synthetic `"voice"` locale, selected as the active one with the
 * upstream locale demoted to a fallback. It works, and it breaks something: `main.ts`
 * hands `i18nModule.global.locale` to the viewer's i18n seam, and the viewer's settings
 * menu compares that value against its own list of thirty locales to decide which language
 * is ticked. Point `locale` at a name that is not in the list and the tick disappears and
 * the menu stops agreeing with itself.
 *
 * `mergeLocaleMessage` avoids all of that. The active locale stays whatever the viewer
 * thinks it is; our keys are simply added to it. Keys the catalogue does not carry are
 * untouched, so upstream's own strings keep working, and a call site whose key is not in
 * the catalogue still renders the English fallback in its third argument exactly as it did
 * before. That is what makes this safe to grow one surface at a time rather than all at
 * once.
 *
 * Merging is idempotent by construction: every pass writes the same key set with new
 * values, so nothing accumulates and no stale string can survive a change of level.
 *
 * ## Bilingual, in a string that can only be a string
 *
 * `components/setup/` renders bilingual copy as two elements, English prominent and the
 * Cantonese beneath it at a smaller size. That is the right answer and it needs markup,
 * which is exactly what a `vue-i18n` message cannot be: `t()` returns a string, and the
 * nine hundred call sites out here put that string wherever they put it.
 *
 * So the string carries a newline between the two languages, and `bilingual.css` makes
 * that newline render as a line break in the containers Vuetify puts text in, gated behind
 * `html[data-language-mode="bilingual"]` so it cannot affect either single-language mode.
 * Vue's template compiler condenses the whitespace in template text before it reaches the
 * DOM, so the only newlines the rule can act on are ones that arrived as data, which in
 * bilingual mode means ours.
 *
 * This is honestly weaker than what the setup flow does: the secondary line is a line
 * rather than a de-emphasised one, because a text node cannot be styled separately from
 * its sibling text. What it does guarantee is the part that matters at a narrow width,
 * which is that the second language goes *downwards* rather than sideways, and that the
 * containers it lands in are allowed to grow to fit it instead of clipping it.
 */

import { watch, type WatchStopHandle } from "vue";
import type { I18n } from "vue-i18n";
import {
    APP_FIXED,
    APP_VOICED,
    isAppVoicedKey,
    type AppCopyKey,
    type AppFixedKey,
    type AppVoicedKey,
} from "./appCopy.js";
import {
    funnyLevel,
    languageMode,
    type FunnyLevel,
    type LanguageMode,
} from "../components/setup/setupI18n.js";

/**
 * What separates the two languages in a bilingual message.
 *
 * A newline rather than a separator character, because a separator makes one long line
 * that a narrow window has to wrap in the middle of a sentence, and the reader has to work
 * out where one language stopped. A line break is unambiguous at every width.
 */
export const BILINGUAL_JOIN = "\n";

/** The attribute `bilingual.css` keys off, set on `<html>` by `applyLanguageMode`. */
export const MODE_ATTRIBUTE = "data-language-mode";

export interface LanguageSettings {
    readonly mode: LanguageMode;
    readonly funnyEn: FunnyLevel;
    readonly funnyYue: FunnyLevel;
}

/** The settings as they stand right now, read from the one persisted store. */
export function currentLanguageSettings(): LanguageSettings {
    return { mode: languageMode(), funnyEn: funnyLevel("en"), funnyYue: funnyLevel("yue") };
}

/**
 * One catalogue string in one language at one level.
 *
 * A fixed key ignores the level entirely, which is the whole distinction between the two
 * catalogues: there is no code path here through which a funny level can reach a button
 * label. Out of range is clamped to the middle rather than throwing, because a stored
 * preference is user input and a corrupt one is not worth a blank screen.
 */
export function appString(key: AppCopyKey, language: "en" | "yue", level: FunnyLevel): string {
    if (isAppVoicedKey(key)) {
        const strings = APP_VOICED[key][language];
        return strings[level - 1] ?? strings[2];
    }
    return APP_FIXED[key as AppFixedKey][language];
}

/** The English string at the English level, whatever the mode is. */
export function appEnglish(key: AppCopyKey, settings: LanguageSettings): string {
    return appString(key, "en", settings.funnyEn);
}

/** The Cantonese string at the Cantonese level, whatever the mode is. */
export function appCantonese(key: AppCopyKey, settings: LanguageSettings): string {
    return appString(key, "yue", settings.funnyYue);
}

/**
 * The message a call site receives for one key under one set of settings.
 *
 * Still a message *format*, not rendered text: the `{placeholders}` are left in place for
 * `vue-i18n` to interpolate with the named arguments the call site passes. That is the
 * whole reason the facts survive a change of level. The catalogue never sees the values.
 */
export function appMessage(key: AppCopyKey, settings: LanguageSettings): string {
    if (settings.mode === "en") return appEnglish(key, settings);
    if (settings.mode === "yue") return appCantonese(key, settings);
    return `${appEnglish(key, settings)}${BILINGUAL_JOIN}${appCantonese(key, settings)}`;
}

/**
 * Every key in the catalogue, resolved for these settings, flat and ready to merge.
 *
 * Flat rather than nested on purpose. `vue-i18n` resolves `"config.maps.deleteAction"` as
 * a path through nested objects *or* as a literal key, and a flat map cannot collide with
 * the nested shape the upstream `.conf` locales are parsed into: merging `{ "config.x": … }`
 * adds one own property and leaves any existing `config` object alone.
 */
export function voiceMessages(settings: LanguageSettings): Record<string, string> {
    const messages: Record<string, string> = {};
    for (const key of Object.keys(APP_VOICED) as AppVoicedKey[]) {
        messages[key] = appMessage(key, settings);
    }
    for (const key of Object.keys(APP_FIXED) as AppFixedKey[]) {
        messages[key] = appMessage(key, settings);
    }
    return messages;
}

/**
 * The `lang` attribute for the document as a whole.
 *
 * Bilingual leads with English, so the document is English and the Cantonese runs inside
 * it are the ones that need marking. A screen reader given `zh-HK` for a page that is half
 * English reads the English through a Cantonese synthesiser, which is worse than either.
 */
export function documentLanguageFor(mode: LanguageMode): string {
    return mode === "yue" ? "zh-HK" : "en";
}

/**
 * Puts the mode where `bilingual.css` can select on it.
 *
 * Deliberately *not* the `lang` attribute as well. `i18n.ts` sets that from the loaded
 * locale, which is the language the great majority of the chrome is actually in, and two
 * modules writing the same attribute in an order neither controls is how an element ends up
 * announcing whichever of them ran last. What the mode contributes to `lang` it contributes
 * once, when nothing has been chosen yet: `loadLanguage` starts a Cantonese-mode profile on
 * the `zh-HK` locale rather than on English.
 */
export function applyLanguageMode(mode: LanguageMode, root?: HTMLElement | null): void {
    const element = root ?? globalThis.document?.documentElement;
    if (!element) return;
    element.setAttribute(MODE_ATTRIBUTE, mode);
}

/**
 * Merges the catalogue into one locale.
 *
 * Exported so `i18n.ts` can call it the moment a locale finishes loading, before anything
 * has had a chance to render the English fallback and be seen doing it.
 */
export function mergeVoiceInto(
    i18n: I18n<Record<string, unknown>>,
    locale: string,
    settings: LanguageSettings = currentLanguageSettings(),
): void {
    i18n.global.mergeLocaleMessage(locale, voiceMessages(settings));
}

/**
 * Keeps one locale's messages in step with the sliders for as long as the app is running.
 *
 * `watch` rather than `watchEffect` so the dependency list is the three settings and
 * nothing else: `voiceMessages` walks the whole catalogue, and a stray reactive read inside
 * it would re-run this on unrelated state. The `immediate` pass is what installs the
 * messages in the first place, so a caller never has to merge and then watch.
 *
 * Returns the stop handle. Tests use it; the application runs for as long as the window
 * does and never stops watching.
 */
export function installAppVoice(
    i18n: I18n<Record<string, unknown>>,
    localeOf: () => string,
): WatchStopHandle {
    return watch(
        () => {
            const settings = currentLanguageSettings();
            return [localeOf(), settings.mode, settings.funnyEn, settings.funnyYue] as const;
        },
        ([locale, mode]) => {
            mergeVoiceInto(i18n, locale);
            applyLanguageMode(mode);
        },
        { immediate: true },
    );
}
