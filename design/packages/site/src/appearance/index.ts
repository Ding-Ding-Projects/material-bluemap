/**
 * The appearance module's public surface.
 *
 * Import the stylesheet once from the site entry:
 *     import "./settings/settings.css";
 *
 * Typical wiring, after the shell has a `Preferences` and a `ThemeController`:
 *
 *     const appearance = new AppearanceController(prefs);
 *     registerAppearanceTarget(tabElement, { kind: "tab", instance: tab.id }, appearance);
 *
 * Registering an element is what makes it themable: the data attributes the call
 * writes are what the managed stylesheet's selectors match, and the same call adds
 * the context menu and the keyboard paths that reach the editor.
 */

export { AppearanceController } from "./controller.js";
export { AppearanceStore, appearanceStore, THEME_FORMAT, THEME_VERSION } from "./store.js";
export type { AppearancePreset, ThemeFile, ThemeImportReport } from "./store.js";

export {
    APPEARANCE_TARGETS,
    BOX_DEFAULTS,
    BOX_PROPERTIES,
    STATE_DEFAULTS,
    STATE_NAMES,
    cloneAppearance,
    defaultAppearance,
    findTarget,
    isAppearanceEmpty,
    splitStyleId,
    styleId,
} from "./model.js";
export type {
    AppearanceTargetDefinition,
    BoxValues,
    ElementAppearance,
    StateName,
    StateValues,
} from "./model.js";

export { applyAppearance, applyRootAppearance, accentPalette, elevationShadow, resolveColor, toneOf } from "./apply.js";
export type { AccentPalette, RootAppearance } from "./apply.js";

export { openAppearanceEditor, closeAppearanceEditor } from "./editor/appearanceEditor.js";
export type { OpenEditorOptions } from "./editor/appearanceEditor.js";
export { registerAppearanceTarget, openElementMenu, closeElementMenu } from "./editor/contextMenu.js";
export type { AppearanceTargetBinding, MenuItem } from "./editor/contextMenu.js";

export { createPresetsPanel } from "./presetsPanel.js";
export type { PresetsPanelOptions, PresetsPanelView } from "./presetsPanel.js";

export { createColorPicker, serialiseColor } from "./color/picker.js";
export type { ColorPickerOptions, ColorPickerView } from "./color/picker.js";
export {
    REPRESENTATIONS,
    REPRESENTATION_IDS,
    formatAll,
    formatRepresentation,
    naiveCmykToSrgb,
    parseColor,
    srgbToNaiveCmyk,
} from "./color/representations.js";
export type {
    FormattedRepresentation,
    ParseResult,
    RepresentationId,
    RepresentationInfo,
    RepresentationLoss,
} from "./color/representations.js";
export {
    COLOR_SPACES,
    clipToSrgb,
    componentsOf,
    convert,
    fromSrgb,
    isInSrgbGamut,
    toSrgb,
} from "./color/spaces.js";
export type { ColorSpace, ComponentInfo, Triple } from "./color/spaces.js";
export { color, colorsEqual, compositeOver, gamutReport, inSpace, srgb, srgbCoords, toRenderableCss } from "./color/value.js";
export type { ColorValue, GamutReport } from "./color/value.js";
export { contrastReport, formatRatio, relativeLuminance } from "./color/contrast.js";
export type { ContrastGrade, ContrastReport } from "./color/contrast.js";
export { NAMED_COLOR_NAMES, lookupNamedColor, nameForSrgb } from "./color/named.js";

export {
    CJK_FALLBACK,
    SYSTEM_FONT_FAMILIES,
    findFamily,
    isFamilyAvailable,
    localFontAccessState,
    mergeFamilies,
    queryInstalledFonts,
    stackFor,
} from "./type/fonts.js";
export type { FontFamilyEntry, LocalFontAccess } from "./type/fonts.js";
export {
    TYPOGRAPHY_DEFAULTS,
    TYPOGRAPHY_PROPERTIES,
    capabilityOf,
    cloneTypography,
    isPropertyInherited,
    propertyByKey,
    typographyToCss,
} from "./type/model.js";
export type { CapabilityReport, TypographyProperty, TypographyValues } from "./type/model.js";

export { APPEARANCE_STRINGS } from "./strings.js";
