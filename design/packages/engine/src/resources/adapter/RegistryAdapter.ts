import { Key, type Keyed, type Registry } from "@material-bluemap/shared";
import { noFloodWarning } from "../../world/mca/MCAUtil.js";
import type { JsonAdapter } from "./AbstractTypeAdapterFactory.js";
import { nextString, type JsonValue } from "./JsonMapper.js";

export class RegistryAdapter<T extends Keyed> implements JsonAdapter<T> {
    constructor(
        private readonly registry: Registry<T>,
        private readonly defaultNamespace: string,
        private readonly fallback: T
    ) {}

    read(json: JsonValue): T {
        const key = Key.parse(nextString(json), this.defaultNamespace);
        const value = this.registry.get(key);
        if (value != null) return value;

        noFloodWarning(
            "unknown-registry-key-" + key.getFormatted(),
            "Failed to find registry-entry for key: " + key
        );
        return this.fallback;
    }

    write(value: T): JsonValue {
        return value.getKey().getFormatted();
    }
}
