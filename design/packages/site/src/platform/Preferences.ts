/**
 * Persisted visitor preferences.
 *
 * Every preference the site keeps goes through this one object, so there is a single place
 * that knows the storage namespace, a single reset path, and a single subscription channel.
 * Values are plain strings or JSON; nothing here is sensitive, and nothing leaves the
 * browser.
 *
 * Storage can be unavailable (private windows, a blocked origin, a full quota). That is a
 * normal condition rather than an error: reads fall back to the caller's default, writes are
 * dropped, and `available` reports the truth so a settings surface can say so plainly rather
 * than silently forgetting what the visitor chose.
 */

export type PreferenceListener = (key: string) => void;

const NAMESPACE = "mbm-site:";

function openStorage(): Storage | null {
    try {
        const probe = "mbm-site:__probe__";
        window.localStorage.setItem(probe, "1");
        window.localStorage.removeItem(probe);
        return window.localStorage;
    } catch {
        return null;
    }
}

export class Preferences {
    private readonly storage: Storage | null;
    private readonly listeners = new Set<PreferenceListener>();
    private readonly known = new Set<string>();

    constructor(storage: Storage | null = openStorage()) {
        this.storage = storage;
        if (typeof window !== "undefined") {
            // Another tab of the same site changing a preference should be reflected here.
            window.addEventListener("storage", (event) => {
                if (event.storageArea !== this.storage) return;
                const key = event.key;
                if (key === null) {
                    for (const known of this.known) this.emit(known);
                    return;
                }
                if (key.startsWith(NAMESPACE)) this.emit(key.slice(NAMESPACE.length));
            });
        }
    }

    /** False when the browser refuses storage. Choices still apply, they just do not persist. */
    get available(): boolean {
        return this.storage !== null;
    }

    /** Every preference key this session has read or written, without the namespace. */
    keys(): string[] {
        return [...this.known].sort();
    }

    read(key: string, fallback: string): string {
        this.known.add(key);
        if (this.storage === null) return fallback;
        try {
            const raw = this.storage.getItem(NAMESPACE + key);
            return raw === null ? fallback : raw;
        } catch {
            return fallback;
        }
    }

    /**
     * Read a value constrained to a known set. Anything else (a hand-edited value, a value
     * written by an older build) falls back rather than propagating a state the site cannot
     * render.
     */
    readOneOf<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
        const raw = this.read(key, fallback);
        return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
    }

    readInt(key: string, fallback: number, min: number, max: number): number {
        const raw = Number.parseInt(this.read(key, String(fallback)), 10);
        if (!Number.isFinite(raw)) return fallback;
        return Math.min(max, Math.max(min, raw));
    }

    readBoolean(key: string, fallback: boolean): boolean {
        const raw = this.read(key, fallback ? "true" : "false");
        return raw === "true" ? true : raw === "false" ? false : fallback;
    }

    /**
     * Read structured state. `revive` is the validator: it receives whatever JSON.parse
     * produced and returns the value it accepts, or undefined to fall back. Persisted shapes
     * change between builds, so an unvalidated read is a crash waiting for the next release.
     */
    readJson<T>(key: string, revive: (value: unknown) => T | undefined): T | undefined {
        const raw = this.read(key, "");
        if (raw === "") return undefined;
        try {
            return revive(JSON.parse(raw) as unknown);
        } catch {
            return undefined;
        }
    }

    write(key: string, value: string): void {
        this.known.add(key);
        if (this.storage !== null) {
            try {
                this.storage.setItem(NAMESPACE + key, value);
            } catch {
                /* Quota or a blocked origin. The in-memory choice still applies. */
            }
        }
        this.emit(key);
    }

    writeJson(key: string, value: unknown): void {
        try {
            this.write(key, JSON.stringify(value));
        } catch {
            /* A value that cannot be serialised is a programming error, not a visitor error. */
        }
    }

    /** Forget one preference, returning it to its built-in default. */
    remove(key: string): void {
        this.known.add(key);
        if (this.storage !== null) {
            try {
                this.storage.removeItem(NAMESPACE + key);
            } catch {
                /* Nothing to do; the value is already unreachable. */
            }
        }
        this.emit(key);
    }

    /** Forget every preference this site owns. Storage belonging to anything else is untouched. */
    resetAll(): void {
        const removed = new Set(this.known);
        if (this.storage !== null) {
            try {
                for (let i = this.storage.length - 1; i >= 0; i--) {
                    const full = this.storage.key(i);
                    if (full !== null && full.startsWith(NAMESPACE)) {
                        removed.add(full.slice(NAMESPACE.length));
                        this.storage.removeItem(full);
                    }
                }
            } catch {
                /* Partial clears still emit for whatever was removed. */
            }
        }
        for (const key of removed) this.emit(key);
    }

    subscribe(listener: PreferenceListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private emit(key: string): void {
        for (const listener of [...this.listeners]) listener(key);
    }
}
