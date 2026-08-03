import { TagType, tagTypeName } from "./TagType.js";
import { IOException, IllegalStateException, UTFDataFormatException } from "./Exceptions.js";
import { encodeModifiedUtf8 } from "./ModifiedUtf8.js";

/**
 * Can be used to directly write raw nbt-data to a growable byte-buffer.
 * (Upstream NBTWriter writes to any OutputStream; this port collects the data
 * in-memory, obtain it with {@link NBTWriter#toUint8Array}.)
 *
 * Java's overloaded value(...) methods are split into valueByte/valueShort/... here,
 * since the value types are not distinguishable at runtime in JavaScript.
 */
export class NBTWriter {
    private out: Uint8Array = new Uint8Array(1024);
    private view: DataView = new DataView(this.out.buffer);
    private length = 0;

    private stackPosition = 0;
    private stack: (TagType | null)[] = new Array<TagType | null>(32).fill(null);
    private nextName: string | null = null;
    private nextListLength = -1;

    name(name: string): this {
        if (this.nextName !== null)
            throw new IllegalStateException("The name was already set to '" + name + "'");

        this.nextName = name;
        return this;
    }

    beginCompound(): void {
        this.tag(TagType.COMPOUND);
        this.advanceStack();
    }

    beginList(length: number, type?: TagType): void {
        this.tag(TagType.LIST);
        this.advanceStack();
        this.nextListLength = length;
        if (type !== undefined) this.tag(type);
    }

    endCompound(): void {
        if (!this.inCompound()) throw new IllegalStateException("Not in a compound!");
        this.reduceStack();
        this.tag(TagType.END);
        this.afterValue();
    }

    endList(): void {
        if (!this.inList()) throw new IllegalStateException("Not in a list!");
        this.reduceStack();
        this.afterValue();
    }

    valueByte(value: number): void {
        this.tag(TagType.BYTE);
        this.writeByte(value);
        this.afterValue();
    }

    valueShort(value: number): void {
        this.tag(TagType.SHORT);
        this.writeShort(value);
        this.afterValue();
    }

    valueInt(value: number): void {
        this.tag(TagType.INT);
        this.writeInt(value);
        this.afterValue();
    }

    valueLong(value: bigint | number): void {
        this.tag(TagType.LONG);
        this.writeLong(value);
        this.afterValue();
    }

    valueFloat(value: number): void {
        this.tag(TagType.FLOAT);
        this.writeFloat(value);
        this.afterValue();
    }

    valueDouble(value: number): void {
        this.tag(TagType.DOUBLE);
        this.writeDouble(value);
        this.afterValue();
    }

    valueString(value: string): void {
        this.tag(TagType.STRING);
        this.writeUTF(value);
        this.afterValue();
    }

    valueByteArray(value: Int8Array | Uint8Array): void {
        this.tag(TagType.BYTE_ARRAY);
        this.writeInt(value.length);
        this.ensureCapacity(value.length);
        // copy the raw bytes; sign is irrelevant on the wire
        this.out.set(
            value instanceof Uint8Array
                ? value
                : new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
            this.length,
        );
        this.length += value.length;
        this.afterValue();
    }

    valueIntArray(value: Int32Array | readonly number[]): void {
        this.tag(TagType.INT_ARRAY);
        this.writeInt(value.length);
        for (let i = 0; i < value.length; i++) this.writeInt(value[i]!);
        this.afterValue();
    }

    valueLongArray(value: BigInt64Array | readonly (bigint | number)[]): void {
        this.tag(TagType.LONG_ARRAY);
        this.writeInt(value.length);
        for (let i = 0; i < value.length; i++) this.writeLong(value[i]!);
        this.afterValue();
    }

    inCompound(): boolean {
        return this.stackPosition > 0 && this.stack[this.stackPosition - 1] === TagType.COMPOUND;
    }

    inList(): boolean {
        return this.stackPosition > 0 && this.stack[this.stackPosition - 1] === TagType.LIST;
    }

    private tag(tag: TagType): void {
        // init list if pending
        if (this.nextListLength !== -1) {
            if (tag !== TagType.END) this.writeByte(tag);
            else this.writeByte(TagType.COMPOUND);
            this.writeInt(this.nextListLength);
            this.stack[this.stackPosition] = tag;
            this.nextListLength = -1;
            return;
        }

        const current = this.stack[this.stackPosition] ?? null;
        if (tag !== TagType.END && current !== null) {
            if (current === tag) {
                if (this.nextName !== null)
                    throw new IllegalStateException(
                        "There is a name set. You can't use name() when writing a value inside a list or before end()!",
                    );
                return;
            }
            throw new IllegalStateException(
                "Wrong tag-type. Expected type " +
                    tagTypeName(current) +
                    " but got " +
                    tagTypeName(tag),
            );
        }

        if (tag !== TagType.END) this.stack[this.stackPosition] = tag;

        this.writeByte(tag);

        if (tag !== TagType.END && !this.inList()) {
            if (this.nextName === null) {
                if (this.stackPosition > 0)
                    throw new IllegalStateException(
                        "Name is not set. Call name() before writing a value when not inside a list!",
                    );
                this.nextName = ""; // default name to empty string if at root-level
            }

            this.writeUTF(this.nextName);
            this.nextName = null;
        } else if (this.nextName !== null) {
            throw new IllegalStateException(
                "There is a name set. You can't use name() when writing a value inside a list or before end()!",
            );
        }
    }

    private afterValue(): void {
        if (!this.inList()) this.stack[this.stackPosition] = null;
    }

    private advanceStack(): void {
        this.stackPosition++;

        if (this.stackPosition >= this.stack.length) {
            const newLength = this.stack.length * 2;
            this.stack.length = newLength;
            this.stack.fill(null, this.stackPosition);
        }

        this.stack[this.stackPosition] = null;
    }

    private reduceStack(): void {
        if (this.stackPosition === 0)
            throw new IllegalStateException("Can not reduce empty stack!");

        this.stackPosition--;
    }

    /**
     * Returns the written nbt-data.
     */
    toUint8Array(): Uint8Array {
        return this.out.slice(0, this.length);
    }

    close(): void {
        if (this.stackPosition > 0) throw new IOException("Incomplete document!");
    }

    // -- primitive data-output (big-endian, mirrors java.io.DataOutputStream) --

    private ensureCapacity(additional: number): void {
        const required = this.length + additional;
        if (required <= this.out.length) return;
        let newLength = this.out.length * 2;
        while (newLength < required) newLength *= 2;
        const grown = new Uint8Array(newLength);
        grown.set(this.out.subarray(0, this.length));
        this.out = grown;
        this.view = new DataView(grown.buffer);
    }

    private writeByte(value: number): void {
        this.ensureCapacity(1);
        this.view.setInt8(this.length, value);
        this.length += 1;
    }

    private writeShort(value: number): void {
        this.ensureCapacity(2);
        this.view.setInt16(this.length, value, false);
        this.length += 2;
    }

    private writeInt(value: number): void {
        this.ensureCapacity(4);
        this.view.setInt32(this.length, value, false);
        this.length += 4;
    }

    private writeLong(value: bigint | number): void {
        this.ensureCapacity(8);
        this.view.setBigInt64(
            this.length,
            typeof value === "bigint" ? value : BigInt(Math.trunc(value)),
            false,
        );
        this.length += 8;
    }

    private writeFloat(value: number): void {
        this.ensureCapacity(4);
        this.view.setFloat32(this.length, value, false);
        this.length += 4;
    }

    private writeDouble(value: number): void {
        this.ensureCapacity(8);
        this.view.setFloat64(this.length, value, false);
        this.length += 8;
    }

    private writeUTF(value: string): void {
        const bytes = encodeModifiedUtf8(value);
        if (bytes.length > 65535)
            throw new UTFDataFormatException("encoded string too long: " + bytes.length + " bytes");
        this.writeShort(bytes.length);
        this.ensureCapacity(bytes.length);
        this.out.set(bytes, this.length);
        this.length += bytes.length;
    }
}
