/** Copies legacy site preferences to Worldlens keys before any controller hydrates. */
export interface SiteStorageMigrationHost {
    readonly length: number;
    key(index: number): string | null;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export function migrateLegacySiteStorage(storage: SiteStorageMigrationHost): number {
    const legacyKeys: string[] = [];
    try {
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key?.startsWith("material-bluemap")) legacyKeys.push(key);
        }
    } catch {
        return 0;
    }

    let migrated = 0;
    for (const legacyKey of legacyKeys) {
        try {
            const key = `worldlens${legacyKey.slice("material-bluemap".length)}`;
            if (storage.getItem(key) !== null) continue;
            const value = storage.getItem(legacyKey);
            if (value === null) continue;
            storage.setItem(key, value);
            migrated += 1;
        } catch {
            // A blocked/quota-full storage leaves the old value retained for a future retry.
        }
    }
    return migrated;
}

try {
    // Avoid Node 22's warning-only localStorage getter during tests and static builds.
    if (typeof globalThis.window !== "undefined") {
        migrateLegacySiteStorage(globalThis.window.localStorage);
    }
} catch {
    // The site already supports storage being blocked entirely.
}
