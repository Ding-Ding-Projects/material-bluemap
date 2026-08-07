import type { Color } from "@worldlens/shared";
import type { BlockState } from "../../../../world/BlockState.js";
import type { BlockAccess } from "../../../../world/block/BlockAccess.js";

/** upstream: map/hires/block/color/BlockColorCalculator.java */
export interface BlockColorCalculator {
    getBlockColor(block: BlockAccess, blockState: BlockState, target: Color): Color;
}

export const BlockColorCalculator = {
    /**
     * upstream: the interface-default {@code Color getBlockColor(BlockAccess, Color)} —
     * a TS interface carries no implementation, so the default lives here as a helper
     * taking the calculator it would be invoked on.
     */
    getBlockColor(calculator: BlockColorCalculator, block: BlockAccess, target: Color): Color {
        return calculator.getBlockColor(block, block.getBlockState(), target);
    },
};
