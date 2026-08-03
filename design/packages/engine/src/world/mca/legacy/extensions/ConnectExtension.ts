import { BlockState } from "../../../BlockState.js";
import {
    type BlockStateAccess,
    type BlockStateExtension,
    fullId,
    withProperty,
} from "./BlockStateExtension.js";
import { Direction } from "./Direction.js";

export abstract class ConnectExtension implements BlockStateExtension {
    extend(
        world: BlockStateAccess,
        x: number,
        y: number,
        z: number,
        state: BlockState,
    ): BlockState {
        state = withProperty(
            state,
            "north",
            String(
                this.connectsTo(
                    world,
                    x + Direction.NORTH.x,
                    y + Direction.NORTH.y,
                    z + Direction.NORTH.z,
                ),
            ),
        );
        state = withProperty(
            state,
            "east",
            String(
                this.connectsTo(
                    world,
                    x + Direction.EAST.x,
                    y + Direction.EAST.y,
                    z + Direction.EAST.z,
                ),
            ),
        );
        state = withProperty(
            state,
            "south",
            String(
                this.connectsTo(
                    world,
                    x + Direction.SOUTH.x,
                    y + Direction.SOUTH.y,
                    z + Direction.SOUTH.z,
                ),
            ),
        );
        state = withProperty(
            state,
            "west",
            String(
                this.connectsTo(
                    world,
                    x + Direction.WEST.x,
                    y + Direction.WEST.y,
                    z + Direction.WEST.z,
                ),
            ),
        );
        return state;
    }

    // upstream overloads connectsTo(world, pos) / connectsTo(world, pos, block);
    // merged here — the block-less form resolves the block-state and re-dispatches
    // virtually, so overriding subclasses are still consulted
    connectsTo(
        world: BlockStateAccess,
        x: number,
        y: number,
        z: number,
        block?: BlockState,
    ): boolean {
        if (block === undefined) return this.connectsTo(world, x, y, z, world(x, y, z));

        return this.getAffectedBlockIds().has(fullId(block));
    }

    abstract getAffectedBlockIds(): ReadonlySet<string>;
}
