/** Hand-written transient-owner inventory: every entry is instantiated by the coverage test. */
export const PANEL_GEOMETRY_SURFACES = [
    { id: "anchored-popover", owner: "AnchoredPanel", floating: true },
    { id: "dialog-overlay", owner: "Overlay:dialog", floating: true },
    { id: "menu-overlay", owner: "Overlay:menu", floating: true },
    { id: "command-menu", owner: "Menu", floating: true },
] as const;
