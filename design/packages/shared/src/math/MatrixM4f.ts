import { MatrixM3f } from "./MatrixM3f.js";
import { TrigMath, toRadians } from "./TrigMath.js";

const fr = Math.fround;

/**
 * upstream: util/math/MatrixM4f.java
 *
 * Same two fidelity points as {@link MatrixM3f}: every element is a java `float` so each
 * step rounds to 32-bit, and the rotations go through flow-math's {@link TrigMath}
 * (a quantized 2^22-entry sine table) rather than `Math.sin`/`Math.cos`.
 *
 * This class is not incidental to rendering: {@code blockstate/Variant#init} and
 * {@code model/Rotation#init} bake their transform-matrices with
 * {@link MatrixM4f#rotateYXZ}, and the mesher applies those matrices to every vertex of
 * every rotated block model.
 */
export class MatrixM4f {
    m00 = 1; m01 = 0; m02 = 0; m03 = 0;
    m10 = 0; m11 = 1; m12 = 0; m13 = 0;
    m20 = 0; m21 = 0; m22 = 1; m23 = 0;
    m30 = 0; m31 = 0; m32 = 0; m33 = 1;

    set(
        m00: number, m01: number, m02: number, m03: number,
        m10: number, m11: number, m12: number, m13: number,
        m20: number, m21: number, m22: number, m23: number,
        m30: number, m31: number, m32: number, m33: number
    ): MatrixM4f {
        this.m00 = fr(m00); this.m01 = fr(m01); this.m02 = fr(m02); this.m03 = fr(m03);
        this.m10 = fr(m10); this.m11 = fr(m11); this.m12 = fr(m12); this.m13 = fr(m13);
        this.m20 = fr(m20); this.m21 = fr(m21); this.m22 = fr(m22); this.m23 = fr(m23);
        this.m30 = fr(m30); this.m31 = fr(m31); this.m32 = fr(m32); this.m33 = fr(m33);
        return this;
    }

    copy(m: MatrixM4f): MatrixM4f {
        return this.set(
            m.m00, m.m01, m.m02, m.m03,
            m.m10, m.m11, m.m12, m.m13,
            m.m20, m.m21, m.m22, m.m23,
            m.m30, m.m31, m.m32, m.m33
        );
    }

    identity(): MatrixM4f {
        return this.set(
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        );
    }

    translate(x: number, y: number, z: number): MatrixM4f {
        return this.multiplyTo(
            1, 0, 0, x,
            0, 1, 0, y,
            0, 0, 1, z,
            0, 0, 0, 1
        );
    }

    scale(x: number, y: number, z: number): MatrixM4f {
        return this.multiplyTo(
            x, 0, 0, 0,
            0, y, 0, 0,
            0, 0, z, 0,
            0, 0, 0, 1
        );
    }

    rotate(angle: number, axisX: number, axisY: number, axisZ: number): MatrixM4f {
        const fAxisX = fr(axisX), fAxisY = fr(axisY), fAxisZ = fr(axisZ);

        // create quaternion (upstream: all double, from TrigMath)
        const halfAngle = toRadians(fr(angle)) * 0.5;
        const q =
            TrigMath.sin(halfAngle) /
            Math.sqrt(fAxisX * fAxisX + fAxisY * fAxisY + fAxisZ * fAxisZ);

        //quaternion
        let qx = fAxisX * q,
            qy = fAxisY * q,
            qz = fAxisZ * q,
            qw = TrigMath.cos(halfAngle);
        const qLength = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);

        // normalize quaternion
        qx /= qLength;
        qy /= qLength;
        qz /= qLength;
        qw /= qLength;

        return this.rotateByQuaternion(fr(qx), fr(qy), fr(qz), fr(qw));
    }

    rotateXYZ(pitch: number, yaw: number, roll: number): MatrixM4f {
        const halfPitch = toRadians(fr(pitch)) * 0.5,
            sx = TrigMath.sin(halfPitch),
            cx = TrigMath.cos(halfPitch),
            halfYaw = toRadians(fr(yaw)) * 0.5,
            sy = TrigMath.sin(halfYaw),
            cy = TrigMath.cos(halfYaw),
            halfRoll = toRadians(fr(roll)) * 0.5,
            sz = TrigMath.sin(halfRoll),
            cz = TrigMath.cos(halfRoll),
            cycz = cy * cz,
            sysz = sy * sz,
            sycz = sy * cz,
            cysz = cy * sz;

        return this.rotateByQuaternion(
            fr(sx * cycz + cx * sysz),
            fr(cx * sycz - sx * cysz),
            fr(cx * cysz + sx * sycz),
            fr(cx * cycz - sx * sysz)
        );
    }

    rotateZYX(pitch: number, yaw: number, roll: number): MatrixM4f {
        const halfPitch = toRadians(fr(pitch)) * 0.5,
            sx = TrigMath.sin(halfPitch),
            cx = TrigMath.cos(halfPitch),
            halfYaw = toRadians(fr(yaw)) * 0.5,
            sy = TrigMath.sin(halfYaw),
            cy = TrigMath.cos(halfYaw),
            halfRoll = toRadians(fr(roll)) * 0.5,
            sz = TrigMath.sin(halfRoll),
            cz = TrigMath.cos(halfRoll),
            cycz = cy * cz,
            sysz = sy * sz,
            sycz = sy * cz,
            cysz = cy * sz;

        return this.rotateByQuaternion(
            fr(cx * cycz + sx * sysz),
            fr(sx * cycz - cx * sysz),
            fr(cx * sycz + sx * cysz),
            fr(cx * cysz - sx * sycz)
        );
    }

    rotateYXZ(pitch: number, yaw: number, roll: number): MatrixM4f {
        const halfPitch = toRadians(fr(pitch)) * 0.5,
            sx = TrigMath.sin(halfPitch),
            cx = TrigMath.cos(halfPitch),
            halfYaw = toRadians(fr(yaw)) * 0.5,
            sy = TrigMath.sin(halfYaw),
            cy = TrigMath.cos(halfYaw),
            halfRoll = toRadians(fr(roll)) * 0.5,
            sz = TrigMath.sin(halfRoll),
            cz = TrigMath.cos(halfRoll),
            cysx = cy * sx,
            sycx = sy * cx,
            sysx = sy * sx,
            cycx = cy * cx;

        return this.rotateByQuaternion(
            fr(cysx * cz + sycx * sz),
            fr(sycx * cz - cysx * sz),
            fr(cycx * sz - sysx * cz),
            fr(cycx * cz + sysx * sz)
        );
    }

    rotateByQuaternion(qx: number, qy: number, qz: number, qw: number): MatrixM4f {
        const x = fr(qx), y = fr(qy), z = fr(qz), w = fr(qw);
        return this.multiplyTo(
            fr(fr(1 - fr(fr(2 * y) * y)) - fr(fr(2 * z) * z)),
            fr(fr(fr(2 * x) * y) - fr(fr(2 * w) * z)),
            fr(fr(fr(2 * x) * z) + fr(fr(2 * w) * y)),
            0,
            fr(fr(fr(2 * x) * y) + fr(fr(2 * w) * z)),
            fr(fr(1 - fr(fr(2 * x) * x)) - fr(fr(2 * z) * z)),
            fr(fr(fr(2 * y) * z) - fr(fr(2 * w) * x)),
            0,
            fr(fr(fr(2 * x) * z) - fr(fr(2 * w) * y)),
            fr(fr(fr(2 * y) * z) + fr(fr(2 * x) * w)),
            fr(fr(1 - fr(fr(2 * x) * x)) - fr(fr(2 * y) * y)),
            0,
            0, 0, 0, 1
        );
    }

    multiply(
        m00: number, m01: number, m02: number, m03: number,
        m10: number, m11: number, m12: number, m13: number,
        m20: number, m21: number, m22: number, m23: number,
        m30: number, m31: number, m32: number, m33: number
    ): MatrixM4f {
        const a00 = fr(m00), a01 = fr(m01), a02 = fr(m02), a03 = fr(m03);
        const a10 = fr(m10), a11 = fr(m11), a12 = fr(m12), a13 = fr(m13);
        const a20 = fr(m20), a21 = fr(m21), a22 = fr(m22), a23 = fr(m23);
        const a30 = fr(m30), a31 = fr(m31), a32 = fr(m32), a33 = fr(m33);

        return this.set(
            fr(fr(fr(fr(this.m00 * a00) + fr(this.m01 * a10)) + fr(this.m02 * a20)) + fr(this.m03 * a30)),
            fr(fr(fr(fr(this.m00 * a01) + fr(this.m01 * a11)) + fr(this.m02 * a21)) + fr(this.m03 * a31)),
            fr(fr(fr(fr(this.m00 * a02) + fr(this.m01 * a12)) + fr(this.m02 * a22)) + fr(this.m03 * a32)),
            fr(fr(fr(fr(this.m00 * a03) + fr(this.m01 * a13)) + fr(this.m02 * a23)) + fr(this.m03 * a33)),
            fr(fr(fr(fr(this.m10 * a00) + fr(this.m11 * a10)) + fr(this.m12 * a20)) + fr(this.m13 * a30)),
            fr(fr(fr(fr(this.m10 * a01) + fr(this.m11 * a11)) + fr(this.m12 * a21)) + fr(this.m13 * a31)),
            fr(fr(fr(fr(this.m10 * a02) + fr(this.m11 * a12)) + fr(this.m12 * a22)) + fr(this.m13 * a32)),
            fr(fr(fr(fr(this.m10 * a03) + fr(this.m11 * a13)) + fr(this.m12 * a23)) + fr(this.m13 * a33)),
            fr(fr(fr(fr(this.m20 * a00) + fr(this.m21 * a10)) + fr(this.m22 * a20)) + fr(this.m23 * a30)),
            fr(fr(fr(fr(this.m20 * a01) + fr(this.m21 * a11)) + fr(this.m22 * a21)) + fr(this.m23 * a31)),
            fr(fr(fr(fr(this.m20 * a02) + fr(this.m21 * a12)) + fr(this.m22 * a22)) + fr(this.m23 * a32)),
            fr(fr(fr(fr(this.m20 * a03) + fr(this.m21 * a13)) + fr(this.m22 * a23)) + fr(this.m23 * a33)),
            fr(fr(fr(fr(this.m30 * a00) + fr(this.m31 * a10)) + fr(this.m32 * a20)) + fr(this.m33 * a30)),
            fr(fr(fr(fr(this.m30 * a01) + fr(this.m31 * a11)) + fr(this.m32 * a21)) + fr(this.m33 * a31)),
            fr(fr(fr(fr(this.m30 * a02) + fr(this.m31 * a12)) + fr(this.m32 * a22)) + fr(this.m33 * a32)),
            fr(fr(fr(fr(this.m30 * a03) + fr(this.m31 * a13)) + fr(this.m32 * a23)) + fr(this.m33 * a33))
        );
    }

    multiplyTo(m: MatrixM3f): MatrixM4f;
    multiplyTo(
        m00: number, m01: number, m02: number, m03: number,
        m10: number, m11: number, m12: number, m13: number,
        m20: number, m21: number, m22: number, m23: number,
        m30: number, m31: number, m32: number, m33: number
    ): MatrixM4f;
    multiplyTo(
        m00: MatrixM3f | number, m01?: number, m02?: number, m03?: number,
        m10?: number, m11?: number, m12?: number, m13?: number,
        m20?: number, m21?: number, m22?: number, m23?: number,
        m30?: number, m31?: number, m32?: number, m33?: number
    ): MatrixM4f {
        if (m00 instanceof MatrixM3f) {
            const m = m00;
            return this.set(
                fr(fr(fr(m.m00 * this.m00) + fr(m.m01 * this.m10)) + fr(m.m02 * this.m20)),
                fr(fr(fr(m.m00 * this.m01) + fr(m.m01 * this.m11)) + fr(m.m02 * this.m21)),
                fr(fr(fr(m.m00 * this.m02) + fr(m.m01 * this.m12)) + fr(m.m02 * this.m22)),
                fr(fr(fr(m.m00 * this.m03) + fr(m.m01 * this.m13)) + fr(m.m02 * this.m23)),
                fr(fr(fr(m.m10 * this.m00) + fr(m.m11 * this.m10)) + fr(m.m12 * this.m20)),
                fr(fr(fr(m.m10 * this.m01) + fr(m.m11 * this.m11)) + fr(m.m12 * this.m21)),
                fr(fr(fr(m.m10 * this.m02) + fr(m.m11 * this.m12)) + fr(m.m12 * this.m22)),
                fr(fr(fr(m.m10 * this.m03) + fr(m.m11 * this.m13)) + fr(m.m12 * this.m23)),
                fr(fr(fr(m.m20 * this.m00) + fr(m.m21 * this.m10)) + fr(m.m22 * this.m20)),
                fr(fr(fr(m.m20 * this.m01) + fr(m.m21 * this.m11)) + fr(m.m22 * this.m21)),
                fr(fr(fr(m.m20 * this.m02) + fr(m.m21 * this.m12)) + fr(m.m22 * this.m22)),
                fr(fr(fr(m.m20 * this.m03) + fr(m.m21 * this.m13)) + fr(m.m22 * this.m23)),
                this.m30,
                this.m31,
                this.m32,
                this.m33
            );
        }

        const a00 = fr(m00), a01 = fr(m01 as number), a02 = fr(m02 as number), a03 = fr(m03 as number);
        const a10 = fr(m10 as number), a11 = fr(m11 as number), a12 = fr(m12 as number), a13 = fr(m13 as number);
        const a20 = fr(m20 as number), a21 = fr(m21 as number), a22 = fr(m22 as number), a23 = fr(m23 as number);
        const a30 = fr(m30 as number), a31 = fr(m31 as number), a32 = fr(m32 as number), a33 = fr(m33 as number);

        return this.set(
            fr(fr(fr(fr(a00 * this.m00) + fr(a01 * this.m10)) + fr(a02 * this.m20)) + fr(a03 * this.m30)),
            fr(fr(fr(fr(a00 * this.m01) + fr(a01 * this.m11)) + fr(a02 * this.m21)) + fr(a03 * this.m31)),
            fr(fr(fr(fr(a00 * this.m02) + fr(a01 * this.m12)) + fr(a02 * this.m22)) + fr(a03 * this.m32)),
            fr(fr(fr(fr(a00 * this.m03) + fr(a01 * this.m13)) + fr(a02 * this.m23)) + fr(a03 * this.m33)),
            fr(fr(fr(fr(a10 * this.m00) + fr(a11 * this.m10)) + fr(a12 * this.m20)) + fr(a13 * this.m30)),
            fr(fr(fr(fr(a10 * this.m01) + fr(a11 * this.m11)) + fr(a12 * this.m21)) + fr(a13 * this.m31)),
            fr(fr(fr(fr(a10 * this.m02) + fr(a11 * this.m12)) + fr(a12 * this.m22)) + fr(a13 * this.m32)),
            fr(fr(fr(fr(a10 * this.m03) + fr(a11 * this.m13)) + fr(a12 * this.m23)) + fr(a13 * this.m33)),
            fr(fr(fr(fr(a20 * this.m00) + fr(a21 * this.m10)) + fr(a22 * this.m20)) + fr(a23 * this.m30)),
            fr(fr(fr(fr(a20 * this.m01) + fr(a21 * this.m11)) + fr(a22 * this.m21)) + fr(a23 * this.m31)),
            fr(fr(fr(fr(a20 * this.m02) + fr(a21 * this.m12)) + fr(a22 * this.m22)) + fr(a23 * this.m32)),
            fr(fr(fr(fr(a20 * this.m03) + fr(a21 * this.m13)) + fr(a22 * this.m23)) + fr(a23 * this.m33)),
            fr(fr(fr(fr(a30 * this.m00) + fr(a31 * this.m10)) + fr(a32 * this.m20)) + fr(a33 * this.m30)),
            fr(fr(fr(fr(a30 * this.m01) + fr(a31 * this.m11)) + fr(a32 * this.m21)) + fr(a33 * this.m31)),
            fr(fr(fr(fr(a30 * this.m02) + fr(a31 * this.m12)) + fr(a32 * this.m22)) + fr(a33 * this.m32)),
            fr(fr(fr(fr(a30 * this.m03) + fr(a31 * this.m13)) + fr(a32 * this.m23)) + fr(a33 * this.m33))
        );
    }
}
