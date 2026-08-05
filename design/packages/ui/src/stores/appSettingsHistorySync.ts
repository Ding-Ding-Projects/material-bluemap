/**
 * Mirroring one settings surface's own preference into the main process's shared
 * application-settings history.
 *
 * `main/settings/store.ts` holds every wired surface's current value in one flat `values`
 * bag, keyed by whatever name the surface gives itself - see that file's own doc comment.
 * `writeAppSettingsState` replaces the whole file with whatever it is handed, so a surface
 * that saved only its own key would silently erase every other surface's already-recorded
 * value the next time this ran. {@link recordAppSetting} exists specifically to not do
 * that: it reads the bag that is there now, merges this one key into it, and saves the
 * merge - never the surface's own value alone.
 *
 * ## Fire-and-forget, exactly like `stores/profiles.ts`'s own mirror
 *
 * `localStorage` stays each surface's real source of truth for this task - see
 * `docs/config-history.md`'s own staged migration plan, which this file is step 2 of and
 * step 3 (reading the history back as the source of truth) deliberately does not attempt.
 * A history write that fails, or a build with no bridge at all (a browser tab, most tests),
 * must never turn a settings change into a thrown error, so every rejection here is
 * swallowed and every absent bridge method answers null rather than throwing.
 *
 * ## The read-then-write is not atomic, and that is a known, accepted limit
 *
 * Two surfaces changing within the same tick could both read the bag before either writes
 * it back, and the second write would not see the first's key. Nothing is lost by that: the
 * next time either surface changes again, its own next call reads the by-then-current bag
 * and the missed key reappears from the merge. This mirror is a best-effort backup on top
 * of `localStorage`, not the thing anyone's settings actually depend on staying correct
 * moment to moment - only `localStorage` is.
 *
 * ## Every `localStorage`-backed store is either wired here, or excluded here by name
 *
 * `docs/config-history.md` names every `material-bluemap-*` preference this package keeps.
 * Each one now does exactly one of two things, and {@link APP_SETTINGS_HISTORY_KEYS} plus
 * {@link EXCLUDED_APP_SETTINGS} are the audit trail for which: a store either calls
 * {@link recordAppSetting} from wherever it already writes `localStorage`, under the key
 * listed in {@link APP_SETTINGS_HISTORY_KEYS}, or it is named in
 * {@link EXCLUDED_APP_SETTINGS} with a reason a reviewer can check against the code. A store
 * that does neither is a silent gap, which is exactly what this pair of lists exists to
 * make impossible to have by accident - `appSettingsHistorySync.test.ts` asserts both lists
 * against the real call sites.
 *
 * `profiles.ts` and the maps-and-servers list it backs are deliberately not on either list:
 * they already have their own dedicated history channel, `profilesHistory`, wired directly
 * in `stores/profiles.ts` - a second, weaker mirror through this generic bag would not add
 * anything `profilesHistory` does not already keep.
 */

import { simpleHistoryReadFn, simpleHistorySaveFn } from "../components/history/simpleHistoryHost.js";

/** The shape `settingsHistory:read` answers with, read defensively rather than trusted. */
function valuesBagFrom(current: unknown): Record<string, unknown> {
    if (typeof current !== "object" || current === null) return {};
    const bag = (current as { values?: unknown }).values;
    if (typeof bag !== "object" || bag === null || Array.isArray(bag)) return {};
    return { ...(bag as Record<string, unknown>) };
}

/**
 * Records one settings surface's current value, merged into the shared bag, fire-and-forget.
 *
 * `key` is the name that surface is known by in the shared bag, and the name a revision's
 * own label names when it changes - `menuSearch` for `menuPrefs.ts`'s disclosure state, and
 * so on for whichever surface calls this next. `docs/config-history.md` names the same
 * convention for the surfaces this build has not wired in yet.
 */
export function recordAppSetting(key: string, value: unknown): void {
    const bridge = typeof window === "undefined" ? null : window.materialBluemap;
    const save = simpleHistorySaveFn(bridge, "appSettingsHistory");
    if (save === null) return;
    const read = simpleHistoryReadFn(bridge, "appSettingsHistory");

    const merge = async (): Promise<void> => {
        let values: Record<string, unknown> = {};
        if (read !== null) {
            try {
                values = valuesBagFrom(await read());
            } catch {
                // An unreadable history bag is answered as empty above already, by
                // `valuesBagFrom`'s own defensive shape check; a rejected read lands here
                // instead, and is treated the same way - proceed with just this key rather
                // than losing the save entirely over a history read that failed.
            }
        }
        values[key] = value;
        await save({ version: 1, values });
    };

    void merge().catch(() => {
        // Fire-and-forget: a history mirror that could not be written must never surface
        // as a failed settings save.
    });
}

/** One store's key in the shared bag, and the file that calls {@link recordAppSetting} for it. */
export interface AppSettingsHistoryKey {
    readonly key: string;
    readonly owner: string;
}

/**
 * Every key a real caller passes to {@link recordAppSetting}, so the manifest can be checked
 * against the source rather than trusted on its word - `appSettingsHistorySync.test.ts` reads
 * each `owner` file and asserts it really does call `recordAppSetting("<key>"`.
 */
export const APP_SETTINGS_HISTORY_KEYS: readonly AppSettingsHistoryKey[] = [
    { key: "menuSearch", owner: "components/menu/menuPrefs.ts" },
    { key: "appearance", owner: "components/appearance/appearanceStore.ts" },
    { key: "dockPlacement", owner: "components/settings/dockPlacement.ts" },
    { key: "palette", owner: "components/palette/palettePrefs.ts" },
    { key: "remoteTargets", owner: "components/remote/remoteTargets.ts" },
    { key: "eulaTabs", owner: "components/eula/eulaStorage.ts" },
    { key: "markerFiltersOpen", owner: "components/markers/MarkerMenu.vue" },
    { key: "mapStorageDir", owner: "components/setup/mapStorage.ts" },
    { key: "languageMode", owner: "components/setup/setupI18n.ts" },
    { key: "funnyLevelEn", owner: "components/setup/setupI18n.ts" },
    { key: "funnyLevelYue", owner: "components/setup/setupI18n.ts" },
    { key: "updateDismissed", owner: "components/update/updateModel.ts" },
    { key: "noticeDuration", owner: "components/config/noticeDurationPrefs.ts" },
    { key: "renderMemory", owner: "components/settings/renderMemorySetting.ts" },
    // tabStorage.ts backs four independent tab strips through one module, each keyed by
    // its own `localStorage` key (see `DEFAULT_TAB_STORAGE_KEY` and each `storage-key`
    // prop) - `writeTabWorkspace` records under `tabs.<that key>` so the four cannot
    // collide in the shared bag the way they would if they all recorded under "tabs".
    { key: "tabs.material-bluemap-tabs", owner: "components/tabs/tabStorage.ts" },
    { key: "tabs.material-bluemap-settings-tabs", owner: "components/tabs/tabStorage.ts" },
    { key: "tabs.material-bluemap-config-editor-tabs", owner: "components/tabs/tabStorage.ts" },
    { key: "tabs.material-bluemap-project-editor-tabs", owner: "components/tabs/tabStorage.ts" },
];

/** One store's key, its owner, and why it is deliberately never mirrored into history. */
export interface ExcludedAppSetting {
    readonly key: string;
    readonly owner: string;
    readonly reason: string;
}

/**
 * Every `localStorage`-backed store this package found that is *not* wired above, named with
 * the reason it is not - the other half of the audit trail {@link APP_SETTINGS_HISTORY_KEYS}
 * starts. A store that belongs on neither list is the silent gap this pair exists to prevent;
 * `appSettingsHistorySync.test.ts` holds this array to an exact, reviewed shape.
 */
export const EXCLUDED_APP_SETTINGS: readonly ExcludedAppSetting[] = [
    {
        key: "dockSize",
        owner: "components/settings/dockPlacement.ts (writeDockSizes)",
        reason:
            "Continuous pointer-drag data, not a discrete choice: DockedSurface.vue's " +
            "onSplitterPointerMove and onSplitterKeydown call setDockThickness -> " +
            "writeDockSizes on every pointer-move frame and every arrow-key repeat while a " +
            "splitter is being dragged or resized, not once on release. Mirroring it would " +
            "turn one resize gesture into dozens of history revisions of pure noise. The " +
            "discrete choice this geometry serves - which edge a panel is docked to - is " +
            "wired under \"dockPlacement\".",
    },
    {
        key: "dockFloating",
        owner: "components/settings/dockPlacement.ts (writeDockFloatingRects)",
        reason:
            "The same continuous pointer-drag problem as dockSize: DockedSurface.vue's " +
            "header-drag and resize-handle pointermove handlers call setDockFloatingRect -> " +
            "writeDockFloatingRects on every frame while a floating panel is moved or " +
            "resized, never only at drag-end.",
    },
];
