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

import { ACCOUNTS_FACTS, ACCOUNTS_FIXED, ACCOUNTS_VOICED } from "./accounts.js";
import { APPEARANCE_FACTS, APPEARANCE_FIXED, APPEARANCE_VOICED } from "./appearance.js";
import { BACKUP_FACTS, BACKUP_FIXED, BACKUP_VOICED } from "./backup.js";
import { CHANGELOG_FACTS, CHANGELOG_FIXED, CHANGELOG_VOICED } from "./changelog.js";
import { CHROME_FACTS, CHROME_FIXED, CHROME_VOICED } from "./chrome.js";
import { CIRENDER_FACTS, CIRENDER_FIXED, CIRENDER_VOICED } from "./cirender.js";
import { CONFIGEDITOR_FACTS, CONFIGEDITOR_FIXED, CONFIGEDITOR_VOICED } from "./configEditor.js";
import { CONFIGEXPLAIN_FACTS, CONFIGEXPLAIN_FIXED, CONFIGEXPLAIN_VOICED } from "./configExplain.js";
import { CONFIGFILES_FACTS, CONFIGFILES_FIXED, CONFIGFILES_VOICED } from "./configFiles.js";
import { CONSOLE_FACTS, CONSOLE_FIXED, CONSOLE_VOICED } from "./console.js";
import { DEPENDENCIES_FACTS, DEPENDENCIES_FIXED, DEPENDENCIES_VOICED } from "./dependencies.js";
import { DOCSVIEWER_FACTS, DOCSVIEWER_FIXED, DOCSVIEWER_VOICED } from "./docsViewer.js";
import { DOWNLOADS_FACTS, DOWNLOADS_FIXED, DOWNLOADS_VOICED } from "./downloads.js";
import { GHCLIACCOUNTS_FACTS, GHCLIACCOUNTS_FIXED, GHCLIACCOUNTS_VOICED } from "./ghCliAccounts.js";
import { GITHUB_FACTS, GITHUB_FIXED, GITHUB_VOICED } from "./github.js";
import { GLOSSARY_FACTS, GLOSSARY_FIXED, GLOSSARY_VOICED } from "./glossary.js";
import { HISTORY_FACTS, HISTORY_FIXED, HISTORY_VOICED } from "./history.js";
import { HOME_FACTS, HOME_FIXED, HOME_VOICED } from "./home.js";
import { HOSTING_FACTS, HOSTING_FIXED, HOSTING_VOICED } from "./hosting.js";
import { MARKERREGEX_FACTS, MARKERREGEX_FIXED, MARKERREGEX_VOICED } from "./markerRegex.js";
import { MENU_FACTS, MENU_FIXED, MENU_VOICED } from "./menu.js";
import { MENUSEARCH_FACTS, MENUSEARCH_FIXED, MENUSEARCH_VOICED } from "./menuSearch.js";
import { NOTIFICATIONSBULK_FACTS, NOTIFICATIONSBULK_FIXED, NOTIFICATIONSBULK_VOICED } from "./notificationsBulk.js";
import { PAGES_FACTS, PAGES_FIXED, PAGES_VOICED } from "./pages.js";
import { PALETTE_FACTS, PALETTE_FIXED, PALETTE_VOICED } from "./palette.js";
import { PANELS_FACTS, PANELS_FIXED, PANELS_VOICED } from "./panels.js";
import { PATHFIELD_FACTS, PATHFIELD_FIXED, PATHFIELD_VOICED } from "./pathField.js";
import { PRESETS_FACTS, PRESETS_FIXED, PRESETS_VOICED } from "./presets.js";
import { PROFILES_FACTS, PROFILES_FIXED, PROFILES_VOICED } from "./profiles.js";
import { PROJECT_FACTS, PROJECT_FIXED, PROJECT_VOICED } from "./project.js";
import { REPAIR_FACTS, REPAIR_FIXED, REPAIR_VOICED } from "./repair.js";
import { REMOTE_FACTS, REMOTE_FIXED, REMOTE_VOICED } from "./remote.js";
import { SETTINGS_FACTS, SETTINGS_FIXED, SETTINGS_VOICED } from "./settings.js";
import { SPEED_FACTS, SPEED_FIXED, SPEED_VOICED } from "./speed.js";
import { TABGROUPPICKER_FACTS, TABGROUPPICKER_FIXED, TABGROUPPICKER_VOICED } from "./tabGroupPicker.js";
import { TABS_FACTS, TABS_FIXED, TABS_VOICED } from "./tabs.js";
import { TUTORIAL_FACTS, TUTORIAL_FIXED, TUTORIAL_VOICED } from "./tutorial.js";
import { WORLD_FACTS, WORLD_FIXED, WORLD_VOICED } from "./world.js";

export const SURFACE_VOICED = {
    ...CHROME_VOICED,
    ...ACCOUNTS_VOICED,
    ...APPEARANCE_VOICED,
    ...BACKUP_VOICED,
    ...CHANGELOG_VOICED,
    ...CIRENDER_VOICED,
    ...CONFIGEDITOR_VOICED,
    ...CONFIGEXPLAIN_VOICED,
    ...CONFIGFILES_VOICED,
    ...CONSOLE_VOICED,
    ...DEPENDENCIES_VOICED,
    ...DOCSVIEWER_VOICED,
    ...DOWNLOADS_VOICED,
    ...GHCLIACCOUNTS_VOICED,
    ...GITHUB_VOICED,
    ...GLOSSARY_VOICED,
    ...HISTORY_VOICED,
    ...HOME_VOICED,
    ...HOSTING_VOICED,
    ...MARKERREGEX_VOICED,
    ...MENU_VOICED,
    ...MENUSEARCH_VOICED,
    ...NOTIFICATIONSBULK_VOICED,
    ...PAGES_VOICED,
    ...PALETTE_VOICED,
    ...PANELS_VOICED,
    ...PATHFIELD_VOICED,
    ...PRESETS_VOICED,
    ...PROFILES_VOICED,
    ...PROJECT_VOICED,
    ...REPAIR_VOICED,
    ...REMOTE_VOICED,
    ...SETTINGS_VOICED,
    ...SPEED_VOICED,
    ...TABGROUPPICKER_VOICED,
    ...TABS_VOICED,
    ...TUTORIAL_VOICED,
    ...WORLD_VOICED,
} as const;

export const SURFACE_FIXED = {
    ...CHROME_FIXED,
    ...ACCOUNTS_FIXED,
    ...APPEARANCE_FIXED,
    ...BACKUP_FIXED,
    ...CHANGELOG_FIXED,
    ...CIRENDER_FIXED,
    ...CONFIGEDITOR_FIXED,
    ...CONFIGEXPLAIN_FIXED,
    ...CONFIGFILES_FIXED,
    ...CONSOLE_FIXED,
    ...DEPENDENCIES_FIXED,
    ...DOCSVIEWER_FIXED,
    ...DOWNLOADS_FIXED,
    ...GHCLIACCOUNTS_FIXED,
    ...GITHUB_FIXED,
    ...GLOSSARY_FIXED,
    ...HISTORY_FIXED,
    ...HOME_FIXED,
    ...HOSTING_FIXED,
    ...MARKERREGEX_FIXED,
    ...MENU_FIXED,
    ...MENUSEARCH_FIXED,
    ...NOTIFICATIONSBULK_FIXED,
    ...PAGES_FIXED,
    ...PALETTE_FIXED,
    ...PANELS_FIXED,
    ...PATHFIELD_FIXED,
    ...PRESETS_FIXED,
    ...PROFILES_FIXED,
    ...PROJECT_FIXED,
    ...REPAIR_FIXED,
    ...REMOTE_FIXED,
    ...SETTINGS_FIXED,
    ...SPEED_FIXED,
    ...TABGROUPPICKER_FIXED,
    ...TABS_FIXED,
    ...TUTORIAL_FIXED,
    ...WORLD_FIXED,
} as const;

export const SURFACE_FACTS = {
    ...CHROME_FACTS,
    ...ACCOUNTS_FACTS,
    ...APPEARANCE_FACTS,
    ...BACKUP_FACTS,
    ...CHANGELOG_FACTS,
    ...CIRENDER_FACTS,
    ...CONFIGEDITOR_FACTS,
    ...CONFIGEXPLAIN_FACTS,
    ...CONFIGFILES_FACTS,
    ...CONSOLE_FACTS,
    ...DEPENDENCIES_FACTS,
    ...DOCSVIEWER_FACTS,
    ...DOWNLOADS_FACTS,
    ...GHCLIACCOUNTS_FACTS,
    ...GITHUB_FACTS,
    ...GLOSSARY_FACTS,
    ...HISTORY_FACTS,
    ...HOME_FACTS,
    ...HOSTING_FACTS,
    ...MARKERREGEX_FACTS,
    ...MENU_FACTS,
    ...MENUSEARCH_FACTS,
    ...NOTIFICATIONSBULK_FACTS,
    ...PAGES_FACTS,
    ...PALETTE_FACTS,
    ...PANELS_FACTS,
    ...PATHFIELD_FACTS,
    ...PRESETS_FACTS,
    ...PROFILES_FACTS,
    ...PROJECT_FACTS,
    ...REPAIR_FACTS,
    ...REMOTE_FACTS,
    ...SETTINGS_FACTS,
    ...SPEED_FACTS,
    ...TABGROUPPICKER_FACTS,
    ...TABS_FACTS,
    ...TUTORIAL_FACTS,
    ...WORLD_FACTS,
} as const;
