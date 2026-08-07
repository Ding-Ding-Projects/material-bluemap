import type { MatrixM3f, MatrixM4f } from "@worldlens/shared";
import type { TileModel } from "./TileModel.js";

/**
 * upstream: map/hires/VoidTileModel.java
 *
 * An empty tile-model discarding any actions. Used for the "render but do not save"
 * path, where a render-pass still has to run (it is what emits the lowres
 * heightmap/light data) but the geometry it produces is thrown away.
 */
export class VoidTileModel implements TileModel {
    /** upstream: `public static final TileModel INSTANCE` */
    static readonly INSTANCE: TileModel = new VoidTileModel();

    size(): number {
        return 0;
    }

    add(_count: number): number {
        return 0;
    }

    setPositions(
        _face: number,
        _x1: number,
        _y1: number,
        _z1: number,
        _x2: number,
        _y2: number,
        _z2: number,
        _x3: number,
        _y3: number,
        _z3: number,
    ): TileModel {
        return this;
    }

    setUvs(
        _face: number,
        _u1: number,
        _v1: number,
        _u2: number,
        _v2: number,
        _u3: number,
        _v3: number,
    ): TileModel {
        return this;
    }

    setAOs(_face: number, _ao1: number, _ao2: number, _ao3: number): TileModel {
        return this;
    }

    setColor(_face: number, _r: number, _g: number, _b: number): TileModel {
        return this;
    }

    setSunlight(_face: number, _sl: number): TileModel {
        return this;
    }

    setBlocklight(_face: number, _bl: number): TileModel {
        return this;
    }

    setMaterialIndex(_face: number, _m: number): TileModel {
        return this;
    }

    invertOrientation(face: number): TileModel;
    invertOrientation(start: number, count: number): TileModel;
    invertOrientation(_faceOrStart: number, _count?: number): TileModel {
        return this;
    }

    rotate(
        _start: number,
        _count: number,
        _angle: number,
        _axisX: number,
        _axisY: number,
        _axisZ: number,
    ): TileModel {
        return this;
    }

    rotateXYZ(
        _start: number,
        _count: number,
        _pitch: number,
        _yaw: number,
        _roll: number,
    ): TileModel {
        return this;
    }

    rotateZYX(
        _start: number,
        _count: number,
        _pitch: number,
        _yaw: number,
        _roll: number,
    ): TileModel {
        return this;
    }

    rotateYXZ(
        _start: number,
        _count: number,
        _pitch: number,
        _yaw: number,
        _roll: number,
    ): TileModel {
        return this;
    }

    rotateByQuaternion(
        _start: number,
        _count: number,
        _qx: number,
        _qy: number,
        _qz: number,
        _qw: number,
    ): TileModel {
        return this;
    }

    scale(_start: number, _count: number, _sx: number, _sy: number, _sz: number): TileModel {
        return this;
    }

    translate(_start: number, _count: number, _dx: number, _dy: number, _dz: number): TileModel {
        return this;
    }

    transform(start: number, count: number, t: MatrixM3f | MatrixM4f): TileModel;
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
    ): TileModel;
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
    ): TileModel;
    transform(
        _start: number,
        _count: number,
        ..._args: (number | MatrixM3f | MatrixM4f)[]
    ): TileModel {
        return this;
    }

    reset(_size: number): TileModel {
        return this;
    }

    clear(): TileModel {
        return this;
    }

    sort(): void {
        /* upstream: `public void sort() { }` */
    }
}
