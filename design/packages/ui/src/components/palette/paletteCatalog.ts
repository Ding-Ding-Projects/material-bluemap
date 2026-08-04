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
 */

import type { BlueMapApp } from "@material-bluemap/viewer";
import type { MarkerSetData } from "@material-bluemap/viewer";
import { SCREENS, type ScreenId } from "../config/configSearch.js";
import { sectionCopy } from "../settings/settingsCopy.js";
import {
    SETTINGS_ANCHORS,
    SETTINGS_SECTIONS,
    isSettingsAnchor,
    type SettingsSectionAnchor,
} from "../settings/settingsSections.js";
import type { PaletteItem, Translate } from "./paletteItems.js";
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
 * What the shell has to be able to do for the palette's destination rows to work.
 *
 * Every one of these is something the shell already does from a button of its own; none of
 * them is new behaviour invented for the palette. A shell that cannot do one of them simply
 * has no such button, and the corresponding row is not built.
 */
export interface PaletteShellActions {
    /** Open the settings surface at a setting, revealing and outlining it. */
    readonly revealSetting: (target: PaletteSettingsTarget) => void;
    /** Open the settings surface with nothing revealed. */
    readonly openSettings: () => void;
    /** Open the options editor, at a tab when the shell can route to one. */
    readonly openConfig: (screen: ScreenId | null) => void;
    /** Open the server-profile manager. */
    readonly openProfiles: () => void;
}

export interface PaletteCatalogInput {
    readonly t: Translate;
    /** The running viewer, or null before a map is open. */
    readonly app: BlueMapApp | null;
    /** The active locale, read by the caller so the language row reacts to a change. */
    readonly locale: string;
    readonly actions: PaletteShellActions;
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

/** The shell's own surfaces: the three buttons beside the map, and the camera reset. */
function shellItems(input: PaletteCatalogInput, group: string): PaletteItem[] {
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
        {
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
        },
    );

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
 * Order is a judgement rather than an alphabetical accident: the shell's own surfaces first
 * because they are what somebody who has just learned the shortcut reaches for, then the
 * app's settings, then BlueMap's own, then the viewer's menu, then the viewer settings that
 * are live controls here, and the palette's own size last because it is the one row that is
 * about the palette rather than about the app.
 */
export function buildPaletteCatalog(input: PaletteCatalogInput): PaletteItem[] {
    const { t } = input;

    return [
        ...shellItems(input, t("palette.group.app", "App")),
        ...settingsSectionItems(input, t("palette.group.appSettings", "App settings")),
        ...configScreenItems(input, t("palette.group.config", "Server configuration")),
        ...menuPageItems(input, t("palette.group.menu", "Menu")),
        ...viewerSettingItems(input.app, input.t, input.locale),
        ...paletteOwnItems(input, t("palette.group.palette", "Command palette")),
    ];
}

/** The anchors the catalogue is expected to cover, re-exported so a test can assert on them. */
export { SETTINGS_ANCHORS, SETTINGS_SECTIONS, SCREENS };
