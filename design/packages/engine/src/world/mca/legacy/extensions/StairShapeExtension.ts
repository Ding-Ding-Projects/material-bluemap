import { BlockState } from "../../../BlockState.js";
import {
    type BlockStateAccess,
    type BlockStateExtension,
    fullId,
    withProperty,
} from "./BlockStateExtension.js";
import { Direction } from "./Direction.js";

const AFFECTED_BLOCK_IDS: ReadonlySet<string> = new Set([
    "minecraft:oak_stairs",
    "minecraft:cobblestone_stairs",
    "minecraft:brick_stairs",
    "minecraft:stone_brick_stairs",
    "minecraft:nether_brick_stairs",
    "minecraft:sandstone_stairs",
    "minecraft:spruce_stairs",
    "minecraft:birch_stairs",
    "minecraft:jungle_stairs",
    "minecraft:quartz_stairs",
    "minecraft:acacia_stairs",
    "minecraft:dark_oak_stairs",
    "minecraft:red_sandstone_stairs",
    "minecraft:purpur_stairs",
]);

/**
 * Java `a.equals(b)` where `a` may be null: throws (NullPointerException, caught by the
 * extension's catch-all) if the left-hand value is absent, otherwise compares by value.
 */
function npeEquals(a: string | undefined, b: string | undefined): boolean {
    if (a === undefined) throw new Error("NullPointerException");
    return a === b;
}

export class StairShapeExtension implements BlockStateExtension {
    extend(
        world: BlockStateAccess,
        x: number,
        y: number,
        z: number,
        state: BlockState,
    ): BlockState {
        try {
            const facing = Direction.fromString(state.getProperties().get("facing"));
            const back = world(x + facing.x, y + facing.y, z + facing.z);

            if (
                this.isStairs(back) &&
                npeEquals(state.getProperties().get("half"), back.getProperties().get("half"))
            ) {
                const backFacing = Direction.fromString(back.getProperties().get("facing"));

                if (facing.getAxis() !== backFacing.getAxis()) {
                    const backOpposite = backFacing.opposite();
                    const next = world(x + backOpposite.x, y + backOpposite.y, z + backOpposite.z);

                    if (!this.isStairs(next) || !this.isEqualStairs(state, next)) {
                        if (backFacing === facing.left()) {
                            return withProperty(state, "shape", "outer_left");
                        }

                        return withProperty(state, "shape", "outer_right");
                    }
                }
            }

            const facingOpposite = facing.opposite();
            const front = world(x + facingOpposite.x, y + facingOpposite.y, z + facingOpposite.z);

            if (
                this.isStairs(front) &&
                npeEquals(state.getProperties().get("half"), front.getProperties().get("half"))
            ) {
                const frontFacing = Direction.fromString(front.getProperties().get("facing"));

                if (facing.getAxis() !== frontFacing.getAxis()) {
                    const next = world(x + frontFacing.x, y + frontFacing.y, z + frontFacing.z);

                    if (!this.isStairs(next) || !this.isEqualStairs(state, next)) {
                        if (frontFacing === facing.left()) {
                            return withProperty(state, "shape", "inner_left");
                        }

                        return withProperty(state, "shape", "inner_right");
                    }
                }
            }

            return withProperty(state, "shape", "straight");
        } catch {
            // upstream: catch (IllegalArgumentException | NullPointerException ex)
            return withProperty(state, "shape", "straight");
        }
    }

    private isStairs(state: BlockState): boolean {
        return AFFECTED_BLOCK_IDS.has(fullId(state));
    }

    private isEqualStairs(stair1: BlockState, stair2: BlockState): boolean {
        return (
            npeEquals(stair1.getProperties().get("facing"), stair2.getProperties().get("facing")) &&
            npeEquals(stair1.getProperties().get("half"), stair2.getProperties().get("half"))
        );
    }

    getAffectedBlockIds(): ReadonlySet<string> {
        return AFFECTED_BLOCK_IDS;
    }
}
