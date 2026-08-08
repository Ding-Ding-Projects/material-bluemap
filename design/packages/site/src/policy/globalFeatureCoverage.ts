/**
 * Hand-written GitHub Pages coverage inventory.
 *
 * Pattern discovery cannot prove completeness: a missing surface also produces no match. This
 * closed list is therefore deliberately boring and explicit. Every applicable contract must
 * name both its implementation and its verification file. A browser-platform exemption needs a
 * public reason rather than silently disappearing from the site audit.
 */

export const REQUIRED_PAGES_FEATURE_IDS = [
    "material-design-3",
    "responsive-side-navigation",
    "language-modes",
    "independent-funny-levels",
    "settings-tabs-and-search",
    "scheduled-settings-external-sources",
    "anchored-regex-builders",
    "tab-overflow-reorder-pin-group",
    "four-tab-searches",
    "tab-bulk-close",
    "command-palette",
    "exact-teleport",
    "per-element-appearance",
    "infinite-colour-translator",
    "word-depth-typography",
    "non-blocking-notifications",
    "notification-history-bulk-export",
    "destructive-super-confirmation",
    "painted-bounded-overlays",
    "resizable-draggable-panels",
    "collapsible-search-controls",
    "accessibility-and-target-sizing",
    "compact-bilingual-layout",
    "action-walkthrough-gifs",
    "startup-dim-sum",
    "complete-feature-documentation",
    "verified-installer-download",
    "changelog-search-date-export",
    "settings-theme-export-import-reset",
    "context-menu-search-and-shortcuts",
    "provider-authored-markup",
    "local-assets-and-no-tracking",
    "no-promotional-nags",
    "settings-explanations-and-provenance",
    "local-git-history",
    "external-editor-launch",
    "forge-publishing",
    "path-browsers",
    "archive-export",
    "http-postman",
    "automatic-updater",
    "spoken-narrator",
] as const;

export type PagesFeatureId = (typeof REQUIRED_PAGES_FEATURE_IDS)[number];

export type PagesFeatureCoverage =
    | {
          readonly id: PagesFeatureId;
          readonly title: string;
          readonly status: "implemented";
          readonly implementation: readonly string[];
          readonly verification: readonly string[];
      }
    | {
          readonly id: PagesFeatureId;
          readonly title: string;
          readonly status: "not-applicable" | "optional-not-enabled";
          readonly reason: string;
      };

const implemented = (
    id: PagesFeatureId,
    title: string,
    implementation: readonly string[],
    verification: readonly string[],
): PagesFeatureCoverage => ({ id, title, status: "implemented", implementation, verification });

export const PAGES_FEATURE_COVERAGE: readonly PagesFeatureCoverage[] = [
    implemented(
        "material-design-3",
        "Material Design 3 tokens and components",
        ["design/packages/site/src/theme/tokens.css", "design/packages/site/src/theme/base.css"],
        ["design/packages/site/src/theme/base.test.ts"],
    ),
    implemented(
        "responsive-side-navigation",
        "Collapsible persisted side navigation",
        [
            "design/packages/site/src/shell/SidebarNavigation.ts",
            "design/packages/site/src/shell/shell.css",
        ],
        ["design/packages/site/src/shell/SidebarNavigation.test.ts"],
    ),
    implemented(
        "language-modes",
        "English, Cantonese, and compact bilingual modes",
        ["design/packages/site/src/i18n/I18n.ts", "design/packages/site/src/i18n/strings.ts"],
        [
            "design/packages/site/src/i18n/I18n.test.ts",
            "design/packages/site/src/i18n/strings.test.ts",
        ],
    ),
    implemented(
        "independent-funny-levels",
        "Independent English and Cantonese funny levels",
        ["design/packages/site/src/settings/schema.ts", "design/packages/site/src/i18n/I18n.ts"],
        ["design/packages/site/src/i18n/I18n.test.ts"],
    ),
    implemented(
        "settings-tabs-and-search",
        "Tabbed settings with global and per-tab search",
        [
            "design/packages/site/src/settings/page.ts",
            "design/packages/site/src/settings/schema.ts",
        ],
        [
            "design/packages/site/src/settings/settingsChrome.test.ts",
            "design/packages/site/src/settings/tabSearch.test.ts",
        ],
    ),
    implemented(
        "scheduled-settings-external-sources",
        "Versioned scheduled language and appearance rules with bounded API and Home Assistant sources",
        [
            "design/packages/site/src/settings/schedule.ts",
            "design/packages/site/src/settings/schedulePanel.ts",
        ],
        [
            "design/packages/site/src/settings/schedule.test.ts",
            "design/packages/site/src/settings/schedulePanel.test.ts",
        ],
    ),
    implemented(
        "anchored-regex-builders",
        "Plain-text-first search with an anchored full regex builder",
        [
            "design/packages/site/src/search/builderPanel.ts",
            "design/packages/site/src/search/attachBuilder.ts",
        ],
        [
            "design/packages/site/src/search/attachBuilder.test.ts",
            "design/packages/site/src/search/evaluator.test.ts",
        ],
    ),
    implemented(
        "tab-overflow-reorder-pin-group",
        "Browser-style tabs with overflow, reordering, pinning, and groups",
        ["design/packages/site/src/tabs/TabModel.ts", "design/packages/site/src/tabs/TabStrip.ts"],
        ["design/packages/site/src/tabs/TabStrip.test.ts"],
    ),
    implemented(
        "four-tab-searches",
        "Current-strip, group, group-name, and master tab searches",
        ["design/packages/site/src/tabs/index.ts", "design/packages/site/src/search/tabSearch.ts"],
        ["design/packages/site/src/search/tabMatching.test.ts"],
    ),
    implemented(
        "tab-bulk-close",
        "Containing and inverse tab bulk-close previews",
        [
            "design/packages/site/src/tabs/BulkCloseDialog.ts",
            "design/packages/site/src/tabs/TabModel.ts",
        ],
        ["design/packages/site/src/tabs/TabStrip.test.ts"],
    ),
    implemented(
        "command-palette",
        "Ctrl+Shift+F command palette with rich controls",
        ["design/packages/site/src/shell/commandPalette.ts", "design/packages/site/src/main.ts"],
        [
            "design/packages/site/src/shell/commandPalette.test.ts",
            "design/packages/site/src/shell/articleCommands.test.ts",
        ],
    ),
    implemented(
        "exact-teleport",
        "Palette and search results teleport to the exact article or setting",
        ["design/packages/site/src/main.ts", "design/packages/site/src/content/discoveryView.ts"],
        [
            "design/packages/site/src/content/discoveryView.test.ts",
            "design/packages/site/src/shell/articleCommands.test.ts",
        ],
    ),
    implemented(
        "per-element-appearance",
        "Per-element context-menu appearance editing",
        [
            "design/packages/site/src/appearance/editor/appearanceEditor.ts",
            "design/packages/site/src/appearance/editor/coverage.ts",
        ],
        [
            "design/packages/site/src/appearance/editor/coverage.test.ts",
            "design/packages/site/src/appearance/editor/contextMenu.test.ts",
        ],
    ),
    implemented(
        "infinite-colour-translator",
        "Continuous colour picker and multi-space translator",
        [
            "design/packages/site/src/appearance/color/picker.ts",
            "design/packages/site/src/appearance/color/representations.ts",
        ],
        [
            "design/packages/site/src/appearance/color/representations.test.ts",
            "design/packages/site/src/appearance/color/spaces.test.ts",
        ],
    ),
    implemented(
        "word-depth-typography",
        "Deep typography controls and live preview",
        [
            "design/packages/site/src/appearance/type/model.ts",
            "design/packages/site/src/appearance/type/controls.ts",
        ],
        ["design/packages/site/src/appearance/editor/controls.fontRow.test.ts"],
    ),
    implemented(
        "non-blocking-notifications",
        "Non-blocking stacked notifications",
        ["design/packages/site/src/notifications/Notifications.ts"],
        [
            "design/packages/site/src/notifications/Notifications.test.ts",
            "design/packages/site/src/notifications/notificationPolicy.test.ts",
        ],
    ),
    implemented(
        "notification-history-bulk-export",
        "Searchable notification history with selection, delete, and export",
        [
            "design/packages/site/src/main.ts",
            "design/packages/site/src/notifications/Notifications.ts",
        ],
        ["design/packages/site/src/notifications/Notifications.test.ts"],
    ),
    implemented(
        "destructive-super-confirmation",
        "Two-key and full-range slider destructive gate",
        ["design/packages/site/src/settings/confirm.ts"],
        [
            "design/packages/site/src/settings/confirm.test.ts",
            "design/packages/site/src/settings/destructiveActionPolicy.test.ts",
        ],
    ),
    implemented(
        "painted-bounded-overlays",
        "Opaque, viewport-bounded, focus-returning overlays",
        [
            "design/packages/site/src/platform/Overlay.ts",
            "design/packages/site/src/search/anchoredPanel.ts",
        ],
        [
            "design/packages/site/src/search/anchoredPanelFocusReturn.test.ts",
            "design/packages/site/src/search/anchoredPanelDismissalPolicy.test.ts",
        ],
    ),
    implemented(
        "resizable-draggable-panels",
        "Resizable panels and draggable floating panels with persisted geometry",
        [
            "design/packages/site/src/platform/PanelGeometry.ts",
            "design/packages/site/src/platform/panelGeometryCoverage.ts",
        ],
        ["design/packages/site/src/platform/PanelGeometry.test.ts"],
    ),
    implemented(
        "collapsible-search-controls",
        "Collapsible search options that expose active state",
        ["design/packages/site/src/search/searchField.ts"],
        ["design/packages/site/src/search/queryModel.test.ts"],
    ),
    implemented(
        "accessibility-and-target-sizing",
        "Keyboard, screen-reader, focus, contrast, and target sizing",
        ["design/packages/site/src/theme/base.css", "design/packages/site/src/settings/schema.ts"],
        [
            "design/packages/site/src/theme/base.test.ts",
            "design/packages/site/src/tabs/TabStrip.test.ts",
        ],
    ),
    implemented(
        "compact-bilingual-layout",
        "Compact and bilingual responsive layout",
        [
            "design/packages/site/src/theme/base.css",
            "design/packages/site/src/content/content.css",
            "design/packages/site/src/shell/shell.css",
        ],
        [
            "design/packages/site/src/content/content.css.test.ts",
            "design/packages/site/src/i18n/I18n.test.ts",
        ],
    ),
    implemented(
        "action-walkthrough-gifs",
        "Twelve finite action-specific GIF walkthroughs with reduced-motion stills",
        [
            "design/packages/site/src/walkthroughs/Gallery.ts",
            "design/packages/site/src/walkthroughs/manifest.ts",
            "design/packages/site/src/walkthroughs/walkthroughs.css",
            "design/packages/site/scripts/build-walkthrough-gifs.mjs",
        ],
        ["design/packages/site/src/walkthroughs/walkthroughs.test.ts"],
    ),
    implemented(
        "startup-dim-sum",
        "Ten-percent local dim-sum startup surprise",
        ["design/packages/site/src/dimsum/index.ts", "design/packages/site/src/dimsum/pool.ts"],
        ["design/packages/site/src/dimsum/index.test.ts"],
    ),
    implemented(
        "complete-feature-documentation",
        "Landing-page feature inventory and five-section articles",
        [
            "design/packages/site/src/content/home.ts",
            "design/packages/site/src/content/articles/index.ts",
        ],
        ["design/packages/site/src/content/content.test.ts"],
    ),
    implemented(
        "verified-installer-download",
        "Verified immutable installer download",
        [
            "design/packages/site/src/content/release.ts",
            "design/packages/site/src/content/generated/release.ts",
        ],
        ["design/packages/site/src/content/content.test.ts"],
    ),
    implemented(
        "changelog-search-date-export",
        "Searchable, date-filtered, exportable changelog",
        [
            "design/packages/site/src/content/changelogView.ts",
            "design/packages/site/src/content/dateRangePicker.ts",
        ],
        [
            "design/packages/site/src/content/changelog.test.ts",
            "design/packages/site/src/content/dateRangePicker.test.ts",
        ],
    ),
    implemented(
        "settings-theme-export-import-reset",
        "Settings and theme export, import, preset, and reset",
        [
            "design/packages/site/src/settings/page.ts",
            "design/packages/site/src/appearance/presetsPanel.ts",
        ],
        [
            "design/packages/site/src/appearance/store.test.ts",
            "design/packages/site/src/settings/settingsChrome.test.ts",
        ],
    ),
    implemented(
        "context-menu-search-and-shortcuts",
        "Searchable context menus with real shortcut labels",
        [
            "design/packages/site/src/platform/Menu.ts",
            "design/packages/site/src/appearance/editor/contextMenu.ts",
        ],
        [
            "design/packages/site/src/platform/Menu.test.ts",
            "design/packages/site/src/appearance/editor/contextMenu.test.ts",
        ],
    ),
    implemented(
        "provider-authored-markup",
        "Structured rendering for repository-authored documentation and changelog",
        [
            "design/packages/site/src/shell/renderBlocks.ts",
            "design/packages/site/src/content/changelogParser.ts",
        ],
        [
            "design/packages/site/src/content/content.test.ts",
            "design/packages/site/src/content/changelog.test.ts",
        ],
    ),
    implemented(
        "local-assets-and-no-tracking",
        "Locally bundled assets with no analytics",
        ["design/packages/site/index.html", "design/packages/site/src/content/captures.ts"],
        ["design/packages/site/src/content/content.test.ts"],
    ),
    implemented(
        "no-promotional-nags",
        "The shipped-copy policy guard rejects every unwanted solicitation pattern",
        ["design/packages/site/src/main.ts"],
        ["design/packages/site/src/notifications/notificationPolicy.test.ts"],
    ),
    implemented(
        "settings-explanations-and-provenance",
        "Every setting has explanation and default provenance",
        [
            "design/packages/site/src/settings/schema.ts",
            "design/packages/site/src/settings/page.ts",
        ],
        [
            "design/packages/site/src/settings/searchControls.test.ts",
            "design/packages/site/src/settings/settingsChrome.test.ts",
        ],
    ),
    {
        id: "local-git-history",
        title: "Local Git-backed record history",
        status: "not-applicable",
        reason: "This static documentation site owns no user documents, accounts, credentials, projects, or durable application records. Its visitor-only display preferences are exportable JSON in browser storage; a sandboxed static origin cannot create a hidden local Git repository without gaining filesystem authority the site deliberately does not request.",
    },
    {
        id: "external-editor-launch",
        title: "Open exports in Visual Studio Code",
        status: "not-applicable",
        reason: "A static browser page cannot securely detect an installed editor or reopen a downloaded Blob by local filesystem path. The site downloads complete UTF-8 exports; editor discovery and one-click Visual Studio Code opening remain responsibilities of the installed desktop application that owns filesystem access.",
    },
    {
        id: "forge-publishing",
        title: "Publish repositories to a forge",
        status: "not-applicable",
        reason: "The documentation site does not create or publish repositories and requests no forge credential. Account, owner, organization, fork, and copy-and-push choices live in the installed application surfaces that actually publish.",
    },
    {
        id: "path-browsers",
        title: "Native file and folder browsers",
        status: "not-applicable",
        reason: "The site has no path text field and never asks a visitor to type a filesystem path. Browser file inputs used for settings import are already native pickers; project and world paths belong to the desktop application.",
    },
    {
        id: "archive-export",
        title: "ZIP and advanced 7z export",
        status: "not-applicable",
        reason: "The site exports small settings, theme, notification, and changelog text records directly in faithful text formats. It owns no directory tree or binary collection that would benefit from an archive, so offering encryption and compression controls would manufacture a lossy container around tiny text.",
    },
    {
        id: "http-postman",
        title: "HTTP API Postman collection",
        status: "not-applicable",
        reason: "The published site is static and exposes no application HTTP API. Build-time release and screenshot fetches are CI implementation details, not a visitor API, so no Postman collection is invented.",
    },
    {
        id: "automatic-updater",
        title: "Installed-application automatic updates",
        status: "not-applicable",
        reason: "A static Pages deployment updates atomically when its files are deployed and has no installed binary to stage or restart. The website links a verified installer; update-feed, restart, rollback, and unsigned-artifact warnings belong to that installed application.",
    },
    {
        id: "spoken-narrator",
        title: "Optional spoken event narrator",
        status: "optional-not-enabled",
        reason: "The shared narrator requirement is explicitly optional. This site does not start speech, preserving quiet browser behaviour and assistive-technology ownership; every event remains exposed as text and through appropriate live regions.",
    },
];
