import { TrigMath, toRadians } from "./TrigMath.js";

const fr = Math.fround;

/**
 * upstream: util/math/MatrixM3f.java
 *
 * Two fidelity points that are easy to lose in a port and change rendered geometry:
 *
 * - every element and every operand is a java `float`, so each multiply/add rounds to
 *   32-bit before the next one runs — `Math.fround` marks those steps;
 * - the rotations use **flow-math's {@link TrigMath}**, a quantized 2^22-entry sine table,
 *   not `Math.sin`/`Math.cos`. The two differ by up to ~1.5e-6 (~25 float-ulps), which is
 *   far more than a rounding artifact. The quaternion itself is built in `double` and only
 *   its four components are narrowed to `float`, exactly as upstream does.
 */
export class MatrixM3f {
    m00 = 1; m01 = 0; m02 = 0;
    m10 = 0; m11 = 1; m12 = 0;
    m20 = 0; m21 = 0; m22 = 1;

    set(
        m00: number, m01: number, m02: number,
        m10: number, m11: number, m12: number,
        m20: number, m21: number, m22: number
    ): MatrixM3f {
        this.m00 = fr(m00); this.m01 = fr(m01); this.m02 = fr(m02);
        this.m10 = fr(m10); this.m11 = fr(m11); this.m12 = fr(m12);
        this.m20 = fr(m20); this.m21 = fr(m21); this.m22 = fr(m22);
        return this;
    }

    invert(): MatrixM3f {
        const det = this.determinant();
        const { m00, m01, m02, m10, m11, m12, m20, m21, m22 } = this;
        return this.set(
            fr(fr(fr(m11 * m22) - fr(m21 * m12)) / det),
            fr(-fr(fr(m01 * m22) - fr(m21 * m02)) / det),
            fr(fr(fr(m01 * m12) - fr(m02 * m11)) / det),
            fr(-fr(fr(m10 * m22) - fr(m20 * m12)) / det),
            fr(fr(fr(m00 * m22) - fr(m20 * m02)) / det),
            fr(-fr(fr(m00 * m12) - fr(m10 * m02)) / det),
            fr(fr(fr(m10 * m21) - fr(m20 * m11)) / det),
            fr(-fr(fr(m00 * m21) - fr(m20 * m01)) / det),
            fr(fr(fr(m00 * m11) - fr(m01 * m10)) / det)
        );
    }

    identity(): MatrixM3f {
        return this.set(
            1, 0, 0,
            0, 1, 0,
            0, 0, 1
        );
    }

    scale(x: number, y: number, z: number): MatrixM3f {
        return this.multiplyTo(
            x, 0, 0,
            0, y, 0,
            0, 0, z
        );
    }

    translate(x: number, y: number): MatrixM3f {
        return this.multiplyTo(
            1, 0, x,
            0, 1, y,
            0, 0, 1
        );
    }

    rotate(angle: number, axisX: number, axisY: number, axisZ: number): MatrixM3f {
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

    rotateXYZ(pitch: number, yaw: number, roll: number): MatrixM3f {
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

    rotateZYX(pitch: number, yaw: number, roll: number): MatrixM3f {
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

    rotateYXZ(pitch: number, yaw: number, roll: number): MatrixM3f {
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

    rotateByQuaternion(qx: number, qy: number, qz: number, qw: number): MatrixM3f {
        const x = fr(qx), y = fr(qy), z = fr(qz), w = fr(qw);
        return this.multiplyTo(
            fr(fr(1 - fr(fr(2 * y) * y)) - fr(fr(2 * z) * z)),
            fr(fr(fr(2 * x) * y) - fr(fr(2 * w) * z)),
            fr(fr(fr(2 * x) * z) + fr(fr(2 * w) * y)),
            fr(fr(fr(2 * x) * y) + fr(fr(2 * w) * z)),
            fr(fr(1 - fr(fr(2 * x) * x)) - fr(fr(2 * z) * z)),
            fr(fr(fr(2 * y) * z) - fr(fr(2 * w) * x)),
            fr(fr(fr(2 * x) * z) - fr(fr(2 * w) * y)),
            fr(fr(fr(2 * y) * z) + fr(fr(2 * x) * w)),
            fr(fr(1 - fr(fr(2 * x) * x)) - fr(fr(2 * y) * y))
        );
    }

    multiply(
        m00: number, m01: number, m02: number,
        m10: number, m11: number, m12: number,
        m20: number, m21: number, m22: number
    ): MatrixM3f {
        const a00 = fr(m00), a01 = fr(m01), a02 = fr(m02);
        const a10 = fr(m10), a11 = fr(m11), a12 = fr(m12);
        const a20 = fr(m20), a21 = fr(m21), a22 = fr(m22);
        return this.set(
            fr(fr(fr(this.m00 * a00) + fr(this.m01 * a10)) + fr(this.m02 * a20)),
            fr(fr(fr(this.m00 * a01) + fr(this.m01 * a11)) + fr(this.m02 * a21)),
            fr(fr(fr(this.m00 * a02) + fr(this.m01 * a12)) + fr(this.m02 * a22)),
            fr(fr(fr(this.m10 * a00) + fr(this.m11 * a10)) + fr(this.m12 * a20)),
            fr(fr(fr(this.m10 * a01) + fr(this.m11 * a11)) + fr(this.m12 * a21)),
            fr(fr(fr(this.m10 * a02) + fr(this.m11 * a12)) + fr(this.m12 * a22)),
            fr(fr(fr(this.m20 * a00) + fr(this.m21 * a10)) + fr(this.m22 * a20)),
            fr(fr(fr(this.m20 * a01) + fr(this.m21 * a11)) + fr(this.m22 * a21)),
            fr(fr(fr(this.m20 * a02) + fr(this.m21 * a12)) + fr(this.m22 * a22))
        );
    }

    multiplyTo(
        m00: number, m01: number, m02: number,
        m10: number, m11: number, m12: number,
        m20: number, m21: number, m22: number
    ): MatrixM3f {
        const a00 = fr(m00), a01 = fr(m01), a02 = fr(m02);
        const a10 = fr(m10), a11 = fr(m11), a12 = fr(m12);
        const a20 = fr(m20), a21 = fr(m21), a22 = fr(m22);
        return this.set(
            fr(fr(fr(a00 * this.m00) + fr(a01 * this.m10)) + fr(a02 * this.m20)),
            fr(fr(fr(a00 * this.m01) + fr(a01 * this.m11)) + fr(a02 * this.m21)),
            fr(fr(fr(a00 * this.m02) + fr(a01 * this.m12)) + fr(a02 * this.m22)),
            fr(fr(fr(a10 * this.m00) + fr(a11 * this.m10)) + fr(a12 * this.m20)),
            fr(fr(fr(a10 * this.m01) + fr(a11 * this.m11)) + fr(a12 * this.m21)),
            fr(fr(fr(a10 * this.m02) + fr(a11 * this.m12)) + fr(a12 * this.m22)),
            fr(fr(fr(a20 * this.m00) + fr(a21 * this.m10)) + fr(a22 * this.m20)),
            fr(fr(fr(a20 * this.m01) + fr(a21 * this.m11)) + fr(a22 * this.m21)),
            fr(fr(fr(a20 * this.m02) + fr(a21 * this.m12)) + fr(a22 * this.m22))
        );
    }

    /** upstream returns a `float` */
    determinant(): number {
        return fr(
            fr(
                fr(this.m00 * fr(fr(this.m11 * this.m22) - fr(this.m12 * this.m21))) -
                    fr(this.m01 * fr(fr(this.m10 * this.m22) - fr(this.m12 * this.m20)))
            ) + fr(this.m02 * fr(fr(this.m10 * this.m21) - fr(this.m11 * this.m20)))
        );
    }
}
