import { TagType } from "../TagType.js";
import type { NBTReader } from "../NBTReader.js";
import type { NBTWriter } from "../NBTWriter.js";
import type { BlueNBT } from "../BlueNBT.js";
import type { TypeAdapter } from "../TypeAdapter.js";
import type { TypeDeserializer } from "../TypeDeserializer.js";
import type { TypeSerializer } from "../TypeSerializer.js";
import { serializerType } from "../TypeSerializer.js";
import type { DeserializerSpec, SerializerSpec } from "../TypeSpec.js";

/**
 * A {@link TypeAdapter} for list-tags with a homogeneous element-type
 * (port of upstream CollectionAdapterFactory.CollectionAdapter; JS lists are
 * plain arrays, so upstream's Collection/array distinction collapses here).
 *
 * The element-(de)serializer is resolved lazily per direction, so a
 * deserialize-only element-registration stays usable.
 */
export class CollectionAdapter<E> implements TypeAdapter<E[]> {
    private readonly blueNBT: BlueNBT;
    private readonly elementType: DeserializerSpec<E> | SerializerSpec<E>;
    private typeSerializer: TypeSerializer<E> | null = null;
    private typeDeserializer: TypeDeserializer<E> | null = null;

    constructor(blueNBT: BlueNBT, elementType: DeserializerSpec<E> | SerializerSpec<E>) {
        this.blueNBT = blueNBT;
        this.elementType = elementType;
    }

    private deserializer(): TypeDeserializer<E> {
        if (this.typeDeserializer === null)
            this.typeDeserializer = this.blueNBT.resolveDeserializer(
                this.elementType as DeserializerSpec<E>,
            );
        return this.typeDeserializer;
    }

    private serializer(): TypeSerializer<E> {
        if (this.typeSerializer === null)
            this.typeSerializer = this.blueNBT.resolveSerializer(
                this.elementType as SerializerSpec<E>,
            );
        return this.typeSerializer;
    }

    read(reader: NBTReader): E[] {
        const collection: E[] = [];
        reader.beginList();
        while (reader.hasNext()) {
            const instance = this.deserializer().read(reader);
            collection.push(instance);
        }
        reader.endList();
        return collection;
    }

    write(value: E[], writer: NBTWriter): void {
        const size = value.length;
        if (size === 0) {
            writer.beginList(size, serializerType(this.serializer() as TypeSerializer<never>));
            writer.endList();
        } else {
            writer.beginList(size);
            for (const element of value) {
                if (element == null) throw new Error("'null' values are not supported in a list.");
                this.serializer().write(element, writer);
            }
            writer.endList();
        }
    }

    type(): TagType {
        return TagType.LIST;
    }
}

/**
 * Creates a list-adapter spec for the given element-type, for use in object-schemas:
 * <code>fields: { serverBrands: { type: listOf(STRING) } }</code>
 */
export function listOf<E>(
    elementType: DeserializerSpec<E> | SerializerSpec<E>,
): (blueNBT: BlueNBT) => TypeAdapter<E[]> {
    return (blueNBT) => new CollectionAdapter(blueNBT, elementType);
}
