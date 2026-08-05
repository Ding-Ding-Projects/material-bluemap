import { IOException, TagType } from "@material-bluemap/nbt";
import type { NBTReader, NBTWriter, TypeAdapter } from "@material-bluemap/nbt";
import type { BmMap } from "../../BmMap.js";

/**
 * upstream: `common/.../rendermanager/serialization/BmMapAdapter.java`
 *
 * A saved render-task refers to a map only by its id ({@link BmMap.getId}); reading one
 * back therefore needs the set of maps that actually exist *right now*, handed in rather
 * than reached for globally — restoring a queue is meaningless without knowing which maps
 * it can be restored against, and a map that no longer exists must fail clearly rather
 * than silently rendering nothing or crashing later with no context.
 *
 * upstream's own `read()` has a latent bug worth naming rather than reproducing: it calls
 * `reader.nextString()` a second time inside the "not found" branch to build the error
 * message, which — since {@link NBTReader}'s `next*` methods each consume one element —
 * would read whatever comes *after* the map id instead of repeating it, corrupting the
 * reader's position on the one path that is supposed to fail cleanly. This port reads the
 * id once and reuses it.
 */
export class BmMapAdapter implements TypeAdapter<BmMap> {
    readonly #maps: ReadonlyMap<string, BmMap>;

    constructor(maps: ReadonlyMap<string, BmMap>) {
        this.#maps = maps;
    }

    read(reader: NBTReader): BmMap {
        const id = reader.nextString();
        const map = this.#maps.get(id);
        if (map === undefined) throw new IOException(`No map with id '${id}' loaded.`);
        return map;
    }

    write(value: BmMap, writer: NBTWriter): void {
        writer.valueString(value.getId());
    }

    type(): TagType {
        return TagType.STRING;
    }
}
