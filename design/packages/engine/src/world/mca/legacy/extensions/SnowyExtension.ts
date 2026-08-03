import { BlockState } from "../../../BlockState.js";
import {
    type BlockStateAccess,
    type BlockStateExtension,
    fullId,
    withProperty,
} from "./BlockStateExtension.js";

// upstream uses a List; only containment/iteration is needed, so a set is equivalent
const AFFECTED_BLOCK_IDS: ReadonlySet<string> = new Set(["minecraft:grass", "minecraft:mycelium"]);

export class SnowyExtension implements BlockStateExtension {
    extend(
        world: BlockStateAccess,
        x: number,
        y: number,
        z: number,
        state: BlockState,
    ): BlockState {
        const above = world(x, y + 1, z);

        if (fullId(above) === "minecraft:snow_layer" || fullId(above) === "minecraft:snow") {
            return withProperty(state, "snowy", "true");
        } else {
            return withProperty(state, "snowy", "false");
        }
    }

    getAffectedBlockIds(): ReadonlySet<string> {
        return AFFECTED_BLOCK_IDS;
    }
}
