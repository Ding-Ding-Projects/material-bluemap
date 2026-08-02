import type { Key } from "./Key.js";
import type { Keyed } from "./Keyed.js";

export class Registry<T extends Keyed> {
    // upstream keeps registries in a synchronized weak set; a plain Set is used here
    // since registries are effectively static singletons
    static readonly REGISTRIES: Set<Registry<Keyed>> = new Set();

    // keyed by Key#getFormatted() — value-equal to upstream's interned-Key hashing
    private readonly entries: Map<string, T> = new Map();

    constructor(...defaultEntries: T[]) {
        Registry.REGISTRIES.add(this as Registry<Keyed>);

        for (const entry of defaultEntries) this.register(entry);
    }

    /**
     * Registers a new entry, only if there is no entry with the same key registered already.
     * Does nothing otherwise.
     * @param entry The new entry to be added to this registry
     * @return true if the entry has been added, false if there is already an entry with the same key registered
     */
    register(entry: T): boolean {
        if (entry == null) throw new Error("registry entry can not be null");
        // note: mirrors upstream (Registry.java:59) `putIfAbsent(...) != null`,
        // which actually returns true when an entry with the same key already existed
        const formatted = entry.getKey().getFormatted();
        const previous = this.entries.get(formatted);
        if (previous === undefined) this.entries.set(formatted, entry);
        return previous !== undefined;
    }

    /**
     * Gets an entry from this registry for a key.
     * @param key The key to search for
     * @return The entry with the key, or null if there is no entry for this key
     */
    get(key: Key): T | null {
        return this.entries.get(key.getFormatted()) ?? null;
    }

    /**
     * Returns a set of all keys this registry contains entries for
     */
    keys(): ReadonlySet<Key> {
        return new Set(Array.from(this.entries.values(), (entry) => entry.getKey()));
    }

    /**
     * Returns a collection of entries in this registry
     */
    values(): readonly T[] {
        return [...this.entries.values()];
    }
}
