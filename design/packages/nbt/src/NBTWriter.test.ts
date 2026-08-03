import { describe, expect, it } from "vitest";
import { NBTWriter } from "./NBTWriter.js";
import { NBTReader } from "./NBTReader.js";
import { TagType } from "./TagType.js";
import { IOException, IllegalStateException } from "./Exceptions.js";
import { bytes, f32, f64, i32, i64, utf } from "../test/bytes.js";

describe("NBTWriter", () => {
    it("writes every value type byte-by-byte", () => {
        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("aByte").valueByte(-10);
        writer.name("aShort").valueShort(-500);
        writer.name("anInt").valueInt(123456);
        writer.name("aLong").valueLong(-10n);
        writer.name("aFloat").valueFloat(1.5);
        writer.name("aDouble").valueDouble(-2.75);
        writer.name("aString").valueString("hëllo€");
        writer.name("ba").valueByteArray(Int8Array.from([0, 110, -4]));
        writer.name("ia").valueIntArray(Int32Array.from([0, -10342, 30]));
        writer.name("la").valueLongArray(BigInt64Array.from([289374678734n, -4n]));
        writer.endCompound();
        writer.close();

        expect([...writer.toUint8Array()]).toEqual([
            ...bytes(
                TagType.COMPOUND,
                utf(""),
                TagType.BYTE,
                utf("aByte"),
                0xf6,
                TagType.SHORT,
                utf("aShort"),
                0xfe,
                0x0c,
                TagType.INT,
                utf("anInt"),
                i32(123456),
                TagType.LONG,
                utf("aLong"),
                i64(-10n),
                TagType.FLOAT,
                utf("aFloat"),
                f32(1.5),
                TagType.DOUBLE,
                utf("aDouble"),
                f64(-2.75),
                TagType.STRING,
                utf("aString"),
                utf("hëllo€"),
                TagType.BYTE_ARRAY,
                utf("ba"),
                i32(3),
                0x00,
                0x6e,
                0xfc,
                TagType.INT_ARRAY,
                utf("ia"),
                i32(3),
                i32(0),
                i32(-10342),
                i32(30),
                TagType.LONG_ARRAY,
                utf("la"),
                i32(2),
                i64(289374678734n),
                i64(-4n),
                TagType.END,
            ),
        ]);
    });

    it("encodes strings as modified utf-8 (NUL as C0 80)", () => {
        const writer = new NBTWriter();
        writer.valueString("a\0b");
        expect([...writer.toUint8Array()]).toEqual([
            TagType.STRING,
            0,
            0,
            0,
            4,
            0x61,
            0xc0,
            0x80,
            0x62,
        ]);
    });

    it("writes list headers lazily with the first element tag", () => {
        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("l").beginList(2);
        writer.valueDouble(0.5);
        writer.valueDouble(1.5);
        writer.endList();
        writer.endCompound();
        writer.close();

        expect([...writer.toUint8Array()]).toEqual([
            ...bytes(
                TagType.COMPOUND,
                utf(""),
                TagType.LIST,
                utf("l"),
                TagType.DOUBLE,
                i32(2),
                f64(0.5),
                f64(1.5),
                TagType.END,
            ),
        ]);
    });

    it("writes empty lists with an explicit element type", () => {
        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("el").beginList(0, TagType.STRING);
        writer.endList();
        writer.endCompound();
        writer.close();

        expect([...writer.toUint8Array()]).toEqual([
            ...bytes(
                TagType.COMPOUND,
                utf(""),
                TagType.LIST,
                utf("el"),
                TagType.STRING,
                i32(0),
                TagType.END,
            ),
        ]);
    });

    // port of upstream NBTWriterTest#testNbtWriter (writer-side + reading everything back)
    it("round-trips a complex document (upstream NBTWriterTest)", () => {
        const writer = new NBTWriter();

        expect(writer.inCompound()).toBe(false);
        expect(writer.inList()).toBe(false);

        writer.beginCompound();

        expect(writer.inCompound()).toBe(true);
        expect(writer.inList()).toBe(false);

        writer.name("testByte").valueByte(10);
        writer.name("testShort").valueShort(-23);
        writer.name("testInt").valueInt(1034);
        writer.name("testLong").valueLong(289374678734n);
        writer.name("testFloat").valueFloat(Math.fround(-2.653));
        writer.name("testDouble").valueDouble(4.653);
        writer.name("testCompound").beginCompound();

        expect(writer.inCompound()).toBe(true);
        expect(writer.inList()).toBe(false);

        writer.name("testList").beginList(3);

        expect(writer.inList()).toBe(true);
        expect(writer.inCompound()).toBe(false);

        writer.valueDouble(0.43);
        writer.valueDouble(-0.43);
        writer.valueDouble(1);
        writer.endList(); // testList

        writer.name("compoundList").beginList(2);

        writer.beginCompound();
        writer.endCompound();

        writer.beginCompound();
        expect(writer.inCompound()).toBe(true);
        expect(writer.inList()).toBe(false);
        writer.name("listInList").beginList(1);
        writer.beginCompound();
        writer.endCompound();
        writer.endList(); // listInList
        writer.endCompound();

        writer.endList(); // compoundList

        writer.name("testByteArray").valueByteArray(Int8Array.from([0, 110, 30, 20, 3, -4]));
        writer.name("testIntArray").valueIntArray(Int32Array.from([0, -10342, 30, 20, 3, -4]));
        writer
            .name("testLongArray")
            .valueLongArray(BigInt64Array.from([0n, 110n, 289374678734n, 20n, 3n, -4n]));

        expect(writer.inCompound()).toBe(true);
        expect(writer.inList()).toBe(false);

        writer.endCompound(); // testCompound
        writer.endCompound(); // root

        expect(writer.inCompound()).toBe(false);
        expect(writer.inList()).toBe(false);

        writer.close();
        const reader = new NBTReader(writer.toUint8Array());

        reader.beginCompound();

        expect(reader.peek()).toBe(TagType.BYTE);
        expect(reader.name()).toBe("testByte");
        expect(reader.nextByte()).toBe(10);

        expect(reader.peek()).toBe(TagType.SHORT);
        expect(reader.name()).toBe("testShort");
        expect(reader.nextShort()).toBe(-23);

        expect(reader.peek()).toBe(TagType.INT);
        expect(reader.name()).toBe("testInt");
        expect(reader.nextInt()).toBe(1034);

        expect(reader.peek()).toBe(TagType.LONG);
        expect(reader.name()).toBe("testLong");
        expect(reader.nextLong()).toBe(289374678734n);

        expect(reader.peek()).toBe(TagType.FLOAT);
        expect(reader.name()).toBe("testFloat");
        expect(reader.nextFloat()).toBe(Math.fround(-2.653));

        expect(reader.peek()).toBe(TagType.DOUBLE);
        expect(reader.name()).toBe("testDouble");
        expect(reader.nextDouble()).toBe(4.653);

        expect(reader.peek()).toBe(TagType.COMPOUND);
        expect(reader.name()).toBe("testCompound");
        reader.beginCompound();

        expect(reader.peek()).toBe(TagType.LIST);
        expect(reader.name()).toBe("testList");
        expect(reader.beginList()).toBe(3);
        expect(reader.nextDouble()).toBe(0.43);
        expect(reader.nextDouble()).toBe(-0.43);
        expect(reader.nextDouble()).toBe(1);
        reader.endList();

        expect(reader.peek()).toBe(TagType.LIST);
        expect(reader.name()).toBe("compoundList");
        expect(reader.beginList()).toBe(2);
        reader.beginCompound();
        reader.endCompound();
        reader.beginCompound();
        expect(reader.name()).toBe("listInList");
        expect(reader.beginList()).toBe(1);
        reader.beginCompound();
        reader.endCompound();
        reader.endList();
        reader.endCompound();
        reader.endList();

        expect([...reader.nextByteArray()]).toEqual([0, 110, 30, 20, 3, -4]);
        expect([...reader.nextIntArray()]).toEqual([0, -10342, 30, 20, 3, -4]);
        expect([...reader.nextLongArray()]).toEqual([0n, 110n, 289374678734n, 20n, 3n, -4n]);

        reader.endCompound();
        reader.endCompound();
    });

    it("validates name and list state", () => {
        // (each case uses a fresh writer — like upstream, a failed write may already
        // have emitted the tag-byte, leaving the writer unusable)
        const withCompound = () => {
            const writer = new NBTWriter();
            writer.beginCompound();
            return writer;
        };

        let writer = withCompound();
        writer.name("a");
        expect(() => writer.name("b")).toThrow(/The name was already set/);
        writer.valueInt(1);

        // value without a name inside a compound
        writer = withCompound();
        expect(() => writer.valueInt(2)).toThrow(/Name is not set/);

        // wrong element type in a list
        writer = withCompound();
        writer.name("list").beginList(2);
        writer.valueInt(1);
        expect(() => writer.valueByte(1)).toThrow(/Wrong tag-type. Expected type INT but got BYTE/);

        // name inside a list
        writer = withCompound();
        writer.name("list").beginList(2);
        writer.valueInt(1);
        writer.name("nope");
        expect(() => writer.valueInt(2)).toThrow(IllegalStateException);
    });

    it("fails closing an incomplete document", () => {
        const writer = new NBTWriter();
        writer.beginCompound();
        expect(() => writer.close()).toThrow(IOException);
    });

    it("grows its internal buffer beyond the initial capacity", () => {
        const writer = new NBTWriter();
        writer.beginCompound();
        const big = new Int8Array(5000).fill(7);
        writer.name("big").valueByteArray(big);
        writer.endCompound();
        writer.close();

        const reader = new NBTReader(writer.toUint8Array());
        reader.beginCompound();
        const read = reader.nextByteArray();
        expect(read.length).toBe(5000);
        expect(read[4999]).toBe(7);
        reader.endCompound();
    });
});
