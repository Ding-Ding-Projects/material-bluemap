import { BlockState } from "../../../BlockState.js";
import {
    type BlockStateAccess,
    type BlockStateExtension,
    fullId,
    withProperty,
} from "./BlockStateExtension.js";
import { Direction } from "./Direction.js";

// upstream uses a List; only containment/iteration is needed, so a set is equivalent
const AFFECTED_BLOCK_IDS: ReadonlySet<string> = new Set([
    "minecraft:chest",
    "minecraft:trapped_chest",
]);

export class DoubleChestExtension implements BlockStateExtension {
    extend(
        world: BlockStateAccess,
        x: number,
        y: number,
        z: number,
        state: BlockState,
    ): BlockState {
        const dir = Direction.fromString(state.getProperties().get("facing") ?? "north");

        const leftDir = dir.left();
        const left = world(x + leftDir.x, y + leftDir.y, z + leftDir.z);
        if (fullId(left) === fullId(state)) return withProperty(state, "type", "right");

        const rightDir = dir.right();
        const right = world(x + rightDir.x, y + rightDir.y, z + rightDir.z);
        if (fullId(right) === fullId(state)) return withProperty(state, "type", "left");

        return withProperty(state, "type", "single");
    }

    getAffectedBlockIds(): ReadonlySet<string> {
        return AFFECTED_BLOCK_IDS;
    }
}
