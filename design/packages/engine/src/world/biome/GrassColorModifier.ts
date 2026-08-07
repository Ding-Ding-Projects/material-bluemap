import { Key, Registry, type Color, type Keyed } from "@worldlens/shared";
import type { BlockAccess } from "../block/BlockAccess.js";
import type { ColorModifier } from "./ColorModifier.js";

export interface GrassColorModifier extends Keyed, ColorModifier {}

/** upstream: GrassColorModifier.Impl */
class Impl implements GrassColorModifier {
    constructor(
        private readonly key: Key,
        private readonly modifier: ColorModifier,
    ) {}

    getKey(): Key {
        return this.key;
    }

    getModifier(): ColorModifier {
        return this.modifier;
    }

    apply(block: BlockAccess, color: Color): void {
        this.modifier.apply(block, color);
    }
}

const NONE: GrassColorModifier = new Impl(Key.minecraft("none"), {
    apply: (_block: BlockAccess, _color: Color) => {},
});
const DARK_FOREST: GrassColorModifier = new Impl(Key.minecraft("dark_forest"), {
    apply: (_block: BlockAccess, color: Color) =>
        color.set((((color.getInt() & 0xfefefe) + 0x28340a) >> 1) | 0xff000000, true),
});
const SWAMP: GrassColorModifier = new Impl(Key.minecraft("swamp"), {
    apply: (_block: BlockAccess, color: Color) => {
        color.set(0xff6a7039 | 0, true);

        /* Vanilla code with noise:
        double f = FOLIAGE_NOISE.sample(block.getX() * 0.0225, block.getZ() * 0.0225, false);

        if (f < -0.1) color.set(5011004)
        else color.set(6975545);
        */
    },
});

export const GrassColorModifier = {
    NONE,
    DARK_FOREST,
    SWAMP,

    REGISTRY: new Registry<GrassColorModifier>(NONE, DARK_FOREST, SWAMP),

    Impl,
};
