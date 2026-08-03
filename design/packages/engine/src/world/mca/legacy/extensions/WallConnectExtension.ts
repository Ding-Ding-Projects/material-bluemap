import { BlockState } from "../../../BlockState.js";
import { type BlockStateAccess, withProperty } from "./BlockStateExtension.js";
import { ConnectSameOrFullBlockExtension } from "./ConnectSameOrFullBlockExtension.js";
import { Direction } from "./Direction.js";

const AFFECTED_BLOCK_IDS: ReadonlySet<string> = new Set([
    "minecraft:cobblestone_wall",
    "minecraft:mossy_cobblestone_wall",
]);

export class WallConnectExtension extends ConnectSameOrFullBlockExtension {
    override extend(
        world: BlockStateAccess,
        x: number,
        y: number,
        z: number,
        state: BlockState,
    ): BlockState {
        state = super.extend(world, x, y, z, state);

        // Objects.equals on possibly-absent properties (undefined === undefined is true,
        // matching Objects.equals(null, null))
        if (
            state.getProperties().get("north") === state.getProperties().get("south") &&
            state.getProperties().get("east") === state.getProperties().get("west") &&
            state.getProperties().get("north") !== state.getProperties().get("east") &&
            !this.connectsTo(world, x + Direction.UP.x, y + Direction.UP.y, z + Direction.UP.z)
        ) {
            return withProperty(state, "up", "false");
        } else {
            return withProperty(state, "up", "true");
        }
    }

    override getAffectedBlockIds(): ReadonlySet<string> {
        return AFFECTED_BLOCK_IDS;
    }
}
