/**
 * What the language section contributes to the settings surface's own search.
 *
 * The counterpart of `consentSearch.ts`, and it exists for the same reason. The settings
 * surface searches over the text a section actually renders, so a section whose copy lives
 * inside a child component is a section the search cannot see: somebody types "funny",
 * reads "No setting on this screen matches that", and concludes the app has no such
 * setting while it is two rows further down.
 *
 * A module-level function rather than a method on the component, again matching consent.
 * A template ref only exists once the section has mounted, and the settings surface keeps
 * filtered-out sections mounted precisely so that refs stay valid; leaning on that ordering
 * for something as ordinary as search text is how a search silently returns nothing on the
 * first frame.
 *
 * Everything here is read from the live catalogue at the current mode and levels, so a
 * Cantonese profile searches in Cantonese and finds the row that is on screen. Both funny
 * levels are named as well as numbered, because "Maximum playfulness" is the part somebody
 * remembers and a bare "5" matches nothing anybody would type.
 */

import { flat, funnyLevel, languageMode, levelName } from "./setupI18n.js";

export function languageSearchLabels(): string[] {
    const en = funnyLevel("en");
    const yue = funnyLevel("yue");
    return [
        flat("language.settingsTitle"),
        flat("language.title"),
        flat(`language.mode.${languageMode()}` as const),
        flat("language.funny.en"),
        `${String(en)} ${levelName(en, "en")}`,
        flat("language.funny.yue"),
        `${String(yue)} ${levelName(yue, "yue")}`,
        flat("language.disclosure"),
        flat("action.resetLanguage"),
    ];
}
