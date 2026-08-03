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

import type { SettingsAnchor } from "./settingsSections.js";

/** `(key, English fallback) => string`, which is what `useI18n().t` narrows to here. */
export type Translate = (key: string, fallback: string) => string;

export interface SectionCopy {
    readonly title: string;
    readonly description: string;
}

/**
 * The four sections, in the order the surface lists them.
 *
 * Consent is first because it is the one a fresh install is most likely to be sent here
 * for, and the world folder is last because it is the one that turns out not to be a
 * setting on this screen at all.
 */
export function sectionCopy(t: Translate): Readonly<Record<SettingsAnchor, SectionCopy>> {
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

export interface WorldFolderCopy {
    readonly perMap: string;
    readonly where: string;
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
