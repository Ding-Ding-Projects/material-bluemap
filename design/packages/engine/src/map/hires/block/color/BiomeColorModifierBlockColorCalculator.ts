import type { Color } from "@material-bluemap/shared";
import type { BlockState } from "../../../../world/BlockState.js";
import type { Biome } from "../../../../world/biome/Biome.js";
import type { ColorModifier } from "../../../../world/biome/ColorModifier.js";
import type { BlockAccess } from "../../../../world/block/BlockAccess.js";
import type { BlockColorCalculator } from "./BlockColorCalculator.js";

/** upstream: map/hires/block/color/BiomeColorModifierBlockColorCalculator.java */
export class BiomeColorModifierBlockColorCalculator implements BlockColorCalculator {
    private readonly baseDelegate: BlockColorCalculator;
    private readonly biomeColorModifierFunction: (biome: Biome) => ColorModifier;

    constructor(
        baseDelegate: BlockColorCalculator,
        biomeColorModifierFunction: (biome: Biome) => ColorModifier,
    ) {
        this.baseDelegate = baseDelegate;
        this.biomeColorModifierFunction = biomeColorModifierFunction;
    }

    getBlockColor(block: BlockAccess, blockState: BlockState, target: Color): Color {
        this.baseDelegate.getBlockColor(block, blockState, target);
        this.biomeColorModifierFunction(block.getBiome()).apply(block, target);
        return target;
    }
}
