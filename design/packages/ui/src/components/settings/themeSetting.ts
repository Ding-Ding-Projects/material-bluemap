/**
 * The theme choice - follow the system, dark, light, or the high-contrast scheme -
 * reachable without a map.
 *
 * The viewer has always offered this, in its own settings menu, and that menu only
 * exists while a map is open: `SettingsMenu.vue` writes `app.appState.theme` and the
 * viewer persists it through `saveUserSettings()`. Somebody who has not rendered
 * anything yet - the exact person most likely to be setting the app up to their eyes -
 * had no theme control at all. This module gives the settings surface the same choice
 * against the same stored record, so the two controls can never disagree about what was
 * chosen.
 *
 * ## One record, two writers, one precedence rule
 *
 * The stored record is the viewer's own `bluemap-theme` localStorage entry, written
 * through the same JSON encoding `BlueMapApp.saveUserSetting` uses. While a viewer app
 * is live, its `appState.theme` is authoritative - it loaded that same record at
 * startup, and the in-map menu writes it - so this module's setter routes through
 * `app.setTheme()` and lets the viewer persist as it always has. With no app running,
 * the setter writes the record directly, and the next app to be created reads it back
 * through its own `loadUserSettings()`. `useBlueMapTheme` reads {@link currentTheme},
 * which resolves the same precedence, so the Vuetify chrome follows whichever writer
 * spoke last.
 *
 * `null` is a real choice, not an absence: it means "follow the system", exactly as it
 * does in the viewer.
 */

import { computed, ref, watch } from "vue";
import type { ComputedRef } from "vue";
import { blueMapApp } from "../../stores/bluemap.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

/** Upstream's own value set: null follows the system. */
export type ThemeChoice = "dark" | "light" | "contrast" | null;

/** Every choice, in the order the row lists them. */
export const THEME_CHOICES: readonly ThemeChoice[] = [null, "dark", "light", "contrast"];

/**
 * The viewer's own storage key, spelled the way `BlueMapApp.saveUserSetting` spells it:
 * `"bluemap-" + key`, value JSON-encoded. Written here byte-compatibly so the viewer's
 * `loadUserSettings()` reads a choice made on this screen exactly as it reads its own.
 */
export const THEME_STORAGE_KEY = "bluemap-theme";

function isThemeChoice(value: unknown): value is ThemeChoice {
    return value === null || value === "dark" || value === "light" || value === "contrast";
}

/** The stored choice, or "follow the system" when there is none or it does not parse. */
export function readStoredTheme(): ThemeChoice {
    try {
        const raw = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
        if (raw === null || raw === undefined) return null;
        const parsed: unknown = JSON.parse(raw);
        return isThemeChoice(parsed) ? parsed : null;
    } catch {
        // A blocked store or a value that is not JSON both mean the same thing here:
        // no usable stored choice, so follow the system.
        return null;
    }
}

/** Writes the choice in the viewer's own encoding, degrading silently where storage is blocked. */
function writeStoredTheme(choice: ThemeChoice): void {
    try {
        globalThis.localStorage?.setItem(THEME_STORAGE_KEY, JSON.stringify(choice));
    } catch {
        // Private mode or a full quota. The choice still applies to this session.
    }
}

/**
 * The choice as this shell last saw it, used only while no viewer app is running.
 *
 * A module-level ref for the same reason `uiSizeSetting.ts`'s readout is one: there is
 * exactly one theme, and the settings row and the Vuetify theme bridge must be reading
 * the same value or one of them is lying.
 */
const storedTheme = ref<ThemeChoice>(readStoredTheme());

/**
 * The one resolved answer to "what theme was chosen": the live app's while there is
 * one, the stored record's otherwise.
 */
export const currentTheme: ComputedRef<ThemeChoice> = computed(() => {
    const app = blueMapApp.value;
    if (app !== null) {
        const selected = app.appState.theme;
        return isThemeChoice(selected) ? selected : null;
    }
    return storedTheme.value;
});

/**
 * Keeps the two writers convergent, in both directions, for the life of the page.
 *
 * A module-level watcher rather than one per component, because it must run even while
 * no settings surface is mounted; it lives as long as the store it watches, exactly like
 * that store itself.
 *
 * **A new viewer app gets the stored choice pushed into it.** The viewer only loads its
 * own persisted settings when the map's `settings.json` opts into `useCookies`, and the
 * fallback when a map ships no such file is `false` - so a freshly opened local map can
 * start at `theme: null` in the face of a stored "dark", and the whole window would snap
 * to the system scheme the moment a map loaded. Pushing is convergent rather than a
 * second opinion: where the viewer *does* load its settings, it reads the very record
 * this module writes, so both writers arrive at the same value in either order.
 *
 * **A change inside the same app is mirrored back out.** The in-map settings menu writes
 * `appState.theme`; mirroring it into {@link storedTheme} (and the stored record, which
 * the viewer only persists itself behind that same `useCookies` gate) is what keeps the
 * choice after the app is torn down on a profile switch, instead of snapping back to
 * whatever the record held when this module first loaded.
 */
let syncedApp: unknown = null;

watch(
    () => [blueMapApp.value, blueMapApp.value?.appState.theme] as const,
    ([app, selected]) => {
        if (app === null) {
            syncedApp = null;
            return;
        }

        if (app !== syncedApp) {
            syncedApp = app;
            const loaded = isThemeChoice(selected) ? selected : null;
            if (loaded !== storedTheme.value) app.setTheme(storedTheme.value);
            return;
        }

        if (selected === undefined) return;
        const chosen = isThemeChoice(selected) ? selected : null;
        if (chosen !== storedTheme.value) {
            storedTheme.value = chosen;
            writeStoredTheme(chosen);
        }
    },
);

/**
 * Changes the theme: through the live app where there is one - which repaints the map's
 * own marker chrome and persists through the viewer's own path - and straight to the
 * stored record otherwise. Either way the choice is mirrored into the settings history
 * bag under `theme`, fire-and-forget like every other key `recordAppSetting` carries.
 */
export function changeTheme(choice: ThemeChoice): void {
    storedTheme.value = choice;
    writeStoredTheme(choice);

    const app = blueMapApp.value;
    if (app !== null && app.appState.theme !== choice) {
        app.setTheme(choice);
    }

    recordAppSetting("theme", choice);
}
