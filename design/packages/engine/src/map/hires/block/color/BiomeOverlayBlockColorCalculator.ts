import type { Color } from "@material-bluemap/shared";
import type { BlockState } from "../../../../world/BlockState.js";
import type { Biome } from "../../../../world/biome/Biome.js";
import type { BlockAccess } from "../../../../world/block/BlockAccess.js";
import type { BlockColorCalculator } from "./BlockColorCalculator.js";

/** upstream: map/hires/block/color/BiomeOverlayBlockColorCalculator.java */
export class BiomeOverlayBlockColorCalculator implements BlockColorCalculator {
    private readonly baseDelegate: BlockColorCalculator;
    private readonly biomeColorFunction: (biome: Biome) => Color;

    constructor(baseDelegate: BlockColorCalculator, biomeColorFunction: (biome: Biome) => Color) {
        this.baseDelegate = baseDelegate;
        this.biomeColorFunction = biomeColorFunction;
    }

    getBlockColor(block: BlockAccess, blockState: BlockState, target: Color): Color {
        this.baseDelegate.getBlockColor(block, blockState, target);
        return target.overlay(this.biomeColorFunction(block.getBiome()));
    }
}
