import type { Color } from "@worldlens/shared";
import type { PNG } from "pngjs";
import type { Biome } from "../../../../world/biome/Biome.js";

/** upstream: com.flowpowered.math.GenericMath#clamp(double, double, double) */
function clamp(value: number, low: number, high: number): number {
    if (value > high) return high;
    if (value < low) return low;
    return value;
}

/**
 * upstream: resources/pack/resourcepack/texture/ColorMap.java
 *
 * The image-backed constructor reads the 256x256 map into the flat int-array the same
 * way {@code BufferedImage#getRGB(0, 0, 256, 256, colorMap, 0, 256)} does: row-major
 * TYPE_INT_ARGB pixels. pngjs decodes to straight-alpha RGBA bytes, so the packing is
 * done here (see util/BufferedImageUtil for the same pngjs pixel-layout).
 */
export class ColorMap {
    private readonly colorMap: Int32Array;

    constructor(map: PNG);
    constructor(colorMap: Int32Array);
    constructor(mapOrColorMap: PNG | Int32Array) {
        if (mapOrColorMap instanceof Int32Array) {
            this.colorMap = mapOrColorMap;
            return;
        }

        const map = mapOrColorMap;
        const colorMap = new Int32Array(65536);
        for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
                const i = (map.width * y + x) << 2;
                colorMap[(y << 8) | x] =
                    (map.data[i + 3]! << 24) |
                    (map.data[i]! << 16) |
                    (map.data[i + 1]! << 8) |
                    map.data[i + 2]!;
            }
        }
        this.colorMap = colorMap;
    }

    getColor(biome: Biome, defaultColor: Color, target: Color): Color;
    getColor(temperature: number, downfall: number, defaultColor: Color, target: Color): Color;
    getColor(
        biomeOrTemperature: Biome | number,
        downfallOrDefaultColor: number | Color,
        defaultColorOrTarget: Color,
        maybeTarget?: Color,
    ): Color {
        let temperature: number;
        let downfall: number;
        let defaultColor: Color;
        let target: Color;

        if (typeof biomeOrTemperature === "number") {
            temperature = biomeOrTemperature;
            downfall = downfallOrDefaultColor as number;
            defaultColor = defaultColorOrTarget;
            target = maybeTarget as Color;
        } else {
            temperature = biomeOrTemperature.getTemperature();
            downfall = biomeOrTemperature.getDownfall();
            defaultColor = downfallOrDefaultColor as Color;
            target = defaultColorOrTarget;
        }

        temperature = clamp(temperature, 0.0, 1.0);
        downfall = clamp(downfall, 0.0, 1.0);

        downfall *= temperature;

        const x = Math.trunc((1.0 - temperature) * 255.0);
        const y = Math.trunc((1.0 - downfall) * 255.0);

        const index = (y << 8) | x;

        if (index >= this.colorMap.length) return target.set(defaultColor);

        const color = this.colorMap[index]! | 0xff000000;
        return target.set(color, true);
    }
}
