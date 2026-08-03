/**
 * Port of the legacy util/Direction.java (v0.10.3-mc1.12) as used by the legacy
 * block-state extensions. Kept local to the legacy extensions so this port does not
 * claim the modern util/Direction.ts (which additionally carries localUp); should the
 * modern util port land, the extensions can be switched over at integration time.
 *
 * Instead of flow-math Vector3i offsets (legacy pos.add(direction.toVector())) the
 * direction-vector components are exposed as plain x/y/z fields, matching the
 * extensions' (x, y, z) => BlockState neighbor-access.
 */
export type Axis = "X" | "Y" | "Z";

export class Direction {
    static readonly UP = new Direction("UP", 0, 1, 0, "Y");
    static readonly DOWN = new Direction("DOWN", 0, -1, 0, "Y");
    static readonly NORTH = new Direction("NORTH", 0, 0, -1, "Z");
    static readonly SOUTH = new Direction("SOUTH", 0, 0, 1, "Z");
    static readonly WEST = new Direction("WEST", -1, 0, 0, "X");
    static readonly EAST = new Direction("EAST", 1, 0, 0, "X");

    // enum values() order = declaration order
    private static readonly VALUES: readonly Direction[] = [
        Direction.UP,
        Direction.DOWN,
        Direction.NORTH,
        Direction.SOUTH,
        Direction.WEST,
        Direction.EAST,
    ];

    private oppositeDirection!: Direction;
    private leftDirection!: Direction;
    private rightDirection!: Direction;

    static {
        Direction.UP.oppositeDirection = Direction.DOWN;
        Direction.DOWN.oppositeDirection = Direction.UP;
        Direction.NORTH.oppositeDirection = Direction.SOUTH;
        Direction.SOUTH.oppositeDirection = Direction.NORTH;
        Direction.WEST.oppositeDirection = Direction.EAST;
        Direction.EAST.oppositeDirection = Direction.WEST;

        Direction.UP.leftDirection = Direction.UP;
        Direction.DOWN.leftDirection = Direction.DOWN;
        Direction.NORTH.leftDirection = Direction.WEST;
        Direction.SOUTH.leftDirection = Direction.EAST;
        Direction.WEST.leftDirection = Direction.SOUTH;
        Direction.EAST.leftDirection = Direction.NORTH;

        Direction.UP.rightDirection = Direction.UP;
        Direction.DOWN.rightDirection = Direction.DOWN;
        Direction.NORTH.rightDirection = Direction.EAST;
        Direction.SOUTH.rightDirection = Direction.WEST;
        Direction.WEST.rightDirection = Direction.NORTH;
        Direction.EAST.rightDirection = Direction.SOUTH;
    }

    readonly x: number;
    readonly y: number;
    readonly z: number;

    private readonly enumName: string;
    private readonly axis: Axis;

    private constructor(name: string, x: number, y: number, z: number, axis: Axis) {
        this.enumName = name;
        this.x = x;
        this.y = y;
        this.z = z;
        this.axis = axis;
    }

    opposite(): Direction {
        return this.oppositeDirection;
    }

    left(): Direction {
        return this.leftDirection;
    }

    right(): Direction {
        return this.rightDirection;
    }

    getAxis(): Axis {
        return this.axis;
    }

    /** Java Enum#name() */
    name(): string {
        return this.enumName;
    }

    static values(): readonly Direction[] {
        return Direction.VALUES;
    }

    static fromString(name: string | undefined | null): Direction {
        // Preconditions.checkNotNull(name) — NullPointerException
        if (name == null) throw new Error("NullPointerException: name");

        // Enum.valueOf — IllegalArgumentException for unknown constants
        const direction = Direction.VALUES.find((d) => d.enumName === name.toUpperCase());
        if (direction === undefined)
            throw new Error(
                "IllegalArgumentException: No enum constant Direction." + name.toUpperCase(),
            );
        return direction;
    }
}
