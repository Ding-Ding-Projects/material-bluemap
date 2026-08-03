import { describe, expect, it } from "vitest";
import { BlueNBT } from "../BlueNBT.js";
import { NBTReader } from "../NBTReader.js";
import { NBTWriter } from "../NBTWriter.js";
import { TagType } from "../TagType.js";
import { IOException, IllegalStateException } from "../Exceptions.js";
import type { TypeAdapter } from "../TypeAdapter.js";
import { LenientListAdapter } from "./LenientListAdapter.js";
import { STRING } from "../adapter/PrimitiveAdapters.js";
import { bytes, i32, utf } from "../../test/bytes.js";

interface Entry {
    ok: number;
}

/** reads { ok: byte }, throwing an IOException for ok == 0 */
const entryAdapter: TypeAdapter<Entry> = {
    read(reader) {
        let ok = -1;
        reader.beginCompound();
        while (reader.hasNext()) {
            if (reader.name() === "ok") ok = reader.nextByte();
            else reader.skip();
        }
        reader.endCompound();
        if (ok === 0) throw new IOException("broken entry");
        return { ok };
    },
    write(value, writer) {
        writer.beginCompound();
        writer.name("ok");
        writer.valueByte(value.ok);
        writer.endCompound();
    },
    type: () => TagType.COMPOUND,
};

function entryList(...oks: number[]): NBTReader {
    const writer = new NBTWriter();
    writer.beginList(oks.length, TagType.COMPOUND);
    for (const ok of oks) {
        writer.beginCompound();
        writer.name("ok");
        writer.valueByte(ok);
        writer.endCompound();
    }
    writer.endList();
    return new NBTReader(writer.toUint8Array());
}

describe("LenientListAdapter", () => {
    it("drops elements failing with IOExceptions and reports them", () => {
        const errors: IOException[] = [];
        const adapter = new LenientListAdapter(new BlueNBT(), entryAdapter, (error) =>
            errors.push(error),
        );

        const result = adapter.read(entryList(1, 0, 2));
        expect(result).toEqual([{ ok: 1 }, { ok: 2 }]);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.message).toBe("broken entry");
    });

    it("keeps the outer reader consumable after a broken element", () => {
        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("entries").beginList(2, TagType.COMPOUND);
        for (const ok of [0, 5]) {
            writer.beginCompound();
            writer.name("ok");
            writer.valueByte(ok);
            writer.endCompound();
        }
        writer.endList();
        writer.name("after").valueInt(9);
        writer.endCompound();

        const adapter = new LenientListAdapter(new BlueNBT(), entryAdapter, null);
        const reader = new NBTReader(writer.toUint8Array());
        reader.beginCompound();
        expect(reader.name()).toBe("entries");
        expect(adapter.read(reader)).toEqual([{ ok: 5 }]);
        expect(reader.name()).toBe("after");
        expect(reader.nextInt()).toBe(9);
        reader.endCompound();
    });

    it("propagates non-IOException errors", () => {
        const badAdapter: TypeAdapter<number> = {
            read: (reader) => reader.nextInt(), // wrong tag-type -> IllegalStateException
            write: (value, writer) => writer.valueInt(value),
            type: () => TagType.INT,
        };
        const adapter = new LenientListAdapter(new BlueNBT(), badAdapter, null);
        expect(() => adapter.read(entryList(1))).toThrow(IllegalStateException);
    });

    it("writes lists and uses the entry-serializer type for empty lists", () => {
        const adapter = new LenientListAdapter<string>(new BlueNBT(), STRING, null);

        const writer = new NBTWriter();
        adapter.write([], writer);
        expect([...writer.toUint8Array()]).toEqual([
            ...bytes(TagType.LIST, utf(""), TagType.STRING, i32(0)),
        ]);

        const writer2 = new NBTWriter();
        adapter.write(["a", "b"], writer2);
        expect([...writer2.toUint8Array()]).toEqual([
            ...bytes(TagType.LIST, utf(""), TagType.STRING, i32(2), utf("a"), utf("b")),
        ]);
    });
});
