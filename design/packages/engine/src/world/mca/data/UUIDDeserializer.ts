import {
    IOException,
    TagType,
    TypeToken,
    type NBTReader,
    type TypeDeserializer,
} from "@worldlens/nbt";

/** upstream: java.util.UUID — ported as its canonical string representation */
export const UUID_TOKEN: TypeToken<string> = TypeToken.of("UUID");

/** Formats the given most-/least-significant 64 bits like java.util.UUID#toString. */
export function uuidToString(mostSigBits: bigint, leastSigBits: bigint): string {
    const msb = BigInt.asUintN(64, mostSigBits);
    const lsb = BigInt.asUintN(64, leastSigBits);
    const digits = (value: bigint, count: number): string =>
        value.toString(16).padStart(count, "0").slice(-count);
    return (
        digits(msb >> 32n, 8) +
        "-" +
        digits(msb >> 16n, 4) +
        "-" +
        digits(msb, 4) +
        "-" +
        digits(lsb >> 48n, 4) +
        "-" +
        digits(lsb, 12)
    );
}

/** Parses a uuid-string like java.util.UUID#fromString (5 dash-separated hex components). */
export function uuidFromString(name: string): string {
    const components = name.split("-");
    if (components.length !== 5) throw new IOException("Invalid UUID string: " + name);
    const parse = (component: string): bigint => {
        if (!/^[0-9a-fA-F]{1,16}$/.test(component))
            throw new IOException("Invalid UUID string: " + name);
        return BigInt("0x" + component);
    };
    let mostSigBits = parse(components[0]!) << 32n;
    mostSigBits |= parse(components[1]!) << 16n;
    mostSigBits |= parse(components[2]!);
    let leastSigBits = parse(components[3]!) << 48n;
    leastSigBits |= parse(components[4]!);
    return uuidToString(mostSigBits, leastSigBits);
}

export class UUIDDeserializer implements TypeDeserializer<string> {
    read(reader: NBTReader): string {
        const tagType = reader.peek();

        if (tagType === TagType.STRING) return uuidFromString(reader.nextString());

        if (tagType === TagType.INT_ARRAY) {
            const ints = reader.nextIntArray();
            if (ints.length !== 4)
                throw new IOException(
                    "Unexpected number of UUID-ints, expected 4, got " + ints.length,
                );
            // new UUID((long) ints[0] << 32 | ints[1], (long) ints[2] << 32 | ints[3])
            // (the | sign-extends the second int, flooding the high 32 bits — kept bug-for-bug)
            return uuidToString(
                (BigInt(ints[0]!) << 32n) | BigInt.asUintN(64, BigInt(ints[1]!)),
                (BigInt(ints[2]!) << 32n) | BigInt.asUintN(64, BigInt(ints[3]!)),
            );
        }

        const longs = reader.nextLongArray();
        if (longs.length !== 2)
            throw new IOException(
                "Unexpected number of UUID-longs, expected 2, got " + longs.length,
            );
        return uuidToString(longs[0]!, longs[1]!);
    }
}
