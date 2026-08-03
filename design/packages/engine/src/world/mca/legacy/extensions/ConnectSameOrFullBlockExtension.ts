import type { BlockState } from "../../../BlockState.js";
import { getLegacyBlockPropertiesMapper } from "../BlockPropertiesMapper.js";
import type { BlockStateAccess } from "./BlockStateExtension.js";
import { ConnectExtension } from "./ConnectExtension.js";

export abstract class ConnectSameOrFullBlockExtension extends ConnectExtension {
    override connectsTo(
        world: BlockStateAccess,
        x: number,
        y: number,
        z: number,
        block?: BlockState,
    ): boolean {
        if (block === undefined) return super.connectsTo(world, x, y, z);
        if (super.connectsTo(world, x, y, z, block)) return true;

        // legacy: world.getBlockPropertiesMapper().get(block).isCulling()
        return getLegacyBlockPropertiesMapper().get(block).isCulling();
    }
}
