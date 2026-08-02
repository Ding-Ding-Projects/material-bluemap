import { describe, expect, it } from "vitest";
import { BlueNBT } from "../BlueNBT.js";
import { NBTReader } from "../NBTReader.js";
import { NBTWriter } from "../NBTWriter.js";
import { TypeToken } from "../TypeToken.js";
import { IOException } from "../Exceptions.js";
import { STRING } from "../adapter/PrimitiveAdapters.js";
import { PalettedArrayAdapter } from "./PalettedArrayAdapter.js";

function build(write: (writer: NBTWriter) => void): NBTReader {
    const writer = new NBTWriter();
    write(writer);
    return new NBTReader(writer.toUint8Array());
}

describe("PalettedArrayAdapter", () => {
    const adapter = new PalettedArrayAdapter<string>(new BlueNBT(), STRING);

    it("expands palette-indexed byte data", () => {
        const reader = build((w) => {
            w.beginCompound();
            w.name("palette").beginList(3);
            w.valueString("a");
            w.valueString("b");
            w.valueString("c");
            w.endList();
            w.name("data").valueByteArray(Int8Array.from([0, 1, 2, 2, 0]));
            w.name("ignored").valueInt(1); // unknown entries are skipped
            w.endCompound();
        });

        expect(adapter.read(reader)).toEqual(["a", "b", "c", "c", "a"]);
    });

    it("returns an empty array when data is missing", () => {
        const reader = build((w) => {
            w.beginCompound();
            w.name("palette").beginList(1);
            w.valueString("a");
            w.endList();
            w.endCompound();
        });

        expect(adapter.read(reader)).toEqual([]);
    });

    it("fails on a missing or empty palette", () => {
        const missing = build((w) => {
            w.beginCompound();
            w.name("data").valueByteArray(Int8Array.from([0]));
            w.endCompound();
        });
        expect(() => adapter.read(missing)).toThrow(IOException);
        expect(() => {
            const reader = build((w) => {
                w.beginCompound();
                w.name("data").valueByteArray(Int8Array.from([0]));
                w.endCompound();
            });
            adapter.read(reader);
        }).toThrow(/Missing or empty palette/);
    });

    it("fails on an out-of-range palette index", () => {
        const reader = build((w) => {
            w.beginCompound();
            w.name("palette").beginList(1);
            w.valueString("a");
            w.endList();
            w.name("data").valueByteArray(Int8Array.from([0, 1]));
            w.endCompound();
        });

        expect(() => adapter.read(reader)).toThrow(
            /Palette \(size: 1\) does not contain entry-index \(1\)/,
        );
    });

    it("writes a deduplicated palette and round-trips", () => {
        const value = ["stone", "dirt", "stone", "stone", "air", "dirt"];

        const writer = new NBTWriter();
        adapter.write(value, writer);
        const data = writer.toUint8Array();

        // decode raw to verify the palette got deduplicated
        const nbt = new BlueNBT();
        const rawResult = nbt.read(data, TypeToken.OBJECT) as Map<string, unknown>;
        expect(rawResult.get("palette")).toEqual(["stone", "dirt", "air"]);
        expect([...(rawResult.get("data") as Int8Array)]).toEqual([0, 1, 0, 0, 2, 1]);

        // round-trip
        expect(adapter.read(new NBTReader(data))).toEqual(value);
    });
});
