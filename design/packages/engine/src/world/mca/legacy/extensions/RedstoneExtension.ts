import { BlockState } from "../../../BlockState.js";
import {
    type BlockStateAccess,
    type BlockStateExtension,
    fullId,
    withProperty,
} from "./BlockStateExtension.js";
import { Direction } from "./Direction.js";

// upstream uses a List; only containment/iteration is needed, so a set is equivalent
const AFFECTED_BLOCK_IDS: ReadonlySet<string> = new Set(["minecraft:redstone_wire"]);

// (upstream lists "minecraft:stone_button" twice — a Set holds it once either way)
const CONNECTIBLE: ReadonlySet<string> = new Set([
    "minecraft:redstone_wire",
    "minecraft:redstone_wall_torch",
    "minecraft:redstone_torch",
    "minecraft:stone_button",
    "minecraft:oak_button",
    "minecraft:lever",
    "minecraft:stone_pressure_plate",
    "minecraft:oak_pressure_plate",
    "minecraft:light_weighted_pressure_plate",
    "minecraft:heavy_weighted_pressure_plate",
]);

export class RedstoneExtension implements BlockStateExtension {
    extend(
        world: BlockStateAccess,
        x: number,
        y: number,
        z: number,
        state: BlockState,
    ): BlockState {
        const up = world(x, y + 1, z);
        const upBlocking = !up.equals(BlockState.AIR);

        state = withProperty(
            state,
            "north",
            this.connection(world, x, y, z, upBlocking, Direction.NORTH),
        );
        state = withProperty(
            state,
            "east",
            this.connection(world, x, y, z, upBlocking, Direction.EAST),
        );
        state = withProperty(
            state,
            "south",
            this.connection(world, x, y, z, upBlocking, Direction.SOUTH),
        );
        state = withProperty(
            state,
            "west",
            this.connection(world, x, y, z, upBlocking, Direction.WEST),
        );

        return state;
    }

    private connection(
        world: BlockStateAccess,
        x: number,
        y: number,
        z: number,
        upBlocking: boolean,
        direction: Direction,
    ): string {
        const next = world(x + direction.x, y + direction.y, z + direction.z);
        if (CONNECTIBLE.has(fullId(next))) return "side";

        if (next.equals(BlockState.AIR)) {
            const nextdown = world(x + direction.x, y + direction.y - 1, z + direction.z);
            if (fullId(nextdown) === "minecraft:redstone_wire") return "side";
        }

        if (!upBlocking) {
            const nextup = world(x + direction.x, y + direction.y + 1, z + direction.z);
            if (fullId(nextup) === "minecraft:redstone_wire") return "up";
        }

        return "none";
    }

    getAffectedBlockIds(): ReadonlySet<string> {
        return AFFECTED_BLOCK_IDS;
    }
}
