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

import { BACKUP_FACTS, BACKUP_FIXED, BACKUP_VOICED } from "./backup.js";
import { CHANGELOG_FACTS, CHANGELOG_FIXED, CHANGELOG_VOICED } from "./changelog.js";
import { CHROME_FACTS, CHROME_FIXED, CHROME_VOICED } from "./chrome.js";
import { CIRENDER_FACTS, CIRENDER_FIXED, CIRENDER_VOICED } from "./cirender.js";
import { HISTORY_FACTS, HISTORY_FIXED, HISTORY_VOICED } from "./history.js";
import { PAGES_FACTS, PAGES_FIXED, PAGES_VOICED } from "./pages.js";
import { PROFILES_FACTS, PROFILES_FIXED, PROFILES_VOICED } from "./profiles.js";

export const SURFACE_VOICED = {
    ...CHROME_VOICED,
    ...BACKUP_VOICED,
    ...CHANGELOG_VOICED,
    ...CIRENDER_VOICED,
    ...HISTORY_VOICED,
    ...PAGES_VOICED,
    ...PROFILES_VOICED,
} as const;

export const SURFACE_FIXED = {
    ...CHROME_FIXED,
    ...BACKUP_FIXED,
    ...CHANGELOG_FIXED,
    ...CIRENDER_FIXED,
    ...HISTORY_FIXED,
    ...PAGES_FIXED,
    ...PROFILES_FIXED,
} as const;

export const SURFACE_FACTS = {
    ...CHROME_FACTS,
    ...BACKUP_FACTS,
    ...CHANGELOG_FACTS,
    ...CIRENDER_FACTS,
    ...HISTORY_FACTS,
    ...PAGES_FACTS,
    ...PROFILES_FACTS,
} as const;
