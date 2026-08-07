import { parseHocon } from "@worldlens/shared";
import { getLocalStorage } from "@worldlens/viewer";
import { createI18n, type I18n } from "vue-i18n";
import { installAppVoice, mergeVoiceInto } from "./copy/appVoice.js";
import { languageMode } from "./components/setup/setupI18n.js";
// The one stylesheet the copy layer owns: it makes the newline in a bilingual message
// render as a line break, and lets the containers it lands in grow instead of clipping the
// second language away. Every rule in it is gated on `html[data-language-mode="bilingual"]`.
import "./copy/bilingual.css";

/**
 * Port of upstream webapp i18n.js: locales are HOCON files under ./lang/, lazily
 * fetched; ./lang/settings.conf lists available languages and the default.
 *
 * Two things sit on top of the port, and both are about the application's own copy rather
 * than the viewer's. The thirty bundled `.conf` files are upstream BlueMap's viewer
 * locales; between them they carry about seventy keys, and not one of them is a key this
 * application invented. Every one of the nine hundred and fifty
 * `t("world.folder.noLevelDat", { folder }, "There is no level.dat in {folder} ...")` call
 * sites in this package therefore rendered its English fallback, in all thirty languages,
 * at every funny level, because there was nothing on the other side of the call.
 *
 * `copy/appCopy.ts` is now the other side of the call, and `mergeVoiceInto` below merges it
 * into whichever locale is active the moment that locale finishes loading. A key the
 * catalogue carries is answered in the chosen mode at the chosen funny level; a key it does
 * not carry falls through to the English fallback exactly as before.
 */
export const i18nModule = createI18n({
    legacy: false,
    locale: "none",
    fallbackLocale: "none",
    silentFallbackWarn: true,
    messages: {},
});

interface LanguageInfo {
    locale: string;
    name: string;
}

export let languages: LanguageInfo[] = [];
export let defaultLanguage = "en";

/**
 * `parseHocon` is the port's own dependency-free parser. The `hocon-parser` package this
 * used to call resolves substitutions with `eval`, which the app's Content Security Policy
 * (`script-src 'self'`, no `unsafe-eval`) refuses: the locale load threw, no messages were
 * ever registered, and the whole UI rendered blank.
 */
async function fetchHocon(url: string): Promise<Record<string, unknown>> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
    return parseHocon(await response.text());
}

async function loadLanguageSettings(): Promise<void> {
    const settings = (await fetchHocon("./lang/settings.conf")) as {
        default?: string;
        languages?: LanguageInfo[];
    };
    defaultLanguage = settings.default ?? "en";
    languages = settings.languages ?? [];
}

/** The locale the application is currently reading upstream's viewer strings from. */
let activeLocale = defaultLanguage;

export function currentLocale(): string {
    return activeLocale;
}

export async function setLanguage(
    i18n: I18n<Record<string, unknown>>,
    lang: string,
): Promise<void> {
    try {
        const messages = await fetchHocon(`./lang/${lang}.conf`);
        i18n.global.setLocaleMessage(lang, messages);
        // Straight after `setLocaleMessage` and before the locale is switched onto it, so
        // no frame ever renders this locale with the application's own keys missing. A
        // switch first would show a flash of English fallbacks in Cantonese mode.
        mergeVoiceInto(i18n, lang);
        activeLocale = lang;
        (i18n.global.locale as unknown as { value: string }).value = lang;
        document.querySelector("html")?.setAttribute("lang", lang);
    } catch (error) {
        console.error(`Failed to load language '${lang}':`, error);
    }
}

/**
 * The upstream locale a fresh profile should start on, given the chosen language mode.
 *
 * Only consulted when nothing has been stored, so an explicit choice in the viewer's own
 * language list always wins. Without it, picking 廣東話 during first-run setup produced an
 * application whose own copy was Cantonese and whose viewer menu, marker list and map
 * tooltips were all still English, which reads as a half-finished translation rather than
 * as the two separate settings it actually is.
 *
 * Bilingual leads with English, so it starts there and lets the catalogue supply the
 * Cantonese underneath.
 */
export function preferredLocaleForMode(mode: string): string | null {
    return mode === "yue" ? "zh-HK" : null;
}

export async function loadLanguage(i18n: I18n<Record<string, unknown>>): Promise<void> {
    await loadLanguageSettings();
    // The viewer writes this key through `setLocalStorage`, which JSON-stringifies, so the
    // raw stored value is `"en"` including the quote characters. Reading it with
    // `localStorage.getItem` returned that verbatim, the `languages.some(...)` check below
    // never matched, and the saved language silently fell back to the default on every load.
    const stored = getLocalStorage("bluemap-lang");
    const chosen = typeof stored === "string" ? stored : null;
    let lang =
        chosen ??
        preferredLocaleForMode(languageMode()) ??
        navigator.language.split("-")[0] ??
        "en";
    if (!languages.some((l) => l.locale === lang)) lang = defaultLanguage;
    await setLanguage(i18n, lang);
    // After the first locale is in place, so the immediate pass has a real locale to merge
    // into. From here the sliders and the mode radio move the whole application's copy
    // without anything else being told to re-render: `mergeLocaleMessage` writes into
    // vue-i18n's reactive message store, and every `t()` in every component re-resolves.
    installAppVoice(i18n, currentLocale);
}
