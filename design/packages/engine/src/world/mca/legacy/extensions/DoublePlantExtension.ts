import { BlockState } from "../../../BlockState.js";
import {
    type BlockStateAccess,
    type BlockStateExtension,
    withProperty,
} from "./BlockStateExtension.js";
import { Direction } from "./Direction.js";

// upstream uses a List; only containment/iteration is needed, so a set is equivalent
const AFFECTED_BLOCK_IDS: ReadonlySet<string> = new Set(["minecraft:double_plant"]);

export class DoublePlantExtension implements BlockStateExtension {
    extend(
        world: BlockStateAccess,
        x: number,
        y: number,
        z: number,
        state: BlockState,
    ): BlockState {
        if (state.getProperties().get("half") === "upper") {
            const otherPlant = world(
                x + Direction.DOWN.x,
                y + Direction.DOWN.y,
                z + Direction.DOWN.z,
            );

            return withProperty(otherPlant, "half", "upper");
        }

        return state;
    }

    getAffectedBlockIds(): ReadonlySet<string> {
        return AFFECTED_BLOCK_IDS;
    }
}
