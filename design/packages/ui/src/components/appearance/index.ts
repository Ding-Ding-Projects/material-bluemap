/**
 * The appearance feature's public surface.
 *
 * A host wanting to make one element editable needs exactly one of these -
 * {@link AppearanceTarget} - wrapped around whatever it renders. Everything else is exported
 * because the editor, the picker and the store are useful on their own: a settings screen can
 * mount {@link AppearanceEditor} directly, a form can use {@link ColorField} for any colour it
 * owns, and the colour conversions are ordinary functions that nothing about this feature is
 * required to use.
 */

export { default as AppearanceEditor } from "./AppearanceEditor.vue";
export { default as AppearanceTarget } from "./AppearanceTarget.vue";
export { default as ColorField } from "./ColorField.vue";
export { default as InfiniteColorPicker } from "./InfiniteColorPicker.vue";
export { default as TypographyEditor } from "./TypographyEditor.vue";

export * from "./appearanceRecord.js";
export * from "./appearanceStore.js";
export * from "./colorFormat.js";
export * from "./colorNames.js";
export * from "./colorParse.js";
export * from "./colorSpaces.js";
export * from "./fontCatalog.js";
export * from "./typographySpec.js";
export * from "./useAppearance.js";
