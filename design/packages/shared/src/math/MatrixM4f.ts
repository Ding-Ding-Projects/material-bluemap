import { MatrixM3f } from "./MatrixM3f.js";

/** Java Math.toRadians */
function toRadians(angdeg: number): number {
    return (angdeg / 180.0) * Math.PI;
}

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
        this.m00 = m00; this.m01 = m01; this.m02 = m02; this.m03 = m03;
        this.m10 = m10; this.m11 = m11; this.m12 = m12; this.m13 = m13;
        this.m20 = m20; this.m21 = m21; this.m22 = m22; this.m23 = m23;
        this.m30 = m30; this.m31 = m31; this.m32 = m32; this.m33 = m33;
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
        // create quaternion
        const halfAngle = toRadians(angle) * 0.5;
        const q = Math.sin(halfAngle) / Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ);

        //quaternion
        let qx = axisX * q,
            qy = axisY * q,
            qz = axisZ * q,
            qw = Math.cos(halfAngle);
        const qLength = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);

        // normalize quaternion
        qx /= qLength;
        qy /= qLength;
        qz /= qLength;
        qw /= qLength;

        return this.rotateByQuaternion(qx, qy, qz, qw);
    }

    rotateXYZ(pitch: number, yaw: number, roll: number): MatrixM4f {
        const halfPitch = toRadians(pitch) * 0.5,
            sx = Math.sin(halfPitch),
            cx = Math.cos(halfPitch),
            halfYaw = toRadians(yaw) * 0.5,
            sy = Math.sin(halfYaw),
            cy = Math.cos(halfYaw),
            halfRoll = toRadians(roll) * 0.5,
            sz = Math.sin(halfRoll),
            cz = Math.cos(halfRoll),
            cycz = cy * cz,
            sysz = sy * sz,
            sycz = sy * cz,
            cysz = cy * sz;

        return this.rotateByQuaternion(
            sx * cycz + cx * sysz,
            cx * sycz - sx * cysz,
            cx * cysz + sx * sycz,
            cx * cycz - sx * sysz
        );
    }

    rotateZYX(pitch: number, yaw: number, roll: number): MatrixM4f {
        const halfPitch = toRadians(pitch) * 0.5,
            sx = Math.sin(halfPitch),
            cx = Math.cos(halfPitch),
            halfYaw = toRadians(yaw) * 0.5,
            sy = Math.sin(halfYaw),
            cy = Math.cos(halfYaw),
            halfRoll = toRadians(roll) * 0.5,
            sz = Math.sin(halfRoll),
            cz = Math.cos(halfRoll),
            cycz = cy * cz,
            sysz = sy * sz,
            sycz = sy * cz,
            cysz = cy * sz;

        return this.rotateByQuaternion(
            cx * cycz + sx * sysz,
            sx * cycz - cx * sysz,
            cx * sycz + sx * cysz,
            cx * cysz - sx * sycz
        );
    }

    rotateYXZ(pitch: number, yaw: number, roll: number): MatrixM4f {
        const halfPitch = toRadians(pitch) * 0.5,
            sx = Math.sin(halfPitch),
            cx = Math.cos(halfPitch),
            halfYaw = toRadians(yaw) * 0.5,
            sy = Math.sin(halfYaw),
            cy = Math.cos(halfYaw),
            halfRoll = toRadians(roll) * 0.5,
            sz = Math.sin(halfRoll),
            cz = Math.cos(halfRoll),
            cysx = cy * sx,
            sycx = sy * cx,
            sysx = sy * sx,
            cycx = cy * cx;

        return this.rotateByQuaternion(
            cysx * cz + sycx * sz,
            sycx * cz - cysx * sz,
            cycx * sz - sysx * cz,
            cycx * cz + sysx * sz
        );
    }

    rotateByQuaternion(qx: number, qy: number, qz: number, qw: number): MatrixM4f {
        return this.multiplyTo(
            1 - 2 * qy * qy - 2 * qz * qz,
            2 * qx * qy - 2 * qw * qz,
            2 * qx * qz + 2 * qw * qy,
            0,
            2 * qx * qy + 2 * qw * qz,
            1 - 2 * qx * qx - 2 * qz * qz,
            2 * qy * qz - 2 * qw * qx,
            0,
            2 * qx * qz - 2 * qw * qy,
            2 * qy * qz + 2 * qx * qw,
            1 - 2 * qx * qx - 2 * qy * qy,
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
        return this.set(
            this.m00 * m00 + this.m01 * m10 + this.m02 * m20 + this.m03 * m30,
            this.m00 * m01 + this.m01 * m11 + this.m02 * m21 + this.m03 * m31,
            this.m00 * m02 + this.m01 * m12 + this.m02 * m22 + this.m03 * m32,
            this.m00 * m03 + this.m01 * m13 + this.m02 * m23 + this.m03 * m33,
            this.m10 * m00 + this.m11 * m10 + this.m12 * m20 + this.m13 * m30,
            this.m10 * m01 + this.m11 * m11 + this.m12 * m21 + this.m13 * m31,
            this.m10 * m02 + this.m11 * m12 + this.m12 * m22 + this.m13 * m32,
            this.m10 * m03 + this.m11 * m13 + this.m12 * m23 + this.m13 * m33,
            this.m20 * m00 + this.m21 * m10 + this.m22 * m20 + this.m23 * m30,
            this.m20 * m01 + this.m21 * m11 + this.m22 * m21 + this.m23 * m31,
            this.m20 * m02 + this.m21 * m12 + this.m22 * m22 + this.m23 * m32,
            this.m20 * m03 + this.m21 * m13 + this.m22 * m23 + this.m23 * m33,
            this.m30 * m00 + this.m31 * m10 + this.m32 * m20 + this.m33 * m30,
            this.m30 * m01 + this.m31 * m11 + this.m32 * m21 + this.m33 * m31,
            this.m30 * m02 + this.m31 * m12 + this.m32 * m22 + this.m33 * m32,
            this.m30 * m03 + this.m31 * m13 + this.m32 * m23 + this.m33 * m33
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
                m.m00 * this.m00 + m.m01 * this.m10 + m.m02 * this.m20,
                m.m00 * this.m01 + m.m01 * this.m11 + m.m02 * this.m21,
                m.m00 * this.m02 + m.m01 * this.m12 + m.m02 * this.m22,
                m.m00 * this.m03 + m.m01 * this.m13 + m.m02 * this.m23,
                m.m10 * this.m00 + m.m11 * this.m10 + m.m12 * this.m20,
                m.m10 * this.m01 + m.m11 * this.m11 + m.m12 * this.m21,
                m.m10 * this.m02 + m.m11 * this.m12 + m.m12 * this.m22,
                m.m10 * this.m03 + m.m11 * this.m13 + m.m12 * this.m23,
                m.m20 * this.m00 + m.m21 * this.m10 + m.m22 * this.m20,
                m.m20 * this.m01 + m.m21 * this.m11 + m.m22 * this.m21,
                m.m20 * this.m02 + m.m21 * this.m12 + m.m22 * this.m22,
                m.m20 * this.m03 + m.m21 * this.m13 + m.m22 * this.m23,
                this.m30,
                this.m31,
                this.m32,
                this.m33
            );
        }

        return this.set(
            m00 * this.m00 + (m01 as number) * this.m10 + (m02 as number) * this.m20 + (m03 as number) * this.m30,
            m00 * this.m01 + (m01 as number) * this.m11 + (m02 as number) * this.m21 + (m03 as number) * this.m31,
            m00 * this.m02 + (m01 as number) * this.m12 + (m02 as number) * this.m22 + (m03 as number) * this.m32,
            m00 * this.m03 + (m01 as number) * this.m13 + (m02 as number) * this.m23 + (m03 as number) * this.m33,
            (m10 as number) * this.m00 + (m11 as number) * this.m10 + (m12 as number) * this.m20 + (m13 as number) * this.m30,
            (m10 as number) * this.m01 + (m11 as number) * this.m11 + (m12 as number) * this.m21 + (m13 as number) * this.m31,
            (m10 as number) * this.m02 + (m11 as number) * this.m12 + (m12 as number) * this.m22 + (m13 as number) * this.m32,
            (m10 as number) * this.m03 + (m11 as number) * this.m13 + (m12 as number) * this.m23 + (m13 as number) * this.m33,
            (m20 as number) * this.m00 + (m21 as number) * this.m10 + (m22 as number) * this.m20 + (m23 as number) * this.m30,
            (m20 as number) * this.m01 + (m21 as number) * this.m11 + (m22 as number) * this.m21 + (m23 as number) * this.m31,
            (m20 as number) * this.m02 + (m21 as number) * this.m12 + (m22 as number) * this.m22 + (m23 as number) * this.m32,
            (m20 as number) * this.m03 + (m21 as number) * this.m13 + (m22 as number) * this.m23 + (m23 as number) * this.m33,
            (m30 as number) * this.m00 + (m31 as number) * this.m10 + (m32 as number) * this.m20 + (m33 as number) * this.m30,
            (m30 as number) * this.m01 + (m31 as number) * this.m11 + (m32 as number) * this.m21 + (m33 as number) * this.m31,
            (m30 as number) * this.m02 + (m31 as number) * this.m12 + (m32 as number) * this.m22 + (m33 as number) * this.m32,
            (m30 as number) * this.m03 + (m31 as number) * this.m13 + (m32 as number) * this.m23 + (m33 as number) * this.m33
        );
    }
}
