import { Color } from "@worldlens/shared";
import type { BlockState } from "../../../../world/BlockState.js";
import type { BlockAccess } from "../../../../world/block/BlockAccess.js";
import type { BlockColorCalculator } from "./BlockColorCalculator.js";

/** upstream: map/hires/block/color/FixedBlockColorCalculator.java */
export class FixedBlockColorCalculator implements BlockColorCalculator {
    private readonly color: Color;

    constructor(color: Color) {
        this.color = new Color().set(color).premultiplied();
    }

    getBlockColor(_block: BlockAccess, _blockState: BlockState, target: Color): Color {
        return target.set(this.color);
    }
}
