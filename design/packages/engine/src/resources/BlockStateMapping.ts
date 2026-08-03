import type { BlockState } from "../world/BlockState.js";

export class BlockStateMapping<T> {
    private readonly blockState: BlockState;
    private readonly mapping: T;

    constructor(blockState: BlockState, mapping: T) {
        this.blockState = blockState;
        this.mapping = mapping;
    }

    /**
     * Returns true if the all the properties on this BlockMapping-key are the same in the provided BlockState.<br>
     * Properties that are not defined in this Mapping are ignored on the provided BlockState.<br>
     */
    fitsTo(blockState: BlockState): boolean {
        if (!this.blockState.getId().equals(blockState.getId())) return false;
        for (const [key, value] of this.blockState.getProperties()) {
            if (value !== blockState.getProperties().get(key)) {
                return false;
            }
        }

        return true;
    }

    getBlockState(): BlockState {
        return this.blockState;
    }

    getMapping(): T {
        return this.mapping;
    }
}
