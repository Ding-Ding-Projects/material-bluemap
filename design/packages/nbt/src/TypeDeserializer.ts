import type { NBTReader } from "./NBTReader.js";

/**
 * A TypeDeserializer is able to read and deserialize a certain type T from an {@link NBTReader}
 */
export interface TypeDeserializer<T> {
    /**
     * Reads and returns T from the given reader
     */
    read(reader: NBTReader): T;
}
