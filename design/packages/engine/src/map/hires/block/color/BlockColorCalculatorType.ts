import { Color, Key, Registry, type Keyed } from "@material-bluemap/shared";
import type { ResourcePack } from "../../../../resources/pack/resourcepack/ResourcePack.js";
import type { Biome } from "../../../../world/biome/Biome.js";
import type { ColorModifier } from "../../../../world/biome/ColorModifier.js";
import type { BlockColorCalculator } from "./BlockColorCalculator.js";
import { BlockColorCalculatorFactory } from "./BlockColorCalculatorFactory.js";
import { RedstoneBlockColorCalculator } from "./RedstoneBlockColorCalculator.js";

/** upstream: map/hires/block/color/BlockColorCalculatorType.java */
export interface BlockColorCalculatorType extends Keyed, BlockColorCalculatorFactory {}

/** upstream: BlockColorCalculatorType.Impl */
class Impl implements BlockColorCalculatorType {
    constructor(
        private readonly key: Key,
        private readonly colorCalculatorFactory: BlockColorCalculatorFactory,
    ) {}

    getKey(): Key {
        return this.key;
    }

    create(resourcePack: ResourcePack): BlockColorCalculator {
        return this.colorCalculatorFactory.create(resourcePack);
    }

    withBiomeOverlay(biomeOverlayFunction: (biome: Biome) => Color): BlockColorCalculatorFactory {
        return this.colorCalculatorFactory.withBiomeOverlay(biomeOverlayFunction);
    }

    withBiomeColorModifier(
        biomeColorModifierFunction: (biome: Biome) => ColorModifier,
    ): BlockColorCalculatorFactory {
        return this.colorCalculatorFactory.withBiomeColorModifier(biomeColorModifierFunction);
    }

    blended(): BlockColorCalculatorFactory;
    blended(horizontalBlend: number, verticalBlend: number): BlockColorCalculatorFactory;
    blended(horizontalBlend?: number, verticalBlend?: number): BlockColorCalculatorFactory {
        if (horizontalBlend === undefined || verticalBlend === undefined)
            return this.colorCalculatorFactory.blended();
        return this.colorCalculatorFactory.blended(horizontalBlend, verticalBlend);
    }

    with(
        blockColorCalculatorFactory: (
            factory: BlockColorCalculatorFactory,
        ) => BlockColorCalculatorFactory,
    ): BlockColorCalculatorFactory {
        return this.colorCalculatorFactory.with(blockColorCalculatorFactory);
    }
}

const FOLIAGE: BlockColorCalculatorType = new Impl(
    Key.minecraft("foliage"),
    BlockColorCalculatorFactory.colorMap(
        Key.minecraft("colormap/foliage"),
        new Color().set(0xff48b518 | 0, true),
    )
        .withBiomeOverlay((biome) => biome.getOverlayFoliageColor())
        .blended(),
);

const DRY_FOLIAGE: BlockColorCalculatorType = new Impl(
    Key.minecraft("dry_foliage"),
    BlockColorCalculatorFactory.colorMap(
        Key.minecraft("colormap/dry_foliage"),
        new Color().set(0xff8f5f33 | 0, true),
    )
        .withBiomeOverlay((biome) => biome.getOverlayFoliageColor())
        .blended(),
);

const GRASS: BlockColorCalculatorType = new Impl(
    Key.minecraft("grass"),
    BlockColorCalculatorFactory.colorMap(
        Key.minecraft("colormap/grass"),
        new Color().set(0xff52952f | 0, true),
    )
        .withBiomeOverlay((biome) => biome.getOverlayGrassColor())
        .withBiomeColorModifier((biome) => biome.getGrassColorModifier())
        .blended(),
);

const WATER: BlockColorCalculatorType = new Impl(
    Key.minecraft("water"),
    BlockColorCalculatorFactory.biome((biome) => biome.getWaterColor()).blended(),
);

const REDSTONE: BlockColorCalculatorType = new Impl(
    Key.minecraft("redstone"),
    BlockColorCalculatorFactory.of(() => new RedstoneBlockColorCalculator()),
);

export const BlockColorCalculatorType = {
    FOLIAGE,
    DRY_FOLIAGE,
    GRASS,
    WATER,
    REDSTONE,

    REGISTRY: new Registry<BlockColorCalculatorType>(FOLIAGE, DRY_FOLIAGE, GRASS, WATER, REDSTONE),

    Impl,
};
