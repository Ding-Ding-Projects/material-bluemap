import { describe, expect, it } from "vitest";
import { NBTReader } from "../NBTReader.js";
import { NBTWriter } from "../NBTWriter.js";
import { NumberFormatException } from "../Exceptions.js";
import {
    javaByteCast,
    javaIntCast,
    javaLongCast,
    javaShortCast,
    readBool,
    readByte,
    readDouble,
    readFloat,
    readInt,
    readLong,
    readShort,
    readString,
} from "./PrimitiveAdapters.js";

/** builds a document containing a single root-level value and returns a reader positioned on it */
function valueReader(write: (writer: NBTWriter) => void): NBTReader {
    const writer = new NBTWriter();
    write(writer);
    return new NBTReader(writer.toUint8Array());
}

describe("PrimitiveAdapters", () => {
    it("applies Java primitive-cast semantics", () => {
        expect(javaIntCast(Number.NaN)).toBe(0);
        expect(javaIntCast(1e12)).toBe(2147483647);
        expect(javaIntCast(-1e12)).toBe(-2147483648);
        expect(javaIntCast(-2.9)).toBe(-2);
        expect(javaByteCast(300)).toBe(44);
        expect(javaShortCast(65535)).toBe(-1);
        expect(javaLongCast(Number.NaN)).toBe(0n);
        expect(javaLongCast(1e30)).toBe(9223372036854775807n);
        expect(javaLongCast(-3.7)).toBe(-3n);
    });

    it("converts between number tags with Java narrowing", () => {
        // (int) of a long keeps the low 32 bits
        expect(readInt(valueReader((w) => w.valueLong(0x1_0000_0001n)))).toBe(1);
        // (byte) of an int
        expect(readByte(valueReader((w) => w.valueInt(300)))).toBe(44);
        // (short) of a double truncates through int
        expect(readShort(valueReader((w) => w.valueDouble(-12.9)))).toBe(-12);
        // (int) of NaN is 0
        expect(readInt(valueReader((w) => w.valueDouble(Number.NaN)))).toBe(0);
        // long from int widens exactly
        expect(readLong(valueReader((w) => w.valueInt(-5)))).toBe(-5n);
        // float from double rounds to f32
        expect(readFloat(valueReader((w) => w.valueDouble(0.1)))).toBe(Math.fround(0.1));
        // double from float keeps the f32 value
        expect(readDouble(valueReader((w) => w.valueFloat(1.5)))).toBe(1.5);
    });

    it("parses strings like Java's parse-methods", () => {
        expect(readInt(valueReader((w) => w.valueString("-123")))).toBe(-123);
        expect(readLong(valueReader((w) => w.valueString("-6450009625622499088")))).toBe(
            -6450009625622499088n,
        );
        expect(readDouble(valueReader((w) => w.valueString("0.25")))).toBe(0.25);
        expect(readBool(valueReader((w) => w.valueString("TRUE")))).toBe(true);
        expect(readBool(valueReader((w) => w.valueString("nope")))).toBe(false);
        expect(readString(valueReader((w) => w.valueLong(42n)))).toBe("42");

        expect(() => readInt(valueReader((w) => w.valueString("12.5")))).toThrow(
            NumberFormatException,
        );
        expect(() => readInt(valueReader((w) => w.valueString("99999999999")))).toThrow(
            NumberFormatException,
        );
        expect(() => readLong(valueReader((w) => w.valueString("abc")))).toThrow(
            NumberFormatException,
        );
    });

    it("reads booleans from any number tag", () => {
        expect(readBool(valueReader((w) => w.valueByte(0)))).toBe(false);
        expect(readBool(valueReader((w) => w.valueByte(1)))).toBe(true);
        expect(readBool(valueReader((w) => w.valueLong(0n)))).toBe(false);
        expect(readBool(valueReader((w) => w.valueDouble(0.5)))).toBe(true);
    });
});
