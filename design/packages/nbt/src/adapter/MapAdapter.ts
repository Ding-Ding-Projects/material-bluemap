import { TagType } from "../TagType.js";
import type { NBTReader } from "../NBTReader.js";
import type { NBTWriter } from "../NBTWriter.js";
import type { BlueNBT } from "../BlueNBT.js";
import type { TypeAdapter } from "../TypeAdapter.js";
import type { TypeDeserializer } from "../TypeDeserializer.js";
import type { TypeSerializer } from "../TypeSerializer.js";
import type { DeserializerSpec, SerializerSpec } from "../TypeSpec.js";

/**
 * A {@link TypeAdapter} reading a compound-tag into a Map with string-keys
 * (port of upstream MapAdapterFactory.MapAdapter; enum-keys are not supported).
 */
export class MapAdapter<E> implements TypeAdapter<Map<string, E>> {
    private readonly blueNBT: BlueNBT;
    private readonly valueType: DeserializerSpec<E> | SerializerSpec<E>;
    private typeSerializer: TypeSerializer<E> | null = null;
    private typeDeserializer: TypeDeserializer<E> | null = null;

    constructor(blueNBT: BlueNBT, valueType: DeserializerSpec<E> | SerializerSpec<E>) {
        this.blueNBT = blueNBT;
        this.valueType = valueType;
    }

    private deserializer(): TypeDeserializer<E> {
        if (this.typeDeserializer === null)
            this.typeDeserializer = this.blueNBT.resolveDeserializer(
                this.valueType as DeserializerSpec<E>,
            );
        return this.typeDeserializer;
    }

    private serializer(): TypeSerializer<E> {
        if (this.typeSerializer === null)
            this.typeSerializer = this.blueNBT.resolveSerializer(
                this.valueType as SerializerSpec<E>,
            );
        return this.typeSerializer;
    }

    read(reader: NBTReader): Map<string, E> {
        const map = new Map<string, E>();
        reader.beginCompound();
        while (reader.hasNext()) {
            const keyString = reader.name();
            const instance = this.deserializer().read(reader);
            map.set(keyString, instance);
        }
        reader.endCompound();
        return map;
    }

    write(value: Map<string, E>, writer: NBTWriter): void {
        writer.beginCompound();
        for (const [key, entry] of value) {
            writer.name(key);
            this.serializer().write(entry, writer);
        }
        writer.endCompound();
    }

    type(): TagType {
        return TagType.COMPOUND;
    }
}

/**
 * Creates a map-adapter spec for the given value-type, for use in object-schemas:
 * <code>fields: { dimensions: { type: mapOf(dimensionSettingsToken) } }</code>
 */
export function mapOf<E>(
    valueType: DeserializerSpec<E> | SerializerSpec<E>,
): (blueNBT: BlueNBT) => TypeAdapter<Map<string, E>> {
    return (blueNBT) => new MapAdapter(blueNBT, valueType);
}
