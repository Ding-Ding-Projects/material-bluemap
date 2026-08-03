import { TagType } from "../TagType.js";
import { IOException } from "../Exceptions.js";
import type { NBTReader } from "../NBTReader.js";
import type { NBTWriter } from "../NBTWriter.js";
import type { BlueNBT } from "../BlueNBT.js";
import type { TypeAdapter } from "../TypeAdapter.js";
import { CollectionAdapter } from "../adapter/CollectionAdapter.js";
import type { DeserializerSpec, SerializerSpec } from "../TypeSpec.js";

/**
 * Port of BlueMap's de.bluecolored.bluemap.core.util.nbt.PalettedArrayAdapter:
 * a compound of { palette: LIST&lt;T&gt;, data: BYTE_ARRAY } expanded into a T[]
 * (upstream builds the palette-adapter through ArrayAdapterFactory; the port
 * uses the list-based CollectionAdapter which reads/writes the same LIST tag
 * for non-primitive element-types).
 */
export class PalettedArrayAdapter<T> implements TypeAdapter<T[]> {
    private readonly paletteAdapter: TypeAdapter<T[]>;

    constructor(blueNBT: BlueNBT, type: DeserializerSpec<T> | SerializerSpec<T>) {
        this.paletteAdapter = new CollectionAdapter(blueNBT, type);
    }

    read(reader: NBTReader): T[] {
        reader.beginCompound();
        let palette: T[] | null = null;
        let data: Int8Array | null = null;
        while (reader.hasNext()) {
            const name = reader.name();
            switch (name) {
                case "palette":
                    palette = this.paletteAdapter.read(reader);
                    break;
                case "data":
                    data = reader.nextArrayAsByteArray();
                    break;
                default:
                    reader.skip();
                    break;
            }
        }
        reader.endCompound();

        if (palette === null || palette.length === 0)
            throw new IOException("Missing or empty palette");
        if (data === null) return [];
        const result = new Array<T>(data.length);
        for (let i = 0; i < data.length; i++) {
            const index = data[i]!;
            if (index >= palette.length)
                throw new IOException(
                    "Palette (size: " +
                        palette.length +
                        ") does not contain entry-index (" +
                        index +
                        ")",
                );
            // a negative (signed-overflowed) index throws an ArrayIndexOutOfBoundsException upstream
            if (index < 0)
                throw new RangeError(
                    "Index " + index + " out of bounds for length " + palette.length,
                );
            result[i] = palette[index]!;
        }

        return result;
    }

    write(value: T[], writer: NBTWriter): void {
        // palette-dedupe is keyed by SameValueZero-equality here (upstream: equals/hashCode) —
        // exact for strings/primitives, identity for objects
        const paletteMap = new Map<T, number>();
        const data = new Int8Array(value.length);
        for (let i = 0; i < value.length; i++) {
            const element = value[i]!;
            let index = paletteMap.get(element);
            if (index === undefined) {
                // (byte) cast of the palette-size, overflowing like upstream for >127 entries
                index = (paletteMap.size << 24) >> 24;
                paletteMap.set(element, index);
            }
            data[i] = index;
        }

        const palette = new Array<T>(paletteMap.size);
        paletteMap.forEach((index, element) => {
            palette[index] = element;
        });

        writer.beginCompound();
        writer.name("palette");
        this.paletteAdapter.write(palette, writer);
        writer.name("data");
        writer.valueByteArray(data);
        writer.endCompound();
    }

    type(): TagType {
        return TagType.COMPOUND;
    }
}
