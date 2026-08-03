import type { NBTWriter } from "./NBTWriter.js";
import { TagType } from "./TagType.js";

/**
 * A TypeSerializer is able to serialize and write a certain type T to an {@link NBTWriter}
 */
export interface TypeSerializer<T> {
    /**
     * Serializes and writes the provided value to the given writer
     */
    write(value: T, writer: NBTWriter): void;

    /**
     * Returns the (root) tag-type this type-serializer produces.
     * (used to find the correct type when serializing empty lists)
     */
    type?(): TagType;
}

/**
 * Resolves a serializer's (root) tag-type, defaulting to COMPOUND
 * (mirrors the upstream interface-default of TypeSerializer#type).
 */
export function serializerType(serializer: TypeSerializer<never>): TagType {
    return serializer.type !== undefined ? serializer.type() : TagType.COMPOUND;
}
