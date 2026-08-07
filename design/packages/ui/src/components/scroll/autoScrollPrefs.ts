/**
 * Whether a streaming log follows new output as it arrives, per surface, remembered across
 * restarts.
 *
 * Modelled directly on `components/palette/palettePrefs.ts`: one JSON object under one
 * `localStorage` key, read defensively and written best-effort, because a preference that
 * fails to persist is annoying and nowhere near an error dialog. The one difference is that
 * this key holds several surfaces at once rather than one value - `world.console`, a
 * backup's own log and a download's own log each keep their own flag under their own name,
 * the same way `components/menu/menuPrefs.ts` keeps one open/closed flag per search bar in
 * one object rather than inventing a `localStorage` key per surface.
 *
 * Storage failure is not an error worth showing anybody. A private-mode browser and a full
 * quota both throw on write, and the consequence is that the preference does not survive a
 * restart - annoying, and nowhere near a notification. The read is guarded the same way, and
 * a stored value that is not a boolean is discarded rather than trusted, because the file on
 * disk is editable by hand and by an older version of this app.
 */

import { ref, watch, type Ref } from "vue";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

const STORAGE_KEY = "worldlens-autoscroll";

/**
 * The two methods used, so a test can pass a plain object and nothing else leaks.
 *
 * `null` (rather than a default parameter alone) is what a caller passes to say "there is
 * deliberately no storage here" - a browser tab with `localStorage` blocked outright, or a
 * test proving the no-storage path - without that caller having to construct a stub that
 * silently does nothing.
 */
export interface AutoScrollStorage {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
}

function defaultStorage(): AutoScrollStorage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        // Reading `localStorage` itself throws where storage is blocked outright.
        return null;
    }
}

function isBooleanRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFlags(storage: AutoScrollStorage | null): Record<string, boolean> {
    if (storage === null) return {};
    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw === null) return {};
        const parsed: unknown = JSON.parse(raw);
        if (!isBooleanRecord(parsed)) return {};
        const result: Record<string, boolean> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "boolean") result[key] = value;
        }
        return result;
    } catch {
        return {};
    }
}

/** The stored preference for one surface, or `fallback` when there is none, it is unreadable, or it is junk. */
export function readAutoScrollPreference(
    surface: string,
    fallback: boolean,
    storage: AutoScrollStorage | null = defaultStorage(),
): boolean {
    const flags = readFlags(storage);
    const value = flags[surface];
    return typeof value === "boolean" ? value : fallback;
}

/**
 * Writes one surface's preference, leaving every other surface's already-stored value
 * untouched - the same read-merge-write shape `menuPrefs.ts` uses, so two surfaces changing
 * in the same session never stomp on each other.
 */
export function writeAutoScrollPreference(
    surface: string,
    value: boolean,
    storage: AutoScrollStorage | null = defaultStorage(),
): void {
    const flags = readFlags(storage);
    flags[surface] = value;
    // Fire-and-forget mirror into the main process's own settings history, on top of the
    // localStorage write below rather than instead of it - see `appSettingsHistorySync.ts`'s
    // own doc comment for the whole rule.
    recordAppSetting("autoScroll", flags);
    if (storage === null) return;
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(flags));
    } catch {
        // Private mode or a full quota. A remembered follow preference is not worth a toast.
    }
}

/**
 * A `ref` bound to one surface's persisted "follow new output" preference.
 *
 * Seeded once from storage and watched thereafter: turning the checkbox on or off writes
 * through immediately. Two mounted instances of the same surface (a backup screen holding
 * two rows' logs open at once, say) each get their own `ref`, seeded from the same storage,
 * so both start in step; a change in one is not pushed live into the other, the same
 * trade-off `useMenuSearch` already accepts for the same reason - the shared value is a
 * behavioural default, not state two open panels need to stay synchronised over, and each
 * one reads the current preference again the next time it mounts.
 */
export function useAutoScrollPreference(
    surface: string,
    defaultValue: boolean,
    storage: AutoScrollStorage | null = defaultStorage(),
): Ref<boolean> {
    const state = ref(readAutoScrollPreference(surface, defaultValue, storage));
    watch(state, (value) => writeAutoScrollPreference(surface, value, storage));
    return state;
}
