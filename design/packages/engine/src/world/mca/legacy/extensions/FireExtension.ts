import { BlockState } from "../../../BlockState.js";
import { getLegacyBlockPropertiesMapper } from "../BlockPropertiesMapper.js";
import {
    type BlockStateAccess,
    type BlockStateExtension,
    withProperty,
} from "./BlockStateExtension.js";
import { Direction } from "./Direction.js";

// upstream uses a List; only containment/iteration is needed, so a set is equivalent
const AFFECTED_BLOCK_IDS: ReadonlySet<string> = new Set(["minecraft:fire"]);

export class FireExtension implements BlockStateExtension {
    extend(
        world: BlockStateAccess,
        x: number,
        y: number,
        z: number,
        state: BlockState,
    ): BlockState {
        const below = world(x, y - 1, z);

        const isOnGround = getLegacyBlockPropertiesMapper().get(below).isCulling();
        for (const dir of Direction.values()) {
            if (dir !== Direction.DOWN) {
                if (!isOnGround) {
                    const neighbor = world(x + dir.x, y + dir.y, z + dir.z);

                    state = withProperty(
                        state,
                        dir.name().toLowerCase(),
                        String(!getLegacyBlockPropertiesMapper().get(neighbor).isCulling()),
                    );
                } else {
                    state = withProperty(state, dir.name().toLowerCase(), "false");
                }
            }
        }

        return state;
    }

    getAffectedBlockIds(): ReadonlySet<string> {
        return AFFECTED_BLOCK_IDS;
    }
}
