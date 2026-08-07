import { TagType } from "@worldlens/nbt";
import type { NBTReader, NBTWriter, TypeAdapter } from "@worldlens/nbt";
import { Vector2i } from "@worldlens/shared";

/**
 * upstream: `common/.../rendermanager/serialization/Vector2iAdapter.java`
 *
 * A region position as a two-element int list — `[x, y]` — matching upstream's
 * `beginList(2)` exactly rather than the flexible int-array / list / compound forms
 * {@link Vector2iDeserializer} in `world/mca/data` accepts. That deserializer reads
 * Minecraft's own world-data, which stores positions in whichever of those shapes a given
 * version happens to use; this one is a queue-file this port controls end to end, so it
 * only ever has to read what it itself wrote.
 */
export class Vector2iAdapter implements TypeAdapter<Vector2i> {
    read(reader: NBTReader): Vector2i {
        reader.beginList();
        const x = reader.nextInt();
        const y = reader.nextInt();
        reader.endList();
        return new Vector2i(x, y);
    }

    write(value: Vector2i, writer: NBTWriter): void {
        writer.beginList(2);
        writer.valueInt(value.getX());
        writer.valueInt(value.getY());
        writer.endList();
    }

    type(): TagType {
        return TagType.LIST;
    }
}
