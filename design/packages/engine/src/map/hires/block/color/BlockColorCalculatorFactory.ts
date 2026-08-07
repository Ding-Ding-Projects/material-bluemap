import type { Color, Key } from "@worldlens/shared";
import type { ResourcePack } from "../../../../resources/pack/resourcepack/ResourcePack.js";
import type { Biome } from "../../../../world/biome/Biome.js";
import type { ColorModifier } from "../../../../world/biome/ColorModifier.js";
import { BiomeBlockColorCalculator } from "./BiomeBlockColorCalculator.js";
import { BiomeColorModifierBlockColorCalculator } from "./BiomeColorModifierBlockColorCalculator.js";
import { BiomeOverlayBlockColorCalculator } from "./BiomeOverlayBlockColorCalculator.js";
import { BlendedBlockColorCalculator } from "./BlendedBlockColorCalculator.js";
import type { BlockColorCalculator } from "./BlockColorCalculator.js";
import { ColorMapBlockColorCalculator } from "./ColorMapBlockColorCalculator.js";
import { FixedBlockColorCalculator } from "./FixedBlockColorCalculator.js";

/* upstream: Logger.global.noFloodDebug — the logger-package is not part of this port
 * (yet), so this log-call is backed by the console directly */
const noFloodKeys = new Set<string>();
function noFloodDebug(message: string): void {
    if (noFloodKeys.has(message)) return;
    noFloodKeys.add(message);
    console.debug(message);
}

/**
 * upstream: map/hires/block/color/BlockColorCalculatorFactory.java
 *
 * The upstream type is a functional interface, so java hands every lambda-implementation
 * the combinator interface-defaults for free. Here those defaults are declared on the
 * interface and implemented once by {@link Impl}, which every factory produced by this
 * module is built from ({@code BlockColorCalculatorFactory.of(...)} is the lambda-form).
 */
export interface BlockColorCalculatorFactory {
    create(resourcePack: ResourcePack): BlockColorCalculator;

    withBiomeOverlay(biomeOverlayFunction: (biome: Biome) => Color): BlockColorCalculatorFactory;

    withBiomeColorModifier(
        biomeColorModifierFunction: (biome: Biome) => ColorModifier,
    ): BlockColorCalculatorFactory;

    blended(): BlockColorCalculatorFactory;
    blended(horizontalBlend: number, verticalBlend: number): BlockColorCalculatorFactory;

    with(
        blockColorCalculatorFactory: (
            factory: BlockColorCalculatorFactory,
        ) => BlockColorCalculatorFactory,
    ): BlockColorCalculatorFactory;
}

/** upstream: the interface-defaults of BlockColorCalculatorFactory, over a create-function */
class Impl implements BlockColorCalculatorFactory {
    private readonly createFunction: (resourcePack: ResourcePack) => BlockColorCalculator;

    constructor(createFunction: (resourcePack: ResourcePack) => BlockColorCalculator) {
        this.createFunction = createFunction;
    }

    create(resourcePack: ResourcePack): BlockColorCalculator {
        return this.createFunction(resourcePack);
    }

    withBiomeOverlay(biomeOverlayFunction: (biome: Biome) => Color): BlockColorCalculatorFactory {
        return new Impl(
            (resourcePack) =>
                new BiomeOverlayBlockColorCalculator(
                    this.create(resourcePack),
                    biomeOverlayFunction,
                ),
        );
    }

    withBiomeColorModifier(
        biomeColorModifierFunction: (biome: Biome) => ColorModifier,
    ): BlockColorCalculatorFactory {
        return new Impl(
            (resourcePack) =>
                new BiomeColorModifierBlockColorCalculator(
                    this.create(resourcePack),
                    biomeColorModifierFunction,
                ),
        );
    }

    blended(): BlockColorCalculatorFactory;
    blended(horizontalBlend: number, verticalBlend: number): BlockColorCalculatorFactory;
    blended(horizontalBlend?: number, verticalBlend?: number): BlockColorCalculatorFactory {
        if (horizontalBlend === undefined || verticalBlend === undefined)
            return new Impl(
                (resourcePack) => new BlendedBlockColorCalculator(this.create(resourcePack)),
            );
        return new Impl(
            (resourcePack) =>
                new BlendedBlockColorCalculator(
                    this.create(resourcePack),
                    horizontalBlend,
                    verticalBlend,
                ),
        );
    }

    with(
        blockColorCalculatorFactory: (
            factory: BlockColorCalculatorFactory,
        ) => BlockColorCalculatorFactory,
    ): BlockColorCalculatorFactory {
        return blockColorCalculatorFactory(this);
    }
}

export const BlockColorCalculatorFactory = {
    /**
     * upstream: a lambda-implementation of the functional interface
     * ({@code resourcePack -> ...}) — kept as an explicit constructor here
     */
    of(create: (resourcePack: ResourcePack) => BlockColorCalculator): BlockColorCalculatorFactory {
        return new Impl(create);
    },

    fixed(color: Color): BlockColorCalculatorFactory {
        const calculator: BlockColorCalculator = new FixedBlockColorCalculator(color);
        return new Impl(() => calculator);
    },

    biome(biomeColorFunction: (biome: Biome) => Color): BlockColorCalculatorFactory {
        const calculator: BlockColorCalculator = new BiomeBlockColorCalculator(biomeColorFunction);
        return new Impl(() => calculator);
    },

    colorMap(colorMapKey: Key, defaultColor: Color): BlockColorCalculatorFactory {
        return new Impl((resourcePack) => {
            const colorMap = resourcePack.getColormaps().get(colorMapKey);
            if (colorMap == null) {
                noFloodDebug(
                    `No color map found for resource-key '${colorMapKey.getFormatted()}', using default color`,
                );
                return new FixedBlockColorCalculator(defaultColor);
            }
            return new ColorMapBlockColorCalculator(colorMap, defaultColor);
        });
    },

    Impl,
};
