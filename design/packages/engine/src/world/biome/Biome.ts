import { Color, Key, type Keyed } from "@worldlens/shared";
import { GrassColorModifier } from "./GrassColorModifier.js";

export interface Biome extends Keyed {
    getDownfall(): number;

    getTemperature(): number;

    getWaterColor(): Color;

    getOverlayFoliageColor(): Color;

    getOverlayDryFoliageColor(): Color;

    getOverlayGrassColor(): Color;

    getGrassColorModifier(): GrassColorModifier;
}

/** upstream: Biome.Default */
class Default implements Biome {
    private readonly key = Key.bluemap("default");
    private readonly downfall = 0.5;
    private readonly temperature = 0.5;
    private readonly waterColor = new Color().set(4159204 | 0xff000000).premultiplied();
    private readonly overlayFoliageColor = new Color().premultiplied();
    private readonly overlayDryFoliageColor = new Color().premultiplied();
    private readonly overlayGrassColor = new Color().premultiplied();
    private readonly grassColorModifier = GrassColorModifier.NONE;

    getKey(): Key {
        return this.key;
    }

    getDownfall(): number {
        return this.downfall;
    }

    getTemperature(): number {
        return this.temperature;
    }

    getWaterColor(): Color {
        return this.waterColor;
    }

    getOverlayFoliageColor(): Color {
        return this.overlayFoliageColor;
    }

    getOverlayDryFoliageColor(): Color {
        return this.overlayDryFoliageColor;
    }

    getOverlayGrassColor(): Color {
        return this.overlayGrassColor;
    }

    getGrassColorModifier(): GrassColorModifier {
        return this.grassColorModifier;
    }
}

export const Biome = {
    DEFAULT: new Default() as Biome,

    Default,
};
