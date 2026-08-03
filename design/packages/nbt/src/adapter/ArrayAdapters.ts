import { TagType } from "../TagType.js";
import type { NBTReader } from "../NBTReader.js";
import type { TypeAdapter } from "../TypeAdapter.js";
import { readByte, readInt, readLong } from "./PrimitiveAdapters.js";

/**
 * TypeAdapters for the primitive nbt-array-tags (port of upstream
 * ArrayAdapterFactory.ArrayAdapter for byte[]/int[]/long[]): the matching
 * array-tag is read directly, other array-tags go through the reader's
 * conversion rules, and LIST-tags are read element-wise with the lenient
 * primitive readers.
 */

export const BYTE_ARRAY_ADAPTER: TypeAdapter<Int8Array> = {
    read(reader: NBTReader): Int8Array {
        const tag = reader.peek();
        if (tag === TagType.BYTE_ARRAY) return reader.nextByteArray();
        if (tag === TagType.INT_ARRAY || tag === TagType.LONG_ARRAY)
            return reader.nextArrayAsByteArray();
        const length = reader.beginList();
        const array = new Int8Array(length);
        for (let i = 0; i < length; i++) array[i] = readByte(reader);
        reader.endList();
        return array;
    },
    write: (value, writer) => writer.valueByteArray(value),
    type: () => TagType.BYTE_ARRAY,
};

export const INT_ARRAY_ADAPTER: TypeAdapter<Int32Array> = {
    read(reader: NBTReader): Int32Array {
        const tag = reader.peek();
        if (tag === TagType.INT_ARRAY) return reader.nextIntArray();
        if (tag === TagType.BYTE_ARRAY || tag === TagType.LONG_ARRAY)
            return reader.nextArrayAsIntArray();
        const length = reader.beginList();
        const array = new Int32Array(length);
        for (let i = 0; i < length; i++) array[i] = readInt(reader);
        reader.endList();
        return array;
    },
    write: (value, writer) => writer.valueIntArray(value),
    type: () => TagType.INT_ARRAY,
};

export const LONG_ARRAY_ADAPTER: TypeAdapter<BigInt64Array> = {
    read(reader: NBTReader): BigInt64Array {
        const tag = reader.peek();
        if (tag === TagType.LONG_ARRAY) return reader.nextLongArray();
        if (tag === TagType.BYTE_ARRAY || tag === TagType.INT_ARRAY)
            return reader.nextArrayAsLongArray();
        const length = reader.beginList();
        const array = new BigInt64Array(length);
        for (let i = 0; i < length; i++) array[i] = readLong(reader);
        reader.endList();
        return array;
    },
    write: (value, writer) => writer.valueLongArray(value),
    type: () => TagType.LONG_ARRAY,
};
