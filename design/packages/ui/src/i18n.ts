import { parseHocon } from "@material-bluemap/shared";
import { createI18n, type I18n } from "vue-i18n";

/**
 * Port of upstream webapp i18n.js: locales are HOCON files under ./lang/, lazily
 * fetched; ./lang/settings.conf lists available languages and the default.
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

export async function setLanguage(
    i18n: I18n<Record<string, unknown>>,
    lang: string,
): Promise<void> {
    try {
        const messages = await fetchHocon(`./lang/${lang}.conf`);
        i18n.global.setLocaleMessage(lang, messages);
        (i18n.global.locale as unknown as { value: string }).value = lang;
        document.querySelector("html")?.setAttribute("lang", lang);
    } catch (error) {
        console.error(`Failed to load language '${lang}':`, error);
    }
}

export async function loadLanguage(i18n: I18n<Record<string, unknown>>): Promise<void> {
    await loadLanguageSettings();
    let lang = localStorage.getItem("bluemap-lang") ?? navigator.language.split("-")[0] ?? "en";
    if (!languages.some((l) => l.locale === lang)) lang = defaultLanguage;
    await setLanguage(i18n, lang);
}
