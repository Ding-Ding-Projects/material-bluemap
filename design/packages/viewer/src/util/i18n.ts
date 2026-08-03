/**
 * i18n seam: upstream imports the vue-i18n global from "../i18n" (webapp/src/i18n.js),
 * which is owned by the UI package. The viewer only needs translation lookup, the current
 * locale and the language switcher — the UI installs its adapter here at startup.
 * Default is an identity adapter (translation lookups return the key, language switches
 * are ignored), which keeps the viewer usable standalone.
 */
export interface I18nAdapter {
    locale: { value: string };
    t(key: string, values?: Record<string, unknown>): string;
}

let adapter: I18nAdapter = {
    locale: { value: "none" },
    t: (key: string) => key,
};

let languageSetter: (lang: string) => Promise<void> = async () => {};

export const i18n: I18nAdapter = {
    get locale() {
        return adapter.locale;
    },
    t: (key, values) => adapter.t(key, values),
};

export function setLanguage(lang: string): Promise<void> {
    return languageSetter(lang);
}

export function setI18nAdapter(
    newAdapter: I18nAdapter,
    newLanguageSetter?: (lang: string) => Promise<void>,
): void {
    adapter = newAdapter;
    if (newLanguageSetter) languageSetter = newLanguageSetter;
}
