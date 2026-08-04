/**
 * Everything the palette lists, assembled from the registries that already exist.
 *
 * The rule this file is built around is that the palette owns no list of its own. Every row
 * is derived from the registry that already describes the thing:
 *
 *  - the app's settings surface publishes `SETTINGS_SECTIONS` and `sectionCopy()`, so its
 *    five sections arrive here with the same titles and explanations they render with, in
 *    the current language, and a sixth section added there appears here on the same commit;
 *  - the options editor publishes `SCREENS`, so its seven tabs arrive with their own labels
 *    and descriptions;
 *  - the running viewer publishes its settings through `BlueMapApp` itself, which is where
 *    `viewerSettings.ts` reads and writes them.
 *
 * A hand-kept copy of any of those would be the list that falls behind, and the failure mode
 * is the one this whole feature exists to prevent: somebody types the name of a setting they
 * are looking at and is told it does not exist.
 *
 * **Teleporting reuses the shell's existing mechanism rather than inventing a second one.**
 * A render that stops for a fixable reason already names the setting that would fix it, the
 * shell already opens the settings surface at that anchor, and that surface already scrolls
 * the row into view, focuses it and outlines it for a moment. A destination row here emits
 * exactly the `SettingsTarget` that flow emits, so `App.vue` can hand it to the same
 * `revealSetting` it already has. There is one reveal path in this application and this adds
 * a second entrance to it, not a second path.
 *
 * **Where a teleport cannot land, the row says something smaller and true.** Two cases:
 * the GitHub section is not one of the four anchors the settings surface accepts, and the
 * options editor has no way to be opened at a chosen tab. Rather than seven rows that all
 * quietly open the same first tab - which is precisely the decorative control this project
 * keeps finding - the editor collapses to a single row carrying all seven tabs' words in its
 * searchable text, until the shell says it can route. `canRouteConfigScreens` is that
 * promise, and it defaults to false, so the honest behaviour is the one you get by default
 * and the richer one has to be switched on deliberately by whoever wired it up.
 *
 * **The shell's pages arrive from the shell, not from a list here.** This catalogue used to
 * know about three surfaces - Settings, the options editor and the server list - while the
 * application had grown a tab strip with seven pages on it. Five of them could not be reached
 * from the palette at all, which is the exact failure the feature exists to prevent: somebody
 * types "backups", the page is right there behind a tab, and the palette says nothing matches.
 * The fix is not a list of seven pages written here, because that list would fall behind the
 * strip the same way the old one did. `pages` is handed down from whoever owns the strip, so a
 * page added to it is in the palette on the same commit, and a page this file has never heard
 * of still gets a row - with a generic explanation rather than none. {@link PAGE_NOTES} adds
 * the sentence where one is known, and is allowed to be incomplete precisely because a missing
 * entry costs a good description rather than a whole destination.
 *
 * **The optional actions are how a shell says what it can do.** Everything after `openProfiles`
 * on {@link PaletteShellActions} is optional, and a row is built only for the ones a shell
 * actually passed. That is not defensive coding: the palette is mounted in tests and could be
 * mounted in a smaller host, and a row that emits into nothing would be the decorative control
 * this project keeps finding. A shell that wires them all gets the whole catalogue; one that
 * wires none gets exactly the rows it can honour.
 */

import type { BlueMapApp } from "@material-bluemap/viewer";
import type { MarkerSetData } from "@material-bluemap/viewer";
import { BUILT_IN_PRESETS, withGlobalReset } from "../appearance/appearanceStore.js";
import { appearanceState, commitAppearance } from "../appearance/useAppearance.js";
import { SCREENS, type ScreenId } from "../config/configSearch.js";
import { sectionCopy } from "../settings/settingsCopy.js";
import {
    SETTINGS_ANCHORS,
    SETTINGS_SECTIONS,
    isSettingsAnchor,
    type SettingsSectionAnchor,
} from "../settings/settingsSections.js";
import type { PaletteChoice, PaletteItem, Translate } from "./paletteItems.js";
import { PALETTE_SIZES, type PaletteSize } from "./palettePrefs.js";
import { viewerSettingItems } from "./viewerSettings.js";

/**
 * The `SettingsTarget` the world bridge already defines, restated structurally.
 *
 * Declared here rather than imported from `world/worldBridge.ts` for the same reason
 * `settingsSections.ts` declares its own anchor type: a command palette that could not be
 * typed without the render-failure flow would be a command palette that cannot be mounted
 * without it. The shape is identical, which is what lets the shell pass an emitted value
 * straight to the handler it already wrote for that flow.
 */
export interface PaletteSettingsTarget {
    readonly surface: "settings";
    readonly anchor: "mojang-download-consent" | "java-runtime" | "map-storage-directory" | "world-folder";
    readonly missing: boolean;
}

/**
 * A tab the options editor can be opened at.
 *
 * `ScreenId` plus History, which is a tab of that editor but deliberately not a `ScreenId`:
 * `SCREENS` drives the settings search index, whose entries are fields, and the History tab
 * has none. The editor's own `activeScreen` is typed exactly this way for the same reason, so
 * this is that type restated rather than a wider one invented here.
 */
export type PaletteConfigTarget = ScreenId | "history" | null;

/** One page of the shell's tab strip, as much of it as the palette needs. */
export interface PalettePageRef {
    readonly id: string;
    /** The label the strip renders, already translated. */
    readonly label: string;
}

/**
 * What the shell has to be able to do for the palette's rows to work.
 *
 * Every one of these is something the shell already does from a button of its own; none of
 * them is new behaviour invented for the palette. A shell that cannot do one of them simply
 * has no such button, and the corresponding row is not built. The first four are required
 * because no shell worth mounting this in lacks them; everything after is optional, and its
 * absence removes rows rather than producing rows that do nothing.
 */
export interface PaletteShellActions {
    /** Open the settings surface at a setting, revealing and outlining it. */
    readonly revealSetting: (target: PaletteSettingsTarget) => void;
    /** Open the settings surface with nothing revealed. */
    readonly openSettings: () => void;
    /** Open the options editor, at a tab when the shell can route to one. */
    readonly openConfig: (screen: PaletteConfigTarget) => void;
    /** Open the server-profile manager. */
    readonly openProfiles: () => void;
    /** Show one of the shell's pages, exactly as clicking its tab would. */
    readonly openPage?: (pageId: string) => void;
    /** Open the notification centre behind the bell in the corner. */
    readonly openNoticeCentre?: () => void;
    /** Open the tab strip's own finder, which searches every tab and group. */
    readonly openTabFinder?: () => void;
    /** Open the changelog viewer, expanded, wherever the shell keeps it. */
    readonly openChangelog?: () => void;
}

export interface PaletteCatalogInput {
    readonly t: Translate;
    /** The running viewer, or null before a map is open. */
    readonly app: BlueMapApp | null;
    /** The active locale, read by the caller so the language row reacts to a change. */
    readonly locale: string;
    readonly actions: PaletteShellActions;
    /**
     * The shell's pages, in strip order.
     *
     * Passed in rather than declared here so the palette cannot fall behind the strip.
     *
     * Optional, and treated as empty when it is absent, because a host with no tab strip is a
     * real case rather than a mistake to guard against: the palette is mounted in tests, and
     * `openPage` is optional for the same reason. A shell that has pages but forgets to pass
     * them loses its page rows, which is the correct failure - the alternative is rows built
     * from a list this file kept for itself, which is the drift the whole design avoids.
     */
    readonly pages?: readonly PalettePageRef[];
    /** True only when the shell can open the options editor at a named tab. */
    readonly canRouteConfigScreens: boolean;
    readonly size: PaletteSize;
    readonly setSize: (size: PaletteSize) => void;
}

/**
 * Upstream's `hasMarkers`, recursive and deliberately skipping the two synthetic sets.
 *
 * Get it wrong and the Markers row appears for a map whose only markers are the players
 * currently online, or disappears for a map whose markers are nested one level down. The
 * control bar applies exactly this test to decide whether to show its own Markers button,
 * so applying a looser one here would put a row in the palette for a page that opens empty.
 */
function hasMarkers(markerSet: MarkerSetData): boolean {
    if (markerSet.markers.length > 0) return true;
    for (const set of markerSet.markerSets) {
        if (set.id !== "bm-players" && set.id !== "bm-popup-set" && hasMarkers(set)) return true;
    }
    return false;
}

/**
 * What each page is, said in one sentence, for the pages this build knows the names of.
 *
 * Keyed by page id, and deliberately allowed to be incomplete. The page rows are built from
 * the strip the shell handed down, so a page missing from this table still gets a row and
 * still teleports; it gets a generic explanation instead of a specific one. That is the right
 * way round. The alternative - building rows only for ids listed here - would mean a new page
 * silently absent from the palette until somebody remembered to add a sentence, which is the
 * failure the whole page group was added to fix.
 *
 * `keywords` matter more than they look. Somebody hunting for the render console types
 * "console", and the console lives inside the render panel on the guide page; somebody hunting
 * for the installer download types "download". Neither word is in a tab label.
 */
const PAGE_NOTES: Record<string, { description: [string, string]; keywords: readonly string[] }> = {
    map: {
        description: ["palette.page.map", "The rendered map itself, with the viewer's own menu, markers and camera."],
        keywords: ["viewer", "world", "3d", "canvas", "camera", "marker"],
    },
    world: {
        description: [
            "palette.page.world",
            "The guide that turns a world folder into a rendered map: pick the folder, answer five questions, watch the render run.",
        ],
        keywords: [
            "guide",
            "wizard",
            "render",
            "new map",
            "world folder",
            "console",
            "render console",
            "log",
            "output",
            "download",
            "bluemap download",
            "java",
            "progress",
        ],
    },
    projects: {
        description: [
            "palette.page.projects",
            "Every saved render project, and every setting one can carry beyond the five the guide asks about.",
        ],
        keywords: ["project", "saved", "editor", "maps", "storages", "export", "import"],
    },
    cirender: {
        description: [
            "palette.page.ciRender",
            "Rendering on GitHub's machines instead of this one: a repository, the consents, the upload, and the run watched job by job.",
        ],
        keywords: ["github", "runner", "actions", "ci", "cloud", "remote render", "workflow", "upload"],
    },
    servers: {
        description: [
            "palette.page.servers",
            "The list of servers and rendered maps this app can open, and where a new one is added.",
        ],
        keywords: ["profile", "connection", "remote", "map list", "add server"],
    },
    backups: {
        description: [
            "palette.page.backups",
            "Backing a world or a rendered map up to GitHub release assets, and restoring one that is already there.",
        ],
        keywords: ["backup", "restore", "archive", "release asset", "upload", "safety"],
    },
    pages: {
        description: [
            "palette.page.pages",
            "Publishing a rendered map as a website on GitHub Pages, and what the published site currently holds.",
        ],
        keywords: ["publish", "github pages", "website", "host", "deploy", "share"],
    },
};

/**
 * One row per page of the shell's tab strip.
 *
 * These are the rows the palette was most conspicuously missing. Six of the seven pages had no
 * entry at all, so the single most obvious thing to type into a search-everything box - the
 * name of a screen you can see a tab for - found nothing.
 *
 * Built only when the shell passed `openPage`, because a row that navigates nowhere is worse
 * than an absent one, and the row for the page you are already on is still built: it is a
 * perfectly reasonable way to get back to the map from a settings sheet, and hiding it would
 * make the list's contents depend on where you happened to be standing.
 */
function pageItems(input: PaletteCatalogInput, group: string): PaletteItem[] {
    const { t, actions } = input;
    const openPage = actions.openPage;
    if (openPage === undefined) return [];

    return (input.pages ?? []).map((page): PaletteItem => {
        const note = PAGE_NOTES[page.id];
        return {
            kind: "destination",
            id: `page.${page.id}`,
            group,
            title: page.label,
            description:
                note === undefined
                    ? t("palette.page.generic", "One of this app's pages, on the tab strip along the top.")
                    : t(note.description[0], note.description[1]),
            keywords: [page.id, ...(note?.keywords ?? [])],
            where: t("palette.where.page", { page: page.label }, "Shows the {page} page, exactly as its tab does."),
            go: () => openPage(page.id),
        };
    });
}

/**
 * The shell's own surfaces: the two overlays beside the map, and the camera reset.
 *
 * Settings and the options editor are here rather than in the page group because neither is a
 * page - they are surfaces painted over whatever page you were on, which is why they are
 * reached from a floating button rather than from the strip.
 *
 * The server list *is* a page in this shell, so its row is built here only when there is no
 * strip to carry it (`hasPages` false). Two rows opening the same screen under two names is
 * how a search-everything box starts feeling like it is guessing.
 */
function shellItems(input: PaletteCatalogInput, group: string, hasPages: boolean): PaletteItem[] {
    const { t, actions } = input;
    const items: PaletteItem[] = [];

    items.push(
        {
            kind: "destination",
            id: "shell.settings",
            group,
            title: t("settings.title", "Settings"),
            description: t(
                "palette.shell.settings",
                "The app's own settings: download consent, the Java runtime, where maps are written, and the GitHub account.",
            ),
            keywords: ["preferences", "options", "app"],
            where: t("palette.where.settings", "Opens the Settings panel on the right."),
            go: () => actions.openSettings(),
        },
        {
            kind: "destination",
            id: "shell.config",
            group,
            title: t("config.title", "Server configuration"),
            description: t(
                "palette.shell.config",
                "The options editor: every setting BlueMap itself reads, plus the flags a run is started with.",
            ),
            keywords: ["bluemap", "conf", "editor", "options"],
            where: t("palette.where.config", "Opens the server configuration editor over the map."),
            go: () => actions.openConfig(null),
        },
    );

    if (!hasPages) {
        items.push({
            kind: "destination",
            id: "shell.profiles",
            group,
            title: t("servers.title", "Servers"),
            description: t(
                "palette.shell.profiles",
                "The list of servers and rendered maps this app can open, and where a new one is added.",
            ),
            keywords: ["profile", "connection", "remote", "map list"],
            where: t("palette.where.profiles", "Opens the server list."),
            go: () => actions.openProfiles(),
        });
    }

    // A camera to reset only exists once a viewer does. Listed as a command rather than a
    // destination because nothing opens: the view moves and the palette is finished.
    const app = input.app;
    if (app !== null) {
        items.push({
            kind: "command",
            id: "shell.resetCamera",
            group,
            title: t("resetCamera.tooltip", "Reset Camera & Position"),
            description: t(
                "palette.shell.resetCamera",
                "Puts the camera back where the map opens, facing north, at the default distance.",
            ),
            keywords: ["camera", "position", "north", "home"],
            run: () => app.resetCamera(),
        });
    }

    return items;
}

/**
 * The five sections of the app's settings surface, straight out of its own registry.
 *
 * The four that a failed render can point at emit a `SettingsTarget` and are revealed on
 * arrival. The GitHub section is not one of them - nothing in the bridge can name it,
 * because no render stops for the want of a GitHub account - so its row opens the surface
 * and says so in as many words rather than implying an outline that will not appear.
 */
function settingsSectionItems(input: PaletteCatalogInput, group: string): PaletteItem[] {
    const { t, actions } = input;
    const copy = sectionCopy(t);

    return SETTINGS_SECTIONS.map((anchor: SettingsSectionAnchor): PaletteItem => {
        const section = copy[anchor];
        if (isSettingsAnchor(anchor)) {
            return {
                kind: "destination",
                id: `settings.${anchor}`,
                group,
                title: section.title,
                description: section.description,
                keywords: [anchor.replaceAll("-", " ")],
                where: t("palette.where.section", "Opens Settings and outlines this setting."),
                go: () => actions.revealSetting({ surface: "settings", anchor, missing: false }),
            };
        }

        return {
            kind: "destination",
            id: `settings.${anchor}`,
            group,
            title: section.title,
            description: section.description,
            keywords: [anchor.replaceAll("-", " ")],
            where: t(
                "palette.where.githubSection",
                "Opens Settings. This one is the last section in the panel; nothing outlines it, because no failure links to it.",
            ),
            go: () => actions.openSettings(),
        };
    });
}

/**
 * The options editor's seven tabs.
 *
 * Seven rows when the shell can open the editor at a named tab, one row when it cannot. The
 * single row is not a lesser version that hides the other six: it carries every tab's label
 * and description in its searchable text, so somebody typing "webserver" or "storages" still
 * finds it, and its sentence names the tab to pick rather than pretending it will land there.
 */
function configScreenItems(input: PaletteCatalogInput, group: string): PaletteItem[] {
    const { t, actions } = input;

    if (!input.canRouteConfigScreens) {
        return [
            {
                kind: "destination",
                id: "config.all",
                group,
                title: t("palette.config.allTitle", "Every BlueMap setting"),
                description: t(
                    "palette.config.allDescription",
                    "The options editor holds one tab per group of settings. Open it and pick the tab named below.",
                ),
                keywords: SCREENS.flatMap((screen) => [screen.id, screen.label, screen.description]),
                where: t(
                    "palette.where.configAll",
                    "Opens the server configuration editor at its first tab, Core. The tab strip along the top has the rest.",
                ),
                go: () => actions.openConfig(null),
            },
        ];
    }

    return SCREENS.map(
        (screen): PaletteItem => ({
            kind: "destination",
            id: `config.${screen.id}`,
            group,
            title: screen.label,
            description: screen.description,
            keywords: [screen.id, "bluemap", "conf"],
            where: t(
                "palette.where.configScreen",
                { tab: screen.label },
                "Opens the server configuration editor at the {tab} tab.",
            ),
            go: () => actions.openConfig(screen.id),
        }),
    );
}

/**
 * The options editor's History tab.
 *
 * Listed separately because it is not in `SCREENS`, and should not be: that list drives the
 * settings search index, whose entries are fields, and the History tab has none. Without an
 * entry here, though, the one tab a person is most likely to look for by name - the place
 * their old configuration is - could not be found by typing its name, which is the single
 * thing this palette exists to prevent.
 *
 * It routes for real wherever the seven `SCREENS` tabs do, because the editor's own tab state
 * accepts History as one of its values. Where the shell cannot route, it says which tab to
 * pick rather than implying it will land there.
 */
function configHistoryItem(input: PaletteCatalogInput, group: string): PaletteItem {
    const { t, actions } = input;
    const routed = input.canRouteConfigScreens;
    return {
        kind: "destination",
        id: "config.history",
        group,
        title: t("palette.config.historyTitle", "Config folder history"),
        description: t(
            "palette.config.historyDescription",
            "Every saved version of the open config folder, kept on this computer: browse them, see what each one changed, and put one back.",
        ),
        keywords: ["history", "versions", "revisions", "restore", "undo", "backup", "bluemap", "conf"],
        where: routed
            ? t(
                  "palette.where.configHistoryRouted",
                  "Opens the server configuration editor at its History tab.",
              )
            : t(
                  "palette.where.configHistory",
                  "Opens the server configuration editor. Its History tab, at the end of the tab strip, holds the saved versions.",
              ),
        go: () => actions.openConfig(routed ? "history" : null),
    };
}

/**
 * The pages of the viewer's own menu.
 *
 * Titles are passed to `openPage` as functions, which is how the menu stores them: an open
 * heading then re-translates when the language changes instead of freezing in the language
 * it was opened in.
 */
function menuPageItems(input: PaletteCatalogInput, group: string): PaletteItem[] {
    const { t } = input;
    const app = input.app;
    if (app === null) return [];

    const items: PaletteItem[] = [
        {
            kind: "destination",
            id: "menu.maps",
            group,
            title: t("maps.title", "Maps"),
            description: t("palette.menu.maps", "Every map this server publishes, and which one is on screen."),
            keywords: ["world", "dimension", "nether", "end", "switch"],
            where: t("palette.where.menuPage", "Opens the menu at this page."),
            go: () => app.appState.menu.openPage("maps", () => t("maps.title", "Maps")),
        },
        {
            kind: "destination",
            id: "menu.settings",
            group,
            title: t("settings.title", "Settings"),
            description: t(
                "palette.menu.settings",
                "The viewer's settings page, which is also where resetting every saved setting lives behind its confirmation.",
            ),
            keywords: ["viewer", "reset all settings", "preferences"],
            where: t("palette.where.menuPage", "Opens the menu at this page."),
            go: () => app.appState.menu.openPage("settings", () => t("settings.title", "Settings")),
        },
        {
            kind: "destination",
            id: "menu.info",
            group,
            title: t("info.title", "Info"),
            description: t("palette.menu.info", "What the controls do, and what this build of BlueMap is."),
            keywords: ["help", "about", "version", "controls", "keys"],
            where: t("palette.where.menuPage", "Opens the menu at this page."),
            go: () => app.appState.menu.openPage("info", () => t("info.title", "Info")),
        },
    ];

    const root = app.mapViewer.markers.data;
    if (root !== null && root !== undefined && hasMarkers(root)) {
        items.push({
            kind: "destination",
            id: "menu.markers",
            group,
            title: t("markers.title", "Markers"),
            description: t("palette.menu.markers", "Every marker set on this map, and the markers inside them."),
            keywords: ["poi", "label", "point of interest"],
            where: t("palette.where.menuPage", "Opens the menu at this page."),
            go: () => app.appState.menu.openPage("markers", () => t("markers.title", "Markers"), { markerSet: root }),
        });
    }

    const players = root?.markerSets.find((set) => set.id === "bm-players") ?? null;
    if (players !== null) {
        items.push({
            kind: "destination",
            id: "menu.players",
            group,
            title: t("players.title", "Players"),
            description: t("palette.menu.players", "Who is online right now, and where they are standing."),
            keywords: ["online", "who", "people"],
            where: t("palette.where.menuPage", "Opens the menu at this page."),
            go: () => app.appState.menu.openPage("markers", () => t("players.title", "Players"), { markerSet: players }),
        });
    }

    return items;
}

/**
 * The chrome that is not a page and not a settings section: the corner, the strip, the notes.
 *
 * All three were unreachable from the palette. The notification centre is behind a bell in the
 * bottom-right corner, the tab finder is behind a small button at the end of the strip, and the
 * changelog is behind a collapsed disclosure inside the viewer's Info page - which is to say
 * all three are exactly the kind of affordance somebody looks for by name because they cannot
 * remember which corner it was in.
 *
 * They are commands rather than destinations even though each one opens something. A
 * destination's promise is "a surface appears and here is which"; these three are anchored
 * panels that open in place beside the control they belong to, and calling that a destination
 * would set up an expectation of arriving somewhere else that the surface then does not meet.
 */
function chromeItems(input: PaletteCatalogInput, group: string): PaletteItem[] {
    const { t, actions } = input;
    const items: PaletteItem[] = [];

    const openNoticeCentre = actions.openNoticeCentre;
    if (openNoticeCentre !== undefined) {
        items.push({
            kind: "command",
            id: "chrome.noticeCentre",
            group,
            title: t("notices.centre.title", "Notification centre"),
            description: t(
                "palette.chrome.noticeCentre",
                "Every message this app has raised, searchable and filterable by level, including the ones that dismissed themselves before you read them.",
            ),
            keywords: ["notification", "notice", "history", "toast", "message", "bell", "alert", "dismissed"],
            run: () => openNoticeCentre(),
        });
    }

    const openTabFinder = actions.openTabFinder;
    if (openTabFinder !== undefined) {
        items.push({
            kind: "command",
            id: "chrome.tabFinder",
            group,
            title: t("tabs.finder.title", "Find a tab"),
            description: t(
                "palette.chrome.tabFinder",
                "The tab strip's own search: every open tab and every group, with the bulk-close actions and their regex builders.",
            ),
            keywords: ["tab", "group", "find", "search tabs", "pinned", "close tabs", "overflow"],
            run: () => openTabFinder(),
        });
    }

    /*
     * The changelog needs a viewer, and not for a squeamish reason: it is a fold inside the
     * viewer's own Info page, so with no map open there is no Info page for it to be a fold
     * inside. A row offered here regardless would be a row that runs, does nothing visible,
     * and closes the palette - which is indistinguishable from a broken one. The note at the
     * foot of the palette already says the viewer's own rows appear once a map is open.
     */
    const openChangelog = actions.openChangelog;
    if (openChangelog !== undefined && input.app !== null) {
        items.push({
            kind: "command",
            id: "chrome.changelog",
            group,
            title: t("changelog.title", "Changelog"),
            description: t(
                "palette.chrome.changelog",
                "Every released version and what changed in it, with a date filter and a search, each entry linked to the commit that made it.",
            ),
            keywords: ["changelog", "release notes", "version", "what's new", "history", "updates"],
            run: () => openChangelog(),
        });
    }

    return items;
}

/**
 * Appearance: the preset in force, and the way back from a customisation you regret.
 *
 * These two are the whole of the appearance system that can honestly be a palette row. The
 * per-element editors cannot: each one is anchored to the element it edits and opened from that
 * element's own context menu, so there is no such thing as opening the typography editor for a
 * tab without a tab to anchor it to. A row that opened "the appearance editor" in the abstract
 * would be a row that lands nowhere in particular, which is the thing this catalogue keeps
 * refusing to build. The destination row below says that in words instead, so somebody typing
 * "font" or "colour" learns where the control is rather than being told nothing matches.
 *
 * The preset row is a real control on the real write path: `commitAppearance` is the single
 * function every appearance mutation in this feature goes through, so choosing a preset here
 * and choosing it in the editor are the same act with the same persistence.
 */
const NO_PRESET = "none";

function appearanceItems(input: PaletteCatalogInput, group: string): PaletteItem[] {
    const { t } = input;
    const state = appearanceState().value;

    const options: PaletteChoice[] = [
        { id: NO_PRESET, label: t("palette.appearance.noPreset", "No preset") },
        ...BUILT_IN_PRESETS.map((preset) => ({ id: preset.id, label: preset.name })),
        ...state.presets.map((preset) => ({ id: preset.id, label: preset.name })),
    ];

    return [
        {
            kind: "setting",
            id: "appearance.preset",
            group,
            title: t("palette.appearance.presetTitle", "Appearance preset"),
            description: t(
                "palette.appearance.presetDescription",
                "The saved look applied underneath every element's own customisation. Built-in presets and any you have saved yourself.",
            ),
            keywords: ["theme", "preset", "appearance", "look", "contrast", "large text", "font size"],
            control: {
                kind: "choice",
                value: state.activePreset === "" ? NO_PRESET : state.activePreset,
                options,
                set: (id) => {
                    commitAppearance({
                        ...appearanceState().value,
                        activePreset: id === NO_PRESET ? "" : id,
                    });
                },
            },
        },
        {
            kind: "command",
            id: "appearance.reset",
            group,
            title: t("palette.appearance.resetTitle", "Reset every appearance customisation"),
            description: t(
                "palette.appearance.resetDescription",
                "Puts every element back to the app's own look and clears the active preset. Saved presets are kept, so this is undone by choosing one again.",
            ),
            keywords: ["reset", "default", "undo customisation", "clear theme", "start over"],
            run: () => {
                commitAppearance(withGlobalReset(appearanceState().value));
            },
        },
        {
            kind: "destination",
            id: "appearance.editors",
            group,
            title: t("palette.appearance.editorsTitle", "Customise one element's appearance"),
            description: t(
                "palette.appearance.editorsDescription",
                "Font, size, weight, colour, highlight, spacing, borders and shape, per element, with the infinite colour picker and its translator.",
            ),
            keywords: [
                "font",
                "typeface",
                "colour",
                "color",
                "typography",
                "highlight",
                "border",
                "radius",
                "spacing",
                "bold",
                "italic",
                "underline",
                "edit appearance",
            ],
            where: t(
                "palette.where.appearanceEditors",
                "Opens Settings. Each editor itself is anchored to the element it edits: right-click any element and choose Edit appearance, or Shift+right-click to open it directly.",
            ),
            go: () => input.actions.openSettings(),
        },
    ];
}

/**
 * The palette's own size, listed in the palette.
 *
 * It belongs here for the same reason every other setting does: somebody who finds the
 * full-window view overwhelming should be able to fix it from the surface that is
 * overwhelming them, rather than being told to look for the setting elsewhere.
 */
function paletteOwnItems(input: PaletteCatalogInput, group: string): PaletteItem[] {
    const { t } = input;
    const labels: Record<PaletteSize, string> = {
        card: t("palette.size.card", "Card"),
        full: t("palette.size.full", "Full window"),
    };

    return [
        {
            kind: "setting",
            id: "palette.size",
            group,
            title: t("palette.size.title", "Command palette size"),
            description: t(
                "palette.size.description",
                "Whether this palette opens as a bounded card or fills the window. Remembered between launches.",
            ),
            keywords: ["window", "card", "full screen", "size"],
            control: {
                kind: "choice",
                value: input.size,
                options: PALETTE_SIZES.map((size) => ({ id: size, label: labels[size] })),
                set: (id) => {
                    if (id === "card" || id === "full") input.setSize(id);
                },
            },
        },
    ];
}

/**
 * The whole catalogue, in the order the palette lists it with no search applied.
 *
 * Order is a judgement rather than an alphabetical accident: the shell's own overlays first
 * because they are what somebody who has just learned the shortcut reaches for, then the pages
 * they navigate between, then the chrome around those pages, then the app's settings and the
 * look of them, then BlueMap's own settings, then the viewer's menu, then the viewer settings
 * that are live controls here, and the palette's own size last because it is the one row that
 * is about the palette rather than about the app.
 */
export function buildPaletteCatalog(input: PaletteCatalogInput): PaletteItem[] {
    const { t } = input;
    const hasPages = (input.pages?.length ?? 0) > 0;

    return [
        ...shellItems(input, t("palette.group.app", "App"), hasPages),
        ...pageItems(input, t("palette.group.pages", "Pages")),
        ...chromeItems(input, t("palette.group.chrome", "Shell")),
        ...settingsSectionItems(input, t("palette.group.appSettings", "App settings")),
        ...configScreenItems(input, t("palette.group.config", "Server configuration")),
        configHistoryItem(input, t("palette.group.config", "Server configuration")),
        ...appearanceItems(input, t("palette.group.appearance", "Appearance")),
        ...menuPageItems(input, t("palette.group.menu", "Menu")),
        ...viewerSettingItems(input.app, input.t, input.locale),
        ...paletteOwnItems(input, t("palette.group.palette", "Command palette")),
    ];
}

/** The anchors the catalogue is expected to cover, re-exported so a test can assert on them. */
export { SETTINGS_ANCHORS, SETTINGS_SECTIONS, SCREENS };
