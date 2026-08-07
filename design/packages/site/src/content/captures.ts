/**
 * The captures that are committed to this repository, under `docs/screenshots/`.
 *
 * These are not the same images as the gallery on the Screenshots page. That page shows
 * whatever `scripts/fetch-screenshots.mjs` downloaded from a workflow run at build time,
 * and a fresh clone has none of it, which is why the landing page could not show a single
 * picture: the one set of images guaranteed to exist was the one nothing was reading.
 *
 * So this module reads that set. The files are tracked in git, they travel with every
 * clone, and they are pulled into the bundle by `import.meta.glob` as ordinary hashed
 * assets, exactly as the dim sum photographs are. Nothing is fetched at runtime and no
 * image comes from a third party.
 *
 * Two rules make it safe to point a landing page at them:
 *
 *   1. A record whose file did not resolve is dropped, not rendered. A broken image on a
 *      landing page reads as a broken project.
 *   2. Nothing here describes what is inside a picture beyond what the capture's own
 *      provenance supports. The configuration is recorded by the harness that took it;
 *      the alt text names the surface and that configuration and stops there.
 */

import type { HomeLink } from "./types.js";
import { repoFile } from "./links.js";

const CAPTURE_DIRECTORY = "docs/screenshots";

const imageModules = import.meta.glob("../../../../../docs/screenshots/*.png", {
    eager: true,
    query: "?url",
    import: "default",
}) as Record<string, string>;

const manifestModules = import.meta.glob("../../../../../docs/screenshots/manifest.json", {
    eager: true,
    import: "default",
}) as Record<string, unknown>;

/**
 * One committed capture.
 *
 * Deliberately not `ScreenshotCapture`: that type carries pixel dimensions and a byte size,
 * which the fetch script reads out of the PNG header at build time. Nothing here reads a
 * PNG header, so nothing here may claim those numbers.
 */
export interface RepoCapture {
    readonly file: string;
    /** Bundled asset URL, resolved by the bundler. Never a hand-written path. */
    readonly url: string;
    readonly title: string;
    /** The window size, display scale or colour scheme this was taken at. */
    readonly configuration: string;
    readonly alt: string;
    /**
     * The window's aspect ratio as a CSS value, so the layout reserves the right box
     * before a lazily loaded image arrives. It is the shape of the window the harness
     * drove, which the file name records; it is not a claim about the pixel dimensions.
     */
    readonly aspectRatio: string;
}

/** What the harness recorded about how the whole set was produced. */
export interface CaptureProvenance {
    readonly capturedBy: string;
    readonly method: string;
    readonly commit: string;
    readonly run: string;
    readonly directory: HomeLink;
}

interface CaptureRecord {
    readonly file: string;
    readonly title: string;
    readonly configuration: string;
    readonly alt: string;
    readonly aspectRatio: string;
    /** True for the captures the landing page shows. The rest stay in the full set. */
    readonly featured: boolean;
}

/**
 * The captures, in the order a reader should meet them.
 *
 * The installed application comes first because it is the only one that shows the whole
 * interface at once, and because "somebody installed this and it opened" is the single
 * most useful thing a landing page can prove. After it come the surfaces: the window's own
 * chrome, first run, the menu, settings, the options editor, the wizard, and the dialogs.
 *
 * The harness opens each of those by driving the real application, and records in its
 * manifest every surface it could not reach and why. Nothing here stands in for one of
 * those: a screen that has no capture has no entry.
 */
const RECORDS: readonly CaptureRecord[] = [
    {
        file: "installed-app-1920x1200.png",
        aspectRatio: "8 / 5",
        title: "The installed application",
        configuration: "installed from the Windows installer, 1920 by 1200",
        alt: "The worldlens desktop application running after a Windows install, showing a three-dimensional rendered Minecraft-style terrain (forest, snow and open water) with the ported interface over it: the menu button and a position marker at the top left, the view-mode, day-night, flight and fullscreen controls with live x and z position inputs and a compass at the top right, and the settings, maps-and-servers and configuration buttons at the bottom left.",
        featured: true,
    },
    {
        file: "titlebar-zoom-1920.png",
        aspectRatio: "480 / 11",
        title: "The Material title bar, full width",
        configuration: "cropped from a 1920 by 1080 capture of the packaged application on Windows",
        alt: "The worldlens application's own title bar, cropped to the full width of a 1920 pixel window: the circular application logo and the title Worldlens on the left, and minimize, maximize and close buttons drawn by the application on the right. No operating system caption bar is present, because the window is frameless.",
        featured: false,
    },
    {
        file: "shell-titlebar-1920x1080.png",
        aspectRatio: "16 / 9",
        title: "The frameless window, whole",
        configuration: "1920 by 1080, the packaged application on Windows, at first run",
        alt: "The worldlens application window at 1920 by 1080 pixels with its own Material title bar across the top edge and no operating system chrome. In front is the first-run setup dialog, offering English, Cantonese and bilingual language modes and two separate funny-level sliders; behind it is the map wizard. Three round buttons for settings, servers and server configuration sit in the bottom left corner, and the notification history button, reading zero, sits in the bottom right.",
        featured: false,
    },
    {
        file: "theme-dark.png",
        aspectRatio: "8 / 5",
        title: "Dark colour scheme",
        configuration: "1280 by 800, dark colour scheme",
        alt: "The worldlens application window rendered with the dark colour scheme, at 1280 by 800 pixels.",
        featured: false,
    },
    {
        file: "theme-light.png",
        aspectRatio: "8 / 5",
        title: "Light colour scheme",
        configuration: "1280 by 800, light colour scheme",
        alt: "The worldlens application window rendered with the light colour scheme, at 1280 by 800 pixels.",
        featured: false,
    },
    {
        file: "shell-800x600-narrow.png",
        aspectRatio: "4 / 3",
        title: "The narrowest supported window",
        configuration: "800 by 600, 100% display scale",
        alt: "The worldlens application window at 800 by 600 pixels, the narrowest window size the interface is checked against.",
        featured: true,
    },
    {
        file: "shell-scale-2x.png",
        aspectRatio: "8 / 5",
        title: "200 percent display scale",
        configuration: "1280 by 800, 200% display scale",
        alt: "The worldlens application window at 200 percent display scale, where element sizing defects appear first.",
        featured: true,
    },
    {
        file: "shell-1920x1080.png",
        aspectRatio: "16 / 9",
        title: "A full-size window",
        configuration: "1920 by 1080, 100% display scale",
        alt: "The worldlens application window at 1920 by 1080 pixels.",
        featured: true,
    },
    {
        file: "shell-1280x800.png",
        aspectRatio: "8 / 5",
        title: "The harness default window",
        configuration: "1280 by 800, 100% display scale",
        alt: "The worldlens application window at 1280 by 800 pixels, the size the capture harness resets to.",
        featured: false,
    },
    {
        file: "shell-1024x768.png",
        aspectRatio: "4 / 3",
        title: "A small window",
        configuration: "1024 by 768, 100% display scale",
        alt: "The worldlens application window at 1024 by 768 pixels.",
        featured: false,
    },
    {
        file: "shell-scale-1x.png",
        aspectRatio: "8 / 5",
        title: "100 percent display scale",
        configuration: "1280 by 800, 100% display scale",
        alt: "The worldlens application window at 100 percent display scale.",
        featured: false,
    },
    {
        file: "shell-scale-1_25x.png",
        aspectRatio: "8 / 5",
        title: "125 percent display scale",
        configuration: "1280 by 800, 125% display scale",
        alt: "The worldlens application window at 125 percent display scale.",
        featured: false,
    },
    {
        file: "shell-scale-1_5x.png",
        aspectRatio: "8 / 5",
        title: "150 percent display scale",
        configuration: "1280 by 800, 150% display scale",
        alt: "The worldlens application window at 150 percent display scale.",
        featured: false,
    },

    /* ---- The window's own chrome ----------------------------------------- */

    {
        file: "chrome-titlebar.png",
        aspectRatio: "32 / 1",
        title: "The Material title bar",
        configuration: "cropped to the title bar of a 1280 pixel wide window",
        alt: "The application's own Material title bar across the full width of the window: a circular logo and the words Worldlens on the left, and minimize, maximize and close buttons on the right. There is no operating system caption bar above it, because the window is frameless.",
        featured: false,
    },
    {
        file: "chrome-titlebar-window-buttons.png",
        aspectRatio: "18 / 5",
        title: "The window buttons",
        configuration: "cropped to the three window buttons at the right of the title bar",
        alt: "The minimize, maximize and close buttons the application draws for itself at the right end of its own title bar, rather than letting the operating system draw them.",
        featured: false,
    },
    {
        file: "chrome-control-bar.png",
        aspectRatio: "20 / 1",
        title: "The viewer control bar",
        configuration: "cropped to the control bar over the map, 1280 by 800 window",
        alt: "The viewer control bar over the map: the round menu button on the left, and on the right a day and night switch, the perspective, flat and free-flight view modes, a reset camera button, live x and z position inputs reading 500 and 500, and a compass.",
        featured: false,
    },
    {
        file: "chrome-shell-buttons.png",
        aspectRatio: "3 / 10",
        title: "The shell buttons",
        configuration: "cropped to the buttons in the bottom left corner of the window",
        alt: "Three round buttons stacked in the bottom left corner of the window: settings, maps and servers, and server configuration.",
        featured: false,
    },

    /* ---- First run -------------------------------------------------------- */

    {
        file: "firstrun-1-welcome.png",
        aspectRatio: "45 / 47",
        title: "First run, the welcome step",
        configuration: "cropped to the first-run dialog on a throwaway profile",
        alt: "The first-run welcome step, explaining what the application does and what it cannot do yet, then offering English, Cantonese and bilingual language modes and a separate funny level slider for each of the two languages.",
        featured: false,
    },
    {
        file: "firstrun-2-consent.png",
        aspectRatio: "45 / 47",
        title: "First run, the Minecraft files step",
        configuration: "cropped to the first-run dialog on a throwaway profile",
        alt: "The first-run Minecraft files step, which asks once whether the application may download Minecraft's own client files, quotes the text being agreed to, and says plainly what accepting and declining each mean.",
        featured: false,
    },
    {
        file: "firstrun-3-storage.png",
        aspectRatio: "45 / 29",
        title: "First run, the map storage step",
        configuration: "cropped to the first-run dialog on a throwaway profile",
        alt: "The first-run map storage step, a single field asking where rendered maps should be written, with the finish button beneath it.",
        featured: false,
    },
    {
        file: "firstrun-1-welcome-window.png",
        aspectRatio: "8 / 5",
        title: "First run, over the whole window",
        configuration: "1280 by 800, on a throwaway profile so it is genuinely a first run",
        alt: "The first-run setup dialog centred over the whole application window on a fresh profile, with the map behind it and the application's own title bar above.",
        featured: false,
    },

    /* ---- The menu --------------------------------------------------------- */

    {
        file: "menu-root.png",
        aspectRatio: "8 / 5",
        title: "The main menu",
        configuration: "1280 by 800, over a locally rendered map",
        alt: "The main menu side sheet open over the map, listing maps, markers, settings and info as pages to open, then go fullscreen, reset camera, take screenshot and update map as actions.",
        featured: true,
    },
    {
        file: "menu-maps.png",
        aspectRatio: "8 / 5",
        title: "The maps page",
        configuration: "1280 by 800, over a locally rendered map",
        alt: "The maps page of the menu, with a collapsed search bar above a list holding one map, Overworld, marked as the one being shown.",
        featured: false,
    },
    {
        file: "menu-settings.png",
        aspectRatio: "8 / 5",
        title: "The viewer settings page",
        configuration: "1280 by 800, over a locally rendered map",
        alt: "The viewer settings page of the menu, with its own search bar at the top and groups for view and controls, resolution, render distance and free-flight controls below it.",
        featured: false,
    },
    {
        file: "menu-info.png",
        aspectRatio: "8 / 5",
        title: "The info page",
        configuration: "1280 by 800, over a locally rendered map",
        alt: "The info page of the menu, describing how to move around the map, with the application version at the foot of it.",
        featured: false,
    },
    {
        file: "menu-markers.png",
        aspectRatio: "8 / 5",
        title: "The marker page",
        configuration: "1280 by 800, over a locally rendered map that carries no markers",
        alt: "The marker page of the menu, showing its empty state: the map that is loaded carries no markers, so the page says this marker set has nothing in it rather than showing an empty list.",
        featured: false,
    },
    {
        file: "menu-search.png",
        aspectRatio: "8 / 5",
        title: "The menu's search bar",
        configuration: "1280 by 800, over a locally rendered map",
        alt: "The viewer settings page of the menu with its search bar open and two letters typed into it, a count reading nine of sixty above, and buttons beside the field for switching to a regular expression and for opening the regex builder.",
        featured: false,
    },
    {
        file: "menu-regex-builder.png",
        aspectRatio: "3 / 4",
        title: "The regex builder, from the menu",
        configuration: "cropped to the builder anchored to the menu's search bar",
        alt: "The regex builder anchored to the menu's search bar: a pattern box, the supported flags as toggles, and rows of buttons for character classes, anchors, groups, alternation, quantifiers and escaping a literal, above a sample text box showing what currently matches.",
        featured: false,
    },

    /* ---- Settings --------------------------------------------------------- */

    {
        file: "settings-drawer.png",
        aspectRatio: "8 / 5",
        title: "The settings drawer",
        configuration: "1280 by 800, opened over a locally rendered map",
        alt: "The application settings drawer open down the right of the window over the map, with a search field at the top, a count of five settings, and the Mojang download consent section below it showing that the answer given during setup was to decline.",
        featured: true,
    },
    {
        file: "settings-section-mojang-download-consent.png",
        aspectRatio: "13 / 20",
        title: "Settings: Mojang download consent",
        configuration: "cropped to the settings drawer, that section scrolled into view",
        alt: "The Mojang download consent settings section, showing the answer given during setup, a link to the Minecraft end user licence agreement, and the text being agreed to quoted from BlueMap without changes.",
        featured: false,
    },
    {
        file: "settings-section-java-runtime.png",
        aspectRatio: "13 / 20",
        title: "Settings: Java runtime",
        configuration: "cropped to the settings drawer, that section scrolled into view",
        alt: "The Java runtime settings section, which reports which Java the application would use to run upstream BlueMap's renderer.",
        featured: false,
    },
    {
        file: "settings-section-map-storage-directory.png",
        aspectRatio: "13 / 20",
        title: "Settings: where rendered maps go",
        configuration: "cropped to the settings drawer, that section scrolled into view",
        alt: "The settings section that sets the folder rendered maps are written into, showing the current path.",
        featured: false,
    },
    {
        file: "settings-section-world-folder.png",
        aspectRatio: "13 / 20",
        title: "Settings: world folder",
        configuration: "cropped to the settings drawer, that section scrolled into view",
        alt: "The world folder settings section, which records the Minecraft save the application reads from.",
        featured: false,
    },
    {
        file: "settings-section-github-account.png",
        aspectRatio: "13 / 20",
        title: "Settings: GitHub account, signed out",
        configuration: "cropped to the settings drawer, that section scrolled into view",
        alt: "The GitHub account settings section in its signed-out state, saying that nothing is stored on this computer and that public repositories still work, and offering both a browser sign-in and a token instead.",
        featured: false,
    },
    {
        file: "settings-search.png",
        aspectRatio: "13 / 20",
        title: "The settings search",
        configuration: "cropped to the settings drawer with a query typed in",
        alt: "The settings drawer filtered by its search field, showing only the settings whose name, explanation or current value matches what was typed, with a count of how many of the five matched.",
        featured: false,
    },
    {
        file: "settings-regex-builder.png",
        aspectRatio: "11 / 14",
        title: "The regex builder, from settings",
        configuration: "cropped to the builder anchored to the settings search",
        alt: "The regex builder anchored to the settings search: the pattern, the supported flags, a guided palette of character classes, anchors, groups, alternation and quantifiers, and the live matches against the text currently on screen.",
        featured: false,
    },

    /* ---- The options editor ------------------------------------------------ */

    {
        file: "config-screen.png",
        aspectRatio: "8 / 5",
        title: "The options editor",
        configuration: "1280 by 800, with no configuration folder attached",
        alt: "The options editor filling the window: a toolbar for opening, generating, re-reading and saving a config folder, a notice saying this build cannot reach a file system so nothing can be opened or saved, a search across every setting on every tab, and seven tabs with the core settings shown below them.",
        featured: true,
    },
    {
        file: "config-tab-core.png",
        aspectRatio: "8 / 5",
        title: "Options: the Core tab",
        configuration: "1280 by 800, with no configuration folder attached",
        alt: "The Core tab of the options editor, holding the settings that apply to every map: the Minecraft client download, folders, render threads and logging.",
        featured: false,
    },
    {
        file: "config-tab-maps.png",
        aspectRatio: "8 / 5",
        title: "Options: the Maps tab",
        configuration: "1280 by 800, with no configuration folder attached",
        alt: "The Maps tab of the options editor, with a list of map configurations down the side and the selected map's world, bounds, lighting, tiles and markers beside it.",
        featured: false,
    },
    {
        file: "config-tab-storages.png",
        aspectRatio: "8 / 5",
        title: "Options: the Storages tab",
        configuration: "1280 by 800, with no configuration folder attached",
        alt: "The Storages tab of the options editor, which sets where rendered tiles are written, on disk or into a database.",
        featured: false,
    },
    {
        file: "config-tab-web-app.png",
        aspectRatio: "8 / 5",
        title: "Options: the Web app tab",
        configuration: "1280 by 800, with no configuration folder attached",
        alt: "The Web app tab of the options editor, holding what a visitor sees and where the web app is generated.",
        featured: false,
    },
    {
        file: "config-tab-web-server.png",
        aspectRatio: "8 / 5",
        title: "Options: the Web server tab",
        configuration: "1280 by 800, with no configuration folder attached",
        alt: "The Web server tab of the options editor, holding the built-in server's port, bind address and access log.",
        featured: false,
    },
    {
        file: "config-tab-server-plugin.png",
        aspectRatio: "8 / 5",
        title: "Options: the Server plugin tab",
        configuration: "1280 by 800, with no configuration folder attached",
        alt: "The Server plugin tab of the options editor, holding live player markers and the settings only a server plugin uses.",
        featured: false,
    },
    {
        file: "config-tab-run.png",
        aspectRatio: "8 / 5",
        title: "Options: the Run tab",
        configuration: "1280 by 800, with no configuration folder attached",
        alt: "The Run tab of the options editor, showing the command line flags a render, a marker update or the web server would be started with.",
        featured: false,
    },
    {
        file: "config-search.png",
        aspectRatio: "8 / 5",
        title: "The options search, across every tab",
        configuration: "1280 by 800, with a query typed in",
        alt: "The options editor's search with a query typed in, listing the matching settings from every one of the seven tabs at once and naming which tab each result lives on.",
        featured: false,
    },
    {
        file: "config-regex-builder.png",
        aspectRatio: "11 / 14",
        title: "The regex builder, from the options editor",
        configuration: "cropped to the builder anchored to the options search bar",
        alt: "The regex builder anchored to the options editor's search bar, with the pattern, the supported flags, the guided token palette and the live matches beneath.",
        featured: false,
    },
    {
        file: "config-delete-gate.png",
        aspectRatio: "60 / 61",
        title: "Deleting a map's configuration",
        configuration: "cropped to the confirmation anchored beside the delete button",
        alt: "The confirmation that guards deleting a map's configuration. It names the file that would go, the map id whose tiles stop being served, and says plainly that already-rendered tiles are not deleted. Two key switches sit above a slider that will not move until both are turned, and an emergency exit is offered beside the confirm button.",
        featured: false,
    },

    /* ---- The wizard -------------------------------------------------------- */

    {
        file: "wizard-1-world.png",
        aspectRatio: "8 / 5",
        title: "The wizard, choosing a world",
        configuration: "1280 by 800, with no map open",
        alt: "The make-a-map wizard on its first step, with its five steps listed across the top and a field asking for the folder of a Minecraft world, plus an offer to download one from a release for somebody who has none.",
        featured: false,
    },
    {
        file: "wizard-1-world-read.png",
        aspectRatio: "8 / 5",
        title: "The wizard, after reading the world",
        configuration: "1280 by 800, after a world generated by this repository was read off disk",
        alt: "The wizard's first step after the world folder has been read, naming the dimensions it found in the save and how many region files each of them holds.",
        featured: true,
    },
    {
        file: "wizard-2-name-and-dimension.png",
        aspectRatio: "8 / 5",
        title: "The wizard, naming the map",
        configuration: "1280 by 800, with no map open",
        alt: "The wizard's second step, which names the map and picks which dimension of the save it renders, with a sort order beside them.",
        featured: false,
    },
    {
        file: "wizard-3-options.png",
        aspectRatio: "8 / 5",
        title: "The wizard, map options",
        configuration: "1280 by 800, with no map open",
        alt: "The wizard's options step, holding the map's own render settings with a search across them and each group of settings collapsible.",
        featured: false,
    },
    {
        file: "wizard-4-where-it-goes.png",
        aspectRatio: "8 / 5",
        title: "The wizard, where the map goes",
        configuration: "1280 by 800, with no map open",
        alt: "The wizard's storage step, a field for the folder the rendered map is written into, with the map's own storage setting shown beneath it.",
        featured: false,
    },
    {
        file: "wizard-5-review.png",
        aspectRatio: "8 / 5",
        title: "The wizard, review",
        configuration: "1280 by 800, with no map open",
        alt: "The wizard's review step, listing every decision the earlier steps collected before a render is started, with the render button at the foot of it.",
        featured: false,
    },
    {
        file: "wizard-release-downloads.png",
        aspectRatio: "112 / 17",
        title: "Downloading a world from a release",
        configuration: "cropped to the panel inside the wizard's first step, before anything is fetched",
        alt: "The release downloads panel inside the wizard, with owner, repository and tag fields already filled in and a button to see what that release offers. Nothing has been fetched: listing a release needs network access the capture run does not have.",
        featured: false,
    },

    /* ---- Dialogs and notifications ----------------------------------------- */

    {
        file: "profiles-manager.png",
        aspectRatio: "8 / 5",
        title: "Maps and servers",
        configuration: "1280 by 800, opened over a locally rendered map",
        alt: "The maps and servers manager, listing the maps rendered on this computer and the remote BlueMap servers the application knows about, each with a delete button, and fields for adding another by name and URL.",
        featured: false,
    },
    {
        file: "notifications-toast.png",
        aspectRatio: "8 / 5",
        title: "A message in the corner",
        configuration: "1280 by 800, the notice the options editor raises when it opens",
        alt: "The application reporting what the options editor loaded when it opened, as a message in the bottom right corner that blocks nothing and dismisses itself.",
        featured: false,
    },
    {
        file: "notifications-corner.png",
        aspectRatio: "13 / 7",
        title: "The notification history button",
        configuration:
            "cropped to the bottom right corner after the message above it had dismissed itself",
        alt: "The small button in the bottom right corner that opens the notification history, a bell with the number three beside it for the three messages recorded so far. The message that was in the corner had already dismissed itself when this crop was taken, which is why nothing sits above the button.",
        featured: false,
    },
    {
        file: "notifications-history.png",
        aspectRatio: "35 / 16",
        title: "The notification history",
        configuration: "cropped to the history panel",
        alt: "The notification history panel, listing three messages the application has already shown, each with its level and the time it was raised, so a message that has faded away is still readable.",
        featured: false,
    },
    {
        file: "super-confirm-untouched.png",
        aspectRatio: "55 / 62",
        title: "The destructive-action gate, untouched",
        configuration: "cropped to the reset-settings confirmation dialog",
        alt: "The confirmation that guards resetting every viewer setting, before either key is turned: it names what will be cleared, shows two key switches both off, and a slider that will not move, with the status line saying both keys are needed. An emergency exit sits in the corner.",
        featured: false,
    },
    {
        file: "super-confirm-one-key.png",
        aspectRatio: "55 / 62",
        title: "The destructive-action gate, one key",
        configuration: "cropped to the reset-settings confirmation dialog",
        alt: "The same confirmation with one of its two key switches turned on, which is still not enough to arm the slider.",
        featured: false,
    },
    {
        file: "super-confirm-armed.png",
        aspectRatio: "55 / 62",
        title: "The destructive-action gate, armed",
        configuration: "cropped to the reset-settings confirmation dialog",
        alt: "The same confirmation with both key switches on and the slider armed, one full drag away from resetting every viewer setting, with the emergency exit still available.",
        featured: false,
    },
];

function imageUrl(file: string): string | null {
    for (const [path, url] of Object.entries(imageModules)) {
        if (path.endsWith(`/${file}`)) return url;
    }
    return null;
}

function toCapture(record: CaptureRecord): RepoCapture | null {
    const url = imageUrl(record.file);
    if (url === null) return null;
    return {
        file: record.file,
        url,
        title: record.title,
        configuration: record.configuration,
        alt: record.alt,
        aspectRatio: record.aspectRatio,
    };
}

/** Every committed capture whose image actually resolved, in reading order. */
export const repoCaptures: readonly RepoCapture[] = RECORDS.map(toCapture).filter(
    (capture): capture is RepoCapture => capture !== null
);

/** The subset the landing page shows. The lead capture is the first of them. */
export const featuredCaptures: readonly RepoCapture[] = RECORDS.filter((record) => record.featured)
    .map(toCapture)
    .filter((capture): capture is RepoCapture => capture !== null);

function manifestString(key: string, fallback: string): string {
    const manifest = Object.values(manifestModules)[0];
    if (typeof manifest !== "object" || manifest === null) return fallback;
    const value = (manifest as Record<string, unknown>)[key];
    return typeof value === "string" && value.length > 0 ? value : fallback;
}

/**
 * How the set was produced.
 *
 * Every field falls back to a stated value rather than to an empty string, so a manifest
 * that loses a key produces a caption that is still true rather than one with a hole in it.
 */
export const captureProvenance: CaptureProvenance = {
    capturedBy: manifestString("capturedBy", "design/packages/app/test/screenshots.spec.ts"),
    method: manifestString("method", "Playwright driving the real Electron application"),
    commit: manifestString("commit", "not recorded in the manifest"),
    run: manifestString("run", "not recorded in the manifest"),
    directory: { label: CAPTURE_DIRECTORY, href: repoFile(CAPTURE_DIRECTORY) },
};
