export interface ResponsiveCardTitleSurface {
    readonly issue: 93 | 94 | 95 | 96 | 97 | 98 | 99 | 100 | 101 | 103;
    readonly source: string;
    readonly titleClass: string;
    readonly text: boolean;
    readonly metadata: boolean;
    readonly actions: number;
}

/**
 * Hand-written completeness inventory for every flexed Vuetify card title covered by
 * issues #93-#101 and #103. This list is deliberately not inferred from a filename glob:
 * a renamed or newly split surface must be reviewed rather than silently disappearing.
 */
export const RESPONSIVE_CARD_TITLE_SURFACES = [
    {
        issue: 93,
        source: "backup/BackupRunCard.vue",
        titleClass: "mb-backup-row__head",
        text: true,
        metadata: true,
        actions: 0,
    },
    {
        issue: 94,
        source: "backup/BackupScreen.vue",
        titleClass: "mb-backup__listingTitle",
        text: true,
        metadata: true,
        actions: 0,
    },
    {
        issue: 95,
        source: "config/ConfigApplyDialog.vue",
        titleClass: "mb-config-apply__title",
        text: true,
        metadata: false,
        actions: 0,
    },
    {
        issue: 96,
        source: "config/ConfigFileForm.vue",
        titleClass: "mb-config-form__source-head",
        text: false,
        metadata: false,
        actions: 2,
    },
    {
        issue: 97,
        source: "downloads/DownloadRowCard.vue",
        titleClass: "mb-download-row__head",
        text: true,
        metadata: true,
        actions: 0,
    },
    {
        issue: 98,
        source: "project/DiscoveredWorldsPanel.vue",
        titleClass: "mb-discovered__head",
        text: true,
        metadata: false,
        actions: 1,
    },
    {
        issue: 99,
        source: "settings/DependencyInstallerPanel.vue",
        titleClass: "mb-deps__head",
        text: true,
        metadata: false,
        actions: 0,
    },
    {
        issue: 100,
        source: "world/ContainerOffers.vue",
        titleClass: "mb-container-offers__head",
        text: true,
        metadata: true,
        actions: 0,
    },
    {
        issue: 101,
        source: "world/InterruptedRenders.vue",
        titleClass: "mb-world-resume__head",
        text: true,
        metadata: true,
        actions: 0,
    },
    {
        issue: 103,
        source: "worldrepo/WorldRepoScreen.vue",
        titleClass: "mb-worldrepo-row__title",
        text: true,
        metadata: true,
        actions: 0,
    },
    {
        issue: 103,
        source: "pages/PagesScreen.vue",
        titleClass: "mb-pages-row__title",
        text: true,
        metadata: true,
        actions: 0,
    },
] as const satisfies readonly ResponsiveCardTitleSurface[];

export const RESPONSIVE_CARD_TITLE_MATRIX = {
    widths: [360, 390, 414, 800],
    scales: [1, 1.25, 1.5, 2],
    languages: ["english", "cantonese", "bilingual"],
} as const;
