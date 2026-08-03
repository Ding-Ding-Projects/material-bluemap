import type { MatrixM3f, MatrixM4f } from "@material-bluemap/shared";
import type { TileModel } from "./TileModel.js";

/**
 * upstream: map/hires/TileModelView.java
 *
 * A sliding window over a {@link TileModel}: the renderers append faces through it and
 * then transform "everything I just added" without having to track indices
 * themselves. `initialize()` re-anchors the window at the model's current end.
 *
 * Port note: Java's four `initialize` overloads differ by parameter type as well as
 * arity, so they are one implementation dispatching on `typeof`.
 */
export class TileModelView {
    private tileModel: TileModel;
    private start = 0;
    private size = 0;

    constructor(tileModel: TileModel) {
        // upstream: `public TileModelView(TileModel tileModel) { initialize(tileModel); }`
        this.tileModel = tileModel;
        this.initialize();
    }

    /** upstream: `TileModelView initialize()` — anchor at the current end of the model */
    initialize(): TileModelView;
    /** upstream: `TileModelView initialize(int start)` */
    initialize(start: number): TileModelView;
    /** upstream: `TileModelView initialize(TileModel hiresTile)` */
    initialize(hiresTile: TileModel): TileModelView;
    /** upstream: `TileModelView initialize(TileModel hiresTile, int start)` */
    initialize(hiresTile: TileModel, start: number): TileModelView;
    initialize(hiresTileOrStart?: TileModel | number, start?: number): TileModelView {
        if (hiresTileOrStart === undefined) {
            this.start = this.tileModel.size();
            this.size = 0;
            return this;
        }

        if (typeof hiresTileOrStart === "number") {
            this.start = hiresTileOrStart;
            this.size = this.tileModel.size() - hiresTileOrStart;
            return this;
        }

        this.tileModel = hiresTileOrStart;
        if (start === undefined) {
            this.start = hiresTileOrStart.size();
            this.size = 0;
        } else {
            this.start = start;
            this.size = hiresTileOrStart.size() - start;
        }
        return this;
    }

    /** upstream: `TileModelView reset()` */
    reset(): TileModelView {
        this.tileModel.reset(this.start);
        this.size = 0;

        return this;
    }

    /** upstream: `int add(int count)` */
    add(count: number): number {
        const s = this.tileModel.add(count);
        if (s !== this.start + this.size)
            throw new Error("Size of HiresTileModel had external changes since view-initialisation!");
        this.size += count;
        return s;
    }

    /** upstream: `TileModelView rotate(float angle, float axisX, float axisY, float axisZ)` */
    rotate(angle: number, axisX: number, axisY: number, axisZ: number): TileModelView {
        this.tileModel.rotate(this.start, this.size, angle, axisX, axisY, axisZ);
        return this;
    }

    /** upstream: `TileModelView rotateXYZ(float pitch, float yaw, float roll)` */
    rotateXYZ(pitch: number, yaw: number, roll: number): TileModelView {
        this.tileModel.rotateXYZ(this.start, this.size, pitch, yaw, roll);
        return this;
    }

    /** upstream: `TileModelView rotateZYX(float pitch, float yaw, float roll)` */
    rotateZYX(pitch: number, yaw: number, roll: number): TileModelView {
        this.tileModel.rotateZYX(this.start, this.size, pitch, yaw, roll);
        return this;
    }

    /** upstream: `TileModelView rotateYXZ(float pitch, float yaw, float roll)` */
    rotateYXZ(pitch: number, yaw: number, roll: number): TileModelView {
        this.tileModel.rotateYXZ(this.start, this.size, pitch, yaw, roll);
        return this;
    }

    /** upstream: `TileModelView scale(float sx, float sy, float sz)` */
    scale(sx: number, sy: number, sz: number): TileModelView {
        this.tileModel.scale(this.start, this.size, sx, sy, sz);
        return this;
    }

    /** upstream: `TileModelView translate(float dx, float dy, float dz)` */
    translate(dx: number, dy: number, dz: number): TileModelView {
        this.tileModel.translate(this.start, this.size, dx, dy, dz);
        return this;
    }

    /** upstream: the four `transform(...)` overloads */
    transform(t: MatrixM3f | MatrixM4f): TileModelView;
    transform(
        m00: number,
        m01: number,
        m02: number,
        m10: number,
        m11: number,
        m12: number,
        m20: number,
        m21: number,
        m22: number,
    ): TileModelView;
    transform(
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
    ): TileModelView;
    transform(...args: (number | MatrixM3f | MatrixM4f)[]): TileModelView {
        const first = args[0];

        if (typeof first !== "number") {
            this.tileModel.transform(this.start, this.size, first as MatrixM3f | MatrixM4f);
            return this;
        }

        const m = args as number[];
        if (m.length === 9) {
            this.tileModel.transform(
                this.start, this.size,
                m[0]!, m[1]!, m[2]!,
                m[3]!, m[4]!, m[5]!,
                m[6]!, m[7]!, m[8]!,
            );
        } else {
            this.tileModel.transform(
                this.start, this.size,
                m[0]!, m[1]!, m[2]!, m[3]!,
                m[4]!, m[5]!, m[6]!, m[7]!,
                m[8]!, m[9]!, m[10]!, m[11]!,
                m[12]!, m[13]!, m[14]!, m[15]!,
            );
        }
        return this;
    }

    /** upstream: `TileModelView invertOrientation()` */
    invertOrientation(): TileModelView {
        this.tileModel.invertOrientation(this.start, this.size);
        return this;
    }

    /** upstream: `TileModel getTileModel()` */
    getTileModel(): TileModel {
        return this.tileModel;
    }

    /** upstream: `int getStart()` */
    getStart(): number {
        return this.start;
    }

    /** upstream: `int getSize()` */
    getSize(): number {
        return this.size;
    }
}
