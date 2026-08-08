<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAccountGroupOutline,
    mdiBellOutline,
    mdiCameraOutline,
    mdiChevronDown,
    mdiChevronRight,
    mdiCloudSyncOutline,
    mdiCloudUploadOutline,
    mdiCogOutline,
    mdiCompassOutline,
    mdiConsoleLine,
    mdiFileCogOutline,
    mdiFileDocumentOutline,
    mdiFolderMultipleOutline,
    mdiFormatSize,
    mdiGavel,
    mdiGithub,
    mdiHelpCircleOutline,
    mdiHistory,
    mdiLayersOutline,
    mdiMapMarkerOutline,
    mdiMapOutline,
    mdiMapPlus,
    mdiPalette,
    mdiProgressClock,
    mdiServerNetwork,
    mdiTabSearch,
    mdiUnfoldLessHorizontal,
    mdiUnfoldMoreHorizontal,
    mdiWeb,
} from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VIcon } from "vuetify/components";
import type { MarkerSetData } from "@worldlens/viewer";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { sectionCopy, type SettingsSectionAnchor } from "../settings/index.js";
import type { PaletteConfigTarget } from "../palette/index.js";
import { requestReveal } from "../shell/revealRequests.js";
import { requestTutorialLaunch } from "../tutorial/index.js";
import { useSetupI18n } from "../setup/setupI18n.js";
import { isLocalProfile, profilesStore } from "../../stores/profiles.js";
import { blueMapApp } from "../../stores/bluemap.js";
import { filterCapabilities, groupCapabilities, homeSampleText, type HomeCapability } from "./homeCatalog.js";
import {
    homeExpandedSections,
    homeIntroCollapsed,
    setHomeIntroCollapsed,
    setHomeSectionExpanded,
} from "./homeState.js";

/**
 * The landing tab: every capability this app has, weighted so a newcomer sees the one thing
 * to do first and a returning user sees what they were doing last.
 *
 * ## Weight first, then disclosure
 *
 * The first version of this page named all twenty-five capabilities and then drew all
 * twenty-five at once, in one grid of identically weighted cards. That answers "what can
 * this do" and not "what do I do now", which is the question somebody meeting this
 * application actually arrives with. Nothing has been taken away since: the same cards, in
 * the same five sections, with the same actions. What changed is the weighting.
 *
 *  - the one `primary` capability is a full-width hero on `primary-container`, carrying the
 *    page's only large button, above everything except a returning user's "Continue" row;
 *  - the five secondary sections are collapsed disclosures whose headings state what they
 *    hold and how many ("Share and back up (2)"), so a folded section is honest about what
 *    it took with it rather than quietly smaller;
 *  - each section's open/closed state is the user's, remembered for good in `homeState.ts`;
 *  - and the search reads {@link capabilities} directly rather than what is drawn, so a card
 *    inside a collapsed section is still one query away. That is the whole difference
 *    between disclosure and removal, and `HomeScreen.test.ts` asserts it rather than
 *    assuming it.
 *
 * ## Why this reads a pile of shared stores directly
 *
 * `CommandPalette` takes a `PaletteShellActions` object because it is mounted with no
 * element of its own to anchor to and must be able to run even where the shell wired only
 * some of its actions. Home has neither constraint: it is a tab, permanently mounted beside
 * every other page, so there is nothing gained by re-deriving an actions interface the shell
 * would have to fill in exactly the same way it already does for `CommandPalette`. What
 * cannot be reached this way - `revealPage`, the Settings sheet, the options editor, the
 * standalone EULA and "what is this" panels - is shell-local state this component has no
 * business owning, and those five stay emits, in the same shape `WorldScreen.vue` and
 * `ProjectsScreen.vue` already use for exactly the same reason.
 *
 * ## Where the capability list comes from
 *
 * Descriptions are pulled from the same catalogue `CommandPalette` already voices -
 * `palette.page.world`, `palette.shell.settings` and so on - rather than re-written here.
 * Two surfaces describing the same destination in two different sentences is how they drift
 * out of agreement about what a button does; reusing the key means Home and the palette say
 * the same thing about "Make a map" for as long as this file exists, with zero new copy to
 * maintain for the dozen tiles that map straight onto an existing page or shell surface.
 * Only the handful of things unique to Home - its own lede, its own search chrome, and the
 * one disabled-state sentence Backups and Publish to Pages share - get new catalogue entries,
 * in `copy/surfaces/home.ts`.
 */

const emit = defineEmits<{
    "reveal-page": [pageId: string];
    "open-settings": [anchor: SettingsSectionAnchor | null];
    "open-config": [screen: PaletteConfigTarget];
    "open-eula": [];
    "open-welcome": [];
    "open-palette": [];
}>();

const { t } = useI18n();
const setupI18n = useSetupI18n();

/* -------------------------------------------------------------------------- */
/* The introduction: shown once, foldable forever after                       */
/* -------------------------------------------------------------------------- */

const introCollapsed = ref(homeIntroCollapsed());

function toggleIntro(): void {
    introCollapsed.value = !introCollapsed.value;
    setHomeIntroCollapsed(introCollapsed.value);
}

/* -------------------------------------------------------------------------- */
/* Continuing: only for a returning user who has something to continue        */
/* -------------------------------------------------------------------------- */

/**
 * Every profile except the seeded demo server, which is offered rather than something the
 * user made - see `stores/profiles.ts`'s own comment on why it exists but is never active by
 * default. A fresh install therefore has none of these, which is exactly the signal that
 * decides whether this whole section renders at all.
 */
const continueProfiles = computed(() => profilesStore.profiles.filter((profile) => profile.id !== "demo"));
const hasContinue = computed(() => continueProfiles.value.length > 0);

function continueWith(profileId: string): void {
    profilesStore.activeId = profileId;
    // The shell's own watcher on `profilesStore.activeId` reveals the map tab on a change,
    // but re-choosing the map that is already active is not a change - so this is asked for
    // directly too, which is a harmless duplicate reveal on the cases where it was already
    // going to happen anyway.
    emit("reveal-page", "map");
}

/** At least one map has actually been rendered on this computer, not merely connected to. */
const hasRenderedMap = computed(() => profilesStore.profiles.some((profile) => isLocalProfile(profile)));

/* -------------------------------------------------------------------------- */
/* The viewer's own menu, offered only while a map is actually open            */
/* -------------------------------------------------------------------------- */

/**
 * Upstream's `hasMarkers`, recursive and skipping the two synthetic sets, mirrored from
 * `palette/paletteCatalog.ts` rather than imported from it: that file is being edited by a
 * sibling workflow at the same time as this one, and the two copies are five lines each with
 * one obvious right answer - keeping this file free of a shared-file edit was worth five
 * duplicated lines.
 */
function hasMarkers(markerSet: MarkerSetData): boolean {
    if (markerSet.markers.length > 0) return true;
    for (const set of markerSet.markerSets) {
        if (set.id !== "bm-players" && set.id !== "bm-popup-set" && hasMarkers(set)) return true;
    }
    return false;
}

const app = computed(() => blueMapApp.value);
const markerRoot = computed(() => app.value?.mapViewer.markers.data ?? null);
const showsMarkers = computed(() => markerRoot.value !== null && hasMarkers(markerRoot.value));
const players = computed(() => markerRoot.value?.markerSets.find((set) => set.id === "bm-players") ?? null);

/* -------------------------------------------------------------------------- */
/* The capability list itself                                                 */
/* -------------------------------------------------------------------------- */

function tile(input: {
    id: string;
    group: string;
    title: string;
    description: string;
    icon: string;
    keywords?: readonly string[];
    disabledReason?: string | null;
    actionLabel?: string | null;
    remedyLabel?: string | null;
    remedyAction?: (() => void) | null;
    primary?: boolean;
    action: () => void;
}): HomeCapability {
    return {
        id: input.id,
        group: input.group,
        title: input.title,
        description: input.description,
        icon: input.icon,
        keywords: input.keywords ?? [],
        disabledReason: input.disabledReason ?? null,
        actionLabel: input.actionLabel ?? t("home.tile.open", "Open"),
        remedyLabel: input.remedyLabel ?? null,
        remedyAction: input.remedyAction ?? null,
        primary: input.primary ?? false,
        action: input.action,
    };
}

const capabilities = computed<HomeCapability[]>(() => {
    const sections = sectionCopy(t);
    const github = sections["github-account"];
    const appearance = {
        title: t("palette.appearance.editorsTitle", "Customise one element's appearance"),
        description: t(
            "palette.appearance.editorsDescription",
            "Font, size, weight, colour, highlight, spacing, borders and shape, per element, with the infinite colour picker and its translator.",
        ),
    };

    const items: HomeCapability[] = [
        /* ---------------------------------------------------------------- */
        /* Get started: the newcomer's one obvious next step, plus context   */
        /* ---------------------------------------------------------------- */
        tile({
            id: "world",
            group: t("home.section.getStarted", "Get started"),
            title: t("tabs.page.world", "Make a map"),
            description: t(
                "palette.page.world",
                "The guide that turns a world folder into a rendered map: pick the folder, answer five questions, watch the render run.",
            ),
            icon: mdiMapPlus,
            keywords: ["render", "wizard", "guide", "world folder"],
            actionLabel: t("tabs.page.world", "Make a map"),
            primary: true,
            action: () => emit("reveal-page", "world"),
            remedyAction: null,
        }),
        tile({
            id: "what-is-bluemap",
            group: t("home.section.getStarted", "Get started"),
            title: setupI18n.t("welcome.viewerTitle"),
            description: setupI18n.t("welcome.what"),
            icon: mdiHelpCircleOutline,
            keywords: ["about", "explanation", "new here", "getting started"],
            action: () => emit("open-welcome"),
            remedyAction: null,
        }),
        tile({
            id: "tour",
            group: t("home.section.getStarted", "Get started"),
            title: t("tutorial.launch.start", "Take the tour"),
            description: t(
                "palette.chrome.tutorial",
                "A short guided walkthrough of finding a world, rendering it, and opening the result, with the real controls highlighted as it goes.",
            ),
            icon: mdiCompassOutline,
            keywords: ["tutorial", "walkthrough", "onboarding", "how to"],
            action: () => requestTutorialLaunch(),
            remedyAction: null,
        }),

        /* ---------------------------------------------------------------- */
        /* Make and manage maps                                             */
        /* ---------------------------------------------------------------- */
        tile({
            id: "map",
            group: t("home.section.makeAndManage", "Make and manage maps"),
            title: t("tabs.page.map", "Map"),
            description: t(
                "palette.page.map",
                "The rendered map itself, with the viewer's own menu, markers and camera.",
            ),
            icon: mdiMapOutline,
            keywords: ["viewer", "3d", "canvas"],
            action: () => emit("reveal-page", "map"),
            remedyAction: null,
        }),
        tile({
            id: "projects",
            group: t("home.section.makeAndManage", "Make and manage maps"),
            title: t("tabs.page.projects", "Projects"),
            description: t(
                "palette.page.projects",
                "Every saved render project, and every setting one can carry beyond the five the guide asks about.",
            ),
            icon: mdiFolderMultipleOutline,
            keywords: ["saved", "editor", "storages"],
            action: () => emit("reveal-page", "projects"),
            remedyAction: null,
        }),
        tile({
            id: "servers",
            group: t("home.section.makeAndManage", "Make and manage maps"),
            title: t("tabs.page.servers", "Maps and servers"),
            description: t(
                "palette.page.servers",
                "The list of servers and rendered maps this app can open, and where a new one is added.",
            ),
            icon: mdiServerNetwork,
            keywords: ["profile", "connection", "remote", "add server"],
            action: () => emit("reveal-page", "servers"),
            remedyAction: null,
        }),
        tile({
            id: "cirender",
            group: t("home.section.makeAndManage", "Make and manage maps"),
            title: t("tabs.page.ciRender", "GitHub runners"),
            description: t(
                "palette.page.ciRender",
                "Rendering on GitHub's machines instead of this one: a repository, the consents, the upload, and the run watched job by job.",
            ),
            icon: mdiCloudSyncOutline,
            keywords: ["github", "actions", "ci", "cloud", "remote render"],
            action: () => emit("reveal-page", "cirender"),
            remedyAction: null,
        }),
        tile({
            id: "renders",
            group: t("home.section.makeAndManage", "Make and manage maps"),
            title: t("tabs.page.renders", "Renders"),
            description: t(
                "rendersInProgress.homeTile",
                "Every render going on right now, on this computer, in a container or on GitHub's runners - including one this app did not start this session.",
            ),
            icon: mdiProgressClock,
            keywords: ["in progress", "running", "container", "docker", "reattach", "github runners", "cancel"],
            action: () => emit("reveal-page", "renders"),
            remedyAction: null,
        }),

        /* ---------------------------------------------------------------- */
        /* Share and back up: honest about needing a rendered map first      */
        /* ---------------------------------------------------------------- */
        tile({
            id: "backups",
            group: t("home.section.share", "Share and back up"),
            title: t("tabs.page.backups", "Backups"),
            description: t(
                "palette.page.backups",
                "Backing a world or a rendered map up to GitHub release assets, and restoring one that is already there.",
            ),
            icon: mdiCloudUploadOutline,
            keywords: ["backup", "restore", "archive", "release asset"],
            disabledReason: hasRenderedMap.value
                ? null
                : t(
                      "home.tile.needsRenderedMap",
                      "This needs a map rendered on this computer. Render one, then come back.",
                  ),
            remedyLabel: hasRenderedMap.value ? null : t("tabs.page.world", "Make a map"),
            remedyAction: hasRenderedMap.value ? null : () => emit("reveal-page", "world"),
            action: () => emit("reveal-page", "backups"),
        }),
        tile({
            id: "pages",
            group: t("home.section.share", "Share and back up"),
            title: t("tabs.page.pages", "Publish to Pages"),
            description: t(
                "palette.page.pages",
                "Publishing a rendered map as a website on GitHub Pages, and what the published site currently holds.",
            ),
            icon: mdiWeb,
            keywords: ["publish", "github pages", "website", "host", "share"],
            disabledReason: hasRenderedMap.value
                ? null
                : t(
                      "home.tile.needsRenderedMap",
                      "This needs a map rendered on this computer. Render one, then come back.",
                  ),
            remedyLabel: hasRenderedMap.value ? null : t("tabs.page.world", "Make a map"),
            remedyAction: hasRenderedMap.value ? null : () => emit("reveal-page", "world"),
            action: () => emit("reveal-page", "pages"),
        }),

        /* ---------------------------------------------------------------- */
        /* Learn                                                             */
        /* ---------------------------------------------------------------- */
        tile({
            id: "docs",
            group: t("home.section.learn", "Learn"),
            title: t("tabs.page.docs", "Docs"),
            description: t(
                "docsViewer.lede",
                "Every article this project documents, bundled into this build so it can be read with no network at all.",
            ),
            icon: mdiFileDocumentOutline,
            keywords: ["documentation", "articles", "help", "guide"],
            action: () => emit("reveal-page", "docs"),
            remedyAction: null,
        }),
        tile({
            id: "eula",
            group: t("home.section.learn", "Learn"),
            title: setupI18n.t("eula.viewerTitle"),
            description: t(
                "home.tile.eula.description",
                "Mojang's end-user licence agreement, readable in full inside the app.",
            ),
            icon: mdiGavel,
            keywords: ["licence", "license", "eula", "mojang", "legal"],
            action: () => emit("open-eula"),
            remedyAction: null,
        }),
    ];

    if (app.value !== null) {
        items.push(
            tile({
                id: "changelog",
                group: t("home.section.learn", "Learn"),
                title: t("changelog.title", "Changelog"),
                description: t(
                    "palette.chrome.changelog",
                    "Every released version and what changed in it, with a date filter and a search, each entry linked to the commit that made it.",
                ),
                icon: mdiHistory,
                keywords: ["release notes", "version", "what's new"],
                action: () => {
                    app.value?.appState.menu.openPage("info", () => t("info.title", "Info"));
                    requestReveal("changelog");
                },
                remedyAction: null,
            }),
        );
    }

    items.push(
        /* ---------------------------------------------------------------- */
        /* Settings and tools                                               */
        /* ---------------------------------------------------------------- */
        tile({
            id: "settings",
            group: t("home.section.settings", "Settings and tools"),
            title: t("settings.title", "Settings"),
            description: t(
                "palette.shell.settings",
                "The app's own settings: download consent, the Java runtime, where maps are written, and the GitHub account.",
            ),
            icon: mdiCogOutline,
            keywords: ["preferences", "options"],
            action: () => emit("open-settings", null),
            remedyAction: null,
        }),
        // Straight after Settings itself, because it is the tile for the person least
        // equipped to go looking: bigger text and buttons, and a theme that does not
        // need a map to be open. Same reuse rule as the GitHub tile below - the words
        // are the settings section's own, so the tile and the tab it opens agree.
        tile({
            id: "display",
            group: t("home.section.settings", "Settings and tools"),
            title: sections.display.title,
            description: sections.display.description,
            icon: mdiFormatSize,
            keywords: ["bigger", "larger", "text size", "zoom", "theme", "dark", "light", "contrast", "accessibility"],
            action: () => emit("open-settings", "display"),
            remedyAction: null,
        }),
        tile({
            id: "github-account",
            group: t("home.section.settings", "Settings and tools"),
            title: github.title,
            description: github.description,
            icon: mdiGithub,
            keywords: ["sign in", "account", "token"],
            action: () => emit("open-settings", "github-account"),
            remedyAction: null,
        }),
        tile({
            id: "config",
            group: t("home.section.settings", "Settings and tools"),
            title: t("config.title", "Server configuration"),
            description: t(
                "palette.shell.config",
                "The options editor: every setting BlueMap itself reads, plus the flags a run is started with.",
            ),
            icon: mdiFileCogOutline,
            keywords: ["bluemap", "conf", "options editor"],
            action: () => emit("open-config", null),
            remedyAction: null,
        }),
        tile({
            id: "config-history",
            group: t("home.section.settings", "Settings and tools"),
            title: t("palette.config.historyTitle", "Config folder history"),
            description: t(
                "palette.config.historyDescription",
                "Every saved version of the open config folder, kept on this computer: browse them, see what each one changed, and put one back.",
            ),
            icon: mdiHistory,
            keywords: ["versions", "revisions", "restore", "undo"],
            action: () => emit("open-config", "history"),
            remedyAction: null,
        }),
        tile({
            id: "appearance",
            group: t("home.section.settings", "Settings and tools"),
            title: appearance.title,
            description: appearance.description,
            icon: mdiPalette,
            keywords: ["font", "colour", "color", "theme", "typography"],
            action: () => emit("open-settings", null),
            remedyAction: null,
        }),
        tile({
            id: "palette",
            group: t("home.section.settings", "Settings and tools"),
            title: t("home.tile.palette.title", "Command palette"),
            description: t(
                "home.tile.palette.description",
                "Every command, setting and destination this app has, found by typing its name. Opens with Ctrl+Shift+F.",
            ),
            icon: mdiConsoleLine,
            keywords: ["search everything", "ctrl+shift+f", "shortcut", "commands"],
            action: () => emit("open-palette"),
            remedyAction: null,
        }),
        tile({
            id: "notice-centre",
            group: t("home.section.settings", "Settings and tools"),
            title: t("notices.centre.title", "Notification centre"),
            description: t(
                "palette.chrome.noticeCentre",
                "Every message this app has raised, searchable and filterable by level, including the ones that dismissed themselves before you read them.",
            ),
            icon: mdiBellOutline,
            keywords: ["notification", "notice", "history", "toast", "bell"],
            action: () => requestReveal("noticeCentre"),
            remedyAction: null,
        }),
        tile({
            id: "tab-finder",
            group: t("home.section.settings", "Settings and tools"),
            title: t("tabs.finder.title", "Find a tab"),
            description: t(
                "palette.chrome.tabFinder",
                "The tab strip's own search: every open tab and every group, with the bulk-close actions and their regex builders.",
            ),
            icon: mdiTabSearch,
            keywords: ["tab", "group", "search tabs", "close tabs"],
            action: () => requestReveal("tabFinder"),
            remedyAction: null,
        }),
    );

    if (app.value !== null) {
        const live = app.value;
        items.push(
            tile({
                id: "menu-maps",
                group: t("home.section.viewer", "The open map"),
                title: t("maps.title", "Maps"),
                description: t(
                    "palette.menu.maps",
                    "Every map this server publishes, and which one is on screen.",
                ),
                icon: mdiLayersOutline,
                keywords: ["dimension", "nether", "end", "switch map"],
                action: () => live.appState.menu.openPage("maps", () => t("maps.title", "Maps")),
                remedyAction: null,
            }),
            tile({
                id: "menu-settings",
                group: t("home.section.viewer", "The open map"),
                title: t("settings.title", "Settings"),
                description: t(
                    "palette.menu.settings",
                    "The viewer's settings page, which is also where resetting every saved setting lives behind its confirmation.",
                ),
                icon: mdiCogOutline,
                keywords: ["viewer settings", "reset all settings"],
                action: () => live.appState.menu.openPage("settings", () => t("settings.title", "Settings")),
                remedyAction: null,
            }),
            tile({
                id: "menu-info",
                group: t("home.section.viewer", "The open map"),
                title: t("info.title", "Info"),
                description: t(
                    "palette.menu.info",
                    "What the controls do, and what this build of BlueMap is.",
                ),
                icon: mdiHelpCircleOutline,
                keywords: ["about", "version", "controls", "keys"],
                action: () => live.appState.menu.openPage("info", () => t("info.title", "Info")),
                remedyAction: null,
            }),
            tile({
                id: "reset-camera",
                group: t("home.section.viewer", "The open map"),
                title: t("resetCamera.tooltip", "Reset Camera & Position"),
                description: t(
                    "palette.shell.resetCamera",
                    "Puts the camera back where the map opens, facing north, at the default distance.",
                ),
                icon: mdiCameraOutline,
                keywords: ["camera", "position", "north"],
                action: () => live.resetCamera(),
                remedyAction: null,
            }),
        );

        const root = markerRoot.value;
        if (root !== null && showsMarkers.value) {
            items.push(
                tile({
                    id: "menu-markers",
                    group: t("home.section.viewer", "The open map"),
                    title: t("markers.title", "Markers"),
                    description: t(
                        "palette.menu.markers",
                        "Every marker set on this map, and the markers inside them.",
                    ),
                    icon: mdiMapMarkerOutline,
                    keywords: ["poi", "label", "point of interest"],
                    action: () =>
                        live.appState.menu.openPage("markers", () => t("markers.title", "Markers"), {
                            markerSet: root,
                        }),
                    remedyAction: null,
                }),
            );
        }
        if (players.value !== null) {
            const playerSet = players.value;
            items.push(
                tile({
                    id: "menu-players",
                    group: t("home.section.viewer", "The open map"),
                    title: t("players.title", "Players"),
                    description: t("palette.menu.players", "Who is online right now, and where they are standing."),
                    icon: mdiAccountGroupOutline,
                    keywords: ["online", "who"],
                    action: () =>
                        live.appState.menu.openPage("markers", () => t("players.title", "Players"), {
                            markerSet: playerSet,
                        }),
                    remedyAction: null,
                }),
            );
        }
    }

    return items;
});

/* -------------------------------------------------------------------------- */
/* The one obvious next step, given real weight rather than a slot in a grid   */
/* -------------------------------------------------------------------------- */

/**
 * The single `primary` capability - "Make a map". Rendered as a full-width hero above
 * everything else rather than as one tile among two dozen equals, because a grid of equally
 * sized cards is a grid with no answer in it to "where do I start", which is the exact
 * complaint this page exists to fix. There is deliberately only one: a page with two primary
 * actions has none.
 */
const heroCapability = computed(() => capabilities.value.find((item) => item.primary) ?? null);

/** The rest of "Get started" - the explanation panel and the tour - beneath the hero. */
const gettingStartedItems = computed(() =>
    capabilities.value.filter(
        (item) => item.group === t("home.section.getStarted", "Get started") && !item.primary,
    ),
);

/* -------------------------------------------------------------------------- */
/* Everything else: the same sections, the same cards, disclosed on request    */
/* -------------------------------------------------------------------------- */

/**
 * The five secondary sections, in the order they are read, each with a stable ASCII id.
 *
 * The id is what a person's open/closed choice is remembered under, and it is deliberately
 * not the heading: a heading is translated and moves with the funny level, so a preference
 * keyed by it would be silently forgotten the first time somebody switched language. The
 * headings themselves stay literal `t()` calls so `catalogueCoverage.test.ts`'s scanner can
 * still see every key this file renders.
 */
const sectionDefinitions = computed(() => [
    { id: "make-and-manage", heading: t("home.section.makeAndManage", "Make and manage maps") },
    { id: "share", heading: t("home.section.share", "Share and back up") },
    { id: "learn", heading: t("home.section.learn", "Learn") },
    { id: "settings", heading: t("home.section.settings", "Settings and tools") },
    { id: "viewer", heading: t("home.section.viewer", "The open map") },
]);

const disclosureSections = computed(() =>
    groupCapabilities(capabilities.value, sectionDefinitions.value),
);

/**
 * Which sections are open. Seeded from storage at mount and written back on every toggle,
 * so the choice survives a restart; nothing is defaulted open, which is what makes a
 * newcomer's first view short. Held as a `Set` in a `ref` rather than a reactive `Set`
 * because every write replaces it wholesale, which is the cheapest thing to make reactive.
 */
const expandedSections = ref<ReadonlySet<string>>(new Set(homeExpandedSections()));

function sectionExpanded(id: string): boolean {
    return expandedSections.value.has(id);
}

function toggleSection(id: string): void {
    const next = new Set(expandedSections.value);
    const expanded = !next.has(id);
    if (expanded) next.add(id);
    else next.delete(id);
    expandedSections.value = next;
    setHomeSectionExpanded(id, expanded);
}

/** True only when every section on screen this launch is open. */
const allSectionsExpanded = computed(
    () =>
        disclosureSections.value.length > 0 &&
        disclosureSections.value.every((section) => expandedSections.value.has(section.id)),
);

/** One control for "show me everything", so nobody has to press five headings in turn. */
function toggleAllSections(): void {
    const expand = !allSectionsExpanded.value;
    const next = new Set(expandedSections.value);
    for (const section of disclosureSections.value) {
        if (expand) next.add(section.id);
        else next.delete(section.id);
        setHomeSectionExpanded(section.id, expand);
    }
    expandedSections.value = next;
}

/** The panel a section's own disclosure button controls, named for `aria-controls`. */
function sectionPanelId(id: string): string {
    return `mb-home-panel-${id}`;
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regex = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));
const sample = computed(() => homeSampleText(capabilities.value));
const searchResults = computed(() =>
    matcher.value.active ? filterCapabilities(capabilities.value, matcher.value) : [],
);

function clearSearch(): void {
    query.value = "";
}

</script>

<template>
    <section class="mb-home" aria-labelledby="mb-home-title">
        <AppearanceTarget id="home.page" :label="t('home.title', 'Home')" as="div">
            <div class="mb-home__inner">
                <header class="mb-home__header">
                    <h2 id="mb-home-title" class="mb-home__title">{{ t("home.title", "Home") }}</h2>

                    <AppearanceTarget
                        id="home.intro"
                        :label="t('home.title', 'Home') + ' - introduction'"
                        as="div"
                    >
                        <div class="mb-home__intro">
                            <p v-if="!introCollapsed" class="mb-home__lede">
                                {{
                                    t(
                                        "home.lede",
                                        "BlueMap turns a Minecraft world into a browsable 3D map you open in a web browser.",
                                    )
                                }}
                            </p>
                            <div class="mb-home__intro-actions">
                                <VBtn
                                    v-if="!introCollapsed"
                                    class="mb-interactive"
                                    variant="text"
                                    size="small"
                                    :prepend-icon="mdiHelpCircleOutline"
                                    @click="emit('open-welcome')"
                                >
                                    {{ setupI18n.t("welcome.viewerTitle") }}
                                </VBtn>
                                <VBtn
                                    class="mb-interactive"
                                    variant="text"
                                    size="small"
                                    @click="toggleIntro"
                                >
                                    {{
                                        introCollapsed
                                            ? t("home.intro.show", "Show the explanation")
                                            : t("home.intro.hide", "Hide the explanation")
                                    }}
                                </VBtn>
                            </div>
                        </div>
                    </AppearanceTarget>
                </header>

                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regex"
                    v-model:flags="flags"
                    :label="t('home.search.label', 'Search everything Home can do')"
                    :placeholder="t('home.search.placeholder', 'A feature, a setting, a page name')"
                    :sample="sample"
                />

                <p v-if="matcher.active" class="mb-home__count" aria-live="polite">
                    {{
                        t(
                            "home.search.showing",
                            { shown: searchResults.length, total: capabilities.length },
                            "Showing {shown} of {total} things Home can do.",
                        )
                    }}
                </p>

                <!-- Searching: one flat, honest result list, exactly as the docs browser does it. -->
                <template v-if="matcher.active">
                    <p v-if="searchResults.length === 0" class="mb-home__empty-line">
                        {{
                            t(
                                "home.search.noMatches",
                                {
                                    filters: regex
                                        ? t("changelog.filterRegex", { pattern: query }, "the pattern {pattern}")
                                        : t("changelog.filterText", { text: query }, "the text {text}"),
                                },
                                "Nothing on Home matches. {filters} Clear the search to see the rest.",
                            )
                        }}
                        <VBtn class="mb-interactive" variant="tonal" size="small" @click="clearSearch">
                            {{ t("home.search.clear", "Clear the search") }}
                        </VBtn>
                    </p>
                    <div v-else class="mb-home__grid" role="list">
                        <VCard
                            v-for="item in searchResults"
                            :key="item.id"
                            class="mb-home__card mb-interactive"
                            variant="flat"
                            role="listitem"
                            :data-capability="item.id"
                        >
                            <VCardText>
                                <div class="mb-home__card-head">
                                    <VIcon :icon="item.icon" size="20" aria-hidden="true" />
                                    <h3 class="mb-home__card-title">{{ item.title }}</h3>
                                </div>
                                <p class="mb-home__card-desc">{{ item.description }}</p>
                                <p v-if="item.disabledReason" class="mb-home__card-blocked" role="note">
                                    {{ item.disabledReason }}
                                </p>
                                <div class="mb-home__card-actions">
                                    <VBtn
                                        v-if="!item.disabledReason"
                                        class="mb-interactive"
                                        variant="tonal"
                                        size="small"
                                        :aria-label="t('home.tile.openNamed', { title: item.title }, 'Open {title}')"
                                        @click="item.action()"
                                    >
                                        {{ item.actionLabel }}
                                    </VBtn>
                                    <VBtn
                                        v-if="item.remedyAction"
                                        class="mb-interactive"
                                        variant="tonal"
                                        size="small"
                                        @click="item.remedyAction()"
                                    >
                                        {{ item.remedyLabel }}
                                    </VBtn>
                                </div>
                            </VCardText>
                        </VCard>
                    </div>
                </template>

                <!-- Not searching: the guided layout. -->
                <template v-else>
                    <section v-if="hasContinue" class="mb-home__section" aria-labelledby="mb-home-continue">
                        <AppearanceTarget id="home.continue" :label="t('home.section.continue', 'Continue')" as="div">
                            <div>
                                <h3 id="mb-home-continue" class="mb-home__section-title">
                                    {{ t("home.section.continue", "Continue") }}
                                </h3>
                                <div class="mb-home__continue-row">
                                    <VBtn
                                        v-for="profile in continueProfiles"
                                        :key="profile.id"
                                        class="mb-interactive"
                                        variant="tonal"
                                        :prepend-icon="mdiMapOutline"
                                        @click="continueWith(profile.id)"
                                    >
                                        {{ t("home.continue.open", { name: profile.name }, "Open {name}") }}
                                    </VBtn>
                                </div>
                            </div>
                        </AppearanceTarget>
                    </section>

                    <section class="mb-home__section" aria-labelledby="mb-home-started">
                        <h3 id="mb-home-started" class="mb-home__section-title">
                            {{ t("home.section.getStarted", "Get started") }}
                        </h3>

                        <!--
                            The hero. One capability, full width, on primary-container, with the
                            page's only large button: the answer to "where do I start" has to be
                            the biggest thing on the page or it is not an answer. It is never a
                            disabled card - "Make a map" is the remedy every gated capability
                            below points at, so there is nothing for it to be waiting on.
                        -->
                        <article
                            v-if="heroCapability"
                            class="mb-home__hero"
                            :data-capability="heroCapability.id"
                            data-hero="true"
                        >
                            <p class="mb-home__hero-eyebrow">{{ setupI18n.t("action.startHere") }}</p>
                            <div class="mb-home__hero-body">
                                <VIcon
                                    :icon="heroCapability.icon"
                                    size="32"
                                    aria-hidden="true"
                                    class="mb-home__hero-icon"
                                />
                                <div class="mb-home__hero-words">
                                    <h4 class="mb-home__hero-title">{{ heroCapability.title }}</h4>
                                    <p class="mb-home__hero-desc">{{ heroCapability.description }}</p>
                                </div>
                            </div>
                            <div class="mb-home__hero-actions">
                                <VBtn
                                    class="mb-interactive"
                                    variant="flat"
                                    color="primary"
                                    size="large"
                                    :aria-label="
                                        t(
                                            'home.tile.openNamed',
                                            { title: heroCapability.title },
                                            'Open {title}',
                                        )
                                    "
                                    @click="heroCapability.action()"
                                >
                                    {{ heroCapability.actionLabel }}
                                </VBtn>
                            </div>
                        </article>

                        <div class="mb-home__grid mb-home__grid--support" role="list">
                            <VCard
                                v-for="item in gettingStartedItems"
                                :key="item.id"
                                class="mb-home__card mb-home__card--support mb-interactive"
                                variant="flat"
                                role="listitem"
                                :data-capability="item.id"
                            >
                                <VCardText>
                                    <div class="mb-home__card-head">
                                        <VIcon :icon="item.icon" size="20" aria-hidden="true" />
                                        <h4 class="mb-home__card-title">{{ item.title }}</h4>
                                    </div>
                                    <p class="mb-home__card-desc">{{ item.description }}</p>
                                    <div class="mb-home__card-actions">
                                        <VBtn
                                            class="mb-interactive"
                                            variant="tonal"
                                            size="small"
                                            :aria-label="t('home.tile.openNamed', { title: item.title }, 'Open {title}')"
                                            @click="item.action()"
                                        >
                                            {{ item.actionLabel }}
                                        </VBtn>
                                    </div>
                                </VCardText>
                            </VCard>
                        </div>
                    </section>

                    <AppearanceTarget
                        id="home.capabilities"
                        :label="t('home.title', 'Home') + ' - capabilities'"
                        as="div"
                    >
                        <section class="mb-home__section" aria-labelledby="mb-home-more">
                            <div class="mb-home__more-head">
                                <h3 id="mb-home-more" class="mb-home__section-title">
                                    {{ t("home.section.everythingElse", "Everything else") }}
                                </h3>
                                <VBtn
                                    class="mb-interactive"
                                    variant="text"
                                    size="small"
                                    :prepend-icon="
                                        allSectionsExpanded ? mdiUnfoldLessHorizontal : mdiUnfoldMoreHorizontal
                                    "
                                    @click="toggleAllSections"
                                >
                                    {{
                                        allSectionsExpanded
                                            ? t("home.sections.hideAll", "Hide every section")
                                            : t("home.sections.showAll", "Show every section")
                                    }}
                                </VBtn>
                            </div>

                            <div class="mb-home__sections">
                                <!--
                                    One disclosure per section. The heading is a real heading with
                                    a real button inside it, so a screen reader reads the level and
                                    the state together, and the count is part of the visible label
                                    rather than a tooltip: a closed section says what it holds and
                                    how much of it, so nothing here is hidden without being named.
                                -->
                                <section
                                    v-for="section in disclosureSections"
                                    :key="section.id"
                                    class="mb-home__disclosure"
                                    :data-section="section.id"
                                >
                                    <h4 class="mb-home__disclosure-heading">
                                        <button
                                            type="button"
                                            class="mb-home__disclosure-button mb-interactive"
                                            :aria-expanded="sectionExpanded(section.id) ? 'true' : 'false'"
                                            :aria-controls="sectionPanelId(section.id)"
                                            @click="toggleSection(section.id)"
                                        >
                                            <VIcon
                                                :icon="sectionExpanded(section.id) ? mdiChevronDown : mdiChevronRight"
                                                size="20"
                                                aria-hidden="true"
                                            />
                                            <span class="mb-home__disclosure-label">
                                                {{
                                                    t(
                                                        "home.section.count",
                                                        { title: section.heading, count: section.items.length },
                                                        "{title} ({count})",
                                                    )
                                                }}
                                            </span>
                                        </button>
                                    </h4>

                                    <div
                                        v-show="sectionExpanded(section.id)"
                                        :id="sectionPanelId(section.id)"
                                        class="mb-home__panel"
                                        :class="{ 'mb-home__panel--open': sectionExpanded(section.id) }"
                                    >
                                        <div class="mb-home__grid" role="list">
                                            <VCard
                                                v-for="item in section.items"
                                                :key="item.id"
                                                class="mb-home__card mb-interactive"
                                                variant="flat"
                                                role="listitem"
                                                :data-capability="item.id"
                                            >
                                                <VCardText>
                                                    <div class="mb-home__card-head">
                                                        <VIcon :icon="item.icon" size="20" aria-hidden="true" />
                                                        <h5 class="mb-home__card-title">{{ item.title }}</h5>
                                                    </div>
                                                    <p class="mb-home__card-desc">{{ item.description }}</p>

                                                    <VAlert
                                                        v-if="item.disabledReason"
                                                        type="info"
                                                        variant="tonal"
                                                        density="compact"
                                                        class="mb-home__card-blocked"
                                                    >
                                                        {{ item.disabledReason }}
                                                    </VAlert>

                                                    <div class="mb-home__card-actions">
                                                        <VBtn
                                                            v-if="!item.disabledReason"
                                                            class="mb-interactive"
                                                            variant="tonal"
                                                            size="small"
                                                            :aria-label="
                                                                t(
                                                                    'home.tile.openNamed',
                                                                    { title: item.title },
                                                                    'Open {title}',
                                                                )
                                                            "
                                                            @click="item.action()"
                                                        >
                                                            {{ item.actionLabel }}
                                                        </VBtn>
                                                        <VBtn
                                                            v-if="item.disabledReason"
                                                            class="mb-interactive"
                                                            variant="tonal"
                                                            size="small"
                                                            disabled
                                                            :aria-label="
                                                                t(
                                                                    'home.tile.openNamed',
                                                                    { title: item.title },
                                                                    'Open {title}',
                                                                )
                                                            "
                                                        >
                                                            {{ item.actionLabel }}
                                                        </VBtn>
                                                        <VBtn
                                                            v-if="item.remedyAction"
                                                            class="mb-interactive"
                                                            variant="tonal"
                                                            color="primary"
                                                            size="small"
                                                            @click="item.remedyAction()"
                                                        >
                                                            {{ item.remedyLabel }}
                                                        </VBtn>
                                                    </div>
                                                </VCardText>
                                            </VCard>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </section>
                    </AppearanceTarget>
                </template>
            </div>
        </AppearanceTarget>
    </section>
</template>

<style>
.mb-home {
    padding: 8px 16px 32px;
    max-width: 72rem;
    margin-inline: auto;
}

.mb-home__inner {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.mb-home__title {
    font-size: 1.25rem;
    font-weight: 500;
    margin-block: 4px 4px;
}

.mb-home__intro {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mb-home__lede {
    font-size: 0.9375rem;
    line-height: 1.5;
    max-width: 52rem;
    margin: 0;
    color: rgba(var(--v-theme-on-surface), 0.87);
}

.mb-home__intro-actions {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
}

.mb-home__count {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    margin: 0;
}

.mb-home__empty-line {
    font-size: 0.875rem;
    margin-block-start: 16px;
}

.mb-home__section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-block-start: 8px;
}

.mb-home__section-title {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin: 0;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-home__continue-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-home__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
    gap: 12px;
}

/* The two orientation cards under the hero are supporting acts, not competitors: a
   narrower track, so they read as a row beneath the primary surface rather than as two
   more equals in the same grid. */
.mb-home__grid--support {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
}

/* -------------------------------------------------------------------------- */
/* The hero: the page's one primary surface                                    */
/* -------------------------------------------------------------------------- */

/* Material's own weighting, in tone rather than in a border: primary-container is the one
   filled surface on the page, so "Make a map" is the thing the eye lands on before it has
   read a word. Every colour here is a theme role - the palette lives in `vuetify.ts`, and
   a hard-coded hex would be a second, silently drifting copy of it. */
.mb-home__hero {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    border-radius: 16px;
    background: rgb(var(--v-theme-primary-container));
    color: rgb(var(--v-theme-on-primary-container));
}

.mb-home__hero-eyebrow {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin: 0;
    opacity: 0.8;
}

.mb-home__hero-body {
    display: flex;
    align-items: flex-start;
    gap: 16px;
}

.mb-home__hero-icon {
    margin-block-start: 2px;
    flex: none;
}

.mb-home__hero-words {
    min-width: 0;
}

.mb-home__hero-title {
    font-size: 1.375rem;
    font-weight: 500;
    line-height: 1.3;
    margin: 0;
}

.mb-home__hero-desc {
    font-size: 0.9375rem;
    line-height: 1.5;
    max-width: 46rem;
    margin-block: 6px 0;
}

.mb-home__hero-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

/* -------------------------------------------------------------------------- */
/* Everything else: one disclosure per section                                 */
/* -------------------------------------------------------------------------- */

.mb-home__more-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-home__sections {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-home__disclosure {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

/* A real heading wrapping a real button: the heading carries the level, the button carries
   the state. Neither the font size nor the weight comes from the heading element, so the
   document outline can be corrected without restyling the control. */
.mb-home__disclosure-heading {
    margin: 0;
    font-size: inherit;
    font-weight: inherit;
}

.mb-home__disclosure-button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    border: 0;
    border-radius: 12px;
    background: rgb(var(--v-theme-surface-container));
    color: rgb(var(--v-theme-on-surface));
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    text-align: start;
    cursor: pointer;
}

.mb-home__disclosure-button:hover {
    background: rgb(var(--v-theme-surface-container-high));
}

/* A native button gets none of `global.scss`'s `.v-btn:focus-visible` treatment, so it
   states its own. Focus has to be visible on a control that is the only way into a
   collapsed section. */
.mb-home__disclosure-button:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-home__disclosure-label {
    min-width: 0;
}

/* The reveal was 160ms on the browser's `ease` - a number and a curve that agreed with
   nothing else in the product. Same gesture, said in the system's own vocabulary: the M3
   short step for a disclosure this small, on the curve that means "arriving". Nothing else
   about the animation changes, and `styles/md3.scss` is now the one place either value can
   be retuned from. */
.mb-home__panel--open {
    animation: mb-home-panel-open var(--md-sys-motion-duration-short4)
        var(--md-sys-motion-easing-emphasized-decelerate) both;
}

@keyframes mb-home-panel-open {
    from {
        opacity: 0;
        transform: translateY(-4px);
    }

    to {
        opacity: 1;
        transform: none;
    }
}

/* Somebody who asked their system for less motion gets the section, not the reveal. */
@media (prefers-reduced-motion: reduce) {
    .mb-home__panel--open {
        animation: none;
    }
}

.mb-home__card {
    display: flex;
    flex-direction: column;
}

/* Tonal elevation rather than an outline on all twenty-five cards at once: a page of
   outlined boxes is the wall this layout exists to undo. Two class names' worth of
   specificity, so this wins over Vuetify's own flat-variant background rule. */
.mb-home .mb-home__card {
    background: rgb(var(--v-theme-surface-container-low));
    border-radius: 12px;
}

.mb-home .mb-home__card--support {
    background: rgb(var(--v-theme-surface-container-high));
}

.mb-home__card-head {
    display: flex;
    align-items: center;
    gap: 8px;
}

.mb-home__card-title {
    font-size: 0.9375rem;
    font-weight: 500;
    margin: 0;
}

.mb-home__card-desc {
    font-size: 0.8125rem;
    line-height: 1.5;
    margin-block: 6px 8px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-home__card-blocked {
    font-size: 0.75rem;
    margin-block-end: 8px;
}

.mb-home__card-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: auto;
}
</style>
