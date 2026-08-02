import type { BlueNBT } from "./BlueNBT.js";
import type { TypeAdapter } from "./TypeAdapter.js";
import type { TypeDeserializer } from "./TypeDeserializer.js";
import type { TypeSerializer } from "./TypeSerializer.js";
import type { TypeToken } from "./TypeToken.js";

/**
 * References a deserializer in a schema: either a registered {@link TypeToken},
 * an inline {@link TypeDeserializer}, or a factory creating one from a BlueNBT
 * instance (used by helpers like listOf/mapOf that need to resolve their
 * element-types against the BlueNBT registry, mirroring upstream's
 * TypeDeserializerFactory pattern).
 */
export type DeserializerSpec<T> =
    TypeToken<T> | TypeDeserializer<T> | ((nbt: BlueNBT) => TypeDeserializer<T>);

/** {@link DeserializerSpec}'s counterpart for serialization. */
export type SerializerSpec<T> =
    TypeToken<T> | TypeSerializer<T> | ((nbt: BlueNBT) => TypeSerializer<T>);

/** A spec resolving to both a serializer and a deserializer. */
export type AdapterSpec<T> = TypeToken<T> | TypeAdapter<T> | ((nbt: BlueNBT) => TypeAdapter<T>);
