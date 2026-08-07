import { MatrixM4f, Vector3f, VectorM3f } from "@worldlens/shared";
import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import { asObject, nextBoolean, nextDouble, type JsonValue } from "../../../adapter/JsonMapper.js";
import { postDeserialize } from "../../../adapter/PostDeserializeAdapterFactory.js";
import type { PostDeserialize } from "../../../adapter/PostDeserialize.js";
import { ResourcesGson } from "../../../adapter/ResourcesGson.js";
import { Axis } from "../../../../util/math/Axis.js";

/** upstream: model/Rotation.java */
export class Rotation implements PostDeserialize {
    private static readonly DEFAULT_ORIGIN: Vector3f = new Vector3f(8, 8, 8);

    static readonly ZERO: Rotation = new Rotation();
    static {
        Rotation.ZERO.init();
    }

    private origin: Vector3f = Rotation.DEFAULT_ORIGIN;
    private x: number = 0;
    private y: number = 0;
    private z: number = 0;
    private axis: Axis = Axis.Y;
    private angle: number = 0;
    private rescale: boolean = false;

    /**
     * upstream: {@code private transient MatrixM4f matrix} — null until {@link init}
     * runs (which every construction-path in this port does, either through a public
     * constructor or through the post-deserialize hook).
     */
    private matrix: MatrixM4f | null = null;

    /** upstream: the private no-args constructor gson instantiates with */
    constructor();
    constructor(origin: Vector3f, axis: Axis, angle: number, rescale: boolean);
    constructor(origin: Vector3f, x: number, y: number, z: number, rescale: boolean);
    constructor(
        origin?: Vector3f,
        axisOrX?: Axis | number,
        angleOrY?: number,
        rescaleOrZ?: boolean | number,
        rescale?: boolean,
    ) {
        if (origin === undefined) return;

        this.origin = origin;
        if (axisOrX instanceof Axis) {
            this.axis = axisOrX;
            this.angle = angleOrY as number;
            this.rescale = rescaleOrZ as boolean;
        } else {
            this.x = axisOrX as number;
            this.y = angleOrY as number;
            this.z = rescaleOrZ as number;
            this.rescale = rescale as boolean;
        }
        this.init();
    }

    /** upstream: the {@code @PostDeserialize}-annotated {@code init()} */
    postDeserialize(): void {
        this.init();
    }

    private init(): void {
        // angle/axis notation takes precedence
        if (this.angle !== 0) {
            this.x = this.y = this.z = 0;
            switch (this.axis) {
                case Axis.X:
                    this.x = this.angle;
                    break;
                case Axis.Y:
                    this.y = this.angle;
                    break;
                case Axis.Z:
                    this.z = this.angle;
                    break;
            }
        }

        const matrix = new MatrixM4f();
        this.matrix = matrix;
        if (this.x !== 0 || this.y !== 0 || this.z !== 0) {
            matrix.translate(-this.origin.getX(), -this.origin.getY(), -this.origin.getZ());
            matrix.rotateYXZ(this.x, this.y, this.z);

            if (this.rescale) {
                const axisVector = new VectorM3f(0, 0, 0);
                const sX = 1 / axisVector.set(1, 0, 0).rotateAndScale(matrix).absolute().max();
                const sY = 1 / axisVector.set(0, 1, 0).rotateAndScale(matrix).absolute().max();
                const sZ = 1 / axisVector.set(0, 0, 1).rotateAndScale(matrix).absolute().max();

                matrix.identity();
                matrix.translate(-this.origin.getX(), -this.origin.getY(), -this.origin.getZ());
                matrix.scale(sX, sY, sZ);
                matrix.rotateYXZ(this.x, this.y, this.z);
            }

            matrix.translate(this.origin.getX(), this.origin.getY(), this.origin.getZ());
        }
    }

    getOrigin(): Vector3f {
        return this.origin;
    }

    getX(): number {
        return this.x;
    }

    getY(): number {
        return this.y;
    }

    getZ(): number {
        return this.z;
    }

    getAxis(): Axis {
        return this.axis;
    }

    getAngle(): number {
        return this.angle;
    }

    isRescale(): boolean {
        return this.rescale;
    }

    getMatrix(): MatrixM4f | null {
        return this.matrix;
    }

    /**
     * Port addition: upstream leaves Rotation to gson's reflective adapter (wrapped by
     * the PostDeserializeAdapterFactory); this reads the same members explicitly and
     * applies the same post-deserialize hook.
     */
    static readonly Adapter: JsonAdapter<Rotation> = {
        read(json: JsonValue): Rotation {
            const object = asObject(json);
            const rotation = new Rotation();

            const origin = object["origin"];
            if (origin != null) rotation.origin = ResourcesGson.vector3f.read(origin);

            const x = object["x"];
            if (x != null) rotation.x = nextDouble(x);

            const y = object["y"];
            if (y != null) rotation.y = nextDouble(y);

            const z = object["z"];
            if (z != null) rotation.z = nextDouble(z);

            const axis = object["axis"];
            if (axis != null) rotation.axis = ResourcesGson.axis.read(axis);

            const angle = object["angle"];
            if (angle != null) rotation.angle = nextDouble(angle);

            const rescale = object["rescale"];
            if (rescale != null) rotation.rescale = nextBoolean(rescale);

            return postDeserialize(rotation);
        },
    };
}
