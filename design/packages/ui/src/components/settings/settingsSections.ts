/**
 * The four settings a failed render can point at, every section this surface renders,
 * and how the surface's own search finds them.
 *
 * The anchor list is not a convenience: it is the contract `SettingsTarget.anchor`
 * carries across the bridge from the main process. A render that stops because there is
 * no Java, or because the download licence was never accepted, reports which setting
 * would fix it, and the shell opens this surface at exactly that anchor. So the strings
 * here and the strings in `world/worldBridge.ts` and in the preload are the same four
 * words, and {@link isSettingsAnchor} is what keeps a value that came from outside this
 * package from being trusted as one of them.
 *
 * **The surface shows more than those four.** GitHub sign-in lives here too, and so does
 * the language mode with its two funny levels, and nothing in the main process can send
 * somebody to either: no render stops for the want of a GitHub account or a funny level in
 * a way a `SettingsTarget` describes. Adding them to the bridge contract to make one list
 * would be widening a contract to fit a layout; so the two lists are separate and
 * {@link SETTINGS_SECTIONS} is the superset the surface actually renders, with the
 * render-reachable four still their own closed set.
 *
 * Searching is done over the text a section actually renders — its title, its
 * explanation and its current values — rather than over a hand-written keyword list. A
 * keyword list is a second thing to keep in step with the interface, and it is always
 * the one nobody updates, so somebody who can see a path on screen searches for it and
 * is told there are no matches.
 */

import type { SettingMatcher } from "../config/regexEngine.js";

export const SETTINGS_ANCHORS = [
    "mojang-download-consent",
    "java-runtime",
    "map-storage-directory",
    "world-folder",
] as const;

/**
 * A setting this surface can be opened at.
 *
 * Structurally identical to `SettingsTarget["anchor"]` in `world/worldBridge.ts`, and
 * deliberately declared here rather than imported from it: the shell imports this type
 * to hold the anchor it was asked for, and a settings surface that could not be typed
 * without the render flow would be a settings surface that cannot be mounted without it.
 */
export type SettingsAnchor = (typeof SETTINGS_ANCHORS)[number];

/**
 * Every section on the surface, in the order it lists them.
 *
 * The four render-reachable anchors first, because those are the ones somebody arrives
 * at from a failure and expects to be looking straight at, then the sections that are
 * only ever reached by opening Settings and reading.
 *
 * Language and tone is here because before it was there was nowhere else: the mode and the
 * two funny levels were asked once during first-run setup and then had no home at all,
 * which is a setting being asked rather than a setting being configurable. It is
 * deliberately not an anchor, for the same reason GitHub sign-in is not one — a render does
 * not stop for the want of a funny level, so nothing on the bridge could honestly point at
 * it.
 *
 * Where the panels sit is next, and is a setting about this surface as much as about any
 * other: every docked panel remembers its own placement, and the one control that resets
 * all of them at once has to live somewhere a person can find it when they have moved a
 * panel somewhere they now regret. That is what this section is.
 *
 * Render memory is next: the `-Xmx` ceiling a render's JVM may use, per
 * `main/files/renderMemory.ts`. Not an anchor for a subtler reason than the two above it —
 * a render that runs out of heap fails with an `OutOfMemoryError` the engine reports as an
 * ordinary render failure rather than as a typed `SettingsTarget`, so there is no failure
 * shape today that could honestly point here. It sits beside surface placement because
 * both are "the app already picked something sensible; here is where you'd change it".
 *
 * Notification duration is next: how long an informational or success toast stays on
 * screen before it dismisses itself, per `components/config/notifications.ts`. Also not an
 * anchor, and for a plainer reason than render memory's - no render outcome has anything
 * to do with a toast's own timing at all, so no failure of any shape could honestly point
 * here. A shell-wide preference, not a per-render one, so it sits with the other two
 * "the app already behaves reasonably; here is where you would change that" rows above it.
 *
 * Download concurrency is next: how many release-asset parts a download fetches at once,
 * per `main/files/downloadConcurrency.ts`. Not an anchor either, and for the same reason
 * notification duration is not one - a slow or contended download reports as a download
 * failure or simply as slowness, neither of which is a typed `SettingsTarget` a render or a
 * download could honestly point here from. It sits beside the other two "already sensible,
 * here is where you'd change it" rows for the same reason they sit together.
 *
 * System dependencies is next: installing git, the GitHub CLI, Docker Desktop and rsync
 * through winget/Chocolatey, per `main/sysdeps/`. Not an anchor for the same reason
 * download concurrency is not one — a render or a world source that needs one of these
 * missing reports that failure in its own words, not as a typed `SettingsTarget` this
 * screen could honestly point here from. It sits beside download concurrency because both
 * are "here is a real system capability, and here is exactly what installing it costs" —
 * this one costs an administrator-permission prompt for most of what it installs, and the
 * section says so before the one button here is pressed, never after.
 *
 * Updates is next for the same reason GitHub sign-in and language-and-tone are not
 * anchors: no render stops for the want of an update, so nothing in the bridge's
 * `SettingsTarget` could honestly point at it. It is the one place the installed version,
 * the last check, the feed and a manual "Check for updates" are always reachable rather
 * than only appearing as a banner when there happens to be one to show.
 *
 * History is next to last: the server-profile list's and the application settings' own
 * version histories, per `main/profiles/ipc.ts` and `main/settings/ipc.ts`. No render
 * stops for the want of an old profile either, so this is reached the same way updates is —
 * by opening Settings — and it is where a profile or a setting deleted by mistake is put
 * back, the same "browse a list, restore one" shape the config folder's own history panel
 * already uses.
 *
 * Diagnostics is last of all: why a render or the web server failed to start, per
 * `main/repair/index.ts` and `docs/automatic-repair.md`. No render stops for the want of a
 * diagnosis either - a failure that could point somewhere would point at the setting that
 * actually fixes it, one of the four anchors above - so this is where the deterministic
 * diagnosis and the guardrailed local-agent repair for whatever it left unexplained are
 * both reached.
 */
export const SETTINGS_SECTIONS = [
    ...SETTINGS_ANCHORS,
    "github-account",
    "language-and-tone",
    "surface-placement",
    "render-memory",
    "notification-duration",
    "download-concurrency",
    "system-dependencies",
    "updates",
    "history",
    "diagnostics",
] as const;

/** A section this surface renders, whether or not a render can send somebody to it. */
export type SettingsSectionAnchor = (typeof SETTINGS_SECTIONS)[number];

/** True for one of the four anchors, for a value that arrived from outside this package. */
export function isSettingsAnchor(value: unknown): value is SettingsAnchor {
    return typeof value === "string" && (SETTINGS_ANCHORS as readonly string[]).includes(value);
}

/** True for any section the surface renders, including the ones no render points at. */
export function isSettingsSection(value: unknown): value is SettingsSectionAnchor {
    return typeof value === "string" && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/**
 * Everything one section puts on screen, flattened for the search bar.
 *
 * `values` is the part that moves: the path in the storage field, the Java the app
 * found, the consent answer as it currently stands. It is passed in from the live
 * controllers rather than snapshotted here, so a search for a path finds the section
 * showing that path and not the section that showed it when the surface opened.
 */
export interface SettingsSectionText {
    readonly anchor: SettingsSectionAnchor;
    readonly title: string;
    readonly description: string;
    /** Current values and any other text the section renders. */
    readonly values: readonly string[];
}

/** One string per section, which is what a query is tested against. */
export function sectionHaystack(section: SettingsSectionText): string {
    return [section.anchor, section.title, section.description, ...section.values]
        .filter((part) => part.trim().length > 0)
        .join("\n");
}

/**
 * The anchors a query leaves showing, in the order the surface lists them.
 *
 * An inactive matcher matches everything, which is what an empty search bar means. An
 * invalid pattern matches nothing — `createSettingMatcher` already decides that — rather
 * than silently falling back to the last pattern that compiled, which would show results
 * for a search that is no longer on screen.
 */
export function filterSections(
    sections: readonly SettingsSectionText[],
    matcher: SettingMatcher,
): SettingsSectionAnchor[] {
    if (!matcher.active) return sections.map((section) => section.anchor);
    return sections
        .filter((section) => matcher.test(sectionHaystack(section)))
        .map((section) => section.anchor);
}

/**
 * Real text for the regex builder's preview, one section per line.
 *
 * The builder is only worth opening if what it scans is what the search will scan, so
 * this is the same text {@link filterSections} tests, newlines flattened to spaces so
 * one section stays one candidate line.
 */
export function sectionSample(sections: readonly SettingsSectionText[]): string {
    return sections
        .map((section) => sectionHaystack(section).replace(/\s+/g, " ").trim())
        .join("\n");
}
