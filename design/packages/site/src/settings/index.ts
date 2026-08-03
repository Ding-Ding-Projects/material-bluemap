/**
 * The settings module's public surface.
 *
 * Import the stylesheet once from the site entry:
 *     import "./settings/settings.css";
 *
 * Typical wiring:
 *
 *     const appearance = new AppearanceController(prefs);
 *     const settings = createSettingsPage({ prefs, appearance, theme });
 *     mountPoint.append(settings.element);
 *
 * The search module attaches through `settings.search`. See `README.md` in this
 * directory for what each hook expects.
 */

export { createSettingsPage } from "./page.js";
export type { SettingsPageOptions, SettingsPageView, SettingsSearchHooks } from "./page.js";

export { SettingsStore } from "./store.js";
export type { ImportReport, SettingBridge } from "./store.js";

export { SETTINGS, SETTINGS_TABS, ROOT_SETTING_IDS } from "./schema.js";
export { isStoredSetting } from "./types.js";
export type {
    ActionSetting,
    ColorSetting,
    FontSetting,
    NumberSetting,
    SelectSetting,
    SettingDefinition,
    SettingValue,
    SettingsGroup,
    SettingsTab,
    SliderSetting,
    StoredSetting,
    TextSetting,
    ToggleSetting,
} from "./types.js";

export {
    FUNNY_LEVELS,
    LANGUAGE_MODES,
    allKeys,
    documentLanguage,
    fillPhrase,
    getI18nState,
    registerStrings,
    searchableText,
    setI18nState,
    subscribeI18n,
    t,
    tParts,
} from "./i18n.js";
export type {
    FunnyLevel,
    I18nState,
    Interpolations,
    LanguageMode,
    LocalisedPhrase,
    Phrase,
    PhraseParts,
    StringTable,
} from "./i18n.js";

export { confirmDestructive, installDestructiveGate } from "./confirm.js";
export type { DestructiveGate } from "./confirm.js";

export { announce, copyText, downloadFile, flashAttention, pickFile, prefersReducedMotion } from "./dom.js";

export { SETTINGS_STRINGS } from "./strings.js";
