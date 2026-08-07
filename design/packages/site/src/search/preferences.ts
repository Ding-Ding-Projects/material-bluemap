/**
 * Per-field search preferences.
 *
 * Only two things are remembered for a search bar: whether the visitor left it in plain text or
 * regex mode, and which flags they had on. Queries, patterns and sample text are never written
 * anywhere, because a search box is where people paste things they did not mean to keep.
 *
 * Everything here is resettable through `resetSearchPreferences()`.
 */

const STORAGE_KEY = "worldlens-search-prefs";

export interface StoredFieldPreference {
    readonly mode?: "text" | "regex";
    readonly flags?: string;
    /** Whether the field's search options row was left open. */
    readonly optionsOpen?: boolean;
}

export interface SearchPreferenceStore {
    read(fieldId: string): StoredFieldPreference | null;
    /** Merge into whatever is already stored for this field, so one writer cannot erase another. */
    write(fieldId: string, value: StoredFieldPreference): void;
    /** Forget every stored search preference. */
    clear(): void;
}

function parse(raw: string | null): Record<string, StoredFieldPreference> {
    if (raw === null) {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {};
        }
        return parsed as Record<string, StoredFieldPreference>;
    } catch {
        return {};
    }
}

/** A store that keeps nothing. Used in tests and when storage is unavailable or refused. */
export function memoryPreferenceStore(): SearchPreferenceStore {
    const values = new Map<string, StoredFieldPreference>();
    return {
        read(fieldId) {
            return values.get(fieldId) ?? null;
        },
        write(fieldId, value) {
            values.set(fieldId, { ...values.get(fieldId), ...value });
        },
        clear() {
            values.clear();
        },
    };
}

/** A store backed by `localStorage`, degrading to no persistence when that is unavailable. */
export function browserPreferenceStore(): SearchPreferenceStore {
    let storage: Storage | null = null;
    if (typeof window === "undefined") {
        // No browser, no visitor, nothing to remember.
        return memoryPreferenceStore();
    }
    try {
        storage = globalThis.localStorage ?? null;
        // Touch the store once so a blocked or full store degrades now rather than mid-session.
        storage?.getItem(STORAGE_KEY);
    } catch {
        storage = null;
    }

    if (storage === null) {
        return memoryPreferenceStore();
    }

    const backing = storage;
    return {
        read(fieldId) {
            try {
                return parse(backing.getItem(STORAGE_KEY))[fieldId] ?? null;
            } catch {
                return null;
            }
        },
        write(fieldId, value) {
            try {
                const all = parse(backing.getItem(STORAGE_KEY));
                all[fieldId] = { ...all[fieldId], ...value };
                backing.setItem(STORAGE_KEY, JSON.stringify(all));
            } catch {
                // Persistence is a convenience. Losing it must never break the search bar.
            }
        },
        clear() {
            try {
                backing.removeItem(STORAGE_KEY);
            } catch {
                // Nothing to do: the preference was already unreachable.
            }
        },
    };
}

let defaultStore: SearchPreferenceStore | null = null;

/** The store every search field uses unless it is handed a different one. */
export function searchPreferenceStore(): SearchPreferenceStore {
    if (defaultStore === null) {
        defaultStore = browserPreferenceStore();
    }
    return defaultStore;
}

/** Replace the default store. Used by tests. */
export function setSearchPreferenceStore(store: SearchPreferenceStore | null): void {
    defaultStore = store;
}

/** Forget every stored search preference. Exposed to the settings surface as a reset control. */
export function resetSearchPreferences(): void {
    searchPreferenceStore().clear();
}
