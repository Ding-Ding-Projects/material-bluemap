/** Java Math.toRadians */
function toRadians(angdeg: number): number {
    return (angdeg / 180.0) * Math.PI;
}

export class MatrixM3f {
    m00 = 1; m01 = 0; m02 = 0;
    m10 = 0; m11 = 1; m12 = 0;
    m20 = 0; m21 = 0; m22 = 1;

    set(
        m00: number, m01: number, m02: number,
        m10: number, m11: number, m12: number,
        m20: number, m21: number, m22: number
    ): MatrixM3f {
        this.m00 = m00; this.m01 = m01; this.m02 = m02;
        this.m10 = m10; this.m11 = m11; this.m12 = m12;
        this.m20 = m20; this.m21 = m21; this.m22 = m22;
        return this;
    }

    invert(): MatrixM3f {
        const det = this.determinant();
        const { m00, m01, m02, m10, m11, m12, m20, m21, m22 } = this;
        return this.set(
            (m11 * m22 - m21 * m12) / det, -(m01 * m22 - m21 * m02) / det, (m01 * m12 - m02 * m11) / det,
            -(m10 * m22 - m20 * m12) / det, (m00 * m22 - m20 * m02) / det, -(m00 * m12 - m10 * m02) / det,
            (m10 * m21 - m20 * m11) / det, -(m00 * m21 - m20 * m01) / det, (m00 * m11 - m01 * m10) / det
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

    rotateXYZ(pitch: number, yaw: number, roll: number): MatrixM3f {
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

    rotateZYX(pitch: number, yaw: number, roll: number): MatrixM3f {
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

    rotateYXZ(pitch: number, yaw: number, roll: number): MatrixM3f {
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

    rotateByQuaternion(qx: number, qy: number, qz: number, qw: number): MatrixM3f {
        return this.multiplyTo(
            1 - 2 * qy * qy - 2 * qz * qz,
            2 * qx * qy - 2 * qw * qz,
            2 * qx * qz + 2 * qw * qy,
            2 * qx * qy + 2 * qw * qz,
            1 - 2 * qx * qx - 2 * qz * qz,
            2 * qy * qz - 2 * qw * qx,
            2 * qx * qz - 2 * qw * qy,
            2 * qy * qz + 2 * qx * qw,
            1 - 2 * qx * qx - 2 * qy * qy
        );
    }

    multiply(
        m00: number, m01: number, m02: number,
        m10: number, m11: number, m12: number,
        m20: number, m21: number, m22: number
    ): MatrixM3f {
        return this.set(
            this.m00 * m00 + this.m01 * m10 + this.m02 * m20,
            this.m00 * m01 + this.m01 * m11 + this.m02 * m21,
            this.m00 * m02 + this.m01 * m12 + this.m02 * m22,
            this.m10 * m00 + this.m11 * m10 + this.m12 * m20,
            this.m10 * m01 + this.m11 * m11 + this.m12 * m21,
            this.m10 * m02 + this.m11 * m12 + this.m12 * m22,
            this.m20 * m00 + this.m21 * m10 + this.m22 * m20,
            this.m20 * m01 + this.m21 * m11 + this.m22 * m21,
            this.m20 * m02 + this.m21 * m12 + this.m22 * m22
        );
    }

    multiplyTo(
        m00: number, m01: number, m02: number,
        m10: number, m11: number, m12: number,
        m20: number, m21: number, m22: number
    ): MatrixM3f {
        return this.set(
            m00 * this.m00 + m01 * this.m10 + m02 * this.m20,
            m00 * this.m01 + m01 * this.m11 + m02 * this.m21,
            m00 * this.m02 + m01 * this.m12 + m02 * this.m22,
            m10 * this.m00 + m11 * this.m10 + m12 * this.m20,
            m10 * this.m01 + m11 * this.m11 + m12 * this.m21,
            m10 * this.m02 + m11 * this.m12 + m12 * this.m22,
            m20 * this.m00 + m21 * this.m10 + m22 * this.m20,
            m20 * this.m01 + m21 * this.m11 + m22 * this.m21,
            m20 * this.m02 + m21 * this.m12 + m22 * this.m22
        );
    }

    determinant(): number {
        return (
            this.m00 * (this.m11 * this.m22 - this.m12 * this.m21) -
            this.m01 * (this.m10 * this.m22 - this.m12 * this.m20) +
            this.m02 * (this.m10 * this.m21 - this.m11 * this.m20)
        );
    }
}
