/**
 * The words each section puts on screen, in one place.
 *
 * Not a style choice: the surface's search bar matches against a section's title, its
 * explanation and its current values, and copy that lives only inside a component is
 * copy the search cannot see. Two sections — the Java runtime and the world folder —
 * say most of what they have to say in prose rather than in a field, so a search for
 * "JAVA_HOME" or "world folder" would find nothing at all if the search and the
 * component each held their own copy of it.
 *
 * So the strings are resolved once, from the caller's `t`, and both the component that
 * renders them and the search that matches them read the same function. The `Translate`
 * shape is the one `world/worldFolder.ts` already uses for exactly this reason: a pure
 * function that takes the translator produces text that a Node test can assert on
 * without mounting anything.
 */

import type { DockPlacement } from "./dockPlacement.js";
import type { SettingsSectionAnchor } from "./settingsSections.js";

/** `(key, English fallback) => string`, which is what `useI18n().t` narrows to here. */
export type Translate = (key: string, fallback: string) => string;

export interface SectionCopy {
    readonly title: string;
    readonly description: string;
}

/**
 * Every section, in the order the surface lists them.
 *
 * Consent is first because it is the one a fresh install is most likely to be sent here
 * for, and the world folder is last of the four that a render can point at because it is
 * the one that turns out not to be a setting on this screen at all. GitHub sign-in comes
 * after them: no render stops for the want of it in a way the bridge can describe, so it
 * is reached by opening Settings rather than by following a link out of a failure. Language
 * and tone is last for the same reason, and its description spends its words on the two
 * things somebody is actually surprised by: that the two funny levels are independent
 * settings rather than one, and that the level reaches errors and warnings too.
 */
export function sectionCopy(t: Translate): Readonly<Record<SettingsSectionAnchor, SectionCopy>> {
    return {
        "mojang-download-consent": {
            title: t("settings.consent.title", "Mojang download consent"),
            description: t(
                "settings.consent.description",
                "Whether this app may download Minecraft's own client files, which BlueMap needs for block textures and models. Answered once at first launch; this is where it is changed.",
            ),
        },
        "java-runtime": {
            title: t("settings.java.title", "Java runtime"),
            description: t(
                "settings.java.description",
                "Local rendering runs on BlueMap's own Java engine, so the app needs a Java runtime. It looks at JAVA_HOME, then java on PATH, then the copy it installed for itself.",
            ),
        },
        "map-storage-directory": {
            title: t("settings.storage.title", "Where rendered maps go"),
            description: t(
                "settings.storage.description",
                "The folder every rendered map is written into. It must be a full path from the top of a drive, and it can hold a great many gigabytes of tiles.",
            ),
        },
        "world-folder": {
            title: t("settings.worldFolder.title", "World folder"),
            description: t(
                "settings.worldFolder.description",
                "The Minecraft world a map is rendered from. This is set per map in the map wizard rather than once for the whole app, so there is no folder to change on this screen.",
            ),
        },
        "github-account": {
            title: t("settings.github.title", "GitHub account"),
            description: t(
                "settings.github.description",
                "Signing in lets the app reach worlds in private repositories and download release assets that are not public. Everything public works without it, so this is optional. The token is held by the app itself and never shown on this screen.",
            ),
        },
        "language-and-tone": {
            title: t("settings.language.title", "Language and tone"),
            description: t(
                "settings.language.description",
                "Which language the app speaks, and how playful it is in each one. The two funny levels are separate settings, and the level styles every message including errors and warnings.",
            ),
        },
        "surface-placement": {
            title: t("settings.placement.title", "Where the panels sit"),
            description: t(
                "settings.placement.description",
                "Every panel that docks to an edge remembers its own position: floating, or docked to the left, right, top or bottom. Each one is changed from its own title bar. This is where all of them are put back at once.",
            ),
        },
        "render-memory": {
            title: t("settings.renderMemory.title", "Render memory"),
            description: t(
                "settings.renderMemory.description",
                "How much memory the render process may use, as a JVM heap ceiling. Automatic works out a sensible number from this machine's own memory; Manual lets you set your own.",
            ),
        },
        "updates": {
            title: t("settings.updates.title", "Updates"),
            description: t(
                "settings.updates.description",
                "Whether this build is up to date, when it last checked, and where updates come from. Check for updates by hand from here, and bring back an update banner you dismissed.",
            ),
        },
        "history": {
            title: t("settings.history.title", "Version history"),
            description: t(
                "settings.history.description",
                "Every saved version of your server profiles and your application settings, each one restorable. Restoring is never destructive: what it replaces is recorded first, so it can always be undone.",
            ),
        },
        "diagnostics": {
            title: t("settings.diagnostics.title", "Diagnostics"),
            description: t(
                "settings.diagnostics.description",
                "Why a render or the web server failed to start, worked out from what was actually observed, with no model involved unless a local coding agent is installed and switched on. Every change it makes is shown as a diff and recorded in the version history above, so it can be undone.",
            ),
        },
    };
}

export interface JavaUnsupportedCopy {
    readonly headline: string;
    readonly discoveryOrder: string;
}

/**
 * What the Java section says where it has no main process to ask — a browser tab.
 *
 * Shared with the search so that somebody who reads "JAVA_HOME" on this screen and then
 * types it into the search bar is not told there are no matches.
 */
export function javaUnsupportedCopy(t: Translate): JavaUnsupportedCopy {
    return {
        headline: t(
            "settings.java.unsupported",
            "This build cannot report the Java runtime. Nothing is wrong with your Java — the app has no way to ask about it from this screen yet.",
        ),
        discoveryOrder: t(
            "settings.java.discoveryOrder",
            "When a render starts, the app looks at JAVA_HOME first, then java on PATH, then the copy it installed for itself, and runs each one before trusting it. A render that finds nothing suitable says so, and names every candidate it turned down.",
        ),
    };
}

export interface GitHubSectionCopy {
    readonly unsupported: string;
    readonly whatItIsFor: string;
    readonly signedOut: string;
}

/**
 * The GitHub section's prose, shared with the search for the same reason the Java
 * section's is.
 *
 * `unsupported` is what a host with no preload says — a browser tab has no main process
 * to hold a credential, so there is nothing to sign in *with* and the section says that
 * rather than offering a button that cannot work. `whatItIsFor` is on screen in every
 * state, because "why does a map renderer want my GitHub account" is the first question
 * anybody reasonable asks and the answer is short.
 */
export function githubSectionCopy(t: Translate): GitHubSectionCopy {
    return {
        unsupported: t(
            "settings.github.unsupported",
            "This build cannot sign in to GitHub. Nothing is wrong with your account, and nothing was stored: the sign-in is held by the desktop app, and this build has no way to reach it.",
        ),
        whatItIsFor: t(
            "settings.github.whatFor",
            "Signing in is only needed for private repositories: rendering a world that lives in one, and downloading a release asset that is not public. Public worlds and public releases work signed out.",
        ),
        signedOut: t(
            "settings.github.signedOut",
            "Not signed in. Nothing is stored on this computer, and public repositories still work.",
        ),
    };
}

export interface WorldFolderCopy {
    readonly perMap: string;
    readonly where: string;
}

/**
 * The name of a placement, in one place.
 *
 * Three surfaces render this list - each panel's own chooser, the settings row that lists
 * every panel, and the settings search that has to find the row by the words on it - and
 * three copies of five strings is three chances for the search to be asked for a phrase
 * that is on screen and answer that there are no matches.
 */
export function dockPlacementLabel(t: Translate, placement: DockPlacement): string {
    switch (placement) {
        case "floating":
            return t("dock.placement.floating", "Floating panel");
        case "left":
            return t("dock.placement.left", "Docked to the left");
        case "right":
            return t("dock.placement.right", "Docked to the right");
        case "top":
            return t("dock.placement.top", "Docked to the top");
        case "bottom":
            return t("dock.placement.bottom", "Docked to the bottom");
    }
}

/** What the world-folder section says, shared with the search for the same reason. */
export function worldFolderCopy(t: Translate): WorldFolderCopy {
    return {
        perMap: t(
            "settings.worldFolder.perMap",
            "Each map has its own world folder, so there is no single one to set here. It is chosen on the first step of the map wizard — the one titled World — and stored with that map.",
        ),
        where: t(
            "settings.worldFolder.where",
            "To change it: close this panel, open Set up another map to make a new one, or edit that map's own world setting in the configuration editor. Rendering the same map again from a different folder makes it a different map, which is why it is asked for there rather than here.",
        ),
    };
}
