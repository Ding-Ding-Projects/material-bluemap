import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { NBTReader } from "./NBTReader.js";
import { TagType } from "./TagType.js";
import { EOFException, IllegalArgumentException, IllegalStateException } from "./Exceptions.js";
import { bytes, f32, f64, i32, i64, utf } from "../test/bytes.js";

describe("NBTReader", () => {
    it("reads every primitive tag type byte-by-byte", () => {
        const data = bytes(
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
            TagType.END,
        );

        const reader = new NBTReader(data);
        expect(reader.peek()).toBe(TagType.COMPOUND);
        expect(reader.name()).toBe("");
        reader.beginCompound();

        expect(reader.peek()).toBe(TagType.BYTE);
        expect(reader.name()).toBe("aByte");
        expect(reader.nextByte()).toBe(-10);

        expect(reader.name()).toBe("aShort");
        expect(reader.nextShort()).toBe(-500);

        expect(reader.name()).toBe("anInt");
        expect(reader.nextInt()).toBe(123456);

        expect(reader.name()).toBe("aLong");
        expect(reader.nextLong()).toBe(-10n);

        expect(reader.name()).toBe("aFloat");
        expect(reader.nextFloat()).toBe(1.5);

        expect(reader.name()).toBe("aDouble");
        expect(reader.nextDouble()).toBe(-2.75);

        expect(reader.name()).toBe("aString");
        expect(reader.nextString()).toBe("hëllo€");

        expect(reader.hasNext()).toBe(false);
        reader.endCompound();
        expect(() => reader.peek()).toThrow(EOFException);
    });

    it("decodes modified-utf8 strings (2-byte NUL, 3-byte chars, surrogate pairs)", () => {
        // "a\0b€😀" — NUL as C0 80, € as 3 bytes, 😀 as CESU-8 surrogate pair (2x 3 bytes)
        const encoded = [
            0x61, 0xc0, 0x80, 0x62, 0xe2, 0x82, 0xac, 0xed, 0xa0, 0xbd, 0xed, 0xb8, 0x80,
        ];
        const data = bytes(
            TagType.STRING,
            utf(""),
            [encoded.length >>> 8, encoded.length & 0xff],
            encoded,
        );
        const reader = new NBTReader(data);
        expect(reader.nextString()).toBe("a\0b€😀");
    });

    it("reads byte/int/long arrays as signed typed arrays", () => {
        const data = bytes(
            TagType.COMPOUND,
            utf(""),
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
        );

        const reader = new NBTReader(data);
        reader.beginCompound();

        expect(reader.name()).toBe("ba");
        const ba = reader.nextByteArray();
        expect(ba).toBeInstanceOf(Int8Array);
        expect([...ba]).toEqual([0, 110, -4]);

        expect(reader.name()).toBe("ia");
        const ia = reader.nextIntArray();
        expect(ia).toBeInstanceOf(Int32Array);
        expect([...ia]).toEqual([0, -10342, 30]);

        expect(reader.name()).toBe("la");
        const la = reader.nextLongArray();
        expect(la).toBeInstanceOf(BigInt64Array);
        expect([...la]).toEqual([289374678734n, -4n]);

        reader.endCompound();
    });

    it("reads long arrays as raw big-endian bytes without copying", () => {
        const data = bytes(
            TagType.COMPOUND,
            utf(""),
            TagType.LONG_ARRAY,
            utf("la"),
            i32(2),
            i64(0x0102030405060708n),
            i64(-1n),
            TagType.INT,
            utf("after"),
            i32(7),
            TagType.END,
        );

        const reader = new NBTReader(data);
        reader.beginCompound();
        expect(reader.name()).toBe("la");
        const raw = reader.nextLongArrayAsBytes();
        expect(raw.length).toBe(16);
        expect([...raw]).toEqual([
            1, 2, 3, 4, 5, 6, 7, 8, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
        ]);
        // zero-copy view into the source data
        expect(raw.buffer).toBe(data.buffer);
        // the reader continues correctly after the raw read
        expect(reader.name()).toBe("after");
        expect(reader.nextInt()).toBe(7);
        reader.endCompound();
    });

    it("reads partial arrays into provided buffers and skips the rest", () => {
        const data = bytes(
            TagType.COMPOUND,
            utf(""),
            TagType.BYTE_ARRAY,
            utf("ba"),
            i32(4),
            1,
            2,
            3,
            4,
            TagType.INT_ARRAY,
            utf("ia"),
            i32(2),
            i32(5),
            i32(6),
            TagType.END,
        );

        const reader = new NBTReader(data);
        reader.beginCompound();

        const small = new Int8Array(2);
        expect(reader.nextByteArray(small)).toBe(4);
        expect([...small]).toEqual([1, 2]);

        const big = new Int32Array(4);
        expect(reader.nextIntArray(big)).toBe(2);
        expect([...big]).toEqual([5, 6, 0, 0]);

        reader.endCompound();
    });

    it("converts between array types like upstream reflection widening", () => {
        const doc = (tag: TagType, payload: number[]) =>
            new NBTReader(bytes(tag, utf(""), payload));

        // widening conversions
        expect([
            ...doc(TagType.BYTE_ARRAY, [...i32(3), 0x01, 0xff, 0x7f]).nextArrayAsLongArray(),
        ]).toEqual([1n, -1n, 127n]);
        expect([
            ...doc(TagType.INT_ARRAY, [...i32(2), ...i32(-7), ...i32(42)]).nextArrayAsLongArray(),
        ]).toEqual([-7n, 42n]);
        expect([...doc(TagType.BYTE_ARRAY, [...i32(2), 0x80, 0x05]).nextArrayAsIntArray()]).toEqual(
            [-128, 5],
        );

        // identity
        expect([
            ...doc(TagType.LONG_ARRAY, [...i32(1), ...i64(9n)]).nextArrayAsLongArray(),
        ]).toEqual([9n]);

        // narrowing conversions throw (upstream: reflection IllegalArgumentException)
        expect(() =>
            doc(TagType.LONG_ARRAY, [...i32(1), ...i64(9n)]).nextArrayAsIntArray(),
        ).toThrow(IllegalArgumentException);
        expect(() => doc(TagType.INT_ARRAY, [...i32(1), ...i32(9)]).nextArrayAsByteArray()).toThrow(
            IllegalArgumentException,
        );

        // non-array tags throw an IllegalStateException
        expect(() => doc(TagType.INT, i32(1)).nextArrayAsLongArray()).toThrow(
            IllegalStateException,
        );
    });

    it("reads lists, empty lists and nested lists", () => {
        const data = bytes(
            TagType.COMPOUND,
            utf(""),
            TagType.LIST,
            utf("strings"),
            TagType.STRING,
            i32(2),
            utf("a"),
            utf("b"),
            TagType.LIST,
            utf("empty"),
            TagType.END,
            i32(0),
            TagType.LIST,
            utf("nested"),
            TagType.LIST,
            i32(1),
            TagType.INT,
            i32(2),
            i32(1),
            i32(2),
            TagType.LIST,
            utf("compounds"),
            TagType.COMPOUND,
            i32(1),
            TagType.BYTE,
            utf("x"),
            0x05,
            TagType.END,
            TagType.END,
        );

        const reader = new NBTReader(data);
        reader.beginCompound();

        expect(reader.name()).toBe("strings");
        expect(reader.beginList()).toBe(2);
        expect(reader.remainingListItems()).toBe(2);
        // list elements have no name
        expect(reader.name()).toBe("<unknown>");
        expect(reader.nextString()).toBe("a");
        expect(reader.remainingListItems()).toBe(1);
        expect(reader.nextString()).toBe("b");
        expect(reader.peek()).toBe(TagType.END);
        reader.endList();

        expect(reader.name()).toBe("empty");
        expect(reader.beginList()).toBe(0);
        expect(reader.hasNext()).toBe(false);
        reader.endList();

        expect(reader.name()).toBe("nested");
        expect(reader.beginList()).toBe(1);
        expect(reader.beginList()).toBe(2);
        expect(reader.nextInt()).toBe(1);
        expect(reader.nextInt()).toBe(2);
        reader.endList();
        reader.endList();

        expect(reader.name()).toBe("compounds");
        expect(reader.beginList()).toBe(1);
        expect(reader.inList()).toBe(true);
        reader.beginCompound();
        expect(reader.inCompound()).toBe(true);
        expect(reader.name()).toBe("x");
        expect(reader.nextByte()).toBe(5);
        reader.endCompound();
        reader.endList();

        reader.endCompound();
    });

    it("skips elements of every type without materializing", () => {
        const data = bytes(
            TagType.COMPOUND,
            utf(""),
            TagType.COMPOUND,
            utf("nested"),
            TagType.STRING,
            utf("s"),
            utf("val"),
            TagType.LIST,
            utf("l"),
            TagType.DOUBLE,
            i32(2),
            f64(1),
            f64(2),
            TagType.END,
            TagType.LIST,
            utf("fastInts"),
            TagType.INT,
            i32(3),
            i32(1),
            i32(2),
            i32(3),
            TagType.BYTE_ARRAY,
            utf("ba"),
            i32(2),
            1,
            2,
            TagType.LONG_ARRAY,
            utf("la"),
            i32(1),
            i64(5n),
            TagType.STRING,
            utf("str"),
            utf("x"),
            TagType.INT,
            utf("keep"),
            i32(99),
            TagType.END,
        );

        const reader = new NBTReader(data);
        reader.beginCompound();
        reader.skip(); // nested compound
        reader.skip(); // fast list-skip (fixed-size elements)
        reader.skip(); // byte array
        reader.skip(); // long array
        reader.skip(); // string
        expect(reader.name()).toBe("keep");
        expect(reader.nextInt()).toBe(99);
        reader.endCompound();
    });

    it("skips out of nesting levels with skip(out)", () => {
        const data = bytes(
            TagType.COMPOUND,
            utf(""),
            TagType.COMPOUND,
            utf("inner"),
            TagType.INT,
            utf("a"),
            i32(1),
            TagType.INT,
            utf("b"),
            i32(2),
            TagType.END,
            TagType.INT,
            utf("after"),
            i32(3),
            TagType.END,
        );

        const reader = new NBTReader(data);
        reader.beginCompound();
        reader.beginCompound();
        expect(reader.nextInt()).toBe(1);
        reader.skip(1); // skip "b" and consume the END of "inner"
        expect(reader.name()).toBe("after");
        expect(reader.nextInt()).toBe(3);
        reader.endCompound();
    });

    it("returns raw element bytes including tag-id and name", () => {
        const inner = bytes(TagType.INT, utf("x"), i32(5));
        const data = bytes(TagType.COMPOUND, utf(""), inner, TagType.END);

        // name() called before raw() keeps the real name (as done by the object-deserializer)
        const reader = new NBTReader(data);
        reader.beginCompound();
        reader.name();
        expect([...reader.raw()]).toEqual([...inner]);
        reader.endCompound();

        // without a prior name() call the name is already consumed and replaced
        // by "<unknown>" (mirrors upstream: checkState() runs before logging starts)
        const reader2 = new NBTReader(data);
        reader2.beginCompound();
        expect([...reader2.raw()]).toEqual([...bytes(TagType.INT, utf("<unknown>"), i32(5))]);
        reader2.endCompound();
    });

    it("re-labels raw list elements with the unknown-name", () => {
        const data = bytes(
            TagType.COMPOUND,
            utf(""),
            TagType.LIST,
            utf("l"),
            TagType.COMPOUND,
            i32(1),
            TagType.BYTE,
            utf("v"),
            7,
            TagType.END,
            TagType.END,
        );

        const reader = new NBTReader(data);
        reader.beginCompound();
        reader.beginList();
        const raw = reader.raw();
        // COMPOUND + "<unknown>" + { v: 7b }
        expect([...raw]).toEqual([
            ...bytes(TagType.COMPOUND, utf("<unknown>"), TagType.BYTE, utf("v"), 7, TagType.END),
        ]);
        reader.endList();
        reader.endCompound();

        // the raw data is a standalone parsable nbt-document
        const rawReader = new NBTReader(raw);
        expect(rawReader.name()).toBe("<unknown>");
        rawReader.beginCompound();
        expect(rawReader.nextByte()).toBe(7);
        rawReader.endCompound();
    });

    it("reports state errors with upstream messages", () => {
        const data = bytes(TagType.COMPOUND, utf(""), TagType.BYTE, utf("b"), 1, TagType.END);
        const reader = new NBTReader(data);
        reader.beginCompound();
        expect(() => reader.nextInt()).toThrow(IllegalStateException);
        expect(() => reader.nextInt()).toThrow(/Expected type INT but got BYTE/);

        const reader2 = new NBTReader(data);
        reader2.beginCompound();
        reader2.nextByte();
        expect(() => reader2.skip()).toThrow(/Can not skip END tag!/);
        expect(() => reader2.endList()).toThrow(/not in a list/i);
    });

    it("throws EOFException on truncated data", () => {
        const data = bytes(TagType.COMPOUND, utf(""), TagType.INT, utf("x"), 0x00, 0x00);
        const reader = new NBTReader(data);
        reader.beginCompound();
        expect(() => reader.nextInt()).toThrow(EOFException);
    });

    it("tracks the current path", () => {
        const data = bytes(
            TagType.COMPOUND,
            utf(""),
            TagType.COMPOUND,
            utf("child"),
            TagType.INT,
            utf("value"),
            i32(1),
            TagType.END,
            TagType.END,
        );
        const reader = new NBTReader(data);
        reader.beginCompound();
        reader.name();
        reader.beginCompound();
        reader.name();
        expect(reader.path()).toBe("child.value");
    });

    // port of upstream NBTReaderTest#testNbtReader against the real level.dat
    it("reads the level.dat reference file (upstream NBTReaderTest)", () => {
        const data = gunzipSync(
            readFileSync(new URL("../test/fixtures/level.dat", import.meta.url)),
        );
        const reader = new NBTReader(data);

        // root
        expect(reader.peek()).toBe(TagType.COMPOUND);
        expect(reader.name()).toBe("");
        reader.beginCompound();

        expect(reader.peek()).toBe(TagType.COMPOUND);
        expect(reader.name()).toBe("Data");
        reader.beginCompound();

        expect(reader.name()).toBe("Difficulty");
        expect(reader.peek()).toBe(TagType.BYTE);
        expect(reader.nextByte()).toBe(1);

        expect(reader.name()).toBe("thunderTime");
        expect(reader.peek()).toBe(TagType.INT);
        expect(reader.nextInt()).toBe(51264);

        expect(reader.name()).toBe("BorderSize");
        expect(reader.peek()).toBe(TagType.DOUBLE);
        expect(reader.nextDouble()).toBe(1000);

        expect(reader.name()).toBe("LastPlayed");
        expect(reader.peek()).toBe(TagType.LONG);
        expect(reader.nextLong()).toBe(1687182273928n);

        reader.skip();
        reader.skip();
        reader.skip();
        reader.skip();
        reader.skip();

        expect(reader.name()).toBe("version");
        expect(reader.peek()).toBe(TagType.INT);
        expect(reader.nextInt()).toBe(19133);

        expect(reader.name()).toBe("ServerBrands");
        expect(reader.peek()).toBe(TagType.LIST);
        reader.beginList();
        expect(reader.peek()).toBe(TagType.STRING);
        expect(reader.nextString()).toBe("Paper");
        expect(reader.peek()).toBe(TagType.END);
        reader.endList();

        reader.skip();
        reader.skip();
        reader.skip();

        expect(reader.name()).toBe("SpawnAngle");
        expect(reader.peek()).toBe(TagType.FLOAT);
        expect(reader.nextFloat()).toBe(0);

        expect(reader.name()).toBe("LevelName");
        expect(reader.peek()).toBe(TagType.STRING);
        expect(reader.nextString()).toBe("world");

        reader.skip();

        expect(reader.name()).toBe("ScheduledEvents");
        reader.beginList();
        expect(reader.peek()).toBe(TagType.END);
        reader.endList();

        for (let i = 0; i < 12; i++) reader.skip();

        expect(reader.name()).toBe("WorldGenSettings");
        reader.beginCompound();
        expect(reader.nextByte()).toBe(0);
        expect(reader.name()).toBe("generate_features");
        reader.skip();
        expect(reader.name()).toBe("dimensions");
        reader.skip(); // skip over lots of nested compounds
        expect(reader.name()).toBe("seed");
        expect(reader.peek()).toBe(TagType.LONG);
        expect(reader.nextLong()).toBe(-6450009625622499088n);
        expect(reader.peek()).toBe(TagType.END);
        reader.endCompound(); // end WorldGenSettings compound

        expect(reader.name()).toBe("rainTime");
        expect(reader.peek()).toBe(TagType.INT);

        reader.skip(1); // skip over everything until we are out of the DATA compound

        expect(reader.peek()).toBe(TagType.END);
        reader.endCompound();

        expect(() => reader.peek()).toThrow(EOFException);
    });
});
