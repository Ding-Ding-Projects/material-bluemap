/**
 * The two things Home remembers about itself: whether the newcomer explanation is
 * collapsed, and which of its secondary sections the user has opened.
 *
 * Modelled on `tutorial/tutorialController.ts`'s `tutorialOffered`/`markTutorialOffered`
 * pair - a flag, storage-backed through `setupStorage()` so this file never has to stub
 * `localStorage` under Vitest or degrade by hand in a private-browsing window. Home itself
 * is not "offered" the way the tour is (it is a pinned tab, always there rather than a
 * one-time toast), so both preferences are of the same kind: has this person already read
 * this, and do they want to keep seeing it.
 *
 * The introduction defaults to expanded. A newcomer's very first look at Home is exactly the
 * moment the explanation exists for; collapsing it before they have ever seen it would
 * defeat the point.
 *
 * The secondary sections default the other way, to collapsed, for the same reason read from
 * the other end: twenty-five cards shown at once is not an inventory a newcomer reads, it is
 * a wall they bounce off. The section headings stay on screen and say how many cards each
 * one holds, so nothing is hidden without being named, and opening one is one click that is
 * then remembered for good. Neither default is ever re-applied over a choice somebody made:
 * whatever they open or fold away survives every later launch.
 *
 * ## Why the expanded set is stored rather than the collapsed set
 *
 * The stored record is the list of sections the user has explicitly opened, so an install
 * that has never been touched stores nothing at all, and a section this build adds tomorrow
 * starts collapsed like every other one rather than inheriting a stale "not in the collapsed
 * list, so open it" answer from a record written before it existed.
 */

import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";
import { setupStorage, type SetupStorage } from "../setup/setupPrefs.js";

const INTRO_COLLAPSED_KEY = "worldlens.home.introCollapsed";
const EXPANDED_SECTIONS_KEY = "worldlens.home.expandedSections";

/**
 * Mirrors both preferences into the shared application-settings history, under the one
 * `home` key this surface is known by in that bag - see `stores/appSettingsHistorySync.ts`
 * for why the mirror merges rather than replaces, and why a failure here is swallowed.
 * `localStorage` above stays the source of truth; this is the backup copy of it.
 */
function mirrorHomePreferences(storage: SetupStorage): void {
    recordAppSetting("home", {
        introCollapsed: homeIntroCollapsed(storage),
        expandedSections: homeExpandedSections(storage),
    });
}

/** True once the user has folded the explanation away. False - expanded - by default. */
export function homeIntroCollapsed(storage: SetupStorage = setupStorage()): boolean {
    return storage.read(INTRO_COLLAPSED_KEY) === "1";
}

/** Records the user's own choice, so it survives the next launch. */
export function setHomeIntroCollapsed(collapsed: boolean, storage: SetupStorage = setupStorage()): void {
    if (collapsed) storage.write(INTRO_COLLAPSED_KEY, "1");
    else storage.remove(INTRO_COLLAPSED_KEY);
    mirrorHomePreferences(storage);
}

/**
 * Every section id the user has opened, in the order they were opened. Empty on a fresh
 * install, which is what makes the default view short.
 */
export function homeExpandedSections(storage: SetupStorage = setupStorage()): readonly string[] {
    const raw = storage.read(EXPANDED_SECTIONS_KEY);
    if (raw === null) return [];
    const ids = raw
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    return [...new Set(ids)];
}

/** Whether one section is open, by its stable id rather than by its translated heading. */
export function homeSectionExpanded(id: string, storage: SetupStorage = setupStorage()): boolean {
    return homeExpandedSections(storage).includes(id);
}

/**
 * Records one section's open/closed state. Writing the record away entirely once the last
 * section is closed keeps a fresh install and a deliberately-tidied one indistinguishable,
 * the same way `setHomeIntroCollapsed` removes rather than writes a second falsy value.
 */
export function setHomeSectionExpanded(
    id: string,
    expanded: boolean,
    storage: SetupStorage = setupStorage(),
): void {
    const next = new Set(homeExpandedSections(storage));
    if (expanded) next.add(id);
    else next.delete(id);

    if (next.size === 0) storage.remove(EXPANDED_SECTIONS_KEY);
    else storage.write(EXPANDED_SECTIONS_KEY, [...next].join(","));
    mirrorHomePreferences(storage);
}
