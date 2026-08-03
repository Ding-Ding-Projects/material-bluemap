import { Vector3i } from "@material-bluemap/shared";
import { Axis } from "./math/Axis.js";

/**
 * upstream: util/Direction.java — a Java enum (UP / DOWN / NORTH / SOUTH / WEST /
 * EAST); ported as a class with static instances, the mutual opposite/left/right/
 * localUp references wired in a static block like upstream.
 */
export class Direction {
    static readonly UP = new Direction("UP", 0, 1, 0, Axis.Y);
    static readonly DOWN = new Direction("DOWN", 0, -1, 0, Axis.Y);
    static readonly NORTH = new Direction("NORTH", 0, 0, -1, Axis.Z);
    static readonly SOUTH = new Direction("SOUTH", 0, 0, 1, Axis.Z);
    static readonly WEST = new Direction("WEST", -1, 0, 0, Axis.X);
    static readonly EAST = new Direction("EAST", 1, 0, 0, Axis.X);

    // enum values() order = declaration order
    private static readonly VALUES: readonly Direction[] = [
        Direction.UP,
        Direction.DOWN,
        Direction.NORTH,
        Direction.SOUTH,
        Direction.WEST,
        Direction.EAST,
    ];

    static {
        Direction.UP.opposite = Direction.DOWN;
        Direction.DOWN.opposite = Direction.UP;
        Direction.NORTH.opposite = Direction.SOUTH;
        Direction.SOUTH.opposite = Direction.NORTH;
        Direction.WEST.opposite = Direction.EAST;
        Direction.EAST.opposite = Direction.WEST;

        Direction.UP.left = Direction.UP;
        Direction.DOWN.left = Direction.DOWN;
        Direction.NORTH.left = Direction.WEST;
        Direction.SOUTH.left = Direction.EAST;
        Direction.WEST.left = Direction.SOUTH;
        Direction.EAST.left = Direction.NORTH;

        Direction.UP.right = Direction.UP;
        Direction.DOWN.right = Direction.DOWN;
        Direction.NORTH.right = Direction.EAST;
        Direction.SOUTH.right = Direction.WEST;
        Direction.WEST.right = Direction.NORTH;
        Direction.EAST.right = Direction.SOUTH;

        Direction.UP.localUp = Direction.NORTH;
        Direction.DOWN.localUp = Direction.SOUTH;
        Direction.NORTH.localUp = Direction.UP;
        Direction.SOUTH.localUp = Direction.UP;
        Direction.WEST.localUp = Direction.UP;
        Direction.EAST.localUp = Direction.UP;
    }

    private readonly dir: Vector3i;
    private readonly axis: Axis;
    private opposite!: Direction;
    private left!: Direction;
    private right!: Direction;
    private localUp!: Direction;
    private readonly enumName: string;

    private constructor(name: string, x: number, y: number, z: number, axis: Axis) {
        this.enumName = name;
        this.dir = new Vector3i(x, y, z);
        this.axis = axis;
    }

    getAxis(): Axis {
        return this.axis;
    }

    getOpposite(): Direction {
        return this.opposite;
    }

    getLeft(): Direction {
        return this.left;
    }

    getRight(): Direction {
        return this.right;
    }

    getLocalUp(): Direction {
        return this.localUp;
    }

    toVector(): Vector3i {
        return this.dir;
    }

    /** Java Enum#name() */
    name(): string {
        return this.enumName;
    }

    toString(): string {
        return this.enumName;
    }

    static values(): readonly Direction[] {
        return Direction.VALUES;
    }

    /** Java Enum#valueOf */
    static valueOf(name: string): Direction {
        for (const direction of Direction.VALUES) {
            if (direction.enumName === name) return direction;
        }
        throw new Error("No enum constant Direction." + name);
    }

    static fromString(name: string): Direction {
        if (name == null) throw new Error("name must not be null");

        return Direction.valueOf(name.toUpperCase());
    }
}
