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
