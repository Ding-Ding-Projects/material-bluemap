import { floatToIntBits, javaCastToInt } from "../../util/math/JavaMath.js";
import { ArrayTileModel } from "./ArrayTileModel.js";

/**
 * upstream: map/hires/PRBMWriter.java
 *
 * Writes an {@link ArrayTileModel} as PRBM — BlueMap's variant of Kevin Chapelier's
 * PRWM binary mesh format — which is exactly what `packages/viewer`'s `PRBMLoader`
 * reads back. This is the byte-for-byte gate of the whole mesher: the file layout,
 * the 4-byte attribute padding, the normal derivation and the material-group table
 * all have to match the Java writer's output after gunzip.
 *
 * Port note: upstream wraps an `OutputStream` (the storage layer's, which gzips).
 * Node has no synchronous `OutputStream` equivalent worth emulating, so this writes
 * into a growable buffer and hands it over with {@link getBytes}; `close()` is kept
 * for API parity. The counting the padding depends on is unchanged.
 */

const FORMAT_VERSION = 1;
/** indexed (no) _ indices-type (-) _ endianness (little) _ attribute-nr (7) */
const HEADER_BITS = 0b0_0_0_00111;

const ATTRIBUTE_TYPE_FLOAT = 0;

const ATTRIBUTE_NOT_NORMALIZED = 0;
const ATTRIBUTE_NORMALIZED = 1 << 6;

const ATTRIBUTE_CARDINALITY_SCALAR = 0;
const ATTRIBUTE_CARDINALITY_2D_VEC = 1 << 4;
const ATTRIBUTE_CARDINALITY_3D_VEC = 2 << 4;

const ATTRIBUTE_ENCODING_SIGNED_32BIT_FLOAT = 1;
const ATTRIBUTE_ENCODING_SIGNED_8BIT_INT = 3;
const ATTRIBUTE_ENCODING_UNSIGNED_8BIT_INT = 7;

/** upstream: `util/stream/CountingOutputStream` around the storage's `OutputStream` */
class CountingByteSink {
    private buffer = new Uint8Array(4096);
    private count = 0;

    write(b: number): void {
        if (this.count === this.buffer.length) this.grow(this.count + 1);
        this.buffer[this.count++] = b & 0xff;
    }

    writeAll(bytes: ArrayLike<number>): void {
        if (this.count + bytes.length > this.buffer.length) this.grow(this.count + bytes.length);
        this.buffer.set(bytes, this.count);
        this.count += bytes.length;
    }

    getCount(): number {
        return this.count;
    }

    toUint8Array(): Uint8Array {
        return this.buffer.slice(0, this.count);
    }

    private grow(required: number): void {
        let length = this.buffer.length;
        while (length < required) length *= 2;
        const grown = new Uint8Array(length);
        grown.set(this.buffer.subarray(0, this.count));
        this.buffer = grown;
    }
}

export class PRBMWriter {
    private readonly out = new CountingByteSink();
    /** scratch for the derived surface normal — upstream: `new VectorM3f(0, 0, 0)` (float fields) */
    private readonly normal = new Float32Array(3);

    /** upstream: `void write(ArrayTileModel model)` */
    write(model: ArrayTileModel): void {
        const out = this.out;
        out.write(FORMAT_VERSION); // version - 1 byte
        out.write(HEADER_BITS); // format info - 1 byte
        this.write3byteValue(model.size() * 3); // number of values - 3 bytes
        this.write3byteValue(0); // number of indices (0 for non-indexed) - 3 bytes

        this.writePositionArray(model);
        this.writeNormalArray(model);
        this.writeColorArray(model);
        this.writeUvArray(model);
        this.writeAoArray(model);
        this.writeBlocklightArray(model);
        this.writeSunlightArray(model);

        this.writeMaterialGroups(model);
    }

    /** upstream: `void close()` — there is no wrapped stream to close here */
    close(): void {
        /* no-op */
    }

    /** The bytes written so far. Not upstream API: upstream's bytes go straight to a stream. */
    getBytes(): Uint8Array {
        return this.out.toUint8Array();
    }

    /** upstream: `private void writePositionArray(ArrayTileModel model)` */
    private writePositionArray(model: ArrayTileModel): void {
        const position = model.position;

        this.writeString("position");
        this.out.write(
            ATTRIBUTE_TYPE_FLOAT |
                ATTRIBUTE_NOT_NORMALIZED |
                ATTRIBUTE_CARDINALITY_3D_VEC |
                ATTRIBUTE_ENCODING_SIGNED_32BIT_FLOAT,
        );

        this.writePadding();

        const posSize = model.size() * ArrayTileModel.FI_POSITION;
        for (let i = 0; i < posSize; i++) {
            this.writeFloat(position[i]!);
        }
    }

    /** upstream: `private void writeNormalArray(ArrayTileModel model)` */
    private writeNormalArray(model: ArrayTileModel): void {
        const normal = this.normal;
        normal[0] = 0;
        normal[1] = 0;
        normal[2] = 0;
        const position = model.position;

        this.writeString("normal");
        this.out.write(
            ATTRIBUTE_TYPE_FLOAT |
                ATTRIBUTE_NORMALIZED |
                ATTRIBUTE_CARDINALITY_3D_VEC |
                ATTRIBUTE_ENCODING_SIGNED_8BIT_INT,
        );

        this.writePadding();

        const size = model.size();
        for (let i = 0; i < size; i++) {
            const pi = i * ArrayTileModel.FI_POSITION;
            this.calculateSurfaceNormal(
                position[pi]!, position[pi + 1]!, position[pi + 2]!,
                position[pi + 3]!, position[pi + 4]!, position[pi + 5]!,
                position[pi + 6]!, position[pi + 7]!, position[pi + 8]!,
                normal,
            );

            for (let j = 0; j < 3; j++) {
                // all 3 points
                this.writeNormalizedSignedByteValue(normal[0]!);
                this.writeNormalizedSignedByteValue(normal[1]!);
                this.writeNormalizedSignedByteValue(normal[2]!);
            }
        }
    }

    /** upstream: `private void writeColorArray(ArrayTileModel model)` */
    private writeColorArray(model: ArrayTileModel): void {
        const color = model.color;

        this.writeString("color");
        this.out.write(
            ATTRIBUTE_TYPE_FLOAT |
                ATTRIBUTE_NORMALIZED |
                ATTRIBUTE_CARDINALITY_3D_VEC |
                ATTRIBUTE_ENCODING_UNSIGNED_8BIT_INT,
        );

        this.writePadding();

        const colorSize = model.size() * ArrayTileModel.FI_COLOR;
        for (let i = 0; i < colorSize; i += 3) {
            for (let j = 0; j < 3; j++) {
                this.writeNormalizedUnsignedByteValue(color[i]!);
                this.writeNormalizedUnsignedByteValue(color[i + 1]!);
                this.writeNormalizedUnsignedByteValue(color[i + 2]!);
            }
        }
    }

    /** upstream: `private void writeUvArray(ArrayTileModel model)` */
    private writeUvArray(model: ArrayTileModel): void {
        const uv = model.uv;

        this.writeString("uv");
        this.out.write(
            ATTRIBUTE_TYPE_FLOAT |
                ATTRIBUTE_NOT_NORMALIZED |
                ATTRIBUTE_CARDINALITY_2D_VEC |
                ATTRIBUTE_ENCODING_SIGNED_32BIT_FLOAT,
        );

        this.writePadding();

        const uvSize = model.size() * ArrayTileModel.FI_UV;
        for (let i = 0; i < uvSize; i++) {
            this.writeFloat(uv[i]!);
        }
    }

    /** upstream: `private void writeAoArray(ArrayTileModel model)` */
    private writeAoArray(model: ArrayTileModel): void {
        const ao = model.ao;

        this.writeString("ao");
        this.out.write(
            ATTRIBUTE_TYPE_FLOAT |
                ATTRIBUTE_NORMALIZED |
                ATTRIBUTE_CARDINALITY_SCALAR |
                ATTRIBUTE_ENCODING_UNSIGNED_8BIT_INT,
        );

        this.writePadding();

        const uvSize = model.size() * ArrayTileModel.FI_AO;
        for (let i = 0; i < uvSize; i++) {
            this.writeNormalizedUnsignedByteValue(ao[i]!);
        }
    }

    /** upstream: `private void writeBlocklightArray(ArrayTileModel model)` */
    private writeBlocklightArray(model: ArrayTileModel): void {
        const blocklight = model.blocklight;

        this.writeString("blocklight");
        this.out.write(
            ATTRIBUTE_TYPE_FLOAT |
                ATTRIBUTE_NOT_NORMALIZED |
                ATTRIBUTE_CARDINALITY_SCALAR |
                ATTRIBUTE_ENCODING_SIGNED_8BIT_INT,
        );

        this.writePadding();

        const blSize = model.size() * ArrayTileModel.FI_BLOCKLIGHT;
        for (let i = 0; i < blSize; i++) {
            this.out.write(blocklight[i]!);
            this.out.write(blocklight[i]!);
            this.out.write(blocklight[i]!);
        }
    }

    /** upstream: `private void writeSunlightArray(ArrayTileModel model)` */
    private writeSunlightArray(model: ArrayTileModel): void {
        const sunlight = model.sunlight;

        this.writeString("sunlight");
        this.out.write(
            ATTRIBUTE_TYPE_FLOAT |
                ATTRIBUTE_NOT_NORMALIZED |
                ATTRIBUTE_CARDINALITY_SCALAR |
                ATTRIBUTE_ENCODING_SIGNED_8BIT_INT,
        );

        this.writePadding();

        const slSize = model.size() * ArrayTileModel.FI_SUNLIGHT;
        for (let i = 0; i < slSize; i++) {
            this.out.write(sunlight[i]!);
            this.out.write(sunlight[i]!);
            this.out.write(sunlight[i]!);
        }
    }

    /**
     * upstream: `private void writeMaterialGroups(ArrayTileModel model)` — the
     * (material, start, count) triples the webapp turns into draw-groups, terminated
     * by a -1 material.
     */
    private writeMaterialGroups(model: ArrayTileModel): void {
        this.writePadding();

        if (model.size() > 0) {
            const materialIndex = model.materialIndex;

            const miSize = model.size() * ArrayTileModel.FI_MATERIAL_INDEX;
            let lastMaterial = materialIndex[0]!,
                material = lastMaterial,
                groupStart = 0;

            this.write4byteValue(material);
            this.write4byteValue(0);

            for (let i = 1; i < miSize; i++) {
                material = materialIndex[i]!;

                if (material !== lastMaterial) {
                    this.write4byteValue((i - groupStart) * 3);

                    groupStart = i;

                    this.write4byteValue(material);
                    this.write4byteValue(groupStart * 3);
                }

                lastMaterial = material;
            }

            this.write4byteValue((miSize - groupStart) * 3);
        }

        this.write4byteValue(-1);
    }

    /** upstream: `private void writePadding()` — pad to the next 4-byte boundary */
    private writePadding(): void {
        // upstream: `(int) (-out.getCount() & 0x3)`
        const paddingBytes = (4 - (this.out.getCount() % 4)) % 4;
        for (let i = 0; i < paddingBytes; i++) {
            this.out.write(0);
        }
    }

    /** upstream: `private void write3byteValue(int value)` */
    private write3byteValue(value: number): void {
        if (value > 0xffffff) throw new Error("Value too high: " + value);
        this.out.write(value & 0xff);
        this.out.write((value >> 8) & 0xff);
        this.out.write((value >> 16) & 0xff);
    }

    /** upstream: `private void write4byteValue(int value)` */
    private write4byteValue(value: number): void {
        this.out.write(value & 0xff);
        this.out.write((value >> 8) & 0xff);
        this.out.write((value >> 16) & 0xff);
        this.out.write((value >> 24) & 0xff);
    }

    /** upstream: `private void writeFloat(float value)` */
    private writeFloat(value: number): void {
        this.write4byteValue(floatToIntBits(value));
    }

    /**
     * upstream: `private void writeNormalizedSignedByteValue(float value)` —
     * `(byte) (value * 0x80 - 0.5)`. The multiply is `float`, the `- 0.5` promotes to
     * `double`, and the `(byte)` narrows via `int` (so an infinite normal, which a
     * degenerate face produces, saturates to `Integer.MAX_VALUE` and writes 0xFF).
     */
    private writeNormalizedSignedByteValue(value: number): void {
        const normalized = javaCastToInt(Math.fround(value * 0x80) - 0.5);
        this.out.write(normalized & 0xff);
    }

    /**
     * upstream: `private void writeNormalizedUnsignedByteValue(float value)` —
     * `(int) (value * 0xFF)`, a `float` multiply truncated toward zero.
     */
    private writeNormalizedUnsignedByteValue(value: number): void {
        const normalized = javaCastToInt(Math.fround(value * 0xff));
        this.out.write(normalized & 0xff);
    }

    /** upstream: `private void writeString(String value)` — US-ASCII, NUL-terminated */
    private writeString(value: string): void {
        for (let i = 0; i < value.length; i++) {
            this.out.write(value.charCodeAt(i));
        }
        this.out.write(0);
    }

    /**
     * upstream: `private void calculateSurfaceNormal(...)` — the un-normalized cross
     * product of the two triangle edges, normalized. All-`float` arithmetic.
     */
    private calculateSurfaceNormal(
        p1x: number,
        p1y: number,
        p1z: number,
        p2x: number,
        p2y: number,
        p2z: number,
        p3x: number,
        p3y: number,
        p3z: number,
        target: Float32Array,
    ): void {
        const f = Math.fround;

        p2x = f(p2x - p1x);
        p2y = f(p2y - p1y);
        p2z = f(p2z - p1z);
        p3x = f(p3x - p1x);
        p3y = f(p3y - p1y);
        p3z = f(p3z - p1z);

        p1x = f(f(p2y * p3z) - f(p2z * p3y));
        p1y = f(f(p2z * p3x) - f(p2x * p3z));
        p1z = f(f(p2x * p3y) - f(p2y * p3x));

        const length = f(Math.sqrt(f(f(f(p1x * p1x) + f(p1y * p1y)) + f(p1z * p1z))));
        p1x = f(p1x / length);
        p1y = f(p1y / length);
        p1z = f(p1z / length);

        target[0] = p1x;
        target[1] = p1y;
        target[2] = p1z;
    }
}

/**
 * Convenience for the common `try (PRBMWriter w = new PRBMWriter(out)) { w.write(m); }`
 * shape: writes `model` and returns the complete PRBM bytes (uncompressed).
 */
export function writeTileModelToPRBM(model: ArrayTileModel): Uint8Array {
    const writer = new PRBMWriter();
    try {
        writer.write(model);
        return writer.getBytes();
    } finally {
        writer.close();
    }
}
