import { TagType, tagTypeName } from "../TagType.js";
import { IllegalStateException } from "../Exceptions.js";
import type { NBTReader } from "../NBTReader.js";
import type { TypeDeserializer } from "../TypeDeserializer.js";

/**
 * A {@link TypeDeserializer} deserializing NBT-Data into a construct of Maps, arrays and primitives
 * closely representing the actual NBT-Data structure.
 * <blockquote><pre>
 *     NBT-Tag -> Deserialized JS-Object
 *     --------------------
 *     COMPOUND -> Map&lt;string, unknown&gt;
 *     LIST -> unknown[]
 *     STRING -> string
 *     BYTE -> number
 *     SHORT -> number
 *     INT -> number
 *     LONG -> bigint
 *     FLOAT -> number
 *     DOUBLE -> number
 *     BYTE_ARRAY -> Int8Array
 *     INT_ARRAY -> Int32Array
 *     LONG_ARRAY -> BigInt64Array
 * </pre></blockquote>
 */
export class ObjectDeserializer implements TypeDeserializer<unknown> {
    static readonly INSTANCE: ObjectDeserializer = new ObjectDeserializer();

    read(reader: NBTReader): unknown {
        const type = reader.peek();
        switch (type) {
            case TagType.COMPOUND: {
                const map = new Map<string, unknown>();
                reader.beginCompound();
                while (reader.hasNext()) map.set(reader.name(), this.read(reader));
                reader.endCompound();
                return map;
            }

            case TagType.LIST: {
                const list: unknown[] = [];
                reader.beginList();
                while (reader.hasNext()) list.push(this.read(reader));
                reader.endList();
                return list;
            }

            case TagType.STRING:
                return reader.nextString();
            case TagType.BYTE:
                return reader.nextByte();
            case TagType.SHORT:
                return reader.nextShort();
            case TagType.INT:
                return reader.nextInt();
            case TagType.LONG:
                return reader.nextLong();
            case TagType.FLOAT:
                return reader.nextFloat();
            case TagType.DOUBLE:
                return reader.nextDouble();
            case TagType.BYTE_ARRAY:
                return reader.nextByteArray();
            case TagType.INT_ARRAY:
                return reader.nextIntArray();
            case TagType.LONG_ARRAY:
                return reader.nextLongArray();

            case TagType.END:
            default:
                throw new IllegalStateException("Found unexpected " + tagTypeName(type) + " tag.");
        }
    }
}
