import type { TypeSerializer } from "./TypeSerializer.js";
import type { TypeDeserializer } from "./TypeDeserializer.js";

/**
 * A TypeAdapter combines a {@link TypeSerializer} and a {@link TypeDeserializer} for a certain type T
 */
export interface TypeAdapter<T> extends TypeSerializer<T>, TypeDeserializer<T> {}
