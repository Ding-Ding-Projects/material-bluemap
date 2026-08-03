import type { Color } from "@material-bluemap/shared";
import type { BlockState } from "../../../../world/BlockState.js";
import type { Biome } from "../../../../world/biome/Biome.js";
import type { BlockAccess } from "../../../../world/block/BlockAccess.js";
import type { BlockColorCalculator } from "./BlockColorCalculator.js";

/** upstream: map/hires/block/color/BiomeBlockColorCalculator.java */
export class BiomeBlockColorCalculator implements BlockColorCalculator {
    private readonly biomeColorFunction: (biome: Biome) => Color;

    constructor(biomeColorFunction: (biome: Biome) => Color) {
        this.biomeColorFunction = biomeColorFunction;
    }

    getBlockColor(block: BlockAccess, _blockState: BlockState, target: Color): Color {
        return target.set(this.biomeColorFunction(block.getBiome()));
    }
}
