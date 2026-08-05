/**
 * Every setting the site has, declared once.
 *
 * The declaration is what the page renders from, what the search indexes, what the
 * reset walks, and what the export writes. Adding a control by hand somewhere else
 * is how a setting ends up unsearchable, or resettable everywhere except the one
 * place a visitor looks.
 */

import type { SettingDefinition, SettingsTab } from "./types.js";

export const SETTINGS_TABS: readonly SettingsTab[] = [
    {
        id: "general",
        labelKey: "settings.tab.general",
        descriptionKey: "settings.tab.general.desc",
        groups: [
            { id: "theme", labelKey: "settings.group.theme" },
            { id: "motion", labelKey: "settings.group.motion" },
        ],
    },
    {
        id: "language",
        labelKey: "settings.tab.language",
        descriptionKey: "settings.tab.language.desc",
        groups: [
            { id: "languageMode", labelKey: "settings.group.languageMode" },
            { id: "tone", labelKey: "settings.group.tone" },
        ],
    },
    {
        id: "appearance",
        labelKey: "settings.tab.appearance",
        descriptionKey: "settings.tab.appearance.desc",
        groups: [
            { id: "type", labelKey: "settings.group.type" },
            { id: "shape", labelKey: "settings.group.shape" },
            { id: "elements", labelKey: "settings.group.elements" },
            { id: "presets", labelKey: "settings.group.presets" },
        ],
    },
    {
        id: "access",
        labelKey: "settings.tab.access",
        descriptionKey: "settings.tab.access.desc",
        groups: [
            { id: "focus", labelKey: "settings.group.focus" },
            { id: "targets", labelKey: "settings.group.targets" },
        ],
    },
    {
        id: "data",
        labelKey: "settings.tab.data",
        descriptionKey: "settings.tab.data.desc",
        groups: [
            { id: "transfer", labelKey: "settings.group.transfer" },
            { id: "resetGroup", labelKey: "settings.group.resetGroup" },
        ],
    },
];

/**
 * The settings that hold a value.
 *
 * Ids are storage keys and never change meaning. `theme.mode`, `theme.density`,
 * and the three language ids match the preference keys the shell and the pre-paint
 * script already use, so the settings page drives the same stored value rather
 * than a second copy of it.
 */
export const SETTINGS: readonly SettingDefinition[] = [
    /* ---------------- General ---------------- */
    {
        id: "theme.mode",
        kind: "select",
        tab: "general",
        group: "theme",
        labelKey: "set.themeMode",
        descriptionKey: "set.themeMode.desc",
        keywords: ["dark mode", "light mode", "night", "深色", "淺色", "夜間"],
        defaultValue: "system",
        options: [
            { value: "system", labelKey: "set.themeMode.system" },
            { value: "light", labelKey: "set.themeMode.light" },
            { value: "dark", labelKey: "set.themeMode.dark" },
        ],
    },
    {
        id: "theme.contrast",
        kind: "select",
        tab: "general",
        group: "theme",
        labelKey: "set.contrast",
        descriptionKey: "set.contrast.desc",
        keywords: ["accessibility", "legibility", "對比", "無障礙"],
        defaultValue: "standard",
        options: [
            { value: "standard", labelKey: "set.contrast.standard" },
            { value: "medium", labelKey: "set.contrast.medium" },
            { value: "high", labelKey: "set.contrast.high" },
        ],
    },
    {
        id: "theme.density",
        kind: "select",
        tab: "general",
        group: "theme",
        labelKey: "set.density",
        descriptionKey: "set.density.desc",
        keywords: ["compact", "spacing", "緊湊", "間距"],
        defaultValue: "comfortable",
        options: [
            { value: "comfortable", labelKey: "set.density.comfortable" },
            { value: "compact", labelKey: "set.density.compact" },
        ],
    },
    {
        id: "theme.accent",
        kind: "color",
        tab: "general",
        group: "theme",
        labelKey: "set.accentSeed",
        descriptionKey: "set.accentSeed.desc",
        keywords: ["primary", "seed", "brand", "主色", "品牌色"],
        // Beacon Amber, the shipped brand seed (see theme/tokens.css). This is what "reset
        // to default" restores to, and what every visitor who has never touched this control
        // is actually seeing - applyRootAppearance() overrides --md-sys-color-primary from
        // this value unconditionally on every page load, so a stale seed here would silently
        // repaint the whole site back to the old brand regardless of what tokens.css says.
        defaultValue: "#7e4e00",
    },
    {
        id: "theme.surfaceTint",
        kind: "toggle",
        tab: "general",
        group: "theme",
        labelKey: "set.surfaceTint",
        descriptionKey: "set.surfaceTint.desc",
        defaultValue: true,
    },
    {
        id: "motion.reduce",
        kind: "select",
        tab: "general",
        group: "motion",
        labelKey: "set.reduceMotion",
        descriptionKey: "set.reduceMotion.desc",
        keywords: ["animation", "vestibular", "動畫", "減少"],
        defaultValue: "system",
        options: [
            { value: "system", labelKey: "set.reduceMotion.system" },
            { value: "always", labelKey: "set.reduceMotion.always" },
            { value: "never", labelKey: "set.reduceMotion.never" },
        ],
    },
    {
        id: "motion.scale",
        kind: "slider",
        tab: "general",
        group: "motion",
        labelKey: "set.motionScale",
        descriptionKey: "set.motionScale.desc",
        defaultValue: 1,
        min: 0,
        max: 2,
        step: 0.05,
    },

    /* ---------------- Language ---------------- */
    {
        id: "language.mode",
        kind: "select",
        tab: "language",
        group: "languageMode",
        labelKey: "set.languageMode",
        descriptionKey: "set.languageMode.desc",
        keywords: ["english", "cantonese", "bilingual", "廣東話", "英文", "雙語"],
        defaultValue: "en",
        options: [
            { value: "en", labelKey: "set.languageMode.en" },
            { value: "yue", labelKey: "set.languageMode.yue" },
            { value: "bilingual", labelKey: "set.languageMode.bilingual" },
        ],
    },
    {
        id: "language.secondaryInline",
        kind: "toggle",
        tab: "language",
        group: "languageMode",
        labelKey: "set.secondaryInline",
        descriptionKey: "set.secondaryInline.desc",
        defaultValue: false,
        dependsOn: { id: "language.mode", equals: "bilingual" },
    },
    {
        id: "language.funny.en",
        kind: "slider",
        tab: "language",
        group: "tone",
        labelKey: "set.funnyEn",
        descriptionKey: "set.funnyEn.desc",
        keywords: ["tone", "humour", "humor", "playful", "語氣", "搞笑"],
        defaultValue: 3,
        min: 1,
        max: 5,
        step: 1,
        stopLabelKeyPrefix: "set.funny",
    },
    {
        id: "language.funny.yue",
        kind: "slider",
        tab: "language",
        group: "tone",
        labelKey: "set.funnyYue",
        descriptionKey: "set.funnyYue.desc",
        keywords: ["tone", "humour", "playful", "語氣", "搞笑"],
        defaultValue: 3,
        min: 1,
        max: 5,
        step: 1,
        stopLabelKeyPrefix: "set.funny",
    },

    /* ---------------- Appearance ---------------- */
    {
        id: "type.family",
        kind: "font",
        tab: "appearance",
        group: "type",
        labelKey: "set.fontFamily",
        descriptionKey: "set.fontFamily.desc",
        keywords: ["typeface", "font", "字體", "字型"],
        defaultValue: "system-ui",
    },
    {
        id: "type.mono",
        kind: "font",
        tab: "appearance",
        group: "type",
        labelKey: "set.monoFamily",
        descriptionKey: "set.monoFamily.desc",
        keywords: ["monospace", "code", "等寬", "程式碼"],
        defaultValue: "mono-ui",
        monospaceOnly: true,
    },
    {
        id: "type.scale",
        kind: "slider",
        tab: "appearance",
        group: "type",
        labelKey: "set.fontScale",
        descriptionKey: "set.fontScale.desc",
        keywords: ["text size", "zoom", "字級", "放大"],
        defaultValue: 1,
        min: 0.8,
        max: 1.6,
        step: 0.05,
    },
    {
        id: "type.weight",
        kind: "select",
        tab: "appearance",
        group: "type",
        labelKey: "set.fontWeight",
        descriptionKey: "set.fontWeight.desc",
        defaultValue: "400",
        options: [
            { value: "300", labelKey: "type.weight.300" },
            { value: "400", labelKey: "type.weight.400" },
            { value: "500", labelKey: "type.weight.500" },
            { value: "600", labelKey: "type.weight.600" },
            { value: "700", labelKey: "type.weight.700" },
        ],
    },
    {
        id: "shape.cornerScale",
        kind: "slider",
        tab: "appearance",
        group: "shape",
        labelKey: "set.cornerScale",
        descriptionKey: "set.cornerScale.desc",
        keywords: ["rounded", "square", "圓角", "直角"],
        defaultValue: 1,
        min: 0,
        max: 2,
        step: 0.1,
    },
    {
        id: "shape.elevation",
        kind: "toggle",
        tab: "appearance",
        group: "shape",
        labelKey: "set.elevation",
        descriptionKey: "set.elevation.desc",
        keywords: ["shadow", "outline", "陰影", "邊框"],
        defaultValue: true,
    },
    {
        id: "shape.borderWidth",
        kind: "number",
        tab: "appearance",
        group: "shape",
        labelKey: "set.borderWidth",
        descriptionKey: "set.borderWidth.desc",
        defaultValue: 1,
        min: 0,
        max: 4,
        step: 0.5,
        unit: "px",
    },

    /* ---------------- Accessibility ---------------- */
    {
        id: "a11y.focusWidth",
        kind: "number",
        tab: "access",
        group: "focus",
        labelKey: "set.focusWidth",
        descriptionKey: "set.focusWidth.desc",
        keywords: ["keyboard", "outline", "鍵盤", "框"],
        defaultValue: 3,
        min: 1,
        max: 8,
        step: 1,
        unit: "px",
    },
    {
        id: "a11y.focusColor",
        kind: "color",
        tab: "access",
        group: "focus",
        labelKey: "set.focusColor",
        descriptionKey: "set.focusColor.desc",
        defaultValue: "#8ab4f8",
    },
    {
        id: "a11y.underlineLinks",
        kind: "toggle",
        tab: "access",
        group: "focus",
        labelKey: "set.underlineLinks",
        descriptionKey: "set.underlineLinks.desc",
        defaultValue: true,
    },
    {
        id: "a11y.minTarget",
        kind: "number",
        tab: "access",
        group: "targets",
        labelKey: "set.minTarget",
        descriptionKey: "set.minTarget.desc",
        keywords: ["tap", "touch", "hit area", "點擊"],
        defaultValue: 44,
        min: 24,
        max: 72,
        step: 2,
        unit: "px",
    },
    {
        id: "a11y.textSpacing",
        kind: "toggle",
        tab: "access",
        group: "targets",
        labelKey: "set.textSpacing",
        descriptionKey: "set.textSpacing.desc",
        keywords: ["wcag", "line height", "letter spacing", "行高", "字距"],
        defaultValue: false,
    },
];

/** Ids whose value the root custom properties are derived from. */
export const ROOT_SETTING_IDS: readonly string[] = [
    "theme.mode",
    "theme.contrast",
    "theme.density",
    "theme.accent",
    "theme.surfaceTint",
    "motion.reduce",
    "motion.scale",
    "type.family",
    "type.mono",
    "type.scale",
    "type.weight",
    "shape.cornerScale",
    "shape.elevation",
    "shape.borderWidth",
    "a11y.focusWidth",
    "a11y.focusColor",
    "a11y.underlineLinks",
    "a11y.minTarget",
    "a11y.textSpacing",
];
