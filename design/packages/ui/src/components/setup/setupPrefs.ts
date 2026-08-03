/**
 * The tiny persistence layer the first-run flow and its settings row sit on.
 *
 * Deliberately not `localStorage` directly. Two reasons, both real rather than
 * theoretical:
 *
 *  - the same modules run under Vitest, where there is no `localStorage` at all, and a
 *    test that has to stub a global is a test that leaks into whatever runs after it;
 *  - a private-browsing window and a filled quota both make `localStorage.setItem`
 *    throw, and a language preference failing to save is never worth an exception
 *    escaping into a first-run screen.
 *
 * The Mojang consent answer is **not** stored here. That lives in the main process
 * (`packages/app/src/main/consent.ts`), written atomically to `userData/consent.json`,
 * and is reached through the preload bridge. A consent record that a page could rewrite
 * would not be a record of anything.
 */

/** The subset of the Web Storage API this package needs. */
export interface SetupStorage {
    read(key: string): string | null;
    write(key: string, value: string): void;
    remove(key: string): void;
}

/** An in-memory store, used when the browser has none and by every unit test. */
export function memoryStorage(initial: Readonly<Record<string, string>> = {}): SetupStorage {
    const values = new Map<string, string>(Object.entries(initial));
    return {
        read: (key) => values.get(key) ?? null,
        write: (key, value) => {
            values.set(key, value);
        },
        remove: (key) => {
            values.delete(key);
        },
    };
}

/** `localStorage`, with every call wrapped so a refusal degrades instead of throwing. */
export function browserStorage(): SetupStorage {
    return {
        read: (key) => {
            try {
                return globalThis.localStorage?.getItem(key) ?? null;
            } catch {
                return null;
            }
        },
        write: (key, value) => {
            try {
                globalThis.localStorage?.setItem(key, value);
            } catch {
                // Private mode or a full quota. The choice still applies to this session.
            }
        },
        remove: (key) => {
            try {
                globalThis.localStorage?.removeItem(key);
            } catch {
                // As above.
            }
        },
    };
}

function detectStorage(): SetupStorage {
    // Node 22 exposes a `localStorage` global that is unusable without a command-line flag
    // and prints an experimental warning on every touch, so the property existing is not
    // evidence of a browser. A `window` is.
    if (typeof globalThis.window === "undefined") return memoryStorage();
    try {
        if (typeof globalThis.localStorage === "object" && globalThis.localStorage !== null) {
            return browserStorage();
        }
    } catch {
        // Accessing the property itself can throw where storage is blocked by policy.
    }
    return memoryStorage();
}

let active: SetupStorage = detectStorage();

export function setupStorage(): SetupStorage {
    return active;
}

/** Swaps the backing store. Tests use it; the application never calls it. */
export function setSetupStorage(storage: SetupStorage): void {
    active = storage;
}

/** Reads a value that must be one of a known set, falling back when it is not. */
export function readOneOf<T extends string>(
    key: string,
    allowed: readonly T[],
    fallback: T,
): T {
    const raw = active.read(key);
    return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** Reads a whole number inside a range, falling back when it is missing or unparseable. */
export function readInt(key: string, fallback: number, min: number, max: number): number {
    const raw = active.read(key);
    if (raw === null) return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}
