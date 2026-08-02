import { TagType } from "../TagType.js";
import { IOException } from "../Exceptions.js";
import { NBTReader } from "../NBTReader.js";
import type { NBTWriter } from "../NBTWriter.js";
import type { BlueNBT } from "../BlueNBT.js";
import type { TypeAdapter } from "../TypeAdapter.js";
import type { TypeDeserializer } from "../TypeDeserializer.js";
import type { TypeSerializer } from "../TypeSerializer.js";
import { serializerType } from "../TypeSerializer.js";
import type { DeserializerSpec, SerializerSpec } from "../TypeSpec.js";

/**
 * Port of BlueMap's de.bluecolored.bluemap.core.util.nbt.LenientListAdapter:
 * a list-adapter that recovers from per-element parse-errors ({@link IOException}s)
 * by dropping the broken element and reporting it to the error-handler, instead of
 * failing the whole list. (State-errors still propagate, matching upstream's
 * `catch (IOException e)`.)
 */
export class LenientListAdapter<E> implements TypeAdapter<E[]> {
    private readonly blueNBT: BlueNBT;
    private readonly entryType: DeserializerSpec<E> | SerializerSpec<E>;
    private readonly errorHandler: (error: IOException) => void;
    private entrySerializer: TypeSerializer<E> | null = null;
    private entryDeserializer: TypeDeserializer<E> | null = null;

    constructor(
        nbt: BlueNBT,
        entryType: DeserializerSpec<E> | SerializerSpec<E>,
        errorHandler?: ((error: IOException) => void) | null,
    ) {
        this.blueNBT = nbt;
        this.entryType = entryType;
        this.errorHandler = errorHandler ?? (() => {});
    }

    private deserializer(): TypeDeserializer<E> {
        if (this.entryDeserializer === null)
            this.entryDeserializer = this.blueNBT.resolveDeserializer(
                this.entryType as DeserializerSpec<E>,
            );
        return this.entryDeserializer;
    }

    private serializer(): TypeSerializer<E> {
        if (this.entrySerializer === null)
            this.entrySerializer = this.blueNBT.resolveSerializer(
                this.entryType as SerializerSpec<E>,
            );
        return this.entrySerializer;
    }

    read(reader: NBTReader): E[] {
        const list: E[] = [];
        reader.beginList();
        while (reader.hasNext()) {
            // to achieve error-recovery we need to fully consume the data first, and then parse it separately
            // otherwise the reader might be in an invalid state
            const data = reader.raw();
            try {
                const instance = this.deserializer().read(new NBTReader(data));
                list.push(instance);
            } catch (e) {
                if (e instanceof IOException) this.errorHandler(e);
                else throw e;
            }
        }
        reader.endList();
        return list;
    }

    write(value: E[], writer: NBTWriter): void {
        const size = value.length;
        if (size === 0) {
            writer.beginList(size, serializerType(this.serializer() as TypeSerializer<never>));
            writer.endList();
        } else {
            writer.beginList(size);
            for (const element of value) {
                if (element == null) continue;
                this.serializer().write(element, writer);
            }
            writer.endList();
        }
    }

    type(): TagType {
        return TagType.LIST;
    }
}
