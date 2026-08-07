/**
 * Copies persisted renderer preferences from the legacy Material BlueMap namespace into
 * Worldlens before any store module reads localStorage.
 *
 * The old cells are retained for rollback. A current cell always wins, so retrying is
 * idempotent and can never replace a setting already changed in Worldlens. All later writes
 * use the current keys owned by their individual stores.
 */

export const LEGACY_STORAGE_PREFIX = "material-bluemap";
export const WORLDLENS_STORAGE_PREFIX = "worldlens";

export interface StorageMigrationHost {
    readonly length: number;
    key(index: number): string | null;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface StorageMigrationResult {
    readonly migrated: number;
    readonly retainedCurrent: number;
    readonly failed: number;
}

function currentKey(legacyKey: string): string {
    return `${WORLDLENS_STORAGE_PREFIX}${legacyKey.slice(LEGACY_STORAGE_PREFIX.length)}`;
}

function migrateValue(key: string, value: string): string {
    if (key !== `${LEGACY_STORAGE_PREFIX}-appearance`) return value;
    try {
        const parsed = JSON.parse(value) as unknown;
        if (
            typeof parsed === "object" &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            (parsed as Record<string, unknown>)["format"] === `${LEGACY_STORAGE_PREFIX}-appearance`
        ) {
            return JSON.stringify({
                ...(parsed as Record<string, unknown>),
                format: `${WORLDLENS_STORAGE_PREFIX}-appearance`,
            });
        }
    } catch {
        // Preserve malformed input byte-for-byte. Its owning store decides how to report it.
    }
    return value;
}

export function migrateLegacyStorage(storage: StorageMigrationHost): StorageMigrationResult {
    const legacyKeys: string[] = [];
    try {
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key?.startsWith(LEGACY_STORAGE_PREFIX)) legacyKeys.push(key);
        }
    } catch {
        return { migrated: 0, retainedCurrent: 0, failed: 1 };
    }

    let migrated = 0;
    let retainedCurrent = 0;
    let failed = 0;
    for (const legacyKey of legacyKeys) {
        try {
            const nextKey = currentKey(legacyKey);
            if (storage.getItem(nextKey) !== null) {
                retainedCurrent += 1;
                continue;
            }
            const value = storage.getItem(legacyKey);
            if (value === null) continue;
            storage.setItem(nextKey, migrateValue(legacyKey, value));
            migrated += 1;
        } catch {
            failed += 1;
        }
    }
    return { migrated, retainedCurrent, failed };
}

try {
    // Node 22 exposes an unusable localStorage getter that warns when touched. A browser
    // window is the proof that this is the renderer rather than a unit-test process.
    if (typeof globalThis.window !== "undefined") {
        migrateLegacyStorage(globalThis.window.localStorage);
    }
} catch {
    // Storage can be blocked by policy. Every owning store already degrades without it.
}
