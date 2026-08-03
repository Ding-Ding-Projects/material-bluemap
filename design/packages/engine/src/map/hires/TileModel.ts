import type { MatrixM3f, MatrixM4f } from "@material-bluemap/shared";

/**
 * upstream: map/hires/TileModel.java
 *
 * The mesh buffer every render-pass writes into: a flat list of triangles, addressed
 * by face-index, with per-face position / uv / ao / color / sunlight / blocklight /
 * material-index attributes.
 *
 * Port notes:
 * - Java's overloads by parameter *type* (`transform(int, int, MatrixM3f)` vs
 *   `transform(int, int, MatrixM4f)`) collapse into one union-typed signature, since
 *   the implementations dispatch on the runtime class anyway.
 * - `invertOrientation(int face)` and the interface-default
 *   `invertOrientation(int start, int count)` become arity overloads.
 * - Every `float` parameter is rounded to single precision by the implementation at
 *   the same point Java's call-site narrowing would have done it.
 */
export interface TileModel {
    /** upstream: `int size()` */
    size(): number;

    /**
     * upstream: `int add(int count)` — reserves `count` faces and returns the index of
     * the first one.
     */
    add(count: number): number;

    /** upstream: `TileModel setPositions(...)` */
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
    ): TileModel;

    /** upstream: `TileModel setUvs(...)` */
    setUvs(
        face: number,
        u1: number,
        v1: number,
        u2: number,
        v2: number,
        u3: number,
        v3: number,
    ): TileModel;

    /** upstream: `TileModel setAOs(int face, float ao1, float ao2, float ao3)` */
    setAOs(face: number, ao1: number, ao2: number, ao3: number): TileModel;

    /** upstream: `TileModel setColor(int face, float r, float g, float b)` */
    setColor(face: number, r: number, g: number, b: number): TileModel;

    /** upstream: `TileModel setSunlight(int face, int sl)` */
    setSunlight(face: number, sl: number): TileModel;

    /** upstream: `TileModel setBlocklight(int face, int bl)` */
    setBlocklight(face: number, bl: number): TileModel;

    /** upstream: `TileModel setMaterialIndex(int face, int m)` */
    setMaterialIndex(face: number, m: number): TileModel;

    /** upstream: `TileModel invertOrientation(int face)` */
    invertOrientation(face: number): TileModel;
    /** upstream: the interface-default `TileModel invertOrientation(int start, int count)` */
    invertOrientation(start: number, count: number): TileModel;

    /** upstream: `TileModel rotate(int start, int count, float angle, float axisX, float axisY, float axisZ)` */
    rotate(
        start: number,
        count: number,
        angle: number,
        axisX: number,
        axisY: number,
        axisZ: number,
    ): TileModel;

    /** upstream: `TileModel rotateXYZ(int start, int count, float pitch, float yaw, float roll)` */
    rotateXYZ(start: number, count: number, pitch: number, yaw: number, roll: number): TileModel;

    /** upstream: `TileModel rotateZYX(int start, int count, float pitch, float yaw, float roll)` */
    rotateZYX(start: number, count: number, pitch: number, yaw: number, roll: number): TileModel;

    /** upstream: `TileModel rotateYXZ(int start, int count, float pitch, float yaw, float roll)` */
    rotateYXZ(start: number, count: number, pitch: number, yaw: number, roll: number): TileModel;

    /** upstream: `TileModel rotateByQuaternion(int start, int count, double qx, double qy, double qz, double qw)` */
    rotateByQuaternion(
        start: number,
        count: number,
        qx: number,
        qy: number,
        qz: number,
        qw: number,
    ): TileModel;

    /** upstream: `TileModel scale(int start, int count, float sx, float sy, float sz)` */
    scale(start: number, count: number, sx: number, sy: number, sz: number): TileModel;

    /** upstream: `TileModel translate(int start, int count, float dx, float dy, float dz)` */
    translate(start: number, count: number, dx: number, dy: number, dz: number): TileModel;

    /** upstream: `TileModel transform(int start, int count, MatrixM3f t)` / `(..., MatrixM4f t)` */
    transform(start: number, count: number, t: MatrixM3f | MatrixM4f): TileModel;
    /** upstream: `TileModel transform(int start, int count, float m00 .. float m22)` */
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
    /** upstream: `TileModel transform(int start, int count, float m00 .. float m33)` */
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

    /** upstream: `TileModel reset(int size)` */
    reset(size: number): TileModel;

    /** upstream: `TileModel clear()` */
    clear(): TileModel;

    /** upstream: `void sort()` */
    sort(): void;
}
