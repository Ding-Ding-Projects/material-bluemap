import { MatrixM4f, TrigMath, type MatrixM3f } from "@material-bluemap/shared";
import { InstancePool } from "../../util/InstancePool.js";
import { compareInt, mergeSortInt } from "../../util/MergeSort.js";
import { toRadians, javaCastToInt } from "../../util/math/JavaMath.js";
import { MaxCapacityReachedException } from "./MaxCapacityReachedException.js";
import type { TileModel } from "./TileModel.js";

/**
 * upstream: map/hires/ArrayTileModel.java
 *
 * The structure-of-arrays mesh buffer every render-pass writes into. One entry per
 * *face* (triangle) in each attribute array; `sort()` reorders the faces by material
 * index, which is the order they are written to the .prbm file, which is the order
 * the webapp draws them in.
 *
 * ## Numeric fidelity
 *
 * Upstream's attribute arrays are `float[]`/`byte[]`/`int[]`; here they are
 * `Float32Array`/`Int8Array`/`Int32Array`, so every *store* performs exactly the same
 * narrowing Java does. What a typed array cannot do is round the *intermediate*
 * results of a multi-operation float expression, which Java rounds after every
 * operator — so those expressions carry an explicit `Math.fround` per operator (see
 * `transform`). Values declared `double` upstream (the quaternion path) are left as
 * plain javascript numbers, which is what a Java `double` already is.
 *
 * Every `float` *parameter* is `Math.fround`ed on entry, because Java narrowed it at
 * the call site before the method ever saw it.
 *
 * ## Port notes
 *
 * - Upstream has both a field `size` and a method `size()`; javascript cannot, so the
 *   field is `_size` and the method keeps the upstream name.
 * - The attribute arrays are package-private upstream (PRBMWriter reads them
 *   directly). Javascript has no package scope, so they are public and marked
 *   `@internal` instead.
 */
export class ArrayTileModel implements TileModel {
    /** upstream: `GROW_MULTIPLIER` */
    static readonly GROW_MULTIPLIER = 1.5;
    /** upstream: `MAX_CAPACITY` */
    static readonly MAX_CAPACITY = 1000000;
    /** upstream: `SHRINK_MULTIPLIER = 1 / GROW_MULTIPLIER` (a `float` division) */
    static readonly SHRINK_MULTIPLIER = Math.fround(1 / ArrayTileModel.GROW_MULTIPLIER);
    /** upstream: `SHRINK_TIME = Duration.ofMinutes(1)` (milliseconds here) */
    static readonly SHRINK_TIME = 60_000;

    // attributes                       per-vertex * per-face
    /** upstream: `FI_POSITION = 3 * 3` */
    static readonly FI_POSITION = 3 * 3;
    /** upstream: `FI_UV = 2 * 3` */
    static readonly FI_UV = 2 * 3;
    /** upstream: `FI_AO = 3` */
    static readonly FI_AO = 3;
    /** upstream: `FI_COLOR = 3` */
    static readonly FI_COLOR = 3;
    /** upstream: `FI_SUNLIGHT = 1` */
    static readonly FI_SUNLIGHT = 1;
    /** upstream: `FI_BLOCKLIGHT = 1` */
    static readonly FI_BLOCKLIGHT = 1;
    /** upstream: `FI_MATERIAL_INDEX = 1` */
    static readonly FI_MATERIAL_INDEX = 1;

    private capacity = 0;
    /** upstream: the package-private field `int size` */
    private _size = 0;

    /** @internal upstream: package-private `float[] position` */
    position: Float32Array = new Float32Array(0);
    /** @internal upstream: package-private `float[] color` */
    color: Float32Array = new Float32Array(0);
    /** @internal upstream: package-private `float[] uv` */
    uv: Float32Array = new Float32Array(0);
    /** @internal upstream: package-private `float[] ao` */
    ao: Float32Array = new Float32Array(0);
    /** @internal upstream: package-private `byte[] sunlight` */
    sunlight: Int8Array = new Int8Array(0);
    /** @internal upstream: package-private `byte[] blocklight` */
    blocklight: Int8Array = new Int8Array(0);
    /** @internal upstream: package-private `int[] materialIndex` */
    materialIndex: Int32Array = new Int32Array(0);

    private materialIndexSort: Int32Array = new Int32Array(0);
    private materialIndexSortSupport: Int32Array = new Int32Array(0);

    /** upstream: `private transient Instant lastCapacityUse` */
    private lastCapacityUse: number = Date.now();

    constructor(initialCapacity: number) {
        if (initialCapacity < 0) throw new Error("initialCapacity is negative");
        this.setCapacity(initialCapacity);
        this.clear();
    }

    /** upstream: `int size()` */
    size(): number {
        return this._size;
    }

    /** upstream: `int getCapacity()` — not upstream API; exposed for the instance-pool recycler */
    getCapacity(): number {
        return this.capacity;
    }

    /** upstream: `int add(int count)` */
    add(count: number): number {
        this.ensureCapacity(count);
        const start = this._size;
        this._size += count;
        return start;
    }

    /** upstream: `ArrayTileModel setPositions(...)` */
    setPositions(
        face: number,
        x1: number,
        y1: number,
        z1: number,
        x2: number,
        y2: number,
        z2: number,
        x3: number,
        y3: number,
        z3: number,
    ): ArrayTileModel {
        const index = face * ArrayTileModel.FI_POSITION;
        const position = this.position;

        position[index] = x1;
        position[index + 1] = y1;
        position[index + 2] = z1;

        position[index + 3] = x2;
        position[index + 3 + 1] = y2;
        position[index + 3 + 2] = z2;

        position[index + 6] = x3;
        position[index + 6 + 1] = y3;
        position[index + 6 + 2] = z3;

        return this;
    }

    /** upstream: `ArrayTileModel setUvs(...)` */
    setUvs(
        face: number,
        u1: number,
        v1: number,
        u2: number,
        v2: number,
        u3: number,
        v3: number,
    ): ArrayTileModel {
        const index = face * ArrayTileModel.FI_UV;
        const uv = this.uv;

        uv[index] = u1;
        uv[index + 1] = v1;

        uv[index + 2] = u2;
        uv[index + 2 + 1] = v2;

        uv[index + 4] = u3;
        uv[index + 4 + 1] = v3;

        return this;
    }

    /** upstream: `ArrayTileModel setAOs(int face, float ao1, float ao2, float ao3)` */
    setAOs(face: number, ao1: number, ao2: number, ao3: number): ArrayTileModel {
        const index = face * ArrayTileModel.FI_AO;
        const ao = this.ao;

        ao[index] = ao1;
        ao[index + 1] = ao2;
        ao[index + 2] = ao3;

        return this;
    }

    /** upstream: `ArrayTileModel setColor(int face, float r, float g, float b)` */
    setColor(face: number, r: number, g: number, b: number): ArrayTileModel {
        const index = face * ArrayTileModel.FI_COLOR;
        const color = this.color;

        color[index] = r;
        color[index + 1] = g;
        color[index + 2] = b;

        return this;
    }

    /** upstream: `ArrayTileModel setSunlight(int face, int sl)` — `(byte) sl` */
    setSunlight(face: number, sl: number): ArrayTileModel {
        this.sunlight[face * ArrayTileModel.FI_SUNLIGHT] = sl;
        return this;
    }

    /** upstream: `ArrayTileModel setBlocklight(int face, int bl)` — `(byte) bl` */
    setBlocklight(face: number, bl: number): ArrayTileModel {
        this.blocklight[face * ArrayTileModel.FI_BLOCKLIGHT] = bl;
        return this;
    }

    /** upstream: `ArrayTileModel setMaterialIndex(int face, int m)` */
    setMaterialIndex(face: number, m: number): ArrayTileModel {
        this.materialIndex[face * ArrayTileModel.FI_MATERIAL_INDEX] = m;
        return this;
    }

    /** upstream: `ArrayTileModel invertOrientation(int face)` / the default `(int start, int count)` */
    invertOrientation(face: number): ArrayTileModel;
    invertOrientation(start: number, count: number): ArrayTileModel;
    invertOrientation(faceOrStart: number, count?: number): ArrayTileModel {
        if (count !== undefined) {
            const end = faceOrStart + count;
            for (let face = faceOrStart; face < end; face++) {
                this.invertOrientation(face);
            }
            return this;
        }

        const face = faceOrStart;
        const position = this.position;
        const uv = this.uv;
        const ao = this.ao;
        let index: number;
        let x: number, y: number;

        // swap first and last positions
        index = face * ArrayTileModel.FI_POSITION;

        x = position[index]!;
        y = position[index + 1]!;
        const z = position[index + 2]!;

        position[index] = position[index + 6]!;
        position[index + 1] = position[index + 6 + 1]!;
        position[index + 2] = position[index + 6 + 2]!;

        position[index + 6] = x;
        position[index + 6 + 1] = y;
        position[index + 6 + 2] = z;

        // swap first and last uvs
        index = face * ArrayTileModel.FI_UV;
        x = uv[index]!;
        y = uv[index + 1]!;

        uv[index] = uv[index + 4]!;
        uv[index + 1] = uv[index + 4 + 1]!;

        uv[index + 4] = x;
        uv[index + 4 + 1] = y;

        // swap first and last ao
        index = face * ArrayTileModel.FI_AO;
        x = ao[index]!;
        ao[index] = ao[index + 2]!;
        ao[index + 2] = x;

        return this;
    }

    /** upstream: `ArrayTileModel rotate(int start, int count, float angle, float axisX, float axisY, float axisZ)` */
    rotate(
        start: number,
        count: number,
        angle: number,
        axisX: number,
        axisY: number,
        axisZ: number,
    ): ArrayTileModel {
        const f = Math.fround;
        angle = f(angle);
        axisX = f(axisX);
        axisY = f(axisY);
        axisZ = f(axisZ);

        // create quaternion
        const halfAngle = toRadians(angle) * 0.5;
        // `axisX * axisX + axisY * axisY + axisZ * axisZ` is float arithmetic upstream
        const axisLengthSquared = f(f(f(axisX * axisX) + f(axisY * axisY)) + f(axisZ * axisZ));
        const q = TrigMath.sin(halfAngle) / Math.sqrt(axisLengthSquared);

        //quaternion
        let qx = axisX * q,
            qy = axisY * q,
            qz = axisZ * q,
            qw = TrigMath.cos(halfAngle);
        const qLength = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);

        // normalize quaternion
        qx /= qLength;
        qy /= qLength;
        qz /= qLength;
        qw /= qLength;

        return this.rotateByQuaternion(start, count, qx, qy, qz, qw);
    }

    /** upstream: `ArrayTileModel rotateXYZ(int start, int count, float pitch, float yaw, float roll)` */
    rotateXYZ(
        start: number,
        count: number,
        pitch: number,
        yaw: number,
        roll: number,
    ): ArrayTileModel {
        const halfPitch = toRadians(Math.fround(pitch)) * 0.5,
            sx = TrigMath.sin(halfPitch),
            cx = TrigMath.cos(halfPitch),
            halfYaw = toRadians(Math.fround(yaw)) * 0.5,
            sy = TrigMath.sin(halfYaw),
            cy = TrigMath.cos(halfYaw),
            halfRoll = toRadians(Math.fround(roll)) * 0.5,
            sz = TrigMath.sin(halfRoll),
            cz = TrigMath.cos(halfRoll),
            cycz = cy * cz,
            sysz = sy * sz,
            sycz = sy * cz,
            cysz = cy * sz;

        return this.rotateByQuaternion(
            start,
            count,
            sx * cycz + cx * sysz,
            cx * sycz - sx * cysz,
            cx * cysz + sx * sycz,
            cx * cycz - sx * sysz,
        );
    }

    /** upstream: `ArrayTileModel rotateZYX(int start, int count, float pitch, float yaw, float roll)` */
    rotateZYX(
        start: number,
        count: number,
        pitch: number,
        yaw: number,
        roll: number,
    ): ArrayTileModel {
        const halfPitch = toRadians(Math.fround(pitch)) * 0.5,
            sx = TrigMath.sin(halfPitch),
            cx = TrigMath.cos(halfPitch),
            halfYaw = toRadians(Math.fround(yaw)) * 0.5,
            sy = TrigMath.sin(halfYaw),
            cy = TrigMath.cos(halfYaw),
            halfRoll = toRadians(Math.fround(roll)) * 0.5,
            sz = TrigMath.sin(halfRoll),
            cz = TrigMath.cos(halfRoll),
            cycz = cy * cz,
            sysz = sy * sz,
            sycz = sy * cz,
            cysz = cy * sz;

        return this.rotateByQuaternion(
            start,
            count,
            cx * cycz + sx * sysz,
            sx * cycz - cx * sysz,
            cx * sycz + sx * cysz,
            cx * cysz - sx * sycz,
        );
    }

    /** upstream: `ArrayTileModel rotateYXZ(int start, int count, float pitch, float yaw, float roll)` */
    rotateYXZ(
        start: number,
        count: number,
        pitch: number,
        yaw: number,
        roll: number,
    ): ArrayTileModel {
        const halfPitch = toRadians(Math.fround(pitch)) * 0.5,
            sx = TrigMath.sin(halfPitch),
            cx = TrigMath.cos(halfPitch),
            halfYaw = toRadians(Math.fround(yaw)) * 0.5,
            sy = TrigMath.sin(halfYaw),
            cy = TrigMath.cos(halfYaw),
            halfRoll = toRadians(Math.fround(roll)) * 0.5,
            sz = TrigMath.sin(halfRoll),
            cz = TrigMath.cos(halfRoll),
            cysx = cy * sx,
            sycx = sy * cx,
            sysx = sy * sx,
            cycx = cy * cx;

        return this.rotateByQuaternion(
            start,
            count,
            cysx * cz + sycx * sz,
            sycx * cz - cysx * sz,
            cycx * sz - sysx * cz,
            cycx * cz + sysx * sz,
        );
    }

    /**
     * upstream: `ArrayTileModel rotateByQuaternion(int start, int count, double qx, double qy, double qz, double qw)`
     *
     * All-`double` upstream, so no rounding happens until the `(float)` cast on store —
     * which the `Float32Array` performs.
     */
    rotateByQuaternion(
        start: number,
        count: number,
        qx: number,
        qy: number,
        qz: number,
        qw: number,
    ): ArrayTileModel {
        const position = this.position;
        const end = start + count;
        for (let face = start; face < end; face++) {
            for (let i = 0; i < 3; i++) {
                const index = face * ArrayTileModel.FI_POSITION + i * 3;

                const x = position[index]!;
                const y = position[index + 1]!;
                const z = position[index + 2]!;

                const px = qw * x + qy * z - qz * y;
                const py = qw * y + qz * x - qx * z;
                const pz = qw * z + qx * y - qy * x;
                const pw = -qx * x - qy * y - qz * z;

                position[index] = pw * -qx + px * qw - py * qz + pz * qy;
                position[index + 1] = pw * -qy + py * qw - pz * qx + px * qz;
                position[index + 2] = pw * -qz + pz * qw - px * qy + py * qx;
            }
        }

        return this;
    }

    /** upstream: `ArrayTileModel scale(int start, int count, float sx, float sy, float sz)` */
    scale(start: number, count: number, sx: number, sy: number, sz: number): ArrayTileModel {
        const f = Math.fround;
        sx = f(sx);
        sy = f(sy);
        sz = f(sz);

        const position = this.position;
        const end = start + count;
        for (let face = start; face < end; face++) {
            for (let i = 0; i < 3; i++) {
                const index = face * ArrayTileModel.FI_POSITION + i * 3;
                position[index] = position[index]! * sx;
                position[index + 1] = position[index + 1]! * sy;
                position[index + 2] = position[index + 2]! * sz;
            }
        }

        return this;
    }

    /** upstream: `ArrayTileModel translate(int start, int count, float dx, float dy, float dz)` */
    translate(start: number, count: number, dx: number, dy: number, dz: number): ArrayTileModel {
        const f = Math.fround;
        dx = f(dx);
        dy = f(dy);
        dz = f(dz);

        const position = this.position;
        const end = start + count;
        for (let face = start; face < end; face++) {
            for (let i = 0; i < 3; i++) {
                const index = face * ArrayTileModel.FI_POSITION + i * 3;
                position[index] = position[index]! + dx;
                position[index + 1] = position[index + 1]! + dy;
                position[index + 2] = position[index + 2]! + dz;
            }
        }

        return this;
    }

    /** upstream: the four `transform(...)` overloads */
    transform(start: number, count: number, t: MatrixM3f | MatrixM4f): ArrayTileModel;
    transform(
        start: number,
        count: number,
        m00: number,
        m01: number,
        m02: number,
        m10: number,
        m11: number,
        m12: number,
        m20: number,
        m21: number,
        m22: number,
    ): ArrayTileModel;
    transform(
        start: number,
        count: number,
        m00: number,
        m01: number,
        m02: number,
        m03: number,
        m10: number,
        m11: number,
        m12: number,
        m13: number,
        m20: number,
        m21: number,
        m22: number,
        m23: number,
        m30: number,
        m31: number,
        m32: number,
        m33: number,
    ): ArrayTileModel;
    transform(
        start: number,
        count: number,
        ...args: (number | MatrixM3f | MatrixM4f)[]
    ): ArrayTileModel {
        const first = args[0];

        if (typeof first !== "number") {
            if (first instanceof MatrixM4f) {
                return this.transform(
                    start,
                    count,
                    first.m00, first.m01, first.m02, first.m03,
                    first.m10, first.m11, first.m12, first.m13,
                    first.m20, first.m21, first.m22, first.m23,
                    first.m30, first.m31, first.m32, first.m33,
                );
            }
            const t = first as MatrixM3f;
            return this.transform(
                start,
                count,
                t.m00, t.m01, t.m02,
                t.m10, t.m11, t.m12,
                t.m20, t.m21, t.m22,
            );
        }

        const m = args as number[];

        if (m.length === 9) {
            return this.transform(
                start,
                count,
                m[0]!, m[1]!, m[2]!, 0,
                m[3]!, m[4]!, m[5]!, 0,
                m[6]!, m[7]!, m[8]!, 0,
                0, 0, 0, 1,
            );
        }

        const f = Math.fround;
        const m00 = f(m[0]!), m01 = f(m[1]!), m02 = f(m[2]!), m03 = f(m[3]!);
        const m10 = f(m[4]!), m11 = f(m[5]!), m12 = f(m[6]!), m13 = f(m[7]!);
        const m20 = f(m[8]!), m21 = f(m[9]!), m22 = f(m[10]!), m23 = f(m[11]!);

        const position = this.position;
        const end = start + count;
        for (let face = start; face < end; face++) {
            for (let i = 0; i < 3; i++) {
                const index = face * ArrayTileModel.FI_POSITION + i * 3;
                const x = position[index]!;
                const y = position[index + 1]!;
                const z = position[index + 2]!;

                // upstream: `m00 * x + m01 * y + m02 * z + m03`, all-`float`, so the
                // result is rounded to single precision after every operator
                position[index] = f(f(f(f(m00 * x) + f(m01 * y)) + f(m02 * z)) + m03);
                position[index + 1] = f(f(f(f(m10 * x) + f(m11 * y)) + f(m12 * z)) + m13);
                position[index + 2] = f(f(f(f(m20 * x) + f(m21 * y)) + f(m22 * z)) + m23);
            }
        }

        return this;
    }

    /** upstream: `ArrayTileModel reset(int size)` */
    reset(size: number): ArrayTileModel {
        this._size = size;
        return this;
    }

    /** upstream: `ArrayTileModel clear()` */
    clear(): ArrayTileModel {
        this._size = 0;
        return this;
    }

    /** upstream: `private void ensureCapacity(int count)` */
    private ensureCapacity(count: number): void {
        const size = this._size;
        if (size + count > this.capacity) {
            const _position = this.position;
            const _color = this.color,
                _uv = this.uv,
                _ao = this.ao;
            const _sunlight = this.sunlight,
                _blocklight = this.blocklight;
            const _materialIndex = this.materialIndex;

            // upstream: `(int) (capacity * GROW_MULTIPLIER) + count`, a `float` multiply
            let newCapacity =
                javaCastToInt(Math.fround(this.capacity * ArrayTileModel.GROW_MULTIPLIER)) + count;
            if (newCapacity > ArrayTileModel.MAX_CAPACITY)
                newCapacity = ArrayTileModel.MAX_CAPACITY;
            if (size + count > newCapacity)
                throw new MaxCapacityReachedException("Capacity out of range: " + (size + count));
            this.setCapacity(newCapacity);

            this.position.set(_position.subarray(0, size * ArrayTileModel.FI_POSITION));
            this.uv.set(_uv.subarray(0, size * ArrayTileModel.FI_UV));
            this.ao.set(_ao.subarray(0, size * ArrayTileModel.FI_AO));

            this.color.set(_color.subarray(0, size * ArrayTileModel.FI_COLOR));
            this.sunlight.set(_sunlight.subarray(0, size * ArrayTileModel.FI_SUNLIGHT));
            this.blocklight.set(_blocklight.subarray(0, size * ArrayTileModel.FI_BLOCKLIGHT));
            this.materialIndex.set(
                _materialIndex.subarray(0, size * ArrayTileModel.FI_MATERIAL_INDEX),
            );
        }
    }

    /** upstream: `private void setCapacity(int capacity)` */
    private setCapacity(capacity: number): void {
        if (capacity > ArrayTileModel.MAX_CAPACITY)
            throw new MaxCapacityReachedException("Capacity out of range: " + capacity);

        this.capacity = capacity;

        // attributes                              capacity * per-vertex * per-face
        this.position = new Float32Array(capacity * ArrayTileModel.FI_POSITION);
        this.uv = new Float32Array(capacity * ArrayTileModel.FI_UV);
        this.ao = new Float32Array(capacity * ArrayTileModel.FI_AO);

        this.color = new Float32Array(capacity * ArrayTileModel.FI_COLOR);
        this.sunlight = new Int8Array(capacity * ArrayTileModel.FI_SUNLIGHT);
        this.blocklight = new Int8Array(capacity * ArrayTileModel.FI_BLOCKLIGHT);
        this.materialIndex = new Int32Array(capacity * ArrayTileModel.FI_MATERIAL_INDEX);

        this.materialIndexSort = new Int32Array(this.materialIndex.length);
        this.materialIndexSortSupport = new Int32Array(this.materialIndex.length);
    }

    /**
     * upstream: `void sort()`
     *
     * A stable merge sort of the face indices by material index, followed by an
     * in-place permutation. This decides the order faces land in the .prbm file, so
     * both the stability and the cycle-following permutation loop are load-bearing.
     */
    sort(): void {
        const size = this._size;
        if (size <= 1) return; // nothing to sort

        const materialIndexSort = this.materialIndexSort;
        const materialIndexSortSupport = this.materialIndexSortSupport;

        // initialize material-index-sort
        for (let i = 0; i < size; i++) {
            materialIndexSort[i] = i;
            materialIndexSortSupport[i] = i;
        }

        // sort
        mergeSortInt(
            materialIndexSort,
            0,
            size,
            (i1, i2) => this.compareMaterialIndex(i1, i2),
            materialIndexSortSupport,
        );

        // move
        let s: number, c: number;
        for (let i = 0; i < size; i++) {
            s = materialIndexSort[i]!;
            c = 0;
            while (s < i) {
                s = materialIndexSort[s]!;

                // should never happen, just making absolutely sure this can't get stuck in an endless loop
                if (c++ > size) throw new Error("IllegalStateException");
            }
            this.swap(i, s);
        }
    }

    /** upstream: `private int compareMaterialIndex(int i1, int i2)` */
    private compareMaterialIndex(i1: number, i2: number): number {
        return compareInt(this.materialIndex[i1]!, this.materialIndex[i2]!);
    }

    /** upstream: `private void swap(int face1, int face2)` */
    private swap(face1: number, face2: number): void {
        const position = this.position,
            uv = this.uv,
            ao = this.ao,
            color = this.color;
        let i: number, if1: number, if2: number;
        let vf: number;
        let vb: number;

        //swap positions
        if1 = face1 * ArrayTileModel.FI_POSITION;
        if2 = face2 * ArrayTileModel.FI_POSITION;
        for (i = 0; i < ArrayTileModel.FI_POSITION; i++) {
            vf = position[if1 + i]!;
            position[if1 + i] = position[if2 + i]!;
            position[if2 + i] = vf;
        }

        //swap uv
        if1 = face1 * ArrayTileModel.FI_UV;
        if2 = face2 * ArrayTileModel.FI_UV;
        for (i = 0; i < ArrayTileModel.FI_UV; i++) {
            vf = uv[if1 + i]!;
            uv[if1 + i] = uv[if2 + i]!;
            uv[if2 + i] = vf;
        }

        //swap ao
        if1 = face1 * ArrayTileModel.FI_AO;
        if2 = face2 * ArrayTileModel.FI_AO;
        for (i = 0; i < ArrayTileModel.FI_AO; i++) {
            vf = ao[if1 + i]!;
            ao[if1 + i] = ao[if2 + i]!;
            ao[if2 + i] = vf;
        }

        //swap color
        if1 = face1 * ArrayTileModel.FI_COLOR;
        if2 = face2 * ArrayTileModel.FI_COLOR;
        for (i = 0; i < ArrayTileModel.FI_COLOR; i++) {
            vf = color[if1 + i]!;
            color[if1 + i] = color[if2 + i]!;
            color[if2 + i] = vf;
        }

        //swap sunlight (assuming FI_SUNLIGHT = 1)
        vb = this.sunlight[face1]!;
        this.sunlight[face1] = this.sunlight[face2]!;
        this.sunlight[face2] = vb;

        //swap blocklight (assuming FI_BLOCKLIGHT = 1)
        vb = this.blocklight[face1]!;
        this.blocklight[face1] = this.blocklight[face2]!;
        this.blocklight[face2] = vb;

        //swap material-index (assuming FI_MATERIAL_INDEX = 1)
        const vi = this.materialIndex[face1]!;
        this.materialIndex[face1] = this.materialIndex[face2]!;
        this.materialIndex[face2] = vi;
    }

    /**
     * upstream: the `INSTANCE_POOL` recycler lambda — keeps the instance if it used
     * more than `SHRINK_MULTIPLIER` of its capacity, or if it has done so within
     * `SHRINK_TIME`; drops it (returns null) otherwise, so an unusually large buffer
     * does not stay resident forever.
     */
    private static recycle(model: ArrayTileModel): ArrayTileModel | null {
        const now = Date.now();

        // upstream: `(float) model.size / model.capacity`, a `float` division
        if (
            Math.fround(Math.fround(model._size) / model.capacity) >
            ArrayTileModel.SHRINK_MULTIPLIER
        )
            model.lastCapacityUse = now;
        else if (model.lastCapacityUse + ArrayTileModel.SHRINK_TIME < now) return null; // drop model

        model.clear();
        return model;
    }

    private static INSTANCE_POOL: InstancePool<ArrayTileModel> | null = null;

    /**
     * upstream: `static InstancePool<ArrayTileModel> instancePool()`
     *
     * Created on first use rather than in a static initialiser, so merely importing
     * this module does not arm the pool's auto-clear timer.
     */
    static instancePool(): InstancePool<ArrayTileModel> {
        ArrayTileModel.INSTANCE_POOL ??= new InstancePool<ArrayTileModel>(
            () => new ArrayTileModel(100),
            (model) => ArrayTileModel.recycle(model),
            ArrayTileModel.SHRINK_TIME,
        );
        return ArrayTileModel.INSTANCE_POOL;
    }
}
