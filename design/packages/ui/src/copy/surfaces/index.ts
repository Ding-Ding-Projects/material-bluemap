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

import { APPEARANCE_FACTS, APPEARANCE_FIXED, APPEARANCE_VOICED } from "./appearance.js";
import { BACKUP_FACTS, BACKUP_FIXED, BACKUP_VOICED } from "./backup.js";
import { CHANGELOG_FACTS, CHANGELOG_FIXED, CHANGELOG_VOICED } from "./changelog.js";
import { CHROME_FACTS, CHROME_FIXED, CHROME_VOICED } from "./chrome.js";
import { CIRENDER_FACTS, CIRENDER_FIXED, CIRENDER_VOICED } from "./cirender.js";
import { CONFIGEDITOR_FACTS, CONFIGEDITOR_FIXED, CONFIGEDITOR_VOICED } from "./configEditor.js";
import { CONFIGFILES_FACTS, CONFIGFILES_FIXED, CONFIGFILES_VOICED } from "./configFiles.js";
import { CONSOLE_FACTS, CONSOLE_FIXED, CONSOLE_VOICED } from "./console.js";
import { DOWNLOADS_FACTS, DOWNLOADS_FIXED, DOWNLOADS_VOICED } from "./downloads.js";
import { GITHUB_FACTS, GITHUB_FIXED, GITHUB_VOICED } from "./github.js";
import { HISTORY_FACTS, HISTORY_FIXED, HISTORY_VOICED } from "./history.js";
import { MENU_FACTS, MENU_FIXED, MENU_VOICED } from "./menu.js";
import { PAGES_FACTS, PAGES_FIXED, PAGES_VOICED } from "./pages.js";
import { PROFILES_FACTS, PROFILES_FIXED, PROFILES_VOICED } from "./profiles.js";
import { PROJECT_FACTS, PROJECT_FIXED, PROJECT_VOICED } from "./project.js";
import { REMOTE_FACTS, REMOTE_FIXED, REMOTE_VOICED } from "./remote.js";
import { SETTINGS_FACTS, SETTINGS_FIXED, SETTINGS_VOICED } from "./settings.js";
import { TABS_FACTS, TABS_FIXED, TABS_VOICED } from "./tabs.js";

export const SURFACE_VOICED = {
    ...CHROME_VOICED,
    ...APPEARANCE_VOICED,
    ...BACKUP_VOICED,
    ...CHANGELOG_VOICED,
    ...CIRENDER_VOICED,
    ...CONFIGEDITOR_VOICED,
    ...CONFIGFILES_VOICED,
    ...CONSOLE_VOICED,
    ...DOWNLOADS_VOICED,
    ...GITHUB_VOICED,
    ...HISTORY_VOICED,
    ...MENU_VOICED,
    ...PAGES_VOICED,
    ...PROFILES_VOICED,
    ...PROJECT_VOICED,
    ...REMOTE_VOICED,
    ...SETTINGS_VOICED,
    ...TABS_VOICED,
} as const;

export const SURFACE_FIXED = {
    ...CHROME_FIXED,
    ...APPEARANCE_FIXED,
    ...BACKUP_FIXED,
    ...CHANGELOG_FIXED,
    ...CIRENDER_FIXED,
    ...CONFIGEDITOR_FIXED,
    ...CONFIGFILES_FIXED,
    ...CONSOLE_FIXED,
    ...DOWNLOADS_FIXED,
    ...GITHUB_FIXED,
    ...HISTORY_FIXED,
    ...MENU_FIXED,
    ...PAGES_FIXED,
    ...PROFILES_FIXED,
    ...PROJECT_FIXED,
    ...REMOTE_FIXED,
    ...SETTINGS_FIXED,
    ...TABS_FIXED,
} as const;

export const SURFACE_FACTS = {
    ...CHROME_FACTS,
    ...APPEARANCE_FACTS,
    ...BACKUP_FACTS,
    ...CHANGELOG_FACTS,
    ...CIRENDER_FACTS,
    ...CONFIGEDITOR_FACTS,
    ...CONFIGFILES_FACTS,
    ...CONSOLE_FACTS,
    ...DOWNLOADS_FACTS,
    ...GITHUB_FACTS,
    ...HISTORY_FACTS,
    ...MENU_FACTS,
    ...PAGES_FACTS,
    ...PROFILES_FACTS,
    ...PROJECT_FACTS,
    ...REMOTE_FACTS,
    ...SETTINGS_FACTS,
    ...TABS_FACTS,
} as const;
