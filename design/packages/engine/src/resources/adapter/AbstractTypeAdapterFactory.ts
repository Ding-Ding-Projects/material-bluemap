import type { JsonValue } from "./JsonMapper.js";

/**
 * The gson TypeAdapter surface as used by this port: adapters read from (and
 * optionally write to) plain parsed {@link JsonValue}s instead of token-streams.
 */
export interface JsonAdapter<T> {
    read(json: JsonValue): T;
    write?(value: T): JsonValue;
}

/**
 * upstream: adapter/AbstractTypeAdapterFactory.java — the gson-specific factory
 * indirection (create/Adapter) collapses away without gson's registry; what remains
 * is the adapter base-class with the shared {@code JSON_COMMENT} constant and the
 * write-is-unsupported default.
 */
export abstract class AbstractTypeAdapterFactory<T> implements JsonAdapter<T> {
    protected static readonly JSON_COMMENT: string = "__comment";

    abstract read(json: JsonValue): T;

    write(_value: T): JsonValue {
        throw new Error("UnsupportedOperationException");
    }
}
