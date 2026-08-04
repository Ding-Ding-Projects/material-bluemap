/**
 * The per-surface catalogue modules, collected.
 *
 * `appCopy.ts` spreads these three objects into `APP_VOICED`, `APP_FIXED` and `FACTS`. The
 * split exists for two reasons that are both about the file being edited rather than about
 * the words in it:
 *
 *  - the catalogue has to reach roughly two thousand keys, and one object literal that
 *    large is a single merge conflict waiting for the second person to touch it;
 *  - a surface is the unit the copy is actually reviewed in. Reading every string the
 *    history panel says, in order, is how you notice that two of them disagree about what
 *    "restore" means. Reading them scattered through an alphabetical two-thousand-entry map
 *    is how you do not.
 *
 * A module exports exactly three consts, named `<SURFACE>_VOICED`, `<SURFACE>_FIXED` and
 * `<SURFACE>_FACTS`, each `as const`, with the facts object `satisfies` the module's own
 * voiced keys so a new entry cannot be added without a fact to guard it.
 */

import { CHANGELOG_FACTS, CHANGELOG_FIXED, CHANGELOG_VOICED } from "./changelog.js";
import { CHROME_FACTS, CHROME_FIXED, CHROME_VOICED } from "./chrome.js";

export const SURFACE_VOICED = {
    ...CHROME_VOICED,
    ...CHANGELOG_VOICED,
} as const;

export const SURFACE_FIXED = {
    ...CHROME_FIXED,
    ...CHANGELOG_FIXED,
} as const;

export const SURFACE_FACTS = {
    ...CHROME_FACTS,
    ...CHANGELOG_FACTS,
} as const;
