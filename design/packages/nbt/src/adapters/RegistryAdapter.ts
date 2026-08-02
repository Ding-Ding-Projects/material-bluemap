import { TagType } from "../TagType.js";
import type { NBTReader } from "../NBTReader.js";
import type { NBTWriter } from "../NBTWriter.js";
import type { TypeAdapter } from "../TypeAdapter.js";

/**
 * Structural stand-ins for @material-bluemap/shared's Key/Keyed/Registry, keeping this
 * package dependency-free; the shared classes satisfy these shapes as-is.
 */
export interface KeyLike {
    getFormatted(): string;
}

export interface KeyedLike<K extends KeyLike> {
    getKey(): K;
}

export interface RegistryLike<K extends KeyLike, T> {
    get(key: K): T | null;
}

/**
 * Port of BlueMap's de.bluecolored.bluemap.core.util.nbt.RegistryAdapter.
 *
 * Since this package can not depend on the shared Key class, the Key.parse call is
 * injected as {@code keyParser} — pass the shared package's {@code Key.parse}.
 * The warning-logger replaces upstream's Logger.global.noFloodWarning and is only
 * invoked once per unknown key (per adapter-instance).
 */
export class RegistryAdapter<K extends KeyLike, T extends KeyedLike<K>> implements TypeAdapter<T> {
    private readonly warnedKeys = new Set<string>();

    constructor(
        private readonly registry: RegistryLike<K, T>,
        private readonly keyParser: (formatted: string, defaultNamespace: string) => K,
        private readonly defaultNamespace: string,
        private readonly fallback: T,
        private readonly logWarning: (message: string) => void = (message) => console.warn(message),
    ) {}

    read(reader: NBTReader): T {
        const key = this.keyParser(reader.nextString(), this.defaultNamespace);
        const value = this.registry.get(key);
        if (value != null) return value;

        const floodKey = "unknown-registry-key-" + key.getFormatted();
        if (!this.warnedKeys.has(floodKey)) {
            this.warnedKeys.add(floodKey);
            this.logWarning("Failed to find registry-entry for key: " + key.getFormatted());
        }
        return this.fallback;
    }

    write(value: T, writer: NBTWriter): void {
        writer.valueString(value.getKey().getFormatted());
    }

    type(): TagType {
        return TagType.STRING;
    }
}
