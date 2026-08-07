/** Hand-written completeness inventory: a missing panel class must fail a test. */
export const PANEL_GEOMETRY_SURFACES = [
    { id: "anchored-panels", owner: "search/AnchoredPanel.ts", floating: true },
    { id: "interactive-overlays", owner: "platform/Overlay.ts", floating: true },
    { id: "site-tab-panels", owner: "tabs/TabStrip.ts", floating: false },
    { id: "settings-tab-panels", owner: "settings/page.ts", floating: false },
] as const;
