import { Color } from "@worldlens/shared";
import type { ColorMap } from "../../../../resources/pack/resourcepack/texture/ColorMap.js";
import type { BlockState } from "../../../../world/BlockState.js";
import type { BlockAccess } from "../../../../world/block/BlockAccess.js";
import type { BlockColorCalculator } from "./BlockColorCalculator.js";

/** upstream: map/hires/block/color/ColorMapBlockColorCalculator.java */
export class ColorMapBlockColorCalculator implements BlockColorCalculator {
    private readonly colorMap: ColorMap;
    private readonly defaultColor: Color;

    constructor(colorMap: ColorMap, defaultColor: Color) {
        this.colorMap = colorMap;
        this.defaultColor = new Color().set(defaultColor).premultiplied();
    }

    getBlockColor(block: BlockAccess, _blockState: BlockState, target: Color): Color {
        return this.colorMap.getColor(block.getBiome(), this.defaultColor, target);
    }
}
