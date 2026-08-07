import type { Key } from "@worldlens/shared";

/**
 * upstream: resources/pack/ResourcePool.java
 *
 * Upstream backs the pool with a plain (non-concurrent) {@code HashMap} even though a
 * ResourcePack loads its packs in parallel; that is safe here because javascript has no
 * preemption — see docs/deviations.md.
 */

/*
 * upstream: Logger.global.logDebug — the logger-package is not part of this port (yet),
 * so the log-calls of the pack-package are backed by the console directly.
 */
function logDebug(message: string): void {
    console.debug(message);
}

/** upstream: ResourcePool.Loader */
export interface Loader<T> {
    load(resourcePath: Key): Promise<T | null> | T | null;
}

/** upstream: java.util.function.BinaryOperator */
export type BinaryOperator<T> = (previous: T, resource: T) => T;

export class ResourcePool<T> {
    // upstream: Map<Key, T> — keyed by Key#getFormatted() (value-equal to upstream's
    // Key hashCode/equals), keeping the Key itself alongside for keySet/entrySet
    private readonly resources = new Map<string, { key: Key; value: T }>();

    get(key: Key): T | null {
        const entry = this.resources.get(key.getFormatted());
        return entry === undefined ? null : entry.value;
    }

    put(key: Key, value: T): void {
        if (key == null) throw new Error("key can not be null");
        this.resources.set(key.getFormatted(), { key, value });
    }

    putIfAbsent(key: Key, value: T): void {
        if (key == null) throw new Error("key can not be null");
        const formatted = key.getFormatted();
        if (this.resources.has(formatted)) return;
        this.resources.set(formatted, { key, value });
    }

    containsKey(key: Key): boolean {
        return this.resources.has(key.getFormatted());
    }

    remove(key: Key): void {
        this.resources.delete(key.getFormatted());
    }

    /** upstream: {@code Collection<T> values()} (a live view upstream, a snapshot here) */
    values(): T[] {
        return Array.from(this.resources.values(), (entry) => entry.value);
    }

    /** upstream: {@code Set<Map.Entry<Key, T>> entrySet()} (a live view upstream) */
    entrySet(): [Key, T][] {
        return Array.from(this.resources.values(), (entry) => [entry.key, entry.value]);
    }

    /** upstream: {@code Set<Key> keySet()} (a live view upstream) */
    keySet(): Key[] {
        return Array.from(this.resources.values(), (entry) => entry.key);
    }

    load(path: Key, loader: Loader<T>): Promise<void>;
    load(path: Key, loader: Loader<T>, mergeFunction: BinaryOperator<T>): Promise<void>;
    async load(path: Key, loader: Loader<T>, mergeFunction?: BinaryOperator<T>): Promise<void> {
        if (mergeFunction === undefined) {
            try {
                if (this.containsKey(path)) return; // don't load already present resources

                const resource = await loader.load(path);
                if (resource == null) return; // don't load missing resources

                this.put(path, resource);
            } catch (ex) {
                logDebug("Failed to load resource '" + path + "': " + ex);
            }
            return;
        }

        try {
            const loaded = await loader.load(path);
            if (loaded == null) return; // don't load missing resources

            let resource: T = loaded;
            const previous = this.get(path);
            if (previous !== null) resource = mergeFunction(previous, resource);

            this.put(path, resource);
        } catch (ex) {
            logDebug("Failed to parse resource '" + path + "': " + ex);
        }
    }
}
