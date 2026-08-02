import { TagType, tagTypeForId, tagTypeName, tagTypeSize } from "./TagType.js";
import { EOFException, IllegalArgumentException, IllegalStateException } from "./Exceptions.js";
import { decodeModifiedUtf8, encodeModifiedUtf8 } from "./ModifiedUtf8.js";

const UNKNOWN_NAME = "<unknown>";

/**
 * Can be used to directly read raw nbt-data from a byte-buffer.
 * (Upstream NBTReader streams from any InputStream; this port reads from an
 * in-memory Uint8Array, which also serves as the "log" for {@link NBTReader#raw}.)
 */
export class NBTReader {
    private readonly data: Uint8Array;
    private readonly view: DataView;
    private pos: number = 0;

    private stackPosition = 0;
    private stack: (TagType | null)[] = new Array<TagType | null>(32).fill(null);
    private nameStack: (string | null)[] = new Array<string | null>(32).fill(null);
    private listStack: number[] = new Array<number>(32).fill(0);

    constructor(data: Uint8Array) {
        this.data = data;
        this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    }

    peek(): TagType {
        let peek = this.stack[this.stackPosition] ?? null;
        if (peek === null) {
            peek = this.readTag();
            this.stack[this.stackPosition] = peek;
        }
        return peek;
    }

    name(): string {
        let name = this.nameStack[this.stackPosition] ?? null;
        if (name === null) {
            if (this.peek() !== TagType.END) {
                name = this.readUTF();
            } else {
                name = UNKNOWN_NAME;
            }
            this.nameStack[this.stackPosition] = name;
        }
        return name;
    }

    beginCompound(): void {
        this.checkState(TagType.COMPOUND);
        this.advanceStack();
    }

    endCompound(): void {
        this.checkState(TagType.END);
        if (!this.inCompound())
            throw new IllegalStateException(
                "Can not end compound. Current element is not in a compound! At: " + this.path(),
            );
        this.reduceStack();
        this.next();
    }

    beginList(): number {
        this.checkState(TagType.LIST);
        this.advanceStack();

        const listType = this.readTag();
        const listLength = this.readInt();

        this.stack[this.stackPosition] = listLength === 0 ? TagType.END : listType;
        this.listStack[this.stackPosition] = listLength;
        this.nameStack[this.stackPosition] = UNKNOWN_NAME;

        return listLength;
    }

    endList(): void {
        this.checkState(TagType.END);
        if (!this.inList())
            throw new IllegalStateException(
                "Can not end list. Current element is not in a list! At: " + this.path(),
            );
        this.reduceStack();
        this.next();
    }

    hasNext(): boolean {
        return this.peek() !== TagType.END;
    }

    nextByte(): number {
        this.checkState(TagType.BYTE);
        this.next();
        return this.readByte();
    }

    nextShort(): number {
        this.checkState(TagType.SHORT);
        this.next();
        return this.readShort();
    }

    nextInt(): number {
        this.checkState(TagType.INT);
        this.next();
        return this.readInt();
    }

    nextLong(): bigint {
        this.checkState(TagType.LONG);
        this.next();
        return this.readLong();
    }

    nextFloat(): number {
        this.checkState(TagType.FLOAT);
        this.next();
        return this.readFloat();
    }

    nextDouble(): number {
        this.checkState(TagType.DOUBLE);
        this.next();
        return this.readDouble();
    }

    nextString(): string {
        this.checkState(TagType.STRING);
        this.next();
        return this.readUTF();
    }

    nextByteArray(): Int8Array;
    nextByteArray(buffer: Int8Array): number;
    nextByteArray(buffer?: Int8Array): Int8Array | number {
        this.checkState(TagType.BYTE_ARRAY);
        this.next();
        const length = this.readInt();
        if (buffer === undefined) {
            const data = new Int8Array(length);
            this.readFully(data, 0, length);
            return data;
        }
        const readLength = Math.min(length, buffer.length);
        this.readFully(buffer, 0, readLength);
        this.skipNBytes(length - readLength);
        return length;
    }

    nextIntArray(): Int32Array;
    nextIntArray(buffer: Int32Array): number;
    nextIntArray(buffer?: Int32Array): Int32Array | number {
        this.checkState(TagType.INT_ARRAY);
        this.next();
        const length = this.readInt();
        if (buffer === undefined) {
            const data = new Int32Array(length);
            for (let i = 0; i < data.length; i++) data[i] = this.readInt();
            return data;
        }
        const readLength = Math.min(length, buffer.length);
        for (let i = 0; i < readLength; i++) buffer[i] = this.readInt();
        this.skipNBytes((length - readLength) * tagTypeSize(TagType.INT));
        return length;
    }

    nextLongArray(): BigInt64Array;
    nextLongArray(buffer: BigInt64Array): number;
    nextLongArray(buffer?: BigInt64Array): BigInt64Array | number {
        this.checkState(TagType.LONG_ARRAY);
        this.next();
        const length = this.readInt();
        if (buffer === undefined) {
            const data = new BigInt64Array(length);
            for (let i = 0; i < data.length; i++) data[i] = this.readLong();
            return data;
        }
        const readLength = Math.min(length, buffer.length);
        for (let i = 0; i < readLength; i++) buffer[i] = this.readLong();
        this.skipNBytes((length - readLength) * tagTypeSize(TagType.LONG));
        return length;
    }

    /**
     * Reads a LONG_ARRAY without materializing per-element BigInts, returning the raw
     * big-endian bytes (8 per element) as a zero-copy view into the underlying data.
     * (hot path — see docs/decisions.md D1; the caller does bit-math on 32-bit halves)
     */
    nextLongArrayAsBytes(): Uint8Array {
        this.checkState(TagType.LONG_ARRAY);
        this.next();
        const length = this.readInt();
        const byteLength = length * tagTypeSize(TagType.LONG);
        if (this.pos + byteLength > this.data.length) throw new EOFException();
        const bytes = this.data.subarray(this.pos, this.pos + byteLength);
        this.pos += byteLength;
        return bytes;
    }

    /**
     * Reads any type of array (BYTE_ARRAY, INT_ARRAY or LONG_ARRAY) and returns it as a byte-array.
     */
    nextArrayAsByteArray(): Int8Array {
        if (this.peek() === TagType.BYTE_ARRAY) return this.nextByteArray();
        this.checkState();
        const type = this.peek();
        if (type !== TagType.INT_ARRAY && type !== TagType.LONG_ARRAY)
            throw new IllegalStateException(
                "Expected any array-type but got " + tagTypeName(type) + ". At: " + this.path(),
            );
        // upstream stores via reflection (Array.setInt/setLong) into a byte[],
        // which throws an IllegalArgumentException for these narrowing conversions
        throw new IllegalArgumentException("argument type mismatch");
    }

    /**
     * Reads any type of array (BYTE_ARRAY, INT_ARRAY or LONG_ARRAY) and returns it as an int-array.
     */
    nextArrayAsIntArray(): Int32Array {
        if (this.peek() === TagType.INT_ARRAY) return this.nextIntArray();
        this.checkState();
        const type = this.peek();
        if (type === TagType.BYTE_ARRAY) {
            const length = this.readInt();
            const data = new Int32Array(length);
            for (let i = 0; i < length; i++) data[i] = this.readByte();
            this.next();
            return data;
        }
        if (type !== TagType.LONG_ARRAY)
            throw new IllegalStateException(
                "Expected any array-type but got " + tagTypeName(type) + ". At: " + this.path(),
            );
        // narrowing long -> int via reflection throws upstream, see nextArrayAsByteArray()
        throw new IllegalArgumentException("argument type mismatch");
    }

    /**
     * Reads any type of array (BYTE_ARRAY, INT_ARRAY or LONG_ARRAY) and returns it as a long-array.
     */
    nextArrayAsLongArray(): BigInt64Array {
        if (this.peek() === TagType.LONG_ARRAY) return this.nextLongArray();
        this.checkState();
        const type = this.peek();
        if (type === TagType.BYTE_ARRAY) {
            const length = this.readInt();
            const data = new BigInt64Array(length);
            for (let i = 0; i < length; i++) data[i] = BigInt(this.readByte());
            this.next();
            return data;
        }
        if (type === TagType.INT_ARRAY) {
            const length = this.readInt();
            const data = new BigInt64Array(length);
            for (let i = 0; i < length; i++) data[i] = BigInt(this.readInt());
            this.next();
            return data;
        }
        throw new IllegalStateException(
            "Expected any array-type but got " + tagTypeName(type) + ". At: " + this.path(),
        );
    }

    /**
     * Reads the entire next element and returns it as a raw nbt-data byte-array.
     */
    raw(): Uint8Array {
        this.checkState();

        // write tag-id and name back into the result (upstream logs them through DataLogInputStream)
        const tagId = this.peek();
        const nameBytes = encodeModifiedUtf8(this.name());

        // skip element, capturing its value-bytes
        const start = this.pos;
        this.skip();
        const valueLength = this.pos - start;

        const result = new Uint8Array(3 + nameBytes.length + valueLength);
        result[0] = tagId;
        result[1] = (nameBytes.length >>> 8) & 0xff;
        result[2] = nameBytes.length & 0xff;
        result.set(nameBytes, 3);
        result.set(this.data.subarray(start, this.pos), 3 + nameBytes.length);
        return result;
    }

    /**
     * Skips over the next element.
     * @param out The number of nesting-levels it should skip out of.<br>
     *            E.g. If this is 1 this will skip until the end of the current Compound or List and consume the end.
     */
    skip(out: number = 0): void {
        if (out < 0) throw new IllegalArgumentException("'out' can not be negative!");
        if (out === 0 && this.peek() === TagType.END)
            throw new IllegalStateException("Can not skip END tag!");

        do {
            const type = this.peek();
            switch (type) {
                case TagType.END: {
                    if (this.inList()) this.endList();
                    else this.endCompound();
                    out--;
                    break;
                }

                case TagType.BYTE:
                case TagType.SHORT:
                case TagType.INT:
                case TagType.LONG:
                case TagType.FLOAT:
                case TagType.DOUBLE: {
                    this.checkState();
                    this.skipNBytes(tagTypeSize(type));
                    this.next();
                    break;
                }

                case TagType.STRING: {
                    this.checkState();
                    this.skipUTF();
                    this.next();
                    break;
                }

                case TagType.BYTE_ARRAY: {
                    this.checkState();
                    const length = this.readInt();
                    this.skipNBytes(tagTypeSize(TagType.BYTE) * length);
                    this.next();
                    break;
                }

                case TagType.INT_ARRAY: {
                    this.checkState();
                    const length = this.readInt();
                    this.skipNBytes(tagTypeSize(TagType.INT) * length);
                    this.next();
                    break;
                }

                case TagType.LONG_ARRAY: {
                    this.checkState();
                    const length = this.readInt();
                    this.skipNBytes(tagTypeSize(TagType.LONG) * length);
                    this.next();
                    break;
                }

                case TagType.COMPOUND: {
                    this.beginCompound();
                    out++;
                    break;
                }

                case TagType.LIST: {
                    const length = this.beginList();
                    const listType = this.peek();
                    out++;

                    // fast skip list if type size is known
                    const size = tagTypeSize(listType);
                    if (size !== -1) {
                        this.skipNBytes(size * length);
                        this.listStack[this.stackPosition] = 0;
                        this.stack[this.stackPosition] = TagType.END;
                    }

                    break;
                }
            }
        } while (out > 0);
    }

    remainingListItems(): number {
        return this.listStack[this.stackPosition] ?? 0;
    }

    inCompound(): boolean {
        return this.stackPosition > 0 && this.stack[this.stackPosition - 1] === TagType.COMPOUND;
    }

    inList(): boolean {
        return this.stackPosition > 0 && this.stack[this.stackPosition - 1] === TagType.LIST;
    }

    path(): string {
        this.checkState();
        let sb = "";

        // start with 1 since the 0th element is always the root-compound
        for (let i = 1; i <= this.stackPosition; i++) {
            if (i > 1) {
                if (this.stack[i - 1] === TagType.LIST) {
                    sb += "[" + this.listStack[i] + "]";
                } else {
                    sb += "." + this.nameStack[i];
                }
            } else {
                sb += this.nameStack[i];
            }
        }
        return sb;
    }

    private next(): void {
        if (this.inList()) {
            this.listStack[this.stackPosition] = (this.listStack[this.stackPosition] ?? 0) - 1;
            if (this.listStack[this.stackPosition] === 0)
                this.stack[this.stackPosition] = TagType.END;
        } else {
            this.stack[this.stackPosition] = null;
            this.nameStack[this.stackPosition] = null;
        }
    }

    private advanceStack(): void {
        this.stackPosition++;

        if (this.stackPosition === this.stack.length) {
            const newLength = this.stack.length * 2;
            this.stack.length = newLength;
            this.nameStack.length = newLength;
            this.listStack.length = newLength;
            this.stack.fill(null, this.stackPosition);
            this.nameStack.fill(null, this.stackPosition);
            this.listStack.fill(0, this.stackPosition);
        }

        this.stack[this.stackPosition] = null;
        this.nameStack[this.stackPosition] = null;
        this.listStack[this.stackPosition] = 0;
    }

    private reduceStack(): void {
        if (this.stackPosition === 0)
            throw new IllegalStateException("Can not reduce empty stack!");

        this.stackPosition--;
    }

    private readTag(): TagType {
        if (this.pos >= this.data.length) throw new EOFException();
        const tagId = this.data[this.pos++]!;
        return tagTypeForId(tagId);
    }

    private skipUTF(): void {
        const length = this.readUnsignedShort();
        this.skipNBytes(length);
    }

    private skipNBytes(n: number): void {
        if (n <= 0) return;
        if (this.pos + n > this.data.length) {
            this.pos = this.data.length;
            throw new EOFException();
        }
        this.pos += n;
    }

    private checkState(expected: TagType | null = null): void {
        const type = this.peek();
        if (expected !== null && type !== expected)
            throw new IllegalStateException(
                "Expected type " +
                    tagTypeName(expected) +
                    " but got " +
                    tagTypeName(this.peek()) +
                    ". At: " +
                    this.path(),
            );

        // skip name if it has not been read yet to make sure we are ready to read the value
        if ((this.nameStack[this.stackPosition] ?? null) === null) {
            this.nameStack[this.stackPosition] = UNKNOWN_NAME;
            if (type !== TagType.END) this.skipUTF();
        }
    }

    // -- primitive data-input (big-endian, mirrors java.io.DataInputStream) --

    private require(n: number): number {
        if (this.pos + n > this.data.length) throw new EOFException();
        const p = this.pos;
        this.pos += n;
        return p;
    }

    private readByte(): number {
        return this.view.getInt8(this.require(1));
    }

    private readShort(): number {
        return this.view.getInt16(this.require(2), false);
    }

    private readUnsignedShort(): number {
        return this.view.getUint16(this.require(2), false);
    }

    private readInt(): number {
        return this.view.getInt32(this.require(4), false);
    }

    private readLong(): bigint {
        return this.view.getBigInt64(this.require(8), false);
    }

    private readFloat(): number {
        return this.view.getFloat32(this.require(4), false);
    }

    private readDouble(): number {
        return this.view.getFloat64(this.require(8), false);
    }

    private readUTF(): string {
        const length = this.readUnsignedShort();
        const p = this.require(length);
        return decodeModifiedUtf8(this.data.subarray(p, p + length));
    }

    private readFully(buffer: Int8Array, offset: number, length: number): void {
        const p = this.require(length);
        // copy the raw bytes; the Int8Array view reinterprets them as signed
        new Uint8Array(buffer.buffer, buffer.byteOffset + offset, length).set(
            this.data.subarray(p, p + length),
        );
    }
}
