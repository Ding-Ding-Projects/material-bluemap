import { BlockState } from "../../../BlockState.js";
import {
    type BlockStateAccess,
    type BlockStateExtension,
    withProperty,
} from "./BlockStateExtension.js";
import { Direction } from "./Direction.js";

// upstream uses a List; only containment/iteration is needed, so a set is equivalent
const AFFECTED_BLOCK_IDS: ReadonlySet<string> = new Set([
    "minecraft:wooden_door",
    "minecraft:iron_door",
    "minecraft:spruce_door",
    "minecraft:birch_door",
    "minecraft:jungle_door",
    "minecraft:acacia_door",
    "minecraft:dark_oak_door",
]);

export class DoorExtension implements BlockStateExtension {
    extend(
        world: BlockStateAccess,
        x: number,
        y: number,
        z: number,
        state: BlockState,
    ): BlockState {
        let otherDoor: BlockState;

        const isLower = state.getProperties().get("half") === "lower";

        if (isLower) {
            otherDoor = world(x + Direction.UP.x, y + Direction.UP.y, z + Direction.UP.z);
        } else {
            otherDoor = world(x + Direction.DOWN.x, y + Direction.DOWN.y, z + Direction.DOWN.z);
        }

        //copy all properties from the other door
        for (const [key, value] of otherDoor.getProperties()) {
            if (
                !state.getProperties().has(key) ||
                (isLower && key === "hinge") ||
                (isLower && key === "powered") ||
                (!isLower && key === "open") ||
                (!isLower && key === "facing")
            ) {
                state = withProperty(state, key, value);
            }
        }

        return state;
    }

    getAffectedBlockIds(): ReadonlySet<string> {
        return AFFECTED_BLOCK_IDS;
    }
}
