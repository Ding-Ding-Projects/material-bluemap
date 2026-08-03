import { Vector3i } from "@material-bluemap/shared";

/**
 * upstream: util/math/Axis.java — a Java enum (X / Y / Z); ported as a class with
 * three static instances.
 */
export class Axis {
    static readonly X = new Axis("X", Vector3i.UNIT_X);
    static readonly Y = new Axis("Y", Vector3i.UNIT_Y);
    static readonly Z = new Axis("Z", Vector3i.UNIT_Z);

    private readonly axisVector: Vector3i;
    private readonly enumName: string;

    private constructor(name: string, axisVector: Vector3i) {
        this.enumName = name;
        this.axisVector = axisVector;
    }

    toVector(): Vector3i {
        return this.axisVector;
    }

    /** Java Enum#name() */
    name(): string {
        return this.enumName;
    }

    toString(): string {
        return this.enumName;
    }

    static values(): readonly Axis[] {
        return [Axis.X, Axis.Y, Axis.Z];
    }

    /** Java Enum#valueOf */
    static valueOf(name: string): Axis {
        switch (name) {
            case "X":
                return Axis.X;
            case "Y":
                return Axis.Y;
            case "Z":
                return Axis.Z;
            default:
                throw new Error("No enum constant Axis." + name);
        }
    }

    static fromString(name: string): Axis {
        if (name == null) throw new Error("name must not be null");

        return Axis.valueOf(name.toUpperCase());
    }
}
