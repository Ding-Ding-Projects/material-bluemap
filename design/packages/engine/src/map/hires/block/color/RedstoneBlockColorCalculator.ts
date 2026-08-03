import type { Color } from "@material-bluemap/shared";
import type { BlockState } from "../../../../world/BlockState.js";
import type { BlockAccess } from "../../../../world/block/BlockAccess.js";
import type { BlockColorCalculator } from "./BlockColorCalculator.js";

/** upstream: map/hires/block/color/RedstoneBlockColorCalculator.java */
export class RedstoneBlockColorCalculator implements BlockColorCalculator {
    getBlockColor(_block: BlockAccess, blockState: BlockState, target: Color): Color {
        const power = blockState.getRedstonePower();
        return target.set((power + 5) / 20, 0, 0, 1, true);
    }
}
