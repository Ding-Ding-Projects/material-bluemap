/**
 * The command palette: one shortcut, and every command, setting and destination behind it.
 *
 * The shell mounts exactly one {@link CommandPalette}, binds `open` to a ref of its own, and
 * calls {@link usePaletteShortcut} with that same ref. Four events come back, and every one
 * of them is a surface the shell already opens from a button it already has - the palette
 * deliberately opens nothing itself, so there is one copy of that wiring rather than two:
 *
 *  - `reveal-setting` carries a value shaped exactly like the render-failure flow's
 *    `SettingsTarget`, so it goes straight to the shell's existing `revealSetting` handler
 *    and the settings sheet scrolls to the row, focuses it and outlines it as it always did;
 *  - `open-settings` opens that sheet with nothing revealed;
 *  - `open-config` opens the options editor, carrying the tab asked for or null;
 *  - `open-profiles` opens the server list.
 *
 * `canRouteConfigScreens` is the shell's promise that it can honour the tab in `open-config`.
 * It defaults to false, and while it is false the options editor is one row in the palette
 * rather than seven, because seven rows that all open the same first tab would be seven rows
 * claiming a destination they do not reach.
 */

export { default as CommandPalette } from "./CommandPalette.vue";
export { default as PaletteRow } from "./PaletteRow.vue";

export {
    controlText,
    countByKind,
    filterItems,
    groupItems,
    itemHaystack,
    paletteSample,
} from "./paletteItems.js";
export type {
    PaletteChoice,
    PaletteCommand,
    PaletteControl,
    PaletteDestination,
    PaletteGroup,
    PaletteItem,
    PaletteSetting,
    Translate,
} from "./paletteItems.js";

export { buildPaletteCatalog } from "./paletteCatalog.js";
export type { PaletteCatalogInput, PaletteSettingsTarget, PaletteShellActions } from "./paletteCatalog.js";

export {
    DEFAULT_PALETTE_SIZE,
    PALETTE_SIZES,
    isPaletteShortcut,
    isPaletteSize,
    readPaletteSize,
    usePaletteShortcut,
    writePaletteSize,
} from "./palettePrefs.js";
export type { PaletteSize, PaletteStorage } from "./palettePrefs.js";

export { viewerSettingItems } from "./viewerSettings.js";
