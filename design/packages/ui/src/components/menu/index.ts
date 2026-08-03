/**
 * Public surface of the side menu.
 *
 * `MainMenu` is the whole side sheet with its page stack; the shell renders exactly one of
 * them. Everything else is exported so the other menu surfaces (the control bar, the marker
 * list) can reuse the same primitives instead of growing a second set.
 */
export { default as MainMenu } from "./MainMenu.vue";
export { default as SettingsMenu } from "./SettingsMenu.vue";
export { default as MapsMenu } from "./MapsMenu.vue";
export { default as InfoPage } from "./InfoPage.vue";

export { default as MenuSideSheet } from "./MenuSideSheet.vue";
export { default as MenuGroup } from "./MenuGroup.vue";
export { default as MenuOption } from "./MenuOption.vue";
export { default as MenuOptionList } from "./MenuOptionList.vue";
export { default as MenuChoice } from "./MenuChoice.vue";
export { default as MenuSlider } from "./MenuSlider.vue";
export { default as MenuSwitch } from "./MenuSwitch.vue";
export { default as MenuSearchBar } from "./MenuSearchBar.vue";
export { default as MenuSearchField } from "./MenuSearchField.vue";
export { default as MenuRegexBuilder } from "./MenuRegexBuilder.vue";
export { default as MenuSuperConfirm } from "./MenuSuperConfirm.vue";

export { blueMapKey, provideBlueMap, useBlueMap, useBlueMapTheme } from "./useBlueMap";
export { useMenuSearch } from "./menuPrefs";
export type { MenuSearchState } from "./menuPrefs";
export {
    MAX_EVAL_MS,
    MAX_MATCHES,
    MAX_PATTERN_LENGTH,
    MAX_SAMPLE_LENGTH,
    SUPPORTED_FLAGS,
    compilePattern,
    createMatcher,
    evaluatePattern,
    includesCI,
} from "./regex";
export type {
    CompileResult,
    MatcherResult,
    RegexEvaluation,
    RegexFlag,
    RegexMatchResult,
} from "./regex";
