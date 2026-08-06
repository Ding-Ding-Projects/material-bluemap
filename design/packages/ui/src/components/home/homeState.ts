/**
 * The one thing Home remembers about itself: whether the newcomer explanation is collapsed.
 *
 * Modelled on `tutorial/tutorialController.ts`'s `tutorialOffered`/`markTutorialOffered`
 * pair - a single flag, storage-backed through `setupStorage()` so this file never has to
 * stub `localStorage` under Vitest or degrade by hand in a private-browsing window. Home
 * itself is not "offered" the way the tour is (it is a pinned tab, always there rather than
 * a one-time toast), so there is only the one durable preference: has this person already
 * read the "what is BlueMap" explanation and folded it away.
 *
 * The default is expanded. A newcomer's very first look at Home is exactly the moment the
 * explanation exists for; collapsing it before they have ever seen it would defeat the
 * point. Once they collapse it themselves, that choice survives every later launch until
 * they expand it again - a returning user is not asked to read the same paragraph twice.
 */

import { setupStorage, type SetupStorage } from "../setup/setupPrefs.js";

const INTRO_COLLAPSED_KEY = "material-bluemap.home.introCollapsed";

/** True once the user has folded the explanation away. False - expanded - by default. */
export function homeIntroCollapsed(storage: SetupStorage = setupStorage()): boolean {
    return storage.read(INTRO_COLLAPSED_KEY) === "1";
}

/** Records the user's own choice, so it survives the next launch. */
export function setHomeIntroCollapsed(collapsed: boolean, storage: SetupStorage = setupStorage()): void {
    if (collapsed) storage.write(INTRO_COLLAPSED_KEY, "1");
    else storage.remove(INTRO_COLLAPSED_KEY);
}
